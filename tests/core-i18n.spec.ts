import { afterEach, describe, expect, it } from "vitest";
import {
  activateLocale,
  createI18n,
  detectLocale,
  resolveLocale,
  t,
  type Locale,
} from "../src/core/i18n.ts";

afterEach(() => activateLocale("en"));

describe("detectLocale", () => {
  it("defaults anything non-pt/zh to English", () => {
    expect(detectLocale("es-ES")).toBe("en");
    expect(detectLocale("fr")).toBe("en");
    expect(detectLocale("ja-JP")).toBe("en");
    expect(detectLocale("")).toBe("en");
    expect(detectLocale(undefined)).toBe("en");
  });

  it("maps pt-* to ptBR and zh-* to zh", () => {
    expect(detectLocale("pt-BR")).toBe("ptBR");
    expect(detectLocale("pt-PT")).toBe("ptBR");
    expect(detectLocale("zh-CN")).toBe("zh");
    expect(detectLocale("zh-TW")).toBe("zh");
  });
});

describe("resolveLocale", () => {
  it("honors a stored override above navigator and preference", () => {
    const storage = {
      getItem: () => "ptBR" as string | null,
      setItem: () => undefined,
    } as unknown as Storage;
    expect(
      resolveLocale({ storage, preference: "zh", navigatorLanguage: "en-US" }),
    ).toBe("ptBR");
  });

  it("falls back to navigation for an unknown locale", () => {
    expect(resolveLocale({ navigatorLanguage: "es-MX" })).toBe("en");
  });
});

describe("translation", () => {
  it("interpolates {name} params", () => {
    const i18n = createI18n("en");
    expect(i18n.t("canvas.preview.aria", { title: "Demo" })).toBe(
      "diagram preview: Demo",
    );
    expect(i18n.t("atlas.col.branches", { count: 3 })).toBe("Categories / 3");
  });

  it("switches languages via activateLocale", () => {
    activateLocale("zh");
    expect(t("canvas.tab")).toBe("画布");
    activateLocale("ptBR");
    expect(t("canvas.tab")).toBe("Canvas");
    activateLocale("en");
    expect(t("canvas.tab")).toBe("Canvas");
  });

  it("returns the key itself for an unknown key rather than throwing", () => {
    // Only english table is consulted; a typo'd key degrades to the key string.
    const i18n = createI18n("en");
    expect(i18n.t("does.not.exist" as never)).toBe("does.not.exist");
  });

  it("exposes the three supported locales with stable labels", () => {
    const locales: Locale[] = ["en", "zh", "ptBR"];
    for (const locale of locales) {
      expect(createI18n(locale).locale).toBe(locale);
    }
  });
});
