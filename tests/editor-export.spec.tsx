import { describe, expect, it, vi } from "vitest";

import type { PersistedScene } from "../src/core/contracts.ts";

const mocks = vi.hoisted(() => ({
  exportToBlob: vi.fn(async () => new Blob(["png"], { type: "image/png" })),
  exportToSvg: vi.fn(async () => ({ outerHTML: "<svg><rect /></svg>" })),
  serializeAsJSON: vi.fn(() => '{"type":"excalidraw","version":2}'),
}));

vi.mock("@excalidraw/excalidraw", () => ({
  exportToBlob: mocks.exportToBlob,
  exportToSvg: mocks.exportToSvg,
  serializeAsJSON: mocks.serializeAsJSON,
}));

import {
  createDiagramExport,
  safeExportBaseName,
} from "../src/editor/export.ts";

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

describe("diagram export", () => {
  it("builds editable Excalidraw, SVG, and PNG files from one validated scene", async () => {
    const editable = await createDiagramExport("excalidraw", "Runtime / Canvas", scene);
    const svg = await createDiagramExport("svg", "Runtime / Canvas", scene);
    const png = await createDiagramExport("png", "Runtime / Canvas", scene);

    expect(editable.filename).toBe("Runtime-Canvas.excalidraw");
    expect(await editable.blob.text()).toContain('"type":"excalidraw"');
    expect(svg.filename).toBe("Runtime-Canvas.svg");
    expect(await svg.blob.text()).toContain("<svg>");
    expect(png.filename).toBe("Runtime-Canvas.png");
    expect(png.blob.type).toBe("image/png");
    expect(mocks.serializeAsJSON).toHaveBeenCalledOnce();
    expect(mocks.exportToSvg).toHaveBeenCalledOnce();
    expect(mocks.exportToBlob).toHaveBeenCalledOnce();
  });

  it("sanitizes unsafe filenames without hiding the diagram identity", () => {
    expect(safeExportBaseName('  A\\B/:*?"<>|  ')).toBe("A-B");
    expect(safeExportBaseName("   ")).toBe("diagram");
  });
});
