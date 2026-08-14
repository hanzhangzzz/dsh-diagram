import { describe, expect, it } from "vitest";
import { SessionId, type SessionHeader } from "@deepseek-ai/dsh-session";

import {
  DEFAULT_DIAGRAM_VALIDATION_POLICY,
  type DiagramSpec,
  type PersistedScene,
} from "../src/core/contracts.ts";
import type {
  DiagramId,
  DiagramRecord,
} from "../src/core/rpc.ts";
import {
  DiagramRepository,
  type DiagramRepositoryDependencies,
  type DiagramTable,
} from "../src/host/repository.ts";

class MemoryDiagramTable implements DiagramTable {
  readonly records = new Map<DiagramId, DiagramRecord>();
  beforePut: () => Promise<void> = () => Promise.resolve();

  get(id: DiagramId): DiagramRecord | undefined {
    return this.records.get(id);
  }

  entries(): IterableIterator<[DiagramId, DiagramRecord]> {
    return new Map(this.records).entries();
  }

  get size(): number {
    return this.records.size;
  }

  async put(id: DiagramId, record: DiagramRecord): Promise<void> {
    await this.beforePut();
    this.records.set(id, record);
  }
}

const SPEC: DiagramSpec = {
  kind: "flow",
  title: "Article flow",
  nodes: [{ id: "claim", label: "Claim" }],
  edges: [],
};

function session(id: string, createdAt: number, cwd?: string): SessionHeader {
  return {
    version: 0,
    id: SessionId(id),
    createdAt,
    ...(cwd === undefined ? {} : { cwd }),
  };
}

function dependencies(): DiagramRepositoryDependencies {
  const ids = [
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
    "00000000-0000-4000-8000-000000000003",
    "00000000-0000-4000-8000-000000000004",
    "00000000-0000-4000-8000-000000000005",
  ];
  const revisions = [
    "10000000-0000-4000-8000-000000000001",
    "10000000-0000-4000-8000-000000000002",
    "10000000-0000-4000-8000-000000000003",
    "10000000-0000-4000-8000-000000000004",
    "10000000-0000-4000-8000-000000000005",
  ];
  return {
    now: () => 1_700_000_000_000,
    nextDiagramId: () => ids.shift() as DiagramId,
    nextRevision: () => revisions.shift() as DiagramRecord["revision"],
  };
}

const SCENE: PersistedScene = {
  elements: [{
    id: "shape-1",
    type: "rectangle",
    x: 10,
    y: 20,
    width: 160,
    height: 80,
    link: null,
  }],
  appState: { viewBackgroundColor: "#ffffff" },
  files: {},
};

function repository(table = new MemoryDiagramTable()): DiagramRepository {
  return new DiagramRepository(table, {
    validationPolicy: DEFAULT_DIAGRAM_VALIDATION_POLICY,
    maxDiagramsPerSession: 2,
    maxDiagramsTotal: 3,
    maxStoredBytesTotal: 1_048_576,
    autosaveDebounceMs: 800,
    maxReadChars: 12_000,
  }, dependencies());
}

describe("DiagramRepository", () => {
  it("creates a diagram for one exact Session lifecycle", async () => {
    const repo = repository();
    const owner = session("session-one", 10, "/workspace");
    const created = await repo.create(owner, SPEC);

    expect(repo.list(owner).diagrams).toEqual([
      expect.objectContaining({
        id: created.id,
        title: "Article flow",
        revision: created.revision,
        hasScene: false,
      }),
    ]);
    expect(repo.get(owner, created.id)).toEqual({
      ok: true,
      value: { diagram: created },
    });

    const reusedId = session("session-one", 11, "/workspace");
    expect(repo.list(reusedId).diagrams).toEqual([]);
    expect(repo.get(reusedId, created.id)).toEqual({
      ok: false,
      error: { code: "diagram-not-found", id: created.id },
    });
  });

  it("lists the most recently created diagram first", async () => {
    const table = new MemoryDiagramTable();
    const base = dependencies();
    const times = [1_700_000_000_000, 1_700_000_000_001];
    const repo = new DiagramRepository(table, {
      validationPolicy: DEFAULT_DIAGRAM_VALIDATION_POLICY,
      maxDiagramsPerSession: 2,
      maxDiagramsTotal: 3,
      maxStoredBytesTotal: 1_048_576,
      autosaveDebounceMs: 800,
      maxReadChars: 12_000,
    }, {
      ...base,
      now: () => times.shift() ?? 1_700_000_000_001,
    });
    const owner = session("session-order", 60);
    const older = await repo.create(owner, { ...SPEC, title: "Older" });
    const newer = await repo.create(owner, { ...SPEC, title: "Newer" });

    expect(repo.list(owner).diagrams.map((diagram) => diagram.id)).toEqual([
      newer.id,
      older.id,
    ]);
  });

  it("uses revision CAS and does not churn an unchanged scene", async () => {
    const repo = repository();
    const owner = session("session-cas", 20);
    const created = await repo.create(owner, SPEC);

    const saved = await repo.save(owner, {
      id: created.id,
      expectedRevision: created.revision,
      scene: SCENE,
    });
    expect(saved).toMatchObject({
      ok: true,
      value: {
        unchanged: false,
        diagram: { scene: SCENE },
      },
    });
    if (!saved.ok) throw new Error("expected first save to succeed");
    expect(saved.value.diagram.revision).not.toBe(created.revision);

    const unchanged = await repo.save(owner, {
      id: created.id,
      expectedRevision: saved.value.diagram.revision,
      scene: structuredClone(SCENE),
    });
    expect(unchanged).toEqual({
      ok: true,
      value: { diagram: saved.value.diagram, unchanged: true },
    });

    const stale = await repo.save(owner, {
      id: created.id,
      expectedRevision: created.revision,
      scene: { ...SCENE, appState: {} },
    });
    expect(stale).toEqual({
      ok: false,
      error: { code: "version-conflict", current: saved.value.diagram },
    });
  });

  it("serializes concurrent saves for the same diagram", async () => {
    const repo = repository();
    const owner = session("session-race", 30);
    const created = await repo.create(owner, SPEC);
    const alternate: PersistedScene = {
      ...SCENE,
      appState: { viewBackgroundColor: "#eeeeee" },
    };

    const results = await Promise.all([
      repo.save(owner, {
        id: created.id,
        expectedRevision: created.revision,
        scene: SCENE,
      }),
      repo.save(owner, {
        id: created.id,
        expectedRevision: created.revision,
        scene: alternate,
      }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
    const rejected = results.find((result) => !result.ok);
    expect(rejected).toMatchObject({
      ok: false,
      error: { code: "version-conflict" },
    });
    if (rejected?.ok === false && rejected.error.code === "version-conflict") {
      expect(repo.get(owner, created.id)).toEqual({
        ok: true,
        value: { diagram: rejected.error.current },
      });
    }
  });

  it("enforces per-session and global durable capacities", async () => {
    const repo = repository();
    const first = session("session-capacity-a", 40);
    const second = session("session-capacity-b", 41);
    await repo.create(first, SPEC);
    await repo.create(first, { ...SPEC, title: "Second" });

    await expect(repo.create(first, { ...SPEC, title: "Third" })).rejects.toMatchObject({
      name: "DiagramCapacityError",
      scope: "session",
      limit: 2,
    });

    await repo.create(second, SPEC);
    await expect(repo.create(second, { ...SPEC, title: "Global overflow" })).rejects.toMatchObject({
      name: "DiagramCapacityError",
      scope: "global",
      limit: 3,
    });
  });

  it("rejects a create that would exceed the durable byte budget", async () => {
    const repo = new DiagramRepository(new MemoryDiagramTable(), {
      validationPolicy: DEFAULT_DIAGRAM_VALIDATION_POLICY,
      maxDiagramsPerSession: 2,
      maxDiagramsTotal: 3,
      maxStoredBytesTotal: 1,
      autosaveDebounceMs: 800,
      maxReadChars: 12_000,
    }, dependencies());

    await expect(repo.create(session("session-byte-create", 45), SPEC))
      .rejects.toMatchObject({
        name: "DiagramCapacityError",
        scope: "bytes",
        limit: 1,
      });
  });

  it("serializes the global byte admission across different diagrams", async () => {
    const table = new MemoryDiagramTable();
    const seed = repository(table);
    const owner = session("session-byte-save", 46);
    const first = await seed.create(owner, SPEC);
    const second = await seed.create(owner, { ...SPEC, title: "Second" });
    const storedBytes = [...table.records.values()].reduce(
      (total, record) => total + Buffer.byteLength(JSON.stringify(record)),
      0,
    );
    const sceneIncrease = Buffer.byteLength(JSON.stringify({ ...first, scene: SCENE }))
      - Buffer.byteLength(JSON.stringify(first));
    const constrained = new DiagramRepository(table, {
      validationPolicy: DEFAULT_DIAGRAM_VALIDATION_POLICY,
      maxDiagramsPerSession: 2,
      maxDiagramsTotal: 3,
      maxStoredBytesTotal: storedBytes + sceneIncrease,
      autosaveDebounceMs: 800,
      maxReadChars: 12_000,
    }, dependencies());

    const results = await Promise.all([
      constrained.save(owner, {
        id: first.id,
        expectedRevision: first.revision,
        scene: SCENE,
      }),
      constrained.save(owner, {
        id: second.id,
        expectedRevision: second.revision,
        scene: SCENE,
      }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      {
        ok: false,
        error: {
          code: "storage-capacity",
          scope: "global-bytes",
          limitBytes: storedBytes + sceneIncrease,
        },
      },
    ]);
  });

  it("allows a save that does not increase an already over-budget store", async () => {
    const table = new MemoryDiagramTable();
    const seed = repository(table);
    const owner = session("session-byte-reduce", 47);
    const created = await seed.create(owner, SPEC);
    const withScene = await seed.save(owner, {
      id: created.id,
      expectedRevision: created.revision,
      scene: SCENE,
    });
    if (!withScene.ok) throw new Error("expected seed save to succeed");
    const constrained = new DiagramRepository(table, {
      validationPolicy: DEFAULT_DIAGRAM_VALIDATION_POLICY,
      maxDiagramsPerSession: 2,
      maxDiagramsTotal: 3,
      maxStoredBytesTotal: 1,
      autosaveDebounceMs: 800,
      maxReadChars: 12_000,
    }, dependencies());

    await expect(constrained.save(owner, {
      id: created.id,
      expectedRevision: withScene.value.diagram.revision,
      scene: { elements: [], appState: {}, files: {} },
    })).resolves.toMatchObject({
      ok: true,
      value: { unchanged: false },
    });
  });

  it("stops mutation admission and drains an accepted save on dispose", async () => {
    const table = new MemoryDiagramTable();
    const repo = repository(table);
    const owner = session("session-dispose", 50);
    const created = await repo.create(owner, SPEC);
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    table.beforePut = async () => {
      entered.resolve();
      await release.promise;
    };

    const accepted = repo.save(owner, {
      id: created.id,
      expectedRevision: created.revision,
      scene: SCENE,
    });
    await entered.promise;
    const disposal = repo.dispose();

    await expect(repo.save(owner, {
      id: created.id,
      expectedRevision: created.revision,
      scene: SCENE,
    })).rejects.toThrow("diagram repository is disposing");

    let disposed = false;
    void disposal.then(() => { disposed = true; });
    await Promise.resolve();
    expect(disposed).toBe(false);
    release.resolve();
    await expect(accepted).resolves.toMatchObject({ ok: true });
    await disposal;
    expect(disposed).toBe(true);
  });

  it("keeps a concurrent create burst inside capacity", async () => {
    const repo = new DiagramRepository(new MemoryDiagramTable(), {
      validationPolicy: DEFAULT_DIAGRAM_VALIDATION_POLICY,
      maxDiagramsPerSession: 1,
      maxDiagramsTotal: 1,
      maxStoredBytesTotal: 1_048_576,
      autosaveDebounceMs: 800,
      maxReadChars: 12_000,
    }, dependencies());
    const owner = session("session-create-race", 60);

    const results = await Promise.allSettled([
      repo.create(owner, SPEC),
      repo.create(owner, { ...SPEC, title: "Concurrent" }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: { name: "DiagramCapacityError", scope: "global", limit: 1 },
    });
  });
});
