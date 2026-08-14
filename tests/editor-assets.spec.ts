import { describe, expect, it } from "vitest";

import {
  configureExcalidrawAssets,
  EXCALIDRAW_ASSET_PATH,
  type ExcalidrawAssetTarget,
} from "../src/editor/excalidrawAssets.ts";

describe("Excalidraw assets", () => {
  it("pins runtime assets to the same-origin editor route", () => {
    const target: ExcalidrawAssetTarget = {};

    configureExcalidrawAssets(target);

    expect(EXCALIDRAW_ASSET_PATH).toBe("/diagram-assets/");
    expect(target.EXCALIDRAW_ASSET_PATH).toBe("/diagram-assets/");
  });
});
