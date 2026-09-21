import type {
  DiagramSpec,
  PersistedScene,
} from "../../core/contracts.ts";
import {
  EDGE_LABEL_FONT_SIZE,
  edgeLabelBoxHeight,
  edgeLabelText,
  edgeLabelBoxWidth,
  layoutDiagram,
  NODE_ICON_SLOT_HEIGHT,
  nodeTextStyleFor,
  wrapPlainText,
  type PositionedDiagram,
  type PositionedPoint,
} from "../../core/layout.ts";
import {
  DIAGRAM_ICON_BOX_SIZE,
  diagramIconPrimitives,
} from "../diagram-icons.ts";
import {
  REPORT_GROUP_FONT_SIZE,
  REPORT_SUMMARY_FONT_SIZE,
  REPORT_TITLE_FONT_SIZE,
  STANDARD_GROUP_FONT_SIZE,
  STANDARD_SUMMARY_FONT_SIZE,
  STANDARD_TITLE_FONT_SIZE,
  SURFACE_COLOR,
  TEXT_COLOR,
  groupPalette,
  tonePalette,
  visualTokens,
} from "../visual-style.ts";

const SVG_NS = "http://www.w3.org/2000/svg";
const FONT_STACK = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const HANDWRITTEN_FONT_STACK = "Xiaolai, Excalifont, 'Kaiti SC', STKaiti, cursive";
const PADDING = 32;
const ARROWHEAD_LENGTH = 12;
const ARROWHEAD_WIDTH = 9;
const DEFAULT_LINE_HEIGHT = 1.25;

type SceneElement = PersistedScene["elements"][number];

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Renders one persisted scene as a static readable SVG.
 *
 * A deliberate simplification of Excalidraw's hand-drawn output: exact
 * geometry, colors, and text, without roughness strokes. Text nodes are built
 * with DOM APIs only, so scene text can never inject markup.
 *
 * @param doc Owner document used to create SVG nodes.
 * @param scene Validated persisted scene.
 * @returns Detached `<svg>` covering all visible elements.
 */
export function renderSceneSvg(
  doc: Document,
  scene: PersistedScene,
): SVGSVGElement {
  const visible = scene.elements.filter(
    (element) => element.isDeleted !== true,
  );
  const bounds = sceneBounds(visible);
  const svg = svgRoot(doc, bounds);
  const background = typeof scene.appState.viewBackgroundColor === "string"
    ? scene.appState.viewBackgroundColor
    : SURFACE_COLOR;
  svg.style.background = background === "transparent"
    ? SURFACE_COLOR
    : background;

  for (const element of visible) {
    const rendered = renderSceneElement(doc, element);
    if (rendered !== null) svg.append(rendered);
  }
  return svg;
}

/**
 * Renders the deterministic layout of one semantic spec as a static SVG.
 *
 * Used while a diagram has no saved scene yet: the same `layoutDiagram`
 * geometry the editor compiles from, drawn without Excalidraw.
 *
 * @param doc Owner document used to create SVG nodes.
 * @param spec Validated diagram semantics.
 * @returns Detached `<svg>` covering the laid-out diagram and its header.
 */
export function renderSpecSvg(doc: Document, spec: DiagramSpec): SVGSVGElement {
  const diagram = layoutDiagram(spec);
  const report = diagram.kind === "report";
  const titleFontSize = report
    ? REPORT_TITLE_FONT_SIZE
    : STANDARD_TITLE_FONT_SIZE;
  const summaryFontSize = report
    ? REPORT_SUMMARY_FONT_SIZE
    : STANDARD_SUMMARY_FONT_SIZE;
  const title = wrapPlainText(diagram.title, titleFontSize, Math.max(240, diagram.width - 80));
  const summary = diagram.summary === undefined ? undefined : wrapPlainText(
    diagram.summary, summaryFontSize, Math.min(report ? 960 : 720, Math.max(240, diagram.width - 80)),
  );
  const headerHeight = title.split("\n").length * titleFontSize * DEFAULT_LINE_HEIGHT
    + (diagram.summary === undefined
      ? 0
      : (summary?.split("\n").length ?? 1) * summaryFontSize * DEFAULT_LINE_HEIGHT + 12)
    + 24;
  const labelHalfWidths = diagram.edges
    .filter((edge) => edge.label !== undefined && edge.labelAnchor !== undefined)
    .map((edge) => ({
      anchor: edge.labelAnchor as PositionedPoint,
      half: edgeLabelBoxWidth(edge.label ?? "") / 2,
    }));
  const bounds: Bounds = {
    minX: Math.min(
      0,
      ...labelHalfWidths.map(({ anchor, half }) => anchor.x - half),
    ),
    minY: -headerHeight,
    maxX: Math.max(
      diagram.width,
      1,
      ...labelHalfWidths.map(({ anchor, half }) => anchor.x + half),
    ),
    maxY: Math.max(
      diagram.height,
      1,
      ...labelHalfWidths.map(({ anchor }) => anchor.y + 12),
    ),
  };
  const svg = svgRoot(doc, bounds);
  const tokens = visualTokens(diagram.visualStyle);
  svg.setAttribute("data-visual-style", diagram.visualStyle ?? "clean");
  svg.style.background = tokens.background;

  renderSpecHeader(doc, svg, diagram, titleFontSize, summaryFontSize, title, summary);
  renderSpecGroups(doc, svg, diagram);
  renderSpecEdges(doc, svg, diagram);
  renderSpecNodes(doc, svg, diagram);
  return svg;
}

function svgRoot(doc: Document, bounds: Bounds): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, "svg");
  const width = Math.max(bounds.maxX - bounds.minX, 1) + PADDING * 2;
  const height = Math.max(bounds.maxY - bounds.minY, 1) + PADDING * 2;
  svg.setAttribute(
    "viewBox",
    [bounds.minX - PADDING, bounds.minY - PADDING, width, height].join(" "),
  );
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("role", "img");
  return svg;
}

function sceneBounds(elements: readonly SceneElement[]): Bounds {
  const bounds: Bounds = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  let first = true;
  for (const element of elements) {
    const extents = elementExtents(element);
    if (first) {
      bounds.minX = extents.minX;
      bounds.minY = extents.minY;
      bounds.maxX = extents.maxX;
      bounds.maxY = extents.maxY;
      first = false;
      continue;
    }
    bounds.minX = Math.min(bounds.minX, extents.minX);
    bounds.minY = Math.min(bounds.minY, extents.minY);
    bounds.maxX = Math.max(bounds.maxX, extents.maxX);
    bounds.maxY = Math.max(bounds.maxY, extents.maxY);
  }
  return bounds;
}

function elementExtents(element: SceneElement): Bounds {
  if (
    (element.type === "line"
      || element.type === "arrow"
      || element.type === "freedraw")
    && element.points !== undefined
    && element.points.length > 0
  ) {
    const xs = element.points.map((point) => element.x + point[0]);
    const ys = element.points.map((point) => element.y + point[1]);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
  }
  return {
    minX: element.x,
    minY: element.y,
    maxX: element.x + element.width,
    maxY: element.y + element.height,
  };
}

function renderSceneElement(
  doc: Document,
  element: SceneElement,
): SVGElement | null {
  switch (element.type) {
    case "rectangle":
      return decorate(shapeRect(doc, element), element);
    case "diamond":
      return decorate(shapeDiamond(doc, element), element);
    case "ellipse":
      return decorate(shapeEllipse(doc, element), element);
    case "line":
    case "arrow":
      return decorate(shapeLinear(doc, element), element);
    case "freedraw":
      return decorate(shapeFreedraw(doc, element), element);
    case "text":
      return decorate(shapeText(doc, element), element);
    default:
      return null;
  }
}

function decorate(shape: SVGElement, element: SceneElement): SVGElement {
  shape.setAttribute("data-element-id", element.id);
  if (element.opacity !== undefined && element.opacity < 100) {
    shape.setAttribute("opacity", String(element.opacity / 100));
  }
  if (element.angle !== undefined && element.angle !== 0) {
    const cx = element.x + element.width / 2;
    const cy = element.y + element.height / 2;
    shape.setAttribute(
      "transform",
      `rotate(${String((element.angle * 180) / Math.PI)} ${String(cx)} ${String(cy)})`,
    );
  }
  return shape;
}

function applyPaint(shape: SVGElement, element: SceneElement): void {
  const stroke = element.strokeColor ?? TEXT_COLOR;
  const fill = element.backgroundColor ?? "transparent";
  shape.setAttribute("stroke", stroke === "transparent" ? "none" : stroke);
  shape.setAttribute("fill", fill === "transparent" ? "none" : fill);
  shape.setAttribute("stroke-width", String(element.strokeWidth ?? 2));
  if (
    element.fillStyle !== undefined
    && element.fillStyle !== "solid"
    && fill !== "transparent"
  ) {
    shape.setAttribute("fill-opacity", "0.35");
  }
  if (element.strokeStyle === "dashed") {
    shape.setAttribute("stroke-dasharray", "8 6");
  } else if (element.strokeStyle === "dotted") {
    shape.setAttribute("stroke-dasharray", "2 4");
  }
}

function shapeRect(doc: Document, element: SceneElement): SVGElement {
  const rect = doc.createElementNS(SVG_NS, "rect");
  rect.setAttribute("x", String(element.x));
  rect.setAttribute("y", String(element.y));
  rect.setAttribute("width", String(element.width));
  rect.setAttribute("height", String(element.height));
  if (element.roundness !== null && element.roundness !== undefined) {
    const radius = Math.min(
      32,
      element.roundness.value ?? 32,
      Math.min(element.width, element.height) * 0.25,
    );
    rect.setAttribute("rx", String(radius));
  }
  applyPaint(rect, element);
  return rect;
}

function shapeDiamond(doc: Document, element: SceneElement): SVGElement {
  const polygon = doc.createElementNS(SVG_NS, "polygon");
  const { x, y, width, height } = element;
  polygon.setAttribute(
    "points",
    [
      `${String(x + width / 2)},${String(y)}`,
      `${String(x + width)},${String(y + height / 2)}`,
      `${String(x + width / 2)},${String(y + height)}`,
      `${String(x)},${String(y + height / 2)}`,
    ].join(" "),
  );
  applyPaint(polygon, element);
  return polygon;
}

function shapeEllipse(doc: Document, element: SceneElement): SVGElement {
  const ellipse = doc.createElementNS(SVG_NS, "ellipse");
  ellipse.setAttribute("cx", String(element.x + element.width / 2));
  ellipse.setAttribute("cy", String(element.y + element.height / 2));
  ellipse.setAttribute("rx", String(element.width / 2));
  ellipse.setAttribute("ry", String(element.height / 2));
  applyPaint(ellipse, element);
  return ellipse;
}

function shapeLinear(doc: Document, element: SceneElement): SVGElement {
  const group = doc.createElementNS(SVG_NS, "g");
  const points = (element.points ?? []).map(
    (point) =>
      [element.x + point[0], element.y + point[1]] as [number, number],
  );
  const polyline = doc.createElementNS(SVG_NS, "path");
  polyline.setAttribute("d", element.roundness == null ? linearPathD(points) : roundedPathD(points));
  applyPaint(polyline, element);
  polyline.setAttribute("fill", "none");
  polyline.setAttribute("stroke-linecap", "round");
  polyline.setAttribute("stroke-linejoin", "round");
  group.append(polyline);

  const stroke = element.strokeColor ?? TEXT_COLOR;
  const isArrow = element.type === "arrow";
  const endHead = element.endArrowhead ?? (isArrow ? "arrow" : null);
  const startHead = element.startArrowhead ?? null;
  if (endHead !== null && points.length >= 2) {
    const tip = points[points.length - 1];
    const previous = points[points.length - 2];
    if (tip !== undefined && previous !== undefined) {
      group.append(
        arrowhead(doc, previous, tip, stroke, element.strokeWidth ?? 2),
      );
    }
  }
  if (startHead !== null && points.length >= 2) {
    const tip = points[0];
    const next = points[1];
    if (tip !== undefined && next !== undefined) {
      group.append(
        arrowhead(doc, next, tip, stroke, element.strokeWidth ?? 2),
      );
    }
  }
  return group;
}

/**
 * Builds a path with rounded corners through a polyline.
 * @param points Absolute polyline points.
 * @returns SVG path data with quadratic corner rounding.
 */
function linearPathD(points: readonly (readonly [number, number])[]): string {
  return points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${String(x)} ${String(y)}`).join(" ");
}

function roundedPathD(points: readonly (readonly [number, number])[]): string {
  if (points.length === 0) return "";
  const first = points[0] as readonly [number, number];
  if (points.length <= 2) {
    return points
      .map(([x, y], index) =>
        `${index === 0 ? "M" : "L"}${String(x)} ${String(y)}`,
      )
      .join(" ");
  }
  const parts = [`M${String(first[0])} ${String(first[1])}`];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1] as readonly [number, number];
    const corner = points[index] as readonly [number, number];
    const next = points[index + 1] as readonly [number, number];
    const inLength = Math.hypot(corner[0] - previous[0], corner[1] - previous[1]);
    const outLength = Math.hypot(next[0] - corner[0], next[1] - corner[1]);
    const radius = Math.min(12, inLength / 2, outLength / 2);
    if (radius < 1 || inLength === 0 || outLength === 0) {
      parts.push(`L${String(corner[0])} ${String(corner[1])}`);
      continue;
    }
    const inX = corner[0] - ((corner[0] - previous[0]) / inLength) * radius;
    const inY = corner[1] - ((corner[1] - previous[1]) / inLength) * radius;
    const outX = corner[0] + ((next[0] - corner[0]) / outLength) * radius;
    const outY = corner[1] + ((next[1] - corner[1]) / outLength) * radius;
    parts.push(
      `L${String(inX)} ${String(inY)}`,
      `Q${String(corner[0])} ${String(corner[1])} ${String(outX)} ${String(outY)}`,
    );
  }
  const last = points[points.length - 1] as readonly [number, number];
  parts.push(`L${String(last[0])} ${String(last[1])}`);
  return parts.join(" ");
}

function arrowhead(
  doc: Document,
  from: readonly [number, number],
  tip: readonly [number, number],
  stroke: string,
  strokeWidth: number,
): SVGElement {
  const angle = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
  const left = [
    tip[0] - ARROWHEAD_LENGTH * Math.cos(angle) + ARROWHEAD_WIDTH * Math.sin(angle),
    tip[1] - ARROWHEAD_LENGTH * Math.sin(angle) - ARROWHEAD_WIDTH * Math.cos(angle),
  ];
  const right = [
    tip[0] - ARROWHEAD_LENGTH * Math.cos(angle) - ARROWHEAD_WIDTH * Math.sin(angle),
    tip[1] - ARROWHEAD_LENGTH * Math.sin(angle) + ARROWHEAD_WIDTH * Math.cos(angle),
  ];
  const head = doc.createElementNS(SVG_NS, "polyline");
  head.setAttribute(
    "points",
    [
      `${String(left[0])},${String(left[1])}`,
      `${String(tip[0])},${String(tip[1])}`,
      `${String(right[0])},${String(right[1])}`,
    ].join(" "),
  );
  head.setAttribute("fill", "none");
  head.setAttribute("stroke", stroke === "transparent" ? "none" : stroke);
  head.setAttribute("stroke-width", String(strokeWidth));
  head.setAttribute("stroke-linecap", "round");
  return head;
}

function shapeFreedraw(doc: Document, element: SceneElement): SVGElement {
  const path = doc.createElementNS(SVG_NS, "path");
  const points = (element.points ?? []).map(
    (point) =>
      [element.x + point[0], element.y + point[1]] as [number, number],
  );
  const segments = points.map(
    ([x, y], index) =>
      `${index === 0 ? "M" : "L"}${String(x)} ${String(y)}`,
  );
  path.setAttribute("d", segments.join(" "));
  path.setAttribute("fill", "none");
  const stroke = element.strokeColor ?? TEXT_COLOR;
  path.setAttribute("stroke", stroke === "transparent" ? "none" : stroke);
  path.setAttribute(
    "stroke-width",
    String((element.strokeWidth ?? 2) * 2),
  );
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  return path;
}

function shapeText(doc: Document, element: SceneElement): SVGElement {
  const fontSize = element.fontSize ?? 16;
  const lineHeight = (element.lineHeight ?? DEFAULT_LINE_HEIGHT) * fontSize;
  const align = element.textAlign ?? "left";
  const anchorX = align === "center"
    ? element.x + element.width / 2
    : align === "right"
      ? element.x + element.width
      : element.x;
  const lines = (element.text ?? "").split("\n");
  const text = doc.createElementNS(SVG_NS, "text");
  text.setAttribute("x", String(anchorX));
  text.setAttribute("y", String(element.y));
  text.setAttribute(
    "text-anchor",
    align === "center" ? "middle" : align === "right" ? "end" : "start",
  );
  text.setAttribute("fill", element.strokeColor ?? TEXT_COLOR);
  text.setAttribute("font-size", String(fontSize));
  text.setAttribute(
    "font-family",
    element.fontFamily === 5 ? HANDWRITTEN_FONT_STACK : FONT_STACK,
  );
  for (const [index, line] of lines.entries()) {
    const tspan = doc.createElementNS(SVG_NS, "tspan");
    tspan.setAttribute("x", String(anchorX));
    // First baseline sits one ascent below the box top; ~0.8em approximates
    // the ascent the renderer cannot measure without font metrics.
    tspan.setAttribute(
      "y",
      String(element.y + fontSize * 0.8 + index * lineHeight),
    );
    tspan.textContent = line;
    text.append(tspan);
  }
  return text;
}

function renderSpecHeader(
  doc: Document,
  svg: SVGSVGElement,
  diagram: PositionedDiagram,
  titleFontSize: number,
  summaryFontSize: number,
  title: string,
  summary: string | undefined,
): void {
  const tokens = visualTokens(diagram.visualStyle);
  const centerX = diagram.width / 2;
  let cursor = -24;
  if (summary !== undefined) {
    cursor -= summary.split("\n").length * summaryFontSize * DEFAULT_LINE_HEIGHT;
    svg.append(specText(doc, {
      x: centerX,
      y: cursor,
      text: summary,
      fontSize: summaryFontSize,
      color: tokens.muted,
      anchor: "middle",
      handwritten: tokens.handwritten,
    }));
    cursor -= 12;
  }
  cursor -= title.split("\n").length * titleFontSize * DEFAULT_LINE_HEIGHT;
  svg.append(specText(doc, {
    x: centerX,
    y: cursor,
    text: title,
    fontSize: titleFontSize,
    color: tokens.text,
    anchor: "middle",
    bold: true,
    handwritten: tokens.handwritten,
  }));
}

function renderSpecGroups(
  doc: Document,
  svg: SVGSVGElement,
  diagram: PositionedDiagram,
): void {
  const tokens = visualTokens(diagram.visualStyle);
  const groupFontSize = diagram.kind === "report"
    ? REPORT_GROUP_FONT_SIZE
    : STANDARD_GROUP_FONT_SIZE;
  for (const [index, group] of diagram.groups.entries()) {
    const palette = group.tone === undefined
      ? groupPalette(index, diagram.visualStyle)
      : tonePalette(group.tone, diagram.visualStyle);
    const rect = doc.createElementNS(SVG_NS, "rect");
    rect.setAttribute("data-group-id", group.id);
    rect.setAttribute("x", String(group.x));
    rect.setAttribute("y", String(group.y));
    rect.setAttribute("width", String(group.width));
    rect.setAttribute("height", String(group.height));
    rect.setAttribute("rx", "12");
    rect.setAttribute("fill", palette.fill);
    rect.setAttribute("stroke", palette.stroke);
    rect.setAttribute("stroke-width", "1.5");
    if (tokens.roughness === 1) rect.setAttribute("fill-opacity", "0.62");
    svg.append(rect);
    svg.append(specText(doc, {
      x: group.x + 18,
      y: group.y + 14,
      text: group.label,
      fontSize: groupFontSize,
      color: palette.ink,
      anchor: "start",
      bold: true,
      handwritten: tokens.handwritten,
    }));
  }
}

function renderSpecEdges(
  doc: Document,
  svg: SVGSVGElement,
  diagram: PositionedDiagram,
): void {
  const tokens = visualTokens(diagram.visualStyle);
  for (const [index, edge] of diagram.edges.entries()) {
    const group = doc.createElementNS(SVG_NS, "g");
    group.setAttribute("data-edge-index", String(index));
    const polyline = doc.createElementNS(SVG_NS, "path");
    polyline.setAttribute(
      "d",
      linearPathD(edge.points.map((point) => [point.x, point.y] as const)),
    );
    polyline.setAttribute("fill", "none");
    polyline.setAttribute("stroke", tokens.muted);
    polyline.setAttribute("stroke-width", String(tokens.strokeWidth));
    polyline.setAttribute("stroke-linecap", "round");
    group.append(polyline);

    const tip = edge.points[edge.points.length - 1];
    const previous = edge.points[edge.points.length - 2];
    if (tip !== undefined && previous !== undefined) {
      group.append(arrowhead(
        doc,
        [previous.x, previous.y],
        [tip.x, tip.y],
        tokens.muted,
        tokens.strokeWidth,
      ));
    }
    if (edge.label !== undefined) {
      const middle = edge.labelAnchor ?? edgeMidpoint(edge.points);
      group.append(specText(doc, {
        x: middle.x,
        y: middle.y - edgeLabelBoxHeight(edge.label) / 2,
        text: edgeLabelText(edge.label),
        fontSize: EDGE_LABEL_FONT_SIZE,
        color: tokens.muted,
        anchor: "middle",
        handwritten: tokens.handwritten,
      }));
    }
    svg.append(group);
  }
}

function edgeMidpoint(
  points: readonly PositionedPoint[],
): PositionedPoint {
  return points[Math.floor(points.length / 2)] ?? points[0] ?? { x: 0, y: 0 };
}

function renderSpecNodes(
  doc: Document,
  svg: SVGSVGElement,
  diagram: PositionedDiagram,
): void {
  const tokens = visualTokens(diagram.visualStyle);
  const groupPalettes = new Map(
    diagram.groups.map((group, index) => [
      group.id,
      group.tone === undefined
        ? groupPalette(index, diagram.visualStyle)
        : tonePalette(group.tone, diagram.visualStyle),
    ]),
  );
  for (const node of diagram.nodes) {
    const palette = node.tone === undefined
      ? node.group === undefined
        ? undefined
        : groupPalettes.get(node.group)
      : tonePalette(node.tone, diagram.visualStyle);
    const solid = node.variant === "solid";
    const emphasized = node.emphasis === true;
    const fill = solid
      ? (palette?.strong ?? tokens.text)
      : emphasized
        ? (palette?.fill ?? tokens.emphasis)
        : (palette?.fill ?? tokens.surface);
    const stroke = emphasized
      ? (palette?.stroke ?? tokens.emphasisBorder)
      : (palette?.stroke ?? tokens.border);
    const labelColor = solid
      ? tokens.solidText
      : (palette?.ink ?? tokens.text);
    const detailColor = solid ? tokens.solidText : tokens.muted;

    const rect = doc.createElementNS(SVG_NS, "rect");
    rect.setAttribute("data-node-id", node.id);
    rect.setAttribute("x", String(node.x));
    rect.setAttribute("y", String(node.y));
    rect.setAttribute("width", String(node.width));
    rect.setAttribute("height", String(node.height));
    rect.setAttribute("rx", "10");
    rect.setAttribute("fill", fill);
    rect.setAttribute("stroke", stroke);
    rect.setAttribute("stroke-width", emphasized ? "2.5" : "1.5");
    if (tokens.roughness === 1) rect.setAttribute("fill-opacity", "0.62");
    svg.append(rect);

    if (node.icon !== undefined) {
      renderSpecIcon(doc, svg, node, labelColor);
    }

    const style = nodeTextStyleFor(diagram.kind, node);
    const textMaxWidth = node.width - style.paddingX;
    const labelLines = wrapPlainText(
      node.label,
      style.labelFontSize,
      textMaxWidth,
    ).split("\n");
    const detailLines = node.detail === undefined
      ? []
      : wrapPlainText(
        node.detail,
        style.detailFontSize,
        textMaxWidth,
      ).split("\n");
    const blockHeight = labelLines.length * style.labelLineHeight
      + (detailLines.length === 0
        ? 0
        : 4 + detailLines.length * style.detailLineHeight);
    const iconOffset = node.icon === undefined ? 0 : NODE_ICON_SLOT_HEIGHT;
    let cursor = node.y
      + iconOffset
      + (node.height - iconOffset - blockHeight) / 2;
    const centerX = node.x + node.width / 2;
    for (const line of labelLines) {
      svg.append(specText(doc, {
        x: centerX,
        y: cursor,
        text: line,
        fontSize: style.labelFontSize,
        color: labelColor,
        anchor: "middle",
        bold: true,
        handwritten: tokens.handwritten,
      }));
      cursor += style.labelLineHeight;
    }
    if (detailLines.length > 0) cursor += 4;
    for (const line of detailLines) {
      svg.append(specText(doc, {
        x: centerX,
        y: cursor,
        text: line,
        fontSize: style.detailFontSize,
        color: detailColor,
        anchor: "middle",
        handwritten: tokens.handwritten,
      }));
      cursor += style.detailLineHeight;
    }
  }
}

function renderSpecIcon(
  doc: Document,
  svg: SVGSVGElement,
  node: PositionedDiagram["nodes"][number],
  color: string,
): void {
  if (node.icon === undefined) return;
  const iconX = node.x + (node.width - DIAGRAM_ICON_BOX_SIZE) / 2;
  const iconY = node.y + 8;
  for (const primitive of diagramIconPrimitives(node.icon)) {
    const element = {
      id: `icon:node:${node.id}:${primitive.id}`,
      type: primitive.type,
      x: iconX + primitive.x,
      y: iconY + primitive.y,
      width: primitive.width,
      height: primitive.height,
      strokeColor: color,
      backgroundColor: "transparent",
      strokeWidth: 2,
      fillStyle: "solid",
      ...(primitive.points === undefined
        ? {}
        : { points: primitive.points.map(([x, y]) => [x, y]) }),
      ...(primitive.endArrowhead === undefined
        ? {}
        : { endArrowhead: primitive.endArrowhead }),
    } as unknown as SceneElement;
    const rendered = renderSceneElement(doc, element);
    if (rendered === null) continue;
    rendered.setAttribute("data-icon-node-id", node.id);
    rendered.setAttribute("data-icon-kind", node.icon);
    svg.append(rendered);
  }
}

interface SpecTextOptions {
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
  anchor: "start" | "middle";
  bold?: boolean;
  handwritten?: boolean;
}

function specText(doc: Document, options: SpecTextOptions): SVGElement {
  const text = doc.createElementNS(SVG_NS, "text");
  text.setAttribute("x", String(options.x));
  text.setAttribute("y", String(options.y + options.fontSize * 0.8));
  text.setAttribute("text-anchor", options.anchor);
  text.setAttribute("fill", options.color);
  text.setAttribute("font-size", String(options.fontSize));
  text.setAttribute(
    "font-family",
    options.handwritten === true ? HANDWRITTEN_FONT_STACK : FONT_STACK,
  );
  if (options.bold === true) text.setAttribute("font-weight", "600");
  for (const [index, line] of options.text.split("\n").entries()) {
    const span = doc.createElementNS(SVG_NS, "tspan");
    span.setAttribute("x", String(options.x));
    span.setAttribute("y", String(options.y + options.fontSize * (0.8 + index * DEFAULT_LINE_HEIGHT)));
    span.textContent = line;
    text.append(span);
  }
  return text;
}
