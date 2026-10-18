import { cutTargets } from "@shared/cleanup";
import { type DiffItem, includeItem, revertItem } from "@shared/projectDiff";
import {
  approveSeam,
  deriveSeams,
  isReviewed,
  restoreSeam,
  SEAM_CONTEXT,
  type Seam,
} from "@shared/seams";
import { create } from "zustand";
import { useApp } from "@/state/app";
import { playback } from "@/state/playback";
import { useProject } from "@/state/project";

/**
 * What the review bar does: the draft (accept or reject each item, apply as one undo step), the
 * cut proposals heard as they would be ("ouvir pulando o corte") and the quick review of every
 * seam of the edit ("Revisar cortes").
 */

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** A draft or a proposal the person applied or discarded. */
export interface Resolution {
  what: "draft" | "proposal";
  author?: string;
  outcome: "applied" | "discarded";
}

const listeners = new Set<(r: Resolution) => void>();

/** Called whenever a draft or a proposal is resolved; returns the unsubscribe. */
export function onReviewResolved(cb: (r: Resolution) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function reviewResolved(r: Resolution): void {
  for (const cb of [...listeners]) cb(r);
}

/* ----- The draft ----- */

/**
 * Leaves an item out of the draft, with what depends on it (shared/projectDiff.ts revertItem),
 * or brings it back.
 */
export function toggleDraftItem(id: string): void {
  const { draft, setDraftItems } = useProject.getState();
  const item = draft?.items.find((i) => i.id === id);
  if (!draft || !item) return;
  if (item.status === "rejected") {
    setDraftItems(includeItem(draft.items, id));
    return;
  }
  const r = revertItem(draft.base, draft.items, id);
  setDraftItems(r.items);
  if (r.conflicts.length)
    useApp
      .getState()
      .toast(
        r.conflicts.length === 1
          ? `Também saiu "${r.conflicts[0].label}", que dependia deste item.`
          : `Também saíram ${r.conflicts.length} itens que dependiam deste.`,
        "info",
      );
}

/** Writes the accepted items into the lesson as one undo step. */
export function applyDraftNow(): void {
  const { draft, applyDraft } = useProject.getState();
  if (!draft) return;
  const r = applyDraft();
  const { toast } = useApp.getState();
  if (!r.ok) {
    toast(
      r.conflicts.length
        ? `A aula mudou depois do rascunho em ${r.conflicts.length === 1 ? "um ponto" : `${r.conflicts.length} pontos`}. Deixe esses itens de fora ou descarte o rascunho.`
        : "A aula aberta mudou; nada foi aplicado.",
      "error",
    );
    return;
  }
  toast(
    `${r.applied === 1 ? "1 mudança aplicada" : `${r.applied} mudanças aplicadas`}. Ctrl+Z desfaz tudo de uma vez.`,
    "success",
  );
  reviewResolved({ what: "draft", author: draft.author, outcome: "applied" });
}

export function discardDraftNow(): void {
  const { draft, discardDraft } = useProject.getState();
  if (!draft) return;
  discardDraft();
  reviewResolved({ what: "draft", author: draft.author, outcome: "discarded" });
}

/** Plays a little before and after what a draft item changes. */
export function listenDraftItem(item: Pick<DiffItem, "at">): void {
  if (item.at === undefined) return;
  playback.playSpan(Math.max(0, item.at - SEAM_CONTEXT), item.at + 3);
}

/** Plays 1.5 s before and after a cut as if it were made: the cut stretch is jumped over. */
export function listenSkipping(place: [number, number]): void {
  playback.playSpan(Math.max(0, place[0] - SEAM_CONTEXT), place[1] + SEAM_CONTEXT, [place]);
}

/* ----- Revisar cortes ----- */

interface SeamReview {
  active: boolean;
  /** The seam being heard, among the ones still to approve. */
  seam: Seam | null;
  /** How many seams the lesson has and how many are approved. */
  total: number;
  reviewed: number;
}

export const useSeamReview = create<SeamReview>(() => ({
  active: false,
  seam: null,
  total: 0,
  reviewed: 0,
}));

function counts(): { open: Seam[]; total: number; reviewed: number } {
  const p = useProject.getState().project;
  if (!p) return { open: [], total: 0, reviewed: 0 };
  const all = deriveSeams(p);
  const open = all.filter((s) => !isReviewed(p, s));
  return { open, total: all.length, reviewed: all.length - open.length };
}

function hear(seam: Seam): void {
  playback.playSpan(Math.max(0, seam.at - SEAM_CONTEXT), seam.at + SEAM_CONTEXT);
}

/** Goes to the first seam still to approve after `after` (timeline seconds), and plays it. */
function goTo(after: number): void {
  const { open, total, reviewed } = counts();
  const seam = open.find((s) => s.at > after + 1e-3) ?? null;
  useSeamReview.setState({ active: true, seam, total, reviewed });
  if (seam) hear(seam);
  else {
    playback.pause();
    if (useSeamReview.getState().active && total)
      useApp
        .getState()
        .toast(
          open.length
            ? "Fim da revisão: alguns cortes ficaram para depois."
            : "Todos os cortes da aula foram revisados.",
          "success",
        );
  }
}

/** Starts "Revisar cortes" from the first seam still to approve. */
export function startSeamReview(): void {
  const { open, total } = counts();
  if (!total) {
    useApp.getState().toast("Esta aula ainda não tem cortes para revisar.", "info");
    return;
  }
  if (!open.length) {
    useApp.getState().toast("Todos os cortes da aula já foram revisados.", "info");
    return;
  }
  goTo(-1);
}

export function stopSeamReview(): void {
  playback.pause();
  useSeamReview.setState({ active: false, seam: null });
}

export function replaySeam(): void {
  const { seam } = useSeamReview.getState();
  if (seam) hear(seam);
}

/** Leaves the seam for later and goes to the next one. */
export function skipSeam(): void {
  const { seam } = useSeamReview.getState();
  goTo(seam?.at ?? -1);
}

/** Enter: the cut is good. Kept with the lesson (outside the undo history). */
export function approveSeamNow(): void {
  const { seam } = useSeamReview.getState();
  if (!seam) return;
  useProject.getState().patch((p) => approveSeam(p, seam));
  goTo(seam.at);
}

/** Backspace: the cut took too much. The stretch comes back (one undo step). */
export function restoreSeamNow(): void {
  const { seam } = useSeamReview.getState();
  const p = useProject.getState().project;
  if (!seam || !p) return;
  const locked = new Set(p.tracks.filter((t) => t.locked).map((t) => t.id));
  const targets = new Set([...cutTargets(p)].filter((id) => !locked.has(id)));
  const r = restoreSeam(p, seam, targets, locked);
  if ("refused" in r) {
    useApp.getState().toast(r.refused, "error");
    return;
  }
  useProject.getState().commit((q) => ({ ...q, clips: r.clips }));
  useApp
    .getState()
    .toast(
      `Trecho de ${seam.removed.toFixed(1).replace(".", ",")} s restaurado em ${clock(seam.at)}. Ctrl+Z desfaz.`,
      "success",
    );
  goTo(seam.at + seam.removed);
}
