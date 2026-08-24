import type {
  DiagramTone,
  DiagramVisualStyle,
} from "../core/contracts.ts";

export {
  REPORT_GROUP_FONT_SIZE,
  STANDARD_GROUP_FONT_SIZE,
} from "../core/layout.ts";

/**
 * Excalidraw-free visual constants shared by the scene compiler and the chat
 * preview renderer. Keep this module import-light: the preview page must not
 * pull the Excalidraw editor bundle.
 */

export const TEXT_COLOR = "#1f2328";
export const MUTED_COLOR = "#667085";
export const BORDER_COLOR = "#98a2b3";
export const SURFACE_COLOR = "#ffffff";
export const EMPHASIS_COLOR = "#fef3c7";
export const EMPHASIS_BORDER_COLOR = "#d97706";
export const SOLID_TEXT_COLOR = "#ffffff";

export const REPORT_TITLE_FONT_SIZE = 36;
export const REPORT_SUMMARY_FONT_SIZE = 18;
export const STANDARD_TITLE_FONT_SIZE = 24;
export const STANDARD_SUMMARY_FONT_SIZE = 14;

/** Renderer-level tokens selected without changing diagram semantics. */
export interface DiagramVisualTokens {
  background: string;
  text: string;
  muted: string;
  border: string;
  surface: string;
  emphasis: string;
  emphasisBorder: string;
  solidText: string;
  fillStyle: "solid" | "hachure";
  roughness: 0 | 1;
  strokeWidth: 1 | 2;
  handwritten: boolean;
}

const CLEAN_TOKENS: Readonly<DiagramVisualTokens> = {
  background: "#ffffff",
  text: TEXT_COLOR,
  muted: MUTED_COLOR,
  border: BORDER_COLOR,
  surface: SURFACE_COLOR,
  emphasis: EMPHASIS_COLOR,
  emphasisBorder: EMPHASIS_BORDER_COLOR,
  solidText: SOLID_TEXT_COLOR,
  fillStyle: "solid",
  roughness: 0,
  strokeWidth: 1,
  handwritten: false,
};

const SKETCHNOTE_TOKENS: Readonly<DiagramVisualTokens> = {
  background: "#fffdf7",
  text: "#292621",
  muted: "#5f584f",
  border: "#292621",
  surface: "#fffaf0",
  emphasis: "#f6e6a8",
  emphasisBorder: "#292621",
  solidText: "#fffdf7",
  fillStyle: "hachure",
  roughness: 1,
  strokeWidth: 2,
  handwritten: true,
};

/** Resolves omission to the historical clean renderer. */
export function visualTokens(
  style: DiagramVisualStyle | undefined,
): Readonly<DiagramVisualTokens> {
  return style === "sketchnote" ? SKETCHNOTE_TOKENS : CLEAN_TOKENS;
}

/** One resolved fill/stroke/text color set for a semantic meaning. */
export interface VisualPalette {
  fill: string;
  stroke: string;
  ink: string;
  strong: string;
}

/** Stable color meanings shared by report regions and semantic nodes. */
export const TONE_PALETTE: Readonly<Record<DiagramTone, VisualPalette>> = {
  neutral: {
    fill: "#f8fafc",
    stroke: "#64748b",
    ink: "#334155",
    strong: "#334155",
  },
  definition: {
    fill: "#f8fbff",
    stroke: "#2563eb",
    ink: "#1d4ed8",
    strong: "#2563eb",
  },
  execution: {
    fill: "#f7fdf8",
    stroke: "#15803d",
    ink: "#166534",
    strong: "#15803d",
  },
  external: {
    fill: "#fffbeb",
    stroke: "#d97706",
    ink: "#b45309",
    strong: "#d97706",
  },
  evidence: {
    fill: "#fcfaff",
    stroke: "#7e22ce",
    ink: "#6b21a8",
    strong: "#7e22ce",
  },
  risk: {
    fill: "#fffafa",
    stroke: "#dc2626",
    ink: "#b91c1c",
    strong: "#dc2626",
  },
  target: {
    fill: "#f6fff8",
    stroke: "#166534",
    ink: "#14532d",
    strong: "#166534",
  },
};

/** Low-saturation marker washes with one near-black ink system. */
export const SKETCHNOTE_TONE_PALETTE: Readonly<
  Record<DiagramTone, VisualPalette>
> = {
  neutral: { fill: "#eee9df", stroke: "#292621", ink: "#292621", strong: "#70685e" },
  definition: { fill: "#dcecf3", stroke: "#292621", ink: "#292621", strong: "#8eb9ca" },
  execution: { fill: "#dfeee2", stroke: "#292621", ink: "#292621", strong: "#90b99a" },
  external: { fill: "#f5dfbd", stroke: "#292621", ink: "#292621", strong: "#d4a75f" },
  evidence: { fill: "#e8ddf0", stroke: "#292621", ink: "#292621", strong: "#ad92bf" },
  risk: { fill: "#f3d6ce", stroke: "#292621", ink: "#292621", strong: "#c98270" },
  target: { fill: "#eee5aa", stroke: "#292621", ink: "#292621", strong: "#b9a94f" },
};

/** Deterministic per-group tint cycle: band fill, band border, label ink. */
export const GROUP_PALETTE = [
  { fill: "#eff6ff", stroke: "#3b82f6", ink: "#1d4ed8" },
  { fill: "#fffbeb", stroke: "#f59e0b", ink: "#b45309" },
  { fill: "#ecfdf5", stroke: "#10b981", ink: "#047857" },
  { fill: "#f5f3ff", stroke: "#8b5cf6", ink: "#6d28d9" },
  { fill: "#fff1f2", stroke: "#f43f5e", ink: "#be123c" },
  { fill: "#ecfeff", stroke: "#06b6d4", ink: "#0e7490" },
] as const;

const SKETCHNOTE_GROUP_PALETTE = [
  { fill: "#dcecf3", stroke: "#292621", ink: "#292621" },
  { fill: "#f5dfbd", stroke: "#292621", ink: "#292621" },
  { fill: "#dfeee2", stroke: "#292621", ink: "#292621" },
  { fill: "#e8ddf0", stroke: "#292621", ink: "#292621" },
  { fill: "#f3d6ce", stroke: "#292621", ink: "#292621" },
  { fill: "#eee5aa", stroke: "#292621", ink: "#292621" },
] as const;

/**
 * Resolves the deterministic tint for one group position.
 * @param index Zero-based group input order.
 * @returns Cycled palette entry with the border reused as strong color.
 */
export function groupPalette(
  index: number,
  style?: DiagramVisualStyle,
): VisualPalette {
  const palette = style === "sketchnote"
    ? SKETCHNOTE_GROUP_PALETTE
    : GROUP_PALETTE;
  const entry = palette[index % palette.length];
  if (entry === undefined) {
    throw new Error("Group palette cycle cannot be empty");
  }
  return { ...entry, strong: entry.stroke };
}

/**
 * Resolves the semantic palette of one tone.
 * @param tone Stable tone meaning.
 * @returns The tone's fill, stroke, and text colors.
 */
export function tonePalette(
  tone: DiagramTone,
  style?: DiagramVisualStyle,
): VisualPalette {
  return style === "sketchnote"
    ? SKETCHNOTE_TONE_PALETTE[tone]
    : TONE_PALETTE[tone];
}
