import { cutTargets, type TimelineWord, timelineWords } from "@shared/cleanup";
import { AVATAR_FADE, defaultTransformFor, placementTransform } from "@shared/compose";
import { findLine, insertClip, openGap, planInsert } from "@shared/inserts";
import {
  parseScript,
  type ScriptDoc,
  type ScriptSection,
  type SpeechItem,
  speechItems,
} from "@shared/script";
import { type Alignment, alignSection, bestSection } from "@shared/scriptAlign";
import { clipEnd, newId, newTrackName, sourceEnd } from "@shared/timeline";
import type { Asset, Clip, Project, Track, Transcript } from "@shared/types";
import { useMemo } from "react";
import { useProject } from "@/state/project";
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

/** The section chosen for this project, or the best match with the recording. */
export function sectionIndex(p: Project, doc: ScriptDoc, words: TimelineWord[]): number {
  const chosen = p.script?.section;
  if (chosen !== undefined && doc.sections[chosen]) return chosen;
  const best = bestSection(doc, words);
  return best >= 0 ? best : 0;
}

export interface ScriptView {
  doc: ScriptDoc;
  index: number;
  section: ScriptSection;
  alignment: Alignment;
  words: TimelineWord[];
}

export function useScriptView(
  project: Project | null,
  transcripts: Map<string, Transcript>,
): ScriptView | null {
  return useMemo(() => {
    const doc = scriptDoc(project);
    if (!project || !doc || !doc.sections.length) return null;
    const words = transcripts.size ? timelineWords(project, transcripts) : [];
    const index = sectionIndex(project, doc, words);
    const section = doc.sections[index];
    return { doc, index, section, alignment: alignSection(section, words), words };
  }, [project, transcripts]);
}

export async function currentView(
  p: Project,
): Promise<(ScriptView & { transcripts: Map<string, Transcript> }) | null> {
  const doc = scriptDoc(p);
  if (!doc?.sections.length) return null;
  const transcripts = await loadProjectTranscripts(p);
  const words = timelineWords(p, transcripts);
  const index = sectionIndex(p, doc, words);
  const section = doc.sections[index];
  return { doc, index, section, alignment: alignSection(section, words), words, transcripts };
}

export function setScript(text: string | null, section?: number): void {
  useProject.getState().commit((p) => ({
    ...p,
    script: text ? { text, ...(section !== undefined ? { section } : {}) } : undefined,
  }));
}

export const insertedClip = (p: Project, insertId: string): Clip | undefined =>
  p.clips.find((c) => c.insertId === insertId);

type Placement =
  | { ok: false; message: string }
  | { ok: true; message: string; apply: (q: Project) => Project };

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

/**
 * Places an avatar line from the script over the lesson: finds it in a transcribed media, opens
 * the timeline if the recorded pause is too short (holding the screen on a still frame) and puts
 * the avatar on a free video track above, beside the content, with a short dissolve.
 * One undo step. Returns a message for the user (or the AI).
 *
 * The placement is planned on the project as it is, with waits for the transcripts and the
 * still frames. If the project changed in the meantime, it is planned once more on the new one;
 * if it changed again, nothing is placed (an edit made meanwhile is never overwritten).
 */
export async function placeInsert(
  target: string | SpeechItem,
): Promise<{ ok: boolean; message: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const p = useProject.getState().project;
    if (!p) return { ok: false, message: "Nenhum projeto aberto." };
    const revision = useProject.getState().revision;
    const planned = await planPlacement(p, target);
    if (!planned.ok) return planned;
    const now = useProject.getState();
    if (now.revision !== revision || now.project !== p) continue;
    now.commit(planned.apply);
    return { ok: true, message: planned.message };
  }
  return {
    ok: false,
    message: "O projeto mudou enquanto a inserção era preparada. Nada foi colocado; tente de novo.",
  };
}

async function planPlacement(p: Project, target: string | SpeechItem): Promise<Placement> {
  const view = await currentView(p);
  if (!view) return { ok: false, message: "Cole o roteiro na aba Roteiro primeiro." };
  const { section, alignment, transcripts } = view;
  const item =
    typeof target === "string"
      ? speechItems(section).find((i) => i.insertId?.toUpperCase() === target.toUpperCase())
      : target;
  if (!item) {
    const other = view.doc.sections.findIndex((s) =>
      speechItems(s).some((i) => i.insertId?.toUpperCase() === String(target).toUpperCase()),
    );
    return {
      ok: false,
      message:
        other >= 0
          ? `${target} é da seção ${view.doc.sections[other].number}; este projeto está na seção ${section.number}.`
          : `Inserção ${target} não encontrada no roteiro.`,
    };
  }
  const label = item.insertId ?? `"${item.text}"`;
  if (item.insertId && insertedClip(p, item.insertId))
    return { ok: false, message: `${label} já está na timeline.` };
  const own = alignment.lines.find((l) => l.item === section.items.indexOf(item));
  if (own && own.matched / Math.max(1, own.total) >= 0.6)
    return {
      ok: false,
      message: `A fala de ${label} já está na timeline (${own.start!.toFixed(1)} s).`,
    };

  const src = findLine(item.text, transcripts);
  if (!src)
    return {
      ok: false,
      message: `Não achei a fala de ${label} ("${item.text}") em nenhuma mídia transcrita. Importe e transcreva o vídeo do avatar.`,
    };
  const asset = p.assets.find((a) => a.id === src.assetId)!;
  const plan = planInsert(section, alignment, item, src.end - src.start);
  if ("error" in plan) return { ok: false, message: plan.error };

  // Still frames to hold the screen while the timeline is opened.
  const locked = new Set(p.tracks.filter((t) => t.locked).map((t) => t.id));
  const targets = new Set([...cutTargets(p)].filter((id) => !locked.has(id)));
  const stills: { asset: Asset; clip: Clip }[] = [];
  let clips = p.clips;
  if (plan.gap > 0) {
    const opened = openGap(clips, plan.cut, plan.gap, targets, locked);
    if (opened.blocked.length) {
      const names = [
        ...new Set(
          opened.blocked.map((c) => p.tracks.find((t) => t.id === c.trackId)?.name ?? c.trackId),
        ),
      ];
      return {
        ok: false,
        message: `Proposta para ${label}, não aplicada: encaixar em ${clock(plan.cut)} precisa abrir ${plan.gap.toFixed(1)} s na timeline, mas a faixa travada ${names.join(", ")} passa por esse ponto e ficaria fora de sincronia. Destrave a faixa e peça de novo, ou encaixe à mão numa pausa maior.`,
      };
    }
    clips = opened.clips;
    for (const left of opened.split) {
      const a = p.assets.find((x) => x.id === left.assetId);
      const track = p.tracks.find((t) => t.id === left.trackId);
      if (!a || a.kind !== "video" || a.key || track?.kind !== "video") continue;
      const path = await window.api.stillFrame(a.path, sourceEnd(left) - 1 / (a.fps || 30));
      const still: Asset = {
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
      };
      stills.push({
        asset: still,
        clip: {
          id: newId("c"),
          assetId: still.id,
          trackId: left.trackId,
          start: plan.cut,
          in: 0,
          duration: plan.gap,
          volume: 1,
          ...(left.transform ? { transform: left.transform } : {}),
        },
      });
    }
  }

  // The insert must sit above everything on screen while it plays: a free video track above the
  // highest one in use at that moment, or a new track on top.
  let tracks = p.tracks;
  const end = plan.at + plan.duration;
  const all = [...clips, ...stills.map((s) => s.clip)];
  const during = all.filter((c) => c.start < end - 1e-3 && clipEnd(c) > plan.at + 1e-3);
  const busyTracks = new Set(during.map((c) => c.trackId));
  const highestBusy = tracks.findIndex((t) => t.kind === "video" && busyTracks.has(t.id));
  let track = tracks
    .slice(0, highestBusy < 0 ? tracks.length : highestBusy)
    .find((t) => t.kind === "video" && !t.locked);
  if (!track) {
    track = {
      id: newId("t"),
      kind: "video",
      name: newTrackName(tracks),
      muted: false,
      hidden: false,
      locked: false,
    } satisfies Track;
    tracks = [track, ...tracks];
  }
  const clip = insertClip(src, track.id, plan, item.insertId);
  // Another avatar already standing on the right (the narrator) pushes this one to the left.
  const rightTaken = during.some(
    (c) => c.transform && c.transform.x > 0.5 && c.transform.scale < 1.5,
  );
  const portrait = asset.height > asset.width;
  const transform =
    portrait || asset.screen
      ? placementTransform(rightTaken ? "left" : "right")
      : defaultTransformFor(asset, p.settings);
  Object.assign(
    clip,
    { fadeIn: AVATAR_FADE, fadeOut: AVATAR_FADE },
    transform ? { transform } : {},
  );

  return {
    ok: true,
    // Only applied when the project is still the one planned on (placeInsert checks it).
    apply: (q) => ({
      ...q,
      tracks,
      assets: [...q.assets, ...stills.map((s) => s.asset)],
      clips: [...clips, ...stills.map((s) => s.clip), clip],
    }),
    message: `${label} encaixada em ${clock(plan.at)} (${plan.duration.toFixed(1)} s)${plan.gap > 0 ? `; abri ${plan.gap.toFixed(1)} s na timeline${stills.length ? " com a tela parada" : ""}` : " na pausa que já existia"}.`,
  };
}

/** Shows everything said outside the script (false starts, retakes, comments) as a cut proposal. */
export async function proposeOffScript(): Promise<string> {
  const p = useProject.getState().project;
  if (!p) return "Nenhum projeto aberto.";
  // The times come from this state of the project: a change meanwhile makes them stale.
  const revision = useProject.getState().revision;
  const view = await currentView(p);
  if (!view) return "Cole o roteiro na aba Roteiro primeiro.";
  const runs = view.alignment.offScript;
  if (!runs.length) return "Tudo o que foi falado está no roteiro.";
  return showProposal(
    p,
    "Falas fora do roteiro",
    runs.map((r) => ({
      start: r.start,
      end: r.end,
      reason: `fora do roteiro: "${r.text.length > 70 ? `${r.text.slice(0, 70)}…` : r.text}"`,
    })),
    revision,
  );
}
