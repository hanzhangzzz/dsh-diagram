import { randomUUID } from "node:crypto";
import type { SessionHeader } from "@deepseek-ai/dsh-session";

import type {
  DiagramSpec,
  DiagramValidationPolicy,
} from "../core/contracts.ts";
import type {
  DiagramBusinessResult,
  DiagramGetValue,
  DiagramId,
  DiagramRecord,
  DiagramRevision,
  DiagramRpcError,
  DiagramSaveRequest,
  DiagramSaveValue,
  DiagramSessionId,
  DiagramSummary,
} from "../core/rpc.ts";

/** Storage-domain table operations used by the diagram repository. */
export interface DiagramTable {
  /** Returns the current durable record, when present. */
  get(id: DiagramId): DiagramRecord | undefined;
  /** Returns a stable snapshot iterator over durable records. */
  entries(): IterableIterator<[DiagramId, DiagramRecord]>;
  /** Current durable record count. */
  readonly size: number;
  /** Replaces one whole record after the backend commits it. */
  put(id: DiagramId, record: DiagramRecord): Promise<void>;
}

/** Deployment policy needed by durable diagram operations. */
export interface DiagramRepositoryPolicy {
  readonly validationPolicy: Readonly<DiagramValidationPolicy>;
  readonly maxDiagramsPerSession: number;
  readonly maxDiagramsTotal: number;
  readonly maxStoredBytesTotal: number;
  readonly autosaveDebounceMs: number;
  readonly maxReadChars: number;
}

/** Injectable sources for deterministic repository tests. */
export interface DiagramRepositoryDependencies {
  /** Returns a Host timestamp in Unix epoch milliseconds. */
  readonly now: () => number;
  /** Mints one opaque diagram id. */
  readonly nextDiagramId: () => DiagramId;
  /** Mints one opaque content revision. */
  readonly nextRevision: () => DiagramRevision;
}

const DEFAULT_DEPENDENCIES: DiagramRepositoryDependencies = {
  now: Date.now,
  nextDiagramId: () => randomUUID() as DiagramId,
  nextRevision: () => randomUUID() as DiagramRevision,
};

/** Creation rejection when a durable deployment capacity is full. */
export class DiagramCapacityError extends Error {
  override readonly name = "DiagramCapacityError";

  /**
   * @param scope Capacity whose limit was reached.
   * @param limit Configured maximum record count or canonical UTF-8 byte total.
   */
  constructor(
    readonly scope: "session" | "global" | "bytes",
    readonly limit: number,
  ) {
    super(
      scope === "session"
        ? `diagram session capacity reached (${String(limit)})`
        : scope === "global"
          ? `diagram global capacity reached (${String(limit)})`
          : `diagram durable byte capacity reached (${String(limit)})`,
    );
  }
}

/** Durable session-scoped diagram operations. */
export class DiagramRepository {
  private readonly operationTails = new Map<DiagramId, Promise<void>>();
  private creationTail: Promise<void> = Promise.resolve();
  private capacityTail: Promise<void> = Promise.resolve();
  private storedBytes = 0;
  private mutationAdmissionOpen = true;
  private disposal?: Promise<void>;

  /**
   * @param table Storage-domain table owned by the Host service.
   * @param policy Deployment-selected limits returned to the Client.
   * @param dependencies Host time and opaque-id sources.
   */
  constructor(
    private readonly table: DiagramTable,
    private readonly policy: DiagramRepositoryPolicy,
    private readonly dependencies: DiagramRepositoryDependencies = DEFAULT_DEPENDENCIES,
  ) {
    for (const [, record] of table.entries()) {
      this.storedBytes += serializedRecordBytes(record);
    }
  }

  /**
   * Creates one provenance record for the exact calling Session lifecycle.
   * @param session Immutable Session owner.
   * @param sourceSpec Validated semantic input.
   * @param signal Optional caller cancellation.
   * @returns The committed diagram record.
   */
  async create(
    session: SessionHeader,
    sourceSpec: DiagramSpec,
    signal?: AbortSignal,
  ): Promise<DiagramRecord> {
    return this.enqueueCreation(async () => {
      signal?.throwIfAborted();
      if (this.table.size >= this.policy.maxDiagramsTotal) {
        throw new DiagramCapacityError("global", this.policy.maxDiagramsTotal);
      }
      let sessionCount = 0;
      for (const [, record] of this.table.entries()) {
        if (ownedBy(record, session)) sessionCount += 1;
      }
      if (sessionCount >= this.policy.maxDiagramsPerSession) {
        throw new DiagramCapacityError(
          "session",
          this.policy.maxDiagramsPerSession,
        );
      }

      const now = this.dependencies.now();
      const id = this.dependencies.nextDiagramId();
      if (this.table.get(id) !== undefined) {
        throw new Error(`diagram id collision: ${id}`);
      }
      const record: DiagramRecord = {
        id,
        sessionId: String(session.id) as DiagramSessionId,
        sessionFingerprint: fingerprintOf(session),
        title: sourceSpec.title,
        kind: sourceSpec.kind,
        sourceSpec: structuredClone(sourceSpec),
        revision: this.dependencies.nextRevision(),
        createdAt: now,
        updatedAt: now,
      };
      return this.enqueueCapacity(async () => {
        signal?.throwIfAborted();
        const recordBytes = serializedRecordBytes(record);
        if (this.storedBytes + recordBytes > this.policy.maxStoredBytesTotal) {
          throw new DiagramCapacityError("bytes", this.policy.maxStoredBytesTotal);
        }
        await this.table.put(id, record);
        this.storedBytes += recordBytes;
        return snapshotRecord(record);
      });
    });
  }

  /**
   * Lists diagrams belonging to the exact supplied Session lifecycle.
   * @param session Immutable Session owner.
   * @returns Current summaries and Client-side save limits.
   */
  list(session: SessionHeader) {
    const diagrams: DiagramSummary[] = [];
    for (const [, record] of this.table.entries()) {
      if (!ownedBy(record, session)) continue;
      diagrams.push(summaryOf(record));
    }
    diagrams.sort((left, right) =>
      right.updatedAt - left.updatedAt
      || right.createdAt - left.createdAt
      || left.id.localeCompare(right.id));
    return {
      diagrams,
      limits: {
        autosaveDebounceMs: this.policy.autosaveDebounceMs,
        validationPolicy: { ...this.policy.validationPolicy },
      },
    };
  }

  /**
   * Reads a diagram only when it belongs to the supplied Session lifecycle.
   * @param session Immutable Session owner.
   * @param id Opaque diagram id.
   * @returns The current record or an indistinguishable not-found failure.
   */
  get(
    session: SessionHeader,
    id: DiagramId,
  ): DiagramBusinessResult<DiagramGetValue, DiagramRpcError> {
    const record = this.table.get(id);
    if (record === undefined || !ownedBy(record, session)) {
      return { ok: false, error: { code: "diagram-not-found", id } };
    }
    return { ok: true, value: { diagram: snapshotRecord(record) } };
  }

  /**
   * Saves one complete current scene under an exact expected revision.
   * @param session Immutable Session owner.
   * @param request Diagram id, expected revision, and replacement scene.
   * @param signal Optional caller cancellation.
   * @returns The committed record, an unchanged success, or a business failure.
   */
  save(
    session: SessionHeader,
    request: Omit<DiagramSaveRequest, "sessionId">,
    signal?: AbortSignal,
  ): Promise<DiagramBusinessResult<DiagramSaveValue, DiagramRpcError>> {
    return this.enqueue(request.id, async () => {
      signal?.throwIfAborted();
      const current = this.table.get(request.id);
      if (current === undefined || !ownedBy(current, session)) {
        return { ok: false, error: { code: "diagram-not-found", id: request.id } };
      }
      if (current.revision !== request.expectedRevision) {
        return {
          ok: false,
          error: { code: "version-conflict", current: snapshotRecord(current) },
        };
      }
      if (current.scene !== undefined && sameJson(current.scene, request.scene)) {
        return {
          ok: true,
          value: { diagram: snapshotRecord(current), unchanged: true },
        };
      }

      const next: DiagramRecord = {
        ...current,
        scene: structuredClone(request.scene),
        revision: this.dependencies.nextRevision(),
        updatedAt: Math.max(this.dependencies.now(), current.updatedAt),
      };
      return this.enqueueCapacity(async () => {
        signal?.throwIfAborted();
        const currentBytes = serializedRecordBytes(current);
        const nextBytes = serializedRecordBytes(next);
        const byteIncrease = nextBytes - currentBytes;
        if (byteIncrease > 0
          && this.storedBytes + byteIncrease > this.policy.maxStoredBytesTotal) {
          return {
            ok: false,
            error: {
              code: "storage-capacity",
              scope: "global-bytes",
              limitBytes: this.policy.maxStoredBytesTotal,
            },
          };
        }
        await this.table.put(request.id, next);
        this.storedBytes += byteIncrease;
        return {
          ok: true,
          value: { diagram: snapshotRecord(next), unchanged: false },
        };
      });
    });
  }

  /**
   * Rejects new mutations and waits for every previously admitted write.
   * @returns Resolution after all accepted writes settle.
   */
  dispose(): Promise<void> {
    this.mutationAdmissionOpen = false;
    this.disposal ??= Promise.all([
      this.creationTail,
      this.capacityTail,
      ...this.operationTails.values(),
    ]).then(() => undefined);
    return this.disposal;
  }

  private enqueue<T>(id: DiagramId, operation: () => Promise<T>): Promise<T> {
    if (!this.mutationAdmissionOpen) {
      return Promise.reject(new Error("diagram repository is disposing"));
    }
    const previous = this.operationTails.get(id) ?? Promise.resolve();
    const result = previous.then(operation);
    const tail = result.then(() => undefined, () => undefined);
    this.operationTails.set(id, tail);
    return result.finally(() => {
      if (this.operationTails.get(id) === tail) this.operationTails.delete(id);
    });
  }

  private enqueueCreation<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.mutationAdmissionOpen) {
      return Promise.reject(new Error("diagram repository is disposing"));
    }
    const result = this.creationTail.then(operation);
    this.creationTail = result.then(() => undefined, () => undefined);
    return result;
  }

  private enqueueCapacity<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.capacityTail.then(operation);
    this.capacityTail = result.then(() => undefined, () => undefined);
    return result;
  }
}

function fingerprintOf(session: SessionHeader): DiagramRecord["sessionFingerprint"] {
  return {
    createdAt: session.createdAt,
    ...(session.cwd === undefined ? {} : { cwd: session.cwd }),
  };
}

function ownedBy(record: DiagramRecord, session: SessionHeader): boolean {
  return record.sessionId === String(session.id)
    && record.sessionFingerprint.createdAt === session.createdAt
    && record.sessionFingerprint.cwd === session.cwd;
}

function summaryOf(record: DiagramRecord): DiagramSummary {
  return {
    id: record.id,
    title: record.title,
    kind: record.kind,
    revision: record.revision,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    hasScene: record.scene !== undefined,
  };
}

function snapshotRecord(record: DiagramRecord): DiagramRecord {
  return structuredClone(record);
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

function serializedRecordBytes(record: DiagramRecord): number {
  return Buffer.byteLength(canonicalJson(record), "utf8");
}
