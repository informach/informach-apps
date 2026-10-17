import {
  findQuote,
  mergeRanges,
  protectedConflicts,
  type TimelineWord,
  timelineWords,
} from "@shared/cleanup";
import type { Project } from "@shared/types";
import { type ProposalItem, useApp } from "@/state/app";
import { useProject } from "@/state/project";
import { cutRanges, loadProjectTranscripts, wordsRange } from "./transcripts";

interface RawItem {
  text?: string;
  near?: number;
  start?: number;
  end?: number;
  reason: string;
}

const fmt = (s: number): string => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

function locate(words: TimelineWord[], text: string, near?: number): [number, number] | null {
  const found = findQuote(words, text);
  if (!found.length) return null;
  const pick =
    found.length === 1 || near === undefined
      ? found[0]
      : found.reduce((b, c) =>
          Math.abs(words[c[0]].start - near) < Math.abs(words[b[0]].start - near) ? c : b,
        );
  if (found.length > 1 && near === undefined) return null;
  return wordsRange(words, pick[0], pick[1]);
}

async function currentWords(p: Project): Promise<TimelineWord[]> {
  return timelineWords(p, await loadProjectTranscripts(p));
}

/**
 * Resolves the AI's suggested cuts and shows them on the timeline for approval. Returns a short
 * report for the model: what is pending approval and what could not be placed.
 */
export async function showProposal(
  p: Project,
  title: string,
  raw: RawItem[],
  revision?: number,
): Promise<string> {
  const words = raw.some((r) => r.text) ? await currentWords(p) : [];
  const current = useProject.getState().revision;
  const items: ProposalItem[] = [];
  const problems: string[] = [];
  for (const r of raw) {
    if (r.text) {
      const range = locate(words, r.text, r.near);
      if (range)
        items.push({
          start: range[0],
          end: range[1],
          reason: r.reason,
          text: r.text,
          near: r.near,
        });
      else problems.push(`não localizado ou ambíguo: "${r.text}"`);
    } else if (r.start !== undefined && r.end !== undefined && r.end > r.start) {
      if (revision !== current)
        problems.push(
          `trecho ${fmt(r.start)}–${fmt(r.end)} ignorado: informe a revisão atual (${current})`,
        );
      else items.push({ start: r.start, end: r.end, reason: r.reason });
    } else problems.push(`item sem texto nem intervalo válido (${r.reason})`);
  }
  const blocked = items.filter((i) => protectedConflicts(p, [[i.start, i.end]]).length);
  for (const b of blocked)
    problems.push(
      `protegido, fora da proposta: ${b.text ? `"${b.text}"` : `${fmt(b.start)}–${fmt(b.end)}`}`,
    );
  const ok = items.filter((i) => !blocked.includes(i));
  if (!ok.length) return `Nenhum corte pôde ser proposto.\n${problems.join("\n")}`;
  useApp
    .getState()
    .set({ proposal: { title, items: ok.sort((a, b) => a.start - b.start), revision: current } });
  let saved = 0;
  for (const [a, b] of mergeRanges(ok.map((i) => [i.start, i.end]))) saved += b - a;
  return [
    `Proposta "${title}" mostrada ao usuário: ${ok.length} corte(s), −${saved.toFixed(1)} s. Ele vai aplicar ou descartar na tela; não aplique você mesmo.`,
    ...problems,
  ].join("\n");
}

/** Applies the pending proposal as one undo step, re-locating quotes if the edit changed meanwhile. */
export async function applyProposal(): Promise<void> {
  const { proposal, toast, set } = useApp.getState();
  const p = useProject.getState().project;
  if (!proposal || !p) return;
  let items = proposal.items;
  let dropped = 0;
  if (proposal.revision !== useProject.getState().revision) {
    const words = await currentWords(p);
    const next: ProposalItem[] = [];
    for (const i of items) {
      const range = i.text ? locate(words, i.text, i.near) : null;
      if (range) next.push({ ...i, start: range[0], end: range[1] });
      else dropped++;
    }
    items = next;
  }
  const r = cutRanges(items.map((i) => [i.start, i.end]));
  set({ proposal: null });
  if (!r.ok) {
    toast(
      r.conflicts.length
        ? `A proposta toca o trecho protegido "${r.conflicts[0].label}". Nada foi cortado.`
        : "Nada para aplicar.",
      "error",
    );
    return;
  }
  toast(
    `${items.length} corte(s) aplicados${dropped ? ` (${dropped} ignorados porque o texto mudou)` : ""}. Ctrl+Z desfaz tudo de uma vez.`,
    "success",
  );
}
