import { buildAss, buildCues, cueLayout, DEFAULT_CAPTION_STYLE } from "@shared/captions";
import { keyId } from "@shared/chroma";
import { buildSrt, timelineWords } from "@shared/cleanup";
import { type ExportItem, ExportQueue } from "@shared/exportQueue";
import { newId } from "@shared/timeline";
import { treatedPath } from "@shared/voiceChain";
import { create } from "zustand";
import { projectSpeech } from "@/lib/audio";
import { ensureCursorSprites } from "@/lib/cursorRender";
import { keyIsCurrent } from "@/lib/keying";
import { timelineKeys } from "@/lib/keysOnScreen";
import { loadAssetTranscript } from "@/lib/transcripts";
import { useApp } from "./app";
import { useProject } from "./project";

export const useExportQueue = create<{ items: ExportItem[]; open: boolean; held: boolean }>(() => ({
  items: [],
  open: false,
  held: false,
}));

/** Some export is waiting or running: closing the window has to wait for the queue. */
export const exportsPending = (): boolean =>
  useExportQueue
    .getState()
    .items.some((i) => i.state === "waiting" || i.state === "preparing" || i.state === "exporting");

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
        const words = timelineWords(project, new Map(loaded));
        if (item.captions) spec.captions = buildSrt(words);
        if (burn)
          spec.burnAss = buildAss(
            buildCues(words, spec.vertical ? 22 : 42, 2, cueLayout(project)),
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

export function retryExport(item: ExportItem): void {
  exportQueue.add({
    id: newId("export"),
    project: item.project,
    spec: item.spec,
    captions: item.captions,
  });
  exportQueue.remove(item.id);
}
