/**
 * Diagram kind vocabulary plus the tool-result preview meta contract.
 *
 * This module must stay free of runtime imports: the DSH client bundle inlines
 * everything it touches, and the chat preview node only needs these small
 * definitions — pulling zod or the full contracts through it would bloat the
 * lightweight client entry.
 */

/** Diagram forms supported by the first plugin release. */
export const DIAGRAM_KINDS = [
  "flow",
  "architecture",
  "report",
  "timeline",
  "hierarchy",
  "comparison",
  "relationship",
] as const;

/** A supported semantic diagram form. */
export type DiagramKind = (typeof DIAGRAM_KINDS)[number];

/** Plugin-owned marker key inside the persisted tool/result meta payload. */
export const DIAGRAM_PREVIEW_META_KEY = "dshDiagramPreview";

/**
 * Durable identity replayed to the chat preview node for one created diagram.
 * A type alias (not an interface) so it stays assignable to JsonValue-style
 * index signatures at the tool presentation boundary.
 */
export type DiagramPreviewMeta = {
  readonly diagramId: string;
  readonly revision: string;
  readonly title: string;
  readonly kind: DiagramKind;
};

/**
 * Wraps one created diagram's identity under the plugin-owned meta key.
 * @param meta Identity of the diagram the tool call just created.
 * @returns JSON-serializable payload for the tool/result presentation meta.
 */
export function createDiagramPreviewMeta(
  meta: DiagramPreviewMeta,
): Record<typeof DIAGRAM_PREVIEW_META_KEY, DiagramPreviewMeta> {
  return {
    [DIAGRAM_PREVIEW_META_KEY]: {
      diagramId: meta.diagramId,
      revision: meta.revision,
      title: meta.title,
      kind: meta.kind,
    },
  };
}

/**
 * Extracts this plugin's preview identity from an untrusted meta payload.
 * @param value tool/result meta as replayed from the session log.
 * @returns The parsed identity, or null when the payload is not ours or invalid.
 */
export function parseDiagramPreviewMeta(
  value: unknown,
): DiagramPreviewMeta | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const candidate = (value as Record<string, unknown>)[
    DIAGRAM_PREVIEW_META_KEY
  ];
  if (
    typeof candidate !== "object"
    || candidate === null
    || Array.isArray(candidate)
  ) {
    return null;
  }
  const { diagramId, revision, title, kind } = candidate as Record<
    string,
    unknown
  >;
  if (typeof diagramId !== "string" || diagramId.length === 0) return null;
  if (typeof revision !== "string" || revision.length === 0) return null;
  if (typeof title !== "string") return null;
  if (
    typeof kind !== "string"
    || !(DIAGRAM_KINDS as readonly string[]).includes(kind)
  ) {
    return null;
  }
  return { diagramId, revision, title, kind: kind as DiagramKind };
}
