import type {
  ChatConversationViewNode,
  ConversationNodeDefinition,
} from "@deepseek-ai/dsh-client-runtime/client";
import type { SessionEvent } from "@deepseek-ai/dsh-session/types";

import {
  parseDiagramPreviewMeta,
  type DiagramPreviewMeta,
} from "../core/diagram-kinds.ts";

/** Keyed chat renderer kind owned by this plugin. */
export const DIAGRAM_PREVIEW_NODE_KIND = "dsh-diagram-preview";

declare module "@deepseek-ai/dsh-client-ui-conversation/client" {
  interface ChatNodeDataMap {
    "dsh-diagram-preview": DiagramPreviewMeta;
  }
}

/** Durable per-diagram state replayed from one diagram_create tool result. */
export interface DiagramPreviewState extends DiagramPreviewMeta {
  readonly seq: number;
}

function previewMetaOf(event: SessionEvent): DiagramPreviewMeta | null {
  if (event.type !== "tool/result") return null;
  // The appended result is the single durable anchor; replace projections of
  // the same call must not open a second start for one diagram id.
  if (event.surfaceOp !== "append") return null;
  const data = event.data as { meta?: unknown } | undefined;
  return parseDiagramPreviewMeta(data?.meta);
}

/**
 * Single-event conversation node: one diagram_create tool/result opens one
 * preview row anchored at that result. The node carries only the durable
 * identity; the live scene is fetched by the renderer at display time.
 */
export const diagramPreviewDefinition: ConversationNodeDefinition<
  DiagramPreviewState
> = {
  kind: DIAGRAM_PREVIEW_NODE_KIND,
  target: "chat",
  match: (event) => {
    const meta = previewMetaOf(event);
    return meta === null ? null : { id: meta.diagramId, role: "start" };
  },
  start: (_context, match) => {
    const meta = previewMetaOf(match.event);
    if (meta === null) {
      throw new Error(
        "dsh-diagram-preview requires a diagram_create tool/result start",
      );
    }
    return { ...meta, seq: match.event.seq };
  },
  update: (context) => context.state,
  buildViewNode: (context): ChatConversationViewNode | null => {
    if (context.state === undefined) return null;
    const { seq, ...meta } = context.state;
    return {
      key: context.key,
      kind: DIAGRAM_PREVIEW_NODE_KIND,
      id: context.id,
      target: "chat",
      anchorSeq: seq,
      location: context.start?.location
        ?? context.matches[0]?.location
        ?? { kind: "unresolved" },
      visibility: "visible",
      data: meta,
    };
  },
};
