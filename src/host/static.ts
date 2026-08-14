import { realpathSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

/** Public URL prefix for the editor document and its built assets. */
export const DIAGRAM_ASSETS_PATH = "/diagram-assets";

const EDITOR_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const SECURITY_HEADERS = {
  "content-security-policy": EDITOR_CSP,
  "cross-origin-resource-policy": "same-origin",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
} as const;

const MIME_TYPES: Readonly<Record<string, string>> = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
});

const HASHED_ASSET_PATTERN = /(?:^|[/\\])[^/\\]+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/u;

/**
 * Creates the bounded static handler for the separately built editor.
 * @param editorRoot Absolute directory containing Vite's editor output.
 * @returns A WebServer-compatible route handler.
 */
export function createEditorAssetsHandler(
  editorRoot: string,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const root = resolve(editorRoot);
  const indexPath = resolve(root, "index.html");
  const canonicalRoot = realpathSync(root);
  return async (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { ...SECURITY_HEADERS, allow: "GET, HEAD" });
      res.end();
      return;
    }
    const pathname = new URL(req.url ?? "/", "http://dsh.local").pathname;
    if (pathname !== DIAGRAM_ASSETS_PATH
      && !pathname.startsWith(`${DIAGRAM_ASSETS_PATH}/`)) {
      res.writeHead(404, SECURITY_HEADERS);
      res.end();
      return;
    }

    let suffix: string;
    try {
      suffix = decodeURIComponent(pathname.slice(DIAGRAM_ASSETS_PATH.length));
    } catch {
      res.writeHead(400, SECURITY_HEADERS);
      res.end();
      return;
    }
    if (suffix.includes("\0")) {
      res.writeHead(400, SECURITY_HEADERS);
      res.end();
      return;
    }

    const target = suffix === "" || suffix === "/" || suffix === "/index.html"
      ? indexPath
      : resolve(root, suffix.slice(1));
    if (target !== root && !target.startsWith(`${root}${sep}`)) {
      res.writeHead(404, SECURITY_HEADERS);
      res.end();
      return;
    }
    const contentType = MIME_TYPES[extname(target).toLowerCase()];
    if (contentType === undefined) {
      res.writeHead(415, SECURITY_HEADERS);
      res.end();
      return;
    }

    let body: Buffer;
    try {
      const canonicalTarget = await realpath(target);
      const relativeTarget = relative(canonicalRoot, canonicalTarget);
      if (isAbsolute(relativeTarget)
        || relativeTarget === ".."
        || relativeTarget.startsWith(`..${sep}`)) {
        res.writeHead(404, SECURITY_HEADERS);
        res.end();
        return;
      }
      body = await readFile(canonicalTarget);
    } catch {
      res.writeHead(404, SECURITY_HEADERS);
      res.end();
      return;
    }
    const index = target === indexPath;
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      "cache-control": index
        ? "no-store"
        : HASHED_ASSET_PATTERN.test(target)
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      "content-length": String(body.byteLength),
      "content-type": contentType,
    });
    res.end(req.method === "HEAD" ? undefined : body);
  };
}
