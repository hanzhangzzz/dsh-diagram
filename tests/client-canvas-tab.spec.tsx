// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

import { jumpToCanvasTab } from "../src/client/canvas-tab.ts";
import { DiagramPreviewNode } from "../src/client/DiagramPreviewNode.tsx";

function canvasTab(label = "画布"): HTMLElement {
  const tab = document.createElement("button");
  tab.setAttribute("role", "tab");
  tab.textContent = label;
  document.body.append(tab);
  return tab;
}

describe("jumpToCanvasTab", () => {
  it("clicks the conversation's canvas tab and reports success", () => {
    const source = document.createElement("div");
    document.body.append(source);
    const tab = canvasTab();
    const clicked = vi.fn();
    tab.addEventListener("click", clicked);

    expect(jumpToCanvasTab(source)).toBe(true);
    expect(clicked).toHaveBeenCalledTimes(1);

    tab.remove();
    source.remove();
  });

  it("ignores unrelated tabs and degrades to false without one", () => {
    const source = document.createElement("div");
    document.body.append(source);
    const other = canvasTab("轨迹");
    const clicked = vi.fn();
    other.addEventListener("click", clicked);

    expect(jumpToCanvasTab(source)).toBe(false);
    expect(clicked).not.toHaveBeenCalled();

    other.remove();
    source.remove();
  });
});

describe("DiagramPreviewNode edit affordance", () => {
  const props = {
    sessionId: "session-1",
    node: {
      key: "dsh-diagram-preview:d1",
      kind: "dsh-diagram-preview",
      id: "d1",
      target: "chat",
      anchorSeq: 41,
      location: { kind: "unresolved" },
      visibility: "visible",
      data: {
        diagramId: "d1",
        revision: "r1",
        title: "推荐结构",
        kind: "architecture",
      },
    },
  } as unknown as ComponentProps<typeof DiagramPreviewNode>;

  it("jumps to the canvas tab when the edit button is clicked", () => {
    const tab = canvasTab();
    const clicked = vi.fn();
    tab.addEventListener("click", clicked);

    render(<DiagramPreviewNode {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "在画布中编辑" }));

    expect(clicked).toHaveBeenCalledTimes(1);
    tab.remove();
  });

  it("stays inert without a canvas tab in the document", () => {
    render(<DiagramPreviewNode {...props} />);
    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: "在画布中编辑" })),
    ).not.toThrow();
  });
});
