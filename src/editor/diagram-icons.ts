import type { DiagramIcon } from "../core/contracts.ts";

/** Import-light geometry shared by the Excalidraw scene and SVG preview. */
export interface DiagramIconPrimitive {
  id: string;
  type: "rectangle" | "ellipse" | "diamond" | "line" | "arrow";
  x: number;
  y: number;
  width: number;
  height: number;
  points?: readonly (readonly [number, number])[];
  endArrowhead?: "arrow";
}

const BOX = 40;

function rectangle(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
): DiagramIconPrimitive {
  return { id, type: "rectangle", x, y, width, height };
}

function ellipse(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
): DiagramIconPrimitive {
  return { id, type: "ellipse", x, y, width, height };
}

function line(
  id: string,
  points: readonly (readonly [number, number])[],
): DiagramIconPrimitive {
  const first = points[0] ?? [0, 0];
  const relative = points.map(([x, y]) => [x - first[0], y - first[1]] as const);
  const xs = relative.map(([x]) => x);
  const ys = relative.map(([, y]) => y);
  return {
    id,
    type: "line",
    x: first[0],
    y: first[1],
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    points: relative,
  };
}

function arrow(
  id: string,
  points: readonly (readonly [number, number])[],
): DiagramIconPrimitive {
  return { ...line(id, points), type: "arrow", endArrowhead: "arrow" };
}

/**
 * Returns deterministic line-art geometry in a 40x40 coordinate box.
 * The recipes contain no text, images, SVG paths, external assets, or links.
 */
export function diagramIconPrimitives(
  icon: DiagramIcon,
): readonly DiagramIconPrimitive[] {
  switch (icon) {
    case "document":
      return [
        rectangle("page", 7, 3, 27, 34),
        line("fold", [[25, 3], [25, 12], [34, 12]]),
        line("row-1", [[13, 19], [29, 19]]),
        line("row-2", [[13, 25], [29, 25]]),
        line("row-3", [[13, 31], [24, 31]]),
      ];
    case "database":
      return [
        ellipse("top", 5, 3, 30, 10),
        line("sides", [[5, 8], [5, 30], [35, 30], [35, 8]]),
        ellipse("middle", 5, 14, 30, 10),
        ellipse("bottom", 5, 25, 30, 10),
      ];
    case "search":
      return [
        ellipse("lens", 4, 4, 25, 25),
        line("handle", [[26, 26], [37, 37]]),
      ];
    case "gear":
      return [
        ellipse("rim", 8, 8, 24, 24),
        ellipse("hub", 15, 15, 10, 10),
        line("teeth-a", [[20, 1], [20, 8], [20, 32], [20, 39]]),
        line("teeth-b", [[1, 20], [8, 20], [32, 20], [39, 20]]),
        line("teeth-c", [[6, 6], [11, 11], [29, 29], [34, 34]]),
        line("teeth-d", [[34, 6], [29, 11], [11, 29], [6, 34]]),
      ];
    case "shield":
      return [
        line("outline", [[20, 2], [35, 8], [32, 27], [20, 38], [8, 27], [5, 8], [20, 2]]),
        line("check", [[12, 20], [18, 26], [29, 14]]),
      ];
    case "robot":
      return [
        rectangle("head", 5, 9, 30, 24),
        line("antenna", [[20, 2], [20, 9]]),
        ellipse("antenna-tip", 17, 0, 6, 6),
        ellipse("eye-left", 11, 16, 5, 5),
        ellipse("eye-right", 24, 16, 5, 5),
        line("mouth", [[13, 27], [27, 27]]),
        line("ear-left", [[1, 17], [5, 17], [5, 26], [1, 26]]),
        line("ear-right", [[35, 17], [39, 17], [39, 26], [35, 26]]),
      ];
    case "person":
      return [
        ellipse("head", 14, 2, 12, 12),
        line("body", [[20, 14], [20, 29]]),
        line("arms", [[7, 21], [20, 17], [33, 21]]),
        line("legs", [[20, 29], [10, 38], [20, 29], [30, 38]]),
      ];
    case "target":
      return [
        ellipse("outer", 3, 3, 34, 34),
        ellipse("middle", 10, 10, 20, 20),
        ellipse("center", 16, 16, 8, 8),
        arrow("aim", [[38, 2], [22, 18]]),
      ];
    case "warning":
      return [
        line("triangle", [[20, 2], [38, 36], [2, 36], [20, 2]]),
        line("mark", [[20, 12], [20, 25]]),
        ellipse("dot", 18, 29, 4, 4),
      ];
    case "chart":
      return [
        rectangle("frame", 3, 4, 34, 32),
        line("axes", [[9, 10], [9, 30], [32, 30]]),
        line("trend", [[11, 26], [17, 20], [22, 23], [31, 13]]),
        arrow("trend-head", [[27, 13], [31, 13], [31, 17]]),
      ];
    case "brain":
      return [
        ellipse("left", 3, 5, 21, 30),
        ellipse("right", 16, 5, 21, 30),
        line("center", [[20, 7], [20, 33]]),
        line("fold-left", [[7, 15], [14, 15], [11, 22], [17, 25]]),
        line("fold-right", [[33, 14], [26, 14], [29, 22], [23, 26]]),
      ];
    case "loop":
      return [
        arrow("top", [[6, 20], [9, 10], [20, 5], [31, 10], [34, 16]]),
        arrow("bottom", [[34, 20], [31, 30], [20, 35], [9, 30], [6, 24]]),
      ];
    default:
      return assertNever(icon);
  }
}

/** Fixed recipe coordinate extent used by both renderers. */
export const DIAGRAM_ICON_BOX_SIZE = BOX;

function assertNever(value: never): never {
  throw new Error(`Unsupported diagram icon: ${String(value)}`);
}
