import { describe, expect, it } from "vitest";

import {
  clearCanvasDeepLink,
  readCanvasDeepLink,
  writeCanvasDeepLink,
} from "../src/core/canvas-link.ts";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

describe("canvas deep link", () => {
  it("round-trips the requested diagram for the same session", () => {
    const storage = memoryStorage();
    writeCanvasDeepLink(storage, { sessionId: "s1", diagramId: "d1" });
    expect(readCanvasDeepLink(storage, "s1")).toEqual({
      sessionId: "s1",
      diagramId: "d1",
    });
  });

  it("returns null for another session and after clearing", () => {
    const storage = memoryStorage();
    writeCanvasDeepLink(storage, { sessionId: "s1", diagramId: "d1" });
    expect(readCanvasDeepLink(storage, "s2")).toBeNull();
    clearCanvasDeepLink(storage);
    expect(readCanvasDeepLink(storage, "s1")).toBeNull();
  });

  it("rejects malformed payloads and tolerates broken storage", () => {
    const storage = memoryStorage();
    storage.setItem("dsh-diagram:canvas-link:v1", "not json");
    expect(readCanvasDeepLink(storage, "s1")).toBeNull();
    storage.setItem(
      "dsh-diagram:canvas-link:v1",
      JSON.stringify({ sessionId: "s1" }),
    );
    expect(readCanvasDeepLink(storage, "s1")).toBeNull();

    const throwing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    } as unknown as Storage;
    expect(readCanvasDeepLink(throwing, "s1")).toBeNull();
    expect(() =>
      writeCanvasDeepLink(throwing, { sessionId: "s1", diagramId: "d1" }),
    ).not.toThrow();
    expect(() => clearCanvasDeepLink(throwing)).not.toThrow();
  });

  it("stays null with absent storage", () => {
    expect(readCanvasDeepLink(null, "s1")).toBeNull();
    expect(() =>
      writeCanvasDeepLink(null, { sessionId: "s1", diagramId: "d1" }),
    ).not.toThrow();
  });
});
