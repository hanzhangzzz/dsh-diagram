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
  it("renders stable semantic tones and solid outcomes independent of group order", () => {
    const spec: DiagramSpec = {
      kind: "report",
      title: "Semantic color",
      groups: [
        {
          id: "evidence",
          label: "Evidence",
          placement: "main",
          tone: "evidence",
        },
        {
          id: "gate",
          label: "Gate",
          placement: "main",
          tone: "risk",
        },
        {
          id: "target",
          label: "Target",
          placement: "bottom",
          tone: "target",
          direction: "row",
        },
      ],
      nodes: [
        { id: "proof", label: "Run log", group: "evidence" },
        { id: "gap", label: "Missing", group: "gate" },
        {
          id: "block",
          label: "Block merge",
          group: "target",
          variant: "solid",
        },
      ],
      edges: [{ from: "proof", to: "gap" }, { from: "gap", to: "block" }],
    };

    const skeletons = diagramToElementSkeletons(layoutDiagram(spec));

    expect(skeletons.find((element) => element.id === "group:evidence"))
      .toMatchObject({ strokeColor: "#7e22ce", backgroundColor: "#fcfaff" });
    expect(skeletons.find((element) => element.id === "group:gate"))
      .toMatchObject({ strokeColor: "#dc2626", backgroundColor: "#fffafa" });
    expect(skeletons.find((element) => element.id === "node:block"))
      .toMatchObject({ strokeColor: "#166534", backgroundColor: "#166534" });
    expect(skeletons.find((element) => element.id === "text:node:block"))
      .toMatchObject({ strokeColor: "#ffffff" });
  });

  it("preserves semantic group tones outside the report recipe", () => {
    const skeletons = diagramToElementSkeletons(layoutDiagram({
      kind: "architecture",
      title: "服务风险",
      groups: [{ id: "risk", label: "风险边界", tone: "risk" }],
      nodes: [{ id: "failure", label: "单点故障", group: "risk" }],
      edges: [],
    }));

    expect(skeletons.find((element) => element.id === "group:risk"))
      .toMatchObject({ strokeColor: "#dc2626", backgroundColor: "#fffafa" });
  });

  it("uses a readable report typography hierarchy instead of legacy node sizes", () => {
    const spec: DiagramSpec = {
      kind: "report",
      title: "事实架构",
      summary: "当前事实与目标闭环",
      groups: [
        { id: "facts", label: "1 事实面", placement: "main", tone: "evidence" },
      ],
      nodes: [
        {
          id: "detail",
          label: "平台产物",
          detail: "运行详情 · 断言 · 日志",
          group: "facts",
        },
        {
          id: "metric",
          label: "117 条",
          group: "facts",
          variant: "compact",
        },
      ],
      edges: [],
    };

    const skeletons = diagramToElementSkeletons(layoutDiagram(spec));

    expect(skeletons.find((element) => element.id === "diagram:title"))
      .toMatchObject({ fontSize: 36 });
    expect(skeletons.find((element) => element.id === "diagram:summary"))
      .toMatchObject({ fontSize: 18 });
    expect(skeletons.find((element) => element.id === "text:group:facts"))
      .toMatchObject({ fontSize: 20 });
    expect(skeletons.find((element) => element.id === "text:node:detail"))
      .toMatchObject({ fontSize: 18 });
    expect(skeletons.find((element) => element.id === "detail:node:detail"))
      .toMatchObject({ fontSize: 14 });
    expect(skeletons.find((element) => element.id === "text:node:metric"))
      .toMatchObject({ fontSize: 14 });
  });

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

  it("centers the converter-measured label and detail as one native text cluster", () => {
    const spec: DiagramSpec = {
      kind: "flow",
      title: "Native text",
      nodes: [
        { id: "fact", label: "真实尺寸", detail: "双击前后不跳位" },
      ],
      edges: [],
    };
    const layout = layoutDiagram(spec);
    const positionedNode = layout.nodes[0];
    const scene = createInitialScene(spec, DEFAULT_DIAGRAM_VALIDATION_POLICY);
    const rectangle = scene.elements.find((element) => element.id === "node:fact");
    const label = scene.elements.find((element) => element.id === "text:node:fact");
    const detail = scene.elements.find((element) => element.id === "detail:node:fact");

    expect(positionedNode).toBeDefined();
    expect(rectangle).toBeDefined();
    expect(label).toMatchObject({
      textAlign: "center",
      verticalAlign: "middle",
      width: 100,
      height: 24,
    });
    expect(detail).toMatchObject({
      textAlign: "center",
      verticalAlign: "middle",
      width: 100,
      height: 24,
    });
    expect(label?.x).toBe(
      (rectangle?.x ?? 0) + ((rectangle?.width ?? 0) - 100) / 2,
    );
    expect(detail?.x).toBe(
      (rectangle?.x ?? 0) + ((rectangle?.width ?? 0) - 100) / 2,
    );
    const clusterHeight = 24 + 4 + 24;
    const clusterY = (rectangle?.y ?? 0)
      + ((rectangle?.height ?? 0) - clusterHeight) / 2;
    expect(label?.y).toBe(clusterY);
    expect(detail?.y).toBe(clusterY + 24 + 4);
  });

  it("centers report headings from converter-measured native text geometry", () => {
    const spec: DiagramSpec = {
      kind: "report",
      title: "发布事实架构",
      summary: "事实 → 证据 → Merge 门",
      groups: [
        { id: "facts", label: "1 事实面", placement: "main" },
      ],
      nodes: [{ id: "fact", label: "当前行为", group: "facts" }],
      edges: [],
    };
    const layout = layoutDiagram(spec);
    const group = layout.groups[0];
    const scene = createInitialScene(spec, DEFAULT_DIAGRAM_VALIDATION_POLICY);
    const title = scene.elements.find((element) => element.id === "diagram:title");
    const summary = scene.elements.find(
      (element) => element.id === "diagram:summary",
    );
    const groupLabel = scene.elements.find(
      (element) => element.id === "text:group:facts",
    );

    expect(group).toBeDefined();
    expect(title).toMatchObject({
      x: (layout.width - 100) / 2,
      y: -52,
      textAlign: "center",
      verticalAlign: "middle",
    });
    expect(summary).toMatchObject({
      x: (layout.width - 100) / 2,
      y: -16,
      textAlign: "center",
      verticalAlign: "middle",
    });
    expect(groupLabel).toMatchObject({
      x: (group?.x ?? 0) + ((group?.width ?? 0) - 100) / 2,
      y: (group?.y ?? 0) + (64 - 24) / 2,
      textAlign: "center",
      verticalAlign: "middle",
    });
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
