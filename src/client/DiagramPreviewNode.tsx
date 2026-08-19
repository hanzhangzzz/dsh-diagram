import { useMemo, useState } from "react";
import type { ChatNodeViewProps } from "@deepseek-ai/dsh-client-ui-conversation/client";

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
      aria-label={`diagram 预览：${node.data.title}`}
      className={css.root}
    >
      <header className={css.header}>
        <span className={css.title}>{node.data.title}</span>
        <span className={css.hint}>在「画布」标签中编辑</span>
      </header>
      <div className={css.body}>
        {!loaded && (
          <p className={css.loading} role="status">
            正在加载图表预览…
          </p>
        )}
        <iframe
          className={css.frame}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          src={previewUrl}
          title={`diagram 预览：${node.data.title}`}
        />
      </div>
    </section>
  );
}
