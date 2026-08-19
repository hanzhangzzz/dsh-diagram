import { describe, expect, it } from "vitest";

import {
  DIAGRAM_KINDS,
  DIAGRAM_PREVIEW_META_KEY,
  createDiagramPreviewMeta,
  parseDiagramPreviewMeta,
} from "../src/core/diagram-kinds.ts";
import { DIAGRAM_KINDS as CONTRACT_KINDS } from "../src/core/contracts.ts";

const VALID = {
  diagramId: "0f8fad5b-d9cb-469f-a165-70867728950e",
  revision: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  title: "推荐结构",
  kind: "architecture",
} as const;

describe("diagram kinds module", () => {
  it("stays the single source re-exported by contracts", () => {
    expect(CONTRACT_KINDS).toBe(DIAGRAM_KINDS);
  });
});

describe("createDiagramPreviewMeta", () => {
  it("wraps the identity under the plugin-owned meta key", () => {
    const meta = createDiagramPreviewMeta(VALID);
    expect(meta).toEqual({ [DIAGRAM_PREVIEW_META_KEY]: VALID });
  });
});

describe("parseDiagramPreviewMeta", () => {
  it("round-trips a created meta payload", () => {
    expect(parseDiagramPreviewMeta(createDiagramPreviewMeta(VALID))).toEqual(
      VALID,
    );
  });

  it("returns null for non-objects, arrays, and missing marker", () => {
    expect(parseDiagramPreviewMeta(undefined)).toBeNull();
    expect(parseDiagramPreviewMeta(null)).toBeNull();
    expect(parseDiagramPreviewMeta("text")).toBeNull();
    expect(parseDiagramPreviewMeta([VALID])).toBeNull();
    expect(parseDiagramPreviewMeta({})).toBeNull();
    expect(parseDiagramPreviewMeta({ otherPlugin: VALID })).toBeNull();
  });

  it("rejects payloads with wrong field types or unknown kind", () => {
    const wrap = (patch: Record<string, unknown>) => ({
      [DIAGRAM_PREVIEW_META_KEY]: { ...VALID, ...patch },
    });
    expect(parseDiagramPreviewMeta(wrap({ diagramId: 7 }))).toBeNull();
    expect(parseDiagramPreviewMeta(wrap({ diagramId: "" }))).toBeNull();
    expect(parseDiagramPreviewMeta(wrap({ revision: undefined }))).toBeNull();
    expect(parseDiagramPreviewMeta(wrap({ title: 3 }))).toBeNull();
    expect(parseDiagramPreviewMeta(wrap({ kind: "mindmap" }))).toBeNull();
  });

  it("drops unknown extra fields instead of failing", () => {
    const meta = {
      [DIAGRAM_PREVIEW_META_KEY]: { ...VALID, futureField: true },
    };
    expect(parseDiagramPreviewMeta(meta)).toEqual(VALID);
  });

  it("keeps the module free of runtime dependencies", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(
        new URL("../src/core/diagram-kinds.ts", import.meta.url),
        "utf8",
      ),
    );
    expect(source).not.toMatch(/^\s*import\s+(?!type\b)/mu);
  });
});
