import {
  buildItems,
  type CutCategory,
  canApply,
  locateItem,
  type Proposal,
  type ProposalItem,
  quoteIndexes,
  withProposal,
} from "@shared/anchors";
import {
  cutTargets,
  mergeRanges,
  protectedConflicts,
  type TimelineWord,
  timelineWords,
  wordsRange,
} from "@shared/cleanup";
import { plural } from "@shared/plural";
import { proposalListSchema } from "@shared/project-schema";
import { newId } from "@shared/timeline";
import type { Project } from "@shared/types";
import { useMemo } from "react";
import { create } from "zustand";
import { useApp } from "@/state/app";
import { personCommit, useProject } from "@/state/project";
import {
  type BlindSpots,
  type CleanupOverrides,
  cleanupItems,
  cleanupPlan,
  keepRejected,
} from "./cleanupPlan";
import { reviewResolved } from "./review";
import {
  cutRanges,
  loadCleanupInputs,
  loadProjectTranscripts,
  useTranscripts,
} from "./transcripts";

interface RawItem {
  text?: string;
  near?: number;
  start?: number;
  end?: number;
  reason: string;
  /** The cleanup suggestion it comes from: left out of the proposal, it is kept from then on. */
  issueId?: string;
  category?: CutCategory;
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
 * that is no longer open is not shown. `by` names the author: a new proposal replaces only an
 * earlier one of the same author (an AI app connected from outside never replaces the chat's or
 * the recording's), and the others stay pending.
 */
export async function showProposal(
  p: Project,
  title: string,
  raw: RawItem[],
  revision: number | undefined,
  by: string,
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
    let base: Parameters<typeof buildItems>[3] = {
      reason: r.reason,
      ...(r.category ? { category: r.category } : {}),
    };
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
      base = {
        ...base,
        text: r.text,
        near: r.near,
        wordKeys: quoted.map((w) => w.key),
        ...(r.issueId ? { issueId: r.issueId } : {}),
      };
    } else if (r.start !== undefined && r.end !== undefined && r.end > r.start) {
      if (revision !== current) {
        problems.push(
          `trecho ${fmt(r.start)}–${fmt(r.end)} ignorado: informe a revisão atual (${current})`,
        );
        continue;
      }
      range = [r.start, r.end];
      if (r.issueId) base = { ...base, issueId: r.issueId };
    } else {
      problems.push(`item sem texto nem intervalo válido (${r.reason})`);
      continue;
    }
    const built = buildItems(project, range, prefer, base, () => newId("pi"));
    if (!built.length) {
      problems.push(`trecho de ${fmt(range[0])} a ${fmt(range[1])} sem vídeo ou áudio embaixo`);
      continue;
    }
    if (built.length > 1)
      problems.push(
        `trecho de ${fmt(range[0])} a ${fmt(range[1])} passa por muitos clipes e virou ${built.length} itens`,
      );
    items.push(...built);
  }
  const blocked = items.filter((i) => protectedConflicts(project, [[i.start, i.end]]).length);
  for (const b of blocked)
    problems.push(
      `protegido, fora da proposta: ${b.text ? `"${b.text}"` : `${fmt(b.start)}–${fmt(b.end)}`}`,
    );
  const ok = items.filter((i) => !blocked.includes(i)).sort((a, b) => a.start - b.start);
  if (!ok.length) return `Nenhum corte pôde ser proposto.\n${problems.join("\n")}`;
  const stored = storeProposal(project, title, ok, by);
  if ("refused" in stored) return stored.refused;
  if (stored.replaced) problems.unshift(stored.replaced);
  const saved = proposedSeconds(ok);
  return [
    `Proposta "${title}" mostrada ao usuário: ${plural(ok.length, "corte", "cortes")}, −${saved.toFixed(1)} s. Ele vai aplicar ou descartar na tela; não aplique você mesmo.`,
    ...problems,
  ].join("\n");
}

/**
 * What the cleanup could not see, one line each, for the panel and the AI: recordings without
 * cursor data, media that counts all as speech, transcripts nobody hears, screens still being
 * analyzed.
 */
export function blindNotes(project: Project, blind: BlindSpots): string[] {
  const names = (ids: readonly string[]): string =>
    ids.map((id) => project.assets.find((a) => a.id === id)?.name ?? id).join(", ");
  return [
    blind.screenPending.length
      ? `Ainda vendo onde a tela fica parada em ${names(blind.screenPending)}: até lá, nenhum silêncio dessa gravação é cortado.`
      : "",
    blind.unreadable.length
      ? `Os dados do cursor de ${names(blind.unreadable)} não abriram: cliques, arrastos e digitação ali não são vistos.`
      : "",
    blind.noCursor.length
      ? `Sem dados do cursor em ${names(blind.noCursor)}: cliques, arrastos e digitação ali não são vistos.`
      : "",
    blind.noEnvelope.length
      ? `Sem transcrição nem forma de onda em ${names(blind.noEnvelope)}: tudo ali conta como fala e nada é cortado.`
      : "",
    blind.inaudible.length
      ? `${names(blind.inaudible)} não se ouve na aula (faixa muda, volume zero ou sob o som do apresentador): fica fora da limpeza.`
      : "",
  ].filter(Boolean);
}

const proposedSeconds = (items: ProposalItem[]): number => {
  let saved = 0;
  for (const [a, b] of mergeRanges(items.map((i) => [i.start, i.end]))) saved += b - a;
  return saved;
};

/**
 * Keeps a proposal in the project and shows it in the bar. Returns why it was not kept (too big
 * to save with the lesson), or which earlier proposal of the same author it replaced.
 */
function storeProposal(
  project: Project,
  title: string,
  items: ProposalItem[],
  by: string,
): { refused: string } | { replaced?: string } {
  const proposal: Proposal = {
    id: newId("prop"),
    projectId: project.id,
    title,
    revision: useProject.getState().revision,
    createdAt: Date.now(),
    by,
    items,
  };
  const list = withProposal(project.proposals ?? [], proposal);
  // What is kept must always reopen with the project: checked against its schema first.
  const valid = proposalListSchema.safeParse(list);
  if (!valid.success || !list.includes(proposal))
    return {
      refused: `A proposta é grande demais para guardar na aula (${items.length} itens). Proponha um trecho menor.`,
    };
  const earlier = (project.proposals ?? []).find((p) => p.by === by);
  useProject.getState().setProposals(() => list);
  useProposalChoice.setState({ id: proposal.id });
  return earlier
    ? {
        replaced: `Substituiu a proposta anterior "${earlier.title}", que ainda não tinha sido aplicada.`,
      }
    : {};
}

/**
 * Keeps items already anchored as a proposal of `by` (the cuts of "Preparar aula"). Returns why it
 * was refused, or which earlier proposal of the same author it replaced.
 */
export function proposeItems(
  project: Project,
  title: string,
  items: ProposalItem[],
  by: string,
): { refused: string } | { replaced?: string } {
  return storeProposal(project, title, items, by);
}

/**
 * The automatic cleanup as a proposal (cleanupPlan, with the choices kept in the project): each
 * hesitation, repeat and pause is an item the person can leave out before applying, and nothing
 * is cut until they apply it. Made on the computer, without the AI. `overrides` are the AI's
 * options for this one call; what the person chose to keep stays kept.
 */
export async function proposeCleanup(
  by = "limpeza",
  overrides: CleanupOverrides = {},
): Promise<{ ok: boolean; message: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const project = useProject.getState().project;
    if (!project) return { ok: false, message: "Nenhum projeto aberto." };
    const transcripts = await loadProjectTranscripts(project);
    if (!transcripts.size)
      return {
        ok: false,
        message:
          "Esta aula ainda não tem transcrição. Transcreva na aba Transcrição antes de limpar.",
      };
    const inputs = await loadCleanupInputs(project, transcripts);
    if (useProject.getState().project !== project) continue;
    const plan = cleanupPlan(project, inputs, overrides);
    if (!plan.active.length)
      return {
        ok: true,
        message: [
          "Nada para limpar com as escolhas desta aula.",
          ...blindNotes(project, plan.blind),
        ].join("\n"),
      };
    const items = cleanupItems(project, plan, () => newId("pi"));
    const stored = storeProposal(project, "Limpeza da aula", items, by);
    if ("refused" in stored) return { ok: false, message: stored.refused };
    const count = (k: string): number => plan.active.filter((i) => i.kind === k).length;
    const notes = [stored.replaced, ...blindNotes(project, plan.blind)].filter(Boolean);
    return {
      ok: true,
      message: [
        `Proposta de limpeza pronta: ${plural(count("filler"), "vício", "vícios")}, ${plural(count("repeat"), "repetição", "repetições")} e ${plural(count("silence"), "silêncio", "silêncios")}, −${proposedSeconds(items).toFixed(1).replace(".", ",")} s. Revise na barra da proposta e aplique; nada foi cortado ainda.`,
        ...(plan.elsewhere
          ? [
              `${plural(plan.elsewhere, "sugestão já está", "sugestões já estão")} na proposta da limpeza da voz e ficaram de fora.`,
            ]
          : []),
        ...notes,
      ].join("\n"),
    };
  }
  return {
    ok: false,
    message: "A aula mudou enquanto a limpeza era preparada. Nada foi proposto; tente de novo.",
  };
}

/** The pending proposal shown in the bar (the latest, unless the person picked another). */
const useProposalChoice = create<{ id: string | null }>(() => ({ id: null }));

const chosen = (project: Project | null, id: string | null): Proposal | null => {
  const list = project?.proposals ?? [];
  return list.find((p) => p.id === id) ?? list[list.length - 1] ?? null;
};

export function chooseProposal(id: string): void {
  useProposalChoice.setState({ id });
}

/**
 * The pending proposal of the open project, each item where it would be cut now: the same
 * search as Aplicar (anchors, then word keys, then the text near the anchors), so what the
 * person sees is exactly what is cut. Null places are left out when applying.
 */
export function useProposalView(): {
  proposal: Proposal;
  places: ([number, number] | null)[];
  all: Proposal[];
} | null {
  const project = useProject((s) => s.project);
  const choice = useProposalChoice((s) => s.id);
  const transcripts = useTranscripts(project);
  return useMemo(() => {
    const proposal = chosen(project, choice);
    if (!project || !proposal) return null;
    const words = transcripts.size ? timelineWords(project, transcripts) : undefined;
    return {
      proposal,
      places: proposal.items.map((item) => locateItem(project, item, words)),
      all: project.proposals ?? [],
    };
  }, [project, choice, transcripts]);
}

export function discardProposal(id: string): void {
  const gone = useProject.getState().project?.proposals?.find((p) => p.id === id);
  useProject.getState().setProposals((list) => list.filter((p) => p.id !== id));
  if (gone)
    reviewResolved({
      what: "proposal",
      author: gone.by,
      outcome: "discarded",
      proposalItems: gone.items,
    });
}

/** Leaves out (or brings back) every item of a category of the proposal. */
export function setProposalCategory(
  proposalId: string,
  category: CutCategory,
  status: ProposalItem["status"],
): void {
  useProject
    .getState()
    .setProposals((list) =>
      list.map((p) =>
        p.id === proposalId
          ? { ...p, items: p.items.map((i) => (i.category === category ? { ...i, status } : i)) }
          : p,
      ),
    );
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
 * Applies the proposal shown in the bar as one undo step. Each item is placed again by its
 * anchors in the media, then by its transcript words, then by its text near where it was; an
 * item that cannot be found any more is left out and counted. The proposal goes away only when
 * the cut was really made.
 */
export async function applyProposal(): Promise<void> {
  const { toast } = useApp.getState();
  const start = useProject.getState().project;
  const proposal = chosen(start, useProposalChoice.getState().id);
  if (!proposal || !start) return;
  if (!canApply(proposal, start)) {
    toast("Esta proposta não é desta aula ou não tem cortes marcados.", "error");
    return;
  }
  const loaded = await freshWords();
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
  // What the person left out of a cleanup proposal stays kept from now on, in the same undo step.
  const r = ranges.length
    ? cutRanges(ranges, personCommit, (p) => keepRejected(p, proposal.items))
    : { ok: false, conflicts: [] };
  if (!r.ok) {
    toast(
      r.conflicts.length
        ? `A proposta toca o trecho protegido "${r.conflicts[0].label}". Nada foi cortado.`
        : dropped
          ? "Nenhum trecho da proposta foi encontrado de novo na aula. Nada foi cortado."
          : "Nada foi cortado.",
      "error",
    );
    return;
  }
  useProject.getState().setProposals((list) => list.filter((p) => p.id !== proposal.id));
  reviewResolved({
    what: "proposal",
    author: proposal.by,
    outcome: "applied",
    proposalItems: proposal.items,
  });
  toast(
    `${ranges.length === 1 ? "1 corte aplicado" : `${ranges.length} cortes aplicados`}${dropped ? `; ${dropped === 1 ? "1 trecho não foi encontrado de novo e ficou" : `${dropped} trechos não foram encontrados de novo e ficaram`} de fora` : ""}. Ctrl+Z desfaz tudo de uma vez.`,
    dropped ? "info" : "success",
  );
}
