import {
  exportToBlob,
  exportToSvg,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import type {
  AppState,
  BinaryFiles,
} from "@excalidraw/excalidraw/types";
import type { NonDeletedExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import type { PersistedScene } from "../core/contracts.ts";

/** Export formats offered by the diagram toolbar. */
export type DiagramExportFormat = "excalidraw" | "svg" | "png";

/** Download-ready artifact produced from the authoritative scene. */
export interface DiagramExport {
  filename: string;
  blob: Blob;
}

/**
 * Produces an editable or publication artifact from one validated scene.
 *
 * @param format Requested output format.
 * @param title Diagram title used for the filename.
 * @param scene Current validated editor scene.
 * @returns Download-ready blob and safe filename.
 */
export async function createDiagramExport(
  format: DiagramExportFormat,
  title: string,
  scene: PersistedScene,
): Promise<DiagramExport> {
  const baseName = safeExportBaseName(title);
  const elements =
    scene.elements as unknown as readonly NonDeletedExcalidrawElement[];
  const appState = scene.appState as unknown as Partial<AppState>;
  const files = scene.files as BinaryFiles;

  switch (format) {
    case "excalidraw":
      return {
        filename: `${baseName}.excalidraw`,
        blob: new Blob(
          [serializeAsJSON(elements, appState, files, "local")],
          { type: "application/json" },
        ),
      };
    case "svg": {
      const svg = await exportToSvg({
        elements,
        appState: { ...appState, exportBackground: true },
        files,
        exportPadding: 32,
        renderEmbeddables: false,
      });
      return {
        filename: `${baseName}.svg`,
        blob: new Blob([svg.outerHTML], { type: "image/svg+xml" }),
      };
    }
    case "png":
      return {
        filename: `${baseName}.png`,
        blob: await exportToBlob({
          elements,
          appState: { ...appState, exportBackground: true },
          files,
          exportPadding: 32,
          mimeType: "image/png",
        }),
      };
    default:
      return assertNever(format);
  }
}

/**
 * Starts a browser download and releases its temporary object URL.
 *
 * @param artifact Download-ready blob and filename.
 */
export function downloadDiagramExport(artifact: DiagramExport): void {
  const url = URL.createObjectURL(artifact.blob);
  const anchor = document.createElement("a");
  anchor.download = artifact.filename;
  anchor.href = url;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Removes path separators and reserved filename characters.
 *
 * @param title User- or model-authored diagram title.
 * @returns Non-empty filename stem capped at 100 Unicode code points.
 */
export function safeExportBaseName(title: string): string {
  const normalized = title
    .trim()
    .replace(/[\\/:*?"<>|]+/gu, "-")
    .replace(/\s+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
  const codePoints = Array.from(normalized || "diagram");
  return codePoints.slice(0, 100).join("");
}

function assertNever(value: never): never {
  throw new Error(`Unsupported export format: ${String(value)}`);
}
