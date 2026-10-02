import { z } from "zod";
import type {
  ClientRequest,
  RpcId,
  ServerResponse,
} from "@deepseek-ai/dsh-client-connection/client";

import { t } from "../core/i18n.ts";

import {
  DEFAULT_DIAGRAM_VALIDATION_POLICY,
  diagramValidationPolicySchema,
  type DiagramValidationPolicy,
  type PersistedScene,
} from "../core/contracts.ts";
import {
  DIAGRAM_RPC_CHANNEL,
  createDiagramGetResultSchema,
  createDiagramListResultSchema,
  createDiagramSaveRequestSchema,
  createDiagramSaveResultSchema,
  diagramGetRequestSchema,
  diagramListRequestSchema,
  type DiagramBusinessResult,
  type DiagramGetValue,
  type DiagramListValue,
  type DiagramRpcError,
  type DiagramRpcEndpoint,
  type DiagramSaveValue,
} from "../core/rpc.ts";

/**
 * DSH `server-response` envelope. The browser half of `dsh-client-connection`
 * exports only the wire types, so the editor validates against them here; the
 * Host keeps using DSH's own `clientRequestSchema`.
 */
const serverResponseSchema: z.ZodType<ServerResponse> = z
  .object({
    type: z.literal("server-response"),
    rpcId: z.string().min(1).transform((id) => id as RpcId),
    result: z.discriminatedUnion("ok", [
      z.object({ ok: z.literal(true), value: z.unknown().nonoptional() }),
      z.object({
        ok: z.literal(false),
        error: z.object({
          code: z.string(),
          message: z.string(),
          details: z.record(z.string(), z.unknown()),
        }),
      }),
    ]),
  })
  .strict();

const listPolicyProbeSchema = z
  .object({
    ok: z.literal(true),
    value: z
      .object({
        limits: z
          .object({ validationPolicy: diagramValidationPolicySchema })
          .passthrough(),
      })
      .passthrough(),
  })
  .strict();

/** Minimal fetch and correlation dependencies for iframe RPC. */
export interface DiagramRpcClientOptions {
  fetch?: typeof globalThis.fetch;
  origin?: string;
  mintRpcId?: () => string;
}

/** Strict caller for the plugin's direct same-origin RPC channel. */
export interface DiagramRpcClient {
  readonly validationPolicy: Readonly<DiagramValidationPolicy>;
  list(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<DiagramBusinessResult<DiagramListValue, DiagramRpcError>>;
  get(
    sessionId: string,
    id: string,
    signal?: AbortSignal,
  ): Promise<DiagramBusinessResult<DiagramGetValue, DiagramRpcError>>;
  save(
    sessionId: string,
    id: string,
    expectedRevision: string,
    scene: PersistedScene,
    signal?: AbortSignal,
  ): Promise<DiagramBusinessResult<DiagramSaveValue, DiagramRpcError>>;
}

/**
 * Creates an editor-only RPC caller without loading the DSH client runtime.
 *
 * @param options Injectable transport and correlation dependencies.
 * @returns Strict list/get/save caller.
 */
export function createDiagramRpcClient(
  options: DiagramRpcClientOptions = {},
): DiagramRpcClient {
  const fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const origin = options.origin ?? globalThis.location.origin;
  const mintRpcId = options.mintRpcId ?? (() => globalThis.crypto.randomUUID());
  let policy: Readonly<DiagramValidationPolicy> =
    DEFAULT_DIAGRAM_VALIDATION_POLICY;

  const call = async (
    endpoint: DiagramRpcEndpoint,
    payload: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> => {
    const rpcId = mintRpcId() as RpcId;
    const message: ClientRequest = {
      type: "client-request",
      rpcId,
      method: endpoint,
      payload,
    };
    const response = await fetch(
      new URL(`${DIAGRAM_RPC_CHANNEL}/${endpoint}`, origin),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(message),
        ...(signal === undefined ? {} : { signal }),
      },
    );
    if (!response.ok) {
      throw new Error(
        t("rpc.transport.failed", { endpoint, status: response.status }),
      );
    }
    const envelope = parseResponse(await response.json(), endpoint);
    if (envelope.rpcId !== rpcId) {
      throw new Error(
        t("rpc.rpcid.mismatch", {
          endpoint,
          sent: rpcId,
          received: envelope.rpcId,
        }),
      );
    }
    if (!envelope.result.ok) {
      throw new Error(
        t("rpc.rejected", { endpoint, message: envelope.result.error.message }),
      );
    }
    return envelope.result.value;
  };

  return {
    get validationPolicy() {
      return policy;
    },
    async list(sessionId, signal) {
      const payload = diagramListRequestSchema.parse({ sessionId });
      const raw = await call("list", payload, signal);
      const probe = listPolicyProbeSchema.safeParse(raw);
      const responsePolicy = probe.success
        ? probe.data.value.limits.validationPolicy
        : policy;
      const result = parseBusinessResult(
        raw,
        createDiagramListResultSchema(responsePolicy),
        "list",
      );
      if (result.ok) policy = result.value.limits.validationPolicy;
      return result;
    },
    async get(sessionId, id, signal) {
      const payload = diagramGetRequestSchema.parse({ sessionId, id });
      const raw = await call("get", payload, signal);
      return parseBusinessResult(
        raw,
        createDiagramGetResultSchema(policy),
        "get",
      );
    },
    async save(sessionId, id, expectedRevision, scene, signal) {
      const payload = createDiagramSaveRequestSchema(policy).parse({
        sessionId,
        id,
        expectedRevision,
        scene,
      });
      const raw = await call("save", payload, signal);
      return parseBusinessResult(
        raw,
        createDiagramSaveResultSchema(policy),
        "save",
      );
    },
  };
}

function parseResponse(value: unknown, endpoint: string) {
  const parsed = serverResponseSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      t("rpc.response.invalid", {
        endpoint,
        issue: parsed.error.issues[0]?.message ?? t("rpc.unknown.field"),
      }),
    );
  }
  return parsed.data;
}

function parseBusinessResult<Schema extends z.ZodType>(
  value: unknown,
  schema: Schema,
  endpoint: string,
): z.infer<Schema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      t("rpc.business.invalid", {
        endpoint,
        issue: parsed.error.issues[0]?.message ?? t("rpc.unknown.field"),
      }),
    );
  }
  return parsed.data;
}
