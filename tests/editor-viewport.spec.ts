import { describe, expect, it } from "vitest";
import { fitContentViewport } from "../src/editor/viewport.ts";

describe("canvas content fit", () => {
  for (const size of [{ width: 976, height: 626 }, { width: 375, height: 560 }]) {
    it(`keeps the report title and last row clear of controls at ${size.width}px`, () => {
      const bounds = [-20, -100, 1052, 686] as const;
      const view = fitContentViewport(bounds, size)!;
      expect((bounds[0] + view.scrollX) * view.zoom).toBeGreaterThanOrEqual(20);
      expect((bounds[1] + view.scrollY) * view.zoom).toBeGreaterThanOrEqual(100);
      expect((bounds[2] + view.scrollX) * view.zoom).toBeLessThanOrEqual(size.width - 20);
      expect((bounds[3] + view.scrollY) * view.zoom).toBeLessThanOrEqual(size.height - 55);
      expect(view.zoom).toBeLessThanOrEqual(1);
    });
  }
  it("waits for a measured viewport instead of fitting an unmounted editor", () => {
    expect(fitContentViewport([0, 0, 100, 100], { width: 0, height: 0 })).toBeNull();
    expect(fitContentViewport([NaN, 0, 100, 100], { width: 900, height: 600 })).toBeNull();
  });
});
