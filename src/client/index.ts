import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";

import { DiagramView } from "./DiagramView.tsx";

/** Required client services. */
export const inject = ["slots"];

/**
 * Registers the session-scoped canvas view.
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
}
