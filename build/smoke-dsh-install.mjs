#!/usr/bin/env node

import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { createServer } from "node:net";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, delimiter, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const DSH_VERSION = "0.1.0-rc.6";
const DEFAULT_COMMAND_TIMEOUT_MS = 120_000;
const DEFAULT_INSTALL_TIMEOUT_MS = 420_000;
const DEFAULT_START_TIMEOUT_MS = 90_000;
const DEFAULT_TEARDOWN_TIMEOUT_MS = 10_000;
const DEFAULT_RPC_BODY_LIMIT_BYTES = 1_048_576 + 16_384;

const args = parseArgs(process.argv.slice(2));
const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const keepTemp = flag("keep-temp");
const commandTimeoutMs = numberOption("command-timeout-ms", DEFAULT_COMMAND_TIMEOUT_MS);
const installTimeoutMs = numberOption("install-timeout-ms", DEFAULT_INSTALL_TIMEOUT_MS);
const startTimeoutMs = numberOption("start-timeout-ms", DEFAULT_START_TIMEOUT_MS);

const liveProcesses = new Set();
let workRoot;

try {
  workRoot = await mkdtemp(join(tmpdir(), "dsh-diagram-smoke-"));
  const paths = await prepareIsolatedPaths(workRoot);
  const env = isolatedEnv(paths);

  const tarball = await resolveTarball(paths, env);
  const packageEvidence = await verifyTarball(tarball);
  const dsh = await resolveDsh(paths, env);

  await runDsh(dsh, ["plugin", "--profile", "web", "add", tarball], {
    cwd: paths.project,
    env,
    timeoutMs: commandTimeoutMs,
    label: "install diagram plugin",
  });

  const dumped = await runDsh(dsh, ["--profile", "web", "--dump-config"], {
    cwd: paths.project,
    env,
    timeoutMs: commandTimeoutMs,
    label: "dump installed web config",
  });
  assertIncludes(dumped.stdout, "dsh-diagram", "dumped config does not include dsh-diagram");

  const installed = await withWebServer(dsh, env, paths.project, async (baseUrl) => {
    const root = await fetchText(`${baseUrl}/`);
    assertIncludes(root.body, "window.__DSH_BOOT__", "installed root is not the DSH boot document");
    assertIncludes(root.body, "dsh-diagram", "installed root boot entries do not include dsh-diagram");

    const client = await fetchText(`${baseUrl}/plugins/dsh-diagram/client.js`);
    assertStatus(client, 200, "installed client bundle");
    assertIncludes(client.body, "window.__ModuleLoader__.load", "client bundle does not use the DSH module loader");
    assertIncludes(client.body, "dsh-diagram", "client bundle does not register id dsh-diagram");

    const editor = await fetchText(`${baseUrl}/diagram-assets/index.html`);
    assertStatus(editor, 200, "installed editor asset");
    assertHeaderIncludes(
      editor.headers,
      "content-security-policy",
      "frame-ancestors 'self'",
      "installed editor asset missing diagram CSP",
    );
    if (!/<title>\s*DSH Diagram\b/i.test(editor.body)
      && !/\/diagram-assets\/assets\/editor[-.]/.test(editor.body)) {
      throw new Error("installed editor asset does not look like the dsh-diagram editor");
    }

    const invalidRpc = await fetchText(`${baseUrl}/diagram/list`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: baseUrl,
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify({ rpcId: "smoke-invalid", method: "list", payload: {} }),
    });
    assertStatus(invalidRpc, 200, "installed diagram RPC");
    const invalidRpcBody = JSON.parse(invalidRpc.body);
    if (invalidRpcBody?.type !== "server-response"
      || invalidRpcBody?.rpcId !== "smoke-invalid"
      || invalidRpcBody?.result?.error?.code !== "bad-request") {
      throw new Error("installed diagram RPC did not return the standard bad-request envelope");
    }

    const oversizedRpc = await fetchText(`${baseUrl}/diagram/list`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: Buffer.alloc(DEFAULT_RPC_BODY_LIMIT_BYTES + 1),
    });
    assertStatus(oversizedRpc, 413, "installed oversized diagram RPC");

    return {
      rootBytes: root.body.length,
      clientBytes: client.body.length,
      editorBytes: editor.body.length,
      rpcBodyLimitBytes: DEFAULT_RPC_BODY_LIMIT_BYTES,
      port: new URL(baseUrl).port,
    };
  });

  await runDsh(dsh, ["plugin", "--profile", "web", "remove", "dsh-diagram"], {
    cwd: paths.project,
    env,
    timeoutMs: commandTimeoutMs,
    label: "remove diagram plugin",
  });

  const removedDump = await runDsh(dsh, ["--profile", "web", "--dump-config"], {
    cwd: paths.project,
    env,
    timeoutMs: commandTimeoutMs,
    label: "dump removed web config",
  });
  assertNotIncludes(removedDump.stdout, "dsh-diagram", "removed config still includes dsh-diagram");

  const removed = await withWebServer(dsh, env, paths.project, async (baseUrl) => {
    const root = await fetchText(`${baseUrl}/`);
    assertIncludes(root.body, "window.__DSH_BOOT__", "removed root is not the DSH boot document");
    assertNotIncludes(root.body, "dsh-diagram", "removed root boot entries still include dsh-diagram");

    const fallback = await fetchText(`${baseUrl}/diagram-assets/index.html`);
    assertNotIncludes(
      fallback.header("content-security-policy") ?? "",
      "frame-ancestors 'self'",
      "removed /diagram-assets fallback still has diagram CSP",
    );
    assertIncludes(fallback.body, "window.__DSH_BOOT__", "removed /diagram-assets fallback is not the DSH SPA");
    assertNotIncludes(fallback.body, "dsh-diagram", "removed /diagram-assets fallback still includes dsh-diagram");

    return {
      rootBytes: root.body.length,
      fallbackBytes: fallback.body.length,
      port: new URL(baseUrl).port,
    };
  });

  console.log(JSON.stringify({
    ok: true,
    dsh: dsh.description,
    tarball: tarball,
    package: packageEvidence,
    installed,
    removed,
    temp: keepTemp ? workRoot : undefined,
  }, null, 2));
} finally {
  await Promise.allSettled([...liveProcesses].map((child) => terminate(child)));
  if (workRoot !== undefined && !keepTemp) {
    await rm(workRoot, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const parsed = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith("--")) throw new Error(`unexpected argument: ${current}`);
    const eq = current.indexOf("=");
    if (eq !== -1) {
      parsed.set(current.slice(2, eq), current.slice(eq + 1));
      continue;
    }
    const key = current.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      parsed.set(key, next);
      i += 1;
    } else {
      parsed.set(key, "true");
    }
  }
  return parsed;
}

function option(name, envName) {
  return args.get(name) ?? (envName === undefined ? undefined : process.env[envName]);
}

function flag(name) {
  return args.get(name) === "true";
}

function numberOption(name, fallback) {
  const raw = option(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return value;
}

async function prepareIsolatedPaths(root) {
  const paths = {
    root,
    home: join(root, "home"),
    dshHome: join(root, "dsh-home"),
    project: join(root, "project"),
    npmCache: join(root, "npm-cache"),
    pnpmHome: join(root, "pnpm-home"),
    xdgCache: join(root, "xdg-cache"),
    xdgConfig: join(root, "xdg-config"),
    xdgData: join(root, "xdg-data"),
    xdgState: join(root, "xdg-state"),
    pack: join(root, "pack"),
  };
  await Promise.all(Object.values(paths).map((path) => mkdir(path, { recursive: true })));
  await writeFile(join(paths.project, "package.json"), "{\"private\":true,\"type\":\"module\"}\n");
  return paths;
}

function isolatedEnv(paths) {
  const env = {
    ...process.env,
    CI: process.env.CI ?? "1",
    HOME: paths.home,
    USERPROFILE: paths.home,
    DSH_HOME: paths.dshHome,
    XDG_CACHE_HOME: paths.xdgCache,
    XDG_CONFIG_HOME: paths.xdgConfig,
    XDG_DATA_HOME: paths.xdgData,
    XDG_STATE_HOME: paths.xdgState,
    npm_config_cache: paths.npmCache,
    npm_config_update_notifier: "false",
    npm_config_fund: "false",
    npm_config_audit: "false",
    npm_config_progress: "false",
    PNPM_HOME: paths.pnpmHome,
    COREPACK_HOME: join(paths.root, "corepack"),
    DSH_TELEMETRY_MODE: "DISABLED",
    NO_COLOR: "1",
  };
  env.PATH = `${paths.pnpmHome}${delimiter}${env.PATH ?? ""}`;
  return env;
}

async function resolveTarball(paths, env) {
  const supplied = option("tarball", "DSH_DIAGRAM_TARBALL");
  if (supplied !== undefined) return resolvePath(supplied);

  await runCommand("pnpm", ["run", "bundle"], {
    cwd: repoRoot,
    env,
    timeoutMs: installTimeoutMs,
    label: "build dsh-diagram release bundle",
    maxOutputChars: 1_000_000,
  });
  const result = await runCommand("npm", [
    "pack",
    "--ignore-scripts",
    "--json",
    "--pack-destination",
    paths.pack,
  ], {
    cwd: repoRoot,
    env,
    timeoutMs: installTimeoutMs,
    label: "pack dsh-diagram",
    maxOutputChars: 1_000_000,
  });
  const packed = parseNpmJsonArray(result.stdout);
  const filename = packed?.[0]?.filename;
  if (typeof filename !== "string") throw new Error("npm pack did not report a tarball filename");
  return resolve(paths.pack, filename);
}

async function resolveDsh(paths, env) {
  const supplied = option("dsh-bin", "DSH_BIN");
  if (supplied !== undefined) {
    return { command: resolvePath(supplied), argsPrefix: [], description: resolvePath(supplied) };
  }

  const pnpm = await commandExists("pnpm");
  if (pnpm) {
    await runCommand("pnpm", ["add", "--ignore-scripts", `@deepseek-ai/dsh@${DSH_VERSION}`], {
      cwd: paths.project,
      env,
      timeoutMs: installTimeoutMs,
      label: `install public @deepseek-ai/dsh@${DSH_VERSION} with pnpm`,
    });
    return {
      command: join(paths.project, "node_modules", ".bin", process.platform === "win32" ? "dsh.cmd" : "dsh"),
      argsPrefix: [],
      description: `temp pnpm install @deepseek-ai/dsh@${DSH_VERSION}`,
    };
  }

  await runCommand("npm", ["install", "--ignore-scripts", `@deepseek-ai/dsh@${DSH_VERSION}`], {
    cwd: paths.project,
    env,
    timeoutMs: installTimeoutMs,
    label: `install public @deepseek-ai/dsh@${DSH_VERSION} with npm`,
  });
  return {
    command: join(paths.project, "node_modules", ".bin", process.platform === "win32" ? "dsh.cmd" : "dsh"),
    argsPrefix: [],
    description: `temp npm install @deepseek-ai/dsh@${DSH_VERSION}`,
  };
}

async function commandExists(command) {
  const pathEntries = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  const suffixes = process.platform === "win32"
    ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";")
    : [""];
  for (const pathEntry of pathEntries) {
    for (const suffix of suffixes) {
      const candidate = join(pathEntry, `${command}${suffix}`);
      try {
        await access(candidate, fsConstants.X_OK);
        return true;
      } catch {
        // Try the next PATH entry.
      }
    }
  }
  return false;
}

function runDsh(dsh, args, options) {
  return runCommand(dsh.command, [...dsh.argsPrefix, ...args], options);
}

async function withWebServer(dsh, env, cwd, callback) {
  const port = await choosePort();
  const child = spawnProcess(dsh.command, [
    ...dsh.argsPrefix,
    "web",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
  ], {
    cwd,
    env,
    label: `dsh web on ${port}`,
  });
  liveProcesses.add(child);
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForHttp(`${baseUrl}/`, startTimeoutMs);
    return await callback(baseUrl);
  } finally {
    liveProcesses.delete(child);
    await terminate(child);
  }
}

async function choosePort() {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer();
    server.on("error", rejectPromise);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => {
        if (error !== undefined) rejectPromise(error);
        else if (address === null || typeof address === "string") rejectPromise(new Error("could not allocate a TCP port"));
        else resolvePromise(address.port);
      });
    });
  });
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      await response.text();
      return;
    } catch (error) {
      lastError = error;
      await delay(500);
    }
  }
  throw new Error(`timed out waiting for ${url}: ${lastError?.message ?? lastError}`);
}

async function fetchText(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.text();
  return {
    status: response.status,
    body,
    headers: response.headers,
    header: (name) => response.headers.get(name),
  };
}

async function runCommand(command, commandArgs, options) {
  const child = spawnProcess(command, commandArgs, options);
  liveProcesses.add(child);
  try {
    return await waitForExit(child, options);
  } finally {
    liveProcesses.delete(child);
  }
}

function spawnProcess(command, commandArgs, options) {
  const child = spawn(command, commandArgs, {
    cwd: options.cwd,
    env: options.env,
    shell: options.shell ?? false,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdoutText = "";
  child.stderrText = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    child.stdoutText = trimOutput(child.stdoutText + chunk, options.maxOutputChars);
  });
  child.stderr.on("data", (chunk) => {
    child.stderrText = trimOutput(child.stderrText + chunk, options.maxOutputChars);
  });
  child.label = options.label;
  return child;
}

async function waitForExit(child, options) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  let timeout;
  const exit = new Promise((resolvePromise) => {
    child.once("exit", (code, signal) => resolvePromise({ code, signal }));
  });
  const timed = new Promise((_, rejectPromise) => {
    timeout = setTimeout(async () => {
      await terminate(child);
      rejectPromise(new Error(formatCommandFailure(
        child,
        `timed out after ${timeoutMs}ms`,
        undefined,
        undefined,
      )));
    }, timeoutMs);
  });
  const result = await Promise.race([exit, timed]);
  clearTimeout(timeout);
  if ((options.reject ?? true) && result.code !== 0) {
    throw new Error(formatCommandFailure(child, "failed", result.code, result.signal));
  }
  return {
    code: result.code,
    signal: result.signal,
    stdout: child.stdoutText,
    stderr: child.stderrText,
  };
}

async function terminate(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const pid = child.pid;
  if (pid === undefined) return;
  if (process.platform === "win32") child.kill("SIGTERM");
  else {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
  const settled = await Promise.race([
    new Promise((resolvePromise) => child.once("exit", resolvePromise)),
    delay(DEFAULT_TEARDOWN_TIMEOUT_MS).then(() => "timeout"),
  ]);
  if (settled === "timeout" && child.exitCode === null && child.signalCode === null) {
    if (process.platform === "win32") child.kill("SIGKILL");
    else {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }
  }
}

function formatCommandFailure(child, reason, code, signal) {
  return [
    `${child.label} ${reason}`,
    code === undefined ? undefined : `exit code: ${code}`,
    signal === undefined ? undefined : `signal: ${signal}`,
    child.stdoutText.trim() === "" ? undefined : `stdout:\n${child.stdoutText}`,
    child.stderrText.trim() === "" ? undefined : `stderr:\n${child.stderrText}`,
  ].filter(Boolean).join("\n");
}

function trimOutput(text, maxOutputChars = 20_000) {
  return text.length > maxOutputChars ? text.slice(-maxOutputChars) : text;
}

function parseNpmJsonArray(stdout) {
  const starts = [];
  for (let index = stdout.indexOf("["); index !== -1; index = stdout.indexOf("[", index + 1)) {
    starts.push(index);
  }
  for (let i = starts.length - 1; i >= 0; i -= 1) {
    const candidate = stdout.slice(starts[i]).trim();
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Keep looking; lifecycle scripts may print non-JSON before npm's final array.
    }
  }
  throw new Error("could not parse npm pack --json output");
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function verifyTarball(tarball) {
  const buffer = await readFile(tarball);
  const entries = readTarEntries(gunzipSync(buffer));
  const maps = entries.filter((entry) => entry.name.endsWith(".map"));
  if (maps.length > 0) {
    throw new Error(`tarball contains source maps: ${maps.map((entry) => entry.name).join(", ")}`);
  }

  const scanned = [];
  const required = new Set([
    "THIRD_PARTY_NOTICES.md",
    "lib/client.js",
    "lib/index.js",
    "package.json",
    "third_party_licenses/fonts/Xiaolai/OFL.txt",
    "third_party_licenses/npm/excalidraw__excalidraw/0.18.1/LICENSE",
  ]);
  const forbiddenEntries = [];
  let packagedManifest;
  for (const entry of entries) {
    const normalized = normalizePackageEntry(entry.name);
    if (entry.type !== "file") continue;
    if (normalized.startsWith("src/")
      || normalized.startsWith("build/")
      || normalized.startsWith("node_modules/")) {
      forbiddenEntries.push(normalized);
    }
    if (!isTextEntry(normalized, entry.body) && !required.has(normalized)) continue;
    const text = entry.body.toString("utf8");
    const leak = findAbsolutePathLeak(text);
    if (leak !== undefined) {
      throw new Error(`tarball entry ${entry.name} contains source-machine absolute path: ${leak}`);
    }
    if (normalized === "package.json") packagedManifest = JSON.parse(text);
    scanned.push(normalized);
    required.delete(normalized);
  }
  if (forbiddenEntries.length > 0) {
    throw new Error(`tarball contains development-only entries: ${forbiddenEntries.join(", ")}`);
  }
  if (required.size > 0) {
    throw new Error(`tarball missing required scan entries: ${[...required].join(", ")}`);
  }
  verifyPackagedManifest(packagedManifest);
  const licenseEntries = entries.filter((entry) =>
    entry.type === "file" && normalizePackageEntry(entry.name).startsWith("third_party_licenses/")
  );
  if (licenseEntries.length < 18) {
    throw new Error(`tarball contains only ${licenseEntries.length} third-party license files`);
  }
  return {
    file: basename(tarball),
    entries: entries.length,
    licenseEntries: licenseEntries.length,
    scannedTextEntries: scanned.length,
  };
}

function verifyPackagedManifest(manifest) {
  if (manifest === undefined || manifest === null || typeof manifest !== "object") {
    throw new Error("tarball package.json is not an object");
  }
  const scripts = manifest.scripts;
  if (scripts !== undefined && (scripts === null || typeof scripts !== "object")) {
    throw new Error("tarball package.json scripts is not an object");
  }
  for (const name of [
    "build",
    "preinstall",
    "install",
    "postinstall",
    "prepare",
    "prepack",
  ]) {
    if (scripts !== undefined && Object.hasOwn(scripts, name)) {
      throw new Error(`tarball declares install-time lifecycle script ${name}`);
    }
  }
  const serialized = JSON.stringify(manifest);
  if (/"(?:link|file|workspace):/u.test(serialized)) {
    throw new Error("tarball package.json contains a local dependency specifier");
  }
}

function readTarEntries(buffer) {
  const entries = [];
  let offset = 0;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = readString(header, 0, 100);
    const prefix = readString(header, 345, 155);
    const sizeText = readString(header, 124, 12).trim();
    const size = Number.parseInt(sizeText.replace(/\0.*$/u, "").trim() || "0", 8);
    const typeflag = readString(header, 156, 1);
    if (!Number.isFinite(size) || size < 0) throw new Error(`invalid tar size for ${name}`);
    const fullName = prefix === "" ? name : `${prefix}/${name}`;
    const bodyStart = offset + 512;
    const bodyEnd = bodyStart + size;
    const type = typeflag === "" || typeflag === "0" ? "file" : typeflag === "5" ? "directory" : "other";
    entries.push({
      name: fullName,
      type,
      body: buffer.subarray(bodyStart, bodyEnd),
    });
    offset = bodyStart + Math.ceil(size / 512) * 512;
  }
  return entries;
}

function readString(buffer, start, length) {
  const slice = buffer.subarray(start, start + length);
  const zero = slice.indexOf(0);
  return slice.subarray(0, zero === -1 ? slice.length : zero).toString("utf8");
}

function normalizePackageEntry(name) {
  return name.startsWith("package/") ? name.slice("package/".length) : name;
}

function isTextEntry(name, body) {
  if (body.includes(0)) return false;
  if (/\.(?:cjs|css|d\.ts|html|js|json|jsx|mjs|md|svg|ts|tsx|txt|ya?ml)$/u.test(name)) {
    return true;
  }
  const sample = body.subarray(0, Math.min(body.length, 1024));
  if (sample.length === 0) return true;
  let suspicious = 0;
  for (const byte of sample) {
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) suspicious += 1;
  }
  return suspicious === 0;
}

function findAbsolutePathLeak(text) {
  const unix = text.match(/\/Users\/|\/home\//u);
  if (unix !== null) return unix[0];
  const windows = text.match(/(?:^|[\s"'`(=])([A-Za-z]:[\\/][^\s"'`)]+)/u);
  return windows?.[1];
}

function assertStatus(response, expected, label) {
  if (response.status !== expected) {
    throw new Error(`${label} returned HTTP ${response.status}, expected ${expected}`);
  }
}

function assertHeaderIncludes(headers, name, expected, message) {
  const actual = headers.get(name) ?? "";
  assertIncludes(actual, expected, message);
}

function assertIncludes(actual, expected, message) {
  if (!actual.includes(expected)) throw new Error(message);
}

function assertNotIncludes(actual, expected, message) {
  if (actual.includes(expected)) throw new Error(message);
}

function resolvePath(path) {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}
