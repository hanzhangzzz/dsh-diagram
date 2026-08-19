import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";

import { DiagramView } from "./DiagramView.tsx";
import { DiagramPreviewNode } from "./DiagramPreviewNode.tsx";
import {
  DIAGRAM_PREVIEW_NODE_KIND,
  diagramPreviewDefinition,
} from "./preview-definition.ts";

/** Required client services. */
export const inject = ["slots", "conversationEvents"];

/**
 * Registers the session-scoped canvas view and the inline chat preview node.
 *
 * @param ctx DSH browser plugin context.
 */
export function apply(ctx: Context): void {
  ctx.slots.inject("conversation.view", () =>
    ctx.slots.register(
      {
        name: "conversation.view",
        id: "diagram",
        order: 20,
        label: "画布",
      },
      DiagramView,
    ),
  );
  ctx.conversationEvents.register(diagramPreviewDefinition);
  ctx.slots.inject("conversation.chat.node", () =>
    ctx.slots.register(
      {
        name: "conversation.chat.node",
        key: DIAGRAM_PREVIEW_NODE_KIND,
      },
      DiagramPreviewNode,
    ),
  );
}
