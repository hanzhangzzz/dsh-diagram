import type { PersistedScene } from "../core/contracts.ts";

/** Result returned by the editor's save adapter. */
export type SaveAttempt =
  | { kind: "saved"; revision: string }
  | { kind: "conflict"; currentRevision: string }
  | { kind: "rejected"; message: string }
  | { kind: "failed"; message: string };

/** User-visible autosave state. */
export type AutosaveStatus =
  | { kind: "saved"; revision: string }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "conflict"; currentRevision: string }
  | { kind: "invalid"; message: string }
  | { kind: "error"; message: string };

/** Dependencies and initial values for one selected diagram. */
export interface SceneAutosaveOptions {
  debounceMs: number;
  initialRevision: string;
  initialScene: PersistedScene | null;
  save: (
    scene: PersistedScene,
    expectedRevision: string,
  ) => Promise<SaveAttempt>;
  onStatus: (status: AutosaveStatus) => void;
}

/**
 * Debounces scene writes while preserving an unsaved draft across failures.
 */
export class SceneAutosaveController {
  private readonly debounceMs: number;
  private readonly save: SceneAutosaveOptions["save"];
  private readonly onStatus: SceneAutosaveOptions["onStatus"];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: PersistedScene | null = null;
  private pendingSerialized: string | null = null;
  private savedSerialized: string | null;
  private saving = false;
  private activeSave: Promise<SaveAttempt> | null = null;
  private disposing = false;
  private disposed = false;
  private disposePromise: Promise<void> | null = null;
  private currentStatus: AutosaveStatus;
  private currentRevision: string;

  /**
   * @param options Initial revision, persisted scene, delay, and save adapter.
   */
  constructor(options: SceneAutosaveOptions) {
    this.debounceMs = options.debounceMs;
    this.currentRevision = options.initialRevision;
    this.savedSerialized =
      options.initialScene === null
        ? null
        : serializeSceneContent(options.initialScene);
    this.save = options.save;
    this.onStatus = options.onStatus;
    this.currentStatus = {
      kind: "saved",
      revision: options.initialRevision,
    };
  }

  /** Current expected revision for the next CAS write. */
  get revision(): string {
    return this.currentRevision;
  }

  /** Latest valid scene that has not been confirmed by the server. */
  get localDraft(): PersistedScene | null {
    return this.pending;
  }

  /** Latest user-visible status. */
  get status(): AutosaveStatus {
    return this.currentStatus;
  }

  /**
   * Queues one locally validated scene.
   *
   * @param scene Current editable scene.
   */
  accept(scene: PersistedScene): void {
    if (
      this.disposed ||
      this.disposing ||
      this.currentStatus.kind === "conflict"
    ) {
      return;
    }
    const serialized = serializeSceneContent(scene);
    if (serialized === this.savedSerialized && !this.saving) {
      this.pending = null;
      this.pendingSerialized = null;
      this.clearTimer();
      this.publish({ kind: "saved", revision: this.currentRevision });
      return;
    }
    if (serialized === this.pendingSerialized) {
      if (this.currentStatus.kind === "invalid") {
        this.publish({ kind: "dirty" });
        this.schedule();
      }
      return;
    }
    this.pending = scene;
    this.pendingSerialized = serialized;
    this.publish({ kind: "dirty" });
    this.schedule();
  }

  /**
   * Stops a queued write because the current editor data failed validation.
   *
   * @param message Actionable validation guidance.
   */
  reject(message: string): void {
    if (this.disposed) return;
    this.clearTimer();
    this.publish({ kind: "invalid", message });
  }

  /** Retries the latest valid local draft after a transport or server error. */
  retry(): void {
    if (
      this.disposed ||
      this.pending === null ||
      this.currentStatus.kind === "conflict" ||
      this.currentStatus.kind === "invalid"
    ) {
      return;
    }
    this.clearTimer();
    void this.flush();
  }

  /**
   * Replaces local save state after an explicit server reload.
   *
   * @param scene Latest server scene.
   * @param revision Latest server revision.
   */
  reset(scene: PersistedScene | null, revision: string): void {
    this.clearTimer();
    this.pending = null;
    this.pendingSerialized = null;
    this.savedSerialized =
      scene === null ? null : serializeSceneContent(scene);
    this.currentRevision = revision;
    this.publish({ kind: "saved", revision });
  }

  /**
   * Flushes the latest valid draft before releasing timers and callbacks.
   *
   * @returns Completion of the final attempted save.
   */
  dispose(): Promise<void> {
    if (this.disposePromise !== null) return this.disposePromise;
    this.disposing = true;
    this.clearTimer();
    this.disposePromise = (async () => {
      if (this.activeSave !== null) {
        try {
          await this.activeSave;
        } catch (saveFailure) {
          void saveFailure;
          // The owning flush publishes this rejection and keeps the draft pending.
        }
      }
      if (
        this.pending !== null &&
        this.currentStatus.kind !== "conflict" &&
        this.currentStatus.kind !== "invalid"
      ) {
        await this.flush();
      }
      this.disposed = true;
      this.pending = null;
      this.pendingSerialized = null;
    })();
    return this.disposePromise;
  }

  private schedule(): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, this.debounceMs);
  }

  private async flush(): Promise<void> {
    if (
      this.disposed ||
      this.saving ||
      this.pending === null ||
      this.pendingSerialized === null ||
      this.isInvalid()
    ) {
      return;
    }
    const scene = this.pending;
    const serialized = this.pendingSerialized;
    const expectedRevision = this.currentRevision;
    this.saving = true;
    this.publish({ kind: "saving" });
    try {
      const activeSave = this.save(scene, expectedRevision);
      this.activeSave = activeSave;
      const result = await activeSave;
      if (this.disposed) return;
      switch (result.kind) {
        case "saved":
          this.savedSerialized = serialized;
          this.currentRevision = result.revision;
          if (this.pendingSerialized === serialized) {
            this.pending = null;
            this.pendingSerialized = null;
            if (!this.isInvalid()) {
              this.publish({ kind: "saved", revision: result.revision });
            }
          } else if (!this.isInvalid()) {
            this.publish({ kind: "dirty" });
          }
          break;
        case "conflict":
          if (!this.isInvalid()) {
            this.publish({
              kind: "conflict",
              currentRevision: result.currentRevision,
            });
          }
          break;
        case "rejected":
        case "failed":
          if (!this.isInvalid()) {
            this.publish({ kind: "error", message: result.message });
          }
          break;
        default:
          assertNever(result);
      }
    } catch (error) {
      if (!this.disposed && !this.isInvalid()) {
        this.publish({
          kind: "error",
          message: `自动保存请求失败：${errorMessage(error)}。请重试。`,
        });
      }
    } finally {
      this.activeSave = null;
      this.saving = false;
      if (
        !this.disposed &&
        !this.disposing &&
        this.pending !== null &&
        this.currentStatus.kind === "dirty"
      ) {
        this.schedule();
      }
    }
  }

  private publish(status: AutosaveStatus): void {
    if (sameAutosaveStatus(this.currentStatus, status)) return;
    this.currentStatus = status;
    this.onStatus(status);
  }

  private isInvalid(): boolean {
    return this.currentStatus.kind === "invalid";
  }

  private clearTimer(): void {
    if (this.timer === undefined) return;
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}

/**
 * Serializes persisted scene content for collision-free equality checks.
 *
 * @param scene JSON scene accepted by durable storage.
 * @returns Exact JSON representation retained while the scene is active.
 */
export function serializeSceneContent(scene: PersistedScene): string {
  return JSON.stringify(scene);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sameAutosaveStatus(
  current: AutosaveStatus,
  next: AutosaveStatus,
): boolean {
  if (current.kind !== next.kind) return false;
  switch (current.kind) {
    case "saved":
      return next.kind === "saved" && current.revision === next.revision;
    case "dirty":
    case "saving":
      return true;
    case "conflict":
      return (
        next.kind === "conflict" &&
        current.currentRevision === next.currentRevision
      );
    case "invalid":
    case "error":
      return next.kind === current.kind && current.message === next.message;
    default:
      return assertNever(current);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported save result: ${JSON.stringify(value)}`);
}
