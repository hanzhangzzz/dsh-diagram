/**
 * Host entry point for durable editable diagrams in DeepSeek Harness.
 * @module dsh-diagram
 */

import { fileURLToPath } from "node:url";
import type { Context } from "@deepseek-ai/cordis";

import type { DiagramConfig } from "./host/config.ts";
import { DiagramService } from "./host/service.ts";

export * from "./core/index.ts";
export {
  Config,
  diagramConfigSchema,
  resolveDiagramConfig,
  validationPolicyOf,
} from "./host/config.ts";
export type { DiagramConfig } from "./host/config.ts";
export {
  DIAGRAM_DOMAIN_NAME,
  createDiagramDomainSpec,
} from "./host/domain.ts";
export {
  DiagramCapacityError,
  DiagramRepository,
} from "./host/repository.ts";
export type {
  DiagramRepositoryDependencies,
  DiagramRepositoryPolicy,
  DiagramTable,
} from "./host/repository.ts";
export {
  createDiagramRpcHandler,
} from "./host/rpc.ts";
export type {
  DiagramRpcLogger,
  DiagramRpcOperations,
} from "./host/rpc.ts";
export {
  DiagramService,
  resolveDiagramSession,
} from "./host/service.ts";
export type {
  DiagramSessionResolution,
  DiagramSessionSources,
} from "./host/service.ts";
export {
  DIAGRAM_ASSETS_PATH,
  createEditorAssetsHandler,
} from "./host/static.ts";
export { createDiagramTools } from "./host/tools.ts";
export type { DiagramToolHost } from "./host/tools.ts";

const EDITOR_ROOT = fileURLToPath(new URL("./editor/", import.meta.url));

/** Cordis plugin binding the packaged editor directory to DiagramService. */
export class DiagramPlugin extends DiagramService {
  /**
   * @param ctx Host plugin context.
   * @param config Explicit deployment limits.
   */
  constructor(ctx: Context, config: DiagramConfig) {
    super(ctx, config, EDITOR_ROOT);
  }
}

export default DiagramPlugin;
