import { sessionSchema } from "@shared/session-format";
import { usePreferences } from "../state/preferences";
import { patchDoc, toast, useApp } from "../state/store";
import { openPaths } from "./actions";
import { onViewPosition, rememberViewPosition, viewPosition } from "./workspace-view";

let queue = Promise.resolve();
let started = false;
export function flushSession(): Promise<void> {
  if (!started || !usePreferences.getState().value.restoreSession) return queue;
  const state = useApp.getState();
  const session = sessionSchema.parse({
    version: 1,
    activePath: state.docs.find((doc) => doc.id === state.activeId)?.path ?? null,
    tabs: state.docs
      .filter((doc) => doc.path)
      .slice(0, 100)
      .map((doc) => ({
        path: doc.path,
        page: doc.currentPage,
        zoom: doc.zoom,
        fit: doc.fit,
        reading: !!doc.reading,
        layout: doc.pageLayout ?? "continuous",
        offset: viewPosition(doc.id)?.offset ?? 0,
        left: viewPosition(doc.id)?.left ?? 0,
      })),
  });
  const next = queue.then(() => window.api.session.save(session));
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}
export async function restoreSession(): Promise<void> {
  if (!usePreferences.getState().value.restoreSession) return;
  try {
    const result = await window.api.session.load();
    const session = sessionSchema.parse(result.session);
    if (result.unavailable)
      toast(
        `${result.unavailable} arquivo(s) da sessão anterior foram movidos ou estão indisponíveis. Os demais serão reabertos.`,
        { tone: "error", ms: 8000 },
      );
    await openPaths(session.tabs.map((tab) => tab.path));
    for (const tab of session.tabs) {
      const doc = useApp
        .getState()
        .docs.find((item) => item.path?.toLowerCase() === tab.path.toLowerCase());
      if (!doc) continue;
      const page = Math.min(tab.page, doc.content.pages.length - 1);
      rememberViewPosition(doc.id, {
        page: doc.content.pages[page].id,
        offset: tab.offset,
        left: tab.left,
      });
      patchDoc(doc.id, {
        currentPage: page,
        zoom: tab.zoom,
        fit: tab.fit,
        reading: doc.readOnly || tab.reading,
        pageLayout: tab.layout,
      });
    }
    const active = useApp.getState().docs.find((doc) => doc.path === session.activePath);
    if (active) useApp.setState({ activeId: active.id });
  } catch (failure) {
    toast(
      failure instanceof Error ? failure.message : "A sessão anterior não pôde ser restaurada.",
      { tone: "error", ms: 8000 },
    );
  }
}
export function startSessionAutosave(): () => void {
  started = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let warned = false;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      void flushSession().catch((failure) => {
        if (!warned) {
          warned = true;
          toast(`Sessão não salva: ${failure instanceof Error ? failure.message : "falha local"}`, {
            tone: "error",
          });
        }
      });
    }, 500);
  };
  const off = useApp.subscribe((state, previous) => {
    if (state.docs !== previous.docs || state.activeId !== previous.activeId) schedule();
  });
  const offView = onViewPosition(schedule);
  const offPrefs = usePreferences.subscribe((state, previous) => {
    if (state.value.restoreSession !== previous.value.restoreSession) schedule();
  });
  return () => {
    started = false;
    off();
    offView();
    offPrefs();
    clearTimeout(timer);
  };
}
