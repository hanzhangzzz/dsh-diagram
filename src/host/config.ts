import s from "@deepseek-ai/schemastery";
import { z } from "zod";

import {
  diagramValidationPolicySchema,
  type DiagramValidationPolicy,
} from "../core/contracts.ts";

/** Required deployment limits for Host validation, storage, autosave, and reads. */
export interface DiagramConfig extends DiagramValidationPolicy {
  /** Maximum durable diagrams owned by one exact Session lifecycle. */
  maxDiagramsPerSession: number;
  /** Maximum durable diagrams across the plugin domain. */
  maxDiagramsTotal: number;
  /** Maximum canonical UTF-8 bytes across every durable diagram record. */
  maxStoredBytesTotal: number;
  /** Client save debounce returned by the list RPC. */
  autosaveDebounceMs: number;
  /** Maximum Unicode code points exposed by one diagram_read result. */
  maxReadChars: number;
}

const positiveSafeInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

/** Strict runtime schema used when constructing the Host outside a Cordis loader. */
export const diagramConfigSchema: z.ZodType<DiagramConfig> =
  diagramValidationPolicySchema.extend({
    maxDiagramsPerSession: positiveSafeInteger,
    maxDiagramsTotal: positiveSafeInteger,
    maxStoredBytesTotal: positiveSafeInteger,
    autosaveDebounceMs: positiveSafeInteger,
    maxReadChars: positiveSafeInteger,
  }).strict();

const requiredPositiveInteger = () =>
  s.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).required();

/** Cordis loader validation for every deployment-varying diagram limit. */
export const Config: s<DiagramConfig> = s.object({
  maxNodes: requiredPositiveInteger(),
  maxEdges: requiredPositiveInteger(),
  maxGroups: requiredPositiveInteger(),
  maxIdChars: requiredPositiveInteger(),
  maxTitleChars: requiredPositiveInteger(),
  maxSummaryChars: requiredPositiveInteger(),
  maxNodeLabelChars: requiredPositiveInteger(),
  maxNodeDetailChars: requiredPositiveInteger(),
  maxEdgeLabelChars: requiredPositiveInteger(),
  maxGroupLabelChars: requiredPositiveInteger(),
  maxSceneBytes: requiredPositiveInteger(),
  maxSceneElements: requiredPositiveInteger(),
  maxElementTextChars: requiredPositiveInteger(),
  maxDiagramsPerSession: requiredPositiveInteger(),
  maxDiagramsTotal: requiredPositiveInteger(),
  maxStoredBytesTotal: requiredPositiveInteger(),
  autosaveDebounceMs: requiredPositiveInteger(),
  maxReadChars: requiredPositiveInteger(),
});

/**
 * Validates and detaches the complete deployment configuration.
 * @param config Candidate supplied by Cordis or direct construction.
 * @returns A strict detached configuration.
 */
export function resolveDiagramConfig(config: DiagramConfig): DiagramConfig {
  return diagramConfigSchema.parse(config);
}

/**
 * Projects the common model/RPC/durable validation limits.
 * @param config Complete Host deployment configuration.
 * @returns A detached validation policy.
 */
export function validationPolicyOf(config: DiagramConfig): DiagramValidationPolicy {
  return diagramValidationPolicySchema.parse({
    maxNodes: config.maxNodes,
    maxEdges: config.maxEdges,
    maxGroups: config.maxGroups,
    maxIdChars: config.maxIdChars,
    maxTitleChars: config.maxTitleChars,
    maxSummaryChars: config.maxSummaryChars,
    maxNodeLabelChars: config.maxNodeLabelChars,
    maxNodeDetailChars: config.maxNodeDetailChars,
    maxEdgeLabelChars: config.maxEdgeLabelChars,
    maxGroupLabelChars: config.maxGroupLabelChars,
    maxSceneBytes: config.maxSceneBytes,
    maxSceneElements: config.maxSceneElements,
    maxElementTextChars: config.maxElementTextChars,
  });
}
