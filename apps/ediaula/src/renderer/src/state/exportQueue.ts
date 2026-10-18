import { buildAss, buildCues, captionWords, cueLayout, DEFAULT_CAPTION_STYLE } from "@shared/captions";
import { keyId } from "@shared/chroma";
import { type ExportItem, ExportQueue } from "@shared/exportQueue";
import { newId } from "@shared/timeline";
import { treatedPath } from "@shared/voiceChain";
import type { TextCue } from "@shared/webvtt";
import { create } from "zustand";
import { projectSpeech } from "@/lib/audio";
import { ensureCursorSprites } from "@/lib/cursorRender";
import { keyIsCurrent } from "@/lib/keying";
import { timelineKeys } from "@/lib/keysOnScreen";
import { loadAssetTranscript } from "@/lib/transcripts";
import { useApp } from "./app";
import { useProject } from "./project";

export const useExportQueue = create<{
  items: ExportItem[];
  open: boolean;
  held: boolean;
  /** Exports the app did not finish last time, offered to resume. */
  resumable: ExportItem[];
}>(() => ({
  items: [],
  open: false,
  held: false,
  resumable: [],
}));

/** Some export is waiting or running: closing the window has to wait for the queue. */
export const exportsPending = (): boolean =>
  useExportQueue
    .getState()
    .items.some((i) => i.state === "waiting" || i.state === "preparing" || i.state === "exporting");

/** What is kept of an item between sessions (its own copy of the project and the settings). */
const saved = ({ id, project, spec, captions, state }: ExportItem) => ({
  id,
  project,
  spec,
  captions,
  state,
});

/** Writes the pending exports (and the ones still offered to resume) for the next session. */
function persist(pending: ExportItem[]): void {
  const all = [...pending, ...useExportQueue.getState().resumable];
  window.api.exportQueue
    .save(JSON.stringify(all.map(saved)))
    .catch((error: unknown) =>
      useApp
        .getState()
        .toast(
          `A fila de exportação não foi guardada para depois: ${error instanceof Error ? error.message : String(error)}`,
          "error",
        ),
    );
}

export const exportQueue = new ExportQueue(
  async (item, signal, status) => {
    const { project, spec, id } = item;
    const check = (): void => {
      signal.throwIfAborted();
    };
    const cancel = (): void => {
      void window.api.cancelJob(id);
    };
    signal.addEventListener("abort", cancel);
    useApp.getState().startJob(id, `Exportando: ${project.name}`);
    try {
      const used = new Set(project.clips.map((c) => c.assetId));
      const missing = project.assets.filter((a) => used.has(a.id) && a.missing);
      if (missing.length)
        throw new Error(`Mídias ausentes: ${missing.map((a) => a.name).join(", ")}`);
      const noCursor = project.assets.filter((a) => used.has(a.id) && a.cursorMissing);
      if (noCursor.length)
        throw new Error(
          `Dados do cursor ausentes: ${noCursor.map((a) => a.name).join(", ")}. Reconecte pela biblioteca.`,
        );
      const transcribed = project.assets.filter(
        (a) => a.transcript && a.transcriptStatus === "ready",
      );
      const keys = spec.audioOnly ? [] : await timelineKeys(project);
      check();
      const burn = !spec.audioOnly && !!project.captions?.burn && transcribed.length > 0;
      if ((item.captions || burn) && transcribed.length) {
        const loaded = await Promise.all(
          transcribed.map(async (a) => [a.id, await loadAssetTranscript(project, a)] as const),
        );
        check();
        // Only what is heard, each word once (shared/captions.ts).
        const words = captionWords(project, new Map(loaded));
        if (item.captions)
          spec.captionCues = buildCues(words, 42, 2, cueLayout(project)).map(
            (cue): TextCue => ({
              start: cue.start,
              end: cue.end,
              text: cue.lines.map((line) => line.map((w) => w.text).join(" ")).join("\n"),
            }),
          );
        if (burn)
          spec.burnAss = buildAss(
            buildCues(words, spec.height > spec.width ? 22 : 42, 2, cueLayout(project)),
            { ...DEFAULT_CAPTION_STYLE, ...project.captions },
            spec.width,
            spec.height,
            keys,
          );
      }
      if (!spec.burnAss && keys.length)
        spec.burnAss = buildAss([], DEFAULT_CAPTION_STYLE, spec.width, spec.height, keys);
      if (project.tracks.some((t) => t.music)) spec.speech = await projectSpeech(project);
      check();
      // A voice whose treatment is not ready yet (or whose file is gone) is treated now: the
      // export plays what the preview plays (shared/voiceChain.ts).
      for (const a of project.assets) {
        const preset = a.voicePreset ?? "off";
        if (!used.has(a.id) || !a.hasAudio || preset === "off") continue;
        // A treated file that the cache cleanup took is made again (the same file comes back).
        const ready = treatedPath(a);
        if (ready && (await window.api.exists([ready]))[0]) continue;
        status("preparing", `Tratando a voz: ${a.name}`);
        const treated = await window.api.treatVoice(id, a.path, preset);
        check();
        a.treated = { path: treated.path, preset: treated.preset, version: treated.version };
        a.treatStatus = "ready";
      }
      if (!spec.audioOnly) {
        for (const a of project.assets) {
          if (!used.has(a.id) || !a.key || keyIsCurrent(a)) continue;
          status("preparing", `Removendo fundo: ${a.name}`);
          a.keyed = await window.api.renderKeyed(
            id,
            a.path,
            a.width,
            a.height,
            a.fps,
            a.duration,
            a.key,
          );
          check();
          a.keyedId = keyId(a.key);
          a.keyStatus = "ready";
        }
        status("preparing", "Preparando o cursor…");
        spec.cursors = await ensureCursorSprites(project, signal);
        check();
      }
      status("exporting", "Exportando…");
      useApp.getState().startJob(id, `Exportando: ${project.name}`);
      await window.api.startExport(id, JSON.stringify(project), spec);
      check();
      const current = useProject.getState().project;
      if (current?.id === project.id && current.updatedAt === project.updatedAt) {
        useProject.getState().patch((p) => ({ ...p, exportedAt: Date.now() }));
      }
      useApp.getState().toast(`Exportação concluída: ${project.name}`, "info");
    } finally {
      signal.removeEventListener("abort", cancel);
      useApp.getState().endJob(id);
    }
  },
  (items) => useExportQueue.setState({ items }),
  persist,
);

/** While a take records, the next export waits for it (unless the recorder says otherwise). */
export function listenRecorderState(): () => void {
  const apply = (held: boolean): void => {
    exportQueue.hold(held);
    useExportQueue.setState({ held });
  };
  void window.api.recorder.status().then((s) => apply(!!s.holdBackground));
  return window.api.recorder.onState((s) => apply(!!s.holdBackground));
}

/** The exports left unfinished last time, offered in the queue to resume or discard. */
export async function loadUnfinishedExports(): Promise<void> {
  const text = await window.api.exportQueue.load();
  if (!text) return;
  const items: ExportItem[] = JSON.parse(text);
  if (items.length) useExportQueue.setState({ resumable: items, open: true });
}

/** Puts them back in the queue: the segments already rendered come from the cache. */
export function resumeUnfinished(): void {
  const { resumable } = useExportQueue.getState();
  useExportQueue.setState({ resumable: [] });
  for (const item of resumable)
    exportQueue.add({
      id: item.id,
      project: item.project,
      spec: item.spec,
      captions: item.captions,
    });
}

export function discardUnfinished(): void {
  useExportQueue.setState({ resumable: [] });
  persist(exportQueue.items.filter((i) => ["waiting", "preparing", "exporting"].includes(i.state)));
}

/** The lesson open now is the item's and was edited after it was queued. */
export function editedSince(item: ExportItem): boolean {
  const current = useProject.getState().project;
  return (
    !!current && current.id === item.project.id && current.updatedAt !== item.project.updatedAt
  );
}

/** Tries again with the item's own copy of the project, or with the one open now (`current`). */
export function retryExport(item: ExportItem, current = false): void {
  const open = useProject.getState().project;
  exportQueue.add({
    id: newId("export"),
    project: current && open && open.id === item.project.id ? open : item.project,
    spec: item.spec,
    captions: item.captions,
  });
  exportQueue.remove(item.id);
}
