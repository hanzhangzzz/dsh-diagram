import type { ConnectionRpcHandler } from "@deepseek-ai/dsh-client-connection";
import type { z } from "zod";

import type { DiagramValidationPolicy } from "../core/contracts.ts";
import {
  DIAGRAM_RPC_ENDPOINTS,
  createDiagramGetResultSchema,
  createDiagramListResultSchema,
  createDiagramSaveRequestSchema,
  createDiagramSaveResultSchema,
  diagramGetRequestSchema,
  diagramListRequestSchema,
  type DiagramBusinessResult,
  type DiagramGetRequest,
  type DiagramGetValue,
  type DiagramListRequest,
  type DiagramListValue,
  type DiagramRpcEndpoint,
  type DiagramRpcError,
  type DiagramSaveRequest,
  type DiagramSaveValue,
  type DiagramValidationIssue,
} from "../core/rpc.ts";

/** Session-aware business operations exposed through the dedicated channel. */
export interface DiagramRpcOperations {
  /** Lists diagrams for one exact Session lifecycle. */
  list(
    request: DiagramListRequest,
    signal: AbortSignal,
  ): Promise<DiagramBusinessResult<DiagramListValue, DiagramRpcError>>;
  /** Reads one diagram after Session lifecycle and ownership validation. */
  get(
    request: DiagramGetRequest,
    signal: AbortSignal,
  ): Promise<DiagramBusinessResult<DiagramGetValue, DiagramRpcError>>;
  /** Saves one current scene after Session lifecycle and ownership validation. */
  save(
    request: DiagramSaveRequest,
    signal: AbortSignal,
  ): Promise<DiagramBusinessResult<DiagramSaveValue, DiagramRpcError>>;
}

/** Logger surface used to contain implementation and validation failures. */
export interface DiagramRpcLogger {
  /** Records a Host-only failure that must not enter the RPC response. */
  error(error: Error): void;
}

const ENDPOINTS = new Set<string>(DIAGRAM_RPC_ENDPOINTS);

/**
 * Creates the strict handler for the loopback-only diagram channel.
 * @param operations Session-aware endpoint implementations.
 * @param policy Deployment-selected record and scene validation limits.
 * @param logger Host logger for contained implementation failures.
 * @returns A Connection RPC handler returning only the standard outer result.
 */
export function createDiagramRpcHandler(
  operations: DiagramRpcOperations,
  policy: Readonly<DiagramValidationPolicy>,
  logger: DiagramRpcLogger,
): ConnectionRpcHandler {
  const saveRequestSchema = createDiagramSaveRequestSchema(policy);
  const resultSchemas = {
    list: createDiagramListResultSchema(policy),
    get: createDiagramGetResultSchema(policy),
    save: createDiagramSaveResultSchema(policy),
  } as const;

  return async (endpoint, payload, signal) => {
    if (signal.aborted) return cancelled();
    if (!ENDPOINTS.has(endpoint)) {
      return badRequest(`unknown diagram RPC endpoint ${JSON.stringify(endpoint)}`, []);
    }

    const selected = endpoint as DiagramRpcEndpoint;
    try {
      switch (selected) {
        case "list": {
          const request = diagramListRequestSchema.safeParse(payload);
          if (!request.success) {
            return badRequest("invalid diagram list request", request.error.issues);
          }
          signal.throwIfAborted();
          const result = await operations.list(request.data, signal);
          return validatedSuccess("list", resultSchemas.list, result, logger);
        }
        case "get": {
          const request = diagramGetRequestSchema.safeParse(payload);
          if (!request.success) {
            return badRequest("invalid diagram get request", request.error.issues);
          }
          signal.throwIfAborted();
          const result = await operations.get(request.data, signal);
          return validatedSuccess("get", resultSchemas.get, result, logger);
        }
        case "save": {
          const request = saveRequestSchema.safeParse(payload);
          if (!request.success) {
            if (request.error.issues.length > 0
              && request.error.issues.every((issue) => issue.path[0] === "scene")) {
              const rejected = {
                ok: false as const,
                error: {
                  code: "invalid-scene" as const,
                  issues: request.error.issues.map(sceneIssue),
                },
              };
              return validatedSuccess("save", resultSchemas.save, rejected, logger);
            }
            return badRequest("invalid diagram save request", request.error.issues);
          }
          signal.throwIfAborted();
          const result = await operations.save(request.data, signal);
          return validatedSuccess("save", resultSchemas.save, result, logger);
        }
        default:
          return assertNever(selected);
      }
    } catch (error: unknown) {
      if (signal.aborted || isAbortError(error)) return cancelled();
      logger.error(asError(error));
      return internalFailure();
    }
  };
}

function validatedSuccess(
  endpoint: DiagramRpcEndpoint,
  schema: z.ZodType,
  result: unknown,
  logger: DiagramRpcLogger,
) {
  const parsed = schema.safeParse(result);
  if (!parsed.success) {
    logger.error(new Error(
      `diagram RPC ${endpoint} returned an invalid business result: ${parsed.error.message}`,
    ));
    return internalFailure();
  }
  return { ok: true as const, value: parsed.data };
}

function sceneIssue(issue: z.core.$ZodIssue): DiagramValidationIssue {
  return {
    path: issue.path.slice(1).map((segment) =>
      typeof segment === "string" || typeof segment === "number"
        ? segment
        : String(segment)),
    message: issue.message,
  };
}

function badRequest(message: string, issues: z.core.$ZodIssue[]) {
  return {
    ok: false as const,
    error: {
      code: "bad-request" as const,
      message,
      details: { issues },
    },
  };
}

function cancelled() {
  return {
    ok: false as const,
    error: {
      code: "cancelled" as const,
      message: "diagram RPC cancelled",
      details: {},
    },
  };
}

function internalFailure() {
  return {
    ok: false as const,
    error: {
      code: "internal" as const,
      message: "diagram RPC failed",
      details: {},
    },
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function assertNever(value: never): never {
  throw new Error(`unhandled diagram RPC endpoint: ${String(value)}`);
}
