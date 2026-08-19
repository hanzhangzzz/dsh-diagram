// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import type { DiagramSpec, PersistedScene } from "../src/core/contracts.ts";
import { DEFAULT_DIAGRAM_VALIDATION_POLICY } from "../src/core/contracts.ts";
import type { DiagramRpcClient } from "../src/editor/rpc.ts";
import { bootstrapPreview } from "../src/editor/preview/main.ts";

const SPEC: DiagramSpec = {
  kind: "flow",
  title: "示例流程",
  nodes: [
    { id: "a", label: "开始" },
    { id: "b", label: "结束" },
  ],
  edges: [{ from: "a", to: "b" }],
};

const SCENE: PersistedScene = {
  elements: [
    {
      id: "only",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 40,
    },
  ],
  appState: {},
  files: {},
} as unknown as PersistedScene;

const SEARCH = "?sessionId=session-1&diagramId=diagram-1";

function diagram(scene?: PersistedScene) {
  return {
    id: "diagram-1",
    title: "示例流程",
    kind: "flow",
    sourceSpec: SPEC,
    ...(scene === undefined ? {} : { scene }),
    revision: "rev-1",
    createdAt: 1,
    updatedAt: 1,
  };
}

function rpcClient(overrides: Partial<DiagramRpcClient> = {}): DiagramRpcClient {
  return {
    validationPolicy: DEFAULT_DIAGRAM_VALIDATION_POLICY,
    list: vi.fn(async () => ({
      ok: true as const,
      value: {
        diagrams: [],
        limits: { validationPolicy: DEFAULT_DIAGRAM_VALIDATION_POLICY },
      },
    })),
    get: vi.fn(async () => ({
      ok: true as const,
      value: { diagram: diagram(SCENE) },
    })),
    save: vi.fn(),
    ...overrides,
  } as unknown as DiagramRpcClient;
}

function root(): HTMLElement {
  const element = document.createElement("div");
  document.body.append(element);
  return element;
}

describe("bootstrapPreview", () => {
  it("renders the persisted scene when one exists", async () => {
    const container = root();
    await bootstrapPreview(container, SEARCH, rpcClient());

    expect(container.querySelector("svg")).not.toBeNull();
    expect(
      container.querySelector("[data-element-id='only']"),
    ).not.toBeNull();
  });

  it("renders the deterministic spec layout when no scene was saved", async () => {
    const container = root();
    const rpc = rpcClient({
      get: vi.fn(async () => ({
        ok: true as const,
        value: { diagram: diagram() },
      })) as unknown as DiagramRpcClient["get"],
    });
    await bootstrapPreview(container, SEARCH, rpc);

    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector("[data-node-id='a']")).not.toBeNull();
  });

  it("shows a not-found notice for foreign or deleted diagrams", async () => {
    const container = root();
    const rpc = rpcClient({
      get: vi.fn(async () => ({
        ok: false as const,
        error: { code: "diagram-not-found" as const, id: "diagram-1" },
      })) as unknown as DiagramRpcClient["get"],
    });
    await bootstrapPreview(container, SEARCH, rpc);

    expect(container.textContent).toContain("不存在");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("keeps a retry affordance on transport failure and recovers", async () => {
    const container = root();
    const get = vi
      .fn()
      .mockRejectedValueOnce(new Error("HTTP 500"))
      .mockResolvedValue({
        ok: true as const,
        value: { diagram: diagram(SCENE) },
      });
    const rpc = rpcClient({ get: get as unknown as DiagramRpcClient["get"] });
    await bootstrapPreview(container, SEARCH, rpc);

    expect(container.textContent).toContain("加载失败");
    const retry = container.querySelector("button");
    expect(retry).not.toBeNull();

    retry?.click();
    await vi.waitFor(() => {
      expect(container.querySelector("svg")).not.toBeNull();
    });
  });

  it("rejects missing query parameters without calling the host", async () => {
    const container = root();
    const rpc = rpcClient();
    await bootstrapPreview(container, "?sessionId=only", rpc);

    expect(container.textContent).toContain("参数");
    expect(rpc.list).not.toHaveBeenCalled();
  });
});
