import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_DIAGRAM_VALIDATION_POLICY,
  type DiagramValidationPolicy,
} from "../src/core/contracts.ts";
import { createDiagramRpcClient } from "../src/editor/rpc.ts";

const diagramId = "31c02c3c-130c-4936-8720-8c2cc9fc1a3c";
const revision = "93b53465-4b55-4322-a4ab-a46fbe57f498";
const rpcId = "99d86a25-f988-42c0-a77f-aeb6ae52a1b1";
const policy: DiagramValidationPolicy = {
  ...DEFAULT_DIAGRAM_VALIDATION_POLICY,
  maxSceneElements: 42,
};

describe("diagram iframe RPC", () => {
  it("posts the public client-request envelope and validates list twice", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://localhost:3080/diagram/list");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({ "content-type": "application/json" });
      expect(JSON.parse(String(init?.body))).toEqual({
        type: "client-request",
        rpcId,
        method: "list",
        payload: { sessionId: "session-1" },
      });
      return Response.json({
        type: "server-response",
        rpcId,
        result: {
          ok: true,
          value: {
            ok: true,
            value: {
              diagrams: [
                {
                  id: diagramId,
                  title: "Runtime",
                  kind: "architecture",
                  revision,
                  createdAt: 1,
                  updatedAt: 2,
                  hasScene: false,
                },
              ],
              limits: { autosaveDebounceMs: 800, validationPolicy: policy },
            },
          },
        },
      });
    });
    const client = createDiagramRpcClient({
      fetch,
      origin: "http://localhost:3080",
      mintRpcId: () => rpcId,
    });

    const result = await client.list("session-1");

    expect(result).toMatchObject({ ok: true });
    expect(client.validationPolicy).toEqual(policy);
  });

  it("rejects correlation mismatches and malformed business results", async () => {
    const responses = [
      {
        type: "server-response",
        rpcId: "different",
        result: { ok: true, value: { ok: true, value: {} } },
      },
      {
        type: "server-response",
        rpcId,
        result: {
          ok: true,
          value: {
            ok: true,
            value: {
              diagrams: [],
              limits: {
                autosaveDebounceMs: 800,
                validationPolicy: policy,
                unexpected: true,
              },
            },
          },
        },
      },
    ];
    const fetch = vi.fn(async () => Response.json(responses.shift()));
    const client = createDiagramRpcClient({
      fetch,
      origin: "http://localhost:3080",
      mintRpcId: () => rpcId,
    });

    await expect(client.list("session-1")).rejects.toThrow("rpcId");
    await expect(client.list("session-1")).rejects.toThrow("响应格式无效");
  });

  it("surfaces the outer transport result without accepting it as business data", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        type: "server-response",
        rpcId,
        result: {
          ok: false,
          error: { code: "internal", message: "host failed", details: {} },
        },
      }),
    );
    const client = createDiagramRpcClient({
      fetch,
      origin: "http://localhost:3080",
      mintRpcId: () => rpcId,
    });

    await expect(client.list("session-1")).rejects.toThrow("host failed");
  });
});
