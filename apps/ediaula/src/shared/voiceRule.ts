import { clipEnd, sourceAt } from "./clipTime.ts";
import { GAIN_MAX_DB, GAIN_MIN_DB, type GainPoint, gainAt, gainDbAt } from "./gain.ts";
import { fold } from "./phrase.ts";
import { piece } from "./pieces.ts";
import { parseScript } from "./script.ts";
import { isSfxTrack } from "./sfxTrack.ts";
import type { DerivedClip } from "./transitions.ts";
import type { Asset, Clip, Project, TeacherPicture, Track, VoiceRole } from "./types.ts";

/**
 * "Personagem silencia a professora": two voices never speak at once. Characters such as Dedé
 * and Debinha come in on clips of their own (avatars rendered with the background removed);
 * while any of them plays, every source of the teacher's voice is silent over that stretch (the
 * narration, the sound of her avatar's clip, the voice of a screen recording), with a 0.05 s
 * ramp at each edge, and her avatar's picture fades away for it (or holds a frame, or stays). The
 * page's sound and the music go on (the music already steps aside for any voice).
 *
 * Nothing of it is written in the lesson: applyVoiceRule works it out from the clips as they are,
 * like the transitions, for the preview and for the export. Moving a character's clip moves the
 * silence with it, cutting it shortens it, turning the rule off (Project.voiceRule) gives the
 * teacher back her own volume, and undo has nothing extra to undo.
 */

export const DEFAULT_CHARACTERS = ["Dedé", "Debinha"] as const;
/** Seconds of the ramp at each edge of a silence (no click). */
export const VOICE_RAMP = 0.05;
/** Seconds the teacher's avatar takes to fade away and back. */
export const PICTURE_FADE = 0.2;
/** Two voices at once for longer than this is an error for check_before_export. */
export const TWO_VOICES_LIMIT = 0.3;

const EPS = 1e-6;
const NONE: VoiceRole = { kind: "none" };
const TEACHER: VoiceRole = { kind: "teacher" };
/** Speakers that are the teacher, whatever the script calls her. */
const TEACHER_WORDS = new Set(["professora", "professor", "apresentadora", "apresentador"]);

/** The words of a name or a file name: camel case and digits apart, lower case, no accents. */
export function nameWords(s: string): string[] {
  return s
    .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{L})(\p{N})/gu, "$1 $2")
    .replace(/(\p{N})(\p{L})/gu, "$1 $2")
    .split(/[^\p{L}\p{N}]+/u)
    .map(fold)
    .filter(Boolean);
}

/** Whether the words of `name` come one after another in `text`. */
export function hasName(text: string, name: string): boolean {
  const words = nameWords(text);
  const wanted = nameWords(name);
  if (!wanted.length) return false;
  for (let i = 0; i + wanted.length <= words.length; i++)
    if (wanted.every((w, k) => words[i + k] === w)) return true;
  return false;
}

/** The characters of a lesson and who says each avatar line of its script. */
export interface Cast {
  /** Display names, the script's first (from the kids table and the avatar speakers). */
  names: string[];
  /** Insert id → speaker. */
  speakers: Map<string, string>;
}

let castCache: { text: string | undefined; cast: Cast } | null = null;

/** The characters of the lesson: the script's (kids table, avatar speakers) and Dedé, Debinha. */
export function castOf(p: Pick<Project, "script">): Cast {
  const text = p.script?.text;
  if (castCache && castCache.text === text) return castCache.cast;
  const names = new Map<string, string>();
  const speakers = new Map<string, string>();
  const add = (name: string): void => {
    const key = nameWords(name).join(" ");
    if (key && !TEACHER_WORDS.has(key) && !names.has(key)) names.set(key, name.trim());
  };
  if (text) {
    try {
      for (const section of parseScript(text).sections) {
        for (const row of section.substitutions ?? []) add(row.character);
        for (const item of section.items) {
          if (item.kind !== "speech") continue;
          if (item.avatar) add(item.speaker);
          if (item.insertId) speakers.set(item.insertId, item.speaker);
        }
      }
    } catch {
      // A script that cannot be read names no one; the default characters still count.
    }
  }
  for (const name of DEFAULT_CHARACTERS) add(name);
  const cast = { names: [...names.values()], speakers };
  castCache = { text, cast };
  return cast;
}

/** The character named in `text`, if any. */
const characterIn = (text: string, cast: Cast): string | undefined =>
  cast.names.find((name) => hasName(text, name));

const fileName = (path: string): string => path.split(/[\\/]/).pop() ?? path;

/** What the role of a clip is worked out from, made once per lesson. */
export interface RoleContext {
  tracks: Map<string, Track>;
  assets: Map<string, Asset>;
  cast: Cast;
  /** The characters' videos of the kids edition. */
  kids: Map<string, string>;
}

export function roleContext(p: Project): RoleContext {
  return {
    tracks: new Map(p.tracks.map((t) => [t.id, t])),
    assets: new Map(p.assets.map((a) => [a.id, a])),
    cast: castOf(p),
    kids: new Map((p.kids?.pieces ?? []).map((k) => [k.assetId, k.character])),
  };
}

/** A video of someone talking to the camera: an avatar or the presenter. */
export const isAvatar = (a: Asset, c: Pick<Clip, "insertId">): boolean =>
  a.kind === "video" &&
  !a.generated &&
  !!(a.key || a.screen || a.alpha || a.origin === "presenter" || c.insertId);

/**
 * Whose voice a clip is. Set by hand on its media or its track first; otherwise: music, sound
 * effects and the clicks are nobody's; an avatar line placed from the script is its speaker's; a
 * media, file or track with a character's name is that character's; the page's sound and the
 * drawing are nobody's; the narration, the microphone, the camera and the screen recording are
 * the teacher's, as any other sound file and the teacher's avatar; a plain video is nobody's.
 */
export function voiceRoleOf(c: Clip, ctx: RoleContext): VoiceRole {
  const asset = ctx.assets.get(c.assetId);
  const track = ctx.tracks.get(c.trackId);
  if (!asset || !track) return NONE;
  if (asset.voiceRole) return asset.voiceRole;
  if (track.voiceRole) return track.voiceRole;
  if (asset.kind === "image" || c.annotation || c.zoomLayer) return NONE;
  if (track.music || track.clicks || isSfxTrack(track)) return NONE;
  const speaker = c.insertId ? ctx.cast.speakers.get(c.insertId) : undefined;
  if (speaker) {
    const name = characterIn(speaker, ctx.cast);
    return name ? { kind: "character", name } : TEACHER;
  }
  const kid = ctx.kids.get(asset.id);
  const named =
    (kid && characterIn(kid, ctx.cast)) ??
    characterIn(asset.name, ctx.cast) ??
    characterIn(fileName(asset.path), ctx.cast) ??
    characterIn(track.name, ctx.cast);
  if (named) return { kind: "character", name: named };
  const recorded = asset.recording?.role;
  if (recorded === "system" || recorded === "drawing") return NONE;
  if (recorded) return TEACHER;
  if (asset.kind === "audio") return TEACHER;
  return isAvatar(asset, c) ? TEACHER : NONE;
}

/** "professora", "personagem: Dedé" or "nenhum", as the tools and the overview say it. */
export const roleLabel = (r: VoiceRole): string =>
  r.kind === "teacher" ? "professora" : r.kind === "character" ? `personagem: ${r.name}` : "nenhum";

/** Whether a clip is heard: its track on, its volume above 0, its media with sound. */
function audible(c: Clip, ctx: RoleContext): boolean {
  const asset = ctx.assets.get(c.assetId);
  const track = ctx.tracks.get(c.trackId);
  return !!asset?.hasAudio && !!track && !track.muted && c.volume > 0 && !c.mutedFor;
}

/** Where a character speaks: each heard clip of a character. */
export interface CharacterSpan {
  start: number;
  end: number;
  clipId: string;
  name: string;
}

export function characterSpans(p: Project, ctx = roleContext(p)): CharacterSpan[] {
  const out: CharacterSpan[] = [];
  for (const c of p.clips) {
    const role = voiceRoleOf(c, ctx);
    if (role.kind === "character" && audible(c, ctx))
      out.push({ start: c.start, end: clipEnd(c), clipId: c.id, name: role.name });
  }
  return out.sort((a, b) => a.start - b.start);
}

export const voiceRuleOn = (p: Pick<Project, "voiceRule">): boolean =>
  p.voiceRule?.enabled !== false;
export const teacherPicture = (p: Pick<Project, "voiceRule">): TeacherPicture =>
  p.voiceRule?.picture ?? "fade";

/** The stretches the teacher is silent in (merged), none when the rule is off. */
export function teacherSilence(p: Project, ctx = roleContext(p)): [number, number][] {
  if (!voiceRuleOn(p)) return [];
  const out: [number, number][] = [];
  for (const s of characterSpans(p, ctx)) {
    const last = out[out.length - 1];
    // Closer than two ramps, the two silences are one.
    if (last && s.start - last[1] < 2 * VOICE_RAMP) last[1] = Math.max(last[1], s.end);
    else out.push([s.start, s.end]);
  }
  return out;
}

/**
 * `points` (a clip's envelope, seconds from its start) with `db` from `from` to `to`, reached by a
 * ramp of `ramp` seconds outside each edge: the level before and after stays as it was.
 */
export function rangeGain(
  points: readonly GainPoint[] | undefined,
  from: number,
  to: number,
  db: number,
  ramp = VOICE_RAMP,
): GainPoint[] {
  const list = points ?? [];
  const level = Math.min(GAIN_MAX_DB, Math.max(GAIN_MIN_DB, db));
  const before = gainDbAt(list, from - ramp);
  const after = gainDbAt(list, to + ramp);
  const kept = list.filter((p) => p.t < from - ramp - EPS || p.t > to + ramp + EPS);
  return [
    ...kept,
    { t: from - ramp, db: before },
    { t: from, db: level },
    { t: to, db: level },
    { t: to + ramp, db: after },
  ].sort((a, b) => a.t - b.t);
}

/**
 * The stretches (seconds from the clip's start, within `duration`) where an envelope holds a
 * level other than 0 dB: what get_overview tells about a clip's volume by parts.
 */
export function gainStretches(
  points: readonly GainPoint[] | undefined,
  duration: number,
): { from: number; to: number; db: number }[] {
  if (!points?.length) return [];
  const list = [...points].sort((a, b) => a.t - b.t);
  const raw: { from: number; to: number; db: number }[] = [];
  const flat = (from: number, to: number, db: number): void => {
    const a = Math.max(0, from);
    const b = Math.min(duration, to);
    if (b - a > 1e-3 && Math.abs(db) > 1e-6) raw.push({ from: a, to: b, db });
  };
  flat(Number.NEGATIVE_INFINITY, list[0].t, list[0].db);
  for (let i = 1; i < list.length; i++)
    if (Math.abs(list[i].db - list[i - 1].db) < 1e-6) flat(list[i - 1].t, list[i].t, list[i].db);
  const last = list[list.length - 1];
  flat(last.t, Number.POSITIVE_INFINITY, last.db);
  const out: typeof raw = [];
  for (const s of raw) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.db - s.db) < 1e-6 && s.from - prev.to < 1e-3) prev.to = s.to;
    else out.push({ ...s });
  }
  return out;
}

/** The teacher's clip without its picture over `spans` (fading, or holding a frame). */
function hidePicture(c: Clip, spans: [number, number][], mode: TeacherPicture): DerivedClip[] {
  const out: DerivedClip[] = [];
  const end = clipEnd(c);
  let from = c.start;
  let k = 0;
  const idOf = (start: number): string =>
    Math.abs(start - c.start) < EPS ? c.id : `${c.id}~${++k}`;
  // A piece other than the clip itself says which clip it was cut from (the preview moves that).
  const own = (p: DerivedClip): DerivedClip => (p.id === c.id ? p : { ...p, sourceId: c.id });
  for (const [a0, b0] of spans) {
    const a = Math.max(a0, c.start);
    const b = Math.min(b0, end);
    if (a - from > EPS) {
      const before: DerivedClip = { ...piece(c, from, a, { tail: false }), id: idOf(from) };
      if (from > c.start + EPS && mode === "fade") {
        before.enter = "fade";
        before.fadeIn = Math.min(PICTURE_FADE, (a - from) / 2);
      }
      if (mode === "freeze") {
        // The last frame before the silence holds until it ends (export: sourceStop; preview too).
        before.sourceStop = sourceAt(c, a);
        before.tail = b - a;
        before.duration = b - from;
      } else {
        before.exit = "fade";
        before.fadeOut = Math.min(PICTURE_FADE, (a - from) / 2);
      }
      out.push(own(before));
    }
    from = Math.max(from, b);
  }
  if (end - from > EPS) {
    const after: DerivedClip = { ...piece(c, from, end), id: idOf(from) };
    if (from > c.start + EPS && mode === "fade") {
      after.enter = "fade";
      after.fadeIn = Math.min(PICTURE_FADE, (end - from) / 2);
    }
    out.push(own(after));
  }
  return out;
}

/**
 * The lesson as it sounds and shows with the rule: each clip of the teacher's voice silent while a
 * character speaks, and her avatar's picture away (Project.voiceRule.picture). The same lesson
 * when the rule is off or no character plays. For the preview and the export only.
 */
export function applyVoiceRule(p: Project): Project {
  if (!voiceRuleOn(p)) return p;
  const ctx = roleContext(p);
  const spans = teacherSilence(p, ctx);
  if (!spans.length) return p;
  const mode = teacherPicture(p);
  let changed = false;
  const clips: Clip[] = [];
  for (const c of p.clips) {
    const end = clipEnd(c);
    const over = spans.filter(([a, b]) => a < end - EPS && b > c.start + EPS);
    if (!over.length || voiceRoleOf(c, ctx).kind !== "teacher") {
      clips.push(c);
      continue;
    }
    changed = true;
    const asset = ctx.assets.get(c.assetId) as Asset;
    let silent = c;
    if (asset.hasAudio) {
      let gain = c.gain;
      for (const [a, b] of over) gain = rangeGain(gain, a - c.start, b - c.start, GAIN_MIN_DB);
      silent = { ...c, gain };
    }
    const track = ctx.tracks.get(c.trackId);
    const shows =
      mode !== "keep" &&
      track?.kind === "video" &&
      asset.hasVideo &&
      !c.soundOnly &&
      isAvatar(asset, c);
    if (shows) clips.push(...hidePicture(silent, over, mode));
    else clips.push(silent);
  }
  return changed ? { ...p, clips } : p;
}

/** Two voices at once: a character and the teacher heard together (after the rule). */
export interface TwoVoices {
  start: number;
  end: number;
  /** Seconds both are heard. */
  seconds: number;
  character: string;
  characterClip: string;
  teacherClip: string;
}

/**
 * Where a character and the teacher are heard together for more than TWO_VOICES_LIMIT, on the
 * lesson as the rule leaves it (none while the rule is on and the roles are right).
 */
export function twoVoices(p: Project): TwoVoices[] {
  const ctx = roleContext(p);
  const heard = applyVoiceRule(p);
  const heardCtx = roleContext(heard);
  const teacher = heard.clips.filter(
    (c) => audible(c, heardCtx) && voiceRoleOf(c, heardCtx).kind === "teacher",
  );
  const out: TwoVoices[] = [];
  const step = 0.02;
  for (const s of characterSpans(p, ctx))
    for (const c of teacher) {
      const a = Math.max(s.start, c.start);
      const b = Math.min(s.end, clipEnd(c));
      if (b - a <= TWO_VOICES_LIMIT) continue;
      let seconds = 0;
      for (let t = a + step / 2; t < b; t += step)
        if (gainAt(c.gain, t - c.start) > 0.05) seconds += step;
      if (seconds > TWO_VOICES_LIMIT)
        out.push({
          start: a,
          end: b,
          seconds,
          character: s.name,
          characterClip: s.clipId,
          teacherClip: c.id,
        });
    }
  return out.sort((x, y) => x.start - y.start);
}
