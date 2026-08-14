import type { SessionHeader } from "@deepseek-ai/dsh-session";
import { SessionId } from "@deepseek-ai/dsh-session";
import type { ToolRunContext } from "@deepseek-ai/dsh-tools";
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_DIAGRAM_VALIDATION_POLICY,
  type DiagramSpec,
  type PersistedScene,
} from "../src/core/contracts.ts";
import type {
  DiagramId,
  DiagramRecord,
} from "../src/core/rpc.ts";
import {
  createDiagramTools,
  type DiagramToolHost,
} from "../src/host/tools.ts";

const HEADER: SessionHeader = {
  version: 0,
  id: SessionId("session-tool"),
  createdAt: 100,
  cwd: "/workspace",
};

const SPEC: DiagramSpec = {
  kind: "flow",
  title: "Article flow",
  summary: "private source summary",
  nodes: [{ id: "claim", label: "Private claim" }],
  edges: [],
};

const ID = "00000000-0000-4000-8000-000000000001" as DiagramId;

function record(scene?: PersistedScene): DiagramRecord {
  return {
    id: ID,
    sessionId: HEADER.id,
    sessionFingerprint: { createdAt: HEADER.createdAt, cwd: HEADER.cwd },
    title: SPEC.title,
    kind: SPEC.kind,
    sourceSpec: SPEC,
    ...(scene === undefined ? {} : { scene }),
    revision: "10000000-0000-4000-8000-000000000001" as DiagramRecord["revision"],
    createdAt: 200,
    updatedAt: 200,
  };
}

function host(overrides: Partial<DiagramToolHost> = {}): DiagramToolHost {
  return {
    validationPolicy: DEFAULT_DIAGRAM_VALIDATION_POLICY,
    maxReadChars: 12_000,
    createDiagram: vi.fn(async () => record()),
    readDiagram: vi.fn(async (_session, id) => ({
      ok: false as const,
      error: { code: "diagram-not-found" as const, id },
    })),
    ...overrides,
  };
}

function execution(
  options: { agent?: boolean; signal?: AbortSignal } = {},
): ToolRunContext {
  const signal = options.signal ?? new AbortController().signal;
  return {
    callId: "call-diagram",
    rootCallId: "call-diagram",
    name: "diagram",
    arguments: {},
    signal,
    token: Symbol("diagram-call"),
    ...(options.agent === false ? {} : {
      agent: { session: { header: HEADER } },
    }),
    deferContext() {},
    concludeTurn() {},
  } as unknown as ToolRunContext;
}

describe("diagram tools", () => {
  it("requires an owning agent and rejects unknown DiagramSpec fields", async () => {
    const service = host();
    const [create] = createDiagramTools(service);

    await expect(create.execute(SPEC, execution({ agent: false })))
      .rejects.toThrow("requires an owning agent session");
    await expect(create.execute({ ...SPEC, hidden: true }, execution()))
      .rejects.toThrow();
    expect(service.createDiagram).not.toHaveBeenCalled();
  });

  it("creates only in exec.agent's exact Session lifecycle", async () => {
    const createDiagram = vi.fn(async () => record());
    const [create] = createDiagramTools(host({ createDiagram }));

    await expect(create.execute(SPEC, execution())).resolves.toMatchObject({
      diagramId: ID,
      title: "Article flow",
      kind: "flow",
      canvasTab: "画布",
    });
    expect(createDiagram).toHaveBeenCalledWith(
      HEADER,
      SPEC,
      expect.any(AbortSignal),
    );
  });

  it("admits no work after caller cancellation", async () => {
    const createDiagram = vi.fn(async () => record());
    const [create] = createDiagramTools(host({ createDiagram }));
    const controller = new AbortController();
    controller.abort("cancelled");

    await expect(create.execute(SPEC, execution({ signal: controller.signal })))
      .rejects.toThrow();
    expect(createDiagram).not.toHaveBeenCalled();
  });

  it("reads an authoritative scene without exposing stale sourceSpec", async () => {
    const scene: PersistedScene = {
      elements: [
        {
          id: "text-1",
          type: "text",
          x: 10,
          y: 20,
          width: 100,
          height: 30,
          text: "Edited claim",
        },
        {
          id: "shape-1",
          type: "rectangle",
          x: 0,
          y: 0,
          width: 140,
          height: 80,
        },
        {
          id: "edge-1",
          type: "arrow",
          x: 140,
          y: 40,
          width: 80,
          height: 0,
          startBinding: { elementId: "shape-1" },
          endBinding: { elementId: "shape-2" },
        },
      ],
      appState: {},
      files: {},
    };
    const readDiagram = vi.fn(async () => ({
      ok: true as const,
      value: { diagram: record(scene) },
    }));
    const [, read] = createDiagramTools(host({ readDiagram }));

    const result = await read.execute({ id: ID }, execution()) as {
      source: string;
      summary: string;
      truncated: boolean;
    };
    expect(result.source).toBe("scene");
    expect(result.summary).toContain("Edited claim");
    expect(result.summary).toContain("shape-1 -> shape-2");
    expect(result.summary).not.toContain("private source summary");
    expect(result.summary).not.toContain("Private claim");
    expect(result.truncated).toBe(false);
    expect(readDiagram).toHaveBeenCalledWith(HEADER, ID, expect.any(AbortSignal));
  });

  it("bounds diagram_read model content by Unicode code points", async () => {
    const readDiagram = vi.fn(async () => ({
      ok: true as const,
      value: { diagram: record() },
    }));
    const [, read] = createDiagramTools(host({ maxReadChars: 24, readDiagram }));

    const result = await read.execute({ id: ID }, execution()) as {
      summary: string;
      truncated: boolean;
    };
    expect([...result.summary]).toHaveLength(24);
    expect(result.truncated).toBe(true);
  });
});
