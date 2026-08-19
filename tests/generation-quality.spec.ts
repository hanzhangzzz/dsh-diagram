import { describe, expect, it } from "vitest";

import {
  DEFAULT_DIAGRAM_VALIDATION_POLICY,
  createDiagramSpecSchema,
  type DiagramSpec,
} from "../src/core/contracts.ts";
import {
  layoutDiagram,
  type PositionedDiagram,
  type PositionedGroup,
  type PositionedNode,
} from "../src/core/layout.ts";
import {
  pathsConflict,
  segmentIntersectsBoxInterior,
  type Box,
} from "./helpers/layout-geometry.ts";

const REPORT_CASES: ReadonlyArray<{ name: string; spec: DiagramSpec }> = [
  {
    name: "技术交付评估",
    spec: {
      kind: "report",
      title: "测试事实架构",
      summary: "测试资产存在，但 Merge 前缺少自动执行证据",
      groups: [
        {
          id: "governance",
          label: "平台治理",
          placement: "top",
          direction: "row",
          tone: "definition",
        },
        { id: "assets", label: "测试资产", placement: "main", tone: "definition" },
        { id: "run", label: "执行面", placement: "main", tone: "execution" },
        { id: "evidence", label: "证据面", placement: "main", tone: "evidence" },
        { id: "gate", label: "Merge 门", placement: "main", tone: "risk" },
        {
          id: "target",
          label: "目标闭环",
          placement: "bottom",
          direction: "row",
          tone: "target",
        },
      ],
      nodes: [
        { id: "contract", label: "9 条强合同", group: "governance", variant: "compact" },
        { id: "legacy", label: "108 条 legacy", group: "governance", variant: "compact" },
        { id: "pytest", label: "后端单测", detail: "517 文件 · 6682 函数", group: "assets" },
        { id: "vitest", label: "前端 Vitest", detail: "342 文件 · 2595 条", group: "assets" },
        { id: "local", label: "开发期规范", detail: "执行全绿才提交", group: "run" },
        { id: "platform", label: "平台产物", detail: "详情 · 断言 · 日志", group: "evidence" },
        { id: "gap", label: "证据缺口", detail: "未绑定 commit / MR", group: "evidence", tone: "risk" },
        { id: "missing", label: "未执行", detail: "pytest · Vitest · E2E", group: "gate", tone: "risk" },
        { id: "exists", label: "存在 ≠ 生效", group: "gate", tone: "risk" },
        { id: "block", label: "阻塞 Merge", group: "target", variant: "solid" },
      ],
      edges: [
        { from: "pytest", to: "local" },
        { from: "local", to: "platform" },
        { from: "platform", to: "missing" },
        { from: "missing", to: "block" },
      ],
    },
  },
  {
    name: "业务发布计划",
    spec: {
      kind: "report",
      title: "新品发布作战图",
      summary: "以目标客群验证、渠道协同和供给保障形成发布闭环",
      groups: [
        { id: "goal", label: "发布目标", placement: "top", direction: "row", tone: "definition" },
        { id: "audience", label: "目标客群", placement: "main", tone: "definition" },
        { id: "channel", label: "渠道", placement: "main", tone: "external" },
        { id: "supply", label: "供给保障", placement: "main", tone: "execution" },
        { id: "measure", label: "效果证据", placement: "main", tone: "evidence" },
        { id: "outcome", label: "预期结果", placement: "bottom", direction: "row", tone: "target" },
      ],
      nodes: [
        { id: "north", label: "首月有效触达", group: "goal", variant: "compact" },
        { id: "primary", label: "核心用户", detail: "高频需求 · 明确痛点", group: "audience" },
        { id: "community", label: "社群试用", detail: "收集真实反馈", group: "channel" },
        { id: "retail", label: "门店演示", detail: "覆盖重点城市", group: "channel" },
        { id: "stock", label: "安全库存", detail: "按区域动态补货", group: "supply" },
        { id: "support", label: "客服准备", detail: "FAQ · 升级路径", group: "supply" },
        { id: "conversion", label: "转化率", group: "measure", variant: "compact" },
        { id: "retention", label: "次月留存", group: "measure", variant: "compact" },
        { id: "validated", label: "验证产品市场匹配", group: "outcome", variant: "solid" },
      ],
      edges: [
        { from: "primary", to: "community" },
        { from: "community", to: "conversion" },
        { from: "conversion", to: "validated" },
      ],
    },
  },
  {
    name: "事故复盘",
    spec: {
      kind: "report",
      title: "支付超时事故复盘",
      summary: "流量突增放大连接池瓶颈，回滚后恢复",
      groups: [
        { id: "impact", label: "影响", placement: "top", direction: "row", tone: "risk" },
        { id: "signals", label: "发现", placement: "main", tone: "evidence" },
        { id: "cause", label: "根因", placement: "main", tone: "risk" },
        { id: "recovery", label: "恢复", placement: "main", tone: "execution" },
        { id: "prevention", label: "预防", placement: "bottom", direction: "row", tone: "target" },
      ],
      nodes: [
        { id: "window", label: "14:03–14:27", group: "impact", variant: "compact" },
        { id: "timeout", label: "支付超时率上升", group: "impact", tone: "risk" },
        { id: "alert", label: "延迟告警", detail: "14:05 触发", group: "signals" },
        { id: "pool", label: "连接池耗尽", detail: "等待队列持续增长", group: "cause" },
        { id: "rollback", label: "回滚发布", detail: "14:18 开始", group: "recovery" },
        { id: "recover", label: "指标恢复", detail: "14:27", group: "recovery" },
        { id: "load", label: "发布前压测", group: "prevention" },
        { id: "guard", label: "连接池水位门禁", group: "prevention", variant: "solid" },
      ],
      edges: [
        { from: "alert", to: "pool" },
        { from: "pool", to: "rollback" },
        { from: "rollback", to: "recover" },
        { from: "pool", to: "guard" },
      ],
    },
  },
];

describe("topic-independent report quality", () => {
  for (const { name, spec } of REPORT_CASES) {
    it(`${name} keeps deterministic, contained, non-overlapping geometry`, () => {
      const parsed = createDiagramSpecSchema(
        DEFAULT_DIAGRAM_VALIDATION_POLICY,
      ).parse(spec);
      const layout = layoutDiagram(parsed);

      expect(layoutDiagram(parsed)).toEqual(layout);
      expect(layout.width).toBeLessThanOrEqual(2_000);
      expect(layout.height).toBeLessThanOrEqual(2_200);
      expectNoOverlaps(layout.groups);
      expectNoOverlaps(layout.nodes);
      expectNodesInsideGroups(layout);
      expectEdgesAvoidUnrelatedNodes(layout);
      expectIndependentEdgesDoNotConflict(layout);
      expectRouteBudgets(layout, parsed);
      for (const edge of layout.edges) {
        for (let index = 1; index < edge.points.length; index += 1) {
          const previous = edge.points[index - 1];
          const current = edge.points[index];
          expect(current).not.toEqual(previous);
          expect(previous?.x === current?.x || previous?.y === current?.y).toBe(true);
        }
      }
    });
  }
});

interface IdentifiedBox extends Box {
  id: string;
}

function expectEdgesAvoidUnrelatedNodes(layout: PositionedDiagram): void {
  for (const edge of layout.edges) {
    const obstacles = layout.nodes.filter(
      (node) => node.id !== edge.from && node.id !== edge.to,
    );
    for (let index = 1; index < edge.points.length; index += 1) {
      const start = edge.points[index - 1];
      const end = edge.points[index];
      expect(start).toBeDefined();
      expect(end).toBeDefined();
      for (const obstacle of obstacles) {
        expect(
          segmentIntersectsBoxInterior(
            start ?? { x: 0, y: 0 },
            end ?? { x: 0, y: 0 },
            obstacle,
          ),
          `${edge.id}/${obstacle.id}`,
        ).toBe(false);
      }
    }
  }
}

function expectIndependentEdgesDoNotConflict(
  layout: PositionedDiagram,
): void {
  for (let left = 0; left < layout.edges.length; left += 1) {
    for (let right = left + 1; right < layout.edges.length; right += 1) {
      const first = layout.edges[left];
      const second = layout.edges[right];
      expect(first).toBeDefined();
      expect(second).toBeDefined();
      if (
        first === undefined
        || second === undefined
        || first.from === second.from
        || first.from === second.to
        || first.to === second.from
        || first.to === second.to
      ) {
        continue;
      }
      expect(
        pathsConflict(first.points, second.points),
        `${first.id}/${second.id}`,
      ).toBe(false);
    }
  }
}

function expectRouteBudgets(
  layout: PositionedDiagram,
  spec: DiagramSpec,
): void {
  const groupPlacements = new Map(
    spec.groups?.map((group) => [group.id, group.placement ?? "main"]),
  );
  const nodePlacements = new Map(
    spec.nodes.map((node) => [
      node.id,
      node.group === undefined ? undefined : groupPlacements.get(node.group),
    ]),
  );
  for (const edge of layout.edges) {
    const sourcePlacement = nodePlacements.get(edge.from);
    const targetPlacement = nodePlacements.get(edge.to);
    const crossesBand = sourcePlacement !== undefined
      && targetPlacement !== undefined
      && sourcePlacement !== targetPlacement;
    expect(edge.points.length - 2, edge.id).toBeLessThanOrEqual(4);
    const first = edge.points[0];
    const last = edge.points.at(-1);
    const second = edge.points[1];
    const penultimate = edge.points.at(-2);
    const source = layout.nodes.find((node) => node.id === edge.from);
    const target = layout.nodes.find((node) => node.id === edge.to);
    expect(source, `${edge.id}/source`).toBeDefined();
    expect(target, `${edge.id}/target`).toBeDefined();
    if (
      first?.x === source?.x
      || first?.x === (source?.x ?? 0) + (source?.width ?? 0)
    ) {
      expect(second?.y, `${edge.id}/source port`).toBe(first?.y);
    } else {
      expect(second?.x, `${edge.id}/source port`).toBe(first?.x);
    }
    if (
      last?.x === target?.x
      || last?.x === (target?.x ?? 0) + (target?.width ?? 0)
    ) {
      expect(penultimate?.y, `${edge.id}/target port`).toBe(last?.y);
    } else {
      expect(penultimate?.x, `${edge.id}/target port`).toBe(last?.x);
    }
    if (crossesBand) {
      expect(edge.points[1]?.x, `${edge.id}/source port`).toBe(first?.x);
      expect(edge.points.at(-2)?.x, `${edge.id}/target port`).toBe(last?.x);
    }
    const directLength = Math.abs((last?.x ?? 0) - (first?.x ?? 0))
      + Math.abs((last?.y ?? 0) - (first?.y ?? 0));
    let routedLength = 0;
    for (let index = 1; index < edge.points.length; index += 1) {
      const previous = edge.points[index - 1];
      const current = edge.points[index];
      expect(previous).toBeDefined();
      expect(current).toBeDefined();
      const segmentLength = Math.abs((current?.x ?? 0) - (previous?.x ?? 0))
        + Math.abs((current?.y ?? 0) - (previous?.y ?? 0));
      routedLength += segmentLength;
      expect(segmentLength, edge.id).toBeGreaterThanOrEqual(16);
    }
    // Cross-region edges must detour around bands owning neither endpoint
    // (composition discipline), so the budget admits a bounded detour.
    expect(routedLength / directLength, edge.id).toBeLessThanOrEqual(1.75);
  }
}

function expectNoOverlaps(boxes: ReadonlyArray<IdentifiedBox>): void {
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      const first = boxes[left];
      const second = boxes[right];
      expect(first).toBeDefined();
      expect(second).toBeDefined();
      expect(
        interiorsOverlap(first as IdentifiedBox, second as IdentifiedBox),
        `${first?.id}/${second?.id}`,
      )
        .toBe(false);
    }
  }
}

function interiorsOverlap(first: Box, second: Box): boolean {
  return first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y;
}

function expectNodesInsideGroups(layout: PositionedDiagram): void {
  const groups = new Map<string, PositionedGroup>(
    layout.groups.map((group) => [group.id, group]),
  );
  for (const node of layout.nodes as PositionedNode[]) {
    const group = groups.get(node.group ?? "");
    expect(group, node.id).toBeDefined();
    expect(node.x).toBeGreaterThan(group?.x ?? Number.POSITIVE_INFINITY);
    expect(node.y).toBeGreaterThan(group?.y ?? Number.POSITIVE_INFINITY);
    expect(node.x + node.width).toBeLessThan(
      (group?.x ?? 0) + (group?.width ?? 0),
    );
    expect(node.y + node.height).toBeLessThan(
      (group?.y ?? 0) + (group?.height ?? 0),
    );
  }
}
