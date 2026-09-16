import { Context } from "@deepseek-ai/cordis";
import type { WebRoute, WebServer } from "@deepseek-ai/dsh-host-webserver";
import { SessionId, SessionStore, type SessionHeader } from "@deepseek-ai/dsh-session";
import { SESSION_FORMAT_VERSION } from "@deepseek-ai/dsh-session/types";
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
  version: SESSION_FORMAT_VERSION,
  isSeeded: false,
  id: SessionId("session-service"),
  createdAt: 100,
  cwd: "/workspace",
};

function sources(options: {
  live?: SessionHeader;
  stored?: SessionHeader;
} = {}): DiagramSessionSources & {
  stat: ReturnType<typeof vi.fn>;
} {
  const stat = vi.fn(async () => options.stored === undefined
    ? undefined
    : { header: options.stored, revision: "revision" });
  return {
    sessions: {
      get: vi.fn(() => options.live === undefined
        ? undefined
        : { header: options.live }),
    },
    persistence: { stat },
    stat,
  };
}

describe("diagram Session resolution", () => {
  it("returns the live lifecycle after one typed durable stat", async () => {
    const dependencies = sources({ live: HEADER, stored: HEADER });

    await expect(resolveDiagramSession(
      dependencies,
      HEADER.id,
      new AbortController().signal,
    )).resolves.toEqual({ ok: true, value: HEADER });
    expect(dependencies.stat).toHaveBeenCalledWith(
      HEADER.id,
      { signal: expect.any(AbortSignal) },
    );
  });

  it("resolves a cold Session from its stored header", async () => {
    const dependencies = sources({ stored: HEADER });

    await expect(resolveDiagramSession(
      dependencies,
      HEADER.id,
      new AbortController().signal,
    )).resolves.toEqual({ ok: true, value: HEADER });
    expect(dependencies.stat).toHaveBeenCalledOnce();
  });

  it("returns session-not-found when stat reports typed absence", async () => {
    const dependencies = sources();

    await expect(resolveDiagramSession(
      dependencies,
      HEADER.id,
      new AbortController().signal,
    )).resolves.toEqual({
      ok: false,
      error: { code: "session-not-found", sessionId: HEADER.id },
    });
    expect(dependencies.stat).toHaveBeenCalledOnce();
  });

  it("rechecks live Sessions after a concurrent stat miss", async () => {
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
  });

  it("never returns a stored lifecycle replaced by a live Session", async () => {
    const current = { ...HEADER, createdAt: 101 };
    const dependencies = sources({ live: current, stored: HEADER });

    await expect(resolveDiagramSession(
      dependencies,
      HEADER.id,
      new AbortController().signal,
    )).resolves.toEqual({ ok: true, value: current });
  });

  it("rejects a stored lifecycle that differs from the live one seen at entry", async () => {
    const stale = { ...HEADER, createdAt: 99 };
    const dependencies = sources({ live: HEADER, stored: stale });
    let lookups = 0;
    dependencies.sessions.get = vi.fn(() => {
      lookups += 1;
      return lookups === 1 ? { header: HEADER } : undefined;
    });

    await expect(resolveDiagramSession(
      dependencies,
      HEADER.id,
      new AbortController().signal,
    )).resolves.toEqual({
      ok: false,
      error: { code: "session-not-found", sessionId: HEADER.id },
    });
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
    stat: vi.fn(),
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
