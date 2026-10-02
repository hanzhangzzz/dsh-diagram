import "@excalidraw/excalidraw/index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import {
  configureExcalidrawAssets,
  type ExcalidrawAssetTarget,
} from "./excalidrawAssets.ts";
import { loadLocale, resolveLocale, t } from "../core/i18n.ts";
import "./index.css";

const container = document.getElementById("root");
if (container === null) throw new Error("diagram editor root is missing");

const sessionId = new URLSearchParams(globalThis.location.search).get(
  "sessionId",
);

configureExcalidrawAssets(globalThis as ExcalidrawAssetTarget);

// Resolve the locale once up-front so both the <html lang> and page title agree,
// and every synchronous `t()` in the component tree is ready before mount.
const locale = resolveLocale();
document.documentElement.lang =
  locale === "ptBR" ? "pt-BR" : locale === "zh" ? "zh-CN" : "en";

void loadLocale(locale).then(() => import("./App.tsx")).then(({ DiagramApp }) => {
  document.title = t("page.title.editor");
  createRoot(container).render(
    <StrictMode>
      {sessionId === null || sessionId.trim() === "" ? (
        <main role="alert">{t("editor.missing.sessionId")}</main>
      ) : (
        <DiagramApp sessionId={sessionId} />
      )}
    </StrictMode>,
  );
});
