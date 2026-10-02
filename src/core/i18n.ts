/**
 * Locale resolution and translation for the diagram plugin UI.
 *
 * Messages live in `./messages/{en,zh,ptBR}.ts`, one module per language, so the
 * editor (Vite) can code-split and download only the active language's table.
 * The lightweight client never imports the full editor table — it uses the
 * `client` section of its own entry (see `src/client/strings.ts`).
 *
 * `t()` is synchronous; call `loadLocale()` once during editor boot so the
 * active table is populated before the first render. The skill prompt stays in
 * Chinese on purpose and is not routed through this module (model-facing text).
 */
import { en } from "./i18n/messages/en.ts";
import { zh } from "./i18n/messages/zh.ts";
import { ptBR } from "./i18n/messages/ptBR.ts";

export type Locale = "en" | "zh" | "ptBR";

export const SUPPORTED_LOCALES: readonly Locale[] = ["en", "zh", "ptBR"];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  zh: "中文",
  ptBR: "Português (BR)",
};

export const LOCALE_STORAGE_KEY = "dsh-diagram:locale:v1";

export type ClientKey = keyof typeof en.client;
export type EditorKey = keyof typeof en.editor;
export type MessageKey = ClientKey | EditorKey;

/** Tables hold the same keys per locale with `string` values (not literals). */
type ClientTable = Record<ClientKey, string>;
type EditorTable = Record<EditorKey, string>;

/** Per-locale message tables keyed by module `id` for the editor loader. */
const TABLES: Record<Locale, { client: ClientTable; editor: EditorTable }> = {
  en,
  zh,
  ptBR,
};

/** Effective locale: manual override → DSH preference → browser default. */
export type LocaleSource = keyof typeof TABLES;

function safeStorage(): Storage | null {
  try {
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

/** Map a browser/DSH locale string to a supported locale. */
export function detectLocale(input?: string | null): Locale {
  const raw = (input ?? "en").toLowerCase();
  if (raw.startsWith("pt")) return "ptBR";
  if (raw.startsWith("zh")) return "zh";
  return "en";
}

export function readStoredLocale(storage: Storage | null = safeStorage()): Locale | null {
  if (storage === null) return null;
  try {
    const value = storage.getItem(LOCALE_STORAGE_KEY);
    if (value === null) return null;
    return SUPPORTED_LOCALES.includes(value as Locale) ? (value as Locale) : null;
  } catch {
    return null;
  }
}

export function writeStoredLocale(locale: Locale, storage: Storage | null = safeStorage()): void {
  if (storage === null) return;
  try {
    storage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore storage failures (private mode / quota) */
  }
}

export interface LocaleResolution {
  preference?: string | null;
  navigatorLanguage?: string | null;
  storage?: Storage | null;
}

/**
 * Resolve the effective locale: manual override → DSH host preference → browser.
 * (`dsh-client-locale` only ships "zh"/"en"; pt-BR comes from the selector or
 * a `pt-*` browser locale.)
 */
export function resolveLocale(options?: LocaleResolution): Locale {
  const stored = readStoredLocale(options?.storage);
  if (stored !== null) return stored;
  if (options?.preference) return detectLocale(options.preference);
  if (options?.navigatorLanguage) return detectLocale(options.navigatorLanguage);
  return detectLocale(typeof navigator === "undefined" ? "en" : navigator.language);
}

export type MessageParams = Record<string, string | number>;

function interpolate(template: string, params?: MessageParams): string {
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

/** Active translated table; populated synchronously by `useLocale()`. */
let active: { client: ClientTable; editor: EditorTable } = TABLES[resolveLocale()];

/**
 * Switch the active locale and persist the override. The returned I18n holds a
 * stable reference to the table so callers can translate without re-reading the
 * module singleton mid-render.
 */
export function activateLocale(locale: Locale): void {
  active = TABLES[locale];
  writeStoredLocale(locale);
}

export interface I18n {
  readonly locale: Locale;
  t<T extends MessageKey>(key: T, params?: MessageParams): string;
}

export function createI18n(locale: Locale): I18n {
  return {
    locale,
    t(key, params) {
      const table = TABLES[locale];
      const value = lookup(table, key);
      return interpolate(value, params);
    },
  };
}

function lookup(table: { client: ClientTable; editor: EditorTable }, key: MessageKey): string {
  const clientValue = (table.client as Record<string, string>)[key];
  if (clientValue !== undefined) return clientValue;
  return (table.editor as Record<string, string>)[key] ?? key;
}

/** Module-level translator that always reads the currently active locale. */
export function t<T extends MessageKey>(key: T, params?: MessageParams): string {
  return interpolate(lookup(active, key), params);
}

export function currentLocale(): Locale {
  return resolveLocale();
}

/**
 * Asynchronous bootstrap for the editor: after the active locale is known,
 * resolve which table to keep. Kept for parity with the split-by-language
 * modules — Vite code-splits `messages/*` so only the active locale downloads
 * once the entry statically imports them (see `src/editor/i18n.ts`).
 */
export async function loadLocale(locale?: Locale): Promise<Locale> {
  const resolved = locale ?? resolveLocale();
  activateLocale(resolved);
  return resolved;
}
