import { useMemo, useState } from "react";
import type { ConvViewProps } from "@deepseek-ai/dsh-client-ui-conversation/client";
import type {} from "@deepseek-ai/dsh-client-ui-session/client";

import { clientString } from "./strings.ts";
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
      aria-label={clientString("canvas.editor.aria")}
      className={css.root}
      data-conversation-composer-overlay=""
    >
      {!loaded && (
        <p className={css.loading} role="status">
          {clientString("canvas.editor.loading")}
        </p>
      )}
      <iframe
        allowFullScreen
        className={css.frame}
        onLoad={() => setLoaded(true)}
        src={editorUrl}
        title={clientString("canvas.editor.title")}
      />
    </section>
  );
}
