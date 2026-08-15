import { Excalidraw } from "@excalidraw/excalidraw";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import type { ClipboardData } from "@excalidraw/excalidraw/clipboard";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  DEFAULT_DIAGRAM_VALIDATION_POLICY,
  EDITABLE_SCENE_ELEMENT_TYPES,
  type PersistedScene,
} from "../core/contracts.ts";
import type {
  DiagramClientLimits,
  DiagramRecord,
  DiagramRpcError,
  DiagramSummary,
} from "../core/rpc.ts";
import {
  SceneAutosaveController,
  serializeSceneContent,
  type AutosaveStatus,
  type SaveAttempt,
} from "./autosave.ts";
import {
  createDiagramExport,
  downloadDiagramExport,
  type DiagramExportFormat,
} from "./export.ts";
import {
  createDiagramRpcClient,
  type DiagramRpcClient,
} from "./rpc.ts";
import {
  createInitialScene,
  normalizeEditorScene,
} from "./scene.ts";
import {
  clearPendingDiagramDraft,
  readPendingDiagramDraft,
  resolvePendingDraftStorage,
  writePendingDiagramDraft,
  type PendingDiagramDraft,
} from "./pendingDraft.ts";
import css from "./App.module.css";

const DEFAULT_LIMITS: DiagramClientLimits = {
  autosaveDebounceMs: 800,
  validationPolicy: { ...DEFAULT_DIAGRAM_VALIDATION_POLICY },
};
const EDITABLE_TYPES = new Set<string>(EDITABLE_SCENE_ELEMENT_TYPES);

/** Inputs for the standalone iframe editor. */
export interface DiagramAppProps {
  sessionId: string;
  client?: DiagramRpcClient;
  draftStorage?: Storage | null;
}

type LoadState =
  | { kind: "loading"; message: string }
  | { kind: "ready" }
  | { kind: "empty" }
  | { kind: "error"; message: string };

/** Session-scoped diagram list, Excalidraw editor, save state, and exports. */
export function DiagramApp({
  sessionId,
  client,
  draftStorage: suppliedDraftStorage,
}: DiagramAppProps) {
  const rpc = useMemo(() => client ?? createDiagramRpcClient(), [client]);
  const draftStorage = useMemo(
    () =>
      suppliedDraftStorage === undefined
        ? resolvePendingDraftStorage()
        : suppliedDraftStorage,
    [suppliedDraftStorage],
  );
  const [loadState, setLoadState] = useState<LoadState>({
    kind: "loading",
    message: "正在读取当前会话的 diagram…",
  });
  const [retryKey, setRetryKey] = useState(0);
  const [diagrams, setDiagrams] = useState<DiagramSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [record, setRecord] = useState<DiagramRecord | null>(null);
  const [scene, setScene] = useState<PersistedScene | null>(null);
  const [sceneEpoch, setSceneEpoch] = useState(0);
  const [limits, setLimits] = useState<DiagramClientLimits>(DEFAULT_LIMITS);
  const [saveStatus, setSaveStatus] = useState<AutosaveStatus | null>(null);
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<DiagramExportFormat | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const autosaveRef = useRef<SceneAutosaveController | null>(null);
  const selectionEpochRef = useRef(0);
  const pendingDraftRef = useRef<PendingDiagramDraft | null>(null);
  const persistPendingDraft = useCallback(
    (diagramId: string, controller: SceneAutosaveController) => {
      const draft = controller.localDraft;
      if (draft === null) return;
      const pendingDraft: PendingDiagramDraft = {
        version: 1,
        sessionId,
        diagramId,
        expectedRevision: controller.revision,
        scene: draft,
      };
      pendingDraftRef.current = pendingDraft;
      writePendingDiagramDraft(draftStorage, pendingDraft);
    },
    [draftStorage, sessionId],
  );

  useEffect(() => {
    const abort = new AbortController();
    setLoadState({
      kind: "loading",
      message: "正在读取当前会话的 diagram…",
    });
    void rpc
      .list(sessionId, abort.signal)
      .then((result) => {
        if (abort.signal.aborted) return;
        if (!result.ok) {
          setLoadState({ kind: "error", message: rpcErrorMessage(result.error) });
          return;
        }
        setLimits(result.value.limits);
        setDiagrams(result.value.diagrams);
        const pendingDraft = readPendingDiagramDraft(
          draftStorage,
          sessionId,
          result.value.limits.validationPolicy,
        );
        pendingDraftRef.current = pendingDraft;
        if (result.value.diagrams.length === 0) {
          setSelectedId(null);
          setRecord(null);
          setScene(null);
          setLoadState({ kind: "empty" });
          return;
        }
        const pendingDiagramId = result.value.diagrams.some(
          (diagram) => diagram.id === pendingDraft?.diagramId,
        )
          ? (pendingDraft?.diagramId ?? null)
          : null;
        setSelectedId((current) =>
          pendingDiagramId !== null
            ? pendingDiagramId
            : result.value.diagrams.some((diagram) => diagram.id === current)
            ? current
            : (result.value.diagrams[0]?.id ?? null),
        );
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted) {
          setLoadState({
            kind: "error",
            message: `读取 diagram 列表失败：${errorMessage(error)}。`,
          });
        }
      });
    return () => abort.abort();
  }, [draftStorage, retryKey, rpc, sessionId]);

  useEffect(() => {
    if (selectedId === null) return;
    const abort = new AbortController();
    const selectionEpoch = selectionEpochRef.current + 1;
    selectionEpochRef.current = selectionEpoch;
    const ownsSelection = () =>
      !abort.signal.aborted && selectionEpochRef.current === selectionEpoch;
    void autosaveRef.current?.dispose();
    autosaveRef.current = null;
    apiRef.current = null;
    setEditorReady(false);
    setCanvasError(null);
    setSaveStatus(null);
    setLoadState({ kind: "loading", message: "正在载入可编辑画布…" });

    void rpc
      .get(sessionId, selectedId, abort.signal)
      .then((result) => {
        if (!ownsSelection()) return;
        if (!result.ok) {
          setLoadState({ kind: "error", message: rpcErrorMessage(result.error) });
          return;
        }
        const nextRecord = result.value.diagram;
        const storedDraft =
          pendingDraftRef.current?.diagramId === nextRecord.id
            ? pendingDraftRef.current
            : null;
        const draftAlreadyPersisted =
          storedDraft !== null &&
          nextRecord.scene !== undefined &&
          serializeSceneContent(storedDraft.scene) ===
            serializeSceneContent(nextRecord.scene);
        if (draftAlreadyPersisted) {
          clearPendingDiagramDraft(draftStorage, {
            sessionId,
            diagramId: nextRecord.id,
          });
          pendingDraftRef.current = null;
        }
        const restoredDraft = draftAlreadyPersisted ? null : storedDraft;
        const nextScene =
          restoredDraft?.scene ??
          nextRecord.scene ??
          createInitialScene(nextRecord.sourceSpec, limits.validationPolicy);
        const controller = new SceneAutosaveController({
          debounceMs: limits.autosaveDebounceMs,
          initialRevision:
            restoredDraft?.expectedRevision ?? nextRecord.revision,
          initialScene: nextRecord.scene ?? null,
          save: async (draft, expectedRevision) => {
            const attempt = await saveScene(
              rpc,
              sessionId,
              nextRecord.id,
              draft,
              expectedRevision,
              setDiagrams,
              draftStorage,
            );
            const pendingDraft = pendingDraftRef.current;
            if (
              attempt.kind === "saved" &&
              pendingDraft?.diagramId === nextRecord.id &&
              pendingDraft.expectedRevision === expectedRevision &&
              serializeSceneContent(pendingDraft.scene) ===
                serializeSceneContent(draft)
            ) {
              pendingDraftRef.current = null;
            }
            return attempt;
          },
          onStatus: (status) => {
            if (ownsSelection()) setSaveStatus(status);
          },
        });
        if (!ownsSelection()) {
          void controller.dispose();
          return;
        }
        autosaveRef.current = controller;
        setRecord(nextRecord);
        setScene(nextScene);
        setSceneEpoch((value) => value + 1);
        if (restoredDraft !== null) {
          controller.accept(restoredDraft.scene);
          controller.retry();
        }
        setSaveStatus(controller.status);
        setLoadState({ kind: "ready" });
      })
      .catch((error: unknown) => {
        if (ownsSelection()) {
          setLoadState({
            kind: "error",
            message: `载入 diagram 失败：${errorMessage(error)}。`,
          });
        }
      });
    return () => {
      abort.abort();
      void autosaveRef.current?.dispose();
      autosaveRef.current = null;
    };
  }, [draftStorage, limits, rpc, selectedId, sessionId]);

  useEffect(() => {
    if (record === null) return;
    const handlePageHide = () => {
      const controller = autosaveRef.current;
      if (controller !== null) persistPendingDraft(record.id, controller);
    };
    globalThis.addEventListener("pagehide", handlePageHide);
    return () => globalThis.removeEventListener("pagehide", handlePageHide);
  }, [persistPendingDraft, record]);

  useEffect(
    () => () => {
      void autosaveRef.current?.dispose();
    },
    [],
  );

  const initialData = useMemo<ExcalidrawInitialDataState | null>(() => {
    if (scene === null) return null;
    return {
      elements:
        scene.elements as unknown as ExcalidrawInitialDataState["elements"],
      appState:
        scene.appState as unknown as ExcalidrawInitialDataState["appState"],
      files: scene.files as BinaryFiles,
      scrollToContent: true,
    } as unknown as ExcalidrawInitialDataState;
  }, [scene, sceneEpoch]);

  const onCanvasChange = useCallback(
    (
      elements: readonly OrderedExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles,
    ) => {
      const normalized = normalizeEditorScene(
        elements,
        appState,
        files,
        limits.validationPolicy,
      );
      if (!normalized.ok) {
        setCanvasError(normalized.message);
        autosaveRef.current?.reject(normalized.message);
        return;
      }
      setCanvasError(null);
      autosaveRef.current?.accept(normalized.scene);
    },
    [limits.validationPolicy],
  );

  const onEditorReady = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
    setEditorReady(true);
  }, []);

  const exportCurrent = useCallback(
    async (format: DiagramExportFormat, titleSuffix = "") => {
      const api = apiRef.current;
      if (api === null || record === null) return;
      const normalized = normalizeEditorScene(
        api.getSceneElements(),
        api.getAppState(),
        api.getFiles(),
        limits.validationPolicy,
      );
      if (!normalized.ok) {
        setCanvasError(normalized.message);
        return;
      }
      setExporting(format);
      try {
        downloadDiagramExport(
          await createDiagramExport(
            format,
            `${record.title}${titleSuffix}`,
            normalized.scene,
          ),
        );
      } catch (error) {
        setCanvasError(`导出 ${format} 失败：${errorMessage(error)}。请重试。`);
      } finally {
        setExporting(null);
      }
    },
    [limits.validationPolicy, record],
  );

  const reloadServerVersion = useCallback(async () => {
    if (record === null) return;
    setLoadState({ kind: "loading", message: "正在重新载入服务器版本…" });
    try {
      const result = await rpc.get(sessionId, record.id);
      if (!result.ok) {
        setLoadState({ kind: "error", message: rpcErrorMessage(result.error) });
        return;
      }
      const nextRecord = result.value.diagram;
      const nextScene =
        nextRecord.scene ??
        createInitialScene(nextRecord.sourceSpec, limits.validationPolicy);
      autosaveRef.current?.reset(nextRecord.scene ?? null, nextRecord.revision);
      clearPendingDiagramDraft(draftStorage, {
        sessionId,
        diagramId: nextRecord.id,
      });
      pendingDraftRef.current = null;
      setRecord(nextRecord);
      setScene(nextScene);
      setSceneEpoch((value) => value + 1);
      setCanvasError(null);
      setLoadState({ kind: "ready" });
    } catch (error) {
      setLoadState({
        kind: "error",
        message: `重新载入失败：${errorMessage(error)}。`,
      });
    }
  }, [draftStorage, limits.validationPolicy, record, rpc, sessionId]);

  const selectDiagram = useCallback(
    async (id: string) => {
      if (id === selectedId) return;
      const controller = autosaveRef.current;
      if (controller !== null && record !== null) {
        persistPendingDraft(record.id, controller);
        await controller.dispose();
      }
      setSelectedId(id);
    },
    [persistPendingDraft, record, selectedId],
  );

  if (loadState.kind === "loading") {
    return <EditorMessage busy message={loadState.message} />;
  }
  if (loadState.kind === "error") {
    return (
      <EditorMessage
        action={() => setRetryKey((value) => value + 1)}
        actionLabel="重试"
        message={loadState.message}
      />
    );
  }
  if (loadState.kind === "empty") {
    return (
      <EditorMessage message="当前会话还没有 diagram。回到对话，让 Agent 使用 diagram_create 为文章生成一张主图，然后重新打开“画布”。" />
    );
  }
  if (record === null || scene === null || initialData === null) {
    return <EditorMessage message="diagram 数据不完整。请重新载入。" />;
  }

  const statusText = autosaveStatusText(saveStatus);
  const exportDisabled = !editorReady || exporting !== null;
  return (
    <main className={css.app}>
      <header className={css.toolbar}>
        <div className={css.titleBlock}>
          <h1>{record.title}</h1>
          <p aria-live="polite" className={css.saveStatus} role="status">
            {statusText}
          </p>
        </div>
        <label className={css.mobileSelectLabel}>
          <span>diagram</span>
          <select
            aria-label="选择 diagram"
            onChange={(event) => void selectDiagram(event.target.value)}
            value={record.id}
          >
            {diagrams.map((diagram) => (
              <option key={diagram.id} value={diagram.id}>
                {diagram.title}
              </option>
            ))}
          </select>
        </label>
        <div aria-label="导出当前 diagram" className={css.exportActions} role="group">
          {(["excalidraw", "svg", "png"] as const).map((format) => (
            <button
              disabled={exportDisabled}
              key={format}
              onClick={() => void exportCurrent(format)}
              type="button"
            >
              {exporting === format ? "导出中…" : formatLabel(format)}
            </button>
          ))}
        </div>
      </header>

      <div className={css.notices}>
        {(canvasError !== null || saveStatus?.kind === "error") && (
          <div className={css.errorBar} role="alert">
            <span>
              {canvasError ??
                (saveStatus?.kind === "error" ? saveStatus.message : "")}
            </span>
            {canvasError === null && saveStatus?.kind === "error" && (
              <button onClick={() => autosaveRef.current?.retry()} type="button">
                重试保存
              </button>
            )}
          </div>
        )}

        {saveStatus?.kind === "conflict" && (
          <div className={css.conflictBar} role="alert">
            <span>
              版本冲突：服务器已更新到 {saveStatus.currentRevision}。本地稿仍保留在当前页面。
            </span>
            <button
              onClick={() => void exportCurrent("excalidraw", "-本地稿")}
              type="button"
            >
              导出本地稿
            </button>
            <button onClick={() => void reloadServerVersion()} type="button">
              重新载入服务器版本（放弃本地稿）
            </button>
          </div>
        )}
      </div>

      <div className={css.body} data-sidebar-collapsed={sidebarCollapsed}>
        <nav
          aria-label="当前会话的 diagram"
          className={css.sidebar}
          data-collapsed={sidebarCollapsed}
        >
          <div className={css.sidebarHeader}>
            {!sidebarCollapsed && (
              <div className={css.sidebarHeading}>DIAGRAMS</div>
            )}
            <button
              aria-controls="diagram-list"
              aria-expanded={!sidebarCollapsed}
              aria-label={
                sidebarCollapsed ? "展开 diagram 列表" : "收起 diagram 列表"
              }
              className={css.sidebarToggle}
              onClick={() => setSidebarCollapsed((current) => !current)}
              type="button"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path
                  d={sidebarCollapsed ? "M9 18l6-6-6-6" : "M15 18l-6-6 6-6"}
                />
              </svg>
            </button>
          </div>
          <div
            className={css.diagramList}
            hidden={sidebarCollapsed}
            id="diagram-list"
          >
            {diagrams.map((diagram) => (
              <button
                aria-current={diagram.id === record.id ? "page" : undefined}
                className={css.diagramButton}
                key={diagram.id}
                onClick={() => void selectDiagram(diagram.id)}
                type="button"
              >
                <span>{diagram.title}</span>
                <small>{diagramKindLabel(diagram.kind)}</small>
              </button>
            ))}
          </div>
        </nav>
        <section aria-label={`${record.title} 可编辑画布`} className={css.canvas}>
          <Excalidraw
            UIOptions={{
              canvasActions: {
                export: false,
                loadScene: false,
                saveAsImage: false,
                saveToActiveFile: false,
              },
              tools: { image: false },
            }}
            autoFocus
            excalidrawAPI={onEditorReady}
            initialData={initialData}
            key={`${record.id}:${sceneEpoch}`}
            langCode="zh-CN"
            onChange={onCanvasChange}
            onLinkOpen={(_element, event) => event.preventDefault()}
            onPaste={(data) => {
              const message = forbiddenPasteMessage(data);
              if (message === null) return true;
              setCanvasError(message);
              autosaveRef.current?.reject(message);
              return false;
            }}
            validateEmbeddable={false}
          />
        </section>
      </div>
    </main>
  );
}

interface EditorMessageProps {
  message: string;
  busy?: boolean;
  action?: () => void;
  actionLabel?: string;
}

function EditorMessage({ message, busy = false, action, actionLabel }: EditorMessageProps) {
  return (
    <main aria-busy={busy} className={css.messagePage}>
      <section>
        <div aria-hidden="true" className={css.messageMark} />
        <p role={busy ? "status" : "alert"}>{message}</p>
        {action !== undefined && actionLabel !== undefined && (
          <button onClick={action} type="button">
            {actionLabel}
          </button>
        )}
      </section>
    </main>
  );
}

async function saveScene(
  rpc: DiagramRpcClient,
  sessionId: string,
  id: string,
  scene: PersistedScene,
  expectedRevision: string,
  setDiagrams: React.Dispatch<React.SetStateAction<DiagramSummary[]>>,
  draftStorage: Storage | null,
): Promise<SaveAttempt> {
  try {
    const result = await rpc.save(
      sessionId,
      id,
      expectedRevision,
      scene,
    );
    if (result.ok) {
      clearPendingDiagramDraft(draftStorage, {
        sessionId,
        diagramId: id,
        expectedRevision,
        scene,
      });
      setDiagrams((current) =>
        current.map((diagram) =>
          diagram.id === result.value.diagram.id
            ? summaryFromRecord(result.value.diagram)
            : diagram,
        ),
      );
      return { kind: "saved", revision: result.value.diagram.revision };
    }
    switch (result.error.code) {
      case "version-conflict":
        return {
          kind: "conflict",
          currentRevision: result.error.current.revision,
        };
      case "invalid-scene":
        return {
          kind: "rejected",
          message: `服务器拒绝画布：${result.error.issues.map((issue) => issue.message).join("；")}。修正后重试。`,
        };
      case "storage-capacity":
        return {
          kind: "failed",
          message: "存储容量已满，先导出本地副本。清理空间后重试保存。",
        };
      case "diagram-not-found":
        return { kind: "failed", message: "diagram 已不存在。重新打开画布列表。" };
      case "session-not-found":
        return { kind: "failed", message: "当前 Session 已结束或被替换。重新打开会话。" };
      default:
        return assertNever(result.error);
    }
  } catch (error) {
    return {
      kind: "failed",
      message: `自动保存失败：${errorMessage(error)}。请重试。`,
    };
  }
}

function summaryFromRecord(record: DiagramRecord): DiagramSummary {
  return {
    id: record.id,
    title: record.title,
    kind: record.kind,
    revision: record.revision,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    hasScene: record.scene !== undefined,
  };
}

function forbiddenPasteMessage(data: ClipboardData): string | null {
  if (data.files !== undefined && Object.keys(data.files).length > 0) {
    return "不能粘贴图片文件。请改用矩形、文字、线条或箭头。";
  }
  if (data.mixedContent?.some((item) => item.type === "imageUrl") === true) {
    return "不能粘贴外部图片链接。请改用文字或可编辑图形。";
  }
  if (
    data.elements?.some(
      (element) =>
        !EDITABLE_TYPES.has(element.type) ||
        (element.link !== null && element.link !== undefined),
    ) === true
  ) {
    return "粘贴内容包含图片、嵌入对象或链接。移除这些内容后再粘贴。";
  }
  return null;
}

function autosaveStatusText(status: AutosaveStatus | null): string {
  if (status === null) return "准备保存";
  switch (status.kind) {
    case "saved":
      return `已保存 · ${status.revision}`;
    case "dirty":
      return "有未保存修改";
    case "saving":
      return "保存中…";
    case "conflict":
      return "版本冲突 · 本地稿未覆盖";
    case "invalid":
      return "当前修改不符合保存规则";
    case "error":
      return "保存失败 · 本地稿仍保留";
    default:
      return assertNever(status);
  }
}

function rpcErrorMessage(error: DiagramRpcError): string {
  switch (error.code) {
    case "session-not-found":
      return "当前 Session 已结束或被替换。回到 DSH 重新打开会话。";
    case "diagram-not-found":
      return "所选 diagram 已不存在。重新载入画布列表。";
    case "version-conflict":
      return "服务器已有更新版本。重新载入后继续编辑。";
    case "invalid-scene":
      return `服务器拒绝画布：${error.issues.map((issue) => issue.message).join("；")}。`;
    case "storage-capacity":
      return "存储容量已满，先导出本地副本。清理空间后重试。";
    default:
      return assertNever(error);
  }
}

function diagramKindLabel(kind: DiagramSummary["kind"]): string {
  switch (kind) {
    case "flow":
      return "流程";
    case "architecture":
      return "架构";
    case "timeline":
      return "时间线";
    case "hierarchy":
      return "层级";
    case "comparison":
      return "对比";
    case "relationship":
      return "关系";
    default:
      return assertNever(kind);
  }
}

function formatLabel(format: DiagramExportFormat): string {
  switch (format) {
    case "excalidraw":
      return ".excalidraw";
    case "svg":
      return "SVG";
    case "png":
      return "PNG";
    default:
      return assertNever(format);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertNever(value: never): never {
  throw new Error(`Unsupported diagram value: ${JSON.stringify(value)}`);
}
