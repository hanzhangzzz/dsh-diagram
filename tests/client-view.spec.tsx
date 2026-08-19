// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ComponentProps, ComponentType } from "react";
import type { Context } from "@deepseek-ai/cordis";
import { describe, expect, it, vi } from "vitest";

import { DiagramView } from "../src/client/DiagramView.tsx";
import { apply } from "../src/client/index.ts";

describe("DiagramView", () => {
  it("mounts the same-origin editor only for the rendered conversation view", () => {
    const props = {
      sessionId: "session/with spaces",
    } as unknown as ComponentProps<typeof DiagramView>;

    render(<DiagramView {...props} />);

    const frame = screen.getByTitle("diagram 画布编辑器");
    expect(frame.getAttribute("src")).toBe(
      "/diagram-assets/index.html?sessionId=session%2Fwith%20spaces",
    );
    expect(frame.hasAttribute("sandbox")).toBe(false);
    expect(
      frame.closest("[data-conversation-composer-overlay]"),
    ).not.toBeNull();
  });
});

describe("client plugin", () => {
  it("registers one Chinese canvas tab in the conversation view slot", () => {
    const registrations: [Record<string, unknown>, ComponentType<unknown>][] =
      [];
    const register = vi.fn(
      (options: Record<string, unknown>, entry: ComponentType<unknown>) => {
        registrations.push([options, entry]);
        return () => undefined;
      },
    );
    const context = {
      slots: {
        inject: vi.fn((_name: string, mount: () => unknown) => mount()),
        register,
      },
      conversationEvents: { register: vi.fn(() => () => undefined) },
    } as unknown as Context;

    apply(context);

    const viewRegistration = registrations.find(
      ([options]) => options.name === "conversation.view",
    );
    expect(viewRegistration?.[0]).toMatchObject({
      name: "conversation.view",
      id: "diagram",
      order: 20,
      label: "画布",
    });
    expect(viewRegistration?.[1]).toBe(DiagramView);
  });
});
