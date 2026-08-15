import { Context, Service } from "@deepseek-ai/cordis";
import {
  SessionId,
  type SessionHeader,
} from "@deepseek-ai/dsh-session";
import type {} from "@deepseek-ai/dsh-session-persistence";
import type { KvTable } from "@deepseek-ai/dsh-storage-domain";
import type {} from "@deepseek-ai/dsh-host-webserver";
import type {} from "@deepseek-ai/dsh-tools";

import type {
  DiagramSpec,
  DiagramValidationPolicy,
} from "../core/contracts.ts";
import {
  DIAGRAM_RPC_CHANNEL,
  type DiagramBusinessResult,
  type DiagramGetRequest,
  type DiagramGetValue,
  type DiagramId,
  type DiagramListRequest,
  type DiagramListValue,
  type DiagramRecord,
  type DiagramRpcError,
  type DiagramSaveRequest,
  type DiagramSaveValue,
  type DiagramSessionId,
} from "../core/rpc.ts";
import {
  Config,
  resolveDiagramConfig,
  validationPolicyOf,
  type DiagramConfig,
} from "./config.ts";
import { createDiagramDomainSpec } from "./domain.ts";
import { createDiagramHttpRpcHandler } from "./http-rpc.ts";
import { DiagramRepository } from "./repository.ts";
import { createDiagramRpcHandler, type DiagramRpcOperations } from "./rpc.ts";
import {
  createEditorAssetsHandler,
  DIAGRAM_ASSETS_PATH,
} from "./static.ts";
import { createDiagramTools, type DiagramToolHost } from "./tools.ts";

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** Durable, Session-scoped diagram Host service. */
    diagram: DiagramService;
  }
}

/** Minimal live and persisted Session sources used at every RPC admission. */
export interface DiagramSessionSources {
  /** Live Session lookup, used before and after a durable catalog read. */
  readonly sessions: {
    get(id: SessionId): { readonly header: SessionHeader } | undefined;
  };
  /** Durable Session existence catalog and authoritative lifecycle inspection. */
  readonly persistence: {
    listSnapshots(signal?: AbortSignal): Promise<readonly {
      readonly header: SessionHeader;
    }[]>;
    inspect(id: SessionId, signal?: AbortSignal): Promise<{
      readonly meta: SessionHeader;
    }>;
  };
}

/** Successful lifecycle resolution or the explicit absence business failure. */
export type DiagramSessionResolution =
  | { ok: true; value: SessionHeader }
  | {
    ok: false;
    error: {
      code: "session-not-found";
      sessionId: DiagramSessionId;
    };
  };

/**
 * Resolves the authoritative Session header without creating or resuming it.
 * @param sources Live store plus persistence catalog and inspector.
 * @param rawSessionId Session id supplied at the RPC boundary.
 * @param signal Caller cancellation forwarded to persistence reads.
 * @returns The exact current lifecycle or session-not-found.
 */
export async function resolveDiagramSession(
  sources: DiagramSessionSources,
  rawSessionId: DiagramSessionId,
  signal: AbortSignal,
): Promise<DiagramSessionResolution> {
  signal.throwIfAborted();
  const sessionId = SessionId(String(rawSessionId));
  const initialLive = sources.sessions.get(sessionId)?.header;
  if (initialLive === undefined) {
    const snapshots = await sources.persistence.listSnapshots(signal);
    signal.throwIfAborted();
    if (!snapshots.some((snapshot) => snapshot.header.id === sessionId)
      && sources.sessions.get(sessionId) === undefined) {
      return {
        ok: false,
        error: { code: "session-not-found", sessionId },
      };
    }
  }
  const inspection = await sources.persistence.inspect(sessionId, signal);
  signal.throwIfAborted();
  const currentLive = sources.sessions.get(sessionId)?.header;
  if (currentLive !== undefined) {
    return { ok: true, value: currentLive };
  }
  if (initialLive !== undefined
    && !sameSessionLifecycle(initialLive, inspection.meta)) {
    return {
      ok: false,
      error: { code: "session-not-found", sessionId },
    };
  }
  return { ok: true, value: inspection.meta };
}

function sameSessionLifecycle(left: SessionHeader, right: SessionHeader): boolean {
  return left.id === right.id
    && left.createdAt === right.createdAt
    && left.cwd === right.cwd;
}

/** Durable Host service for the editor RPC, static assets, and model tools. */
export class DiagramService extends Service implements
  DiagramRpcOperations, DiagramToolHost {
  static inject = [
    "storageDomain",
    "sessionPersistence",
    "sessions",
    "tools",
    "webServer",
  ];

  /** Cordis loader validation for all required deployment limits. */
  static Config = Config;

  /** Common model, RPC, and durable-data validation limits. */
  readonly validationPolicy: Readonly<DiagramValidationPolicy>;
  /** Maximum Unicode code points returned by diagram_read. */
  readonly maxReadChars: number;

  private readonly config: DiagramConfig;
  private repository?: DiagramRepository;
  private sessionStore?: DiagramSessionSources["sessions"];

  /**
   * @param ctx Host context carrying the required capability services.
   * @param config Explicit deployment limits.
   * @param editorRoot Absolute path to the built Vite editor directory.
   */
  constructor(
    ctx: Context,
    config: DiagramConfig,
    private readonly editorRoot: string,
  ) {
    super(ctx, "diagram");
    this.config = resolveDiagramConfig(config);
    this.validationPolicy = validationPolicyOf(this.config);
    this.maxReadChars = this.config.maxReadChars;
  }

  /** Opens durable state before exposing all external entry points. */
  protected async [Service.init](): Promise<void> {
    if (this.ctx.webServer.host !== "127.0.0.1") {
      throw new Error(
        "diagram requires webServer.host to be 127.0.0.1 because its RPC requires a physical loopback bind",
      );
    }
    // The aggregate program exposes Host and Client `sessions` faces under the
    // same Context key. Static injection selects the active Host provider.
    this.sessionStore = this.ctx.get("sessions") as unknown as
      DiagramSessionSources["sessions"];
    const domain = await this.ctx.storageDomain.open(
      createDiagramDomainSpec(this.validationPolicy),
    );
    const repository = new DiagramRepository(
      domain.table("diagrams") as KvTable<DiagramId, DiagramRecord>,
      {
        validationPolicy: this.validationPolicy,
        maxDiagramsPerSession: this.config.maxDiagramsPerSession,
        maxDiagramsTotal: this.config.maxDiagramsTotal,
        maxStoredBytesTotal: this.config.maxStoredBytesTotal,
        autosaveDebounceMs: this.config.autosaveDebounceMs,
        maxReadChars: this.config.maxReadChars,
      },
    );
    this.repository = repository;
    this.ctx.effect(() => async () => {
      await repository.dispose();
      await domain.close();
    }, "diagram.domainClose");

    this.ctx.effect(
      () => this.ctx.webServer.register({
        kind: "prefix",
        path: DIAGRAM_ASSETS_PATH,
        handler: createEditorAssetsHandler(this.editorRoot),
      }),
      "diagram.editorAssets",
    );
    this.ctx.effect(
      () => this.ctx.webServer.register({
        kind: "prefix",
        path: DIAGRAM_RPC_CHANNEL,
        handler: createDiagramHttpRpcHandler(
          createDiagramRpcHandler(this, this.validationPolicy, this.ctx.logger),
          this.validationPolicy.maxSceneBytes,
          this.ctx.logger,
        ),
      }),
      "diagram.rpc",
    );
    for (const tool of createDiagramTools(this)) {
      this.ctx.tools.register(tool);
    }
  }

  /**
   * Lists only diagrams owned by the requested current Session lifecycle.
   * @param request Strict list request.
   * @param signal RPC cancellation.
   * @returns Current summaries and Client limits, or session-not-found.
   */
  async list(
    request: DiagramListRequest,
    signal: AbortSignal,
  ): Promise<DiagramBusinessResult<DiagramListValue, DiagramRpcError>> {
    const session = await this.resolveSession(request.sessionId, signal);
    if (!session.ok) return session;
    return { ok: true, value: this.requireRepository().list(session.value) };
  }

  /**
   * Reads one diagram after Session lifecycle and ownership validation.
   * @param request Strict get request.
   * @param signal RPC cancellation.
   * @returns Current record or an indistinguishable diagram-not-found failure.
   */
  async get(
    request: DiagramGetRequest,
    signal: AbortSignal,
  ): Promise<DiagramBusinessResult<DiagramGetValue, DiagramRpcError>> {
    const session = await this.resolveSession(request.sessionId, signal);
    if (!session.ok) return session;
    return this.requireRepository().get(session.value, request.id);
  }

  /**
   * Saves one complete scene after Session lifecycle and ownership validation.
   * @param request Strict compare-and-swap request.
   * @param signal RPC cancellation.
   * @returns Committed record, unchanged success, or explicit business failure.
   */
  async save(
    request: DiagramSaveRequest,
    signal: AbortSignal,
  ): Promise<DiagramBusinessResult<DiagramSaveValue, DiagramRpcError>> {
    const session = await this.resolveSession(request.sessionId, signal);
    if (!session.ok) return session;
    return this.requireRepository().save(session.value, {
      id: request.id,
      expectedRevision: request.expectedRevision,
      scene: request.scene,
    }, signal);
  }

  /**
   * Creates a diagram for the exact live Agent Session lifecycle.
   * @param session Calling Agent's immutable Session header.
   * @param sourceSpec Strict semantic diagram input.
   * @param signal Tool cancellation.
   * @returns The committed durable record.
   */
  createDiagram(
    session: SessionHeader,
    sourceSpec: DiagramSpec,
    signal: AbortSignal,
  ): Promise<DiagramRecord> {
    return this.requireRepository().create(session, sourceSpec, signal);
  }

  /**
   * Reads a diagram only from the exact live Agent Session lifecycle.
   * @param session Calling Agent's immutable Session header.
   * @param id Opaque diagram id.
   * @param signal Tool cancellation.
   * @returns Current record or an indistinguishable not-found failure.
   */
  readDiagram(
    session: SessionHeader,
    id: DiagramId,
    signal: AbortSignal,
  ): Promise<DiagramBusinessResult<DiagramGetValue, DiagramRpcError>> {
    signal.throwIfAborted();
    return Promise.resolve(this.requireRepository().get(session, id));
  }

  private resolveSession(
    sessionId: DiagramSessionId,
    signal: AbortSignal,
  ): Promise<DiagramSessionResolution> {
    return resolveDiagramSession({
      sessions: this.requireSessionStore(),
      persistence: this.ctx.sessionPersistence,
    }, sessionId, signal);
  }

  private requireRepository(): DiagramRepository {
    if (this.repository === undefined) {
      throw new Error("diagram durable domain is not initialized");
    }
    return this.repository;
  }

  private requireSessionStore(): DiagramSessionSources["sessions"] {
    if (this.sessionStore === undefined) {
      throw new Error("diagram Host SessionStore is not initialized");
    }
    return this.sessionStore;
  }
}
