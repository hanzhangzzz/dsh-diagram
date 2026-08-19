// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_DIAGRAM_VALIDATION_POLICY,
  type PersistedScene,
} from "../src/core/contracts.ts";
import { writeCanvasDeepLink } from "../src/core/canvas-link.ts";
import type { DiagramRecord, DiagramSummary } from "../src/core/rpc.ts";
import type { DiagramRpcClient } from "../src/editor/rpc.ts";

const excalidrawHarness = vi.hoisted(() => ({
  echoInitialSceneAfterEveryRender: false,
  onChange: undefined as
    | ((elements: readonly unknown[], appState: unknown, files: unknown) => void)
    | undefined,
  renderCount: 0,
  scrollToContent: vi.fn(),
}));

vi.mock("@excalidraw/excalidraw", async () => {
  const React = await import("react");
  return {
    Excalidraw: (props: {
      excalidrawAPI?: (api: Record<string, unknown>) => void;
      initialData?: {
        elements?: readonly unknown[];
        appState?: unknown;
        files?: unknown;
      };
      onChange?: (
        elements: readonly unknown[],
        appState: unknown,
        files: unknown,
      ) => void;
    }) => {
      excalidrawHarness.renderCount += 1;
      excalidrawHarness.onChange = props.onChange;
      React.useLayoutEffect(() => {
        if (
          excalidrawHarness.echoInitialSceneAfterEveryRender &&
          excalidrawHarness.renderCount <= 60
        ) {
          props.onChange?.(
            props.initialData?.elements ?? [],
            props.initialData?.appState ?? {},
            props.initialData?.files ?? {},
          );
        }
      });
      React.useEffect(() => {
        props.excalidrawAPI?.({
          getSceneElements: () => props.initialData?.elements ?? [],
          getAppState: () => ({}),
          getFiles: () => ({}),
          scrollToContent: excalidrawHarness.scrollToContent,
        });
      }, [props.excalidrawAPI]);
      return React.createElement("div", {
        "data-testid": "excalidraw-loaded",
      });
    },
    FONT_FAMILY: { Helvetica: 2 },
    convertToExcalidrawElements: (elements: unknown) => elements,
    exportToBlob: vi.fn(),
    exportToSvg: vi.fn(),
    serializeAsJSON: vi.fn(),
  };
});

import { DiagramApp } from "../src/editor/App.tsx";

const id = "31c02c3c-130c-4936-8720-8c2cc9fc1a3c" as never;
const revision = "93b53465-4b55-4322-a4ab-a46fbe57f498" as never;
const scene: PersistedScene = {
  elements: [
    {
      id: "node-1",
      type: "rectangle",
      x: 10,
      y: 20,
      width: 160,
      height: 80,
      link: null,
    },
  ],
  appState: { viewBackgroundColor: "#ffffff" },
  files: {},
};
const summary: DiagramSummary = {
  id,
  title: "Runtime",
  kind: "architecture",
  revision,
  createdAt: 1,
  updatedAt: 2,
  hasScene: true,
};
const record: DiagramRecord = {
  id: summary.id,
  sessionId: "session-1" as never,
  sessionFingerprint: { createdAt: 1 },
  title: summary.title,
  kind: summary.kind,
  sourceSpec: {
    kind: "architecture",
    title: "Runtime",
    nodes: [{ id: "api", label: "API" }],
    edges: [],
  },
  scene,
  revision: summary.revision,
  createdAt: summary.createdAt,
  updatedAt: summary.updatedAt,
};

afterEach(() => {
  excalidrawHarness.echoInitialSceneAfterEveryRender = false;
  excalidrawHarness.onChange = undefined;
  excalidrawHarness.renderCount = 0;
  excalidrawHarness.scrollToContent.mockReset();
  cleanup();
});

describe("DiagramApp", () => {
  it("keeps the canvas below a compact toolbar when notices are empty", async () => {
    const client = clientWith([summary], record);

    render(<DiagramApp client={client} sessionId="session-1" />);

    expect(await screen.findByTestId("excalidraw-loaded")).toBeTruthy();
    const app = screen.getByRole("main");
    const notices = app.children.item(1);
    expect(notices?.childElementCount).toBe(0);

    const stylesheet = readFileSync("src/editor/App.module.css", "utf8");
    expect(cssRule(stylesheet, "toolbar")).toMatch(/\bmin-height:\s*3\.5rem\s*;/);
    expect(cssRule(stylesheet, "body")).toMatch(/\bgrid-row:\s*3\s*;/);
    expect(stylesheet).toMatch(
      /\.diagramList\[hidden\]\s*\{[^}]*\bdisplay:\s*none\s*;/,
    );
  });

  it("opens the diagram requested by the chat preview deep link and consumes it", async () => {
    const olderId = "5f0a4a63-96eb-4b04-97a5-72e63f1e1bc7" as never;
    const older: DiagramSummary = {
      ...summary,
      id: olderId,
      title: "Older",
      updatedAt: 1,
    };
    const map = new Map<string, string>();
    const storage = {
      get length() {
        return map.size;
      },
      clear: () => map.clear(),
      getItem: (key: string) => map.get(key) ?? null,
      key: (index: number) => [...map.keys()][index] ?? null,
      removeItem: (key: string) => void map.delete(key),
      setItem: (key: string, value: string) => void map.set(key, value),
    } as Storage;
    writeCanvasDeepLink(storage, {
      sessionId: "session-1",
      diagramId: olderId as unknown as string,
    });
    const client = clientWith([summary, older], record);

    render(
      <DiagramApp client={client} draftStorage={storage} sessionId="session-1" />,
    );

    await waitFor(() =>
      expect(client.get).toHaveBeenCalledWith(
        "session-1",
        olderId,
        expect.anything(),
      ),
    );
    expect(map.has("dsh-diagram:canvas-link:v1")).toBe(false);
  });

  it("bounds initialization when Excalidraw echoes the persisted scene after every render", async () => {
    excalidrawHarness.echoInitialSceneAfterEveryRender = true;
    const client = clientWith([summary], record);

    render(<DiagramApp client={client} sessionId="session-1" />);

    expect(await screen.findByTestId("excalidraw-loaded")).toBeTruthy();
    await waitFor(() => expect(excalidrawHarness.renderCount).toBeLessThan(5));
    expect(client.save).not.toHaveBeenCalled();
  });

  it("loads the selected scene and enables all three exports after Excalidraw is ready", async () => {
    const client = clientWith([summary], record);

    render(<DiagramApp client={client} sessionId="session-1" />);

    expect(await screen.findByTestId("excalidraw-loaded")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Runtime" })).toBeTruthy();
    await waitFor(() => {
      for (const name of [".excalidraw", "SVG", "PNG"]) {
        const button = screen.getByRole("button", { name });
        expect((button as HTMLButtonElement).disabled).toBe(false);
      }
    });
  });

  it("fits each newly loaded scene into the viewport exactly once", async () => {
    const client = clientWith([summary], record);

    render(<DiagramApp client={client} sessionId="session-1" />);

    expect(await screen.findByTestId("excalidraw-loaded")).toBeTruthy();
    act(() => {
      excalidrawHarness.onChange?.(
        scene.elements,
        scene.appState,
        scene.files,
      );
    });

    expect(excalidrawHarness.scrollToContent).toHaveBeenCalledOnce();
    expect(excalidrawHarness.scrollToContent).toHaveBeenCalledWith(
      scene.elements,
      {
        animate: false,
        fitToViewport: true,
        maxZoom: 1,
        viewportZoomFactor: 0.9,
      },
    );

    act(() => {
      excalidrawHarness.onChange?.(
        scene.elements,
        scene.appState,
        scene.files,
      );
    });
    expect(excalidrawHarness.scrollToContent).toHaveBeenCalledOnce();
  });

  it("collapses and restores the diagram list without reloading the canvas", async () => {
    const client = clientWith([summary], record);

    render(<DiagramApp client={client} sessionId="session-1" />);

    expect(await screen.findByTestId("excalidraw-loaded")).toBeTruthy();
    const collapseButton = screen.getByRole("button", {
      name: "收起 diagram 列表",
    });
    expect(collapseButton.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(collapseButton);

    const expandButton = screen.getByRole("button", {
      name: "展开 diagram 列表",
    });
    expect(expandButton.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: /^Runtime/ })).toBeNull();
    expect(client.get).toHaveBeenCalledOnce();

    fireEvent.click(expandButton);

    expect(screen.getByRole("button", { name: /^Runtime/ })).toBeTruthy();
    expect(client.get).toHaveBeenCalledOnce();
  });

  it("shows the Agent handoff when the current session has no diagrams", async () => {
    const client = clientWith([], record);

    render(<DiagramApp client={client} sessionId="session-1" />);

    expect(
      await screen.findByText(/让 Agent 使用 diagram_create/),
    ).toBeTruthy();
    expect(client.get).not.toHaveBeenCalled();
  });

  it("keeps the newly selected diagram after the previous draft save resolves", async () => {
    const secondSummary: DiagramSummary = {
      id: "1340ab39-14dc-4638-9bc8-412435f5133c" as never,
      title: "Details",
      kind: "relationship",
      revision: "caa7fdc6-6998-4133-81ec-b12b3cbd76f4" as never,
      createdAt: 1,
      updatedAt: 2,
      hasScene: true,
    };
    const secondRecord: DiagramRecord = {
      id: secondSummary.id,
      sessionId: "session-1" as never,
      sessionFingerprint: { createdAt: 1 },
      title: secondSummary.title,
      kind: secondSummary.kind,
      sourceSpec: {
        kind: "relationship",
        title: "Details",
        nodes: [{ id: "worker", label: "Worker" }],
        edges: [],
      },
      scene,
      revision: secondSummary.revision,
      createdAt: secondSummary.createdAt,
      updatedAt: secondSummary.updatedAt,
    };
    let resolveSave!: (
      value: Awaited<ReturnType<DiagramRpcClient["save"]>>,
    ) => void;
    const pendingSave = new Promise<
      Awaited<ReturnType<DiagramRpcClient["save"]>>
    >((resolve) => {
      resolveSave = resolve;
    });
    const client = clientWith([summary, secondSummary], record);
    client.get = vi.fn(async (_sessionId, diagramId) => ({
      ok: true as const,
      value: {
        diagram: diagramId === secondSummary.id ? secondRecord : record,
      },
    }));
    client.save = vi.fn(() => pendingSave);

    render(<DiagramApp client={client} sessionId="session-1" />);
    expect(
      await screen.findByRole("heading", { name: "Runtime" }),
    ).toBeTruthy();

    const changedScene: PersistedScene = {
      ...scene,
      elements: [
        {
          id: "node-1",
          type: "rectangle",
          x: 48,
          y: 20,
          width: 160,
          height: 80,
          link: null,
        },
      ],
    };
    act(() => {
      excalidrawHarness.onChange?.(
        changedScene.elements,
        changedScene.appState,
        changedScene.files,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: /^Details/ }));
    await waitFor(() => expect(client.save).toHaveBeenCalledOnce());

    await act(async () => {
      resolveSave({
        ok: true,
        value: {
          diagram: {
            ...record,
            revision: "251363ed-d212-4c9b-b73b-2fd1d6431bdb" as never,
            updatedAt: 3,
          },
          unchanged: false,
        },
      });
      await pendingSave;
    });

    expect(
      await screen.findByRole("heading", { name: "Details" }),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Runtime" })).toBeNull();
  });
});

function clientWith(
  diagrams: DiagramSummary[],
  diagram: DiagramRecord,
): DiagramRpcClient {
  return {
    validationPolicy: DEFAULT_DIAGRAM_VALIDATION_POLICY,
    list: vi.fn(async () => ({
      ok: true as const,
      value: {
        diagrams,
        limits: {
          autosaveDebounceMs: 800,
          validationPolicy: { ...DEFAULT_DIAGRAM_VALIDATION_POLICY },
        },
      },
    })),
    get: vi.fn(async () => ({
      ok: true as const,
      value: { diagram },
    })),
    save: vi.fn(async () => ({
      ok: true as const,
      value: { diagram, unchanged: false },
    })),
  };
}

function cssRule(stylesheet: string, className: string): string {
  const match = stylesheet.match(
    new RegExp(`\\.${className}\\s*\\{(?<declarations>[^}]*)\\}`),
  );
  if (match?.groups?.declarations === undefined) {
    throw new Error(`Missing .${className} CSS rule`);
  }
  return match.groups.declarations;
}
