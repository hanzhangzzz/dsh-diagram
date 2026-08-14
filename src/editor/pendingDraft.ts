import { z } from "zod";

import {
  createSceneSchema,
  type DiagramValidationPolicy,
  type PersistedScene,
} from "../core/contracts.ts";
import {
  diagramIdSchema,
  diagramRevisionSchema,
  diagramSessionIdSchema,
} from "../core/rpc.ts";
import { serializeSceneContent } from "./autosave.ts";

const STORAGE_KEY = "dsh-diagram:pending-draft:v1";

/** One current diagram draft retained across iframe destruction. */
export interface PendingDiagramDraft {
  version: 1;
  sessionId: string;
  diagramId: string;
  expectedRevision: string;
  scene: PersistedScene;
}

/** Identity used when explicitly discarding one stored draft. */
export interface PendingDiagramDraftIdentity {
  sessionId: string;
  diagramId: string;
}

/** Optional exact saved write used to avoid deleting a newer local draft. */
export interface SavedDiagramDraft extends PendingDiagramDraftIdentity {
  expectedRevision: string;
  scene: PersistedScene;
}

/**
 * Returns same-origin session storage when the browser permits access.
 *
 * @returns Storage for this tab, or null when access is disabled.
 */
export function resolvePendingDraftStorage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch (storageAccessError) {
    void storageAccessError;
    return null;
  }
}

/**
 * Reads and validates this session's current pending diagram draft.
 *
 * @param storage Storage selected by the editor.
 * @param sessionId Current DSH session.
 * @param policy Active scene validation limits.
 * @returns A valid same-session draft, or null.
 */
export function readPendingDiagramDraft(
  storage: Storage | null,
  sessionId: string,
  policy: Readonly<DiagramValidationPolicy>,
): PendingDiagramDraft | null {
  if (storage === null) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = createPendingDraftSchema(policy).safeParse(JSON.parse(raw));
    if (!parsed.success) {
      storage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed.data.sessionId === sessionId ? parsed.data : null;
  } catch (storageReadError) {
    void storageReadError;
    return null;
  }
}

/**
 * Stores one current valid draft synchronously during pagehide.
 *
 * @param storage Storage selected by the editor.
 * @param draft Current diagram, expected revision, and validated scene.
 * @returns Whether the browser accepted the record.
 */
export function writePendingDiagramDraft(
  storage: Storage | null,
  draft: PendingDiagramDraft,
): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(draft));
    return true;
  } catch (storageWriteError) {
    void storageWriteError;
    return false;
  }
}

/**
 * Removes a matching draft, optionally only after its exact scene was saved.
 *
 * @param storage Storage selected by the editor.
 * @param expected Diagram identity and optional exact saved write.
 */
export function clearPendingDiagramDraft(
  storage: Storage | null,
  expected: PendingDiagramDraftIdentity | SavedDiagramDraft,
): void {
  if (storage === null) return;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return;
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) return;
    if (
      value.sessionId !== expected.sessionId ||
      value.diagramId !== expected.diagramId
    ) {
      return;
    }
    if ("expectedRevision" in expected) {
      if (
        value.expectedRevision !== expected.expectedRevision ||
        !isRecord(value.scene) ||
        serializeSceneContent(value.scene as PersistedScene) !==
          serializeSceneContent(expected.scene)
      ) {
        return;
      }
    }
    storage.removeItem(STORAGE_KEY);
  } catch (storageRemoveError) {
    void storageRemoveError;
  }
}

function createPendingDraftSchema(
  policy: Readonly<DiagramValidationPolicy>,
): z.ZodType<PendingDiagramDraft> {
  return z
    .object({
      version: z.literal(1),
      sessionId: diagramSessionIdSchema,
      diagramId: diagramIdSchema,
      expectedRevision: diagramRevisionSchema,
      scene: createSceneSchema(policy),
    })
    .strict();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
