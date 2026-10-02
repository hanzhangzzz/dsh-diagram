import { useMemo, useState } from "react";
import type { ChatNodeViewProps } from "@deepseek-ai/dsh-client-ui-chat/client";
import type {} from "@deepseek-ai/dsh-client-ui-session/client";

import { writeCanvasDeepLink } from "../core/canvas-link.ts";
import { jumpToCanvasTab } from "./canvas-tab.ts";
import { clientString } from "./strings.ts";
import css from "./DiagramPreviewNode.module.css";

/** Renderer props without the locale kit: this row registers no locale NS. */
type DiagramPreviewNodeProps = Omit<
  ChatNodeViewProps<"dsh-diagram-preview">,
  "t"
>;

/** Inline chat preview of one created diagram's current canvas content. */
export function DiagramPreviewNode({
  node,
  sessionId,
}: DiagramPreviewNodeProps) {
  const [loaded, setLoaded] = useState(false);
  const previewUrl = useMemo(
    () =>
      "/diagram-assets/preview.html"
      + `?sessionId=${encodeURIComponent(sessionId)}`
      + `&diagramId=${encodeURIComponent(node.data.diagramId)}`,
    [sessionId, node.data.diagramId],
  );

  return (
    <section
      aria-busy={!loaded}
      aria-label={clientString("canvas.preview.aria", undefined, {
        title: node.data.title,
      })}
      className={css.root}
    >
      <header className={css.header}>
        <span className={css.title}>{node.data.title}</span>
        <button
          className={css.edit}
          onClick={(event) => {
            writeCanvasDeepLink(globalThis.sessionStorage ?? null, {
              sessionId,
              diagramId: node.data.diagramId,
            });
            jumpToCanvasTab(event.currentTarget);
          }}
          type="button"
        >
          {clientString("canvas.preview.edit")}
        </button>
      </header>
      <div className={css.body}>
        {!loaded && (
          <p className={css.loading} role="status">
            {clientString("canvas.preview.loading")}
          </p>
        )}
        <iframe
          className={css.frame}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          src={previewUrl}
          title={clientString("canvas.preview.aria", undefined, {
            title: node.data.title,
          })}
        />
      </div>
    </section>
  );
}
