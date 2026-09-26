import { describe, expect, it } from "vitest";
import { layoutDiagram, edgeLabelBoxWidth, edgeLabelBoxHeight } from "../src/core/layout.ts";
import type { DiagramSpec } from "../src/core/contracts.ts";

/** Reproduces the handbook's long labels between tall, closely spaced boxes. */
const longFlow: DiagramSpec = {
  kind: "flow", title: "发布前检查与反馈",
  nodes: Array.from({length: 10}, (_,i) => ({
    id: `n${i}`, label: `检查 ${i+1}`,
    detail: "核对目标、环境、权限与当前状态。".repeat(7),
  })),
  edges: Array.from({length: 9}, (_,i) => ({from:`n${i}`,to:`n${i+1}`,label:"确认目标与状态仍满足本次执行条件"})),
};

describe("readable relationship labels", () => {
  it.each([longFlow, {...longFlow, nodes:longFlow.nodes.slice(0,2),edges:longFlow.edges.slice(0,1)}])(
    "keeps complete relationship labels outside native node bounds",
    spec => {
      const result=layoutDiagram(spec);
      for(const e of result.edges){
        const a=e.labelAnchor!;
        const w=edgeLabelBoxWidth(e.label!),h=edgeLabelBoxHeight(e.label!);
        for(const n of result.nodes){
          const dx=Math.min(a.x+w/2,n.x+n.width)-Math.max(a.x-w/2,n.x);
          const dy=Math.min(a.y+h/2,n.y+n.height)-Math.max(a.y-h/2,n.y);
          expect(dx>1 && dy>1,`${e.id} overlaps ${n.id}`).toBe(false);
        }
      }
      expect(result.edges.map(e=>[e.from,e.to,e.label])).toEqual(spec.edges.map(e=>[e.from,e.to,e.label]));
      expect(layoutDiagram(spec)).toEqual(result);
    },
  );
});
