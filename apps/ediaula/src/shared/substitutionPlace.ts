import { clipEnd, newId } from "./clipTime.ts";
import { presenterTransform } from "./compose.ts";
import { transformAt } from "./keyframes.ts";
import { kidsSpan } from "./kidsEdition.ts";
import type { Clip, Project, Track } from "./types.ts";
import { hasName, isAvatar, roleContext, voiceRoleOf, voiceRuleOn } from "./voiceRule.ts";

/**
 * A line of the kids table ("No kids, silenciar … e substituir pelo áudio do personagem") placed
 * in the lesson itself: the character's stretch of its video (found by the kids edition,
 * Project.kids.pieces) goes over the teacher's line, where her avatar is, on the character's
 * track, and the rule "personagem silencia a professora" (shared/voiceRule.ts) keeps her silent
 * and away while it plays. No pause is looked for and nothing moves.
 */

const EPS = 1e-6;

export interface PlacedSubstitution {
  id: string;
  character: string;
  clipId: string;
  trackName: string;
  start: number;
  end: number;
  /** Seconds the character's line lasts past the teacher's (her next words are silent too). */
  longer: number;
}

export interface SubstitutionResult {
  project: Project;
  placed: PlacedSubstitution[];
  problems: { id: string; why: string }[];
  /** The rule is off: the two voices would speak together. */
  ruleOff: boolean;
}

const free = (p: Project, trackId: string, a: number, b: number): boolean =>
  !p.clips.some((c) => c.trackId === trackId && c.start < b - EPS && clipEnd(c) > a + EPS);

/** Whether `id` is a row of the kids table this lesson knows (found or not). */
export const isSubstitutionId = (p: Pick<Project, "kids">, id: string, rows: readonly string[]) =>
  rows.includes(id) || !!p.kids?.pieces.some((k) => k.id === id);

export function placeSubstitutions(p: Project, ids: readonly string[]): SubstitutionResult {
  let project = p;
  const placed: PlacedSubstitution[] = [];
  const problems: SubstitutionResult["problems"] = [];
  for (const id of ids) {
    const piece = project.kids?.pieces.find((k) => k.id === id);
    if (!piece) {
      problems.push({
        id,
        why: "a fala ainda não foi achada no vídeo do personagem (Voz › Edição kids › Importar vídeos dos personagens, ou Procurar as falas de novo)",
      });
      continue;
    }
    const span = kidsSpan(project, piece);
    if (!span) {
      problems.push({ id, why: "a fala da professora não está mais na timeline (foi cortada)" });
      continue;
    }
    const video = project.assets.find((a) => a.id === piece.assetId);
    if (!video || video.missing) {
      problems.push({ id, why: "o vídeo do personagem não está nesta aula" });
      continue;
    }
    const [a, b] = span;
    const length = Math.max(1 / 30, piece.out - piece.in);
    if (
      project.clips.some(
        (c) =>
          c.assetId === video.id &&
          Math.abs(c.in - piece.in) < 0.05 &&
          c.start < a + length &&
          clipEnd(c) > a,
      )
    ) {
      problems.push({ id, why: "já está na timeline" });
      continue;
    }
    const ctx = roleContext(project);
    // Where her avatar is at that moment, the character comes in, in her place.
    const teacher = project.clips.find((c) => {
      const asset = ctx.assets.get(c.assetId);
      return (
        !!asset &&
        isAvatar(asset, c) &&
        c.start <= a + EPS &&
        clipEnd(c) > a &&
        voiceRoleOf(c, ctx).kind === "teacher"
      );
    });
    const transform = teacher
      ? transformAt(teacher, Math.max(teacher.start, Math.min(a, clipEnd(teacher) - EPS)))
      : presenterTransform(video, project.settings);
    const name = piece.character;
    let tracks = project.tracks;
    let track = tracks.find(
      (t) =>
        t.kind === "video" &&
        !t.locked &&
        ((t.voiceRole?.kind === "character" && hasName(t.voiceRole.name, name)) ||
          (!t.voiceRole && hasName(t.name, name))) &&
        free(project, t.id, a, a + length),
    );
    if (!track) {
      const made: Track = {
        id: newId("t"),
        kind: "video",
        name,
        muted: false,
        hidden: false,
        locked: false,
        voiceRole: { kind: "character", name },
      };
      // Just above the teacher's avatar, so the character shows over her place.
      const at = teacher ? tracks.findIndex((t) => t.id === teacher.trackId) : 0;
      tracks = [...tracks.slice(0, Math.max(0, at)), made, ...tracks.slice(Math.max(0, at))];
      track = made;
    }
    const clip: Clip = {
      id: newId("c"),
      assetId: video.id,
      trackId: track.id,
      start: a,
      in: piece.in,
      duration: length,
      volume: 1,
      ...(transform ? { transform } : {}),
    };
    project = { ...project, tracks, clips: [...project.clips, clip] };
    placed.push({
      id,
      character: name,
      clipId: clip.id,
      trackName: track.name,
      start: a,
      end: a + length,
      longer: Math.max(0, length - (b - a)),
    });
  }
  return { project, placed, problems, ruleOff: !voiceRuleOn(p) };
}
