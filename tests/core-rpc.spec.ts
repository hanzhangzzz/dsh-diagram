import { describe, expect, it } from "vitest";

import { DEFAULT_DIAGRAM_VALIDATION_POLICY } from "../src/core/contracts.ts";
import {
  DIAGRAM_RPC_CHANNEL,
  DIAGRAM_RPC_ENDPOINTS,
  MAX_DIAGRAM_SESSION_ID_CHARS,
  createDiagramGetResultSchema,
  createDiagramListResultSchema,
  createDiagramRecordSchema,
  createDiagramSaveRequestSchema,
  createDiagramSaveResultSchema,
  diagramGetRequestSchema,
  diagramListRequestSchema,
  diagramSessionIdSchema,
} from "../src/core/rpc.ts";

const diagramId = "11111111-1111-4111-8111-111111111111";
const revision = "22222222-2222-4222-8222-222222222222";

function recordFixture() {
  return {
    id: diagramId,
    sessionId: "session-1",
    sessionFingerprint: { createdAt: 10, cwd: "/workspace" },
    title: "Request path",
    kind: "flow" as const,
    sourceSpec: {
      kind: "flow" as const,
      title: "Request path",
      nodes: [{ id: "client", label: "Client" }],
      edges: [],
    },
    revision,
    createdAt: 20,
    updatedAt: 20,
  };
}

describe("diagram RPC records", () => {
  it("validates a record and its denormalized provenance invariants", () => {
    const schema = createDiagramRecordSchema(
      DEFAULT_DIAGRAM_VALIDATION_POLICY,
    );
    const fixture = recordFixture();

    expect(schema.safeParse(fixture).success).toBe(true);
    expect(schema.safeParse({ ...fixture, kind: "timeline" }).success).toBe(
      false,
    );
    expect(schema.safeParse({ ...fixture, title: "Other" }).success).toBe(
      false,
    );
    expect(schema.safeParse({ ...fixture, updatedAt: 19 }).success).toBe(false);
    expect(
      schema.safeParse({
        ...fixture,
        sessionFingerprint: { createdAt: 21, cwd: "/workspace" },
      }).success,
    ).toBe(false);
    expect(schema.safeParse({ ...fixture, extra: true }).success).toBe(false);
  });
});

describe("diagram RPC endpoint payloads", () => {
  it("keeps the public channel and endpoint paths stable", () => {
    expect(DIAGRAM_RPC_CHANNEL).toBe("/diagram");
    expect(DIAGRAM_RPC_ENDPOINTS).toEqual(["list", "get", "save"]);
    expect(MAX_DIAGRAM_SESSION_ID_CHARS).toBe(512);
    expect(
      DIAGRAM_RPC_ENDPOINTS.map(
        (endpoint) => `${DIAGRAM_RPC_CHANNEL}/${endpoint}`,
      ),
    ).toEqual(["/diagram/list", "/diagram/get", "/diagram/save"]);
  });

  it("keeps transport and business outcomes separate with strict requests", () => {
    const policy = DEFAULT_DIAGRAM_VALIDATION_POLICY;
    const record = createDiagramRecordSchema(policy).parse(recordFixture());
    const summary = {
      id: record.id,
      title: record.title,
      kind: record.kind,
      revision: record.revision,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      hasScene: false,
    };

    expect(
      diagramListRequestSchema.safeParse({ sessionId: "session-1" }).success,
    ).toBe(true);
    expect(
      diagramListRequestSchema.safeParse({
        sessionId: "session-1",
        id: diagramId,
      }).success,
    ).toBe(false);
    expect(
      diagramListRequestSchema.safeParse({
        sessionId: "s".repeat(MAX_DIAGRAM_SESSION_ID_CHARS + 1),
      }).success,
    ).toBe(false);
    expect(
      diagramSessionIdSchema.safeParse(
        "s".repeat(MAX_DIAGRAM_SESSION_ID_CHARS),
      ).success,
    ).toBe(true);
    expect(
      diagramSessionIdSchema.safeParse(
        "s".repeat(MAX_DIAGRAM_SESSION_ID_CHARS + 1),
      ).success,
    ).toBe(false);
    expect(
      diagramGetRequestSchema.safeParse({ sessionId: "session-1", id: "bad" })
        .success,
    ).toBe(false);

    expect(
      createDiagramListResultSchema(policy).safeParse({
        ok: true,
        value: {
          diagrams: [summary],
          limits: { autosaveDebounceMs: 500, validationPolicy: policy },
        },
      }).success,
    ).toBe(true);
    expect(
      createDiagramGetResultSchema(policy).safeParse({
        ok: false,
        error: { code: "diagram-not-found", id: diagramId },
      }).success,
    ).toBe(true);
    expect(
      createDiagramSaveResultSchema(policy).safeParse({
        ok: false,
        error: { code: "version-conflict", current: record },
      }).success,
    ).toBe(true);

    const capacityError = {
      ok: false as const,
      error: {
        code: "storage-capacity" as const,
        scope: "global-bytes" as const,
        limitBytes: 10_000_000,
      },
    };
    for (const schema of [
      createDiagramListResultSchema(policy),
      createDiagramGetResultSchema(policy),
      createDiagramSaveResultSchema(policy),
    ]) {
      expect(schema.safeParse(capacityError).success).toBe(true);
      expect(
        schema.safeParse({
          ...capacityError,
          error: { ...capacityError.error, unexpected: true },
        }).success,
      ).toBe(false);
      expect(
        schema.safeParse({
          ...capacityError,
          error: { ...capacityError.error, limitBytes: 0 },
        }).success,
      ).toBe(false);
    }
  });

  it("validates the complete editable scene before a save can reach storage", () => {
    const schema = createDiagramSaveRequestSchema(
      DEFAULT_DIAGRAM_VALIDATION_POLICY,
    );
    const request = {
      sessionId: "session-1",
      id: diagramId,
      expectedRevision: revision,
      scene: {
        elements: [
          {
            id: "node-1",
            type: "rectangle",
            x: 0,
            y: 0,
            width: 160,
            height: 80,
            link: null,
          },
        ],
        appState: { viewBackgroundColor: "#ffffff", theme: "light" },
        files: {},
      },
    };

    expect(schema.safeParse(request).success).toBe(true);
    expect(
      schema.safeParse({
        ...request,
        scene: {
          ...request.scene,
          elements: [
            {
              ...request.scene.elements[0],
              link: "https://example.com",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });
});
