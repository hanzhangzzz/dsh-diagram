/**
 * Client-only message table.
 *
 * The browser client entry (`lib/client.js`) must stay a small single-file CJS
 * artifact. Importing `src/core/i18n.ts` would pull the full 3-locale editor
 * table (~240 strings) into it, so instead this module keeps just the seven
 * strings the client needs (tab label + chat preview card), in all three
 * languages. The editor code-splits its own, larger table via `src/core/i18n.ts`.
 */
import type { Locale, MessageParams } from "../core/i18n.ts";

export const CLIENT_STRINGS = {
  en: {
    "canvas.tab": "Canvas",
    "canvas.editor.loading": "Loading canvas editor…",
    "canvas.editor.aria": "diagram Canvas",
    "canvas.editor.title": "diagram Canvas editor",
    "canvas.preview.edit": "Edit in canvas",
    "canvas.preview.loading": "Loading diagram preview…",
    "canvas.preview.aria": "diagram preview: {title}",
  },
  zh: {
    "canvas.tab": "画布",
    "canvas.editor.loading": "正在加载画布编辑器…",
    "canvas.editor.aria": "diagram 画布",
    "canvas.editor.title": "diagram 画布编辑器",
    "canvas.preview.edit": "在画布中编辑",
    "canvas.preview.loading": "正在加载图表预览…",
    "canvas.preview.aria": "diagram 预览：{title}",
  },
  ptBR: {
    "canvas.tab": "Canvas",
    "canvas.editor.loading": "Carregando editor de Canvas…",
    "canvas.editor.aria": "diagrama Canvas",
    "canvas.editor.title": "editor de Canvas do diagrama",
    "canvas.preview.edit": "Editar no Canvas",
    "canvas.preview.loading": "Carregando visualização do diagrama…",
    "canvas.preview.aria": "visualização do diagrama: {title}",
  },
} as const;

export type ClientStringKey = keyof (typeof CLIENT_STRINGS)["en"];

/** Resolve the storage used to read the locale override (session-safe). */
function clientStorage(): Storage | null {
  try {
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

function interpolate(template: string, params?: MessageParams): string {
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

/**
 * Resolve the client tab label from the persisted override → browser locale,
 * defaulting to English for anything that is not pt-* or zh-*.
 */
export function clientTabLabel(storage: Storage | null = clientStorage()): string {
  return clientString("canvas.tab", storage);
}

export function clientString(
  key: ClientStringKey,
  storage: Storage | null = clientStorage(),
  params?: MessageParams,
): string {
  const locale = readClientLocale(storage);
  return interpolate(CLIENT_STRINGS[locale][key], params);
}

function readClientLocale(storage: Storage | null): Locale {
  if (storage !== null) {
    try {
      const value = storage.getItem("dsh-diagram:locale:v1");
      if (value === "en" || value === "zh" || value === "ptBR") return value;
    } catch {
      /* ignore */
    }
  }
  const lang =
    typeof navigator === "undefined" ? "en" : (navigator.language ?? "en");
  const raw = lang.toLowerCase();
  if (raw.startsWith("pt")) return "ptBR";
  if (raw.startsWith("zh")) return "zh";
  return "en";
}
