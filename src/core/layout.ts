import dagre from "@dagrejs/dagre";

import type {
  DiagramGroup,
  DiagramKind,
  DiagramNode,
  DiagramSpec,
  ReportGroupDirection,
} from "./contracts.ts";

const CANVAS_MARGIN = 40;
const NODE_MIN_WIDTH = 168;
const NODE_MAX_WIDTH = 340;
/** Horizontal node padding; the scene compiler derives text width from it. */
export const NODE_PADDING_X = 32;
const NODE_PADDING_Y = 26;
/** Node text metrics shared with the scene compiler's text elements. */
export const LABEL_FONT_SIZE = 16;
export const DETAIL_FONT_SIZE = 13;
export const LABEL_LINE_HEIGHT = 22;
const DETAIL_LINE_HEIGHT = 18;
const REPORT_LABEL_FONT_SIZE = 18;
const REPORT_DETAIL_FONT_SIZE = 14;
const REPORT_LABEL_LINE_HEIGHT = 24;
const REPORT_DETAIL_LINE_HEIGHT = 20;
const REPORT_COMPACT_LABEL_FONT_SIZE = 14;
const REPORT_COMPACT_DETAIL_FONT_SIZE = 12;
const REPORT_COMPACT_LABEL_LINE_HEIGHT = 18;
const REPORT_COMPACT_DETAIL_LINE_HEIGHT = 16;
const DIRECTED_NODE_GAP = 56;
const DIRECTED_RANK_GAP = 96;
const BAND_MAX_CONTENT_WIDTH = 720;
const BAND_NODE_GAP = 24;
const BAND_ROW_GAP = 24;
const BAND_VERTICAL_GAP = 64;
const GROUP_SIDE_PADDING = 28;
const GROUP_TOP_PADDING = 52;
const GROUP_BOTTOM_PADDING = 28;
const TIMELINE_NODE_GAP = 88;
const TIMELINE_ROW_OFFSET = 128;
const COMPARISON_COLUMN_GAP = 96;
const COMPARISON_ROW_GAP = 48;
const RELATIONSHIP_MIN_RADIUS = 220;
const RELATIONSHIP_RADIUS_PER_NODE = 56;
const REPORT_MIN_WIDTH = 560;
const REPORT_COLUMN_GAP = 24;
const REPORT_REGION_GAP = 32;
const REPORT_GROUP_SIDE_PADDING = 24;
/** Reserved report-group header height used by native text positioning. */
export const REPORT_GROUP_TOP_PADDING = 64;
const REPORT_GROUP_BOTTOM_PADDING = 24;
const REPORT_NODE_GAP = 20;
const REPORT_MAIN_INNER_MIN_WIDTH = 260;

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
export interface PositionedGroup extends DiagramGroup {
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

/** Typography and box-density contract shared by layout and scene creation. */
export interface NodeTextStyle {
  minWidth: number;
  maxWidth: number;
  paddingX: number;
  paddingY: number;
  labelFontSize: number;
  detailFontSize: number;
  labelLineHeight: number;
  detailLineHeight: number;
}

const STANDARD_NODE_TEXT_STYLE: Readonly<NodeTextStyle> = {
  minWidth: NODE_MIN_WIDTH,
  maxWidth: NODE_MAX_WIDTH,
  paddingX: NODE_PADDING_X,
  paddingY: NODE_PADDING_Y,
  labelFontSize: LABEL_FONT_SIZE,
  detailFontSize: DETAIL_FONT_SIZE,
  labelLineHeight: LABEL_LINE_HEIGHT,
  detailLineHeight: DETAIL_LINE_HEIGHT,
};

const REPORT_NODE_TEXT_STYLE: Readonly<NodeTextStyle> = {
  minWidth: 220,
  maxWidth: 420,
  paddingX: 32,
  paddingY: 32,
  labelFontSize: REPORT_LABEL_FONT_SIZE,
  detailFontSize: REPORT_DETAIL_FONT_SIZE,
  labelLineHeight: REPORT_LABEL_LINE_HEIGHT,
  detailLineHeight: REPORT_DETAIL_LINE_HEIGHT,
};

const REPORT_COMPACT_NODE_TEXT_STYLE: Readonly<NodeTextStyle> = {
  minWidth: 140,
  maxWidth: 260,
  paddingX: 24,
  paddingY: 18,
  labelFontSize: REPORT_COMPACT_LABEL_FONT_SIZE,
  detailFontSize: REPORT_COMPACT_DETAIL_FONT_SIZE,
  labelLineHeight: REPORT_COMPACT_LABEL_LINE_HEIGHT,
  detailLineHeight: REPORT_COMPACT_DETAIL_LINE_HEIGHT,
};

/** Returns the exact text contract used for one generated node. */
export function nodeTextStyleFor(
  kind: DiagramKind,
  node: Pick<DiagramNode, "variant">,
): Readonly<NodeTextStyle> {
  if (kind !== "report") return STANDARD_NODE_TEXT_STYLE;
  return node.variant === "compact"
    ? REPORT_COMPACT_NODE_TEXT_STYLE
    : REPORT_NODE_TEXT_STYLE;
}

interface RawLayout {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  /** Explicit group frames; omission derives frames from member bounds. */
  groups?: PositionedGroup[];
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
      raw = layoutDirected(spec, "LR");
      break;
    case "architecture":
      raw = (spec.groups?.length ?? 0) > 0
        ? layoutBands(spec)
        : layoutDirected(spec, "LR");
      break;
    case "report":
      raw = layoutReport(spec);
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

interface BandRow {
  nodes: { node: DiagramNode; size: NodeSize }[];
  width: number;
  height: number;
}

interface Band {
  groupId: string | undefined;
  rows: BandRow[];
  height: number;
}

/**
 * Stacked-band layout for grouped architecture diagrams.
 *
 * Groups become vertically stacked bands in input order; ungrouped nodes form
 * a leading band. Nodes wrap into centered rows inside a shared content width
 * so every band container is equally wide, producing a dense two-dimensional
 * reading order instead of one long left-to-right rank chain.
 */
function layoutBands(spec: DiagramSpec): RawLayout {
  const bands: Band[] = [];
  const ungrouped = spec.nodes.filter((node) => node.group === undefined);
  if (ungrouped.length > 0) {
    bands.push(measureBand(undefined, ungrouped));
  }
  const groupById = new Map<string, DiagramGroup>();
  for (const group of spec.groups ?? []) {
    const members = spec.nodes.filter((node) => node.group === group.id);
    if (members.length === 0) {
      throw new Error(`Cannot position empty group: ${group.id}`);
    }
    groupById.set(group.id, group);
    bands.push(measureBand(group.id, members));
  }

  const contentWidth = Math.max(
    ...bands.flatMap((band) => band.rows.map((row) => row.width)),
  );
  const positioned = new Map<string, PositionedNode>();
  const frames: PositionedGroup[] = [];
  let cursorY = 0;
  for (const [index, band] of bands.entries()) {
    if (index > 0) {
      cursorY += bandGap(bands[index - 1], band);
    }
    let rowY = cursorY;
    for (const row of band.rows) {
      let rowX = (contentWidth - row.width) / 2;
      for (const { node, size } of row.nodes) {
        positioned.set(node.id, {
          ...node,
          x: round(rowX),
          y: round(rowY + (row.height - size.height) / 2),
          width: size.width,
          height: size.height,
        });
        rowX += size.width + BAND_NODE_GAP;
      }
      rowY += row.height + BAND_ROW_GAP;
    }
    if (band.groupId !== undefined) {
      const group = groupById.get(band.groupId);
      if (group === undefined) {
        throw new Error(`Missing band group: ${band.groupId}`);
      }
      frames.push({
        ...group,
        x: round(-GROUP_SIDE_PADDING),
        y: round(cursorY - GROUP_TOP_PADDING),
        width: round(contentWidth + GROUP_SIDE_PADDING * 2),
        height: round(
          band.height + GROUP_TOP_PADDING + GROUP_BOTTOM_PADDING,
        ),
      });
    }
    cursorY += band.height;
  }

  const nodes = spec.nodes.map((node) => {
    const placed = positioned.get(node.id);
    if (placed === undefined) {
      throw new Error(`Missing band position for node: ${node.id}`);
    }
    return placed;
  });
  // Frames follow spec.groups order because bands were built in that order.
  return { nodes, edges: positionDirectEdges(spec, nodes), groups: frames };
}

function measureBand(
  groupId: string | undefined,
  members: DiagramNode[],
): Band {
  const rows: BandRow[] = [];
  let current: BandRow = { nodes: [], width: 0, height: 0 };
  for (const node of members) {
    const size = measureNode(node);
    const appended = current.nodes.length === 0
      ? size.width
      : current.width + BAND_NODE_GAP + size.width;
    if (current.nodes.length > 0 && appended > BAND_MAX_CONTENT_WIDTH) {
      rows.push(current);
      current = { nodes: [], width: 0, height: 0 };
    }
    current.nodes.push({ node, size });
    current.width = current.nodes.length === 1
      ? size.width
      : current.width + BAND_NODE_GAP + size.width;
    current.height = Math.max(current.height, size.height);
  }
  rows.push(current);
  const height = rows.reduce((sum, row) => sum + row.height, 0)
    + (rows.length - 1) * BAND_ROW_GAP;
  return { groupId, rows, height };
}

/**
 * Vertical distance between the last row of one band and the first row of the
 * next, keeping the fixed clearance between group containers regardless of
 * whether either side carries a labeled container.
 */
function bandGap(previous: Band | undefined, next: Band): number {
  const previousPadding = previous?.groupId === undefined
    ? 0
    : GROUP_BOTTOM_PADDING;
  const nextPadding = next.groupId === undefined ? 0 : GROUP_TOP_PADDING;
  return previousPadding + BAND_VERTICAL_GAP + nextPadding;
}

interface ReportRow {
  nodes: { node: DiagramNode; size: NodeSize }[];
  width: number;
  height: number;
}

interface ReportGroupMeasurement {
  group: DiagramGroup;
  members: DiagramNode[];
  direction: ReportGroupDirection;
  innerWidth: number;
  contentHeight: number;
  rows: ReportRow[];
}

/**
 * Editorial board layout for evidence-backed reports.
 *
 * Top and bottom groups become full-width bands while main groups become
 * aligned columns. The model describes semantic regions only; all coordinates
 * and wrapping remain deterministic here.
 */
function layoutReport(spec: DiagramSpec): RawLayout {
  const groups = spec.groups ?? [];
  const topGroups = groups.filter((group) => group.placement === "top");
  const mainGroups = groups.filter(
    (group) => group.placement === undefined || group.placement === "main",
  );
  const bottomGroups = groups.filter((group) => group.placement === "bottom");
  if (mainGroups.length === 0) {
    throw new Error("A report diagram requires at least one main group");
  }

  const membersByGroup = new Map(
    groups.map((group) => [
      group.id,
      spec.nodes.filter((node) => node.group === group.id),
    ]),
  );
  const mainInnerWidths = mainGroups.map((group) =>
    Math.max(
      REPORT_MAIN_INNER_MIN_WIDTH,
      ...requireReportMembers(group, membersByGroup).map(
        (node) => measureReportNode(node).width,
      ),
    )
  );
  const initialBoardWidth = mainInnerWidths.reduce(
    (sum, width) => sum + width + REPORT_GROUP_SIDE_PADDING * 2,
    0,
  ) + REPORT_COLUMN_GAP * (mainGroups.length - 1);
  const boardWidth = Math.max(REPORT_MIN_WIDTH, initialBoardWidth);
  const distributedExtra = (boardWidth - initialBoardWidth) / mainGroups.length;
  const resolvedMainInnerWidths = mainInnerWidths.map(
    (width) => width + distributedExtra,
  );

  const positioned = new Map<string, PositionedNode>();
  const frameById = new Map<string, PositionedGroup>();
  let cursorY = 0;

  for (const group of topGroups) {
    const measurement = measureReportGroup(
      group,
      requireReportMembers(group, membersByGroup),
      boardWidth - REPORT_GROUP_SIDE_PADDING * 2,
      group.direction ?? "row",
    );
    placeReportGroup(
      measurement,
      0,
      cursorY,
      boardWidth,
      measurement.contentHeight
        + REPORT_GROUP_TOP_PADDING
        + REPORT_GROUP_BOTTOM_PADDING,
      positioned,
      frameById,
    );
    cursorY += measurement.contentHeight
      + REPORT_GROUP_TOP_PADDING
      + REPORT_GROUP_BOTTOM_PADDING
      + REPORT_REGION_GAP;
  }

  const mainMeasurements = mainGroups.map((group, index) =>
    measureReportGroup(
      group,
      requireReportMembers(group, membersByGroup),
      resolvedMainInnerWidths[index] ?? REPORT_MAIN_INNER_MIN_WIDTH,
      group.direction ?? "column",
    )
  );
  const mainHeight = Math.max(
    ...mainMeasurements.map(
      (measurement) =>
        measurement.contentHeight
        + REPORT_GROUP_TOP_PADDING
        + REPORT_GROUP_BOTTOM_PADDING,
    ),
  );
  let cursorX = 0;
  for (const measurement of mainMeasurements) {
    const groupWidth = measurement.innerWidth + REPORT_GROUP_SIDE_PADDING * 2;
    placeReportGroup(
      measurement,
      cursorX,
      cursorY,
      groupWidth,
      mainHeight,
      positioned,
      frameById,
    );
    cursorX += groupWidth + REPORT_COLUMN_GAP;
  }
  cursorY += mainHeight + REPORT_REGION_GAP;

  for (const [index, group] of bottomGroups.entries()) {
    const measurement = measureReportGroup(
      group,
      requireReportMembers(group, membersByGroup),
      boardWidth - REPORT_GROUP_SIDE_PADDING * 2,
      group.direction ?? "row",
    );
    const groupHeight = measurement.contentHeight
      + REPORT_GROUP_TOP_PADDING
      + REPORT_GROUP_BOTTOM_PADDING;
    placeReportGroup(
      measurement,
      0,
      cursorY,
      boardWidth,
      groupHeight,
      positioned,
      frameById,
    );
    cursorY += groupHeight + (index === bottomGroups.length - 1 ? 0 : REPORT_REGION_GAP);
  }

  const nodes = spec.nodes.map((node) => {
    const placed = positioned.get(node.id);
    if (placed === undefined) {
      throw new Error(`Report node must belong to a positioned group: ${node.id}`);
    }
    return placed;
  });
  const frames = groups.map((group) => {
    const frame = frameById.get(group.id);
    if (frame === undefined) {
      throw new Error(`Missing report group position: ${group.id}`);
    }
    return frame;
  });
  return { nodes, edges: positionReportEdges(spec, nodes), groups: frames };
}

function requireReportMembers(
  group: DiagramGroup,
  membersByGroup: Map<string, DiagramNode[]>,
): DiagramNode[] {
  const members = membersByGroup.get(group.id) ?? [];
  if (members.length === 0) {
    throw new Error(`Cannot position empty report group: ${group.id}`);
  }
  return members;
}

function measureReportGroup(
  group: DiagramGroup,
  members: DiagramNode[],
  innerWidth: number,
  direction: ReportGroupDirection,
): ReportGroupMeasurement {
  const rows = direction === "column"
    ? members.map((node) => {
        const size = measureReportNode(node);
        return {
          nodes: [{ node, size: { width: innerWidth, height: size.height } }],
          width: innerWidth,
          height: size.height,
        };
      })
    : packReportRows(members, innerWidth);
  const contentHeight = rows.reduce((sum, row) => sum + row.height, 0)
    + REPORT_NODE_GAP * (rows.length - 1);
  return { group, members, direction, innerWidth, contentHeight, rows };
}

function packReportRows(members: DiagramNode[], innerWidth: number): ReportRow[] {
  const rows: ReportRow[] = [];
  let current: ReportRow = { nodes: [], width: 0, height: 0 };
  for (const node of members) {
    const size = measureReportNode(node);
    const appendedWidth = current.nodes.length === 0
      ? size.width
      : current.width + REPORT_NODE_GAP + size.width;
    if (current.nodes.length > 0 && appendedWidth > innerWidth) {
      rows.push(current);
      current = { nodes: [], width: 0, height: 0 };
    }
    current.nodes.push({ node, size });
    current.width = current.nodes.length === 1
      ? size.width
      : current.width + REPORT_NODE_GAP + size.width;
    current.height = Math.max(current.height, size.height);
  }
  rows.push(current);
  return rows;
}

function placeReportGroup(
  measurement: ReportGroupMeasurement,
  x: number,
  y: number,
  width: number,
  height: number,
  positioned: Map<string, PositionedNode>,
  frameById: Map<string, PositionedGroup>,
): void {
  frameById.set(measurement.group.id, {
    ...measurement.group,
    x: round(x),
    y: round(y),
    width: round(width),
    height: round(height),
  });
  let rowY = y + REPORT_GROUP_TOP_PADDING;
  for (const row of measurement.rows) {
    let rowX = x + REPORT_GROUP_SIDE_PADDING
      + (measurement.innerWidth - row.width) / 2;
    for (const { node, size } of row.nodes) {
      positioned.set(node.id, {
        ...node,
        x: round(rowX),
        y: round(rowY + (row.height - size.height) / 2),
        width: round(size.width),
        height: round(size.height),
      });
      rowX += size.width + REPORT_NODE_GAP;
    }
    rowY += row.height + REPORT_NODE_GAP;
  }
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
  const rawGroups = raw.groups ?? positionGroups(spec, raw.nodes);
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
      ...group,
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
  return measureNodeWithStyle(node, STANDARD_NODE_TEXT_STYLE);
}

function measureReportNode(node: DiagramNode): NodeSize {
  return measureNodeWithStyle(node, nodeTextStyleFor("report", node));
}

function measureNodeWithStyle(
  node: DiagramNode,
  style: Readonly<NodeTextStyle>,
): NodeSize {
  const detailLines = node.detail?.split("\n") ?? [];
  const naturalWidth = Math.max(
    textWidth(node.label, style.labelFontSize),
    ...detailLines.map((line) => textWidth(line, style.detailFontSize)),
  );
  const width = Math.min(
    style.maxWidth,
    Math.max(style.minWidth, naturalWidth + style.paddingX),
  );
  const innerWidth = width - style.paddingX;
  const labelRows = wrappedRows(node.label, style.labelFontSize, innerWidth);
  const detailRows = detailLines.reduce(
    (sum, line) =>
      sum + wrappedRows(line, style.detailFontSize, innerWidth),
    0,
  );
  return {
    width,
    height:
      style.paddingY
      + labelRows * style.labelLineHeight
      + detailRows * style.detailLineHeight,
  };
}

/**
 * Deterministic text width estimate: CJK code points advance one full font
 * size, everything else a Latin average. This heuristic is shared by node
 * sizing and by wrapPlainText, so measured boxes and inserted line breaks
 * always agree.
 */
export function textWidth(line: string, fontSize: number): number {
  let width = 0;
  for (const char of line) {
    const codePoint = char.codePointAt(0) ?? 0;
    width += codePoint > 0x2e7f ? fontSize : fontSize * 0.55;
  }
  return width;
}

/**
 * Breaks text into explicit lines no wider than maxWidth under textWidth.
 *
 * Excalidraw's skeleton converter measures raw text and overwrites any given
 * width, so standalone text elements never soft-wrap; the only reliable wrap
 * is an explicit newline inserted here. Existing newlines are preserved and
 * a single grapheme never splits, so a line may exceed maxWidth only when
 * one character is wider than the whole budget.
 */
export function wrapPlainText(
  text: string,
  fontSize: number,
  maxWidth: number,
): string {
  const wrapped: string[] = [];
  for (const line of text.split("\n")) {
    let current = "";
    let currentWidth = 0;
    for (const char of line) {
      const charWidth = textWidth(char, fontSize);
      if (current !== "" && currentWidth + charWidth > maxWidth) {
        wrapped.push(current);
        current = "";
        currentWidth = 0;
      }
      current += char;
      currentWidth += charWidth;
    }
    wrapped.push(current);
  }
  return wrapped.join("\n");
}

function wrappedRows(
  line: string,
  fontSize: number,
  innerWidth: number,
): number {
  return wrapPlainText(line, fontSize, innerWidth).split("\n").length;
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

function positionReportEdges(
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
    const sourceCenter = nodeCenter(source);
    const targetCenter = nodeCenter(target);
    const horizontal = Math.abs(targetCenter.x - sourceCenter.x)
      >= Math.abs(targetCenter.y - sourceCenter.y);
    let points: PositionedPoint[];
    if (horizontal) {
      const forward = targetCenter.x >= sourceCenter.x;
      const start = {
        x: forward ? source.x + source.width : source.x,
        y: sourceCenter.y,
      };
      const end = {
        x: forward ? target.x : target.x + target.width,
        y: targetCenter.y,
      };
      const middleX = round((start.x + end.x) / 2);
      points = [
        start,
        { x: middleX, y: start.y },
        { x: middleX, y: end.y },
        end,
      ];
    } else {
      const forward = targetCenter.y >= sourceCenter.y;
      const start = {
        x: sourceCenter.x,
        y: forward ? source.y + source.height : source.y,
      };
      const end = {
        x: targetCenter.x,
        y: forward ? target.y : target.y + target.height,
      };
      const middleY = round((start.y + end.y) / 2);
      points = [
        start,
        { x: start.x, y: middleY },
        { x: end.x, y: middleY },
        end,
      ];
    }
    return {
      id: edgeId(index),
      ...edge,
      points: simplifyOrthogonalPoints(points),
    };
  });
}

function simplifyOrthogonalPoints(
  points: PositionedPoint[],
): [PositionedPoint, PositionedPoint, ...PositionedPoint[]] {
  const simplified: PositionedPoint[] = [];
  for (const rawPoint of points) {
    const point = roundPoint(rawPoint);
    const previous = simplified.at(-1);
    if (previous?.x === point.x && previous.y === point.y) continue;
    const beforePrevious = simplified.at(-2);
    if (
      beforePrevious !== undefined
      && previous !== undefined
      && (
        (beforePrevious.x === previous.x && previous.x === point.x)
        || (beforePrevious.y === previous.y && previous.y === point.y)
      )
    ) {
      simplified.pop();
    }
    simplified.push(point);
  }
  return requireEdgePoints(simplified);
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
