import {
  atlasInputError,
  type DiagramSpec,
  type DiagramNode,
} from "../core/contracts.ts";
import { wrapPlainText } from "../core/layout.ts";

/** Renderer-neutral native primitives; also used by the lightweight preview. */
export interface AtlasElement {
  [key: string]: unknown;
  id: string;
  type: "text" | "rectangle" | "line";
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  fontSize?: number;
}
const INK = "#27332f",
  MUTED = "#65726b",
  PAPER = "#f4f3ee";
const LINE = "#c9d0c8",
  GREEN = "#246b4b",
  WASH = "#e2ece3";
export const ATLAS_BACKGROUND = "#e8e9e3";

/** Two complementary views of exactly the same tree, never model-authored pixels. */
export function atlasSkeletons(spec: DiagramSpec): AtlasElement[] {
  const error = atlasInputError(spec);
  if (error) throw new Error(error);
  const all = new Map(spec.nodes.map((n) => [n.id, n]));
  const incoming = new Map(spec.edges.map((e) => [e.to, e]));
  const root = spec.nodes.find((n) => !incoming.has(n.id))!;
  const children = (id: string) =>
    spec.edges.filter((e) => e.from === id).map((e) => all.get(e.to)!);
  const branches = children(root.id);
  const out: AtlasElement[] = [];
  function put(e: AtlasElement) {
    let seed = 17;
    for (const c of e.id) seed = (seed * 31 + c.charCodeAt(0)) % 2147483647;
    out.push({
      angle: 0,
      strokeColor: INK,
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeStyle: "solid",
      strokeWidth: 1,
      roughness: 0,
      opacity: 100,
      seed,
      ...e,
    });
  }
  function box(
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    fill = PAPER,
    stroke = "transparent",
    group?: string,
  ) {
    put({
      id,
      type: "rectangle",
      x,
      y,
      width: w,
      height: h,
      backgroundColor: fill,
      strokeColor: stroke,
      roundness: { type: 3, value: 12 },
      ...(group ? { groupIds: [group] } : {}),
    });
  }
  function text(
    id: string,
    value: string,
    x: number,
    y: number,
    w: number,
    size = 16,
    color = INK,
    group?: string,
  ): number {
    const wrapped = wrapPlainText(value, size, w),
      height = wrapped.split("\n").length * size * 1.25;
    put({
      id,
      type: "text",
      x,
      y,
      width: w,
      height,
      text: wrapped,
      originalText: wrapped,
      fontFamily: 2,
      fontSize: size,
      lineHeight: 1.25,
      textAlign: "left",
      verticalAlign: "top",
      strokeColor: color,
      ...(group ? { groupIds: [group] } : {}),
    });
    return height;
  }
  function line(
    id: string,
    x: number,
    y: number,
    x2: number,
    y2: number,
    color = LINE,
  ) {
    put({
      id,
      type: "line",
      x,
      y,
      width: Math.abs(x2 - x),
      height: Math.abs(y2 - y),
      points: [
        [0, 0],
        [x2 - x, y2 - y],
      ],
      strokeColor: color,
    });
  }
  function nodeText(
    node: DiagramNode,
    id: string,
    x: number,
    y: number,
    w: number,
    size = 16,
    group?: string,
  ): number {
    let h = text(id, node.label, x, y, w, size, INK, group);
    if (node.detail)
      h +=
        6 +
        text(
          `detail-description:${id}`,
          node.detail,
          x,
          y + h + 6,
          w,
          14,
          MUTED,
          group,
        );
    return h;
  }
  let header = text("diagram:title", spec.title, 48, 32, 1184, 32);
  if (spec.summary)
    header +=
      14 +
      text(
        "diagram:summary",
        spec.summary,
        48,
        32 + header + 14,
        1184,
        16,
        MUTED,
      );
  const top = header + 104;
  const rowHeights = branches.map((b) =>
    Math.max(
      44,
      wrapPlainText(b.label, 18, 300).split("\n").length * 22.5 + 16,
      children(b.id).length * 7 + 12,
    ),
  );
  const rootTextHeight =
    wrapPlainText(root.label, 22, 238).split("\n").length * 27.5;
  const overviewHeight = Math.max(
    300,
    rowHeights.reduce((a, b) => a + b, 0) + 174,
    rootTextHeight + 214,
  );
  box("panel:overview", 24, top, 1232, overviewHeight);
  text(
    "panel:overview:title",
    "01  先看整体：分类与数量",
    56,
    top + 28,
    900,
    24,
  );
  text(
    "panel:overview:legend",
    "每根细条对应一个末级条目；完整名称与说明在下方明细。线表示归属，不表示时间顺序。",
    56,
    top + 68,
    1160,
    14,
    MUTED,
  );
  text("column:root", "整体", 64, top + 112, 220, 14, MUTED);
  text(
    "column:branch",
    `分类 / ${branches.length}`,
    410,
    top + 112,
    340,
    14,
    MUTED,
  );
  text(
    "column:leaf",
    `末级条目 / ${branches.reduce((n, b) => n + children(b.id).length, 0)}`,
    840,
    top + 112,
    350,
    14,
    MUTED,
  );
  const rootY = top + 150 + (overviewHeight - 174 - rootTextHeight - 40) / 2;
  box(
    "overview:root",
    56,
    rootY,
    282,
    rootTextHeight + 40,
    INK,
    "transparent",
    "overview-root",
  );
  text(
    "overview:root:label",
    root.label,
    78,
    rootY + 20,
    238,
    22,
    "#ffffff",
    "overview-root",
  );
  const rootCenter = rootY + (rootTextHeight + 40) / 2;
  let y = top + 148;
  const centers = rowHeights.map((h) => {
    const c = y + h / 2;
    y += h;
    return c;
  });
  line("overview:root:link", 338, rootCenter, 374, rootCenter, INK);
  line(
    "overview:spine",
    374,
    Math.min(rootCenter, centers[0]!),
    374,
    Math.max(rootCenter, centers.at(-1)!),
    INK,
  );
  branches.forEach((b, i) => {
    const cy = centers[i]!,
      group = `overview:${b.id}`,
      label = String(i + 1).padStart(2, "0") + "  " + b.label;
    const bh = wrapPlainText(label, 18, 330).split("\n").length * 22.5 + 20;
    line(`overview:link:${b.id}`, 374, cy, 410, cy, INK);
    box(
      `overview:box:${b.id}`,
      410,
      cy - bh / 2,
      370,
      bh,
      WASH,
      "transparent",
      group,
    );
    text(
      `overview:label:${b.id}`,
      label,
      426,
      cy - bh / 2 + 10,
      330,
      18,
      GREEN,
      group,
    );
    const leaves = children(b.id);
    if (leaves.length) {
      line(`overview:branch:${b.id}`, 780, cy, 814, cy, GREEN);
      line(
        `overview:fan:${b.id}`,
        814,
        cy - (leaves.length - 1) * 3.5,
        814,
        cy + (leaves.length - 1) * 3.5,
        GREEN,
      );
    }
    leaves.forEach((leaf, j) => {
      const my = cy - (leaves.length * 7 - 4) / 2 + j * 7;
      box(
        `mark:${leaf.id}`,
        842,
        my,
        250,
        4,
        WASH,
        GREEN,
        `mark-group:${leaf.id}`,
      );
      line(`overview:leaf:${leaf.id}`, 814, my + 2, 842, my + 2, GREEN);
    });
    text(
      `overview:count:${b.id}`,
      String(leaves.length),
      1120,
      cy - 12,
      60,
      20,
      GREEN,
    );
  });
  const detailTop = top + overviewHeight + 32;
  // All original text lives here exactly once, independently of overview compression.
  const detailElementsStart = out.length;
  text(
    "panel:detail:title",
    "02  再查明细：同一分类，完整条目",
    56,
    detailTop + 28,
    1140,
    24,
  );
  let dy = detailTop + 76;
  dy += nodeText(root, "detail:root", 56, dy, 1140, 18) + 24;
  const columns = Math.min(3, branches.length),
    gap = 24,
    cardW = (1168 - gap * (columns - 1)) / columns;
  for (let start = 0; start < branches.length; start += columns) {
    const bottoms: number[] = [];
    branches.slice(start, start + columns).forEach((b, j) => {
      const x = 56 + j * (cardW + gap),
        group = `detail:${b.id}`;
      let by = dy;
      const label = String(start + j + 1).padStart(2, "0") + "  " + b.label;
      by +=
        text(`detail:label:${b.id}`, label, x, by, cardW, 20, GREEN, group) + 8;
      if (b.detail)
        by +=
          text(
            `detail:description:${b.id}`,
            b.detail,
            x,
            by,
            cardW,
            14,
            MUTED,
            group,
          ) + 8;
      const parentLabel = incoming.get(b.id)?.label;
      if (parentLabel)
        by +=
          text(
            `detail:edge:${b.id}`,
            parentLabel,
            x,
            by,
            cardW,
            14,
            MUTED,
            group,
          ) + 8;
      line(`detail:rule:${b.id}`, x, by, x + cardW, by, GREEN);
      by += 16;
      for (const leaf of children(b.id)) {
        const g = `entry:${leaf.id}`;
        by +=
          nodeText(leaf, `detail:entry:${leaf.id}`, x, by, cardW, 16, g) + 8;
        const relation = incoming.get(leaf.id)?.label;
        if (relation)
          by +=
            text(
              `detail:edge:${leaf.id}`,
              relation,
              x,
              by,
              cardW,
              14,
              MUTED,
              g,
            ) + 8;
        line(`detail:separator:${leaf.id}`, x, by, x + cardW, by);
        by += 14;
      }
      bottoms.push(by);
    });
    dy = Math.max(...bottoms) + 32;
  }
  const details = out.splice(detailElementsStart);
  box("panel:detail", 24, detailTop, 1232, dy - detailTop + 8);
  out.push(...details);
  return out;
}

/** Select a reading panel from the current edited scene, never regenerate it. */
export function atlasViewElements<T extends { id: string }>(
  elements: readonly T[],
  view: "overview" | "detail",
): readonly T[] {
  const selected = elements.filter((e) => {
    const detail =
      e.id === "panel:detail" ||
      e.id.startsWith("panel:detail:") ||
      e.id.startsWith("detail:") ||
      e.id.startsWith("detail-description:");
    return view === "detail" ? detail : !detail;
  });
  return selected.length ? selected : elements;
}
