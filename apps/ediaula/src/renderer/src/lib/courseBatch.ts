import { type SectionRange, sectionProject } from "@shared/courseSplit";
import { exportName, presetSpec } from "@shared/exportPresets";
import type { ScriptDoc } from "@shared/script";
import { newId } from "@shared/timeline";
import type { Project } from "@shared/types";
import { create } from "zustand";
import { useApp } from "@/state/app";
import { exportQueue, useExportQueue } from "@/state/exportQueue";
import { playback, usePlayback } from "@/state/playback";
import { useProject } from "@/state/project";
import { askConfirm } from "./confirm";
import { confirmLeave } from "./leaveGuard";

/**
 * "Lote por curso": the lessons made from one long recording, one per section of the script
 * (shared/courseSplit.ts), and their way out: each waits for the person to open it, prepare it
 * and approve it; an approved lesson goes into the export queue, into the folder picked once for
 * the batch. The batch lives for the session; each lesson is a project file of its own.
 */

export type BatchState = "waiting" | "approved";

export interface BatchLesson {
  path: string;
  name: string;
  section: number;
  label: string;
  start: number;
  end: number;
  /** The lesson as it was last left (opening it again needs no new permission). */
  project: Project;
  state: BatchState;
  /** Its export in the queue, once approved, and where the video goes. */
  exportId?: string;
  outPath?: string;
}

export const useCourseBatch = create<{
  source: string | null;
  lessons: BatchLesson[];
  /** Where the approved lessons are exported. */
  folder: string | null;
}>(() => ({ source: null, lessons: [], folder: null }));

/** Makes one project per stretch, beside the other projects; returns how many were made. */
export async function produceAll(
  project: Project,
  doc: ScriptDoc,
  ranges: readonly SectionRange[],
): Promise<number> {
  const lessons: BatchLesson[] = [];
  for (const range of ranges) {
    const section = doc.sections[range.section];
    const name = `${project.name} · ${section?.videoTitle || section?.title || `Seção ${section?.number ?? range.section + 1}`}`;
    const created = await window.api.createProject(name, project.course, project.settings);
    const lesson: Project = {
      ...sectionProject(project, doc, range, created.project.name),
      id: created.project.id,
      createdAt: created.project.createdAt,
      updatedAt: created.project.updatedAt,
    };
    await window.api.saveProject(created.path, JSON.stringify(lesson));
    lessons.push({
      path: created.path,
      name: lesson.name,
      section: range.section,
      label: range.label,
      start: range.start,
      end: range.end,
      project: lesson,
      state: "waiting",
    });
  }
  useCourseBatch.setState({ source: project.name, lessons, folder: null });
  return lessons.length;
}

// The open lesson of the batch is kept as it is left, to open it again from memory.
useProject.subscribe((s) => {
  const { lessons } = useCourseBatch.getState();
  const at = s.project ? lessons.findIndex((l) => l.project.id === s.project?.id) : -1;
  if (at < 0 || !s.project || lessons[at].project === s.project) return;
  const next = [...lessons];
  next[at] = { ...next[at], project: s.project };
  useCourseBatch.setState({ lessons: next });
});

/** Opens a lesson of the batch (the open one is saved first, as always). */
export async function openBatchLesson(path: string): Promise<void> {
  const lesson = useCourseBatch.getState().lessons.find((l) => l.path === path);
  if (!lesson || !(await confirmLeave())) return;
  playback.pause();
  usePlayback.setState({ time: 0 });
  useProject.getState().load(lesson.path, lesson.project);
  useApp.getState().set({ screen: "editor", exportOpen: false, tool: "select" });
}

/**
 * The open lesson of the batch is approved: it goes into the export queue as it is now, in the
 * folder chosen for the batch (asked the first time), with captions, translations up to date,
 * thumbnail and the platform package.
 */
export async function approveOpenLesson(): Promise<boolean> {
  const project = useProject.getState().project;
  const state = useCourseBatch.getState();
  const lesson = state.lessons.find((l) => l.project.id === project?.id);
  if (!project || !lesson) return false;
  let folder = state.folder;
  if (!folder) {
    folder = await window.api.pickFolder("Onde salvar os vídeos do lote");
    if (!folder) return false;
    useCourseBatch.setState({ folder });
  }
  const info = useApp.getState().info;
  const outPath = await batchOutPath(folder, project.name, lesson.path);
  if (!outPath) return false;
  const spec = {
    ...presetSpec("youtube", project.settings, { encoder: info?.encoder ?? "x264" }),
    outPath,
  };
  const id = newId("export");
  try {
    exportQueue.add({
      id,
      project,
      spec,
      captions: true,
      extras: { translations: true, platform: true },
    });
  } catch (err) {
    useApp
      .getState()
      .toast(
        `A aula não entrou na fila: ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
    return false;
  }
  useCourseBatch.setState({
    lessons: useCourseBatch
      .getState()
      .lessons.map((l) =>
        l.path === lesson.path ? { ...l, state: "approved", exportId: id, outPath } : l,
      ),
  });
  useExportQueue.setState({ open: true });
  return true;
}

/** The next lesson of the batch still waiting for approval, after the open one. */
export function nextWaiting(): BatchLesson | undefined {
  const { lessons } = useCourseBatch.getState();
  const open = useProject.getState().project?.id;
  const at = lessons.findIndex((l) => l.project.id === open);
  return [...lessons.slice(at + 1), ...lessons.slice(0, Math.max(0, at))].find(
    (l) => l.state === "waiting",
  );
}

export const clearBatch = (): void =>
  useCourseBatch.setState({ source: null, lessons: [], folder: null });

/**
 * Where a lesson of the batch is exported: its name in the batch's folder, numbered when another
 * lesson of the batch or an export in the queue already uses it ("Aula (2).mp4"). A file already
 * there is only written over when the person says so; null when they do not.
 */
async function batchOutPath(
  folder: string,
  name: string,
  lessonPath: string,
): Promise<string | null> {
  const taken = new Set(
    [
      ...useCourseBatch
        .getState()
        .lessons.filter((l) => l.path !== lessonPath)
        .flatMap((l) => (l.outPath ? [l.outPath] : [])),
      ...useExportQueue
        .getState()
        .items.filter((i) => ["waiting", "preparing", "exporting"].includes(i.state))
        .map((i) => i.spec.outPath),
    ].map((p) => p.toLowerCase()),
  );
  const file = exportName(name, "youtube", false);
  const stem = file.replace(/\.mp4$/i, "");
  let outPath = `${folder}\\${file}`;
  for (let n = 2; taken.has(outPath.toLowerCase()); n++) outPath = `${folder}\\${stem} (${n}).mp4`;
  const [there] = await window.api.exists([outPath]);
  if (!there) return outPath;
  const yes = await askConfirm({
    title: "O vídeo já existe nesta pasta",
    message: `${outPath.split("\\").pop()} já está em ${folder}. Gravar por cima dele?`,
    confirm: "Gravar por cima",
    cancel: "Não exportar",
  });
  return yes ? outPath : null;
}
