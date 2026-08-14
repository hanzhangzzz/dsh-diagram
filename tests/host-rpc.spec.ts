import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_DIAGRAM_VALIDATION_POLICY,
  type PersistedScene,
} from "../src/core/contracts.ts";
import type {
  DiagramBusinessResult,
  DiagramGetRequest,
  DiagramGetValue,
  DiagramListRequest,
  DiagramListValue,
  DiagramRpcError,
  DiagramSaveValue,
} from "../src/core/rpc.ts";
import {
  createDiagramRpcHandler,
  type DiagramRpcOperations,
} from "../src/host/rpc.ts";

const SCENE: PersistedScene = {
  elements: [],
  appState: {},
  files: {},
};

function operations(): DiagramRpcOperations {
  return {
    async list(_request, _signal) {
      return {
        ok: true,
        value: {
          diagrams: [],
          limits: {
            autosaveDebounceMs: 800,
            validationPolicy: DEFAULT_DIAGRAM_VALIDATION_POLICY,
          },
        },
      } satisfies DiagramBusinessResult<DiagramListValue, DiagramRpcError>;
    },
    async get(request, _signal) {
      return {
        ok: false,
        error: { code: "diagram-not-found", id: request.id },
      } satisfies DiagramBusinessResult<DiagramGetValue, DiagramRpcError>;
    },
    async save(request, _signal) {
      return {
        ok: false,
        error: { code: "diagram-not-found", id: request.id },
      } satisfies DiagramBusinessResult<DiagramSaveValue, DiagramRpcError>;
    },
  };
}

describe("diagram Host RPC", () => {
  it("validates a request and wraps the inner business result once", async () => {
    const handler = createDiagramRpcHandler(
      operations(),
      DEFAULT_DIAGRAM_VALIDATION_POLICY,
      { error: vi.fn() },
    );

    await expect(handler("list", { sessionId: "session-rpc" }, new AbortController().signal))
      .resolves.toEqual({
        ok: true,
        value: {
          ok: true,
          value: {
            diagrams: [],
            limits: {
              autosaveDebounceMs: 800,
              validationPolicy: DEFAULT_DIAGRAM_VALIDATION_POLICY,
            },
          },
        },
      });
  });

  it("returns transport bad-request for malformed payloads and endpoints", async () => {
    const handler = createDiagramRpcHandler(
      operations(),
      DEFAULT_DIAGRAM_VALIDATION_POLICY,
      { error: vi.fn() },
    );
    const signal = new AbortController().signal;

    const malformed = await handler("get", { sessionId: "session-rpc" }, signal);
    expect(malformed).toMatchObject({
      ok: false,
      error: { code: "bad-request", details: { issues: expect.any(Array) } },
    });
    const unknown = await handler("delete", {}, signal);
    expect(unknown).toMatchObject({
      ok: false,
      error: { code: "bad-request", details: { issues: [] } },
    });
  });

  it("keeps scene validation inside the diagram business union", async () => {
    const save = vi.fn<DiagramRpcOperations["save"]>();
    const handler = createDiagramRpcHandler(
      { ...operations(), save },
      DEFAULT_DIAGRAM_VALIDATION_POLICY,
      { error: vi.fn() },
    );
    const result = await handler("save", {
      sessionId: "session-rpc",
      id: "00000000-0000-4000-8000-000000000001",
      expectedRevision: "10000000-0000-4000-8000-000000000001",
      scene: { ...SCENE, files: { embedded: "forbidden" } },
    }, new AbortController().signal);

    expect(result).toMatchObject({
      ok: true,
      value: {
        ok: false,
        error: { code: "invalid-scene", issues: expect.any(Array) },
      },
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("contains operation exceptions and invalid returned values", async () => {
    const log = { error: vi.fn() };
    const thrown = operations();
    thrown.list = async (_request: DiagramListRequest, _signal: AbortSignal) => {
      throw new Error("secret backend detail");
    };
    const thrownHandler = createDiagramRpcHandler(
      thrown,
      DEFAULT_DIAGRAM_VALIDATION_POLICY,
      log,
    );
    const thrownResult = await thrownHandler(
      "list",
      { sessionId: "session-rpc" },
      new AbortController().signal,
    );
    expect(thrownResult).toEqual({
      ok: false,
      error: { code: "internal", message: "diagram RPC failed", details: {} },
    });
    expect(JSON.stringify(thrownResult)).not.toContain("secret backend detail");

    const invalid = operations();
    invalid.get = async (_request: DiagramGetRequest, _signal: AbortSignal) =>
      ({ ok: true, value: {} }) as DiagramBusinessResult<DiagramGetValue, DiagramRpcError>;
    const invalidHandler = createDiagramRpcHandler(
      invalid,
      DEFAULT_DIAGRAM_VALIDATION_POLICY,
      log,
    );
    await expect(invalidHandler("get", {
      sessionId: "session-rpc",
      id: "00000000-0000-4000-8000-000000000001",
    }, new AbortController().signal)).resolves.toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
    expect(log.error).toHaveBeenCalledTimes(2);
  });

  it("maps cancellation to the standard outer failure", async () => {
    const controller = new AbortController();
    controller.abort("caller stopped");
    const handler = createDiagramRpcHandler(
      operations(),
      DEFAULT_DIAGRAM_VALIDATION_POLICY,
      { error: vi.fn() },
    );

    await expect(handler("list", { sessionId: "session-rpc" }, controller.signal))
      .resolves.toEqual({
        ok: false,
        error: { code: "cancelled", message: "diagram RPC cancelled", details: {} },
      });
  });
});
