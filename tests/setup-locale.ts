/**
 * Deterministic test locale.
 *
 * The editor/client resolve their UI strings from `navigator.language` (and a
 * stored override). On a developer machine that language reflects the host OS,
 * which would make string assertions non-deterministic across machines. Pin the
 * test default to English, and force the singleton table so `t()` is stable.
 * Tests that exercise i18n explicitly call `activateLocale(...)` themselves.
 */
import { activateLocale } from "../src/core/i18n.ts";

// Provide a stable `navigator`/`localStorage` regardless of environment
// (node pool, jsdom, or a leaked browser globals state from a prior test).
if (typeof globalThis.navigator === "undefined") {
  (globalThis as { navigator: unknown }).navigator = {};
}
try {
  Object.defineProperty(globalThis.navigator, "language", {
    value: "en-US",
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis.navigator, "languages", {
    value: ["en-US", "en"],
    writable: true,
    configurable: true,
  });
} catch {
  /* navigator.language is a read-only getter in some Node builds; ignore */
}

activateLocale("en");
