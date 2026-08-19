import { z } from "zod";

import { DIAGRAM_KINDS, type DiagramKind } from "./diagram-kinds.ts";

export { DIAGRAM_KINDS, type DiagramKind };

/** Stable meanings used by the deterministic visual compiler. */
export const DIAGRAM_TONES = [
  "neutral",
  "definition",
  "execution",
  "external",
  "evidence",
  "risk",
  "target",
] as const;

/** One semantic color meaning independent of input ordering. */
export type DiagramTone = (typeof DIAGRAM_TONES)[number];

/** Controlled visual hierarchy for semantic nodes. */
export const DIAGRAM_NODE_VARIANTS = ["card", "compact", "solid"] as const;

/** One controlled node presentation variant. */
export type DiagramNodeVariant = (typeof DIAGRAM_NODE_VARIANTS)[number];

/** Regions available to the adaptive report recipe. */
export const REPORT_GROUP_PLACEMENTS = ["top", "main", "bottom"] as const;

/** One report region selected from semantic reading order. */
export type ReportGroupPlacement = (typeof REPORT_GROUP_PLACEMENTS)[number];

/** Reading directions supported inside report regions. */
export const REPORT_GROUP_DIRECTIONS = ["row", "column"] as const;

/** One deterministic reading direction inside a report region. */
export type ReportGroupDirection = (typeof REPORT_GROUP_DIRECTIONS)[number];

/** Deployment-configurable limits applied at model, RPC, and durable-data inputs. */
export interface DiagramValidationPolicy {
  maxNodes: number;
  maxEdges: number;
  maxGroups: number;
  maxIdChars: number;
  maxTitleChars: number;
  maxSummaryChars: number;
  maxNodeLabelChars: number;
  maxNodeDetailChars: number;
  maxEdgeLabelChars: number;
  maxGroupLabelChars: number;
  maxSceneBytes: number;
  maxSceneElements: number;
  maxElementTextChars: number;
}

/** Initial validation policy that a bundle may copy or override explicitly. */
export const DEFAULT_DIAGRAM_VALIDATION_POLICY: Readonly<DiagramValidationPolicy> =
  Object.freeze({
    maxNodes: 80,
    maxEdges: 160,
    maxGroups: 20,
    maxIdChars: 64,
    maxTitleChars: 200,
    maxSummaryChars: 1_000,
    maxNodeLabelChars: 160,
    maxNodeDetailChars: 600,
    maxEdgeLabelChars: 120,
    maxGroupLabelChars: 120,
    maxSceneBytes: 1_048_576,
    maxSceneElements: 500,
    maxElementTextChars: 4_000,
  });

const positiveIntegerSchema = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);

/** Strict Cordis-config schema for validation-policy overrides. */
export const diagramValidationPolicySchema = z
  .object({
    maxNodes: positiveIntegerSchema,
    maxEdges: positiveIntegerSchema,
    maxGroups: positiveIntegerSchema,
    maxIdChars: positiveIntegerSchema,
    maxTitleChars: positiveIntegerSchema,
    maxSummaryChars: positiveIntegerSchema,
    maxNodeLabelChars: positiveIntegerSchema,
    maxNodeDetailChars: positiveIntegerSchema,
    maxEdgeLabelChars: positiveIntegerSchema,
    maxGroupLabelChars: positiveIntegerSchema,
    maxSceneBytes: positiveIntegerSchema,
    maxSceneElements: positiveIntegerSchema,
    maxElementTextChars: positiveIntegerSchema,
  })
  .strict() satisfies z.ZodType<DiagramValidationPolicy>;

/** A semantic node before deterministic layout. */
export interface DiagramNode {
  id: string;
  label: string;
  detail?: string | undefined;
  group?: string | undefined;
  emphasis?: boolean | undefined;
  tone?: DiagramTone | undefined;
  variant?: DiagramNodeVariant | undefined;
}

/** A directed semantic relationship before deterministic layout. */
export interface DiagramEdge {
  from: string;
  to: string;
  label?: string | undefined;
}

/** A labeled collection of nodes. */
export interface DiagramGroup {
  id: string;
  label: string;
  tone?: DiagramTone | undefined;
  placement?: ReportGroupPlacement | undefined;
  direction?: ReportGroupDirection | undefined;
}

/** Model-authored semantic input retained as generation provenance. */
export interface DiagramSpec {
  kind: DiagramKind;
  title: string;
  summary?: string | undefined;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups?: DiagramGroup[] | undefined;
}

/** JSON data accepted by persisted scene fields. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Editable Excalidraw primitives accepted by durable storage. */
export const EDITABLE_SCENE_ELEMENT_TYPES = [
  "rectangle",
  "diamond",
  "ellipse",
  "line",
  "arrow",
  "freedraw",
  "text",
] as const;

/** Non-configurable limits that prevent hostile scene data from exhausting parsers. */
export const SCENE_PROTOCOL_SECURITY_LIMITS = Object.freeze({
  maxJsonDepth: 64,
  maxJsonValues: 100_000,
  maxAbsoluteJsonNumber: 1_000_000_000_000_000,
  maxAbsoluteElementExtensionNumber: 1_000_000_000,
  maxAbsoluteCoordinate: 1_000_000_000,
  maxAbsoluteAngle: Math.PI * 2,
  maxElementStrokeWidth: 10_000,
  maxElementRoughness: 100,
  maxElementFontSize: 10_000,
  maxElementLineHeight: 100,
  maxElementSeed: 2_147_483_647,
  maxElementIdChars: 256,
  maxElementPoints: 10_000,
  maxElementReferences: 1_000,
});

type JsonInspection =
  | { ok: true; bytes: number }
  | { ok: false; message: string };

interface JsonStackEntry {
  value: unknown;
  depth: number;
}

function inspectJsonTree(
  root: unknown,
  maxBytes: number,
  maxAbsoluteNumber: number,
): JsonInspection {
  const stack: JsonStackEntry[] = [{ value: root, depth: 0 }];
  const seen = new Set<object>();
  let bytes = 0;
  let values = 0;

  while (stack.length > 0) {
    const entry = stack.pop();
    if (entry === undefined) break;
    values += 1;
    if (values > SCENE_PROTOCOL_SECURITY_LIMITS.maxJsonValues) {
      return { ok: false, message: "JSON value count exceeds protocol limit" };
    }
    if (entry.depth > SCENE_PROTOCOL_SECURITY_LIMITS.maxJsonDepth) {
      return { ok: false, message: "JSON nesting exceeds protocol limit" };
    }

    const value = entry.value;
    if (value === null) {
      bytes += 4;
    } else if (typeof value === "boolean") {
      bytes += value ? 4 : 5;
    } else if (typeof value === "number") {
      if (!Number.isFinite(value) || Math.abs(value) > maxAbsoluteNumber) {
        return { ok: false, message: "JSON number exceeds protocol limit" };
      }
      bytes += String(value).length;
    } else if (typeof value === "string") {
      bytes += jsonStringBytes(value);
    } else if (typeof value === "object") {
      if (seen.has(value)) {
        return {
          ok: false,
          message: "JSON data must not contain aliases or cycles",
        };
      }
      seen.add(value);
      let isArray: boolean;
      try {
        isArray = Array.isArray(value);
      } catch {
        return { ok: false, message: "JSON value inspection failed" };
      }
      if (isArray) {
        let prototype: object | null;
        let keys: (string | symbol)[];
        let length: number;
        try {
          prototype = Object.getPrototypeOf(value) as object | null;
          keys = Reflect.ownKeys(value);
          length = (value as unknown[]).length;
        } catch {
          return { ok: false, message: "JSON array inspection failed" };
        }
        if (prototype !== Array.prototype) {
          return { ok: false, message: "JSON arrays must be plain arrays" };
        }
        if (
          length > SCENE_PROTOCOL_SECURITY_LIMITS.maxJsonValues - values ||
          keys.length !== length + 1
        ) {
          return {
            ok: false,
            message: "JSON array exceeds protocol limit or has holes",
          };
        }
        bytes += 2 + Math.max(0, length - 1);
        for (const key of keys) {
          if (key === "length") continue;
          if (typeof key !== "string") {
            return { ok: false, message: "JSON array keys must be indices" };
          }
          const index = Number(key);
          if (
            !Number.isInteger(index) ||
            index < 0 ||
            index >= length ||
            String(index) !== key
          ) {
            return { ok: false, message: "JSON array keys must be indices" };
          }
          let descriptor: PropertyDescriptor | undefined;
          try {
            descriptor = Object.getOwnPropertyDescriptor(value, key);
          } catch {
            return { ok: false, message: "JSON array inspection failed" };
          }
          if (
            descriptor === undefined ||
            !("value" in descriptor) ||
            descriptor.enumerable !== true
          ) {
            return {
              ok: false,
              message: "JSON array entries must be enumerable values",
            };
          }
          stack.push({ value: descriptor.value, depth: entry.depth + 1 });
        }
      } else {
        let prototype: object | null;
        let keys: (string | symbol)[];
        try {
          prototype = Object.getPrototypeOf(value) as object | null;
          keys = Reflect.ownKeys(value);
        } catch {
          return { ok: false, message: "JSON object inspection failed" };
        }
        if (prototype !== Object.prototype && prototype !== null) {
          return { ok: false, message: "JSON objects must be plain objects" };
        }
        bytes += 2 + Math.max(0, keys.length - 1);
        for (const key of keys) {
          if (typeof key !== "string") {
            return { ok: false, message: "JSON object keys must be strings" };
          }
          let descriptor: PropertyDescriptor | undefined;
          try {
            descriptor = Object.getOwnPropertyDescriptor(value, key);
          } catch {
            return { ok: false, message: "JSON object inspection failed" };
          }
          if (
            descriptor === undefined ||
            !("value" in descriptor) ||
            descriptor.enumerable !== true
          ) {
            return {
              ok: false,
              message: "JSON object properties must be enumerable values",
            };
          }
          bytes += jsonStringBytes(key) + 1;
          stack.push({ value: descriptor.value, depth: entry.depth + 1 });
        }
      }
    } else {
      return { ok: false, message: "Value is not plain JSON" };
    }

    if (bytes > maxBytes) {
      return { ok: false, message: `JSON exceeds ${maxBytes} bytes` };
    }
  }

  return { ok: true, bytes };
}

function jsonStringBytes(value: string): number {
  let bytes = 2;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x22 || code === 0x5c) {
      bytes += 2;
    } else if (code <= 0x1f) {
      bytes += code === 0x08 || code === 0x09 || code === 0x0a
        || code === 0x0c || code === 0x0d ? 2 : 6;
    } else if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 6;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      bytes += 6;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function createJsonValueSchema(maxBytes: number, maxAbsoluteNumber: number) {
  return z
    .unknown()
    .superRefine((value, context) => {
      const inspection = inspectJsonTree(
        value,
        maxBytes,
        maxAbsoluteNumber,
      );
      if (!inspection.ok) {
        context.addIssue({ code: "custom", message: inspection.message });
      }
    })
    .transform((value) => value as JsonValue);
}

/**
 * Creates the strict schema used to validate model-authored DiagramSpec input.
 *
 * @param policy Deployment-selected validation limits.
 * @returns A strict DiagramSpec schema.
 */
export function createDiagramSpecSchema(
  policy: Readonly<DiagramValidationPolicy>,
): z.ZodType<DiagramSpec> {
  const boundedText = (maxChars: number) =>
    z
      .string()
      .min(1)
      .max(maxChars)
      .refine((value) => value.trim().length > 0, "Text must not be blank");
  const idSchema = z
    .string()
    .min(1)
    .max(policy.maxIdChars)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u, "Invalid diagram id");
  const nodeSchema: z.ZodType<DiagramNode> = z
    .object({
      id: idSchema,
      label: boundedText(policy.maxNodeLabelChars),
      detail: boundedText(policy.maxNodeDetailChars).optional(),
      group: idSchema.optional(),
      emphasis: z.boolean().optional(),
      tone: z.enum(DIAGRAM_TONES).optional(),
      variant: z.enum(DIAGRAM_NODE_VARIANTS).optional(),
    })
    .strict();
  const edgeSchema: z.ZodType<DiagramEdge> = z
    .object({
      from: idSchema,
      to: idSchema,
      label: boundedText(policy.maxEdgeLabelChars).optional(),
    })
    .strict();
  const groupSchema: z.ZodType<DiagramGroup> = z
    .object({
      id: idSchema,
      label: boundedText(policy.maxGroupLabelChars),
      tone: z.enum(DIAGRAM_TONES).optional(),
      placement: z.enum(REPORT_GROUP_PLACEMENTS).optional(),
      direction: z.enum(REPORT_GROUP_DIRECTIONS).optional(),
    })
    .strict();

  return z
    .object({
      kind: z.enum(DIAGRAM_KINDS),
      title: boundedText(policy.maxTitleChars),
      summary: boundedText(policy.maxSummaryChars).optional(),
      nodes: z.array(nodeSchema).min(1).max(policy.maxNodes),
      edges: z.array(edgeSchema).max(policy.maxEdges),
      groups: z.array(groupSchema).max(policy.maxGroups).optional(),
    })
    .strict()
    .superRefine((spec, context) => {
      const nodeIds = new Set<string>();
      for (const [index, node] of spec.nodes.entries()) {
        if (nodeIds.has(node.id)) {
          context.addIssue({
            code: "custom",
            message: `Duplicate node id: ${node.id}`,
            path: ["nodes", index, "id"],
          });
        }
        nodeIds.add(node.id);
      }

      const groupIds = new Set<string>();
      for (const [index, group] of (spec.groups ?? []).entries()) {
        if (groupIds.has(group.id)) {
          context.addIssue({
            code: "custom",
            message: `Duplicate group id: ${group.id}`,
            path: ["groups", index, "id"],
          });
        }
        if (nodeIds.has(group.id)) {
          context.addIssue({
            code: "custom",
            message: `Group id conflicts with node id: ${group.id}`,
            path: ["groups", index, "id"],
          });
        }
        groupIds.add(group.id);
      }
      if (
        spec.kind === "report"
        && !(spec.groups ?? []).some(
          (group) => group.placement === undefined || group.placement === "main",
        )
      ) {
        context.addIssue({
          code: "custom",
          message: "Report requires at least one main group",
          path: ["groups"],
        });
      }

      const usedGroupIds = new Set<string>();
      for (const [index, node] of spec.nodes.entries()) {
        if (spec.kind === "report" && node.group === undefined) {
          context.addIssue({
            code: "custom",
            message: "Report nodes must belong to a group",
            path: ["nodes", index, "group"],
          });
        }
        if (node.group !== undefined && !groupIds.has(node.group)) {
          context.addIssue({
            code: "custom",
            message: `Unknown group id: ${node.group}`,
            path: ["nodes", index, "group"],
          });
        }
        if (node.group !== undefined) {
          usedGroupIds.add(node.group);
        }
      }
      for (const [index, group] of (spec.groups ?? []).entries()) {
        if (!usedGroupIds.has(group.id)) {
          context.addIssue({
            code: "custom",
            message: `Group has no nodes: ${group.id}`,
            path: ["groups", index],
          });
        }
      }

      for (const [index, edge] of spec.edges.entries()) {
        if (!nodeIds.has(edge.from)) {
          context.addIssue({
            code: "custom",
            message: `Unknown source node id: ${edge.from}`,
            path: ["edges", index, "from"],
          });
        }
        if (!nodeIds.has(edge.to)) {
          context.addIssue({
            code: "custom",
            message: `Unknown target node id: ${edge.to}`,
            path: ["edges", index, "to"],
          });
        }
      }
    });
}

/**
 * Creates the schema for an editable scene crossing RPC or durable-data inputs.
 *
 * The schema preserves JSON-only Excalidraw fields while rejecting element
 * types and fields that can load external or embedded content.
 *
 * @param policy Deployment-selected validation limits.
 * @returns A strict persisted-scene schema.
 */
export function createSceneSchema(
  policy: Readonly<DiagramValidationPolicy>,
) {
  const securityLimits = SCENE_PROTOCOL_SECURITY_LIMITS;
  const boundedNumber = z
    .number()
    .min(-securityLimits.maxAbsoluteCoordinate)
    .max(securityLimits.maxAbsoluteCoordinate);
  const boundedNonNegativeNumber = z
    .number()
    .min(0)
    .max(securityLimits.maxAbsoluteCoordinate);
  const boundedText = z.string().max(policy.maxElementTextChars);
  const elementIdSchema = z
    .string()
    .min(1)
    .max(securityLimits.maxElementIdChars);
  const pointSchema = z.tuple([boundedNumber, boundedNumber]);
  const paintSchema = z
    .string()
    .regex(
      /^(?:transparent|#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8}))$/iu,
      "Paint must be transparent or a hexadecimal color",
    );
  const jsonValueSchema = createJsonValueSchema(
    policy.maxSceneBytes,
    securityLimits.maxAbsoluteElementExtensionNumber,
  );
  const metadataJsonValueSchema = createJsonValueSchema(
    policy.maxSceneBytes,
    securityLimits.maxAbsoluteJsonNumber,
  );
  const nonNegativeSafeIntegerSchema = z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER);
  const roundnessSchema = z
    .object({
      type: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      value: boundedNonNegativeNumber.optional(),
    })
    .strict();
  const arrowheadSchema = z.enum([
    "arrow",
    "bar",
    "dot",
    "circle",
    "circle_outline",
    "triangle",
    "triangle_outline",
    "diamond",
    "diamond_outline",
    "crowfoot_one",
    "crowfoot_many",
    "crowfoot_one_or_many",
  ]);
  const bindingSchema = z
    .object({
      elementId: elementIdSchema,
      focus: boundedNumber.optional(),
      gap: boundedNonNegativeNumber.optional(),
      fixedPoint: pointSchema.optional(),
    })
    .strict()
    .superRefine((binding, context) => {
      if (binding.focus === undefined) {
        context.addIssue({
          code: "custom",
          message: "Binding focus is required",
          path: ["focus"],
        });
      }
      if (binding.gap === undefined) {
        context.addIssue({
          code: "custom",
          message: "Binding gap is required",
          path: ["gap"],
        });
      }
    })
    .transform((binding) => binding as unknown as JsonValue);
  const boundElementSchema = z
    .object({
      id: elementIdSchema,
      type: z.enum(["arrow", "text"]),
    })
    .strict();
  const fixedSegmentSchema = z
    .object({
      start: pointSchema,
      end: pointSchema,
      index: z
        .number()
        .int()
        .nonnegative()
        .max(securityLimits.maxElementPoints),
    })
    .strict();
  const elementSchema = z
    .object({
      id: elementIdSchema,
      type: z.enum(EDITABLE_SCENE_ELEMENT_TYPES),
      x: boundedNumber,
      y: boundedNumber,
      width: boundedNonNegativeNumber,
      height: boundedNonNegativeNumber,
      angle: z
        .number()
        .min(-securityLimits.maxAbsoluteAngle)
        .max(securityLimits.maxAbsoluteAngle)
        .optional(),
      link: z.null().optional(),
      strokeColor: paintSchema.optional(),
      backgroundColor: paintSchema.optional(),
      fillStyle: z
        .enum(["hachure", "cross-hatch", "solid", "zigzag"])
        .optional(),
      strokeWidth: z
        .number()
        .min(0)
        .max(securityLimits.maxElementStrokeWidth)
        .optional(),
      strokeStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
      roughness: z
        .number()
        .min(0)
        .max(securityLimits.maxElementRoughness)
        .optional(),
      opacity: z.number().min(0).max(100).optional(),
      roundness: roundnessSchema.nullable().optional(),
      seed: z
        .number()
        .int()
        .nonnegative()
        .max(securityLimits.maxElementSeed)
        .optional(),
      version: nonNegativeSafeIntegerSchema.optional(),
      versionNonce: nonNegativeSafeIntegerSchema.optional(),
      updated: z
        .number()
        .int()
        .nonnegative()
        .max(securityLimits.maxAbsoluteJsonNumber)
        .optional(),
      index: z.string().nullable().optional(),
      isDeleted: z.boolean().optional(),
      locked: z.boolean().optional(),
      text: boundedText.optional(),
      originalText: boundedText.nullable().optional(),
      rawText: boundedText.optional(),
      fontSize: z
        .number()
        .positive()
        .max(securityLimits.maxElementFontSize)
        .optional(),
      fontFamily: z.number().int().positive().max(1_000).optional(),
      textAlign: z.enum(["left", "center", "right"]).optional(),
      verticalAlign: z.enum(["top", "middle", "bottom"]).optional(),
      autoResize: z.boolean().optional(),
      lineHeight: z
        .number()
        .positive()
        .max(securityLimits.maxElementLineHeight)
        .optional(),
      customData: metadataJsonValueSchema.optional(),
      groupIds: z
        .array(elementIdSchema)
        .max(securityLimits.maxElementReferences)
        .optional(),
      frameId: elementIdSchema.nullable().optional(),
      containerId: elementIdSchema.nullable().optional(),
      boundElements: z
        .array(boundElementSchema)
        .max(securityLimits.maxElementReferences)
        .nullable()
        .optional(),
      points: z
        .array(pointSchema)
        .max(securityLimits.maxElementPoints)
        .optional(),
      pressures: z
        .array(z.number().min(0).max(1))
        .max(securityLimits.maxElementPoints)
        .optional(),
      simulatePressure: z.boolean().optional(),
      lastCommittedPoint: pointSchema.nullable().optional(),
      startBinding: bindingSchema.nullable().optional(),
      endBinding: bindingSchema.nullable().optional(),
      startArrowhead: arrowheadSchema.nullable().optional(),
      endArrowhead: arrowheadSchema.nullable().optional(),
      elbowed: z.boolean().optional(),
      fixedSegments: z
        .array(fixedSegmentSchema)
        .max(securityLimits.maxElementReferences)
        .nullable()
        .optional(),
      startIsSpecial: z.boolean().nullable().optional(),
      endIsSpecial: z.boolean().nullable().optional(),
    })
    .catchall(jsonValueSchema)
    .superRefine((element, context) => {
      if (
        (element.type === "line" || element.type === "arrow") &&
        (element.points === undefined || element.points.length < 2)
      ) {
        context.addIssue({
          code: "custom",
          message: `${element.type} elements require at least two points`,
          path: ["points"],
        });
      }
      if (
        element.type === "freedraw" &&
        (element.points === undefined || element.points.length < 1)
      ) {
        context.addIssue({
          code: "custom",
          message: "freedraw elements require at least one point",
          path: ["points"],
        });
      }
      if (element.type === "text" && element.text === undefined) {
        context.addIssue({
          code: "custom",
          message: "text elements require bounded text",
          path: ["text"],
        });
      }
    });
  const appStateSchema = z
    .object({
      viewBackgroundColor: paintSchema.optional(),
      gridSize: boundedNonNegativeNumber.positive().nullable().optional(),
      gridStep: boundedNonNegativeNumber.positive().optional(),
      gridModeEnabled: z.boolean().optional(),
      theme: z.enum(["light", "dark"]).optional(),
    })
    .strict();

  const sceneSchema = z
    .object({
      elements: z.array(elementSchema).max(policy.maxSceneElements),
      appState: appStateSchema,
      files: z
        .record(z.string(), metadataJsonValueSchema)
        .refine((files) => Object.keys(files).length === 0, {
          message: "Persisted scene files must be empty",
        }),
    })
    .strict()
    .superRefine((scene, context) => {
      const elementIds = new Set<string>();
      const elementsById = new Map(
        scene.elements.map((element) => [element.id, element] as const),
      );
      for (const [index, element] of scene.elements.entries()) {
        if (elementIds.has(element.id)) {
          context.addIssue({
            code: "custom",
            message: `Duplicate scene element id: ${element.id}`,
            path: ["elements", index, "id"],
          });
        }
        elementIds.add(element.id);

        if (element.frameId !== undefined && element.frameId !== null) {
          context.addIssue({
            code: "custom",
            message: "frameId must be null because frame elements are unsupported",
            path: ["elements", index, "frameId"],
          });
        }

        const references: [
          id: string | undefined,
          path: (string | number)[],
        ][] = [
          [
            bindingElementId(element.startBinding),
            ["elements", index, "startBinding", "elementId"],
          ],
          [
            bindingElementId(element.endBinding),
            ["elements", index, "endBinding", "elementId"],
          ],
          [
            element.containerId ?? undefined,
            ["elements", index, "containerId"],
          ],
        ];
        for (const [referenceId, path] of references) {
          if (referenceId !== undefined && !elementsById.has(referenceId)) {
            context.addIssue({
              code: "custom",
              message: `Unknown scene element id: ${referenceId}`,
              path,
            });
          }
        }
        for (const [boundIndex, boundElement] of (
          element.boundElements ?? []
        ).entries()) {
          const referencedElement = elementsById.get(boundElement.id);
          if (referencedElement === undefined) {
            context.addIssue({
              code: "custom",
              message: `Unknown scene element id: ${boundElement.id}`,
              path: ["elements", index, "boundElements", boundIndex, "id"],
            });
          } else if (referencedElement.type !== boundElement.type) {
            context.addIssue({
              code: "custom",
              message: `Bound element type does not match ${boundElement.id}`,
              path: ["elements", index, "boundElements", boundIndex, "type"],
            });
          }
        }
      }
    });

  return z
    .unknown()
    .superRefine((scene, context) => {
      const inspection = inspectJsonTree(
        scene,
        policy.maxSceneBytes,
        securityLimits.maxAbsoluteJsonNumber,
      );
      if (!inspection.ok) {
        context.addIssue({
          code: "custom",
          message: inspection.message,
          path: [],
        });
      }
    })
    .pipe(sceneSchema);
}

function bindingElementId(
  value: JsonValue | null | undefined,
): string | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const elementId = value.elementId;
  return typeof elementId === "string" ? elementId : undefined;
}

/** A validated, editable scene whose elements are the current diagram state. */
export type PersistedScene = z.infer<ReturnType<typeof createSceneSchema>>;
