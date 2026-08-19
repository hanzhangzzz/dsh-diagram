// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ComponentProps, ComponentType } from "react";
import type { Context } from "@deepseek-ai/cordis";
import type { SessionEvent } from "@deepseek-ai/dsh-session/types";
import type {
  ConversationMatch,
  ConversationNodeContext,
} from "@deepseek-ai/dsh-client-runtime/client";
import { describe, expect, it, vi } from "vitest";

import { createDiagramPreviewMeta } from "../src/core/diagram-kinds.ts";
import { DiagramPreviewNode } from "../src/client/DiagramPreviewNode.tsx";
import {
  DIAGRAM_PREVIEW_NODE_KIND,
  diagramPreviewDefinition,
  type DiagramPreviewState,
} from "../src/client/preview-definition.ts";
import { apply } from "../src/client/index.ts";

const META = {
  diagramId: "0f8fad5b-d9cb-469f-a165-70867728950e",
  revision: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  title: "推荐结构",
  kind: "architecture",
} as const;

function resultEvent(overrides: Record<string, unknown> = {}): SessionEvent {
  return {
    seq: 41,
    time: 1000,
    type: "tool/result",
    surfaceOp: "append",
    data: {
      turn: 2,
      step: 1,
      message: {
        role: "tool",
        source: { callId: "call-1" },
        content: [{ type: "text", text: "created" }],
      },
      meta: createDiagramPreviewMeta(META),
    },
    ...overrides,
  } as unknown as SessionEvent;
}

function matchOf(event: SessionEvent): ConversationMatch {
  return {
    event,
    view: undefined,
    role: "start",
    location: { kind: "unresolved" },
  };
}

function contextOf(
  state: DiagramPreviewState | undefined,
  match: ConversationMatch,
): ConversationNodeContext<DiagramPreviewState> {
  return {
    key: `${DIAGRAM_PREVIEW_NODE_KIND}:${META.diagramId}`,
    kind: DIAGRAM_PREVIEW_NODE_KIND,
    id: META.diagramId,
    matches: [match],
    start: match,
    state,
    current: new Map(),
  };
}

describe("diagramPreviewDefinition", () => {
  it("matches only appended tool results carrying this plugin's meta", () => {
    expect(diagramPreviewDefinition.match(resultEvent())).toEqual({
      id: META.diagramId,
      role: "start",
    });
    expect(
      diagramPreviewDefinition.match(
        resultEvent({ type: "tool/call" }),
      ),
    ).toBeNull();
    expect(
      diagramPreviewDefinition.match(
        resultEvent({ surfaceOp: { kind: "replace", seq: 7 } }),
      ),
    ).toBeNull();
    expect(
      diagramPreviewDefinition.match(
        resultEvent({
          data: { turn: 2, step: 1, message: {}, meta: { other: true } },
        }),
      ),
    ).toBeNull();
    expect(
      diagramPreviewDefinition.match(
        resultEvent({ data: { turn: 2, step: 1, message: {} } }),
      ),
    ).toBeNull();
  });

  it("builds durable state and a visible chat node anchored at the result", () => {
    const match = matchOf(resultEvent());
    const state = diagramPreviewDefinition.start(
      contextOf(undefined, match),
      match,
      { previous: () => undefined },
    );

    expect(state).toEqual({ ...META, seq: 41 });

    const node = diagramPreviewDefinition.buildViewNode?.(
      contextOf(state, match),
    );
    expect(node).toEqual({
      key: `${DIAGRAM_PREVIEW_NODE_KIND}:${META.diagramId}`,
      kind: DIAGRAM_PREVIEW_NODE_KIND,
      id: META.diagramId,
      target: "chat",
      anchorSeq: 41,
      location: { kind: "unresolved" },
      visibility: "visible",
      data: META,
    });
  });

  it("keeps state unchanged on stray updates and hides nothing built", () => {
    const match = matchOf(resultEvent());
    const state: DiagramPreviewState = { ...META, seq: 41 };
    expect(
      diagramPreviewDefinition.update(
        { ...contextOf(state, match), state },
        match,
      ),
    ).toBe(state);
    expect(
      diagramPreviewDefinition.buildViewNode?.(
        contextOf(undefined, match),
      ),
    ).toBeNull();
  });
});

describe("DiagramPreviewNode", () => {
  it("mounts the lazy same-origin preview for this session's diagram", () => {
    const props = {
      sessionId: "session/with spaces",
      node: {
        key: `${DIAGRAM_PREVIEW_NODE_KIND}:${META.diagramId}`,
        kind: DIAGRAM_PREVIEW_NODE_KIND,
        id: META.diagramId,
        target: "chat",
        anchorSeq: 41,
        location: { kind: "unresolved" },
        visibility: "visible",
        data: META,
      },
    } as unknown as ComponentProps<typeof DiagramPreviewNode>;

    render(<DiagramPreviewNode {...props} />);

    const frame = screen.getByTitle("diagram 预览：推荐结构");
    expect(frame.getAttribute("src")).toBe(
      "/diagram-assets/preview.html?sessionId=session%2Fwith%20spaces&diagramId=0f8fad5b-d9cb-469f-a165-70867728950e",
    );
    expect(frame.getAttribute("loading")).toBe("lazy");
    expect(frame.hasAttribute("sandbox")).toBe(false);
    expect(screen.getByText("推荐结构")).toBeTruthy();
  });
});

describe("client plugin registration", () => {
  it("registers the canvas tab, the preview definition, and its renderer", () => {
    const registrations: Record<string, unknown>[] = [];
    const components = new Map<string, ComponentType<unknown>>();
    const register = vi.fn(
      (options: Record<string, unknown>, entry: ComponentType<unknown>) => {
        registrations.push(options);
        components.set(String(options.key ?? options.id), entry);
        return () => undefined;
      },
    );
    const registerDefinition = vi.fn(() => () => undefined);
    const context = {
      slots: {
        inject: vi.fn((_name: string, mount: () => unknown) => mount()),
        register,
      },
      conversationEvents: { register: registerDefinition },
    } as unknown as Context;

    apply(context);

    expect(registerDefinition).toHaveBeenCalledWith(diagramPreviewDefinition);
    expect(registrations).toContainEqual(
      expect.objectContaining({
        name: "conversation.chat.node",
        key: DIAGRAM_PREVIEW_NODE_KIND,
      }),
    );
    expect(components.get(DIAGRAM_PREVIEW_NODE_KIND)).toBe(DiagramPreviewNode);
  });
});
