import { describe, expect, it } from "vitest";
import { fitContentViewport } from "../src/editor/viewport.ts";

describe("canvas content fit", () => {
  it("opens a tall detail index at reading width rather than shrinking it to height", () => {
    const bounds = [24, 900, 1256, 3200] as const;
    const size = {width:1440,height:900};
    const fitted=fitContentViewport(bounds,size)!;
    const reading=fitContentViewport(bounds,size,"read")!;
    expect(reading.zoom).toBe(1);
    expect(reading.zoom).toBeGreaterThan(fitted.zoom);
    expect((bounds[1]+reading.scrollY)*reading.zoom).toBe(104);
  });
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

it("keeps a wide diagram readable from its top-left instead of shrinking text to fit", () => {
  const bounds=[-120,-80,2400,1200] as const;
  const view=fitContentViewport(bounds,{width:900,height:600},"read")!;
  expect(view.zoom).toBeGreaterThanOrEqual(0.75);
  expect((bounds[0]+view.scrollX)*view.zoom).toBeCloseTo(40);
  expect((bounds[1]+view.scrollY)*view.zoom).toBeCloseTo(104);
});
