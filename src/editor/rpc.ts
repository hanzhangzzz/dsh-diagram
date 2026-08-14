import { z } from "zod";
import {
  RpcId,
  serverResponseSchema,
  type ClientRequest,
} from "@deepseek-ai/dsh-host-apiproxy/api";

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
    const rpcId = RpcId(mintRpcId());
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
        `diagram ${endpoint} 传输失败：HTTP ${response.status}。请检查 DSH Host。`,
      );
    }
    const envelope = parseResponse(await response.json(), endpoint);
    if (envelope.rpcId !== rpcId) {
      throw new Error(
        `diagram ${endpoint} rpcId 不匹配：发送 ${rpcId}，收到 ${envelope.rpcId}。`,
      );
    }
    if (!envelope.result.ok) {
      throw new Error(
        `diagram ${endpoint} 请求被 DSH 拒绝：${envelope.result.error.message}`,
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
      `diagram ${endpoint} 响应格式无效：${parsed.error.issues[0]?.message ?? "未知字段错误"}。`,
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
      `diagram ${endpoint} 业务响应格式无效：${parsed.error.issues[0]?.message ?? "未知字段错误"}。`,
    );
  }
  return parsed.data;
}
