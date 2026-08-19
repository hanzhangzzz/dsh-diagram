/** Visible label of the canvas view tab this plugin registers. */
export const CANVAS_TAB_LABEL = "画布";

/**
 * Switches the conversation to this plugin's canvas view tab.
 *
 * DSH rc.6 exposes no public view-switch API to slot components (the chat
 * store is handle-keyed and the conversation service owns no view state), so
 * this is a deliberately guarded DOM fallback: find the tab DSH rendered for
 * our own `conversation.view` registration and click it. When no such tab is
 * present the caller's affordance degrades to a no-op — never throw. Replace
 * with the official API once DSH publishes one.
 *
 * @param from Element inside the conversation used to reach the document.
 * @returns Whether a canvas tab was found and clicked.
 */
export function jumpToCanvasTab(from: Element): boolean {
  const doc = from.ownerDocument;
  for (const tab of doc.querySelectorAll('[role="tab"]')) {
    if (tab.textContent?.trim() !== CANVAS_TAB_LABEL) continue;
    tab.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    return true;
  }
  return false;
}
