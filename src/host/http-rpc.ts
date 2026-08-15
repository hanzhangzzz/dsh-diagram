import type { IncomingMessage, ServerResponse } from "node:http";
import type { ConnectionRpcHandler } from "@deepseek-ai/dsh-client-connection";
import {
  clientRequestSchema,
  RpcId,
  type RpcResult,
  type RpcId as RpcIdType,
  type ServerResponse as RpcServerResponse,
} from "@deepseek-ai/dsh-host-apiproxy/api";

import { DIAGRAM_RPC_CHANNEL } from "../core/rpc.ts";

/** Fixed allowance for the RPC envelope around one maximum-size scene. */
export const DIAGRAM_RPC_BODY_HEADROOM_BYTES = 16_384;

const MAX_RPC_ID_CHARS = 128;
const INVALID_REQUEST_RPC_ID = RpcId("invalid-request");

interface DiagramHttpRpcLogger {
  error(error: Error): void;
}

/**
 * Creates the bounded HTTP carrier for the dedicated diagram RPC channel.
 * @param handler Strict decoded diagram RPC handler.
 * @param maxSceneBytes Maximum serialized scene bytes accepted by the business schema.
 * @param logger Host logger for unexpected handler failures.
 * @returns A WebServer-compatible handler that bounds bytes before JSON parsing.
 */
export function createDiagramHttpRpcHandler(
  handler: ConnectionRpcHandler,
  maxSceneBytes: number,
  logger: DiagramHttpRpcLogger,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const maxBodyBytes = resolveMaxBodyBytes(maxSceneBytes);
  return async (req, res) => {
    if (!isTrustedLoopbackRequest(req)) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      res.end("forbidden");
      return;
    }
    const endpoint = endpointFromRequest(req);
    if (req.method !== "POST" || endpoint === undefined) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const mediaType = stringHeader(req, "content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (mediaType !== "application/json") {
      res.writeHead(415);
      res.end("content type must be application/json");
      return;
    }
    const declaredLengthHeader = req.headers["content-length"];
    if (declaredLengthHeader !== undefined) {
      const declaredLength = parseContentLength(declaredLengthHeader);
      if (declaredLength === undefined) {
        rejectMalformedContentLength(req, res);
        return;
      }
      if (declaredLength > maxBodyBytes) {
        rejectOversized(req, res);
        return;
      }
    }
    const chunks: Buffer[] = [];
    let received = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      received += buffer.byteLength;
      if (received > maxBodyBytes) {
        rejectOversized(req, res);
        return;
      }
      chunks.push(buffer);
    }
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      res.writeHead(400);
      res.end("body is not JSON");
      return;
    }
    const envelope = clientRequestSchema.safeParse(body);
    if (!envelope.success) {
      const rawId = (body as { rpcId?: unknown } | null)?.rpcId;
      writeRpcResponse(
        res,
        limitedRpcId(rawId),
        {
          ok: false,
          error: {
            code: "bad-request",
            message: "invalid client-request message",
            details: { issues: [] },
          },
        },
      );
      return;
    }
    if (envelope.data.rpcId.length > MAX_RPC_ID_CHARS) {
      writeRpcResponse(res, INVALID_REQUEST_RPC_ID, {
        ok: false,
        error: {
          code: "bad-request",
          message: "rpcId exceeds the diagram carrier limit",
          details: { issues: [] },
        },
      });
      return;
    }
    if (envelope.data.method !== endpoint) {
      writeRpcResponse(res, envelope.data.rpcId, {
        ok: false,
        error: {
          code: "bad-request",
          message: "RPC method does not match the URL endpoint",
          details: { issues: [] },
        },
      });
      return;
    }
    const abort = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) abort.abort();
    });
    let result: RpcResult<unknown>;
    try {
      result = await handler(endpoint, envelope.data.payload, abort.signal);
    } catch (error) {
      logger.error(asError(error));
      res.writeHead(500, { "content-type": "text/plain;charset=UTF-8" });
      res.end("internal server error");
      return;
    }
    writeRpcResponse(res, envelope.data.rpcId, result);
  };
}

function writeRpcResponse(
  res: ServerResponse,
  rpcId: RpcIdType,
  result: RpcResult<unknown>,
): void {
  const response: RpcServerResponse = { type: "server-response", rpcId, result };
  const responseBody = JSON.stringify(response);
  res.writeHead(200, {
    "content-length": String(Buffer.byteLength(responseBody)),
    "content-type": "application/json",
  });
  res.end(responseBody);
}

function endpointFromRequest(req: IncomingMessage): string | undefined {
  let pathname: string;
  try {
    pathname = new URL(req.url ?? "/", "http://dsh.local").pathname;
  } catch {
    return undefined;
  }
  if (!pathname.startsWith(`${DIAGRAM_RPC_CHANNEL}/`)) return undefined;
  const endpoint = pathname.slice(DIAGRAM_RPC_CHANNEL.length + 1);
  return /^[A-Za-z0-9_$.-]+$/u.test(endpoint) ? endpoint : undefined;
}

function isTrustedLoopbackRequest(req: IncomingMessage): boolean {
  const host = stringHeader(req, "host");
  if (host === undefined) return false;
  let hostUrl: URL;
  try {
    hostUrl = new URL(`http://${host}`);
  } catch {
    return false;
  }
  if (hostUrl.username !== ""
    || hostUrl.password !== ""
    || hostUrl.pathname !== "/"
    || hostUrl.search !== ""
    || hostUrl.hash !== "") return false;
  if (!isLoopbackHostname(hostUrl.hostname)) return false;
  if (stringHeader(req, "sec-fetch-site") === "cross-site") return false;
  const origin = stringHeader(req, "origin");
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === hostUrl.host;
  } catch {
    return false;
  }
}

function stringHeader(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === "string" ? value : undefined;
}

function isLoopbackHostname(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "[::1]") return true;
  const parts = hostname.split(".");
  return parts.length === 4
    && parts[0] === "127"
    && parts.every((part) => /^\d{1,3}$/u.test(part) && Number(part) <= 255);
}

function limitedRpcId(value: unknown): RpcIdType {
  return typeof value === "string" && value.length <= MAX_RPC_ID_CHARS
    ? RpcId(value)
    : INVALID_REQUEST_RPC_ID;
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function parseContentLength(value: string | string[]): number | undefined {
  if (typeof value !== "string" || !/^\d+$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function rejectMalformedContentLength(
  req: IncomingMessage,
  res: ServerResponse,
): void {
  res.writeHead(400, { connection: "close" });
  res.end("invalid content-length");
  req.destroy();
}

function rejectOversized(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(413, { connection: "close" });
  req.resume();
  res.end();
}

function resolveMaxBodyBytes(maxSceneBytes: number): number {
  if (!Number.isSafeInteger(maxSceneBytes)
    || maxSceneBytes <= 0
    || maxSceneBytes > Number.MAX_SAFE_INTEGER - DIAGRAM_RPC_BODY_HEADROOM_BYTES) {
    throw new TypeError("diagram maxSceneBytes cannot produce a safe HTTP body limit");
  }
  return maxSceneBytes + DIAGRAM_RPC_BODY_HEADROOM_BYTES;
}
