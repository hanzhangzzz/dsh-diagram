import { useMemo, useState } from "react";
import type { ConvViewProps } from "@deepseek-ai/dsh-client-ui-conversation/client";
import type {} from "@deepseek-ai/dsh-client-ui-session/client";

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
      aria-label="diagram Canvas"
      className={css.root}
      data-conversation-composer-overlay=""
    >
      {!loaded && (
        <p className={css.loading} role="status">
          Loading canvas editor…
        </p>
      )}
      <iframe
        allowFullScreen
        className={css.frame}
        onLoad={() => setLoaded(true)}
        src={editorUrl}
        title="diagram Canvas editor"
      />
    </section>
  );
}
