import { describe, expect, it } from "vitest";
import { createDiagramSpecSchema, DEFAULT_DIAGRAM_VALIDATION_POLICY as policy, type DiagramSpec } from "../src/core/contracts.ts";
import { hasNotes, mainViewSpec, notesSkeletons, noteViewElements } from "../src/editor/notes.ts";

const spec: DiagramSpec = {
  kind: "flow", title: "有条件地执行",
  nodes: [
    {id:"check",label:"验收证据",detail:"UNKNOWN 不放行",notes:"来源：第63页。必检缺失或任何未知结果都不能形成放行结论。"},
    {id:"execute",label:"终检后执行",detail:"仍须检查最新状态"},
  ],
  edges: [{from:"check",to:"execute",label:"通过且终检满足"}],
};

describe("native supporting notes", () => {
  it("retains critical qualifiers in the main graph and full supporting text in the exported scene", () => {
    const accepted = createDiagramSpecSchema(policy).parse(spec);
    const main = mainViewSpec(accepted);
    expect(main.nodes[0]!.label).toBe("验收证据 [1]");
    expect(main.nodes[0]!.detail).toBe("UNKNOWN 不放行");
    expect(main.edges).toEqual(spec.edges);
    expect(spec.nodes[0]!.label).toBe("验收证据");
    const notes = notesSkeletons(accepted, 600);
    const body = notes.find(e=>e.id === "notes:body:check") as {text:string};
    expect(body.text.replaceAll("\n", "")).toBe(spec.nodes[0]!.notes);
    expect(notes.every(e=>e.type === "text")).toBe(true);
    expect(notesSkeletons(accepted,600)).toEqual(notes);
  });
  it("selects current edited notes by identity without regenerating their text", () => {
    const current = [{id:"node:check",text:"手改主图"},{id:"notes:body:check",text:"手改说明"}];
    expect(noteViewElements(current,"notes")).toEqual([current[1]]);
    expect(noteViewElements(current,"main")).toEqual([current[0]]);
    expect(current).toHaveLength(2);
  });
  it("preserves legacy rendering inputs and rejects notes that an atlas would omit", () => {
    const legacy={...spec,nodes:spec.nodes.map(({notes:_,...n})=>n)};
    expect(mainViewSpec(legacy)).toEqual(legacy);
    expect(hasNotes(legacy)).toBe(false);
    expect(notesSkeletons(legacy,100)).toEqual([]);
    const atlas={kind:"hierarchy",composition:"atlas",title:"分类",nodes:[{id:"r",label:"根"},{id:"c",label:"类"},{id:"l",label:"项",notes:"不应静默丢掉"}],edges:[{from:"r",to:"c"},{from:"c",to:"l"}]};
    expect(createDiagramSpecSchema(policy).safeParse(atlas).success).toBe(false);
    expect(createDiagramSpecSchema(policy).safeParse({...spec,nodes:[{...spec.nodes[0],notes:"x".repeat(policy.maxNodeDetailChars+1)},spec.nodes[1]]}).success).toBe(false);
  });
});

it("reserves an inscribed text region for an actual branch condition", async () => {
  const {layoutDiagram}=await import("../src/core/layout.ts");
  const input: DiagramSpec={kind:"flow",title:"按证据分支",nodes:[{id:"gate",label:"检查全部通过？",detail:"UNKNOWN 不放行",variant:"decision"},{id:"yes",label:"终检"},{id:"no",label:"停止"}],edges:[{from:"gate",to:"yes",label:"是"},{from:"gate",to:"no",label:"否或未知"}]};
  expect(createDiagramSpecSchema(policy).safeParse(input).success).toBe(true);
  const a=layoutDiagram(input).nodes.find(n=>n.id==="gate")!;
  const b=layoutDiagram({...input,nodes:input.nodes.map(n=>({...n,variant:undefined}))}).nodes.find(n=>n.id==="gate")!;
  expect(a.width).toBeGreaterThanOrEqual(b.width*2);
  expect(a.height).toBeGreaterThanOrEqual(b.height*2);
});


it("rejects incomplete region declarations before a canvas can fail to render", () => {
  const base={kind:"architecture",composition:"regions",title:"架构",nodes:[{id:"a",label:"A"}],edges:[]};
  const schema=createDiagramSpecSchema(policy);
  expect(schema.safeParse(base).success).toBe(false);
  expect(schema.safeParse({...base,groups:[{id:"g",label:"G",placement:"top"}],nodes:[{id:"a",label:"A",group:"g"}]}).success).toBe(false);
  expect(schema.safeParse({...base,groups:[{id:"g",label:"G",placement:"main"}],nodes:[{id:"a",label:"A",group:"g"}]}).success).toBe(true);
  expect(schema.safeParse({...base,kind:"flow",groups:[{id:"g",label:"G"}],nodes:[{id:"a",label:"A",group:"g"}]}).success).toBe(false);
});

it("does not turn a comparison note reference into a new comparison criterion", async () => {
  const {layoutDiagram}=await import("../src/core/layout.ts");
  const input: DiagramSpec={kind:"comparison",title:"失败处理",groups:[{id:"a",label:"本地"},{id:"b",label:"生产"}],nodes:[{id:"x",group:"a",label:"失败后动作",detail:"重试"},{id:"y",group:"b",label:"失败后动作",detail:"停止",notes:"未知结果不能直接继续"}],edges:[]};
  const main=mainViewSpec(input);
  expect(main.nodes[1]!.label).toBe(main.nodes[0]!.label);
  expect(main.nodes[1]!.detail).toContain("[1]");
  const layout=layoutDiagram(main);
  expect(layout.nodes[0]!.y).toBe(layout.nodes[1]!.y);
  expect(input.nodes[1]!.detail).toBe("停止");
});
