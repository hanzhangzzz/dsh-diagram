import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createDiagramSpecSchema,
  DEFAULT_DIAGRAM_VALIDATION_POLICY as policy,
  type DiagramSpec,
} from "../src/core/contracts.ts";
import { atlasSkeletons, atlasViewElements } from "../src/editor/atlas.ts";
const base: DiagramSpec = {
  kind: "hierarchy",
  composition: "atlas",
  title: "分类与完整条目",
  nodes: [
    { id: "root", label: "整体" },
    { id: "a", label: "第一类" },
    { id: "b", label: "第二类" },
    { id: "x", label: "细节甲", detail: "限定不可丢" },
    { id: "y", label: "细节乙" },
  ],
  edges: [
    { from: "root", to: "a" },
    { from: "root", to: "b" },
    { from: "a", to: "x", label: "包含" },
    { from: "b", to: "y" },
  ],
};
describe("editable overview and detail atlas", () => {
  it("keeps legal colon-containing source IDs distinct from description IDs", () => {
    const spec = {
      ...base,
      nodes: [...base.nodes, { id: "x:detail", label: "另一条" }],
      edges: [...base.edges, { from: "a", to: "x:detail" }],
    };
    const elements = atlasSkeletons(spec);
    expect(new Set(elements.map((e) => e.id)).size).toBe(elements.length);
    expect(
      atlasViewElements(elements, "detail").some(
        (e) => e.id === "detail-description:detail:entry:x",
      ),
    ).toBe(true);
  });
  it("fits saved panel elements without regenerating user edits", () => {
    const items = [
      { id: "overview:root:label", text: "手改内容" },
      { id: "panel:detail" },
      { id: "detail:entry:b", text: "细节" },
    ];
    expect(atlasViewElements(items, "overview")).toEqual([items[0]]);
    expect(atlasViewElements(items, "detail")).toEqual(items.slice(1));
    expect(atlasViewElements([items[0]!], "detail")).toEqual([items[0]]);
  });
  it("keeps the reviewed input frozen and all 40 terminal entries present", () => {
    const bytes = readFileSync(
      new URL("./fixtures/atlas-iso25010.json", import.meta.url),
    );
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "cfb5624ec8fe954961e89ff384f5e6b668e053a575c8efd40079566a255e5ed6",
    );
    const spec = createDiagramSpecSchema(policy).parse({
      ...JSON.parse(bytes.toString()),
      composition: "atlas",
    });
    const elements = atlasSkeletons(spec);
    expect(
      createDiagramSpecSchema({
        ...policy,
        maxSceneElements: elements.length,
      }).safeParse(spec).success,
    ).toBe(true);
    expect(
      createDiagramSpecSchema({
        ...policy,
        maxSceneElements: elements.length - 1,
      }).safeParse(spec).success,
    ).toBe(false);
    expect(elements.filter((e) => e.id.startsWith("mark:"))).toHaveLength(40);
    expect(
      elements.filter((e) => e.id.startsWith("detail:entry:")),
    ).toHaveLength(40);
    expect(elements.length).toBeLessThan(policy.maxSceneElements);
  });
  it("accepts only a connected root / category / entry tree without hiding other relationships", () => {
    const schema = createDiagramSpecSchema(policy);
    expect(schema.safeParse(base).success).toBe(true);
    for (const spec of [
      { ...base, kind: "flow" },
      { ...base, edges: [...base.edges, { from: "x", to: "y" }] },
      { ...base, nodes: [...base.nodes, { id: "orphan", label: "孤立" }] },
      {
        ...base,
        edges: [
          { from: "a", to: "b" },
          { from: "b", to: "a" },
          { from: "a", to: "x" },
          { from: "b", to: "y" },
        ],
      },
      {
        ...base,
        nodes: [...base.nodes, { id: "deep", label: "第四层" }],
        edges: [...base.edges, { from: "x", to: "deep" }],
      },
    ])
      expect(schema.safeParse(spec).success).toBe(false);
  });
  it("is deterministic, preserves all full text and edge labels, and counts leaves from actual input", () => {
    const a = atlasSkeletons(base);
    expect(atlasSkeletons(base)).toEqual(a);
    expect(new Set(a.map((e) => e.id)).size).toBe(a.length);
    const text = a
      .filter((e) => e.type === "text")
      .map((e) => e.text)
      .join("\n");
    for (const n of base.nodes) {
      expect(text).toContain(n.label);
      if (n.detail) expect(text).toContain(n.detail);
    }
    expect(text).toContain("包含");
    expect(a.filter((e) => e.id.startsWith("mark:"))).toHaveLength(2);
    expect(a.every((e) => ["rectangle", "text", "line"].includes(e.type))).toBe(
      true,
    );
    expect(
      a.filter((e) => e.type === "text").every((e) => Number(e.fontSize) >= 14),
    ).toBe(true);
  });
  it("does not truncate long labels or details and grows rows instead of shrinking type", () => {
    const long = {
      ...base,
      nodes: base.nodes.map((n) =>
        n.id === "x"
          ? {
              ...n,
              label: "很长的中文概念".repeat(18),
              detail: "需要保留的限定和证据".repeat(30),
            }
          : n,
      ),
    };
    const result = atlasSkeletons(long);
    const texts = result
      .filter((e) => e.type === "text")
      .map((e) => String(e.text).replaceAll("\n", ""))
      .join("");
    expect(texts).toContain(long.nodes[3]!.label);
    expect(texts).toContain(long.nodes[3]!.detail!);
  });
});
