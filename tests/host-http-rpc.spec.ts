import { EventEmitter } from "node:events";
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createConnection } from "node:net";
import { Readable } from "node:stream";
import type { ConnectionRpcHandler } from "@deepseek-ai/dsh-client-connection";
import { describe, expect, it, vi } from "vitest";

import {
  DIAGRAM_RPC_BODY_HEADROOM_BYTES,
  createDiagramHttpRpcHandler,
} from "../src/host/http-rpc.ts";

const MAX_SCENE_BYTES = 1_048_576;

function request(options: {
  body?: string | Buffer;
  headers?: Record<string, string | string[]>;
  method?: string;
  url?: string;
} = {}): IncomingMessage & { destroyedByHandler: boolean } {
  const message = Readable.from(
    options.body === undefined ? [] : [Buffer.from(options.body)],
  ) as unknown as IncomingMessage & { destroyedByHandler: boolean };
  const destroy = message.destroy.bind(message);
  message.destroyedByHandler = false;
  Object.assign(message, {
    headers: {
      host: "127.0.0.1:3080",
      "content-type": "application/json",
      ...options.headers,
    },
    method: options.method ?? "POST",
    url: options.url ?? "/diagram/list",
    destroy(error?: Error) {
      message.destroyedByHandler = true;
      destroy(error);
      return message;
    },
  });
  return message;
}

function responseRecorder(): {
  response: ServerResponse;
  status(): number | undefined;
  headers(): Record<string, string>;
  body(): Buffer;
} {
  let status: number | undefined;
  let headers: Record<string, string> = {};
  const chunks: Buffer[] = [];
  const response = Object.assign(new EventEmitter(), {
    writableEnded: false,
    writeHead(code: number, values: Record<string, string> = {}) {
      status = code;
      headers = Object.fromEntries(
        Object.entries(values).map(([key, value]) => [key.toLowerCase(), String(value)]),
      );
      return this;
    },
    end(this: { writableEnded: boolean }, value?: string | Uint8Array) {
      if (value !== undefined) chunks.push(Buffer.from(value));
      this.writableEnded = true;
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

function rpcLogger() {
  return { error: vi.fn<(error: Error) => void>() };
}

function httpHandler(
  rpc: ConnectionRpcHandler,
  maxSceneBytes = MAX_SCENE_BYTES,
  logger = rpcLogger(),
) {
  return createDiagramHttpRpcHandler(rpc, maxSceneBytes, logger);
}

function probeDeclaredOversizedStatus(
  port: number,
  contentLength: number,
): Promise<number> {
  return new Promise((resolve, reject) => {
    let response = "";
    let settled = false;
    const socket = createConnection({ host: "127.0.0.1", port });
    const finish = (error?: Error) => {
      if (settled) return;
      const match = response.match(/^HTTP\/1\.[01] (\d{3})/u);
      if (match !== null) {
        settled = true;
        socket.destroy();
        resolve(Number(match[1]));
        return;
      }
      if (error !== undefined) {
        settled = true;
        reject(error);
      }
    };
    socket.setTimeout(5_000, () =>
      finish(new Error("oversized HTTP probe timed out")),
    );
    socket.on("connect", () => {
      socket.write([
        "POST /diagram/list HTTP/1.1",
        `Host: 127.0.0.1:${port}`,
        "Content-Type: application/json",
        `Content-Length: ${contentLength}`,
        "Connection: close",
        "",
        "",
      ].join("\r\n"));
    });
    socket.on("data", (chunk) => {
      response += chunk.toString("latin1");
      finish();
    });
    socket.on("end", () =>
      finish(new Error("oversized HTTP probe ended without a response")),
    );
    socket.on("close", () =>
      finish(new Error("oversized HTTP probe closed without a response")),
    );
    socket.on("error", (error) => finish(error));
  });
}

describe("diagram bounded HTTP RPC", () => {
  it("rejects scene limits that cannot produce a safe fixed body cap", () => {
    const rpc = vi.fn<ConnectionRpcHandler>();

    for (const value of [
      0,
      1.5,
      Number.MAX_SAFE_INTEGER - DIAGRAM_RPC_BODY_HEADROOM_BYTES + 1,
    ]) {
      expect(() => httpHandler(rpc, value)).toThrow(
        "diagram maxSceneBytes cannot produce a safe HTTP body limit",
      );
    }
  });

  it("rejects a declared oversized request without dispatching it", async () => {
    const rpc = vi.fn<ConnectionRpcHandler>();
    const handle = httpHandler(rpc);
    const incoming = request({
      headers: {
        "content-length": String(
          MAX_SCENE_BYTES + DIAGRAM_RPC_BODY_HEADROOM_BYTES + 1,
        ),
      },
    });
    const outgoing = responseRecorder();

    await handle(incoming, outgoing.response);

    expect(outgoing.status()).toBe(413);
    expect(outgoing.headers()).toMatchObject({ connection: "close" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("delivers the 413 response before closing a real oversized HTTP request", async () => {
    const rpc = vi.fn<ConnectionRpcHandler>();
    const handle = httpHandler(rpc);
    const server = createServer((incoming, outgoing) => {
      void handle(incoming, outgoing);
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    try {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("test server did not bind a TCP port");
      }
      const status = await probeDeclaredOversizedStatus(
        address.port,
        MAX_SCENE_BYTES + DIAGRAM_RPC_BODY_HEADROOM_BYTES + 1,
      );

      expect(status).toBe(413);
      expect(rpc).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error === undefined ? resolve() : reject(error));
      });
    }
  });

  it("delivers the 413 response for a real oversized chunked request", async () => {
    const rpc = vi.fn<ConnectionRpcHandler>();
    const handle = httpHandler(rpc, 1);
    const server = createServer((incoming, outgoing) => {
      void handle(incoming, outgoing);
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    try {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("test server did not bind a TCP port");
      }
      const status = await new Promise<number | undefined>((resolve, reject) => {
        const outgoing = httpRequest({
          hostname: "127.0.0.1",
          port: address.port,
          path: "/diagram/list",
          method: "POST",
          headers: {
            "content-type": "application/json",
            "transfer-encoding": "chunked",
          },
        }, (response) => {
          response.resume();
          response.once("end", () => resolve(response.statusCode));
        });
        outgoing.once("error", reject);
        outgoing.end(Buffer.alloc(1 + DIAGRAM_RPC_BODY_HEADROOM_BYTES + 1));
      });

      expect(status).toBe(413);
      expect(rpc).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error === undefined ? resolve() : reject(error));
      });
    }
  });

  it("accepts a request whose actual size equals the fixed derived cap", async () => {
    const maxSceneBytes = 1;
    const maxBodyBytes = maxSceneBytes + DIAGRAM_RPC_BODY_HEADROOM_BYTES;
    const rpc = vi.fn<ConnectionRpcHandler>(async () => ({ ok: true, value: null }));
    const handle = httpHandler(rpc, maxSceneBytes);
    const envelope = {
      type: "client-request",
      rpcId: "rpc-exact-cap",
      method: "list",
      payload: { padding: "" },
    };
    const baseBody = JSON.stringify(envelope);
    const body = JSON.stringify({
      ...envelope,
      payload: { padding: "x".repeat(maxBodyBytes - baseBody.length) },
    });
    const incoming = request({
      body,
      headers: { "content-length": String(Buffer.byteLength(body)) },
    });
    const outgoing = responseRecorder();

    expect(Buffer.byteLength(body)).toBe(maxBodyBytes);
    await handle(incoming, outgoing.response);

    expect(outgoing.status()).toBe(200);
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("rejects malformed declared lengths before reading or dispatching", async () => {
    const rpc = vi.fn<ConnectionRpcHandler>();
    const handle = httpHandler(rpc);

    for (const value of ["-1", "NaN", "Infinity", "1e9", "9007199254740992"]) {
      const incoming = request({
        body: "{}",
        headers: { "content-length": value },
      });
      const outgoing = responseRecorder();

      await handle(incoming, outgoing.response);

      expect(outgoing.status(), value).toBe(400);
      expect(outgoing.headers(), value).toMatchObject({ connection: "close" });
      expect(incoming.destroyedByHandler, value).toBe(true);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a chunked request as soon as received bytes exceed the limit", async () => {
    const rpc = vi.fn<ConnectionRpcHandler>();
    const handle = httpHandler(rpc);
    const incoming = request({
      body: Buffer.alloc(
        MAX_SCENE_BYTES + DIAGRAM_RPC_BODY_HEADROOM_BYTES + 1,
      ),
    });
    const outgoing = responseRecorder();

    await handle(incoming, outgoing.response);

    expect(outgoing.status()).toBe(413);
    expect(outgoing.headers()).toMatchObject({ connection: "close" });
    expect(incoming.destroyedByHandler).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects rebound and cross-site browser requests before dispatch", async () => {
    const rpc = vi.fn<ConnectionRpcHandler>();
    const handle = httpHandler(rpc);
    const cases = [
      {
        host: "evil.example:3080",
        origin: "http://evil.example:3080",
        "sec-fetch-site": "same-origin",
      },
      {
        host: "127.0.0.1:3080",
        origin: "http://evil.example",
      },
      {
        host: "127.0.0.1:3080",
        "sec-fetch-site": "cross-site",
      },
      {
        host: "127.0.0.1:3080",
        origin: "null",
      },
      {
        host: "evil@127.0.0.1:3080",
      },
      {
        host: "127.0.0.1:3080/path",
      },
      {
        host: ["127.0.0.1:3080", "evil.example:3080"],
      },
      {
        host: "localhost:3080",
        origin: "http://localhost:3081",
      },
    ];

    for (const headers of cases) {
      const incoming = request({ body: "{}", headers });
      const outgoing = responseRecorder();

      await handle(incoming, outgoing.response);

      expect(outgoing.status(), JSON.stringify(headers)).toBe(403);
      expect(outgoing.body().toString()).toBe("forbidden");
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects unsupported methods, paths, media types, and malformed JSON", async () => {
    const rpc = vi.fn<ConnectionRpcHandler>();
    const handle = httpHandler(rpc);
    const cases = [
      { method: "GET", status: 404 },
      { url: "/diagram", status: 404 },
      { url: "/diagram/list/nested", status: 404 },
      { headers: { "content-type": "text/plain" }, status: 415 },
      { body: "{", status: 400 },
    ] as const;

    for (const testCase of cases) {
      const incoming = request(testCase);
      const outgoing = responseRecorder();

      await handle(incoming, outgoing.response);

      expect(outgoing.status(), JSON.stringify(testCase)).toBe(testCase.status);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("dispatches a same-origin request through the standard RPC envelope", async () => {
    const rpc = vi.fn<ConnectionRpcHandler>(async () => ({
      ok: true,
      value: { ok: true, value: { diagrams: [] } },
    }));
    const handle = httpHandler(rpc);
    const payload = { sessionId: "session-http" };
    const incoming = request({
      body: JSON.stringify({
        type: "client-request",
        rpcId: "rpc-http-1",
        method: "list",
        payload,
      }),
      headers: {
        host: "localhost:3080",
        origin: "http://localhost:3080",
        "sec-fetch-site": "same-origin",
      },
    });
    const outgoing = responseRecorder();

    await handle(incoming, outgoing.response);

    expect(rpc).toHaveBeenCalledWith("list", payload, expect.any(AbortSignal));
    expect(outgoing.status()).toBe(200);
    expect(outgoing.headers()["content-type"]).toBe("application/json");
    expect(JSON.parse(outgoing.body().toString())).toEqual({
      type: "server-response",
      rpcId: "rpc-http-1",
      result: { ok: true, value: { ok: true, value: { diagrams: [] } } },
    });
  });

  it("accepts the DSH loopback and same-authority Origin trust table", async () => {
    const rpc = vi.fn<ConnectionRpcHandler>(async () => ({ ok: true, value: null }));
    const handle = httpHandler(rpc);
    const cases = [
      { host: "localhost", origin: "http://localhost" },
      { host: "localhost:3080", origin: "http://localhost:3080" },
      { host: "127.0.0.1", origin: "http://127.0.0.1" },
      { host: "127.0.0.1:3080", origin: "http://127.0.0.1:3080" },
      { host: "127.8.9.10:80", origin: "http://127.8.9.10:80" },
      { host: "[::1]", origin: "http://[::1]" },
      { host: "[::1]:3080", origin: "http://[::1]:3080" },
      { host: "LOCALHOST:3080", origin: "http://localhost:3080" },
      { host: "localhost:3080", origin: "https://localhost:3080" },
      { host: "localhost:3080", origin: undefined },
    ];

    for (const { host, origin } of cases) {
      const incoming = request({
        body: JSON.stringify({
          type: "client-request",
          rpcId: `rpc-${host}`,
          method: "list",
          payload: {},
        }),
        headers: {
          host,
          ...(origin === undefined ? {} : { origin }),
          "sec-fetch-site": "same-origin",
        },
      });
      const outgoing = responseRecorder();

      await handle(incoming, outgoing.response);

      expect(outgoing.status(), host).toBe(200);
    }
    expect(rpc).toHaveBeenCalledTimes(cases.length);
  });

  it("aborts a pending business operation when the browser disconnects", async () => {
    let started!: () => void;
    const operationStarted = new Promise<void>((resolve) => { started = resolve; });
    let operationSignal: AbortSignal | undefined;
    const rpc = vi.fn<ConnectionRpcHandler>(async (_endpoint, _payload, signal) => {
      operationSignal = signal;
      started();
      if (!signal.aborted) {
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => resolve(), { once: true });
        });
      }
      return {
        ok: false,
        error: { code: "cancelled", message: "cancelled", details: {} },
      };
    });
    const handle = httpHandler(rpc);
    const incoming = request({
      body: JSON.stringify({
        type: "client-request",
        rpcId: "rpc-disconnect",
        method: "list",
        payload: {},
      }),
    });
    const outgoing = responseRecorder();

    const pending = handle(incoming, outgoing.response);
    await operationStarted;
    outgoing.response.emit("close");
    await pending;

    expect(operationSignal?.aborted).toBe(true);
  });

  it("maps an unexpected business handler failure to HTTP 500", async () => {
    const secret = "db-password=must-not-leak";
    const logger = rpcLogger();
    const rpc = vi.fn<ConnectionRpcHandler>(async () => {
      throw new Error(secret);
    });
    const handle = httpHandler(rpc, MAX_SCENE_BYTES, logger);
    const incoming = request({
      body: JSON.stringify({
        type: "client-request",
        rpcId: "rpc-handler-failure",
        method: "list",
        payload: {},
      }),
    });
    const outgoing = responseRecorder();

    await handle(incoming, outgoing.response);

    expect(outgoing.status()).toBe(500);
    expect(outgoing.body().toString()).toBe("internal server error");
    expect(outgoing.body().toString()).not.toContain(secret);
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ message: secret }));
  });

  it("returns a correlated standard bad-request result for an invalid envelope", async () => {
    const rpc = vi.fn<ConnectionRpcHandler>();
    const handle = httpHandler(rpc);
    const secret = "invalid-type-secret".repeat(20);
    const incoming = request({
      body: JSON.stringify({
        type: secret,
        rpcId: "rpc-invalid",
        method: "list",
        payload: {},
      }),
    });
    const outgoing = responseRecorder();

    await handle(incoming, outgoing.response);

    expect(outgoing.status()).toBe(200);
    expect(JSON.parse(outgoing.body().toString())).toMatchObject({
      type: "server-response",
      rpcId: "rpc-invalid",
      result: {
        ok: false,
        error: {
          code: "bad-request",
          message: "invalid client-request message",
          details: { issues: [] },
        },
      },
    });
    expect(outgoing.body().toString()).not.toContain(secret);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not reflect oversized RPC identifiers from invalid or valid envelopes", async () => {
    const rpc = vi.fn<ConnectionRpcHandler>();
    const handle = httpHandler(rpc);
    const oversizedRpcId = "sensitive-rpc-id".repeat(10);
    const bodies = [
      { rpcId: oversizedRpcId, method: "list", payload: {} },
      {
        type: "client-request",
        rpcId: oversizedRpcId,
        method: "list",
        payload: {},
      },
    ];

    for (const body of bodies) {
      const incoming = request({ body: JSON.stringify(body) });
      const outgoing = responseRecorder();

      await handle(incoming, outgoing.response);

      expect(outgoing.status()).toBe(200);
      expect(JSON.parse(outgoing.body().toString())).toMatchObject({
        type: "server-response",
        rpcId: "invalid-request",
        result: { ok: false, error: { code: "bad-request" } },
      });
      expect(outgoing.body().toString()).not.toContain(oversizedRpcId);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects an envelope whose method does not match the URL endpoint", async () => {
    const rpc = vi.fn<ConnectionRpcHandler>();
    const handle = httpHandler(rpc);
    const secret = "sensitive-method".repeat(20);
    const incoming = request({
      body: JSON.stringify({
        type: "client-request",
        rpcId: "rpc-method-mismatch",
        method: secret,
        payload: {},
      }),
      url: "/diagram/list",
    });
    const outgoing = responseRecorder();

    await handle(incoming, outgoing.response);

    expect(outgoing.status()).toBe(200);
    expect(JSON.parse(outgoing.body().toString())).toMatchObject({
      rpcId: "rpc-method-mismatch",
      result: {
        ok: false,
        error: {
          code: "bad-request",
          message: "RPC method does not match the URL endpoint",
        },
      },
    });
    expect(outgoing.body().toString()).not.toContain(secret);
    expect(rpc).not.toHaveBeenCalled();
  });
});
