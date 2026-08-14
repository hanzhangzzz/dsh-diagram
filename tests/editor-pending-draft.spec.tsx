// @vitest-environment jsdom

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
import type { DiagramRecord, DiagramSummary } from "../src/core/rpc.ts";
import type { DiagramRpcClient } from "../src/editor/rpc.ts";

const excalidrawHarness = vi.hoisted(() => ({
  initialData: undefined as { elements?: readonly unknown[] } | undefined,
  onChange: undefined as
    | ((elements: readonly unknown[], appState: unknown, files: unknown) => void)
    | undefined,
}));

vi.mock("@excalidraw/excalidraw", async () => {
  const React = await import("react");
  return {
    Excalidraw: (props: {
      excalidrawAPI?: (api: Record<string, unknown>) => void;
      initialData?: { elements?: readonly unknown[] };
      onChange?: (
        elements: readonly unknown[],
        appState: unknown,
        files: unknown,
      ) => void;
    }) => {
      excalidrawHarness.initialData = props.initialData;
      excalidrawHarness.onChange = props.onChange;
      React.useEffect(() => {
        props.excalidrawAPI?.({
          getSceneElements: () => [],
          getAppState: () => ({}),
          getFiles: () => ({}),
        });
      }, [props.excalidrawAPI]);
      return React.createElement("div", { "data-testid": "excalidraw-loaded" });
    },
    FONT_FAMILY: { Helvetica: 2 },
    convertToExcalidrawElements: (elements: unknown) => elements,
    exportToBlob: vi.fn(),
    exportToSvg: vi.fn(),
    serializeAsJSON: vi.fn(),
  };
});

import { DiagramApp } from "../src/editor/App.tsx";
import {
  clearPendingDiagramDraft,
  readPendingDiagramDraft,
  writePendingDiagramDraft,
} from "../src/editor/pendingDraft.ts";

const diagramId = "31c02c3c-130c-4936-8720-8c2cc9fc1a3c" as never;
const originalRevision = "93b53465-4b55-4322-a4ab-a46fbe57f498" as never;
const currentRevision = "251363ed-d212-4c9b-b73b-2fd1d6431bdb" as never;
const secondDiagramId = "1340ab39-14dc-4638-9bc8-412435f5133c" as never;
const secondRevision = "caa7fdc6-6998-4133-81ec-b12b3cbd76f4" as never;
const serverScene = createScene(10);
const pendingScene = createScene(72);
const summary: DiagramSummary = {
  id: diagramId,
  title: "Runtime",
  kind: "architecture",
  revision: originalRevision,
  createdAt: 1,
  updatedAt: 2,
  hasScene: true,
};
const record: DiagramRecord = {
  id: diagramId,
  sessionId: "session-1" as never,
  sessionFingerprint: { createdAt: 1 },
  title: "Runtime",
  kind: "architecture",
  sourceSpec: {
    kind: "architecture",
    title: "Runtime",
    nodes: [{ id: "api", label: "API" }],
    edges: [],
  },
  scene: serverScene,
  revision: originalRevision,
  createdAt: 1,
  updatedAt: 2,
};
const secondSummary: DiagramSummary = {
  id: secondDiagramId,
  title: "Details",
  kind: "relationship",
  revision: secondRevision,
  createdAt: 1,
  updatedAt: 2,
  hasScene: true,
};
const secondRecord: DiagramRecord = {
  id: secondDiagramId,
  sessionId: "session-1" as never,
  sessionFingerprint: { createdAt: 1 },
  title: "Details",
  kind: "relationship",
  sourceSpec: {
    kind: "relationship",
    title: "Details",
    nodes: [{ id: "worker", label: "Worker" }],
    edges: [],
  },
  scene: serverScene,
  revision: secondRevision,
  createdAt: 1,
  updatedAt: 2,
};

afterEach(() => {
  excalidrawHarness.initialData = undefined;
  excalidrawHarness.onChange = undefined;
  cleanup();
});

describe("pending diagram draft recovery", () => {
  it("writes the current valid draft on pagehide and saves it after remount", async () => {
    const storage = new MemoryStorage();
    const interruptedClient = clientWith(record);
    interruptedClient.save = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<DiagramRpcClient["save"]>>>(
          () => undefined,
        ),
    );
    const firstMount = render(
      <DiagramApp
        client={interruptedClient}
        draftStorage={storage}
        sessionId="session-1"
      />,
    );
    expect(
      await screen.findByRole("heading", { name: "Runtime" }),
    ).toBeTruthy();

    act(() => {
      excalidrawHarness.onChange?.(
        pendingScene.elements,
        pendingScene.appState,
        pendingScene.files,
      );
      globalThis.dispatchEvent(new Event("pagehide"));
    });
    expect(
      readPendingDiagramDraft(
        storage,
        "session-1",
        DEFAULT_DIAGRAM_VALIDATION_POLICY,
      ),
    ).toMatchObject({
      diagramId,
      expectedRevision: originalRevision,
      scene: pendingScene,
    });
    firstMount.unmount();

    const restoredRecord: DiagramRecord = {
      ...record,
      scene: pendingScene,
      revision: currentRevision,
      updatedAt: 3,
    };
    const restoredClient = clientWith(record);
    restoredClient.save = vi.fn(async () => ({
      ok: true as const,
      value: { diagram: restoredRecord, unchanged: false },
    }));
    render(
      <DiagramApp
        client={restoredClient}
        draftStorage={storage}
        sessionId="session-1"
      />,
    );

    await waitFor(() => expect(restoredClient.save).toHaveBeenCalledOnce());
    expect(restoredClient.save).toHaveBeenCalledWith(
      "session-1",
      diagramId,
      originalRevision,
      pendingScene,
    );
    expect(excalidrawHarness.initialData?.elements).toEqual(
      pendingScene.elements,
    );
    await waitFor(() => expect(storage.length).toBe(0));
  });

  it("restores the last valid draft after a later invalid scene and pagehide", async () => {
    const storage = new MemoryStorage();
    const interruptedClient = clientWith(record);
    const firstMount = render(
      <DiagramApp
        client={interruptedClient}
        draftStorage={storage}
        sessionId="session-1"
      />,
    );
    expect(
      await screen.findByRole("heading", { name: "Runtime" }),
    ).toBeTruthy();

    act(() => {
      excalidrawHarness.onChange?.(
        pendingScene.elements,
        pendingScene.appState,
        pendingScene.files,
      );
      excalidrawHarness.onChange?.(
        [{ ...pendingScene.elements[0], type: "image" }],
        pendingScene.appState,
        pendingScene.files,
      );
      globalThis.dispatchEvent(new Event("pagehide"));
    });
    expect(
      readPendingDiagramDraft(
        storage,
        "session-1",
        DEFAULT_DIAGRAM_VALIDATION_POLICY,
      ),
    ).toMatchObject({
      diagramId,
      expectedRevision: originalRevision,
      scene: pendingScene,
    });
    firstMount.unmount();
    expect(interruptedClient.save).not.toHaveBeenCalled();

    const restoredRecord: DiagramRecord = {
      ...record,
      scene: pendingScene,
      revision: currentRevision,
      updatedAt: 3,
    };
    const restoredClient = clientWith(record);
    restoredClient.save = vi.fn(async () => ({
      ok: true as const,
      value: { diagram: restoredRecord, unchanged: false },
    }));
    render(
      <DiagramApp
        client={restoredClient}
        draftStorage={storage}
        sessionId="session-1"
      />,
    );

    await waitFor(() => expect(restoredClient.save).toHaveBeenCalledOnce());
    expect(restoredClient.save).toHaveBeenCalledWith(
      "session-1",
      diagramId,
      originalRevision,
      pendingScene,
    );
    expect(excalidrawHarness.initialData?.elements).toEqual(
      pendingScene.elements,
    );
    await waitFor(() => expect(storage.length).toBe(0));
  });

  it("keeps a restored local draft when its original revision is stale", async () => {
    const storage = new MemoryStorage();
    writePendingDiagramDraft(storage, {
      version: 1,
      sessionId: "session-1",
      diagramId,
      expectedRevision: originalRevision,
      scene: pendingScene,
    });
    const currentRecord: DiagramRecord = {
      ...record,
      revision: currentRevision,
      updatedAt: 3,
    };
    const client = clientWith(currentRecord);
    client.save = vi.fn(async () => ({
      ok: false as const,
      error: { code: "version-conflict" as const, current: currentRecord },
    }));

    render(
      <DiagramApp
        client={client}
        draftStorage={storage}
        sessionId="session-1"
      />,
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "版本冲突",
    );
    expect(client.save).toHaveBeenCalledWith(
      "session-1",
      diagramId,
      originalRevision,
      pendingScene,
    );
    expect(excalidrawHarness.initialData?.elements).toEqual(
      pendingScene.elements,
    );
    expect(storage.length).toBe(1);
  });

  it("restores a capacity-failed draft after switching diagrams", async () => {
    const storage = new MemoryStorage();
    const capacityClient = clientWith(record);
    capacityClient.list = vi.fn(async () => ({
      ok: true as const,
      value: {
        diagrams: [summary, secondSummary],
        limits: {
          autosaveDebounceMs: 1,
          validationPolicy: { ...DEFAULT_DIAGRAM_VALIDATION_POLICY },
        },
      },
    }));
    capacityClient.get = vi.fn(async (_sessionId, selectedId) => ({
      ok: true as const,
      value: { diagram: selectedId === secondDiagramId ? secondRecord : record },
    }));
    capacityClient.save = vi.fn(async () => ({
      ok: false as const,
      error: {
        code: "storage-capacity" as const,
        scope: "global-bytes" as const,
        limitBytes: 1_048_576,
      },
    }));
    const firstMount = render(
      <DiagramApp
        client={capacityClient}
        draftStorage={storage}
        sessionId="session-1"
      />,
    );
    expect(
      await screen.findByRole("heading", { name: "Runtime" }),
    ).toBeTruthy();

    act(() => {
      excalidrawHarness.onChange?.(
        pendingScene.elements,
        pendingScene.appState,
        pendingScene.files,
      );
    });
    expect(
      await screen.findByText(/存储容量已满，先导出本地副本/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Details/ }));
    expect(
      await screen.findByRole("heading", { name: "Details" }),
    ).toBeTruthy();
    expect(
      readPendingDiagramDraft(
        storage,
        "session-1",
        DEFAULT_DIAGRAM_VALIDATION_POLICY,
      ),
    ).toMatchObject({
      diagramId,
      expectedRevision: originalRevision,
      scene: pendingScene,
    });
    firstMount.unmount();

    const restoredRecord: DiagramRecord = {
      ...record,
      scene: pendingScene,
      revision: currentRevision,
      updatedAt: 3,
    };
    const restoredClient = clientWith(record);
    restoredClient.list = vi.fn(async () => ({
      ok: true as const,
      value: {
        diagrams: [secondSummary, summary],
        limits: {
          autosaveDebounceMs: 800,
          validationPolicy: { ...DEFAULT_DIAGRAM_VALIDATION_POLICY },
        },
      },
    }));
    restoredClient.get = vi.fn(async (_sessionId, selectedId) => ({
      ok: true as const,
      value: { diagram: selectedId === secondDiagramId ? secondRecord : record },
    }));
    restoredClient.save = vi.fn(async () => ({
      ok: true as const,
      value: { diagram: restoredRecord, unchanged: false },
    }));
    render(
      <DiagramApp
        client={restoredClient}
        draftStorage={storage}
        sessionId="session-1"
      />,
    );

    await waitFor(() => expect(restoredClient.save).toHaveBeenCalledOnce());
    expect(restoredClient.save).toHaveBeenCalledWith(
      "session-1",
      diagramId,
      originalRevision,
      pendingScene,
    );
    expect(
      await screen.findByRole("heading", { name: "Runtime" }),
    ).toBeTruthy();
    await waitFor(() => expect(storage.length).toBe(0));
  });

  it("contains disabled or quota-exceeded storage errors", () => {
    const unavailable = {
      getItem: () => {
        throw new DOMException("disabled", "SecurityError");
      },
      removeItem: () => {
        throw new DOMException("disabled", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    } as unknown as Storage;

    expect(() =>
      writePendingDiagramDraft(unavailable, {
        version: 1,
        sessionId: "session-1",
        diagramId,
        expectedRevision: originalRevision,
        scene: pendingScene,
      }),
    ).not.toThrow();
    expect(
      readPendingDiagramDraft(
        unavailable,
        "session-1",
        DEFAULT_DIAGRAM_VALIDATION_POLICY,
      ),
    ).toBeNull();
    expect(() =>
      clearPendingDiagramDraft(unavailable, {
        sessionId: "session-1",
        diagramId,
      }),
    ).not.toThrow();
  });
});

function createScene(x: number): PersistedScene {
  return {
    elements: [
      {
        id: "node-1",
        type: "rectangle",
        x,
        y: 20,
        width: 160,
        height: 80,
        link: null,
      },
    ],
    appState: { viewBackgroundColor: "#ffffff" },
    files: {},
  };
}

function clientWith(diagram: DiagramRecord): DiagramRpcClient {
  return {
    validationPolicy: DEFAULT_DIAGRAM_VALIDATION_POLICY,
    list: vi.fn(async () => ({
      ok: true as const,
      value: {
        diagrams: [{ ...summary, revision: diagram.revision }],
        limits: {
          autosaveDebounceMs: 800,
          validationPolicy: { ...DEFAULT_DIAGRAM_VALIDATION_POLICY },
        },
      },
    })),
    get: vi.fn(async () => ({ ok: true as const, value: { diagram } })),
    save: vi.fn(async () => ({
      ok: true as const,
      value: { diagram, unchanged: true },
    })),
  };
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
