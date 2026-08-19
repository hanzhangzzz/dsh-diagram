import type { DiagramTone } from "../core/contracts.ts";

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
export const REPORT_GROUP_FONT_SIZE = 20;
export const STANDARD_TITLE_FONT_SIZE = 24;
export const STANDARD_SUMMARY_FONT_SIZE = 14;
export const STANDARD_GROUP_FONT_SIZE = 15;

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

/** Deterministic per-group tint cycle: band fill, band border, label ink. */
export const GROUP_PALETTE = [
  { fill: "#eff6ff", stroke: "#3b82f6", ink: "#1d4ed8" },
  { fill: "#fffbeb", stroke: "#f59e0b", ink: "#b45309" },
  { fill: "#ecfdf5", stroke: "#10b981", ink: "#047857" },
  { fill: "#f5f3ff", stroke: "#8b5cf6", ink: "#6d28d9" },
  { fill: "#fff1f2", stroke: "#f43f5e", ink: "#be123c" },
  { fill: "#ecfeff", stroke: "#06b6d4", ink: "#0e7490" },
] as const;

/**
 * Resolves the deterministic tint for one group position.
 * @param index Zero-based group input order.
 * @returns Cycled palette entry with the border reused as strong color.
 */
export function groupPalette(index: number): VisualPalette {
  const entry = GROUP_PALETTE[index % GROUP_PALETTE.length];
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
export function tonePalette(tone: DiagramTone): VisualPalette {
  return TONE_PALETTE[tone];
}
