import { placeAnimations, type ReceivedAnimations, receivingIds } from "@shared/edisvgAnimations";
import { newId } from "@shared/timeline";
import type { Asset } from "@shared/types";
import { create } from "zustand";
import { useApp } from "@/state/app";
import { useProject } from "@/state/project";
import { mediaPictures, preparePlayback, probeMedia } from "./importMedia";
import { cleanError } from "./transcripts";

/**
 * The animations EdiSVG sent for the open lesson (shared/edisvgAnimations.ts), offered in a bar
 * until the person puts them in the lesson or says no. Looked for when a lesson opens and when
 * the window comes back to the front (after sending from EdiSVG).
 */

interface OfferState {
  offer: ReceivedAnimations | null;
  /** The lesson the offer is for (another lesson opened drops it). */
  projectId: string | null;
  placing: boolean;
}
export const useEdisvgOffer = create<OfferState>(() => ({
  offer: null,
  projectId: null,
  placing: false,
}));

export async function checkEdisvgAnimations(): Promise<void> {
  const p = useProject.getState().project;
  if (!p) {
    useEdisvgOffer.setState({ offer: null, projectId: null });
    return;
  }
  let offer: ReceivedAnimations | null = null;
  try {
    offer = await window.api.edisvgReceived(receivingIds(p));
  } catch {
    offer = null;
  }
  // Another lesson opened while it looked: that one asks for itself.
  if (useProject.getState().project?.id !== p.id) return;
  useEdisvgOffer.setState({ offer, projectId: p.id });
}

/** Puts the sent animations on their track, in one step that Ctrl+Z undoes. */
export async function placeEdisvgAnimations(): Promise<void> {
  const { offer, projectId, placing } = useEdisvgOffer.getState();
  const { toast } = useApp.getState();
  if (!offer || placing || useProject.getState().project?.id !== projectId) return;
  useEdisvgOffer.setState({ placing: true });
  try {
    const assets: Asset[] = [];
    const fresh: { asset: Asset; codec?: string }[] = [];
    for (const item of offer.items) {
      const own = useProject
        .getState()
        .project?.assets.find((a) => a.path.toLowerCase() === item.path.toLowerCase());
      if (own) {
        assets.push(own);
        continue;
      }
      const probed = await probeMedia(item.path);
      const asset = { ...probed.asset, name: item.name, ...(await mediaPictures(probed.asset)) };
      assets.push(asset);
      fresh.push({ asset, ...(probed.codec ? { codec: probed.codec } : {}) });
    }
    if (useProject.getState().project?.id !== projectId) return;
    const done = useProject.getState().commit((p) => placeAnimations(p, offer.items, assets));
    if (!done) {
      toast("As animações não puderam entrar na aula agora. Tente de novo.", "error");
      return;
    }
    for (const { asset, codec } of fresh) preparePlayback(asset, codec);
    // The animations are in the lesson already: a record that fails only means this send is
    // offered again (and placing it again replaces it), not that placing failed.
    await window.api.edisvgPlaced(offer.lessonId, offer.sentAt).catch(() => undefined);
    useEdisvgOffer.setState({ offer: null });
    toast(
      `${offer.items.length === 1 ? "1 animação do EdiSVG entrou" : `${offer.items.length} animações do EdiSVG entraram`} na faixa acima da gravação de tela.`,
      "success",
    );
  } catch (error) {
    toast(
      `Não consegui colocar as animações: ${error instanceof Error ? error.message : String(error)}`,
      "error",
    );
  } finally {
    useEdisvgOffer.setState({ placing: false });
  }
}

/** Whether the lesson is being packed for EdiSVG (one at a time). */
export const useAnimating = create<{ busy: boolean }>(() => ({ busy: false }));

/**
 * "Animar no EdiSVG": the lesson, saved first, goes to EdiSVG's pipelines as its package
 * (main/edisvgHandoff.ts), and EdiSVG opens with it chosen. The animation comes back to this
 * lesson by EdiSVG's "Enviar animações para a aula", offered in the bar above.
 */
export async function animateInEdisvg(): Promise<void> {
  const { startJob, endJob, toast } = useApp.getState();
  if (useAnimating.getState().busy || !useProject.getState().project) return;
  useAnimating.setState({ busy: true });
  const jobId = newId("edisvg");
  try {
    if (!(await useProject.getState().saveNow())) {
      toast("Salve a aula antes de mandar para o EdiSVG.", "error");
      return;
    }
    const p = useProject.getState().project;
    if (!p) return;
    startJob(jobId, `Preparando para o EdiSVG: ${p.name}`);
    const { opened } = await window.api.edisvgAnimate(jobId, JSON.stringify(p));
    toast(
      opened
        ? "A aula foi para o EdiSVG: os pipelines abrem lá com ela escolhida."
        : "A aula está esperando no EdiSVG: abra o EdiSVG (ou volte para ele) e os pipelines abrem com ela escolhida.",
      "success",
    );
  } catch (err) {
    toast(`A aula não foi para o EdiSVG: ${cleanError(err)}`, "error");
  } finally {
    endJob(jobId);
    useAnimating.setState({ busy: false });
  }
}

/** "Agora não": this send is not offered again (a new send from EdiSVG is). */
export async function declineEdisvgAnimations(): Promise<void> {
  const { offer } = useEdisvgOffer.getState();
  useEdisvgOffer.setState({ offer: null });
  if (offer) await window.api.edisvgPlaced(offer.lessonId, offer.sentAt).catch(() => undefined);
}
