import { afterEach, describe, expect, it, vi } from "vitest";

import type { PersistedScene } from "../src/core/contracts.ts";
import {
  SceneAutosaveController,
  serializeSceneContent,
  type SaveAttempt,
} from "../src/editor/autosave.ts";

const scene = (x: number): PersistedScene => ({
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
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SceneAutosaveController", () => {
  it("does not republish saved state when the editor echoes persisted content", () => {
    const onStatus = vi.fn();
    const initialScene = scene(10);
    const controller = new SceneAutosaveController({
      debounceMs: 800,
      initialRevision: "r1",
      initialScene,
      save: vi.fn(),
      onStatus,
    });

    controller.accept(initialScene);
    controller.accept(initialScene);

    expect(onStatus).not.toHaveBeenCalled();
    void controller.dispose();
  });

  it("debounces saves and skips content already persisted", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (): Promise<SaveAttempt> => ({
      kind: "saved",
      revision: "r2",
    }));
    const statuses: string[] = [];
    const controller = new SceneAutosaveController({
      debounceMs: 800,
      initialRevision: "r1",
      initialScene: null,
      save,
      onStatus: (status) => statuses.push(status.kind),
    });

    controller.accept(scene(10));
    await vi.advanceTimersByTimeAsync(799);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(scene(10), "r1");
    expect(controller.revision).toBe("r2");
    expect(statuses).toContain("saving");
    expect(statuses.at(-1)).toBe("saved");

    controller.accept(scene(10));
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("retains the local draft when CAS reports a version conflict", async () => {
    vi.useFakeTimers();
    const local = scene(50);
    const server = scene(90);
    const controller = new SceneAutosaveController({
      debounceMs: 1,
      initialRevision: "r1",
      initialScene: scene(0),
      save: async () => ({
        kind: "conflict",
        currentRevision: "r2",
      }),
      onStatus: () => undefined,
    });

    controller.accept(local);
    await vi.advanceTimersByTimeAsync(1);

    expect(controller.status).toMatchObject({
      kind: "conflict",
      currentRevision: "r2",
    });
    expect(controller.localDraft).toEqual(local);

    controller.reset(server, "r2");
    expect(controller.localDraft).toBeNull();
    expect(controller.revision).toBe("r2");
    expect(controller.status.kind).toBe("saved");
    controller.dispose();
  });

  it("pauses a pending save but retains its last valid draft when the current scene becomes invalid", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (): Promise<SaveAttempt> => ({
      kind: "saved",
      revision: "r2",
    }));
    const controller = new SceneAutosaveController({
      debounceMs: 50,
      initialRevision: "r1",
      initialScene: null,
      save,
      onStatus: () => undefined,
    });

    controller.accept(scene(10));
    controller.reject("删除图片后会继续自动保存");
    controller.retry();
    await vi.advanceTimersByTimeAsync(50);

    expect(save).not.toHaveBeenCalled();
    expect(controller.localDraft).toEqual(scene(10));
    expect(controller.status).toEqual({
      kind: "invalid",
      message: "删除图片后会继续自动保存",
    });
    controller.dispose();
  });

  it("resumes autosave when an invalid scene returns to the last valid draft", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (): Promise<SaveAttempt> => ({
      kind: "saved",
      revision: "r2",
    }));
    const controller = new SceneAutosaveController({
      debounceMs: 50,
      initialRevision: "r1",
      initialScene: null,
      save,
      onStatus: () => undefined,
    });

    controller.accept(scene(10));
    controller.reject("删除图片后会继续自动保存");
    controller.accept(scene(10));
    await vi.advanceTimersByTimeAsync(50);

    expect(save).toHaveBeenCalledOnce();
    expect(controller.status.kind).toBe("saved");
  });

  it("attempts the pending CAS write before disposal completes", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (): Promise<SaveAttempt> => ({
      kind: "saved",
      revision: "r2",
    }));
    const controller = new SceneAutosaveController({
      debounceMs: 800,
      initialRevision: "r1",
      initialScene: null,
      save,
      onStatus: () => undefined,
    });

    controller.accept(scene(25));
    await controller.dispose();

    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith(scene(25), "r1");
  });
});

describe("serializeSceneContent", () => {
  it("changes only when persisted content changes", () => {
    expect(serializeSceneContent(scene(1))).toBe(serializeSceneContent(scene(1)));
    expect(serializeSceneContent(scene(1))).not.toBe(
      serializeSceneContent(scene(2)),
    );
  });

  it("does not deduplicate distinct scenes that collide under the former FNV hash", async () => {
    const first = collisionScene("f8a046d1b3a0b0e62d62b837");
    const second = collisionScene("2b3b23df6214b116b1fcdbce");
    expect(legacySceneContentHash(first)).toBe(legacySceneContentHash(second));
    expect(serializeSceneContent(first)).not.toBe(serializeSceneContent(second));
    const save = vi.fn(async (): Promise<SaveAttempt> => ({
      kind: "saved",
      revision: "r2",
    }));
    const controller = new SceneAutosaveController({
      debounceMs: 800,
      initialRevision: "r1",
      initialScene: first,
      save,
      onStatus: () => undefined,
    });

    controller.accept(second);
    await controller.dispose();

    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith(second, "r1");
  });
});

function collisionScene(text: string): PersistedScene {
  return {
    elements: [
      { id: "x", type: "text", x: 0, y: 0, width: 1, height: 1, text },
    ],
    appState: {},
    files: {},
  };
}

function legacySceneContentHash(value: PersistedScene): string {
  const serialized = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${serialized.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}
