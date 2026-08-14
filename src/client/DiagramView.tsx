import { useMemo, useState } from "react";
import type { ConvViewProps } from "@deepseek-ai/dsh-client-ui-conversation/client";

import css from "./DiagramView.module.css";

/** Conversation tab that mounts the editor assets only while this view is active. */
export function DiagramView({ sessionId }: ConvViewProps) {
  const [loaded, setLoaded] = useState(false);
  const editorUrl = useMemo(
    () =>
      `/diagram-assets/index.html?sessionId=${encodeURIComponent(sessionId)}`,
    [sessionId],
  );

  return (
    <section
      aria-busy={!loaded}
      aria-label="diagram 画布"
      className={css.root}
      data-conversation-composer-overlay=""
    >
      {!loaded && (
        <p className={css.loading} role="status">
          正在加载画布编辑器…
        </p>
      )}
      <iframe
        className={css.frame}
        onLoad={() => setLoaded(true)}
        src={editorUrl}
        title="diagram 画布编辑器"
      />
    </section>
  );
}
