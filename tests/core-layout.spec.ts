import { describe, expect, it } from "vitest";

import type { DiagramSpec } from "../src/core/contracts.ts";
import { layoutDiagram } from "../src/core/layout.ts";
import {
  pathsConflict,
  segmentIntersectsBoxInterior,
} from "./helpers/layout-geometry.ts";

describe("deterministic diagram layout", () => {
  it("arranges report groups into full-width bands around aligned main columns", () => {
    const spec: DiagramSpec = {
      kind: "report",
      title: "测试事实架构",
      summary: "资产覆盖广；Merge 前尚未形成自动测试护栏",
      groups: [
        {
          id: "governance",
          label: "平台 E2E 强度治理",
          placement: "top",
          direction: "row",
          tone: "definition",
        },
        {
          id: "assets",
          label: "测试资产",
          placement: "main",
          direction: "column",
          tone: "definition",
        },
        {
          id: "evidence",
          label: "证据面",
          placement: "main",
          direction: "column",
          tone: "evidence",
        },
        {
          id: "gate",
          label: "Merge 门",
          placement: "main",
          direction: "column",
          tone: "risk",
        },
        {
          id: "target",
          label: "目标闭环",
          placement: "bottom",
          direction: "row",
          tone: "target",
        },
      ],
      nodes: [
        { id: "contract", label: "9 条强合同", group: "governance" },
        { id: "legacy", label: "108 条 legacy", group: "governance" },
        {
          id: "pytest",
          label: "后端单测",
          detail: "517 文件 · 6682 函数",
          group: "assets",
        },
        { id: "platform", label: "平台产物", group: "evidence" },
        { id: "missing", label: "未执行", group: "gate", tone: "risk" },
        {
          id: "block",
          label: "阻塞 Merge",
          group: "target",
          tone: "target",
          variant: "solid",
        },
      ],
      edges: [
        { from: "pytest", to: "platform" },
        { from: "platform", to: "missing" },
        { from: "missing", to: "block" },
      ],
    };

    const layout = layoutDiagram(spec);
    const byGroup = new Map(layout.groups.map((group) => [group.id, group]));
    const governance = byGroup.get("governance");
    const assets = byGroup.get("assets");
    const evidence = byGroup.get("evidence");
    const gate = byGroup.get("gate");
    const target = byGroup.get("target");

    expect(layoutDiagram(spec)).toEqual(layout);
    expect(governance?.width).toBe(target?.width);
    expect(governance?.x).toBe(target?.x);
    expect((governance?.y ?? 0) + (governance?.height ?? 0))
      .toBeLessThan(assets?.y ?? 0);
    expect(assets?.y).toBe(evidence?.y);
    expect(evidence?.y).toBe(gate?.y);
    expect(assets?.height).toBe(evidence?.height);
    expect(evidence?.height).toBe(gate?.height);
    expect((assets?.x ?? 0) + (assets?.width ?? 0))
      .toBeLessThan(evidence?.x ?? 0);
    expect((evidence?.x ?? 0) + (evidence?.width ?? 0))
      .toBeLessThan(gate?.x ?? 0);
    expect((gate?.y ?? 0) + (gate?.height ?? 0))
      .toBeLessThan(target?.y ?? 0);

    for (const node of layout.nodes) {
      const group = byGroup.get(node.group ?? "");
      expect(group).toBeDefined();
      expect(node.x).toBeGreaterThan(group?.x ?? Number.POSITIVE_INFINITY);
      expect(node.y).toBeGreaterThan(group?.y ?? Number.POSITIVE_INFINITY);
      expect(node.x + node.width).toBeLessThan(
        (group?.x ?? 0) + (group?.width ?? 0),
      );
      expect(node.y + node.height).toBeLessThan(
        (group?.y ?? 0) + (group?.height ?? 0),
      );
    }
  });

  it("routes report edges orthogonally between node boundaries", () => {
    const spec: DiagramSpec = {
      kind: "report",
      title: "证据链",
      groups: [
        { id: "facts", label: "事实", placement: "main" },
        { id: "evidence", label: "证据", placement: "main" },
      ],
      nodes: [
        {
          id: "source",
          label: "真实执行",
          detail: "116 通过 · 1 失败",
          group: "facts",
        },
        { id: "target", label: "JUnit 产物", group: "evidence" },
      ],
      edges: [{ from: "source", to: "target" }],
    };

    const layout = layoutDiagram(spec);
    const source = layout.nodes.find((node) => node.id === "source");
    const target = layout.nodes.find((node) => node.id === "target");
    const edge = layout.edges[0];

    expect(source).toBeDefined();
    expect(target).toBeDefined();
    expect(edge?.points).toHaveLength(4);
    expect(edge?.points[0]).toEqual({
      x: (source?.x ?? 0) + (source?.width ?? 0),
      y: (source?.y ?? 0) + (source?.height ?? 0) / 2,
    });
    expect(edge?.points.at(-1)).toEqual({
      x: target?.x,
      y: (target?.y ?? 0) + (target?.height ?? 0) / 2,
    });
    for (let index = 1; index < (edge?.points.length ?? 0); index += 1) {
      const previous = edge?.points[index - 1];
      const current = edge?.points[index];
      expect(previous?.x === current?.x || previous?.y === current?.y).toBe(true);
      expect(
        Math.abs((current?.x ?? 0) - (previous?.x ?? 0))
          + Math.abs((current?.y ?? 0) - (previous?.y ?? 0)),
      ).toBeGreaterThanOrEqual(16);
    }
  });

  it("routes report edges around unrelated nodes", () => {
    const layout = layoutDiagram({
      kind: "report",
      title: "跨阶段证据链",
      groups: [
        { id: "source", label: "输入", placement: "main" },
        { id: "middle", label: "处理中", placement: "main" },
        { id: "target", label: "输出", placement: "main" },
      ],
      nodes: [
        { id: "request", label: "请求", group: "source" },
        { id: "processor", label: "处理器", group: "middle" },
        { id: "result", label: "结果", group: "target" },
      ],
      edges: [{ from: "request", to: "result" }],
    });
    const edge = layout.edges[0];
    const obstacle = layout.nodes.find((node) => node.id === "processor");

    expect(edge).toBeDefined();
    expect(obstacle).toBeDefined();
    for (let index = 1; index < (edge?.points.length ?? 0); index += 1) {
      expect(
        segmentIntersectsBoxInterior(
          edge?.points[index - 1] ?? { x: 0, y: 0 },
          edge?.points[index] ?? { x: 0, y: 0 },
          obstacle ?? { x: 0, y: 0, width: 0, height: 0 },
        ),
      ).toBe(false);
    }
  });

  it("routes independent report edges without crossing or overlapping", () => {
    const layout = layoutDiagram({
      kind: "report",
      title: "双通道证据链",
      groups: [
        { id: "input", label: "输入", placement: "main" },
        { id: "output", label: "输出", placement: "main" },
      ],
      nodes: [
        { id: "input-a", label: "输入 A", group: "input" },
        { id: "input-b", label: "输入 B", group: "input" },
        { id: "output-a", label: "输出 A", group: "output" },
        { id: "output-b", label: "输出 B", group: "output" },
      ],
      edges: [
        { from: "input-a", to: "output-b" },
        { from: "input-b", to: "output-a" },
      ],
    });
    const [first, second] = layout.edges;

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(pathsConflict(first?.points ?? [], second?.points ?? [])).toBe(false);
  });

  it("keeps a sparse truthful report compact instead of inflating one column", () => {
    const layout = layoutDiagram({
      kind: "report",
      title: "已知事实",
      summary: "当前上下文只支持一个结论",
      groups: [{ id: "fact", label: "事实", placement: "main" }],
      nodes: [{ id: "known", label: "仅保留已知信息", group: "fact" }],
      edges: [],
    });

    expect(layout.width).toBeLessThanOrEqual(640);
  });

  it("lays out a flow left-to-right while preserving semantic order", () => {
    const spec: DiagramSpec = {
      kind: "flow",
      title: "Publish",
      nodes: [
        { id: "draft", label: "Draft" },
        { id: "review", label: "Review" },
        { id: "publish", label: "Publish" },
      ],
      edges: [
        { from: "draft", to: "review", label: "submit" },
        { from: "review", to: "publish", label: "approve" },
      ],
    };

    const first = layoutDiagram(spec);
    const second = layoutDiagram(spec);
    const [draft, review, publish] = first.nodes;

    expect(second).toEqual(first);
    expect(first.nodes.map((node) => node.id)).toEqual([
      "draft",
      "review",
      "publish",
    ]);
    expect(first.edges.map((edge) => edge.id)).toEqual(["edge-0", "edge-1"]);
    expect(first.edges.every((edge) => edge.points.length >= 2)).toBe(true);
    expect(draft?.x).toBeLessThan(review?.x ?? 0);
    expect(review?.x).toBeLessThan(publish?.x ?? 0);
  });

  it("keeps parallel directed edges distinct in stable input order", () => {
    const spec: DiagramSpec = {
      kind: "flow",
      title: "Parallel paths",
      nodes: [
        { id: "source", label: "Source" },
        { id: "target", label: "Target" },
      ],
      edges: [
        { from: "source", to: "target", label: "primary" },
        { from: "source", to: "target", label: "fallback" },
      ],
    };

    const layout = layoutDiagram(spec);

    expect(layout.edges.map((edge) => [edge.id, edge.label])).toEqual([
      ["edge-0", "primary"],
      ["edge-1", "fallback"],
    ]);
    expect(layout.edges.every((edge) => edge.points.length >= 2)).toBe(true);
  });

  it("encloses grouped architecture nodes without changing their ids", () => {
    const spec: DiagramSpec = {
      kind: "architecture",
      title: "Service boundary",
      groups: [{ id: "backend", label: "Backend" }],
      nodes: [
        { id: "api", label: "API", group: "backend" },
        { id: "store", label: "Store", group: "backend" },
      ],
      edges: [{ from: "api", to: "store" }],
    };

    const layout = layoutDiagram(spec);
    const group = layout.groups[0];

    expect(group?.id).toBe("backend");
    for (const node of layout.nodes) {
      expect(node.x).toBeGreaterThan(group?.x ?? Number.POSITIVE_INFINITY);
      expect(node.y).toBeGreaterThan(group?.y ?? Number.POSITIVE_INFINITY);
      expect(node.x + node.width).toBeLessThan(
        (group?.x ?? 0) + (group?.width ?? 0),
      );
      expect(node.y + node.height).toBeLessThan(
        (group?.y ?? 0) + (group?.height ?? 0),
      );
    }
  });

  it("stacks grouped architecture bands vertically at a uniform width", () => {
    const spec: DiagramSpec = {
      kind: "architecture",
      title: "Layered system",
      groups: [
        { id: "cause", label: "病因" },
        { id: "course", label: "病程" },
        { id: "treat", label: "治疗" },
      ],
      nodes: [
        { id: "root", label: "桥本甲状腺炎", detail: "AIT 最常见类型" },
        { id: "gene", label: "遗传", group: "cause" },
        { id: "env", label: "环境诱因", group: "cause" },
        { id: "sub", label: "亚临床甲减", group: "course" },
        { id: "overt", label: "临床甲减", group: "course" },
        { id: "ata", label: "ATA 分层", group: "treat", emphasis: true },
      ],
      edges: [
        { from: "root", to: "gene" },
        { from: "gene", to: "sub" },
        { from: "sub", to: "ata" },
      ],
    };

    const layout = layoutDiagram(spec);
    const [cause, course, treat] = layout.groups;

    // Bands stack top-to-bottom in input order without overlapping.
    expect(layout.groups.map((group) => group.id))
      .toEqual(["cause", "course", "treat"]);
    expect((cause?.y ?? 0) + (cause?.height ?? 0))
      .toBeLessThan(course?.y ?? 0);
    expect((course?.y ?? 0) + (course?.height ?? 0))
      .toBeLessThan(treat?.y ?? 0);
    // All band containers share one width and left edge.
    expect(new Set(layout.groups.map((group) => group.width)).size).toBe(1);
    expect(new Set(layout.groups.map((group) => group.x)).size).toBe(1);
    // The ungrouped root node sits above the first band.
    const root = layout.nodes.find((node) => node.id === "root");
    expect((root?.y ?? 0) + (root?.height ?? 0)).toBeLessThan(cause?.y ?? 0);
    // Node input order is preserved in the returned array.
    expect(layout.nodes.map((node) => node.id))
      .toEqual(["root", "gene", "env", "sub", "overt", "ata"]);
  });

  it("routes grouped architecture edges around intervening nodes", () => {
    const layout = layoutDiagram({
      kind: "architecture",
      title: "处理链路",
      groups: [{ id: "runtime", label: "运行时" }],
      nodes: [
        { id: "input", label: "输入", group: "runtime" },
        { id: "worker", label: "处理器", group: "runtime" },
        { id: "output", label: "输出", group: "runtime" },
      ],
      edges: [{ from: "input", to: "output" }],
    });
    const edge = layout.edges[0];
    const obstacle = layout.nodes.find((node) => node.id === "worker");

    expect(edge).toBeDefined();
    expect(obstacle).toBeDefined();
    for (let index = 1; index < (edge?.points.length ?? 0); index += 1) {
      expect(
        segmentIntersectsBoxInterior(
          edge?.points[index - 1] ?? { x: 0, y: 0 },
          edge?.points[index] ?? { x: 0, y: 0 },
          obstacle ?? { x: 0, y: 0, width: 0, height: 0 },
        ),
      ).toBe(false);
    }
  });

  it("keeps ungrouped architecture specs on the directed fallback", () => {
    const spec: DiagramSpec = {
      kind: "architecture",
      title: "Pipeline",
      nodes: [
        { id: "in", label: "In" },
        { id: "out", label: "Out" },
      ],
      edges: [{ from: "in", to: "out" }],
    };

    const layout = layoutDiagram(spec);
    const [input, output] = layout.nodes;

    expect(layout.groups).toEqual([]);
    expect(input?.x ?? 0).toBeLessThan(output?.x ?? 0);
  });

  it("lays hierarchy parents above their children", () => {
    const spec: DiagramSpec = {
      kind: "hierarchy",
      title: "Team",
      nodes: [
        { id: "lead", label: "Lead" },
        { id: "design", label: "Design" },
        { id: "engineering", label: "Engineering" },
      ],
      edges: [
        { from: "lead", to: "design" },
        { from: "lead", to: "engineering" },
      ],
    };

    const layout = layoutDiagram(spec);
    const lead = layout.nodes.find((node) => node.id === "lead");
    const children = layout.nodes.filter((node) => node.id !== "lead");

    expect(children.every((node) => (lead?.y ?? 0) < node.y)).toBe(true);
  });

  it("places timeline nodes in stable chronological input order", () => {
    const spec: DiagramSpec = {
      kind: "timeline",
      title: "Milestones",
      nodes: [
        { id: "idea", label: "Idea" },
        { id: "prototype", label: "Prototype" },
        { id: "launch", label: "Launch" },
      ],
      edges: [
        { from: "idea", to: "prototype" },
        { from: "prototype", to: "launch" },
      ],
    };

    const layout = layoutDiagram(spec);

    expect(layout.nodes.map((node) => node.id)).toEqual([
      "idea",
      "prototype",
      "launch",
    ]);
    expect(layout.nodes[0]?.x).toBeLessThan(layout.nodes[1]?.x ?? 0);
    expect(layout.nodes[1]?.x).toBeLessThan(layout.nodes[2]?.x ?? 0);
    expect(layout.edges.map((edge) => edge.id)).toEqual(["edge-0", "edge-1"]);
  });

  it("gives an ungrouped comparison two explicit balanced columns", () => {
    const spec: DiagramSpec = {
      kind: "comparison",
      title: "Options",
      nodes: [
        { id: "a1", label: "A strength" },
        { id: "a2", label: "A weakness" },
        { id: "b1", label: "B strength" },
        { id: "b2", label: "B weakness" },
      ],
      edges: [],
    };

    const layout = layoutDiagram(spec);
    const columns = new Map<number, number>();
    for (const node of layout.nodes) {
      columns.set(node.x, (columns.get(node.x) ?? 0) + 1);
    }

    expect([...columns.values()]).toEqual([2, 2]);
    expect(layout.nodes.map((node) => node.id)).toEqual([
      "a1",
      "a2",
      "b1",
      "b2",
    ]);
  });

  it("distributes relationship nodes around a circle with absolute edges", () => {
    const spec: DiagramSpec = {
      kind: "relationship",
      title: "Stakeholders",
      nodes: [
        { id: "author", label: "Author" },
        { id: "editor", label: "Editor" },
        { id: "reader", label: "Reader" },
        { id: "publisher", label: "Publisher" },
      ],
      edges: [
        { from: "author", to: "editor" },
        { from: "editor", to: "publisher" },
        { from: "publisher", to: "reader" },
      ],
    };

    const layout = layoutDiagram(spec);

    expect(
      new Set(layout.nodes.map((node) => `${node.x},${node.y}`)).size,
    ).toBe(4);
    expect(
      layout.edges.every(
        (edge) =>
          edge.points.length >= 2 &&
          edge.points.every(
            (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
          ),
      ),
    ).toBe(true);
  });
});
