import { describe, expect, it, vi } from "vitest";

vi.mock("@excalidraw/excalidraw", () => ({
  FONT_FAMILY: { Helvetica: 2 },
  convertToExcalidrawElements: (
    elements: Array<Record<string, unknown>>,
  ) =>
    elements.map((element) => ({
      width: 100,
      height: 24,
      link: null,
      ...element,
    })),
}));

import {
  DEFAULT_DIAGRAM_VALIDATION_POLICY,
  type DiagramSpec,
} from "../src/core/contracts.ts";
import {
  DETAIL_FONT_SIZE,
  layoutDiagram,
  textWidth,
  type PositionedDiagram,
} from "../src/core/layout.ts";
import {
  createInitialScene,
  diagramToElementSkeletons,
  normalizeEditorScene,
} from "../src/editor/scene.ts";

const positioned: PositionedDiagram = {
  kind: "flow",
  title: "交付流程",
  width: 600,
  height: 300,
  nodes: [
    { id: "draft", label: "草稿", x: 40, y: 80, width: 180, height: 72 },
    {
      id: "ship",
      label: "发布",
      detail: "可访问",
      emphasis: true,
      x: 360,
      y: 80,
      width: 180,
      height: 92,
    },
  ],
  edges: [
    {
      id: "edge-0",
      from: "draft",
      to: "ship",
      label: "审核通过",
      points: [
        { x: 220, y: 116 },
        { x: 360, y: 126 },
      ],
    },
  ],
  groups: [],
};

describe("diagram scene compiler", () => {
  it("builds stable editable ids and bound arrows from positioned semantics", () => {
    const first = diagramToElementSkeletons(positioned);
    const second = diagramToElementSkeletons(positioned);

    expect(second).toEqual(first);
    expect(first.find((element) => element.id === "node:draft")).toMatchObject({
      type: "rectangle",
      x: 40,
      y: 80,
    });
    expect(first.find((element) => element.id === "edge:edge-0")).toMatchObject({
      type: "arrow",
      x: 220,
      y: 116,
      points: [
        [0, 0],
        [140, 10],
      ],
      start: { id: "node:draft" },
      end: { id: "node:ship" },
    });
    expect(first.find((element) => element.id === "text:node:ship")).toMatchObject({
      type: "text",
      text: "发布",
    });
    expect(first.find((element) => element.id === "detail:node:ship")).toMatchObject({
      type: "text",
      text: "可访问",
    });
  });

  it("pre-wraps long CJK detail so no line exceeds the node interior", () => {
    const spec: DiagramSpec = {
      kind: "architecture",
      title: "换行验证",
      groups: [{ id: "band", label: "分区" }],
      nodes: [
        {
          id: "dense",
          label: "命名沿革",
          detail:
            "三个名字一个病：HT = 慢性淋巴细胞性甲状腺炎 = 自身免疫性甲状腺炎；比「自身免疫」概念早描述几十年。",
          group: "band",
        },
      ],
      edges: [],
    };

    const skeletons = diagramToElementSkeletons(layoutDiagram(spec));
    const node = skeletons.find((element) => element.id === "node:dense") as {
      width: number;
    };
    const detail = skeletons.find(
      (element) => element.id === "detail:node:dense",
    ) as { text: string };

    const lines = detail.text.split("\n");
    expect(lines.length).toBeGreaterThan(1);
    const innerWidth = node.width - 32;
    for (const line of lines) {
      expect(textWidth(line, DETAIL_FONT_SIZE)).toBeLessThanOrEqual(innerWidth);
    }
  });

  it("converts a supported spec into a storage-valid initial scene", () => {
    const spec: DiagramSpec = {
      kind: "flow",
      title: "Publish",
      nodes: [
        { id: "draft", label: "Draft" },
        { id: "publish", label: "Publish" },
      ],
      edges: [{ from: "draft", to: "publish" }],
    };

    const scene = createInitialScene(spec, DEFAULT_DIAGRAM_VALIDATION_POLICY);

    expect(scene.elements.length).toBeGreaterThanOrEqual(5);
    expect(scene.files).toEqual({});
  });
});

describe("editor scene validation", () => {
  const baseElement = {
    id: "node-1",
    type: "rectangle",
    x: 10,
    y: 20,
    width: 160,
    height: 80,
    link: null,
  };

  it("retains allowed editor state and strips transient app state", () => {
    const result = normalizeEditorScene(
      [baseElement],
      {
        viewBackgroundColor: "#ffffff",
        gridModeEnabled: true,
        collaborators: new Map([["socket", { username: "other" }]]),
      },
      {},
      DEFAULT_DIAGRAM_VALIDATION_POLICY,
    );

    expect(result).toEqual({
      ok: true,
      scene: {
        elements: [baseElement],
        appState: { viewBackgroundColor: "#ffffff", gridModeEnabled: true },
        files: {},
      },
    });
  });

  it("rejects images, embeds, files, and links with an actionable message", () => {
    const invalidScenes = [
      {
        elements: [{ ...baseElement, type: "image" }],
        files: {},
        message: "图片或嵌入内容",
      },
      {
        elements: [{ ...baseElement, link: "https://example.com" }],
        files: {},
        message: "链接",
      },
      {
        elements: [baseElement],
        files: { file: { dataURL: "data:image/png;base64,AA==" } },
        message: "图片文件",
      },
    ];

    for (const input of invalidScenes) {
      const result = normalizeEditorScene(
        input.elements,
        {},
        input.files,
        DEFAULT_DIAGRAM_VALIDATION_POLICY,
      );
      expect(result).toMatchObject({ ok: false });
      if (!result.ok) expect(result.message).toContain(input.message);
    }
  });
});
