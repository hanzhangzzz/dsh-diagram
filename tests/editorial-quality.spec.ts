import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createDiagramSpecSchema, DEFAULT_DIAGRAM_VALIDATION_POLICY } from "../src/core/contracts.ts";
import { layoutDiagram, EDGE_LABEL_BOX_HEIGHT, edgeLabelBoxWidth, edgeLabelBoxHeight, textWidth, REPORT_GROUP_FONT_SIZE } from "../src/core/layout.ts";
import { groupPalette, tonePalette, visualTokens } from "../src/editor/visual-style.ts";

const source = readFileSync(new URL("./fixtures/visual-review.json", import.meta.url));
const fixtures = JSON.parse(source.toString()) as {
  cases: Array<{ id: string; spec: unknown }>;
};
const cases = fixtures.cases.map((item) => ({
  id: item.id,
  spec: createDiagramSpecSchema(DEFAULT_DIAGRAM_VALIDATION_POLICY).parse(item.spec),
}));

describe("frozen editorial acceptance cases", () => {
  it("keeps the live model's edge labels clear of report section headings", () => {
    const input = JSON.parse(readFileSync(new URL("./fixtures/live-review-regression.json", import.meta.url), "utf8")) as { spec: unknown };
    const spec = createDiagramSpecSchema(DEFAULT_DIAGRAM_VALIDATION_POLICY).parse(input.spec);
    const layout = layoutDiagram(spec);
    for (const edge of layout.edges) {
      if (edge.labelAnchor === undefined || edge.label === undefined) continue;
      const { x, y } = edge.labelAnchor;
      const w = edgeLabelBoxWidth(edge.label);
      const h = edgeLabelBoxHeight(edge.label);
      for (const group of layout.groups) {
        const gw = textWidth(group.label, REPORT_GROUP_FONT_SIZE);
        const gx = group.x + (group.width - gw) / 2;
        const gy = group.y + (64 - 25) / 2;
        const overlap = Math.min(x+w/2, gx+gw) - Math.max(x-w/2, gx) > 1
          && Math.min(y+h/2, gy+25) - Math.max(y-h/2, gy) > 1;
        expect(overlap, `${edge.label} overlaps heading ${group.label}`).toBe(false);
      }
    }
  });
  it("keeps the pre-upgrade inputs unchanged", () => {
    expect(createHash("sha256").update(source).digest("hex"))
      .toBe("c78c467ba52efa45dc641db8f8a03c2e7d7c5f0f3228b28ef7302c56ac8b1421");
  });

  for (const { id, spec } of cases) {
    it(`${id} preserves every node, edge, label, and group deterministically`, () => {
      const layout = layoutDiagram(spec);
      expect(layoutDiagram(spec)).toEqual(layout);
      expect(layout.nodes.map(({ id, label, detail }) => ({ id, label, detail })))
        .toEqual(spec.nodes.map(({ id, label, detail }) => ({ id, label, detail })));
      expect(layout.edges.map(({ from, to, label }) => ({ from, to, label })))
        .toEqual(spec.edges.map(({ from, to, label }) => ({ from, to, label })));
      expect(layout.groups.map(({ id, label }) => ({ id, label })))
        .toEqual((spec.groups ?? []).map(({ id, label }) => ({ id, label })));
      for (const [index, node] of layout.nodes.entries()) {
        for (const other of layout.nodes.slice(index + 1)) {
          const overlap = Math.min(node.x + node.width, other.x + other.width) > Math.max(node.x, other.x)
            && Math.min(node.y + node.height, other.y + other.height) > Math.max(node.y, other.y);
          expect(overlap, `${node.id} overlaps ${other.id}`).toBe(false);
        }
      }
      for (const edge of layout.edges) {
        if (edge.labelAnchor === undefined || edge.label === undefined) continue;
        const { x, y } = edge.labelAnchor;
        const halfWidth = edgeLabelBoxWidth(edge.label) / 2;
        const halfHeight = edgeLabelBoxHeight(edge.label) / 2;
        for (const node of layout.nodes) {
          const overlap = Math.min(x + halfWidth, node.x + node.width) - Math.max(x - halfWidth, node.x) > 1
            && Math.min(y + halfHeight, node.y + node.height) - Math.max(y - halfHeight, node.y) > 1;
          expect(overlap, `${id}/${edge.id} label overlaps ${node.id}`).toBe(false);
        }
      }
    });
  }

  it("fits the eight-step flow into a readable two-dimensional composition", () => {
    const layout = layoutDiagram(cases[0]!.spec);
    expect(layout.width).toBeLessThanOrEqual(1_400);
    expect(layout.height).toBeLessThanOrEqual(1_100);
  });

  it("keeps labels adjacent to their own route instead of marooning them in whitespace", () => {
    for (const { id, spec } of cases) {
      for (const edge of layoutDiagram(spec).edges) {
        if (edge.label === undefined || edge.labelAnchor === undefined) continue;
        const { x, y } = edge.labelAnchor;
        const width = edgeLabelBoxWidth(edge.label);
        const near = edge.points.slice(1).some((b, index) => {
          const a = edge.points[index]!;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const t = Math.max(0, Math.min(1, ((x-a.x)*dx + (y-a.y)*dy) / (dx*dx + dy*dy || 1)));
          const px = a.x + t*dx;
          const py = a.y + t*dy;
          return Math.hypot(Math.max(0, Math.abs(x-px)-width/2), Math.max(0, Math.abs(y-py)-EDGE_LABEL_BOX_HEIGHT/2)) <= 20;
        });
        expect(near, `${id}/${edge.id}: label detached from route`).toBe(true);
      }
    }
  });

  it("does not assign a category meaning just because a group is first or second", () => {
    expect(groupPalette(0)).toEqual(groupPalette(1));
    expect(groupPalette(1)).toEqual(groupPalette(5));
    expect(tonePalette("risk")).not.toEqual(tonePalette("neutral"));
    expect(visualTokens("sketchnote").background).toBe("#fffdf7");
    expect(visualTokens("sketchnote").handwritten).toBe(true);
  });
});
