import { mkdir, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const noticesPath = join(root, "THIRD_PARTY_NOTICES.md");
const licensesRoot = join(root, "third_party_licenses");
const npmCorpusRoot = join(licensesRoot, "npm");
const externalLicenseRoot = join(licensesRoot, "external");
const fontRoot = join(root, "lib/editor/fonts");
const lockPath = join(root, "pnpm-lock.yaml");

const runtimeRoots = [
  "@excalidraw/excalidraw",
  "react",
  "react-dom",
  "@dagrejs/dagre",
  "zod",
];

const packageExceptions = [
  {
    match: (pkg) => pkg.name === "@excalidraw/excalidraw" && pkg.version === "0.18.1",
    license: "MIT",
    licenseFiles: ["external/excalidraw/LICENSE"],
    note: "The npm package declares MIT but does not ship a license file; this uses the matching upstream repository LICENSE.",
  },
  {
    match: (pkg) => pkg.name.startsWith("@radix-ui/"),
    license: "MIT",
    licenseFiles: ["external/radix-ui-primitives/LICENSE"],
    note: "Radix package tarballs declare MIT but do not ship per-package license files; this uses the upstream monorepo LICENSE.",
  },
  {
    match: (pkg) => pkg.name === "react-remove-scroll-bar" && pkg.version === "2.3.8",
    license: "MIT",
    licenseFiles: ["external/react-remove-scroll-bar/LICENSE"],
    note: "The npm package declares MIT but does not ship a license file; this uses the upstream repository LICENSE.",
  },
  {
    match: (pkg) => pkg.name === "fuzzy" && pkg.version === "0.1.3",
    license: "MIT",
    note: "The package uses the legacy npm licenses field; the published package contains this MIT license file.",
  },
  {
    match: (pkg) => pkg.name === "khroma" && pkg.version === "2.1.0",
    license: "MIT",
    note: "The npm manifest has no license field; the published package contains this MIT license file.",
  },
];

const fontEntries = [
  {
    family: "Assistant",
    license: "OFL-1.1",
    licenseFile: "fonts/Assistant/OFL.txt",
    source: "https://github.com/google/fonts/tree/main/ofl/assistant",
  },
  {
    family: "Cascadia",
    license: "OFL-1.1",
    licenseFile: "fonts/Cascadia/OFL.txt",
    source: "https://github.com/microsoft/cascadia-code",
  },
  {
    family: "ComicShanns",
    license: "MIT",
    licenseFile: "fonts/ComicShanns/LICENSE",
    noticeFile: "fonts/ComicShanns/NOTICE.txt",
    source: "https://github.com/excalidraw/excalidraw/tree/master/packages/excalidraw/fonts/ComicShanns",
  },
  {
    family: "Excalifont",
    license: "OFL-1.1",
    licenseFile: "fonts/Excalifont/OFL.txt",
    noticeFile: "fonts/Excalifont/NOTICE.txt",
    source: "https://github.com/excalidraw/excalidraw/tree/master/packages/excalidraw/fonts/Excalifont",
  },
  {
    family: "Liberation",
    license: "OFL-1.1",
    licenseFile: "fonts/Liberation/OFL.txt",
    source: "https://github.com/liberationfonts/liberation-fonts",
  },
  {
    family: "Lilita",
    license: "OFL-1.1",
    licenseFile: "fonts/Lilita/OFL.txt",
    source: "https://github.com/google/fonts/tree/main/ofl/lilitaone",
  },
  {
    family: "Nunito",
    license: "OFL-1.1",
    licenseFile: "fonts/Nunito/OFL.txt",
    source: "https://github.com/google/fonts/tree/main/ofl/nunito",
  },
  {
    family: "Virgil",
    license: "OFL-1.1",
    licenseFile: "fonts/Virgil/OFL.txt",
    source: "https://github.com/excalidraw/virgil",
  },
  {
    family: "Xiaolai",
    license: "OFL-1.1",
    licenseFile: "fonts/Xiaolai/OFL.txt",
    noticeFile: "fonts/Xiaolai/NOTICE.txt",
    source: "https://github.com/excalidraw/excalidraw/tree/master/packages/excalidraw/fonts/Xiaolai",
  },
];

function fail(message) {
  throw new Error(`third-party notice generation failed: ${message}`);
}

function normalizeLicenseText(text) {
  const normalized = text
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+$/gu, ""))
    .join("\n")
    .trimEnd();
  return `${normalized}\n`;
}

function packageKey(pkg) {
  return `${pkg.name}@${pkg.version}`;
}

function corpusPackagePath(pkg, fileName) {
  return join(npmCorpusRoot, encodePackagePath(pkg.name), pkg.version, fileName);
}

function encodePackagePath(name) {
  return name.replace(/^@/, "").replace("/", "__");
}

function normalizeRepository(repository) {
  if (typeof repository === "string") return repository;
  if (repository !== null && typeof repository === "object" && typeof repository.url === "string") {
    return repository.url.replace(/^git\+/, "");
  }
  return "";
}

function licenseMarker(license) {
  const normalized = license.toLowerCase();
  if (normalized.includes("mit")) return "permission is hereby granted";
  if (normalized.includes("apache")) return "apache license";
  if (normalized.includes("isc")) return "permission to use, copy, modify";
  if (normalized.includes("bsd")) return "redistribution and use";
  if (normalized.includes("cc0")) return "creative commons";
  if (normalized.includes("unlicense")) return "unlicense";
  if (normalized.includes("0bsd")) return "permission to use, copy, modify";
  if (normalized.includes("mpl")) return "mozilla public license";
  if (normalized.includes("zlib")) return "zlib";
  return undefined;
}

async function exists(path) {
  return readFile(path).then(
    () => true,
    (error) => {
      if (error?.code === "ENOENT") return false;
      throw error;
    },
  );
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function findPackageJson(name, fromDir = root) {
  const parts = name.split("/");
  let current = resolve(fromDir);
  while (true) {
    const candidate = join(current, "node_modules", ...parts, "package.json");
    if (await exists(candidate)) return realpath(candidate);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  fail(`missing package metadata for ${name} from ${fromDir}`);
}

async function readPackage(packageJsonPath) {
  const parsed = await readJson(packageJsonPath);
  if (typeof parsed.name !== "string" || parsed.name === "") fail(`package metadata missing name at ${packageJsonPath}`);
  if (typeof parsed.version !== "string" || parsed.version === "") fail(`package metadata missing version for ${parsed.name}`);
  return {
    dir: dirname(packageJsonPath),
    name: parsed.name,
    version: parsed.version,
    license: typeof parsed.license === "string" ? parsed.license : undefined,
    repository: normalizeRepository(parsed.repository),
    homepage: typeof parsed.homepage === "string" ? parsed.homepage : "",
    dependencies: Object.keys(parsed.dependencies ?? {}).sort(),
    optionalDependencies: Object.keys(parsed.optionalDependencies ?? {}).sort(),
  };
}

async function collectRuntimePackages() {
  const queue = [];
  for (const rootName of runtimeRoots) queue.push(await findPackageJson(rootName));

  const byPackageDir = new Map();
  while (queue.length > 0) {
    const packageJsonPath = await realpath(queue.shift());
    if (byPackageDir.has(packageJsonPath)) continue;
    const pkg = await readPackage(packageJsonPath);
    byPackageDir.set(packageJsonPath, pkg);
    for (const dependency of [...pkg.dependencies, ...pkg.optionalDependencies]) {
      queue.push(await findPackageJson(dependency, pkg.dir));
    }
  }

  const byNameVersion = new Map();
  for (const pkg of byPackageDir.values()) {
    const key = packageKey(pkg);
    if (!byNameVersion.has(key)) byNameVersion.set(key, pkg);
  }
  return [...byNameVersion.values()].sort((a, b) => packageKey(a).localeCompare(packageKey(b)));
}

async function collectPackageLicenseFiles(pkg) {
  const allFiles = await readdir(pkg.dir);
  const localFiles = allFiles
    .filter((file) => /^(licen[sc]e|copying|notice)([._-].*)?$/i.test(file))
    .sort();
  const exception = packageExceptions.find((candidate) => candidate.match(pkg));
  const license = exception?.license ?? pkg.license;

  if (typeof license !== "string" || license === "") fail(`${packageKey(pkg)} has no known license`);

  const sourceFiles = localFiles.map((file) => ({ sourcePath: join(pkg.dir, file), fileName: file }));
  for (const relPath of exception?.licenseFiles ?? []) {
    sourceFiles.push({ sourcePath: join(licensesRoot, relPath), fileName: basename(relPath) });
  }
  if (sourceFiles.length === 0) fail(`${packageKey(pkg)} has no license/copying/notice file and no approved exception`);

  return { license, sourceFiles, note: exception?.note ?? "" };
}

async function rebuildNpmCorpus(packages) {
  await rm(npmCorpusRoot, { recursive: true, force: true });
  await mkdir(npmCorpusRoot, { recursive: true });
  const rows = [];
  for (const pkg of packages) {
    const licenseInfo = await collectPackageLicenseFiles(pkg);
    const copiedFiles = [];
    for (const source of licenseInfo.sourceFiles) {
      const text = await readFile(source.sourcePath, "utf8").catch((error) => {
        if (error?.code === "ENOENT") fail(`${packageKey(pkg)} exception file is missing: ${relative(root, source.sourcePath)}`);
        throw error;
      });
      if (text.trim() === "") fail(`${packageKey(pkg)} has empty license text in ${source.fileName}`);
      if (text.includes(root)) fail(`${packageKey(pkg)} license text contains the checkout path`);
      const normalizedText = normalizeLicenseText(text);
      const target = corpusPackagePath(pkg, source.fileName);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, normalizedText);
      copiedFiles.push(relative(licensesRoot, target));
    }
    rows.push({ ...pkg, license: licenseInfo.license, licenseFiles: copiedFiles, note: licenseInfo.note });
  }
  return rows;
}

async function readRequired(relPath, marker) {
  const fullPath = join(licensesRoot, relPath);
  const text = await readFile(fullPath, "utf8").catch((error) => {
    if (error?.code === "ENOENT") fail(`missing ${relPath}`);
    throw error;
  });
  if (text.trim() === "") fail(`${relPath} is empty`);
  if (text.includes(root)) fail(`${relPath} contains the checkout path`);
  const normalizedText = normalizeLicenseText(text);
  if (normalizedText !== text) await writeFile(fullPath, normalizedText);
  if (marker !== undefined && !text.toLowerCase().includes(marker.toLowerCase())) {
    fail(`${relPath} does not contain ${marker}`);
  }
  return normalizedText;
}

async function readFontFiles(family) {
  const files = await readdir(join(fontRoot, family)).catch((error) => {
    if (error?.code === "ENOENT") fail(`missing built font family ${family}`);
    throw error;
  });
  const sortedFiles = files.filter((file) => file.endsWith(".woff2")).sort();
  if (sortedFiles.length !== files.length) fail(`font family ${family} contains non-woff2 files`);
  if (sortedFiles.length === 0) fail(`font family ${family} contains no font files`);
  return sortedFiles;
}

async function readBuiltFontFamilies() {
  const actual = (await readdir(fontRoot, { withFileTypes: true }).catch((error) => {
    if (error?.code === "ENOENT") fail("missing lib/editor/fonts; run the editor build first");
    throw error;
  }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const expected = fontEntries.map((entry) => entry.family).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`built font families changed: expected ${expected.join(", ")}, got ${actual.join(", ")}`);
  }
}

async function verifyLockCoverage(rows) {
  const lockText = await readFile(lockPath, "utf8").catch((error) => {
    if (error?.code === "ENOENT") fail("missing pnpm-lock.yaml");
    throw error;
  });
  for (const row of rows) {
    const encoded = row.name.replace("/", "+");
    if (!lockText.includes(`${encoded}@${row.version}`) && !lockText.includes(`${row.name}@${row.version}`)) {
      fail(`${packageKey(row)} is not visible in pnpm-lock.yaml`);
    }
  }
}

function fence(text) {
  return text.replaceAll("```", "`\u200b``").trimEnd();
}

function renderRuntimeTable(rows) {
  const lines = [
    "| Package | Version | License | Source | License files | Note |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const row of rows) {
    const source = row.repository || row.homepage;
    lines.push(`| ${row.name} | ${row.version} | ${row.license} | ${source} | ${row.licenseFiles.map((file) => `\`${file}\``).join("<br>")} | ${row.note} |`);
  }
  return lines.join("\n");
}

async function renderFontTable() {
  await readBuiltFontFamilies();
  const lines = [
    "| Font family | Files | License | Source |",
    "| --- | ---: | --- | --- |",
  ];
  for (const entry of fontEntries) {
    const files = await readFontFiles(entry.family);
    await readRequired(entry.licenseFile, entry.license === "MIT" ? "permission is hereby granted" : "Open Font License");
    if (entry.noticeFile !== undefined) await readRequired(entry.noticeFile);
    lines.push(`| ${entry.family} | ${files.length} | ${entry.license} | ${entry.source} |`);
  }
  return lines.join("\n");
}

async function renderLicenseSections(rows) {
  const sections = [];
  for (const row of rows) {
    const parts = [`### ${row.name}@${row.version}`];
    for (const licenseFile of row.licenseFiles) {
      const licenseText = await readRequired(licenseFile);
      parts.push(`File: \`${licenseFile}\``, `\`\`\`text\n${fence(licenseText)}\n\`\`\``);
    }
    sections.push(parts.join("\n\n"));
  }
  for (const entry of fontEntries) {
    const licenseText = await readRequired(entry.licenseFile, entry.license === "MIT" ? "permission is hereby granted" : "Open Font License");
    const parts = [
      `### ${entry.family} font`,
      `Source: ${entry.source}`,
      `License file: \`${entry.licenseFile}\``,
    ];
    if (entry.noticeFile !== undefined) {
      const noticeText = await readRequired(entry.noticeFile);
      parts.push(`Notice file: \`${entry.noticeFile}\``, `\`\`\`text\n${fence(noticeText)}\n\`\`\``);
    }
    parts.push(`\`\`\`text\n${fence(licenseText)}\n\`\`\``);
    sections.push(parts.join("\n\n"));
  }
  return sections.join("\n\n");
}

const runtimePackages = await collectRuntimePackages();
const runtimeRows = await rebuildNpmCorpus(runtimePackages);
await verifyLockCoverage(runtimeRows);
const runtimeTable = renderRuntimeTable(runtimeRows);
const fontTable = await renderFontTable();
const licenseSections = await renderLicenseSections(runtimeRows);

const unusualLicenses = [...new Set(runtimeRows.map((row) => row.license))]
  .filter((license) => !license.toLowerCase().includes("mit"))
  .sort();

const output = `# Third-Party Notices

This file is generated by \`node ./build/generate-third-party-notices.mjs\`.

Runtime dependency roots: ${runtimeRoots.map((name) => `\`${name}\``).join(", ")}.

Generated runtime package count: ${runtimeRows.length}.

Runtime non-MIT license expressions: ${unusualLicenses.length === 0 ? "none" : unusualLicenses.map((license) => `\`${license}\``).join(", ")}.

## Runtime Packages

${runtimeTable}

## Self-Hosted Fonts

${fontTable}

## License Texts

${licenseSections}
`;

if (output.includes(root)) fail("generated notice contains the checkout path");
await writeFile(noticesPath, output);

const npmLicenseFileCount = runtimeRows.reduce((count, row) => count + row.licenseFiles.length, 0);
const fontNoticeCount = fontEntries.filter((entry) => entry.noticeFile !== undefined).length;
console.log(`Generated THIRD_PARTY_NOTICES.md for ${runtimeRows.length} runtime package notices and ${fontEntries.length} font families.`);
console.log(`Runtime license files: ${npmLicenseFileCount}`);
console.log(`Font notice sections: ${fontNoticeCount}`);
console.log(`Runtime non-MIT license expressions: ${unusualLicenses.join(", ") || "none"}`);
