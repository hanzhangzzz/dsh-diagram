import { describe, expect, it } from "vitest";

import {
  DEFAULT_DIAGRAM_VALIDATION_POLICY,
  DIAGRAM_KINDS,
  SCENE_PROTOCOL_SECURITY_LIMITS,
  createDiagramSpecSchema,
  createSceneSchema,
  diagramValidationPolicySchema,
} from "../src/core/contracts.ts";

describe("validation policy", () => {
  it("accepts explicit positive integer limits and rejects unsafe config", () => {
    expect(
      diagramValidationPolicySchema.safeParse(DEFAULT_DIAGRAM_VALIDATION_POLICY)
        .success,
    ).toBe(true);
    expect(
      diagramValidationPolicySchema.safeParse({
        ...DEFAULT_DIAGRAM_VALIDATION_POLICY,
        maxNodes: 0,
      }).success,
    ).toBe(false);
    expect(
      diagramValidationPolicySchema.safeParse({
        ...DEFAULT_DIAGRAM_VALIDATION_POLICY,
        unsupportedLimit: 1,
      }).success,
    ).toBe(false);
    expect(
      diagramValidationPolicySchema.safeParse({
        ...DEFAULT_DIAGRAM_VALIDATION_POLICY,
        maxSceneBytes: Number.MAX_SAFE_INTEGER + 1,
      }).success,
    ).toBe(false);
  });
});

describe("DiagramSpec validation", () => {
  it("accepts a report with semantic regions, tones, and card variants", () => {
    const schema = createDiagramSpecSchema(DEFAULT_DIAGRAM_VALIDATION_POLICY);
    const spec = {
      kind: "report",
      title: "测试事实架构",
      summary: "资产覆盖广；Merge 前尚未形成自动测试护栏",
      groups: [
        {
          id: "governance",
          label: "平台 E2E 强度治理",
          placement: "top",
          direction: "row",
          tone: "definition",
        },
        {
          id: "assets",
          label: "测试资产",
          placement: "main",
          direction: "column",
          tone: "definition",
        },
        {
          id: "gate",
          label: "Merge 门",
          placement: "main",
          direction: "column",
          tone: "risk",
        },
        {
          id: "target",
          label: "目标闭环",
          placement: "bottom",
          direction: "row",
          tone: "target",
        },
      ],
      nodes: [
        {
          id: "contract",
          label: "9 条强合同",
          group: "governance",
          tone: "definition",
          variant: "compact",
        },
        {
          id: "pytest",
          label: "pytest",
          detail: "517 文件 · 6682 函数",
          group: "assets",
        },
        {
          id: "missing",
          label: "未执行",
          detail: "完整 pytest · Vitest · E2E",
          group: "gate",
          tone: "risk",
        },
        {
          id: "block",
          label: "阻塞 Merge",
          group: "target",
          tone: "target",
          variant: "solid",
        },
      ],
      edges: [
        { from: "pytest", to: "missing" },
        { from: "missing", to: "block" },
      ],
    } as const;

    expect(schema.parse(spec)).toEqual(spec);
  });

  it("rejects a report without a main reading region", () => {
    const schema = createDiagramSpecSchema(DEFAULT_DIAGRAM_VALIDATION_POLICY);
    const result = schema.safeParse({
      kind: "report",
      title: "No main region",
      groups: [
        { id: "context", label: "Context", placement: "top" },
        { id: "outcome", label: "Outcome", placement: "bottom" },
      ],
      nodes: [
        { id: "source", label: "Source", group: "context" },
        { id: "target", label: "Target", group: "outcome" },
      ],
      edges: [{ from: "source", to: "target" }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          message: "Report requires at least one main group",
          path: ["groups"],
        }),
      );
    }
  });

  it("rejects report nodes that have no semantic region", () => {
    const schema = createDiagramSpecSchema(DEFAULT_DIAGRAM_VALIDATION_POLICY);
    const result = schema.safeParse({
      kind: "report",
      title: "Ungrouped fact",
      groups: [{ id: "facts", label: "Facts", placement: "main" }],
      nodes: [
        { id: "grouped", label: "Grouped", group: "facts" },
        { id: "orphan", label: "Orphan" },
      ],
      edges: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          message: "Report nodes must belong to a group",
          path: ["nodes", 1, "group"],
        }),
      );
    }
  });

  it("accepts each supported diagram kind through one strict public schema", () => {
    const schema = createDiagramSpecSchema(DEFAULT_DIAGRAM_VALIDATION_POLICY);
    for (const kind of DIAGRAM_KINDS) {
      const reportFields = kind === "report"
        ? {
            groups: [{ id: "main", label: "Main", placement: "main" as const }],
            nodes: [{ id: "source", label: "Source", group: "main" }],
          }
        : { nodes: [{ id: "source", label: "Source" }] };
      expect(
        schema.parse({
          kind,
          title: `${kind} diagram`,
          ...reportFields,
          edges: [],
        }),
      ).toMatchObject({ kind });
    }
  });

  it("rejects duplicate ids and unresolved node or group references", () => {
    const schema = createDiagramSpecSchema(DEFAULT_DIAGRAM_VALIDATION_POLICY);
    const base = {
      kind: "architecture" as const,
      title: "Runtime",
      nodes: [
        { id: "api", label: "API", group: "services" },
        { id: "store", label: "Store" },
      ],
      edges: [{ from: "api", to: "store" }],
      groups: [{ id: "services", label: "Services" }],
    };

    expect(schema.safeParse(base).success).toBe(true);
    expect(
      schema.safeParse({
        ...base,
        nodes: [...base.nodes, { id: "api", label: "Duplicate" }],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...base,
        edges: [{ from: "missing", to: "store" }],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...base,
        nodes: [{ id: "api", label: "API", group: "missing" }],
        edges: [],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...base,
        groups: [...base.groups, { id: "services", label: "Duplicate" }],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...base,
        groups: [...base.groups, { id: "unused", label: "Unused" }],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...base,
        nodes: [{ id: "services", label: "Conflicts with group" }],
        edges: [],
      }).success,
    ).toBe(false);
  });

  it("enforces the selected limits and rejects extra or ambiguous fields", () => {
    const schema = createDiagramSpecSchema({
      ...DEFAULT_DIAGRAM_VALIDATION_POLICY,
      maxNodes: 1,
      maxTitleChars: 5,
    });

    expect(
      schema.safeParse({
        kind: "flow",
        title: "Valid",
        nodes: [
          { id: "one", label: "One" },
          { id: "two", label: "Two" },
        ],
        edges: [],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        kind: "flow",
        title: "Too long",
        nodes: [{ id: "one", label: "One" }],
        edges: [],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        kind: "flow",
        title: "Valid",
        nodes: [{ id: "bad id", label: "One", color: "red" }],
        edges: [],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        kind: "flow",
        title: "     ",
        nodes: [{ id: "one", label: "One" }],
        edges: [],
      }).success,
    ).toBe(false);
  });
});

describe("persisted scene validation", () => {
  const baseElement = {
    id: "element-1",
    type: "rectangle",
    x: 10,
    y: 20,
    width: 160,
    height: 80,
    link: null,
    groupIds: [],
  };

  function editableElement(type: string) {
    if (type === "line" || type === "arrow") {
      return { ...baseElement, type, points: [[0, 0], [160, 80]] };
    }
    if (type === "freedraw") {
      return {
        ...baseElement,
        type,
        points: [[0, 0]],
        pressures: [],
        simulatePressure: true,
      };
    }
    if (type === "text") {
      return { ...baseElement, type, text: "Label", originalText: "Label" };
    }
    return { ...baseElement, type };
  }

  function sceneWith(element: unknown, appState: object = {}) {
    return { elements: [element], appState, files: {} };
  }

  it("accepts editable primitives and rejects embedded content or external links", () => {
    const schema = createSceneSchema(DEFAULT_DIAGRAM_VALIDATION_POLICY);

    for (const type of [
      "rectangle",
      "diamond",
      "ellipse",
      "line",
      "arrow",
      "freedraw",
      "text",
    ]) {
      expect(
        schema.safeParse({
          elements: [editableElement(type)],
          appState: { viewBackgroundColor: "#ffffff" },
          files: {},
        }).success,
      ).toBe(true);
    }

    for (const type of ["image", "iframe", "embeddable", "frame"]) {
      expect(
        schema.safeParse({
          elements: [{ ...baseElement, type }],
          appState: {},
          files: {},
        }).success,
      ).toBe(false);
    }

    expect(
      schema.safeParse({
        elements: [{ ...baseElement, link: "https://example.com" }],
        appState: {},
        files: {},
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        elements: [baseElement],
        appState: {},
        files: { file: { dataURL: "data:image/png;base64,AA==" } },
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        elements: [baseElement],
        appState: { selectedElementIds: { "element-1": true } },
        files: {},
      }).success,
    ).toBe(false);
  });

  it("enforces byte, element, text, and element-id limits", () => {
    const oneElementSchema = createSceneSchema({
      ...DEFAULT_DIAGRAM_VALIDATION_POLICY,
      maxSceneElements: 1,
      maxElementTextChars: 3,
    });

    expect(
      oneElementSchema.safeParse({
        elements: [baseElement, { ...baseElement, id: "element-2" }],
        appState: {},
        files: {},
      }).success,
    ).toBe(false);
    expect(
      oneElementSchema.safeParse({
        elements: [
          { ...baseElement, type: "text", text: "four", originalText: "four" },
        ],
        appState: {},
        files: {},
      }).success,
    ).toBe(false);
    expect(
      createSceneSchema({
        ...DEFAULT_DIAGRAM_VALIDATION_POLICY,
        maxSceneBytes: 32,
      }).safeParse({ elements: [], appState: {}, files: {} }).success,
    ).toBe(false);
    expect(
      oneElementSchema.safeParse({
        elements: [baseElement],
        appState: {},
        files: {},
        sourceSpec: {},
      }).success,
    ).toBe(false);
    expect(
      createSceneSchema(DEFAULT_DIAGRAM_VALIDATION_POLICY).safeParse({
        elements: [baseElement, baseElement],
        appState: {},
        files: {},
      }).success,
    ).toBe(false);
  });

  it("rejects deeply nested or non-JSON element data without throwing", () => {
    const schema = createSceneSchema(DEFAULT_DIAGRAM_VALIDATION_POLICY);
    let nested: unknown = "leaf";
    for (let depth = 0; depth < 5_000; depth += 1) {
      nested = { child: nested };
    }
    const deepScene = {
      elements: [{ ...baseElement, customData: nested }],
      appState: {},
      files: {},
    };

    expect(() => schema.safeParse(deepScene)).not.toThrow();
    expect(schema.safeParse(deepScene).success).toBe(false);
    expect(
      schema.safeParse({
        elements: [
          {
            ...baseElement,
            customData: { value: Number.POSITIVE_INFINITY },
          },
        ],
        appState: {},
        files: {},
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        elements: [{ ...baseElement, customData: new Date() }],
        appState: {},
        files: {},
      }).success,
    ).toBe(false);

    const accessorArray: unknown[] = [];
    Object.defineProperty(accessorArray, "0", {
      enumerable: true,
      get() {
        throw new Error("must not invoke untrusted accessors");
      },
    });
    accessorArray.length = 1;
    const accessorScene = sceneWith({
      ...baseElement,
      customData: accessorArray,
    });
    expect(() => schema.safeParse(accessorScene)).not.toThrow();
    expect(schema.safeParse(accessorScene).success).toBe(false);
  });

  it("rejects unsafe geometry, malformed type data, paint, and references", () => {
    const schema = createSceneSchema(DEFAULT_DIAGRAM_VALIDATION_POLICY);
    const invalidElements = [
      { ...baseElement, type: "line", points: null },
      { ...baseElement, type: "line", points: [[0, 0]] },
      {
        ...baseElement,
        type: "line",
        points: [
          [0, 0],
          [SCENE_PROTOCOL_SECURITY_LIMITS.maxAbsoluteCoordinate + 1, 0],
        ],
      },
      {
        ...baseElement,
        type: "arrow",
        points: [[0, 0], [Number.POSITIVE_INFINITY, 0]],
      },
      { ...baseElement, type: "freedraw", points: [] },
      { ...baseElement, type: "text" },
      { ...baseElement, x: Number.POSITIVE_INFINITY },
      { ...baseElement, angle: 1_000 },
      { ...baseElement, opacity: 101 },
      { ...baseElement, strokeWidth: 100_001 },
      { ...baseElement, type: "text", text: "Label", fontSize: 100_001 },
      {
        ...baseElement,
        x: SCENE_PROTOCOL_SECURITY_LIMITS.maxAbsoluteCoordinate + 1,
      },
      {
        ...baseElement,
        width: SCENE_PROTOCOL_SECURITY_LIMITS.maxAbsoluteCoordinate + 1,
      },
      {
        ...baseElement,
        customData: {
          value: SCENE_PROTOCOL_SECURITY_LIMITS.maxAbsoluteJsonNumber + 1,
        },
      },
      { ...baseElement, strokeColor: "url(https://example.com/paint)" },
      { ...baseElement, backgroundColor: "rgb(0, 0, 0)" },
      {
        ...baseElement,
        id: "x".repeat(
          SCENE_PROTOCOL_SECURITY_LIMITS.maxElementIdChars + 1,
        ),
      },
      { ...baseElement, groupIds: [1] },
      { ...baseElement, boundElements: [{ id: "edge-1", type: "image" }] },
      {
        ...baseElement,
        type: "arrow",
        points: [[0, 0], [160, 80]],
        startBinding: { elementId: "missing", focus: 0, gap: 1 },
      },
    ];

    for (const element of invalidElements) {
      expect(schema.safeParse(sceneWith(element)).success).toBe(false);
    }
    expect(
      schema.safeParse(
        sceneWith(baseElement, {
          viewBackgroundColor: "url(data:image/svg+xml;base64,AA==)",
        }),
      ).success,
    ).toBe(false);
    expect(
      schema.safeParse(
        sceneWith({
          ...baseElement,
          updated: 1_800_000_000_000,
          seed: 2_147_483_647,
          versionNonce: 2_147_483_647,
        }),
      ).success,
    ).toBe(true);
  });

  it("accepts internal element references and rejects dangling relationships", () => {
    const schema = createSceneSchema(DEFAULT_DIAGRAM_VALIDATION_POLICY);
    const shape = {
      ...baseElement,
      id: "shape-1",
      groupIds: [],
      boundElements: [
        { id: "edge-1", type: "arrow" },
        { id: "text-1", type: "text" },
      ],
    };
    const arrow = {
      ...editableElement("arrow"),
      id: "edge-1",
      groupIds: [],
      startBinding: { elementId: "shape-1", focus: 0, gap: 1 },
    };
    const text = {
      ...editableElement("text"),
      id: "text-1",
      groupIds: [],
      containerId: "shape-1",
    };
    const validScene = {
      elements: [shape, arrow, text],
      appState: {},
      files: {},
    };

    expect(schema.safeParse(validScene).success).toBe(true);
    expect(
      schema.safeParse({
        ...validScene,
        elements: [{ ...shape, frameId: "missing-frame" }, arrow, text],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...validScene,
        elements: [
          shape,
          {
            ...arrow,
            startBinding: {
              elementId: "missing",
              focus: 0,
              gap: 1,
            },
          },
          text,
        ],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...validScene,
        elements: [shape, arrow, { ...text, containerId: "missing" }],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...validScene,
        elements: [
          {
            ...shape,
            boundElements: [{ id: "missing", type: "arrow" }],
          },
          arrow,
          text,
        ],
      }).success,
    ).toBe(false);
  });
});
