import type { DiagramSpec } from "../core/contracts.ts";
import { wrapPlainText } from "../core/layout.ts";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";

const PREFIX = "notes:";
const WIDTH = 940;
const COLUMN_WIDTH = 440;
const BODY_SIZE = 15;
const LINE_HEIGHT = 21;

export function hasNotes(spec: DiagramSpec): boolean {
  return spec.nodes.some(node => node.notes !== undefined);
}

/** Numbered references are authoring-time links, not a live synchronized data model. */
export function mainViewSpec(spec: DiagramSpec): DiagramSpec {
  let number = 0;
  return {...spec, nodes: spec.nodes.map(node => {
    if (node.notes === undefined) return node;
    const reference = `[${++number}]`;
    // Comparison labels identify shared rows; a note must not rename a criterion.
    return spec.kind === "comparison"
      ? {...node, detail: `${node.detail ?? ""} ${reference}`.trim()}
      : {...node, label: `${node.label} ${reference}`};
  })};
}

/** Both regions remain ordinary native text/lines and are included in all exports. */
export function notesSkeletons(spec: DiagramSpec, top: number): ExcalidrawElementSkeleton[] {
  const entries = spec.nodes.filter(node => node.notes !== undefined);
  if (entries.length === 0) return [];
  const result: ExcalidrawElementSkeleton[] = [];
  const text = (id: string, x: number, y: number, value: string, size: number) => {
    result.push({type: "text", id: PREFIX + id, x, y, text: value,
      fontSize: size, fontFamily: 2, strokeColor: "#34413b"});
  };
  text("title", 40, top, "补充说明 · 与主图编号对应", 24);
  text("boundary", 40, top + 38, "理解主结论必需的条件应留在主图；此处保留来源、例子与进一步解释。", 14);
  let y = top + 90;
  for (let i = 0; i < entries.length; i += 2) {
    let rowHeight = 0;
    for (let j = 0; j < 2; j += 1) {
      const node = entries[i + j];
      if (!node) continue;
      const x = 40 + j * (WIDTH / 2);
      const label = wrapPlainText(`[${i + j + 1}] ${node.label}`, 18, COLUMN_WIDTH);
      const body = wrapPlainText(node.notes!, BODY_SIZE, COLUMN_WIDTH);
      const labelHeight = label.split("\n").length * 25;
      text(`label:${node.id}`, x, y, label, 18);
      text(`body:${node.id}`, x, y + labelHeight + 12, body, BODY_SIZE);
      rowHeight = Math.max(rowHeight, labelHeight + 12 + body.split("\n").length * LINE_HEIGHT);
    }
    y += rowHeight + 38;
  }
  return result;
}

/** View selection only; it never rewrites or hides content from saved scenes/exports. */
export function noteViewElements<T extends {id: string}>(elements: readonly T[], view: "main" | "notes"): readonly T[] {
  return elements.filter(element => element.id.startsWith(PREFIX) === (view === "notes"));
}
