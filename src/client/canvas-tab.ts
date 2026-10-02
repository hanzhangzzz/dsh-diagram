import { clientTabLabel } from "./strings.ts";

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
 * The tab label it searches for is the SAME localized value the
 * `conversation.view` registration renders, so the two can never drift apart
 * (see AGENTS.md: the registration label and this search share one source).
 *
 * @param from Element inside the conversation used to reach the document.
 * @returns Whether a canvas tab was found and clicked.
 */
export function jumpToCanvasTab(from: Element): boolean {
  const label = clientTabLabel();
  const doc = from.ownerDocument;
  for (const tab of doc.querySelectorAll('[role="tab"]')) {
    if (tab.textContent?.trim() !== label) continue;
    tab.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    return true;
  }
  return false;
}

/** The localized canvas view tab label; single source shared with index.ts. */
export { clientTabLabel as canvasTabLabel };
