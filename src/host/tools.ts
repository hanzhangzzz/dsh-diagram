import type { SessionHeader } from "@deepseek-ai/dsh-session";
import { defineTool, type ToolDefinition } from "@deepseek-ai/dsh-tools";

import {
  DIAGRAM_NODE_VARIANTS,
  DIAGRAM_KINDS,
  DIAGRAM_TONES,
  REPORT_GROUP_DIRECTIONS,
  REPORT_GROUP_PLACEMENTS,
  createDiagramSpecSchema,
  type DiagramSpec,
  type DiagramValidationPolicy,
  type JsonValue,
  type PersistedScene,
} from "../core/contracts.ts";
import {
  diagramIdSchema,
  type DiagramBusinessResult,
  type DiagramGetValue,
  type DiagramId,
  type DiagramRecord,
  type DiagramRpcError,
} from "../core/rpc.ts";

/** Host operations consumed by the two globally registered diagram tools. */
export interface DiagramToolHost {
  /** Strict semantic and durable validation limits. */
  readonly validationPolicy: Readonly<DiagramValidationPolicy>;
  /** Maximum Unicode code points returned by diagram_read. */
  readonly maxReadChars: number;
  /** Creates a diagram owned by the supplied exact Session lifecycle. */
  createDiagram(
    session: SessionHeader,
    sourceSpec: DiagramSpec,
    signal: AbortSignal,
  ): Promise<DiagramRecord>;
  /** Reads only a diagram owned by the supplied exact Session lifecycle. */
  readDiagram(
    session: SessionHeader,
    id: DiagramId,
    signal: AbortSignal,
  ): Promise<DiagramBusinessResult<DiagramGetValue, DiagramRpcError>>;
}

const CREATE_OUTPUT = {
  type: "object",
  additionalProperties: false,
  properties: {
    diagramId: { type: "string", required: true },
    revision: { type: "string", required: true },
    title: { type: "string", required: true },
    kind: { type: "string", enum: [...DIAGRAM_KINDS], required: true },
    canvasTab: { type: "string", const: "画布", required: true },
  },
} as const;

const READ_OUTPUT = {
  type: "object",
  additionalProperties: false,
  properties: {
    diagramId: { type: "string", required: true },
    revision: { type: "string", required: true },
    title: { type: "string", required: true },
    kind: { type: "string", enum: [...DIAGRAM_KINDS], required: true },
    source: {
      type: "string",
      enum: ["scene", "sourceSpec"],
      required: true,
    },
    summary: { type: "string", required: true },
    truncated: { type: "boolean", required: true },
  },
} as const;

/**
 * Creates the model-facing creation and explicit-read tools.
 * @param host Session-owned durable operations and deployment limits.
 * @returns The diagram_create and diagram_read definitions in registration order.
 */
export function createDiagramTools(
  host: DiagramToolHost,
): readonly [ToolDefinition, ToolDefinition] {
  const specSchema = createDiagramSpecSchema(host.validationPolicy);

  const create = defineTool({
    name: "diagram_create",
    description:
      "把当前会话中的文章或讨论生成为可编辑的画布图表（报告图/架构图/流程图/时间线/层级图/对比图/关系图）。"
      + "Create an editable diagram for the current article or discussion. Supply a compact semantic graph;"
      + " the plugin lays it out deterministically. The result appears in the current DSH session's 画布 tab."
      + " Use only facts supported by the current context; prefer a smaller truthful graph over invented completeness."
      + " Prefer this over writing standalone SVG or Mermaid files when the user wants an editable diagram.",
    parameters: {
      kind: {
        type: "string",
        enum: [...DIAGRAM_KINDS],
        required: true,
        description: "The diagram form that best expresses the article's structure.",
      },
      title: {
        type: "string",
        required: true,
        description: "A concise diagram title.",
      },
      summary: {
        type: "string",
        description: "Optional one-sentence explanation of the diagram's message.",
      },
      nodes: {
        type: "array",
        required: true,
        description: "Semantic concepts or steps. Node ids are local stable references.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string", required: true },
            label: { type: "string", required: true },
            detail: { type: "string" },
            group: { type: "string" },
            emphasis: { type: "boolean" },
            tone: {
              type: "string",
              enum: [...DIAGRAM_TONES],
              description: "Stable semantic color meaning; inherit the group tone when omitted.",
            },
            variant: {
              type: "string",
              enum: [...DIAGRAM_NODE_VARIANTS],
              description: "Controlled hierarchy: card, compact metric/badge, or solid focal outcome.",
            },
          },
        },
      },
      edges: {
        type: "array",
        required: true,
        description: "Directed relationships between existing node ids.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            from: { type: "string", required: true },
            to: { type: "string", required: true },
            label: { type: "string" },
          },
        },
      },
      groups: {
        type: "array",
        description: "Optional labeled groups referenced by node.group.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string", required: true },
            label: { type: "string", required: true },
            tone: {
              type: "string",
              enum: [...DIAGRAM_TONES],
              description: "Stable semantic color shared by this region and its nodes.",
            },
            placement: {
              type: "string",
              enum: [...REPORT_GROUP_PLACEMENTS],
              description: "For report diagrams: a full-width top/bottom band or a main-stage column.",
            },
            direction: {
              type: "string",
              enum: [...REPORT_GROUP_DIRECTIONS],
              description: "For report diagrams: deterministic reading direction inside this region.",
            },
          },
        },
      },
    },
    output: {
      schema: CREATE_OUTPUT,
      render: (_args, value) => [{
        type: "text",
        text: `Created editable ${value.kind} diagram "${value.title}" in the current session. Open the 画布 tab to edit it. Diagram id: ${value.diagramId}; revision: ${value.revision}.`,
      }],
    },
    async execute(args, exec) {
      exec.signal.throwIfAborted();
      if (exec.agent === undefined) {
        throw new Error("diagram_create requires an owning agent session");
      }
      const sourceSpec = specSchema.parse(args);
      const diagram = await host.createDiagram(
        exec.agent.session.header,
        sourceSpec,
        exec.signal,
      );
      return {
        diagramId: diagram.id,
        revision: diagram.revision,
        title: diagram.title,
        kind: diagram.kind,
        canvasTab: "画布" as const,
      };
    },
    presentCall: (args) => ({
      card: "generic",
      title: `Create diagram: ${args.title}`,
      kind: "other",
      rawInput: args.title,
    }),
  });

  const read = defineTool({
    name: "diagram_read",
    description:
      "Read the current editable content of one diagram in this agent's session. Use the id returned by diagram_create. If the user edited the canvas, this reads the current scene rather than the original generated specification.",
    parameters: {
      id: {
        type: "string",
        required: true,
        description: "Exact diagram id returned by diagram_create or a prior diagram_read.",
      },
    },
    output: {
      schema: READ_OUTPUT,
      render: (_args, value) => [{ type: "text", text: value.summary }],
    },
    async execute(args, exec) {
      exec.signal.throwIfAborted();
      if (exec.agent === undefined) {
        throw new Error("diagram_read requires an owning agent session");
      }
      const id = diagramIdSchema.parse(args.id);
      const result = await host.readDiagram(
        exec.agent.session.header,
        id,
        exec.signal,
      );
      if (!result.ok) throw readFailure(id, result.error);

      const diagram = result.value.diagram;
      const source: "sourceSpec" | "scene" = diagram.scene === undefined
        ? "sourceSpec"
        : "scene";
      const bounded = boundText(
        diagram.scene === undefined
          ? summarizeSpec(diagram)
          : summarizeScene(diagram, diagram.scene),
        host.maxReadChars,
      );
      return {
        diagramId: diagram.id,
        revision: diagram.revision,
        title: diagram.title,
        kind: diagram.kind,
        source,
        summary: bounded.text,
        truncated: bounded.truncated,
      };
    },
    presentCall: (args) => ({
      card: "generic",
      title: "Read current diagram",
      kind: "read",
      rawInput: args.id,
    }),
  });

  return [create, read];
}

function summarizeSpec(diagram: DiagramRecord): string {
  const spec = diagram.sourceSpec;
  const lines = [
    `Diagram: ${diagram.title} (${diagram.kind})`,
    `Revision: ${diagram.revision}`,
    "Current content source: original semantic specification (no edited scene has been saved).",
  ];
  if (spec.summary !== undefined) lines.push(`Summary: ${spec.summary}`);
  lines.push(`Nodes (${String(spec.nodes.length)}):`);
  for (const node of spec.nodes) {
    const group = node.group === undefined ? "" : ` [group: ${node.group}]`;
    const detail = node.detail === undefined ? "" : ` — ${node.detail}`;
    lines.push(`- ${node.id}: ${node.label}${detail}${group}`);
  }
  lines.push(`Connections (${String(spec.edges.length)}):`);
  for (const edge of spec.edges) {
    const label = edge.label === undefined ? "" : ` (${edge.label})`;
    lines.push(`- ${edge.from} -> ${edge.to}${label}`);
  }
  if ((spec.groups?.length ?? 0) > 0) {
    lines.push(`Groups (${String(spec.groups?.length ?? 0)}):`);
    for (const group of spec.groups ?? []) {
      lines.push(`- ${group.id}: ${group.label}`);
    }
  }
  return lines.join("\n");
}

function summarizeScene(diagram: DiagramRecord, scene: PersistedScene): string {
  const texts: string[] = [];
  const shapes: string[] = [];
  const connections: string[] = [];
  for (const element of scene.elements) {
    if (element.type === "text") {
      const text = currentElementText(element);
      if (text !== undefined && text.length > 0) texts.push(`${element.id}: ${text}`);
      continue;
    }
    if (element.type === "arrow" || element.type === "line") {
      const start = bindingId(element.startBinding) ?? "unbound";
      const end = bindingId(element.endBinding) ?? "unbound";
      connections.push(`${element.id}: ${start} -> ${end}`);
      continue;
    }
    shapes.push(
      `${element.id}: ${element.type} at (${formatNumber(element.x)}, ${formatNumber(element.y)}), ${formatNumber(element.width)}x${formatNumber(element.height)}`,
    );
  }

  return [
    `Diagram: ${diagram.title} (${diagram.kind})`,
    `Revision: ${diagram.revision}`,
    "Current content source: edited scene.",
    `Text (${String(texts.length)}):`,
    ...texts.map((text) => `- ${text}`),
    `Shapes (${String(shapes.length)}):`,
    ...shapes.map((shape) => `- ${shape}`),
    `Connections (${String(connections.length)}):`,
    ...connections.map((connection) => `- ${connection}`),
  ].join("\n");
}

function currentElementText(
  element: PersistedScene["elements"][number],
): string | undefined {
  if (typeof element.originalText === "string") return element.originalText;
  if (typeof element.rawText === "string") return element.rawText;
  return typeof element.text === "string" ? element.text : undefined;
}

function bindingId(value: JsonValue | undefined): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return typeof value.elementId === "string" ? value.elementId : undefined;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function boundText(
  value: string,
  maxChars: number,
): { text: string; truncated: boolean } {
  const codePoints = [...value];
  if (codePoints.length <= maxChars) return { text: value, truncated: false };
  const marker = [..."\n…[truncated]"];
  if (maxChars <= marker.length) {
    return { text: marker.slice(0, maxChars).join(""), truncated: true };
  }
  return {
    text: codePoints.slice(0, maxChars - marker.length).join("") + marker.join(""),
    truncated: true,
  };
}

function readFailure(id: DiagramId, error: DiagramRpcError): Error {
  switch (error.code) {
    case "diagram-not-found":
    case "session-not-found":
      return new Error(`diagram_read could not find diagram ${id} in the current agent session`);
    case "invalid-scene":
    case "storage-capacity":
    case "version-conflict":
      return new Error("diagram_read received an invalid Host read result");
  }
}
