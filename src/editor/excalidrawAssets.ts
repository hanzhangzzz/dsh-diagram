/** Target accepted by Excalidraw's runtime asset resolver. */
export interface ExcalidrawAssetTarget {
  EXCALIDRAW_ASSET_PATH?: string;
}

/** Same-origin base URL for the editor's self-hosted Excalidraw assets. */
export const EXCALIDRAW_ASSET_PATH = "/diagram-assets/";

/**
 * Configures Excalidraw before its JavaScript module is evaluated.
 *
 * @param target Browser global or an isolated test target.
 * @returns Nothing.
 */
export function configureExcalidrawAssets(
  target: ExcalidrawAssetTarget,
): void {
  target.EXCALIDRAW_ASSET_PATH = EXCALIDRAW_ASSET_PATH;
}
