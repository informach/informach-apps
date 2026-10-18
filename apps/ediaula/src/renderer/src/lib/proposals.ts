import {
  activeProposal,
  canApply,
  locateItem,
  PROPOSAL_ITEM_LIMIT,
  type Proposal,
  type ProposalItem,
  quoteIndexes,
  toSource,
  toTimeline,
} from "@shared/anchors";
import {
  cutTargets,
  mergeRanges,
  protectedConflicts,
  type TimelineWord,
  timelineWords,
  wordsRange,
} from "@shared/cleanup";
import { newId } from "@shared/timeline";
import type { Project } from "@shared/types";
import { useMemo } from "react";
import { useApp } from "@/state/app";
import { useProject } from "@/state/project";
import { cutRanges, loadProjectTranscripts } from "./transcripts";

interface RawItem {
  text?: string;
  near?: number;
  start?: number;
  end?: number;
  reason: string;
}

const fmt = (s: number): string => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

async function currentWords(p: Project): Promise<TimelineWord[]> {
  return timelineWords(p, await loadProjectTranscripts(p));
}

/** The transcript words of the open project, read again if the project changed meanwhile. */
async function freshWords(): Promise<{ project: Project; words: TimelineWord[] } | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const project = useProject.getState().project;
    if (!project) return null;
    const words = await currentWords(project);
    if (useProject.getState().project === project) return { project, words };
  }
  return null;
}

/**
 * Resolves the AI's suggested cuts, anchors them in the media and keeps them in the project for
 * the person to approve. Returns a short report for the model: what is pending approval and what
 * could not be placed. `p` is the project the items were computed on: a proposal for a project
 * that is no longer open is not shown.
 */
export async function showProposal(
  p: Project,
  title: string,
  raw: RawItem[],
  revision?: number,
): Promise<string> {
  const open = useProject.getState().project;
  if (!open || open.id !== p.id)
    return "O projeto aberto mudou; a proposta não foi mostrada. Leia o projeto de novo.";
  const current = useProject.getState().revision;
  const loaded = raw.some((r) => r.text) ? await freshWords() : { project: open, words: [] };
  if (!loaded || loaded.project.id !== p.id)
    return "O projeto mudou enquanto a proposta era montada; nada foi mostrado. Tente de novo.";
  const { project, words } = loaded;
  if (raw.some((r) => !r.text) && useProject.getState().revision !== current)
    return "O projeto mudou enquanto a proposta era montada; leia os tempos de novo.";
  const targets = cutTargets(project);
  const items: ProposalItem[] = [];
  const problems: string[] = [];
  for (const r of raw) {
    let range: [number, number];
    let extra: Pick<ProposalItem, "text" | "near" | "wordKeys"> = {};
    let prefer = targets;
    if (r.text) {
      const idx = quoteIndexes(words, r.text, r.near);
      if (!idx) {
        problems.push(`não localizado ou ambíguo: "${r.text}"`);
        continue;
      }
      range = wordsRange(words, idx[0], idx[1]);
      const quoted = words.slice(idx[0], idx[1] + 1);
      const clips = new Set(quoted.map((w) => w.clipId));
      prefer = new Set(project.clips.filter((c) => clips.has(c.id)).map((c) => c.trackId));
      extra = { text: r.text, near: r.near, wordKeys: quoted.map((w) => w.key) };
    } else if (r.start !== undefined && r.end !== undefined && r.end > r.start) {
      if (revision !== current) {
        problems.push(
          `trecho ${fmt(r.start)}–${fmt(r.end)} ignorado: informe a revisão atual (${current})`,
        );
        continue;
      }
      range = [r.start, r.end];
    } else {
      problems.push(`item sem texto nem intervalo válido (${r.reason})`);
      continue;
    }
    const anchors = toSource(project, range, prefer);
    if (!anchors.length) {
      problems.push(`trecho ${fmt(range[0])}–${fmt(range[1])} sem vídeo ou áudio embaixo`);
      continue;
    }
    items.push({
      id: newId("pi"),
      start: range[0],
      end: range[1],
      reason: r.reason,
      anchors,
      status: "pending",
      ...extra,
    });
  }
  const blocked = items.filter((i) => protectedConflicts(project, [[i.start, i.end]]).length);
  for (const b of blocked)
    problems.push(
      `protegido, fora da proposta: ${b.text ? `"${b.text}"` : `${fmt(b.start)}–${fmt(b.end)}`}`,
    );
  let ok = items.filter((i) => !blocked.includes(i)).sort((a, b) => a.start - b.start);
  if (!ok.length) return `Nenhum corte pôde ser proposto.\n${problems.join("\n")}`;
  if (ok.length > PROPOSAL_ITEM_LIMIT) {
    problems.push(`${ok.length - PROPOSAL_ITEM_LIMIT} item(ns) além do limite ficaram de fora`);
    ok = ok.slice(0, PROPOSAL_ITEM_LIMIT);
  }
  const proposal: Proposal = {
    id: newId("prop"),
    projectId: project.id,
    title,
    revision: current,
    createdAt: Date.now(),
    items: ok,
  };
  // Replaces any previous proposal.
  useProject.getState().setProposals(() => [proposal]);
  let saved = 0;
  for (const [a, b] of mergeRanges(ok.map((i) => [i.start, i.end]))) saved += b - a;
  return [
    `Proposta "${title}" mostrada ao usuário: ${ok.length} corte(s), −${saved.toFixed(1)} s. Ele vai aplicar ou descartar na tela; não aplique você mesmo.`,
    ...problems,
  ].join("\n");
}

/** The pending proposal of the open project, each item where its anchors place it now. */
export function useProposalView(): {
  proposal: Proposal;
  places: ([number, number] | null)[];
} | null {
  const project = useProject((s) => s.project);
  return useMemo(() => {
    const proposal = activeProposal(project);
    if (!project || !proposal) return null;
    return {
      proposal,
      places: proposal.items.map((item) => toTimeline(project, item.anchors, item.start)),
    };
  }, [project]);
}

export function discardProposal(id: string): void {
  useProject.getState().setProposals((list) => list.filter((p) => p.id !== id));
}

/** Leaves an item out of the proposal (or brings it back) before applying. */
export function toggleProposalItem(proposalId: string, itemId: string): void {
  useProject.getState().setProposals((list) =>
    list.map((p) =>
      p.id === proposalId
        ? {
            ...p,
            items: p.items.map((i) =>
              i.id === itemId
                ? { ...i, status: i.status === "pending" ? "rejected" : "pending" }
                : i,
            ),
          }
        : p,
    ),
  );
}

/**
 * Applies the pending proposal of the open project as one undo step. Each item is placed again
 * by its anchors in the media, then by its transcript words, then by its text; an item that
 * cannot be found any more is left out and counted.
 */
export async function applyProposal(): Promise<void> {
  const { toast } = useApp.getState();
  const start = useProject.getState().project;
  const proposal = activeProposal(start);
  if (!proposal || !start) return;
  if (!canApply(proposal, start)) {
    toast("Esta proposta não é desta aula ou não tem cortes marcados.", "error");
    return;
  }
  const needsWords = proposal.items.some(
    (i) => i.status === "pending" && !toTimeline(start, i.anchors, i.start),
  );
  const loaded = needsWords ? await freshWords() : { project: start, words: undefined };
  const project = loaded?.project;
  if (!loaded || !project || !canApply(proposal, project)) {
    toast("A aula mudou enquanto a proposta era aplicada. Nada foi cortado.", "error");
    return;
  }
  const ranges: [number, number][] = [];
  let dropped = 0;
  for (const item of proposal.items) {
    if (item.status !== "pending") continue;
    const range = locateItem(project, item, loaded.words);
    if (range) ranges.push(range);
    else dropped++;
  }
  if (useProject.getState().project !== project) {
    toast("A aula mudou enquanto a proposta era aplicada. Tente de novo.", "error");
    return;
  }
  const r = cutRanges(ranges);
  if (!r.ok) {
    toast(
      r.conflicts.length
        ? `A proposta toca o trecho protegido "${r.conflicts[0].label}". Nada foi cortado.`
        : dropped
          ? "Nenhum trecho da proposta foi encontrado de novo na aula. Nada foi cortado."
          : "Nada para aplicar.",
      "error",
    );
    return;
  }
  discardProposal(proposal.id);
  toast(
    `${ranges.length} corte(s) aplicados${dropped ? ` (${dropped} não foram encontrados de novo e ficaram de fora)` : ""}. Ctrl+Z desfaz tudo de uma vez.`,
    "success",
  );
}
