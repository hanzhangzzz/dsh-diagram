import dagre from "@dagrejs/dagre";

import type { DiagramKind, DiagramNode, DiagramSpec } from "./contracts.ts";

const CANVAS_MARGIN = 40;
const NODE_MIN_WIDTH = 180;
const NODE_MAX_WIDTH = 320;
const NODE_BASE_HEIGHT = 72;
const NODE_HORIZONTAL_PADDING = 40;
const NODE_TEXT_UNIT = 8;
const NODE_DETAIL_LINE_HEIGHT = 20;
const DIRECTED_NODE_GAP = 56;
const DIRECTED_RANK_GAP = 96;
const GROUP_SIDE_PADDING = 28;
const GROUP_TOP_PADDING = 52;
const GROUP_BOTTOM_PADDING = 28;
const TIMELINE_NODE_GAP = 88;
const TIMELINE_ROW_OFFSET = 128;
const COMPARISON_COLUMN_GAP = 96;
const COMPARISON_ROW_GAP = 48;
const RELATIONSHIP_MIN_RADIUS = 220;
const RELATIONSHIP_RADIUS_PER_NODE = 56;

/** An absolute canvas coordinate. */
export interface PositionedPoint {
  x: number;
  y: number;
}

/** A semantic node with a deterministic top-left canvas position. */
export interface PositionedNode extends DiagramNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A directed semantic edge with absolute canvas routing points. */
export interface PositionedEdge {
  id: string;
  from: string;
  to: string;
  label?: string | undefined;
  points: [PositionedPoint, PositionedPoint, ...PositionedPoint[]];
}

/** A labeled node group with a deterministic canvas rectangle. */
export interface PositionedGroup {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Excalidraw-independent result consumed by the browser scene converter. */
export interface PositionedDiagram {
  kind: DiagramKind;
  title: string;
  summary?: string;
  width: number;
  height: number;
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  groups: PositionedGroup[];
}

interface NodeSize {
  width: number;
  height: number;
}

interface RawLayout {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
}

/**
 * Produces a deterministic, editor-independent layout for a validated spec.
 *
 * Edge points are absolute canvas coordinates with at least two points. Edge
 * ids use stable input order and every edge is directed from `from` to `to`.
 *
 * @param spec A DiagramSpec already accepted by createDiagramSpecSchema.
 * @returns Positioned nodes, directed edges, groups, and canvas dimensions.
 */
export function layoutDiagram(spec: DiagramSpec): PositionedDiagram {
  let raw: RawLayout;
  switch (spec.kind) {
    case "flow":
    case "architecture":
      raw = layoutDirected(spec, "LR");
      break;
    case "hierarchy":
      raw = layoutDirected(spec, "TB");
      break;
    case "timeline":
      raw = layoutTimeline(spec);
      break;
    case "comparison":
      raw = layoutComparison(spec);
      break;
    case "relationship":
      raw = layoutRelationship(spec);
      break;
    default:
      return assertNever(spec.kind);
  }

  return normalizeLayout(spec, raw);
}

function layoutDirected(spec: DiagramSpec, rankdir: "LR" | "TB"): RawLayout {
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({
    rankdir,
    nodesep: DIRECTED_NODE_GAP,
    ranksep: DIRECTED_RANK_GAP,
    marginx: 0,
    marginy: 0,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  const sizes = new Map<string, NodeSize>();
  for (const node of spec.nodes) {
    const size = measureNode(node);
    sizes.set(node.id, size);
    graph.setNode(node.id, size);
  }
  for (const [index, edge] of spec.edges.entries()) {
    graph.setEdge(edge.from, edge.to, {}, edgeId(index));
  }

  dagre.layout(graph);

  const nodes = spec.nodes.map((node) => {
    const position = graph.node(node.id) as NodeSize & PositionedPoint;
    const size = sizes.get(node.id);
    if (size === undefined) {
      throw new Error(`Missing measured node: ${node.id}`);
    }
    return {
      ...node,
      x: round(position.x - size.width / 2),
      y: round(position.y - size.height / 2),
      width: size.width,
      height: size.height,
    };
  });
  const edges = spec.edges.map((edge, index) => {
    const id = edgeId(index);
    const routed = graph.edge({ v: edge.from, w: edge.to, name: id }) as {
      points: PositionedPoint[];
    };
    return {
      id,
      ...edge,
      points: requireEdgePoints(routed.points.map(roundPoint)),
    };
  });

  return { nodes, edges };
}

function layoutTimeline(spec: DiagramSpec): RawLayout {
  let cursorX = 0;
  const nodes = spec.nodes.map((node, index) => {
    const size = measureNode(node);
    const positioned = {
      ...node,
      x: cursorX,
      y: index % 2 === 0 ? 0 : TIMELINE_ROW_OFFSET,
      width: size.width,
      height: size.height,
    };
    cursorX += size.width + TIMELINE_NODE_GAP;
    return positioned;
  });
  return { nodes, edges: positionDirectEdges(spec, nodes) };
}

function layoutComparison(spec: DiagramSpec): RawLayout {
  const groupIds = spec.groups?.map((group) => group.id) ?? [];
  const hasUngroupedNodes = spec.nodes.some((node) => node.group === undefined);
  const columnCount =
    groupIds.length > 0
      ? groupIds.length + Number(hasUngroupedNodes)
      : Math.min(2, spec.nodes.length);
  const rowsPerColumn = Math.ceil(spec.nodes.length / columnCount);
  const columnByNode = spec.nodes.map((node, index) => {
    if (groupIds.length === 0) {
      return Math.min(columnCount - 1, Math.floor(index / rowsPerColumn));
    }
    if (node.group === undefined) {
      return groupIds.length;
    }
    const column = groupIds.indexOf(node.group);
    if (column < 0) {
      throw new Error(`Cannot position node in unknown group: ${node.group}`);
    }
    return column;
  });
  const sizes = spec.nodes.map(measureNode);
  const columnWidths = Array.from({ length: columnCount }, (_, column) =>
    Math.max(
      ...sizes
        .filter((_, index) => columnByNode[index] === column)
        .map((size) => size.width),
      0,
    ),
  );
  const columnX: number[] = [];
  for (let column = 0; column < columnCount; column += 1) {
    const previousX = columnX[column - 1] ?? 0;
    const previousWidth = columnWidths[column - 1] ?? 0;
    columnX.push(
      column === 0
        ? 0
        : previousX + previousWidth + COMPARISON_COLUMN_GAP,
    );
  }
  const rowY = Array.from({ length: columnCount }, () => 0);
  const nodes = spec.nodes.map((node, index) => {
    const column = columnByNode[index];
    const size = sizes[index];
    if (column === undefined || size === undefined) {
      throw new Error(`Missing comparison position for node: ${node.id}`);
    }
    const positioned = {
      ...node,
      x: columnX[column] ?? 0,
      y: rowY[column] ?? 0,
      width: size.width,
      height: size.height,
    };
    rowY[column] = positioned.y + size.height + COMPARISON_ROW_GAP;
    return positioned;
  });
  return { nodes, edges: positionDirectEdges(spec, nodes) };
}

function layoutRelationship(spec: DiagramSpec): RawLayout {
  const sizes = spec.nodes.map(measureNode);
  const maxWidth = Math.max(...sizes.map((size) => size.width));
  const maxHeight = Math.max(...sizes.map((size) => size.height));
  const radius = Math.max(
    RELATIONSHIP_MIN_RADIUS,
    spec.nodes.length * RELATIONSHIP_RADIUS_PER_NODE,
  );
  const centerX = radius + maxWidth / 2;
  const centerY = radius + maxHeight / 2;
  const nodes = spec.nodes.map((node, index) => {
    const size = sizes[index];
    if (size === undefined) {
      throw new Error(`Missing relationship size for node: ${node.id}`);
    }
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / spec.nodes.length;
    return {
      ...node,
      x: round(centerX + Math.cos(angle) * radius - size.width / 2),
      y: round(centerY + Math.sin(angle) * radius - size.height / 2),
      width: size.width,
      height: size.height,
    };
  });
  return { nodes, edges: positionDirectEdges(spec, nodes) };
}

function normalizeLayout(spec: DiagramSpec, raw: RawLayout): PositionedDiagram {
  const rawGroups = positionGroups(spec, raw.nodes);
  const coordinates = [
    ...raw.nodes.flatMap((node) => [
      { x: node.x, y: node.y },
      { x: node.x + node.width, y: node.y + node.height },
    ]),
    ...raw.edges.flatMap((edge) => edge.points),
    ...rawGroups.flatMap((group) => [
      { x: group.x, y: group.y },
      { x: group.x + group.width, y: group.y + group.height },
    ]),
  ];
  const minX = Math.min(...coordinates.map((point) => point.x));
  const minY = Math.min(...coordinates.map((point) => point.y));
  const offsetX = CANVAS_MARGIN - minX;
  const offsetY = CANVAS_MARGIN - minY;
  const nodes = raw.nodes.map((node) => ({
    ...node,
    x: round(node.x + offsetX),
    y: round(node.y + offsetY),
  }));
  const edges = raw.edges.map((edge) => ({
    ...edge,
    points: requireEdgePoints(
      edge.points.map((point) =>
        roundPoint({ x: point.x + offsetX, y: point.y + offsetY }),
      ),
    ),
  }));
  const groups = rawGroups.map((group) => ({
    ...group,
    x: round(group.x + offsetX),
    y: round(group.y + offsetY),
  }));
  const maxX = Math.max(
    ...nodes.map((node) => node.x + node.width),
    ...edges.flatMap((edge) => edge.points.map((point) => point.x)),
    ...groups.map((group) => group.x + group.width),
  );
  const maxY = Math.max(
    ...nodes.map((node) => node.y + node.height),
    ...edges.flatMap((edge) => edge.points.map((point) => point.y)),
    ...groups.map((group) => group.y + group.height),
  );

  return {
    kind: spec.kind,
    title: spec.title,
    ...(spec.summary === undefined ? {} : { summary: spec.summary }),
    width: round(maxX + CANVAS_MARGIN),
    height: round(maxY + CANVAS_MARGIN),
    nodes,
    edges,
    groups,
  };
}

function positionGroups(
  spec: DiagramSpec,
  nodes: PositionedNode[],
): PositionedGroup[] {
  return (spec.groups ?? []).map((group) => {
    const members = nodes.filter((node) => node.group === group.id);
    if (members.length === 0) {
      throw new Error(`Cannot position empty group: ${group.id}`);
    }
    const minX = Math.min(...members.map((node) => node.x));
    const minY = Math.min(...members.map((node) => node.y));
    const maxX = Math.max(...members.map((node) => node.x + node.width));
    const maxY = Math.max(...members.map((node) => node.y + node.height));
    return {
      id: group.id,
      label: group.label,
      x: round(minX - GROUP_SIDE_PADDING),
      y: round(minY - GROUP_TOP_PADDING),
      width: round(maxX - minX + GROUP_SIDE_PADDING * 2),
      height: round(
        maxY - minY + GROUP_TOP_PADDING + GROUP_BOTTOM_PADDING,
      ),
    };
  });
}

function measureNode(node: DiagramNode): NodeSize {
  const lines = [node.label, ...(node.detail?.split("\n") ?? [])];
  const longestLine = Math.max(...lines.map((line) => Array.from(line).length));
  return {
    width: Math.min(
      NODE_MAX_WIDTH,
      Math.max(
        NODE_MIN_WIDTH,
        longestLine * NODE_TEXT_UNIT + NODE_HORIZONTAL_PADDING,
      ),
    ),
    height:
      NODE_BASE_HEIGHT +
      Math.max(0, lines.length - 1) * NODE_DETAIL_LINE_HEIGHT,
  };
}

function positionDirectEdges(
  spec: DiagramSpec,
  nodes: PositionedNode[],
): PositionedEdge[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return spec.edges.map((edge, index) => {
    const source = byId.get(edge.from);
    const target = byId.get(edge.to);
    if (source === undefined || target === undefined) {
      throw new Error(`Cannot position edge ${edge.from} -> ${edge.to}`);
    }
    return {
      id: edgeId(index),
      ...edge,
      points: [nodeCenter(source), nodeCenter(target)],
    };
  });
}

function nodeCenter(node: PositionedNode): PositionedPoint {
  return {
    x: round(node.x + node.width / 2),
    y: round(node.y + node.height / 2),
  };
}

function edgeId(index: number): string {
  return `edge-${index}`;
}

function requireEdgePoints(
  points: PositionedPoint[],
): [PositionedPoint, PositionedPoint, ...PositionedPoint[]] {
  const [start, end, ...rest] = points;
  if (start === undefined || end === undefined) {
    throw new Error("A positioned edge requires at least two points");
  }
  return [start, end, ...rest];
}

function roundPoint(point: PositionedPoint): PositionedPoint {
  return { x: round(point.x), y: round(point.y) };
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported diagram kind: ${String(value)}`);
}
