import { createDiagramRpcClient, type DiagramRpcClient } from "../rpc.ts";
import { SURFACE_COLOR, TEXT_COLOR } from "../visual-style.ts";
import { renderSceneSvg, renderSpecSvg } from "./render-svg.ts";

const MESSAGE_FONT = "400 0.8125rem/1.5 ui-sans-serif, sans-serif";

/**
 * Loads one diagram and renders its current content as a static SVG.
 *
 * The chat preview iframe entry: reads identity from the query string, fetches
 * through the plugin's bounded RPC channel (list first, so get parses with the
 * host's validation policy), and renders the saved scene — or the
 * deterministic spec layout while no scene has been saved yet.
 *
 * @param root Container that receives exactly one status or SVG child.
 * @param search `location.search` of the preview page.
 * @param rpc Injectable RPC client for tests.
 */
export async function bootstrapPreview(
  root: HTMLElement,
  search: string,
  rpc: DiagramRpcClient = createDiagramRpcClient(),
): Promise<void> {
  const doc = root.ownerDocument;
  styleRoot(root);
  const params = new URLSearchParams(search);
  const sessionId = params.get("sessionId")?.trim() ?? "";
  const diagramId = params.get("diagramId")?.trim() ?? "";
  if (sessionId === "" || diagramId === "") {
    showMessage(doc, root, "预览参数缺失：需要 sessionId 和 diagramId。");
    return;
  }

  const load = async (): Promise<void> => {
    showMessage(doc, root, "正在加载图表预览…");
    try {
      const listed = await rpc.list(sessionId);
      if (!listed.ok) {
        showMessage(doc, root, "该图表在当前会话中不存在。");
        return;
      }
      const result = await rpc.get(sessionId, diagramId);
      if (!result.ok) {
        showMessage(
          doc,
          root,
          "该图表在当前会话中不存在（可能创建于其他会话或已被移除）。",
        );
        return;
      }
      const diagram = result.value.diagram;
      const svg = diagram.scene === undefined
        ? renderSpecSvg(doc, diagram.sourceSpec)
        : renderSceneSvg(doc, diagram.scene);
      svg.style.display = "block";
      svg.style.width = "100%";
      svg.style.height = "100%";
      root.replaceChildren(svg);
    } catch (error) {
      showFailure(doc, root, error, load);
    }
  };
  await load();
}

function styleRoot(root: HTMLElement): void {
  root.style.width = "100%";
  root.style.height = "100%";
  root.style.margin = "0";
  root.style.background = SURFACE_COLOR;
  root.style.color = TEXT_COLOR;
}

function showMessage(doc: Document, root: HTMLElement, text: string): void {
  const message = doc.createElement("p");
  message.setAttribute("role", "status");
  message.textContent = text;
  message.style.margin = "0";
  message.style.display = "grid";
  message.style.placeItems = "center";
  message.style.height = "100%";
  message.style.font = MESSAGE_FONT;
  root.replaceChildren(message);
}

function showFailure(
  doc: Document,
  root: HTMLElement,
  error: unknown,
  retry: () => Promise<void>,
): void {
  const container = doc.createElement("div");
  container.setAttribute("role", "alert");
  container.style.display = "grid";
  container.style.placeItems = "center";
  container.style.alignContent = "center";
  container.style.gap = "8px";
  container.style.height = "100%";
  container.style.font = MESSAGE_FONT;

  const message = doc.createElement("p");
  message.textContent = `图表预览加载失败：${
    error instanceof Error ? error.message : String(error)
  }`;
  message.style.margin = "0";

  const button = doc.createElement("button");
  button.type = "button";
  button.textContent = "重试";
  button.addEventListener("click", () => {
    void retry();
  });

  container.append(message, button);
  root.replaceChildren(container);
}
