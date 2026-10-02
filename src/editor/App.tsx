import { atlasViewElements } from "./atlas.ts";
import { hasNotes, noteViewElements } from "./notes.ts";
import { Excalidraw, getCommonBounds } from "@excalidraw/excalidraw";
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
import {
  clearCanvasDeepLink,
  readCanvasDeepLink,
} from "../core/canvas-link.ts";
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
import {
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  activateLocale,
  resolveLocale,
  t,
  type Locale,
} from "../core/i18n.ts";
import css from "./App.module.css";
import { fitContentViewport } from "./viewport.ts";

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
    message: t("editor.loading.session"),
  });
  const [locale, setLocale] = useState<Locale>(() => resolveLocale());
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const autosaveRef = useRef<SceneAutosaveController | null>(null);
  const selectionEpochRef = useRef(0);
  const pendingDraftRef = useRef<PendingDiagramDraft | null>(null);
  const pendingViewportFitRef = useRef(false);
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
      message: t("editor.loading.session"),
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
        // One-shot jump target from the chat preview card. An unsaved pending
        // draft still wins: restoring user edits outranks navigation intent.
        const deepLink = readCanvasDeepLink(draftStorage, sessionId);
        clearCanvasDeepLink(draftStorage);
        const requestedId = result.value.diagrams.some(
          (diagram) => diagram.id === deepLink?.diagramId,
        )
          ? (deepLink?.diagramId ?? null)
          : null;
        setSelectedId((current) =>
          pendingDiagramId !== null
            ? pendingDiagramId
            : requestedId !== null
            ? requestedId
            : result.value.diagrams.some((diagram) => diagram.id === current)
            ? current
            : (result.value.diagrams[0]?.id ?? null),
        );
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted) {
          setLoadState({
            kind: "error",
            message: t("editor.list.failed", { error: errorMessage(error) }),
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
    setLoadState({ kind: "loading", message: t("editor.loading.canvas") });

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
        pendingViewportFitRef.current = true;
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
            message: t("editor.load.diagram.failed", { error: errorMessage(error) }),
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
      scrollToContent: false,
    } as unknown as ExcalidrawInitialDataState;
  }, [scene, sceneEpoch]);

  const hasSupportingNotes = record !== null && hasNotes(record.sourceSpec);
  const fitViewport = useCallback(
    (elements: readonly OrderedExcalidrawElement[], pendingOnly = true, mode: "fit" | "read" = "fit") => {
      const api = apiRef.current;
      if (
        (pendingOnly && !pendingViewportFitRef.current) ||
        api === null ||
        elements.length === 0
      ) {
        return;
      }
      const fitting = pendingOnly && record?.sourceSpec.composition === "atlas"
        ? atlasViewElements(elements, "overview")
        : pendingOnly && hasSupportingNotes ? noteViewElements(elements, "main") : elements;
      const bounds = getCommonBounds(fitting);
      let view = fitContentViewport(bounds, api.getAppState(), mode);
      if (view === null) return;
      if (pendingOnly && record?.sourceSpec.composition !== "atlas" && view.zoom < 0.7) {
        view = fitContentViewport(bounds, api.getAppState(), "read");
        if (view === null) return;
      }
      pendingViewportFitRef.current = false;
      api.updateScene({ appState: {
        scrollX: view.scrollX,
        scrollY: view.scrollY,
        zoom: { value: view.zoom as AppState["zoom"]["value"] },
      } });
    },
    [record?.sourceSpec.composition, hasSupportingNotes],
  );

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
      fitViewport(elements);
      autosaveRef.current?.accept(normalized.scene);
    },
    [fitViewport, limits.validationPolicy],
  );

  const onEditorReady = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
    fitViewport(api.getSceneElements());
    setEditorReady(true);
  }, [fitViewport]);

  useEffect(() => {
    const onFullscreen = () => {
      setFullscreen(document.fullscreenElement !== null);
      // The next editor size notification fits the new available space.
      pendingViewportFitRef.current = true;
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement !== null) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setCanvasError(t("editor.fullscreen.denied"));
    }
  };

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
        setCanvasError(t("editor.export.failed", {
          format,
          error: errorMessage(error),
        }));
      } finally {
        setExporting(null);
      }
    },
    [limits.validationPolicy, record],
  );

  const reloadServerVersion = useCallback(async () => {
    if (record === null) return;
    setLoadState({ kind: "loading", message: t("editor.loading.reload") });
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
      pendingViewportFitRef.current = true;
      setRecord(nextRecord);
      setScene(nextScene);
      setSceneEpoch((value) => value + 1);
      setCanvasError(null);
      setLoadState({ kind: "ready" });
    } catch (error) {
      setLoadState({
        kind: "error",
        message: t("editor.reload.failed", { error: errorMessage(error) }),
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

  const changeLocale = useCallback((next: Locale) => {
    activateLocale(next);
    document.title = t("page.title.editor");
    document.documentElement.lang =
      next === "ptBR" ? "pt-BR" : next === "zh" ? "zh-CN" : "en";
    // Force a re-render so every `t()` in this tree reads the new table.
    setLocale(next);
  }, []);

  if (loadState.kind === "loading") {
    return <EditorMessage busy message={loadState.message} />;
  }
  if (loadState.kind === "error") {
    return (
      <EditorMessage
        action={() => setRetryKey((value) => value + 1)}
        actionLabel={t("editor.retry")}
        message={loadState.message}
      />
    );
  }
  if (loadState.kind === "empty") {
    return (
      <EditorMessage message={t("editor.empty")} />
    );
  }
  if (record === null || scene === null || initialData === null) {
    return <EditorMessage message={t("editor.incomplete")} />;
  }

  const statusText = autosaveStatusText(saveStatus);
  const exportDisabled = !editorReady || exporting !== null;
  return (
    <main className={css.app}>
      <header className={css.toolbar}>
        <div className={css.titleBlock}>
          <h1>{record.title}</h1>
          <p aria-live="polite" className={css.saveStatus} role="status"
            title={saveStatus?.kind === "saved" ? t("editor.title.version", { revision: saveStatus.revision }) : undefined}>
            {statusText}
          </p>
        </div>
        <label className={css.mobileSelectLabel}>
          <span>diagram</span>
          <select
            aria-label={t("editor.select.diagram")}
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
        <div aria-label={t("editor.export.group")} className={css.exportActions} role="group">
          <button disabled={!editorReady} onClick={() => {
            const api = apiRef.current;
            if (api !== null) fitViewport(api.getSceneElements(), false);
          }} type="button">{t("editor.fit")}</button>
          {record.sourceSpec.composition !== "atlas" && <button disabled={!editorReady} type="button"
            title={t("editor.read.main.title")}
            onClick={() => {
              const api = apiRef.current;
              if (api !== null) fitViewport(noteViewElements(api.getSceneElements(), "main"), false, "read");
            }}>{t("editor.read.main")}</button>}
          {hasNotes(record.sourceSpec) && (["main", "notes"] as const).map(view => (
            <button key={view} disabled={!editorReady} type="button" onClick={() => {
              const api = apiRef.current;
              if (api !== null) fitViewport(noteViewElements(api.getSceneElements(), view), false, view === "notes" ? "read" : "fit");
            }}>{view === "main" ? t("editor.view.main") : t("editor.view.notes")}</button>
          ))}
          {record.sourceSpec.composition === "atlas" && (["overview", "detail"] as const).map(view => (
            <button key={view} disabled={!editorReady} type="button" onClick={() => {
              const api = apiRef.current;
              if (api !== null) fitViewport(atlasViewElements(api.getSceneElements(), view), false, view === "detail" ? "read" : "fit");
            }}>{view === "overview" ? t("editor.view.overview") : t("editor.view.detail")}</button>
          ))}
          <button aria-pressed={fullscreen} onClick={() => void toggleFullscreen()} type="button">
            {fullscreen ? t("editor.fullscreen.exit") : t("editor.fullscreen.enter")}
          </button>
          {(["excalidraw", "svg", "png"] as const).map((format) => (
            <button
              disabled={exportDisabled}
              key={format}
              onClick={() => void exportCurrent(format)}
              type="button"
            >
              {exporting === format ? t("editor.exporting") : formatLabel(format)}
            </button>
          ))}
        </div>
        <select
          aria-label={t("editor.select.language")}
          className={css.localeSelect}
          onChange={(event) => changeLocale(event.target.value as Locale)}
          value={locale}
        >
          {SUPPORTED_LOCALES.map((code) => (
            <option key={code} value={code}>
              {LOCALE_LABELS[code]}
            </option>
          ))}
        </select>
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
                {t("editor.retry.save")}
              </button>
            )}
          </div>
        )}

        {saveStatus?.kind === "conflict" && (
          <div className={css.conflictBar} role="alert">
            <span>
              {t("editor.conflict", { revision: saveStatus.currentRevision })}
            </span>
            <button
              onClick={() => void exportCurrent("excalidraw", "-local-draft")}
              type="button"
            >
              {t("editor.conflict.export.local")}
            </button>
            <button onClick={() => void reloadServerVersion()} type="button">
              {t("editor.conflict.reload")}
            </button>
          </div>
        )}
      </div>

      <div className={css.body} data-sidebar-collapsed={sidebarCollapsed}>
        <nav
          aria-label={t("editor.sidebar.diagrams")}
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
                sidebarCollapsed
                  ? t("editor.sidebar.expand")
                  : t("editor.sidebar.collapse")
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
        <section aria-label={t("editor.canvas.editable.aria", { title: record.title })} className={css.canvas}>
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
            langCode={locale === "zh" ? "zh-CN" : locale === "ptBR" ? "pt-PT" : "en"}
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
          message: t("editor.save.rejected", {
            issues: result.error.issues.map((issue) => issue.message).join("; "),
          }),
        };
      case "storage-capacity":
        return {
          kind: "failed",
          message: t("editor.save.capacity"),
        };
      case "diagram-not-found":
        return { kind: "failed", message: t("editor.save.notfound") };
      case "session-not-found":
        return { kind: "failed", message: t("editor.save.session.ended") };
      default:
        return assertNever(result.error);
    }
  } catch (error) {
    return {
      kind: "failed",
      message: t("editor.autosave.failed", { error: errorMessage(error) }),
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
    return t("paste.image.file");
  }
  if (data.mixedContent?.some((item) => item.type === "imageUrl") === true) {
    return t("paste.image.link");
  }
  if (
    data.elements?.some(
      (element) =>
        !EDITABLE_TYPES.has(element.type) ||
        (element.link !== null && element.link !== undefined),
    ) === true
  ) {
    return t("paste.mixed");
  }
  return null;
}

function autosaveStatusText(status: AutosaveStatus | null): string {
  if (status === null) return t("status.ready");
  switch (status.kind) {
    case "saved":
      return t("status.saved");
    case "dirty":
      return t("status.dirty");
    case "saving":
      return t("status.saving");
    case "conflict":
      return t("status.conflict");
    case "invalid":
      return t("status.invalid");
    case "error":
      return t("status.error");
    default:
      return assertNever(status);
  }
}

function rpcErrorMessage(error: DiagramRpcError): string {
  switch (error.code) {
    case "session-not-found":
      return t("editor.save.session.ended");
    case "diagram-not-found":
      return t("editor.save.notfound");
    case "version-conflict":
      return t("error.version.conflict");
    case "invalid-scene":
      return t("editor.save.rejected", {
        issues: error.issues.map((issue) => issue.message).join("; "),
      });
    case "storage-capacity":
      return t("editor.save.capacity");
    default:
      return assertNever(error);
  }
}

function diagramKindLabel(kind: DiagramSummary["kind"]): string {
  switch (kind) {
    case "flow":
      return t("kind.flow");
    case "architecture":
      return t("kind.architecture");
    case "report":
      return t("kind.report");
    case "timeline":
      return t("kind.timeline");
    case "hierarchy":
      return t("kind.hierarchy");
    case "comparison":
      return t("kind.comparison");
    case "relationship":
      return t("kind.relationship");
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
