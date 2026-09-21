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

export const TEXT_COLOR = "#292c28";
export const MUTED_COLOR = "#60665e";
export const BORDER_COLOR = "#abb2a8";
export const SURFACE_COLOR = "#fffefb";
export const EMPHASIS_COLOR = "#f2e4cd";
export const EMPHASIS_BORDER_COLOR = "#92632f";
export const SOLID_TEXT_COLOR = "#ffffff";

export const REPORT_TITLE_FONT_SIZE = 36;
export const REPORT_SUMMARY_FONT_SIZE = 18;
export const STANDARD_TITLE_FONT_SIZE = 30;
export const STANDARD_SUMMARY_FONT_SIZE = 16;

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
  background: "#f5f5f0",
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

const NEUTRAL_PALETTE: Readonly<VisualPalette> = {
  fill: "#edeee7",
  stroke: "#abb2a8",
  ink: TEXT_COLOR,
  strong: TEXT_COLOR,
};

/** Neutral structure, dark outcomes, and a reserved risk accent. */
export const TONE_PALETTE: Readonly<Record<DiagramTone, VisualPalette>> = {
  neutral: NEUTRAL_PALETTE,
  definition: NEUTRAL_PALETTE,
  execution: NEUTRAL_PALETTE,
  external: NEUTRAL_PALETTE,
  evidence: NEUTRAL_PALETTE,
  risk: {
    fill: "#f8eae2",
    stroke: "#9b4c32",
    ink: "#8a402b",
    strong: "#9b4c32",
  },
  target: {
    fill: "#e4e8de",
    stroke: "#838e7c",
    ink: TEXT_COLOR,
    strong: TEXT_COLOR,
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

/** Group order alone carries no color meaning in the clean renderer. */
export const GROUP_PALETTE = [NEUTRAL_PALETTE] as const;

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
  if (style !== "sketchnote") return NEUTRAL_PALETTE;
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
