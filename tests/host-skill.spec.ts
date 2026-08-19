import { describe, expect, it } from "vitest";

import { CANVAS_DIAGRAM_SKILL } from "../src/host/skill.ts";

describe("canvas-diagram generation guidance", () => {
  it("routes evidence-heavy text through a truthful adaptive report recipe", () => {
    const content = CANVAS_DIAGRAM_SKILL.content;

    expect(CANVAS_DIAGRAM_SKILL.description).toContain("报告图");
    expect(content).toContain("`report`");
    expect(content).toContain("placement");
    expect(content).toContain("tone");
    expect(content).toContain("variant");
    expect(content).toContain("不得为了凑数量补造事实");
    expect(content).toContain("信息不足或关系不明确");
    expect(content).not.toContain("宁多勿少");
    expect(content).not.toMatch(/12[–-]20 个节点/);
  });
});
