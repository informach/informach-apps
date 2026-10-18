import { cutTargets, type TimelineWord, timelineWords } from "@shared/cleanup";
import type { GlossaryTerm } from "@shared/glossary";
import {
  findLine,
  type InsertEntry,
  type InsertSource,
  layoutInserts,
  lockedAfter,
  planInserts,
  stillKey,
  voiceOverlaps,
} from "@shared/inserts";
import {
  parseScript,
  type ScriptDoc,
  type ScriptSection,
  type SpeechItem,
  speechItems,
} from "@shared/script";
import {
  type Alignment,
  alignSection,
  needsConfirmation,
  OFF_SCRIPT_LIMIT,
  offScriptShare,
  rankSections,
  type SectionRank,
} from "@shared/scriptAlign";
import { newId, sourceEnd } from "@shared/timeline";
import type { Asset, Clip, Project, Transcript } from "@shared/types";
import { useMemo } from "react";
import { type Commit, personCommit, useProject } from "@/state/project";
import { projectCorrectionTerms, useCorrectionTerms } from "./glossaryStore";
import { showProposal } from "./proposals";
import { loadProjectTranscripts } from "./transcripts";

const docCache = new Map<string, ScriptDoc>();
export function scriptDoc(p: Project | null): ScriptDoc | null {
  const text = p?.script?.text;
  if (!text) return null;
  let d = docCache.get(text);
  if (!d) {
    d = parseScript(text);
    docCache.clear();
    docCache.set(text, d);
  }
  return d;
}

/**
 * The section of this project: the one the person chose, or the best match with the recording.
 * `rank` says how sure the automatic choice is (null when the person chose).
 */
export function sectionIndex(
  p: Project,
  doc: ScriptDoc,
  words: TimelineWord[],
  glossary: readonly GlossaryTerm[] = [],
): { index: number; rank: SectionRank | null } {
  const chosen = p.script?.section;
  if (chosen !== undefined && doc.sections[chosen]) return { index: chosen, rank: null };
  const rank = rankSections(doc, words, { glossary });
  return { index: rank.index >= 0 ? rank.index : 0, rank };
}

export interface ScriptView {
  doc: ScriptDoc;
  index: number;
  section: ScriptSection;
  alignment: Alignment;
  words: TimelineWord[];
  /** How the sections scored, when the section was picked automatically. */
  rank: SectionRank | null;
  /**
   * The section is settled: the person chose or confirmed it, or the recording clearly matches
   * it. Otherwise the panel asks, and nothing off the script is proposed for cutting.
   */
  confirmed: boolean;
}

function view(
  p: Project,
  doc: ScriptDoc,
  words: TimelineWord[],
  glossary: readonly GlossaryTerm[],
): ScriptView {
  const { index, rank } = sectionIndex(p, doc, words, glossary);
  const section = doc.sections[index];
  return {
    doc,
    index,
    section,
    alignment: alignSection(section, words, { glossary }),
    words,
    rank,
    confirmed: !!p.script?.confirmed || !rank || (words.length > 0 && !needsConfirmation(rank)),
  };
}

export function useScriptView(
  project: Project | null,
  transcripts: Map<string, Transcript>,
): ScriptView | null {
  const glossary = useCorrectionTerms(project);
  return useMemo(() => {
    const doc = scriptDoc(project);
    if (!project || !doc?.sections.length) return null;
    const words = transcripts.size ? timelineWords(project, transcripts) : [];
    return view(project, doc, words, glossary);
  }, [project, transcripts, glossary]);
}

export async function currentView(
  p: Project,
): Promise<(ScriptView & { transcripts: Map<string, Transcript> }) | null> {
  const doc = scriptDoc(p);
  if (!doc?.sections.length) return null;
  const [transcripts, glossary] = await Promise.all([
    loadProjectTranscripts(p),
    projectCorrectionTerms(p),
  ]);
  return { ...view(p, doc, timelineWords(p, transcripts), glossary), transcripts };
}

/**
 * Attaches a script (or takes it out). Choosing a section is confirming it; a new text starts
 * over, with the section picked from the recording.
 */
export function setScript(text: string | null, section?: number): void {
  useProject.getState().commit((p) => ({
    ...p,
    script: text
      ? { text, ...(section !== undefined ? { section, confirmed: true } : {}) }
      : undefined,
  }));
}

export const insertedClip = (p: Project, insertId: string): Clip | undefined =>
  p.clips.find((c) => c.insertId === insertId);

type Placement =
  | { ok: false; message: string }
  | { ok: true; message: string; apply: (q: Project) => Project };

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

const labelOf = (item: SpeechItem): string => item.insertId ?? `"${item.text}"`;

/**
 * Places avatar lines from the script over the lesson: each is found in a transcribed media,
 * the timeline is opened where the recorded pause is too short (holding the screen on a still
 * frame), and the avatar goes on a free video track above, beside the content, with a short
 * dissolve. `target` is one line (an insert id or the script item), several ids, or "all" (every
 * avatar line of the section not placed yet). Everything is planned on one alignment and
 * applied from the end of the lesson to the start, as one undo step. Returns a message for the
 * user (or the AI), with what could not be placed and why.
 *
 * The placement is planned on the project as it is, with waits for the transcripts and the
 * still frames. If the project changed in the meantime, it is planned once more on the new one;
 * if it changed again, nothing is placed (an edit made meanwhile is never overwritten).
 */
export async function placeInserts(
  target: string | SpeechItem | string[] | "all",
  commit: Commit = personCommit,
): Promise<{ ok: boolean; message: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const p = useProject.getState().project;
    if (!p) return { ok: false, message: "Nenhum projeto aberto." };
    const revision = useProject.getState().revision;
    const planned = await planPlacement(p, target);
    if (!planned.ok) return planned;
    const now = useProject.getState();
    if (now.revision !== revision || now.project !== p) continue;
    if (!commit(planned.apply))
      return { ok: false, message: "A aula aberta mudou; nada foi encaixado." };
    return { ok: true, message: planned.message };
  }
  return {
    ok: false,
    message: "O projeto mudou enquanto a inserção era preparada. Nada foi colocado; tente de novo.",
  };
}

/** One avatar line (by insert id or script item); see placeInserts. */
export const placeInsert = (
  target: string | SpeechItem,
  commit: Commit = personCommit,
): Promise<{ ok: boolean; message: string }> => placeInserts(target, commit);

/** Avatar lines of the section that placeInserts("all") would place. */
export const pendingInserts = (p: Project, section: ScriptSection): SpeechItem[] =>
  speechItems(section).filter((i) => i.avatar && i.insertId && !insertedClip(p, i.insertId));

async function planPlacement(
  p: Project,
  target: string | SpeechItem | string[] | "all",
): Promise<Placement> {
  const view = await currentView(p);
  if (!view) return { ok: false, message: "Cole o roteiro na aba Roteiro primeiro." };
  const { section, alignment, transcripts } = view;
  const problems: string[] = [];
  const wanted: SpeechItem[] = [];
  const ids =
    target === "all"
      ? null
      : typeof target === "string"
        ? [target]
        : Array.isArray(target)
          ? target
          : null;
  if (target === "all") wanted.push(...pendingInserts(p, section));
  else if (ids)
    for (const id of ids) {
      const item = speechItems(section).find((i) => i.insertId?.toUpperCase() === id.toUpperCase());
      if (item) {
        wanted.push(item);
        continue;
      }
      const other = view.doc.sections.findIndex((s) =>
        speechItems(s).some((i) => i.insertId?.toUpperCase() === id.toUpperCase()),
      );
      problems.push(
        other >= 0
          ? `${id} é da seção ${view.doc.sections[other].number}; este projeto está na seção ${section.number}.`
          : `Inserção ${id} não encontrada no roteiro.`,
      );
    }
  else if (typeof target === "object" && !Array.isArray(target)) wanted.push(target);
  if (!wanted.length)
    return {
      ok: false,
      message:
        problems.join("\n") ||
        "Todas as falas do avatar desta seção já estão na timeline. Nada para encaixar.",
    };

  const found: { item: SpeechItem; src: InsertSource }[] = [];
  for (const item of wanted) {
    const label = labelOf(item);
    if (item.insertId && insertedClip(p, item.insertId)) {
      problems.push(`${label} já está na timeline.`);
      continue;
    }
    const own = alignment.lines.find((l) => l.item === section.items.indexOf(item));
    if (own && own.matched / Math.max(1, own.total) >= 0.6) {
      problems.push(`A fala de ${label} já está na timeline (${clock(own.start!)}).`);
      continue;
    }
    const src = findLine(item.text, transcripts);
    if (!src) {
      problems.push(
        `Não achei a fala de ${label} ("${item.text}") em nenhuma mídia transcrita. Importe e transcreva o vídeo do avatar.`,
      );
      continue;
    }
    found.push({ item, src });
  }
  const { entries, errors } = planInserts(section, alignment, found);
  for (const e of errors) problems.push(`${labelOf(e.item)}: ${e.error}`);

  // A gap that would pull the rest of the lesson out of sync with a locked track is refused.
  const locked = new Set(p.tracks.filter((t) => t.locked).map((t) => t.id));
  const targets = new Set([...cutTargets(p)].filter((id) => !locked.has(id)));
  const free: InsertEntry[] = [];
  for (const entry of entries) {
    const blocked = lockedAfter(p.clips, entry.plan, locked);
    if (!blocked.length) {
      free.push(entry);
      continue;
    }
    const names = [
      ...new Set(blocked.map((c) => p.tracks.find((t) => t.id === c.trackId)?.name ?? c.trackId)),
    ];
    problems.push(
      `Proposta para ${labelOf(entry.item)}, não aplicada: encaixar em ${clock(entry.plan.cut)} precisa abrir ${entry.plan.gap.toFixed(1)} s na timeline, mas a faixa travada ${names.join(", ")} passa por esse ponto e ficaria fora de sincronia. Destrave a faixa e peça de novo, ou encaixe à mão numa pausa maior.`,
    );
  }
  if (!free.length) return { ok: false, message: problems.join("\n") };

  // Still frames to hold the screen while the timeline is opened.
  const stills = new Map<string, Asset>();
  for (const { left } of layoutInserts(p, free, targets, locked).splits) {
    const key = stillKey(left);
    const a = p.assets.find((x) => x.id === left.assetId);
    if (!a || stills.has(key)) continue;
    const path = await window.api.stillFrame(a.path, sourceEnd(left) - 1 / (a.fps || 30));
    stills.set(key, {
      id: newId("a"),
      name: `Quadro parado de ${a.name}`,
      path,
      kind: "image",
      duration: 0,
      width: a.width,
      height: a.height,
      fps: 0,
      hasVideo: true,
      hasAudio: false,
      size: 0,
      proxyStatus: "none",
    });
  }
  const layout = layoutInserts(p, free, targets, locked, stills);
  const overlaps = voiceOverlaps(view.words, free);
  const lines = layout.placed.map(({ entry, clip }) => {
    const { plan } = entry;
    const opened =
      plan.gap > 0
        ? `; abri ${plan.gap.toFixed(1)} s na timeline${layout.splits.some((x) => x.entry === entry) ? " com a tela parada" : ""}`
        : " na pausa que já existia";
    return `${labelOf(entry.item)} encaixada em ${clock(clip.start)} (${plan.duration.toFixed(1)} s)${opened}.`;
  });
  for (const o of overlaps)
    lines.push(
      `Atenção: ${labelOf(o.entry.item)} fica por cima de outra voz ("${o.words
        .slice(0, 6)
        .map((w) => w.text)
        .join(" ")}"). Confira e mova o avatar ou corte essa fala.`,
    );
  return {
    ok: true,
    // Only applied when the project is still the one planned on (placeInserts checks it).
    apply: (q) => ({
      ...q,
      tracks: layout.tracks,
      assets: [...q.assets, ...layout.assets],
      clips: layout.clips,
    }),
    message: [...lines, ...problems].join("\n"),
  };
}

/**
 * Shows everything said outside the script (false starts, earlier takes, comments) as a cut
 * proposal. Refused while the section is not settled (the person has not confirmed a section
 * the recording only partly matches) and when more than OFF_SCRIPT_LIMIT of what was said is
 * off the script: that is a wrong section, not retakes.
 */
export async function proposeOffScript(by = "roteiro"): Promise<string> {
  const p = useProject.getState().project;
  if (!p) return "Nenhum projeto aberto.";
  // The times come from this state of the project: a change meanwhile makes them stale.
  const revision = useProject.getState().revision;
  const view = await currentView(p);
  if (!view) return "Cole o roteiro na aba Roteiro primeiro.";
  if (!view.words.length) return "Transcreva a narração antes de comparar com o roteiro.";
  const { section, alignment } = view;
  if (!view.confirmed)
    return `Antes de propor cortes, confirme na aba Roteiro que esta gravação é da seção ${section.number} (encontrei ${Math.round((view.rank?.coverage ?? 0) * 100)}% dela). Nada foi proposto.`;
  const share = offScriptShare(alignment);
  if (share > OFF_SCRIPT_LIMIT)
    return `${Math.round(share * 100)}% do que foi falado ficou fora do roteiro da seção ${section.number}, mais do que ${Math.round(OFF_SCRIPT_LIMIT * 100)}%. Confira se esta é a seção da gravação; nada foi proposto.`;
  const runs = alignment.offScript;
  if (!runs.length) return "Tudo o que foi falado está no roteiro.";
  const short = (t: string): string => (t.length > 70 ? `${t.slice(0, 70)}…` : t);
  return showProposal(
    p,
    "Falas fora do roteiro",
    runs.map((r) => ({
      start: r.start,
      end: r.end,
      reason:
        r.retakeOf !== undefined
          ? `${r.end <= (alignment.lines[r.retakeOf].start ?? Number.POSITIVE_INFINITY) ? "tomada anterior" : "outra tomada"} da linha ${r.retakeOf + 1}: "${short(r.text)}"`
          : `fora do roteiro: "${short(r.text)}"`,
    })),
    revision,
    by,
  );
}
