import { buildAss, buildCues, DEFAULT_CAPTION_STYLE } from "@shared/captions";
import { keyId } from "@shared/chroma";
import { buildSrt, timelineWords } from "@shared/cleanup";
import { type ExportItem, ExportQueue } from "@shared/exportQueue";
import { newId } from "@shared/timeline";
import { create } from "zustand";
import { projectSpeech } from "@/lib/audio";
import { ensureCursorSprites } from "@/lib/cursorRender";
import { keyIsCurrent } from "@/lib/keying";
import { timelineKeys } from "@/lib/keysOnScreen";
import { loadTranscript } from "@/lib/transcripts";
import { useApp } from "./app";
import { useProject } from "./project";

export const useExportQueue = create<{ items: ExportItem[]; open: boolean }>(() => ({
  items: [],
  open: false,
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
          transcribed.map(async (a) => [a.id, await loadTranscript(a.transcript!)] as const),
        );
        check();
        const words = timelineWords(project, new Map(loaded));
        if (item.captions) spec.captions = buildSrt(words);
        if (burn)
          spec.burnAss = buildAss(
            buildCues(words, spec.vertical ? 22 : 42),
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

export function retryExport(item: ExportItem): void {
  exportQueue.add({
    id: newId("export"),
    project: item.project,
    spec: item.spec,
    captions: item.captions,
  });
  exportQueue.remove(item.id);
}
