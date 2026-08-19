// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import type { DiagramSpec, PersistedScene } from "../src/core/contracts.ts";
import {
  renderSceneSvg,
  renderSpecSvg,
} from "../src/editor/preview/render-svg.ts";

const SCENE: PersistedScene = {
  elements: [
    {
      id: "box",
      type: "rectangle",
      x: 10,
      y: 20,
      width: 200,
      height: 80,
      strokeColor: "#2563eb",
      backgroundColor: "#f8fbff",
      fillStyle: "solid",
      roundness: { type: 3 },
    },
    {
      id: "label",
      type: "text",
      x: 30,
      y: 40,
      width: 160,
      height: 40,
      text: "第一行\n<script>alert(1)</script>",
      fontSize: 16,
      textAlign: "center",
    },
    {
      id: "edge",
      type: "arrow",
      x: 210,
      y: 60,
      width: 90,
      height: 0,
      points: [
        [0, 0],
        [90, 0],
      ],
      strokeColor: "#64748b",
    },
    {
      id: "gone",
      type: "ellipse",
      x: 900,
      y: 900,
      width: 50,
      height: 50,
      isDeleted: true,
    },
  ],
  appState: { viewBackgroundColor: "#ffffff" },
  files: {},
} as unknown as PersistedScene;

const SPEC: DiagramSpec = {
  kind: "flow",
  title: "示例流程",
  nodes: [
    { id: "a", label: "开始" },
    { id: "b", label: "结束", detail: "带说明" },
  ],
  edges: [{ from: "a", to: "b", label: "推进" }],
};

describe("renderSceneSvg", () => {
  it("renders shapes, text, and arrows inside a covering viewBox", () => {
    const svg = renderSceneSvg(document, SCENE);

    expect(svg.tagName.toLowerCase()).toBe("svg");
    const rect = svg.querySelector("rect[data-element-id='box']");
    expect(rect?.getAttribute("fill")).toBe("#f8fbff");
    expect(rect?.getAttribute("stroke")).toBe("#2563eb");

    const texts = [...svg.querySelectorAll("text[data-element-id='label'] tspan")];
    expect(texts.map((line) => line.textContent)).toEqual([
      "第一行",
      "<script>alert(1)</script>",
    ]);
    expect(svg.querySelector("script")).toBeNull();

    expect(svg.querySelector("[data-element-id='edge']")).not.toBeNull();

    const viewBox = svg.getAttribute("viewBox")?.split(" ").map(Number) ?? [];
    expect(viewBox).toHaveLength(4);
    expect(viewBox[0]).toBeLessThanOrEqual(10);
    expect((viewBox[0] ?? 0) + (viewBox[2] ?? 0)).toBeGreaterThanOrEqual(300);
  });

  it("skips deleted elements", () => {
    const svg = renderSceneSvg(document, SCENE);
    expect(svg.querySelector("[data-element-id='gone']")).toBeNull();
  });
});

describe("renderSpecSvg", () => {
  it("renders the deterministic layout with nodes, edge, labels, and title", () => {
    const svg = renderSpecSvg(document, SPEC);

    const nodeRects = svg.querySelectorAll("rect[data-node-id]");
    expect(nodeRects).toHaveLength(2);
    const textContent = svg.textContent ?? "";
    expect(textContent).toContain("开始");
    expect(textContent).toContain("结束");
    expect(textContent).toContain("带说明");
    expect(textContent).toContain("推进");
    expect(textContent).toContain("示例流程");
    expect(svg.querySelector("[data-edge-index='0']")).not.toBeNull();
  });

  it("renders grouped architecture containers", () => {
    const spec: DiagramSpec = {
      kind: "architecture",
      title: "分层",
      nodes: [
        { id: "a", label: "A", group: "g1" },
        { id: "b", label: "B", group: "g1" },
      ],
      edges: [{ from: "a", to: "b" }],
      groups: [{ id: "g1", label: "第一层" }],
    };
    const svg = renderSpecSvg(document, spec);
    expect(svg.querySelector("rect[data-group-id='g1']")).not.toBeNull();
    expect(svg.textContent).toContain("第一层");
  });
});
