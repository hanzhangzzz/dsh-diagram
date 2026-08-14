import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createEditorAssetsHandler } from "../src/host/static.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })));
});

async function editorRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "dsh-diagram-static-"));
  temporaryDirectories.push(root);
  await writeFile(join(root, "index.html"), "<!doctype html><title>Diagram</title>");
  return root;
}

function request(url: string, method = "GET"): IncomingMessage {
  return { url, method } as IncomingMessage;
}

function responseRecorder(): {
  response: ServerResponse;
  status: () => number | undefined;
  headers: () => Record<string, string>;
  body: () => Buffer;
} {
  let status: number | undefined;
  let headers: Record<string, string> = {};
  const chunks: Buffer[] = [];
  const response = Object.assign(new EventEmitter(), {
    writeHead(code: number, nextHeaders: Record<string, string>) {
      status = code;
      headers = Object.fromEntries(
        Object.entries(nextHeaders).map(([key, value]) => [key.toLowerCase(), String(value)]),
      );
      return this;
    },
    end(value?: string | Uint8Array) {
      if (value !== undefined) chunks.push(Buffer.from(value));
      return this;
    },
  }) as unknown as ServerResponse;
  return {
    response,
    status: () => status,
    headers: () => headers,
    body: () => Buffer.concat(chunks),
  };
}

describe("diagram editor static route", () => {
  it("serves the editor index with a restrictive no-store response", async () => {
    const root = await editorRoot();
    const handler = createEditorAssetsHandler(root);
    const result = responseRecorder();

    await handler(request("/diagram-assets/"), result.response);

    expect(result.status()).toBe(200);
    expect(result.headers()).toMatchObject({
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff",
    });
    expect(result.headers()["content-security-policy"]).toContain("default-src 'none'");
    expect(result.headers()["content-security-policy"]).toContain("frame-ancestors 'self'");
    expect(result.body().toString()).toContain("<title>Diagram</title>");
  });

  it("serves allowlisted hashed assets immutably and honors HEAD", async () => {
    const root = await editorRoot();
    await mkdir(join(root, "assets"));
    await writeFile(join(root, "assets", "editor-a1b2c3d4.js"), "export {};\n");
    await writeFile(join(root, "assets", "style-Cr6IG356.css"), ".root {}\n");
    const handler = createEditorAssetsHandler(root);

    const get = responseRecorder();
    await handler(
      request("/diagram-assets/assets/editor-a1b2c3d4.js"),
      get.response,
    );
    expect(get.status()).toBe(200);
    expect(get.headers()).toMatchObject({
      "cache-control": "public, max-age=31536000, immutable",
      "content-type": "text/javascript; charset=utf-8",
    });
    expect(get.body().toString()).toBe("export {};\n");

    const head = responseRecorder();
    await handler(
      request("/diagram-assets/assets/editor-a1b2c3d4.js", "HEAD"),
      head.response,
    );
    expect(head.status()).toBe(200);
    expect(head.headers()["content-length"]).toBe(String(get.body().byteLength));
    expect(head.body()).toHaveLength(0);

    const mixedHash = responseRecorder();
    await handler(
      request("/diagram-assets/assets/style-Cr6IG356.css"),
      mixedHash.response,
    );
    expect(mixedHash.status()).toBe(200);
    expect(mixedHash.headers()["cache-control"])
      .toBe("public, max-age=31536000, immutable");
  });

  it("rejects unsupported methods, malformed paths, traversal, and misses", async () => {
    const root = await editorRoot();
    await writeFile(join(root, "notes.txt"), "not an editor asset");
    await writeFile(join(root, "editor.js.map"), "{}\n");
    const handler = createEditorAssetsHandler(root);

    const cases = [
      { url: "/diagram-assets/", method: "POST", status: 405 },
      { url: "/not-diagram-assets/index.html", method: "GET", status: 404 },
      { url: "/diagram-assets/%E0%A4%A", method: "GET", status: 400 },
      { url: "/diagram-assets/%00.js", method: "GET", status: 400 },
      { url: "/diagram-assets/%2F..%2Foutside.js", method: "GET", status: 404 },
      { url: "/diagram-assets/missing.js", method: "GET", status: 404 },
      { url: "/diagram-assets/notes.txt", method: "GET", status: 415 },
      { url: "/diagram-assets/editor.js.map", method: "GET", status: 415 },
    ] as const;

    for (const testCase of cases) {
      const result = responseRecorder();
      await handler(request(testCase.url, testCase.method), result.response);
      expect(result.status(), `${testCase.method} ${testCase.url}`).toBe(testCase.status);
      expect(result.body(), `${testCase.method} ${testCase.url}`).toHaveLength(0);
      expect(result.headers()["x-content-type-options"]).toBe("nosniff");
    }
  });

  it("rejects an allowlisted path whose symlink resolves outside the editor root", async () => {
    const root = await editorRoot();
    const outside = await mkdtemp(join(tmpdir(), "dsh-diagram-outside-"));
    temporaryDirectories.push(outside);
    await writeFile(join(outside, "secret.js"), "export const secret = true;\n");
    await symlink(join(outside, "secret.js"), join(root, "linked.js"));
    const result = responseRecorder();

    await createEditorAssetsHandler(root)(
      request("/diagram-assets/linked.js"),
      result.response,
    );

    expect(result.status()).toBe(404);
    expect(result.body()).toHaveLength(0);
  });

});
