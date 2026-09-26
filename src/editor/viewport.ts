/** A canvas view is transient UI state, never part of the saved document. */
export interface CanvasViewport {
  zoom: number;
  scrollX: number;
  scrollY: number;
}

/** Fit content below the Excalidraw toolbar and above its zoom controls. */
export function fitContentViewport(
  bounds: readonly [number, number, number, number],
  size: { width: number; height: number },
  mode: "fit" | "read" = "fit",
): CanvasViewport | null {
  if (size.width <= 0 || size.height <= 0 || !bounds.every(Number.isFinite)) return null;
  const left = Math.min(40, size.width * 0.08);
  const top = Math.min(104, size.height * 0.3);
  const bottom = Math.min(56, size.height * 0.15);
  const width = size.width - left * 2;
  const height = size.height - top - bottom;
  const contentWidth = Math.max(1, bounds[2] - bounds[0]);
  const contentHeight = Math.max(1, bounds[3] - bounds[1]);
  const zoom = mode === "read"
    ? Math.max(0.75, Math.min(1, width / contentWidth))
    : Math.max(0.1, Math.min(1, width / contentWidth, height / contentHeight));
  return {
    zoom,
    scrollX: mode === "read" && contentWidth * zoom > width
      ? left / zoom - bounds[0]
      : (left + width / 2) / zoom - (bounds[0] + bounds[2]) / 2,
    scrollY: mode === "read" ? top / zoom - bounds[1] : (top + height / 2) / zoom - (bounds[1] + bounds[3]) / 2,
  };
}
