/**
 * One-shot deep link from the chat preview card to the canvas editor.
 *
 * The chat card and the editor iframe share the tab's same-origin
 * sessionStorage; the card writes the requested diagram before switching
 * views and the editor consumes it once on mount. Dependency-free for the
 * same reason as diagram-kinds: the client bundle inlines what it imports.
 */

const STORAGE_KEY = "dsh-diagram:canvas-link:v1";

/** The diagram one preview card asked the canvas to open. */
export interface CanvasDeepLink {
  readonly sessionId: string;
  readonly diagramId: string;
}

/**
 * Records the requested diagram for the next canvas mount. Never throws:
 * storage denial only degrades the jump to the editor's default selection.
 * @param storage Tab-scoped storage, or null when unavailable.
 * @param link Session-scoped diagram request.
 */
export function writeCanvasDeepLink(
  storage: Storage | null,
  link: CanvasDeepLink,
): void {
  if (storage === null) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(link));
  } catch {
    // Quota or privacy-mode denial: the jump still switches the view.
  }
}

/**
 * Reads the pending deep link for one session without consuming it.
 * @param storage Tab-scoped storage, or null when unavailable.
 * @param sessionId Session whose canvas is mounting.
 * @returns The matching request, or null.
 */
export function readCanvasDeepLink(
  storage: Storage | null,
  sessionId: string,
): CanvasDeepLink | null {
  if (storage === null) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { sessionId: linkSession, diagramId } = parsed as Record<
      string,
      unknown
    >;
    if (typeof linkSession !== "string" || linkSession !== sessionId) {
      return null;
    }
    if (typeof diagramId !== "string" || diagramId.length === 0) return null;
    return { sessionId: linkSession, diagramId };
  } catch {
    return null;
  }
}

/**
 * Consumes the deep link after the mounting editor has applied it.
 * @param storage Tab-scoped storage, or null when unavailable.
 */
export function clearCanvasDeepLink(storage: Storage | null): void {
  if (storage === null) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore: a stale link is session-scoped and superseded by the next write.
  }
}
