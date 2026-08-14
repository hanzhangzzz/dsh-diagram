import { describe, expect, it } from "vitest";

import type { DiagramSpec } from "../src/core/contracts.ts";
import { layoutDiagram } from "../src/core/layout.ts";

describe("deterministic diagram layout", () => {
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
