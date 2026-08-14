import { z } from "zod";
import type { SessionId } from "@deepseek-ai/dsh-session/types";

import {
  DIAGRAM_KINDS,
  createDiagramSpecSchema,
  createSceneSchema,
  diagramValidationPolicySchema,
  type DiagramKind,
  type DiagramSpec,
  type DiagramValidationPolicy,
  type PersistedScene,
} from "./contracts.ts";

/** Same-origin RPC channel registered by the Host and called by the editor. */
export const DIAGRAM_RPC_CHANNEL = "/diagram";

/** Methods supported by the diagram RPC channel. */
export const DIAGRAM_RPC_ENDPOINTS = ["list", "get", "save"] as const;

/** One method supported by the diagram RPC channel. */
export type DiagramRpcEndpoint = (typeof DIAGRAM_RPC_ENDPOINTS)[number];

/** UUID identifying one diagram independently of its title. */
export const diagramIdSchema = z.uuid().brand<"DiagramId">();

/** Opaque diagram identifier accepted at RPC and durable-data inputs. */
export type DiagramId = z.infer<typeof diagramIdSchema>;

/** UUID replaced after every material scene update. */
export const diagramRevisionSchema = z.uuid().brand<"DiagramRevision">();

/** Opaque revision used for compare-and-swap writes. */
export type DiagramRevision = z.infer<typeof diagramRevisionSchema>;

/** Fixed protocol limit for session identifiers crossing diagram wire inputs. */
export const MAX_DIAGRAM_SESSION_ID_CHARS = 512;

/** Bounded DSH session identifier accepted at diagram wire inputs. */
export const diagramSessionIdSchema = z
  .string()
  .min(1)
  .max(MAX_DIAGRAM_SESSION_ID_CHARS)
  .transform((value) => value as SessionId);

/** Session identifier scoped to the diagram plugin protocol. */
export type DiagramSessionId = SessionId;

const timestampSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
const positiveByteLimitSchema = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);
const nonBlankStringSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0, "Text must not be blank");

/** Immutable fields used to distinguish reused session ids. */
export interface SessionFingerprint {
  createdAt: number;
  cwd?: string | undefined;
}

/** Strict durable representation of a session lifecycle. */
export const sessionFingerprintSchema: z.ZodType<SessionFingerprint> = z
  .object({
    createdAt: timestampSchema,
    cwd: nonBlankStringSchema.optional(),
  })
  .strict();

/** Durable diagram data; scene is authoritative when it is present. */
export interface DiagramRecord {
  id: DiagramId;
  sessionId: DiagramSessionId;
  sessionFingerprint: SessionFingerprint;
  title: string;
  kind: DiagramKind;
  sourceSpec: DiagramSpec;
  scene?: PersistedScene | undefined;
  revision: DiagramRevision;
  createdAt: number;
  updatedAt: number;
}

/** List projection that omits source provenance and editable scene data. */
export interface DiagramSummary {
  id: DiagramId;
  title: string;
  kind: DiagramKind;
  revision: DiagramRevision;
  createdAt: number;
  updatedAt: number;
  hasScene: boolean;
}

/**
 * Creates the strict durable and RPC schema for a diagram record.
 *
 * @param policy Deployment-selected validation limits.
 * @returns A schema preserving source provenance and optional current scene.
 */
export function createDiagramRecordSchema(
  policy: Readonly<DiagramValidationPolicy>,
): z.ZodType<DiagramRecord> {
  return z
    .object({
      id: diagramIdSchema,
      sessionId: diagramSessionIdSchema,
      sessionFingerprint: sessionFingerprintSchema,
      title: nonBlankStringSchema.max(policy.maxTitleChars),
      kind: z.enum(DIAGRAM_KINDS),
      sourceSpec: createDiagramSpecSchema(policy),
      scene: createSceneSchema(policy).optional(),
      revision: diagramRevisionSchema,
      createdAt: timestampSchema,
      updatedAt: timestampSchema,
    })
    .strict()
    .superRefine((record, context) => {
      if (record.title !== record.sourceSpec.title) {
        context.addIssue({
          code: "custom",
          message: "Record title must match sourceSpec title",
          path: ["title"],
        });
      }
      if (record.kind !== record.sourceSpec.kind) {
        context.addIssue({
          code: "custom",
          message: "Record kind must match sourceSpec kind",
          path: ["kind"],
        });
      }
      if (record.updatedAt < record.createdAt) {
        context.addIssue({
          code: "custom",
          message: "updatedAt must not precede createdAt",
          path: ["updatedAt"],
        });
      }
      if (record.sessionFingerprint.createdAt > record.createdAt) {
        context.addIssue({
          code: "custom",
          message: "Session fingerprint must not postdate diagram creation",
          path: ["sessionFingerprint", "createdAt"],
        });
      }
    });
}

/**
 * Creates the strict schema for a diagram list projection.
 *
 * @param policy Deployment-selected validation limits.
 * @returns A strict DiagramSummary schema.
 */
export function createDiagramSummarySchema(
  policy: Readonly<DiagramValidationPolicy>,
): z.ZodType<DiagramSummary> {
  return z
    .object({
      id: diagramIdSchema,
      title: nonBlankStringSchema.max(policy.maxTitleChars),
      kind: z.enum(DIAGRAM_KINDS),
      revision: diagramRevisionSchema,
      createdAt: timestampSchema,
      updatedAt: timestampSchema,
      hasScene: z.boolean(),
    })
    .strict()
    .superRefine((summary, context) => {
      if (summary.updatedAt < summary.createdAt) {
        context.addIssue({
          code: "custom",
          message: "updatedAt must not precede createdAt",
          path: ["updatedAt"],
        });
      }
    });
}

/** Successful business outcome carried inside the standard DSH RpcResult. */
export interface DiagramSuccess<Value> {
  ok: true;
  value: Value;
}

/** Rejected business outcome carried inside the standard DSH RpcResult. */
export interface DiagramRejected<Error> {
  ok: false;
  error: Error;
}

/** Business outcome that leaves transport failures to the outer RpcResult. */
export type DiagramBusinessResult<Value, Error> =
  | DiagramSuccess<Value>
  | DiagramRejected<Error>;

/** JSON-safe validation detail returned for a rejected scene. */
export interface DiagramValidationIssue {
  path: (string | number)[];
  message: string;
}

/** Strict JSON-safe validation issue schema. */
export const diagramValidationIssueSchema: z.ZodType<DiagramValidationIssue> = z
  .object({
    path: z.array(z.union([z.string(), z.number().int().nonnegative()])),
    message: nonBlankStringSchema,
  })
  .strict();

/** A missing live DSH session lifecycle. */
export interface DiagramSessionNotFoundError {
  code: "session-not-found";
  sessionId: DiagramSessionId;
}

/** A missing diagram within the requested session lifecycle. */
export interface DiagramNotFoundError {
  code: "diagram-not-found";
  id: DiagramId;
}

/** A compare-and-swap rejection carrying the current durable record. */
export interface DiagramVersionConflictError {
  code: "version-conflict";
  current: DiagramRecord;
}

/** A scene rejected before any durable mutation. */
export interface DiagramInvalidSceneError {
  code: "invalid-scene";
  issues: DiagramValidationIssue[];
}

/** Exhausted durable capacity that is independent of one submitted scene. */
export interface DiagramStorageCapacityError {
  code: "storage-capacity";
  scope: "global-bytes";
  limitBytes: number;
}

/** Business failures shared by list, get, and save operations. */
export type DiagramRpcError =
  | DiagramSessionNotFoundError
  | DiagramNotFoundError
  | DiagramVersionConflictError
  | DiagramInvalidSceneError
  | DiagramStorageCapacityError;

/**
 * Creates the discriminated schema for diagram business failures.
 *
 * @param policy Deployment-selected validation limits.
 * @returns A schema for session, diagram, CAS, and scene failures.
 */
export function createDiagramRpcErrorSchema(
  policy: Readonly<DiagramValidationPolicy>,
): z.ZodType<DiagramRpcError> {
  return z.discriminatedUnion("code", [
    z
      .object({
        code: z.literal("session-not-found"),
        sessionId: diagramSessionIdSchema,
      })
      .strict(),
    z
      .object({
        code: z.literal("diagram-not-found"),
        id: diagramIdSchema,
      })
      .strict(),
    z
      .object({
        code: z.literal("version-conflict"),
        current: createDiagramRecordSchema(policy),
      })
      .strict(),
    z
      .object({
        code: z.literal("invalid-scene"),
        issues: z.array(diagramValidationIssueSchema).min(1),
      })
      .strict(),
    z
      .object({
        code: z.literal("storage-capacity"),
        scope: z.literal("global-bytes"),
        limitBytes: positiveByteLimitSchema,
      })
      .strict(),
  ]);
}

/** List request scoped to one live session lifecycle. */
export interface DiagramListRequest {
  sessionId: DiagramSessionId;
}

/** Strict list request schema. */
export const diagramListRequestSchema: z.ZodType<DiagramListRequest> = z
  .object({ sessionId: diagramSessionIdSchema })
  .strict();

/** Client limits returned with every list response. */
export interface DiagramClientLimits {
  autosaveDebounceMs: number;
  validationPolicy: DiagramValidationPolicy;
}

/** List value returned after session lifecycle validation. */
export interface DiagramListValue {
  diagrams: DiagramSummary[];
  limits: DiagramClientLimits;
}

/**
 * Creates the strict list-value schema.
 *
 * @param policy Deployment-selected validation limits for summaries.
 * @returns A list value schema including client save limits.
 */
export function createDiagramListValueSchema(
  policy: Readonly<DiagramValidationPolicy>,
): z.ZodType<DiagramListValue> {
  return z
    .object({
      diagrams: z.array(createDiagramSummarySchema(policy)),
      limits: z
        .object({
          autosaveDebounceMs: z.number().int().positive(),
          validationPolicy: diagramValidationPolicySchema,
        })
        .strict(),
    })
    .strict();
}

/** Get request scoped to one diagram in one live session lifecycle. */
export interface DiagramGetRequest {
  sessionId: DiagramSessionId;
  id: DiagramId;
}

/** Strict get request schema. */
export const diagramGetRequestSchema: z.ZodType<DiagramGetRequest> = z
  .object({ sessionId: diagramSessionIdSchema, id: diagramIdSchema })
  .strict();

/** Get value containing the complete durable diagram. */
export interface DiagramGetValue {
  diagram: DiagramRecord;
}

/**
 * Creates the strict get-value schema.
 *
 * @param policy Deployment-selected validation limits.
 * @returns A complete diagram value schema.
 */
export function createDiagramGetValueSchema(
  policy: Readonly<DiagramValidationPolicy>,
): z.ZodType<DiagramGetValue> {
  return z
    .object({ diagram: createDiagramRecordSchema(policy) })
    .strict();
}

/** Compare-and-swap request for the current editable scene. */
export interface DiagramSaveRequest {
  sessionId: DiagramSessionId;
  id: DiagramId;
  expectedRevision: DiagramRevision;
  scene: PersistedScene;
}

/**
 * Creates the strict save request schema at the untrusted scene input.
 *
 * @param policy Deployment-selected validation limits.
 * @returns A compare-and-swap save request schema.
 */
export function createDiagramSaveRequestSchema(
  policy: Readonly<DiagramValidationPolicy>,
): z.ZodType<DiagramSaveRequest> {
  return z
    .object({
      sessionId: diagramSessionIdSchema,
      id: diagramIdSchema,
      expectedRevision: diagramRevisionSchema,
      scene: createSceneSchema(policy),
    })
    .strict();
}

/** Save value with the post-write record and deduplication status. */
export interface DiagramSaveValue {
  diagram: DiagramRecord;
  unchanged: boolean;
}

/**
 * Creates the strict save-value schema.
 *
 * @param policy Deployment-selected validation limits.
 * @returns A post-write record schema.
 */
export function createDiagramSaveValueSchema(
  policy: Readonly<DiagramValidationPolicy>,
): z.ZodType<DiagramSaveValue> {
  return z
    .object({
      diagram: createDiagramRecordSchema(policy),
      unchanged: z.boolean(),
    })
    .strict();
}

/**
 * Creates an inner business-result schema for one endpoint.
 *
 * @param valueSchema Successful endpoint value schema.
 * @param errorSchema Rejected endpoint error schema.
 * @returns A strict `ok`-discriminated business-result schema.
 */
export function createDiagramBusinessResultSchema<
  ValueSchema extends z.ZodType,
  ErrorSchema extends z.ZodType,
>(valueSchema: ValueSchema, errorSchema: ErrorSchema) {
  return z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), value: valueSchema }).strict(),
    z.object({ ok: z.literal(false), error: errorSchema }).strict(),
  ]);
}

/**
 * Creates the complete inner result schema for list.
 *
 * @param policy Deployment-selected validation limits.
 * @returns A list business-result schema.
 */
export function createDiagramListResultSchema(
  policy: Readonly<DiagramValidationPolicy>,
) {
  return createDiagramBusinessResultSchema(
    createDiagramListValueSchema(policy),
    createDiagramRpcErrorSchema(policy),
  );
}

/**
 * Creates the complete inner result schema for get.
 *
 * @param policy Deployment-selected validation limits.
 * @returns A get business-result schema.
 */
export function createDiagramGetResultSchema(
  policy: Readonly<DiagramValidationPolicy>,
) {
  return createDiagramBusinessResultSchema(
    createDiagramGetValueSchema(policy),
    createDiagramRpcErrorSchema(policy),
  );
}

/**
 * Creates the complete inner result schema for save.
 *
 * @param policy Deployment-selected validation limits.
 * @returns A save business-result schema.
 */
export function createDiagramSaveResultSchema(
  policy: Readonly<DiagramValidationPolicy>,
) {
  return createDiagramBusinessResultSchema(
    createDiagramSaveValueSchema(policy),
    createDiagramRpcErrorSchema(policy),
  );
}
