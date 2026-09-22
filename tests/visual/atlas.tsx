import { DiagramApp } from "../../src/editor/App";
import type { DiagramRpcClient } from "../../src/editor/rpc";
import {
  createDiagramRecordSchema,
  type DiagramRecord,
} from "../../src/core/rpc";
import { createRoot } from "react-dom/client";
import {
  Excalidraw,
  exportToSvg,
  exportToBlob,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import isoInput from "../fixtures/atlas-iso25010.json";
import releaseInput from "../fixtures/atlas-release-evidence.json";
const input =
  new URLSearchParams(location.search).get("case") === "release"
    ? releaseInput
    : isoInput;
import {
  createInitialScene,
  normalizeEditorScene,
} from "../../src/editor/scene";
import {
  createDiagramSpecSchema,
  createSceneSchema,
  DEFAULT_DIAGRAM_VALIDATION_POLICY as policy,
} from "../../src/core/contracts";
import { renderSceneSvg } from "../../src/editor/preview/render-svg";
const schema = createDiagramSpecSchema(policy),
  baseline = schema.parse(input),
  atlas = schema.parse({ ...input, composition: "atlas" });
const scene = createInitialScene(atlas, policy),
  first = JSON.stringify(scene),
  second = JSON.stringify(createInitialScene(atlas, policy));
if (first !== second) throw Error("Atlas scene is not deterministic");
const view = document.getElementById("view")!,
  editor = document.getElementById("editor")!,
  status = document.getElementById("status")!;
status.textContent = `同一输入 · ${input.nodes.length} 节点 / ${input.edges.length} 关系 · 重建一致`;
let api: ExcalidrawImperativeAPI | undefined;
const root = createRoot(editor);
function current() {
  if (!api) return scene;
  const r = normalizeEditorScene(
    api.getSceneElements(),
    api.getAppState(),
    {},
    policy,
  );
  if (!r.ok) throw Error(r.message);
  return r.scene;
}
const appKey = `atlas-app-review:${new URLSearchParams(location.search).get("case") ?? "iso"}`;
const recordSchema = createDiagramRecordSchema(policy);
let record: DiagramRecord = recordSchema.parse(
  localStorage.getItem(appKey)
    ? JSON.parse(localStorage.getItem(appKey)!)
    : {
        id: "31c02c3c-130c-4936-8720-8c2cc9fc1a3c",
        sessionId: "atlas-review",
        sessionFingerprint: { createdAt: 1 },
        title: atlas.title,
        kind: atlas.kind,
        sourceSpec: atlas,
        revision: "93b53465-4b55-4322-a4ab-a46fbe57f498",
        createdAt: 1,
        updatedAt: 1,
      },
);
const client: DiagramRpcClient = {
  validationPolicy: policy,
  list: async () => ({
    ok: true,
    value: {
      diagrams: [
        {
          id: record.id,
          title: record.title,
          kind: record.kind,
          revision: record.revision,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          hasScene: record.scene !== undefined,
        },
      ],
      limits: { autosaveDebounceMs: 300, validationPolicy: policy },
    },
  }),
  get: async () => ({ ok: true, value: { diagram: record } }),
  save: async (_session, _id, expected, scene) => {
    if (expected !== record.revision)
      return {
        ok: false,
        error: { code: "version-conflict", current: record },
      };
    const unchanged = JSON.stringify(record.scene) === JSON.stringify(scene);
    if (!unchanged)
      record = recordSchema.parse({
        ...record,
        scene,
        revision: crypto.randomUUID(),
        updatedAt: Date.now(),
      });
    localStorage.setItem(appKey, JSON.stringify(record));
    return { ok: true, value: { diagram: record, unchanged } };
  },
};
function show(mode: string) {
  if (mode === "app") {
    view.hidden = true;
    editor.hidden = false;
    root.render(<DiagramApp sessionId="atlas-review" client={client} />);
    return;
  }
  view.hidden = mode === "editor";
  editor.hidden = mode !== "editor";
  if (mode === "editor")
    root.render(
      <Excalidraw
        excalidrawAPI={(a) => {
          api = a;
          a.scrollToContent(undefined, { fitToContent: true });
        }}
        initialData={scene as never}
      />,
    );
  else
    view.replaceChildren(
      renderSceneSvg(
        document,
        mode === "baseline" ? createInitialScene(baseline, policy) : scene,
      ),
    );
}
(document.getElementById("mode") as HTMLSelectElement).onchange = (e) =>
  show((e.target as HTMLSelectElement).value);
document.getElementById("save")!.onclick = () => {
  localStorage.setItem("dsh-atlas-review", JSON.stringify(current()));
  status.textContent = "已保存 · 验收页面独立存储";
};
document.getElementById("reload")!.onclick = () => {
  const saved = createSceneSchema(policy).parse(
    JSON.parse(localStorage.getItem("dsh-atlas-review")!),
  );
  api?.updateScene(saved as never);
  status.textContent = "已载入保存画布";
};
function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
document.getElementById("svg")!.onclick = async () => {
  const s = current();
  const svg = await exportToSvg({ ...s, exportPadding: 24 } as never);
  download(new Blob([svg.outerHTML], { type: "image/svg+xml" }), "atlas.svg");
};
document.getElementById("png")!.onclick = async () => {
  const s = current();
  download(
    await exportToBlob({ ...s, exportPadding: 24 } as never),
    "atlas.png",
  );
};
document.getElementById("json")!.onclick = () => {
  const s = current();
  download(
    new Blob(
      [serializeAsJSON(s.elements as never, s.appState as never, {}, "local")],
      { type: "application/json" },
    ),
    "atlas.excalidraw",
  );
};
show("atlas");
