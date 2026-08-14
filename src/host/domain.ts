import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";

import type { DiagramValidationPolicy } from "../core/contracts.ts";
import {
  createDiagramRecordSchema,
  type DiagramId,
  type DiagramRecord,
} from "../core/rpc.ts";

/** Durable storage-domain name owned by this plugin. */
export const DIAGRAM_DOMAIN_NAME = "diagram";

/**
 * Declares the version-zero durable diagram table for one validation policy.
 * @param policy Deployment-selected durable record limits.
 * @returns A storage-domain declaration keyed by opaque diagram ids.
 */
export function createDiagramDomainSpec(
  policy: Readonly<DiagramValidationPolicy>,
) {
  return defineDomain({
    name: DIAGRAM_DOMAIN_NAME,
    version: 0,
    tables: {
      diagrams: domainTable<DiagramId, DiagramRecord>(
        createDiagramRecordSchema(policy),
      ),
    },
  });
}
