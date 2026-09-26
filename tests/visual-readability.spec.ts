import { describe, expect, it } from "vitest";
import { layoutDiagram, edgeLabelBoxWidth, edgeLabelBoxHeight, wrapTitleText, textWidth } from "../src/core/layout.ts";
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

it("lays out explicitly parallel architecture regions side by side with a shared observation region", () => {
  const spec: DiagramSpec={kind:"architecture",composition:"regions",title:"职责网络",groups:[
    {id:"supply",label:"知识与工具供给",placement:"main"},
    {id:"run",label:"运行与验证",placement:"main"},
    {id:"guard",label:"独立授权与门控",placement:"main"},
    {id:"observe",label:"贯穿执行的可观测",placement:"bottom",direction:"row"},
  ],nodes:[{id:"knowledge",label:"知识",group:"supply"},{id:"tools",label:"工具",group:"supply"},{id:"agent",label:"Agent",group:"run"},{id:"runtime",label:"运行环境",group:"run"},{id:"policy",label:"策略",group:"guard"},{id:"gate",label:"门控",group:"guard"},{id:"trace",label:"行为轨迹",group:"observe"},{id:"quality",label:"质量与价值",group:"observe"}],edges:[{from:"knowledge",to:"agent",label:"供给"},{from:"policy",to:"agent",label:"约束"},{from:"agent",to:"trace",label:"观测"}]};
  const result=layoutDiagram(spec);
  const [a,b,c,d]=result.groups;
  expect(a!.y).toBe(b!.y);
  expect(b!.y).toBe(c!.y);
  expect(a!.x+a!.width).toBeLessThan(b!.x);
  expect(d!.y).toBeGreaterThan(a!.y+a!.height);
  expect(result.edges.map(e=>[e.from,e.to,e.label])).toEqual(spec.edges.map(e=>[e.from,e.to,e.label]));
});


it("reserves complete multiline region headings above their first node", () => {
  const spec: DiagramSpec={kind:"architecture",composition:"regions",title:"边界",groups:[{id:"g",label:"需要完整保留而不是截断的跨域职责说明".repeat(4),placement:"main"}],nodes:[{id:"a",label:"动作",group:"g"}],edges:[]};
  const result=layoutDiagram(spec),group=result.groups[0]!,node=result.nodes[0]!;
  expect(group.headerHeight).toBeGreaterThan(64);
  expect(node.y).toBeGreaterThanOrEqual(group.y+group.headerHeight!);
});

it("aligns explicitly shared comparison criteria despite unequal explanation lengths", () => {
  const input: DiagramSpec={kind:"comparison",title:"两种验证路径",groups:[{id:"local",label:"本地验证"},{id:"production",label:"生产验证"}],nodes:[
    {id:"la",group:"local",label:"反馈",detail:"编译与单测"},
    {id:"lb",group:"local",label:"边界",detail:"不接触生产"},
    {id:"pa",group:"production",label:"反馈",detail:"结合实际服务状态、目标范围、审计证据和现场验证，不能只看一次成功退出。".repeat(3)},
    {id:"pb",group:"production",label:"边界",detail:"授权与终检"},
  ],edges:[]};
  const result=layoutDiagram(input);const n=Object.fromEntries(result.nodes.map(n=>[n.id,n]));
  expect(n.la!.y).toBe(n.pa!.y);
  expect(n.la!.height).toBe(n.pa!.height);
  expect(n.lb!.y).toBe(n.pb!.y);
  expect(n.lb!.width).toBe(n.pb!.width);
  expect(result.nodes.map(n=>n.detail)).toEqual(input.nodes.map(n=>n.detail));
});

it.each(["row", "column"] as const)("reserves label space inside %s architecture regions", direction => {
  const spec: DiagramSpec = {kind:"architecture", composition:"regions", title:"职责交接", groups:[
    {id:"g",label:"身份与授权",placement:"main",direction},
  ],nodes:[{id:"a",label:"身份核验",group:"g"},{id:"b",label:"策略判断",group:"g"}],edges:[
    {from:"a",to:"b",label:"身份、能力与委托进入独立策略判断"},
  ]};
  const result=layoutDiagram(spec);
  for (const edge of result.edges) {
    const a=edge.labelAnchor!, w=edgeLabelBoxWidth(edge.label!), h=edgeLabelBoxHeight(edge.label!);
    for (const n of result.nodes) {
      const dx=Math.min(a.x+w/2,n.x+n.width)-Math.max(a.x-w/2,n.x);
      const dy=Math.min(a.y+h/2,n.y+n.height)-Math.max(a.y-h/2,n.y);
      expect(dx>1 && dy>1,`${direction}: ${edge.id} overlaps ${n.id}`).toBe(false);
    }
  }
});


it("balances an orphaned Chinese title without dropping text or exceeding its width", () => {
  const title = "提效的主战场在编码之外：环境与验证决定模型能力的转化上限";
  const lines = wrapTitleText(title, 28, textWidth(title, 28) - 28).split("\n");
  expect(lines).toHaveLength(2);
  expect(lines.join("")).toBe(title);
  expect(textWidth(lines[1]!,28)).toBeGreaterThan(textWidth(lines[0]!,28)*0.8);
  expect(lines.every(line => textWidth(line,28) <= textWidth(title,28)-28)).toBe(true);
});
