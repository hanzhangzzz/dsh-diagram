import { Context } from "@deepseek-ai/cordis";
import type { WebRoute, WebServer } from "@deepseek-ai/dsh-host-webserver";
import { SessionId, SessionStore, type SessionHeader } from "@deepseek-ai/dsh-session";
import type {} from "@deepseek-ai/dsh-storage-domain";
import ToolRuntime from "@deepseek-ai/dsh-tools";
import { describe, expect, it, vi } from "vitest";

import DiagramPlugin from "../src/index.ts";
import { DEFAULT_DIAGRAM_VALIDATION_POLICY } from "../src/core/contracts.ts";
import type { DiagramId, DiagramRecord } from "../src/core/rpc.ts";
import {
  resolveDiagramSession,
  type DiagramSessionSources,
} from "../src/host/service.ts";

const HEADER: SessionHeader = {
  version: 0,
  id: SessionId("session-service"),
  createdAt: 100,
  cwd: "/workspace",
};

function sources(options: {
  live?: SessionHeader;
  snapshots?: SessionHeader[];
} = {}): DiagramSessionSources & {
  listSnapshots: ReturnType<typeof vi.fn>;
  inspect: ReturnType<typeof vi.fn>;
} {
  const listSnapshots = vi.fn(async () =>
    (options.snapshots ?? []).map((header) => ({ header, revision: "revision" })));
  const inspect = vi.fn(async () => ({ meta: HEADER, events: [] }));
  return {
    sessions: {
      get: vi.fn(() => options.live === undefined
        ? undefined
        : { header: options.live }),
    },
    persistence: { listSnapshots, inspect },
    listSnapshots,
    inspect,
  };
}

describe("diagram Session resolution", () => {
  it("inspects a live Session lifecycle without catalog listing", async () => {
    const dependencies = sources({ live: HEADER });

    await expect(resolveDiagramSession(
      dependencies,
      HEADER.id,
      new AbortController().signal,
    )).resolves.toEqual({ ok: true, value: HEADER });
    expect(dependencies.listSnapshots).not.toHaveBeenCalled();
    expect(dependencies.inspect).toHaveBeenCalledWith(
      HEADER.id,
      expect.any(AbortSignal),
    );
  });

  it("uses the durable catalog before inspecting a cold Session", async () => {
    const dependencies = sources({ snapshots: [HEADER] });

    await expect(resolveDiagramSession(
      dependencies,
      HEADER.id,
      new AbortController().signal,
    )).resolves.toEqual({ ok: true, value: HEADER });
    expect(dependencies.listSnapshots).toHaveBeenCalledOnce();
    expect(dependencies.inspect).toHaveBeenCalledOnce();
  });

  it("returns session-not-found without inspecting an absent Session", async () => {
    const dependencies = sources();

    await expect(resolveDiagramSession(
      dependencies,
      HEADER.id,
      new AbortController().signal,
    )).resolves.toEqual({
      ok: false,
      error: { code: "session-not-found", sessionId: HEADER.id },
    });
    expect(dependencies.inspect).not.toHaveBeenCalled();
  });

  it("rechecks live Sessions after a concurrent catalog miss", async () => {
    let lookups = 0;
    const dependencies = sources();
    dependencies.sessions.get = vi.fn(() => {
      lookups += 1;
      return lookups === 1 ? undefined : { header: HEADER };
    });

    await expect(resolveDiagramSession(
      dependencies,
      HEADER.id,
      new AbortController().signal,
    )).resolves.toEqual({ ok: true, value: HEADER });
    expect(dependencies.inspect).toHaveBeenCalledOnce();
  });

  it("never returns an inspected lifecycle replaced by a live Session", async () => {
    const current = { ...HEADER, createdAt: 101 };
    const dependencies = sources({ live: current });
    dependencies.inspect.mockResolvedValue({ meta: HEADER, events: [] });

    await expect(resolveDiagramSession(
      dependencies,
      HEADER.id,
      new AbortController().signal,
    )).resolves.toEqual({ ok: true, value: current });
  });
});

async function diagramHost(
  host: WebServer["host"],
  sessionsProvider: "native" | "service-key" = "native",
) {
  const ctx = new Context();
  const routes: WebRoute[] = [];
  const records = new Map<DiagramId, DiagramRecord>();
  const registeredSkills: { name: string }[] = [];
  const close = vi.fn(async () => {});
  ctx.provide("skills", {
    register(skill: { name: string }) {
      registeredSkills.push(skill);
      return () => {
        registeredSkills.splice(registeredSkills.indexOf(skill), 1);
      };
    },
  } as unknown as Context["skills"]);
  ctx.provide("webServer", {
    host,
    register(route: WebRoute) {
      routes.push(route);
      return () => { routes.splice(routes.indexOf(route), 1); };
    },
  } as WebServer);
  ctx.provide("systemPrompt", {
    tools: () => () => {},
    section: () => () => {},
  } as never);
  const open = vi.fn(async () => ({
    table: () => ({
      get: (id: DiagramId) => records.get(id),
      entries: () => new Map(records).entries(),
      get size() { return records.size; },
      put: async (id: DiagramId, record: DiagramRecord) => {
        records.set(id, record);
      },
    }),
    close,
  }));
  ctx.provide("storageDomain", {
    open,
  } as unknown as Context["storageDomain"]);
  ctx.provide("sessionPersistence", {
    inspect: vi.fn(),
  } as never);
  if (sessionsProvider === "native") {
    await ctx.plugin(SessionStore);
  } else {
    ctx.provide("sessions", {
      get: () => undefined,
    } as unknown as Context["sessions"]);
  }
  await ctx.plugin(ToolRuntime, { mode: "native", maxParallelSubCalls: 10 });
  const diagramFiber = ctx.plugin(DiagramPlugin, {
    ...DEFAULT_DIAGRAM_VALIDATION_POLICY,
    maxDiagramsPerSession: 20,
    maxDiagramsTotal: 1_000,
    maxStoredBytesTotal: 67_108_864,
    autosaveDebounceMs: 800,
    maxReadChars: 12_000,
  });
  return { close, ctx, diagramFiber, open, registeredSkills, routes };
}

describe("DiagramService registrations", () => {
  it("uses the explicitly injected Host sessions service by service key", async () => {
    const host = await diagramHost("127.0.0.1", "service-key");

    await host.diagramFiber.await();
    expect(host.open).toHaveBeenCalledOnce();

    await host.diagramFiber.dispose();
    await host.ctx.fiber.dispose();
  });

  it("withdraws the RPC route and both tools with its owning fiber", async () => {
    const host = await diagramHost("127.0.0.1");
    await host.diagramFiber.await();

    expect(host.routes.map((route) => route.path).sort()).toEqual([
      "/diagram",
      "/diagram-assets",
    ]);
    expect(host.ctx.tools.get("diagram_create")).toBeDefined();
    expect(host.ctx.tools.get("diagram_read")).toBeDefined();
    expect(host.registeredSkills.map((skill) => skill.name))
      .toEqual(["canvas-diagram"]);

    await host.diagramFiber.dispose();

    expect(host.routes).toEqual([]);
    expect(host.ctx.tools.get("diagram_create")).toBeUndefined();
    expect(host.ctx.tools.get("diagram_read")).toBeUndefined();
    expect(host.registeredSkills).toEqual([]);
    expect(host.close).toHaveBeenCalledOnce();
    await host.ctx.fiber.dispose();
  });

  it("fails before opening storage when the WebServer is not loopback-bound", async () => {
    const host = await diagramHost("0.0.0.0");

    await expect(host.diagramFiber.await()).rejects.toThrow(
      "diagram requires webServer.host to be 127.0.0.1",
    );
    expect(host.open).not.toHaveBeenCalled();
    expect(host.routes).toEqual([]);
    expect(host.ctx.tools.get("diagram_create")).toBeUndefined();
    expect(host.ctx.tools.get("diagram_read")).toBeUndefined();
    await host.diagramFiber.dispose().catch(() => undefined);
    await host.ctx.fiber.dispose().catch(() => undefined);
  });
});
