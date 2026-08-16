import {
  FONT_FAMILY,
  convertToExcalidrawElements,
} from "@excalidraw/excalidraw";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";

import {
  EDITABLE_SCENE_ELEMENT_TYPES,
  createSceneSchema,
  type DiagramSpec,
  type DiagramValidationPolicy,
  type PersistedScene,
} from "../core/contracts.ts";
import {
  DETAIL_FONT_SIZE,
  LABEL_FONT_SIZE,
  LABEL_LINE_HEIGHT,
  layoutDiagram,
  NODE_PADDING_X,
  wrapPlainText,
  type PositionedDiagram,
} from "../core/layout.ts";

const APP_STATE_KEYS = [
  "viewBackgroundColor",
  "theme",
  "gridSize",
  "gridStep",
  "gridModeEnabled",
] as const;
const EDITABLE_TYPES = new Set<string>(EDITABLE_SCENE_ELEMENT_TYPES);
const TEXT_COLOR = "#1f2328";
const MUTED_COLOR = "#667085";
const BORDER_COLOR = "#98a2b3";
const SURFACE_COLOR = "#ffffff";
const EMPHASIS_COLOR = "#fef3c7";
const EMPHASIS_BORDER_COLOR = "#d97706";

/** Deterministic per-group tint cycle: band fill, band border, label ink. */
const GROUP_PALETTE = [
  { fill: "#eff6ff", stroke: "#3b82f6", ink: "#1d4ed8" },
  { fill: "#fffbeb", stroke: "#f59e0b", ink: "#b45309" },
  { fill: "#ecfdf5", stroke: "#10b981", ink: "#047857" },
  { fill: "#f5f3ff", stroke: "#8b5cf6", ink: "#6d28d9" },
  { fill: "#fff1f2", stroke: "#f43f5e", ink: "#be123c" },
  { fill: "#ecfeff", stroke: "#06b6d4", ink: "#0e7490" },
] as const;

function groupPalette(index: number): (typeof GROUP_PALETTE)[number] {
  const entry = GROUP_PALETTE[index % GROUP_PALETTE.length];
  if (entry === undefined) {
    throw new Error("Group palette cycle cannot be empty");
  }
  return entry;
}

/** Result of converting live editor state into durable JSON. */
export type EditorSceneResult =
  | { ok: true; scene: PersistedScene }
  | { ok: false; message: string };

/**
 * Converts semantic input into an editable scene with deterministic positions.
 *
 * @param spec Validated model-authored diagram semantics.
 * @param policy Active scene validation limits.
 * @returns Storage-valid initial Excalidraw scene.
 */
export function createInitialScene(
  spec: DiagramSpec,
  policy: Readonly<DiagramValidationPolicy>,
): PersistedScene {
  const skeletons = diagramToElementSkeletons(layoutDiagram(spec));
  const elements = convertToExcalidrawElements(skeletons, {
    regenerateIds: false,
  });
  const result = normalizeEditorScene(
    elements,
    { viewBackgroundColor: "#ffffff" },
    {},
    policy,
  );
  if (!result.ok) {
    throw new Error(`Initial diagram scene is invalid: ${result.message}`);
  }
  return result.scene;
}

/**
 * Maps editor-independent coordinates to Excalidraw element skeletons.
 *
 * @param diagram Deterministically positioned diagram.
 * @returns Stable-id editable primitives.
 */
export function diagramToElementSkeletons(
  diagram: PositionedDiagram,
): ExcalidrawElementSkeleton[] {
  const paletteByGroup = new Map(
    diagram.groups.map((group, index) => [group.id, groupPalette(index)]),
  );
  const groups: ExcalidrawElementSkeleton[] = diagram.groups.flatMap(
    (group, index) => {
      const palette = groupPalette(index);
      return [
        {
          type: "rectangle" as const,
          id: `group:${group.id}`,
          x: group.x,
          y: group.y,
          width: group.width,
          height: group.height,
          backgroundColor: palette.fill,
          fillStyle: "solid" as const,
          strokeColor: palette.stroke,
          strokeStyle: "solid" as const,
          roughness: 0,
          roundness: { type: 3 },
        },
        {
          type: "text" as const,
          id: `text:group:${group.id}`,
          x: group.x + 18,
          y: group.y + 14,
          text: group.label,
          fontFamily: FONT_FAMILY.Helvetica,
          fontSize: 15,
          strokeColor: palette.ink,
        },
      ];
    },
  );
  const edges: ExcalidrawElementSkeleton[] = diagram.edges.flatMap((edge) => {
    const [start, ...remaining] = edge.points;
    const end = remaining.at(-1);
    if (start === undefined || end === undefined) {
      throw new Error(`Positioned edge ${edge.id} has fewer than two points`);
    }
    const points = edge.points.map(
      (point) => [point.x - start.x, point.y - start.y] as [number, number],
    );
    const label = edge.label;
    return [
      {
        type: "arrow",
        id: `edge:${edge.id}`,
        x: start.x,
        y: start.y,
        points,
        start: { id: `node:${edge.from}` },
        end: { id: `node:${edge.to}` },
        strokeColor: MUTED_COLOR,
        roughness: 0,
        endArrowhead: "arrow",
      },
      ...(label === undefined
        ? []
        : [
            {
              type: "text" as const,
              id: `text:edge:${edge.id}`,
              // Vertical-ish edges get the label beside the line instead of
              // on top of it; horizontal-ish edges keep it centered above.
              ...(Math.abs(end.x - start.x) < Math.abs(end.y - start.y)
                ? {
                    x: (start.x + end.x) / 2 + 10,
                    y: (start.y + end.y) / 2 - 10,
                  }
                : {
                    x: (start.x + end.x) / 2 - Math.min(72, label.length * 4),
                    y: (start.y + end.y) / 2 - 24,
                  }),
              text: label,
              fontFamily: FONT_FAMILY.Helvetica,
              fontSize: 14,
              strokeColor: MUTED_COLOR,
            },
          ]),
    ];
  });
  const nodes: ExcalidrawElementSkeleton[] = [];
  for (const node of diagram.nodes) {
    const groupId = `node-group:${node.id}`;
    const palette = node.group === undefined
      ? undefined
      : paletteByGroup.get(node.group);
    const innerWidth = Math.max(32, node.width - NODE_PADDING_X);
    // The converter measures raw text and discards any provided width, so
    // both tiers are pre-wrapped with the same estimator that sized the box.
    const label = wrapPlainText(node.label, LABEL_FONT_SIZE, innerWidth);
    const labelRows = label.split("\n").length;
    nodes.push({
      type: "rectangle",
      id: `node:${node.id}`,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      groupIds: [groupId],
      backgroundColor: node.emphasis ? EMPHASIS_COLOR : SURFACE_COLOR,
      strokeColor: node.emphasis
        ? EMPHASIS_BORDER_COLOR
        : palette?.stroke ?? BORDER_COLOR,
      strokeWidth: node.emphasis ? 2 : 1,
      fillStyle: "solid",
      roughness: 0,
      roundness: { type: 3 },
    });
    nodes.push({
      type: "text",
      id: `text:node:${node.id}`,
      x: node.x + 16,
      y: node.y + 13,
      text: label,
      groupIds: [groupId],
      fontFamily: FONT_FAMILY.Helvetica,
      fontSize: LABEL_FONT_SIZE,
      strokeColor: TEXT_COLOR,
    });
    if (node.detail !== undefined) {
      nodes.push({
        type: "text",
        id: `detail:node:${node.id}`,
        x: node.x + 16,
        y: node.y + 13 + labelRows * LABEL_LINE_HEIGHT + 2,
        text: wrapPlainText(node.detail, DETAIL_FONT_SIZE, innerWidth),
        groupIds: [groupId],
        fontFamily: FONT_FAMILY.Helvetica,
        fontSize: DETAIL_FONT_SIZE,
        strokeColor: MUTED_COLOR,
      });
    }
  }
  // The header sits in negative y above the normalized content margin so a
  // wrapped summary can never collide with the first group container.
  const title: ExcalidrawElementSkeleton[] = [
    {
      type: "text",
      id: "diagram:title",
      x: 40,
      y: diagram.summary === undefined ? -44 : -76,
      text: diagram.title,
      fontFamily: FONT_FAMILY.Helvetica,
      fontSize: 24,
      strokeColor: TEXT_COLOR,
    },
    ...(diagram.summary === undefined
      ? []
      : [
          {
            type: "text" as const,
            id: "diagram:summary",
            x: 40,
            y: -40,
            text: wrapPlainText(
              diagram.summary,
              14,
              Math.min(720, Math.max(240, diagram.width - 80)),
            ),
            fontFamily: FONT_FAMILY.Helvetica,
            fontSize: 14,
            strokeColor: MUTED_COLOR,
          },
        ]),
  ];
  return [...groups, ...edges, ...nodes, ...title];
}

/**
 * Validates live Excalidraw data and retains only durable editor fields.
 *
 * @param elements Current Excalidraw elements.
 * @param appState Current Excalidraw application state.
 * @param files Current binary-file table.
 * @param policy Active scene validation limits.
 * @returns Valid persisted scene or actionable Chinese guidance.
 */
export function normalizeEditorScene(
  elements: unknown,
  appState: unknown,
  files: unknown,
  policy: Readonly<DiagramValidationPolicy>,
): EditorSceneResult {
  if (!Array.isArray(elements)) {
    return { ok: false, message: "画布元素格式无效。重新载入服务器版本。" };
  }
  for (const element of elements) {
    if (!isRecord(element)) continue;
    if (typeof element.type === "string" && !EDITABLE_TYPES.has(element.type)) {
      return {
        ok: false,
        message:
          "当前画布包含图片或嵌入内容。删除 image、iframe、embeddable 或 frame 元素后会继续自动保存。",
      };
    }
    if (element.link !== undefined && element.link !== null) {
      return {
        ok: false,
        message: "当前画布包含链接。移除元素链接后会继续自动保存。",
      };
    }
  }
  if (isRecord(files) && Object.keys(files).length > 0) {
    return {
      ok: false,
      message: "当前画布包含图片文件。删除图片后会继续自动保存。",
    };
  }

  const durableElements = elements.filter(
    (element) => !isRecord(element) || element.isDeleted !== true,
  );
  const candidate = {
    elements: jsonClone(durableElements),
    appState: pickAppState(appState),
    files: {},
  };
  const parsed = createSceneSchema(policy).safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      message: `当前画布超出保存限制：${issue?.message ?? "未知校验错误"}。精简元素或文字后会继续自动保存。`,
    };
  }
  return { ok: true, scene: parsed.data };
}

function pickAppState(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const selected: Record<string, unknown> = {};
  for (const key of APP_STATE_KEYS) {
    if (value[key] !== undefined) selected[key] = jsonClone(value[key]);
  }
  return selected;
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
