import "@excalidraw/excalidraw/index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import {
  configureExcalidrawAssets,
  type ExcalidrawAssetTarget,
} from "./excalidrawAssets.ts";
import "./index.css";

const container = document.getElementById("root");
if (container === null) throw new Error("diagram editor root is missing");

const sessionId = new URLSearchParams(globalThis.location.search).get(
  "sessionId",
);

configureExcalidrawAssets(globalThis as ExcalidrawAssetTarget);

void import("./App.tsx").then(({ DiagramApp }) => {
  createRoot(container).render(
    <StrictMode>
      {sessionId === null || sessionId.trim() === "" ? (
        <main role="alert">缺少 sessionId。请从 DSH 会话的“画布”标签打开编辑器。</main>
      ) : (
        <DiagramApp sessionId={sessionId} />
      )}
    </StrictMode>,
  );
});
