import assert from "node:assert/strict";
import { test } from "node:test";
import { captionWords } from "../src/shared/captions.ts";
import { clipEnd } from "../src/shared/clipTime.ts";
import { buildAudioPlan } from "../src/shared/export/audioPlan.ts";
import { gainAt } from "../src/shared/gain.ts";
import { preflight } from "../src/shared/preflight.ts";
import { projectSchema } from "../src/shared/project-schema.ts";
import { placeSubstitutions } from "../src/shared/substitutionPlace.ts";
import type { DerivedClip } from "../src/shared/transitions.ts";
import type { Asset, Clip, Project, Track, Transcript } from "../src/shared/types.ts";
import {
  applyVoiceRule,
  characterSpans,
  nameWords,
  rangeGain,
  roleContext,
  teacherSilence,
  twoVoices,
  voiceRoleOf,
} from "../src/shared/voiceRule.ts";

const asset = (id: string, kind: Asset["kind"], extra: Partial<Asset> = {}): Asset => ({
  id,
  name: id,
  path: `C:/aula/${id}.mp4`,
  kind,
  duration: 600,
  width: kind === "audio" ? 0 : 2160,
  height: kind === "audio" ? 0 : 3840,
  fps: kind === "audio" ? 0 : 30,
  hasVideo: kind !== "audio",
  hasAudio: kind !== "image",
  size: 1,
  proxyStatus: "none",
  ...extra,
});
const track = (id: string, kind: Track["kind"], extra: Partial<Track> = {}): Track => ({
  id,
  kind,
  name: id,
  muted: false,
  hidden: false,
  locked: false,
  ...extra,
});
const clip = (
  id: string,
  assetId: string,
  trackId: string,
  start: number,
  duration: number,
  extra: Partial<Clip> = {},
): Clip => ({ id, assetId, trackId, start, in: 0, duration, volume: 1, ...extra });

/**
 * Aula02 as in the acceptance: Dedé on Faixa 6 from 0:02.5 to 0:15.2; the teacher's voice comes
 * out of her avatar on Faixa 4, the narration (Faixa 2) is muted; the page's sound goes on.
 */
const placed = { x: 0.87, y: 1.15, scale: 1.17, opacity: 1 };
function aula02(extra: Partial<Project> = {}): Project {
  return {
    version: 1,
    id: "aula02",
    name: "Aula02 gravação automática",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    assets: [
      asset("prof", "video", {
        name: "CadeTodoMundoAula02_2160p",
        path: "C:/HEYGENS/CadeTodoMundoAula02_2160p.mp4",
        key: { color: "#0CBB25" } as Asset["key"],
      }),
      asset("dede", "video", {
        name: "CadeTodoMundoAula02Dede_2160p",
        path: "C:/HEYGENS/CadeTodoMundoAula02Dede_2160p.mp4",
        key: { color: "#0CBB25" } as Asset["key"],
        duration: 12.74,
      }),
      asset("narr", "audio", { recording: { id: "r", role: "narration" } }),
      asset("pagina", "audio", { recording: { id: "r", role: "system" } }),
      asset("tela", "video", { recording: { id: "r", role: "screen" }, hasAudio: false }),
      asset("musica", "audio"),
    ],
    tracks: [
      track("f6", "video", { name: "Faixa 6" }),
      track("f4", "video", { name: "Faixa 4" }),
      track("f3", "video", { name: "Faixa 3" }),
      track("f2", "audio", { name: "Narração guiada", muted: true }),
      track("f1", "audio", { name: "Som da página" }),
      track("m", "audio", { name: "Música", music: true }),
    ],
    clips: [
      clip("dede1", "dede", "f6", 2.5, 12.74, { transform: placed }),
      clip("prof1", "prof", "f4", 2.5, 18.1, { transform: placed }),
      clip("prof2", "prof", "f4", 33.23, 31.27, { in: 26.71, transform: placed }),
      clip("tela1", "tela", "f3", 0, 80),
      clip("narr1", "narr", "f2", 2.5, 26.71),
      clip("pag1", "pagina", "f1", 0, 80),
      clip("mus1", "musica", "m", 0, 80, { volume: 0.3 }),
    ],
    ...extra,
  };
}
const DEDE: [number, number] = [2.5, 15.24];
const byId = (p: Project, id: string): DerivedClip | undefined =>
  p.clips.find((c) => c.id === id) as DerivedClip | undefined;

test("roles: the teacher, Dedé by the file name, nobody for the page's sound and the music", () => {
  const p = aula02();
  const ctx = roleContext(p);
  const role = (id: string) => {
    const c = p.clips.find((x) => x.id === id);
    assert.ok(c);
    return voiceRoleOf(c, ctx);
  };
  assert.deepEqual(role("dede1"), { kind: "character", name: "Dedé" });
  assert.deepEqual(role("prof1"), { kind: "teacher" });
  assert.deepEqual(role("narr1"), { kind: "teacher" });
  assert.deepEqual(role("tela1"), { kind: "teacher" });
  assert.deepEqual(role("pag1"), { kind: "none" });
  assert.deepEqual(role("mus1"), { kind: "none" });
  assert.deepEqual(nameWords("CadeTodoMundoAula02Dede_2160p"), [
    "cade",
    "todo",
    "mundo",
    "aula",
    "02",
    "dede",
    "2160",
    "p",
  ]);
  // "Debinha" in a track name, a role set by hand, and a character named in the script's table.
  const named = aula02({
    tracks: aula02().tracks.map((t) => (t.id === "f6" ? { ...t, name: "Debinha" } : t)),
    assets: aula02().assets.map((a) =>
      a.id === "dede" ? { ...a, name: "outro", path: "C:/x/outro.mp4" } : a,
    ),
  });
  const c = named.clips[0];
  assert.deepEqual(voiceRoleOf(c, roleContext(named)), { kind: "character", name: "Debinha" });
  const byHand = aula02({
    assets: aula02().assets.map((a) =>
      a.id === "pagina" ? { ...a, voiceRole: { kind: "teacher" } } : a,
    ),
  });
  const pag = byHand.clips.find((x) => x.id === "pag1") as Clip;
  assert.deepEqual(voiceRoleOf(pag, roleContext(byHand)), { kind: "teacher" });
  const scripted = aula02({
    script: {
      text: "## Parte 1\n\n**Substituições na edição kids:**\n\n| ID | Personagem | Ocorrência | Âncora anterior | Fala exata substituída | Âncora posterior | Tags |\n| --- | --- | --- | --- | --- | --- | --- |\n| a-K1 | Zezé | 1 | antes | Oi, gente! | depois | |\n",
    },
    assets: aula02().assets.map((a) =>
      a.id === "dede" ? { ...a, name: "ZezeFala", path: "C:/x/ZezeFala.mp4" } : a,
    ),
  });
  assert.deepEqual(voiceRoleOf(scripted.clips[0], roleContext(scripted)), {
    kind: "character",
    name: "Zezé",
  });
});

test("rule on: the teacher silent from 0:02.5 to 0:15.2 and her avatar fades; outside nothing changes", () => {
  const p = aula02();
  assert.deepEqual(teacherSilence(p), [DEDE]);
  const heard = applyVoiceRule(p);
  // Her avatar's sound: silent over Dedé, with a 0.05 s ramp after, back to full right after.
  // Her avatar: the piece over Dedé is gone, so what is left is a piece cut from prof1.
  assert.equal(byId(heard, "prof1"), undefined);
  // The picture: the piece of 0:02.5–0:15.2 is gone, the rest comes back with a 0.2 s fade.
  const pieces = heard.clips.filter((c) => c.trackId === "f4").sort((a, b) => a.start - b.start);
  assert.deepEqual(
    pieces.map((c) => [Math.round(c.start * 100) / 100, Math.round(clipEnd(c) * 100) / 100]),
    [
      [15.24, 20.6],
      [33.23, 64.5],
    ],
  );
  assert.equal(pieces[0].enter, "fade");
  assert.equal((pieces[0] as DerivedClip).sourceId, "prof1", "the preview moves prof1 through it");
  assert.equal(pieces[0].fadeIn, 0.2);
  assert.equal(pieces[0].in, 15.24 - 2.5, "the piece goes on where the source is");
  assert.equal(gainAt(pieces[0].gain, 0), 0, "still silent at its very start");
  assert.ok(gainAt(pieces[0].gain, 0.05) > 0.99, "back to full after the 0.05 s ramp");
  // The narration is muted anyway; its envelope is silent over Dedé too.
  const narr = byId(heard, "narr1");
  assert.equal(gainAt(narr?.gain, 5 - 2.5), 0);
  assert.equal(gainAt(narr?.gain, 16 - 2.5), 1);
  // Dedé, the screen, the page's sound, the music and the second avatar clip: as they were.
  for (const id of ["dede1", "tela1", "pag1", "mus1", "prof2"])
    assert.deepEqual(byId(heard, id), byId(p, id), id);
  // The lesson itself is not touched.
  assert.deepEqual(p, aula02());
  // Saved and opened again, the setting is kept.
  const off = aula02({ voiceRule: { enabled: false, picture: "freeze" } });
  const saved = projectSchema.parse({ ...off, assets: [], tracks: [], clips: [] });
  assert.deepEqual(saved.voiceRule, { enabled: false, picture: "freeze" });
  assert.equal(
    projectSchema.safeParse({
      ...off,
      assets: [],
      tracks: [],
      clips: [],
      voiceRule: { picture: "x" },
    }).success,
    false,
  );
});

test("rule: it follows the character's clip, and off gives the original volume back", () => {
  const moved = aula02({
    clips: aula02().clips.map((c) => (c.id === "dede1" ? { ...c, start: 60 } : c)),
  });
  assert.deepEqual(teacherSilence(moved), [[60, 72.74]]);
  const heard = applyVoiceRule(moved);
  // prof1 (2.5–20.6) is whole again; prof2 (33.23–64.5) loses its end from 60 on.
  assert.deepEqual(byId(heard, "prof1"), byId(moved, "prof1"));
  const second = heard.clips.filter((c) => c.trackId === "f4" && c.start > 30);
  assert.equal(second.length, 1);
  assert.ok(Math.abs(clipEnd(second[0]) - 60) < 1e-9);
  assert.equal(second[0].exit, "fade");
  assert.equal(second[0].fadeOut, 0.2);
  // Off: the lesson as it is.
  const off = aula02({ voiceRule: { enabled: false } });
  assert.equal(applyVoiceRule(off), off);
  assert.deepEqual(teacherSilence(off), []);
  // A muted character track silences no one.
  const quiet = aula02({
    tracks: aula02().tracks.map((t) => (t.id === "f6" ? { ...t, muted: true } : t)),
  });
  assert.deepEqual(teacherSilence(quiet), []);
});

test("rule: freeze holds the frame where she stops; keep only silences", () => {
  const p = aula02({
    clips: aula02().clips.map((c) => (c.id === "dede1" ? { ...c, start: 5 } : c)),
    voiceRule: { picture: "freeze" },
  });
  const frozen = applyVoiceRule(p).clips.filter((c) => c.trackId === "f4") as DerivedClip[];
  const head = frozen.find((c) => c.id === "prof1");
  assert.ok(head);
  assert.equal(head.start, 2.5);
  assert.ok(Math.abs(clipEnd(head) - 17.74) < 1e-9, "runs over the silence");
  assert.ok(Math.abs((head.tail ?? 0) - 12.74) < 1e-9);
  assert.ok(Math.abs((head.sourceStop ?? 0) - 2.5) < 1e-9, "holding the source second 2.5");
  assert.equal(head.exit, undefined);
  const keep = applyVoiceRule({ ...p, voiceRule: { picture: "keep" } });
  const kept = keep.clips.filter((c) => c.trackId === "f4");
  assert.equal(kept.length, 2, "no piece taken out");
  assert.equal(gainAt(kept[0].gain, 6 - 2.5), 0);
});

test("set_volume's stretch: the level inside, a 0.05 s ramp outside, the rest as it was", () => {
  const g = rangeGain(undefined, 10, 12, -60);
  assert.equal(gainAt(g, 9.9), 1);
  assert.equal(gainAt(g, 10), 0);
  assert.equal(gainAt(g, 11), 0);
  assert.equal(gainAt(g, 12.06), 1);
  // Over an envelope: the level around the stretch is kept.
  const half = rangeGain([{ t: 0, db: -6 }], 10, 12, -60);
  assert.ok(Math.abs(gainAt(half, 5) - 10 ** (-6 / 20)) < 1e-9);
  assert.ok(Math.abs(gainAt(half, 13) - 10 ** (-6 / 20)) < 1e-9);
});

test("captions and the export: the teacher's words under Dedé are not heard nor written", () => {
  const p = aula02({
    tracks: aula02().tracks.map((t) => (t.id === "f2" ? { ...t, muted: false } : t)),
    // The narration from 0:00 here, so a word of second 1 is before Dedé.
    clips: aula02()
      .clips.filter((c) => c.id !== "prof1" && c.id !== "prof2")
      .map((c) => (c.id === "narr1" ? { ...c, start: 0, duration: 30 } : c)),
    assets: aula02().assets.map((a) =>
      a.id === "narr" ? { ...a, transcript: "t", transcriptStatus: "ready" as const } : a,
    ),
  });
  const words = (text: string, start: number) => ({ text, start, end: start + 0.4 });
  const transcript = {
    language: "pt",
    words: [words("antes", 1), words("durante", 5), words("depois", 16)],
  } as unknown as Transcript;
  const said = captionWords(p, new Map([["narr", transcript]])).map((w) => w.text);
  assert.deepEqual(said, ["antes", "depois"]);
  const off = captionWords(
    { ...p, voiceRule: { enabled: false } },
    new Map([["narr", transcript]]),
  );
  assert.deepEqual(
    off.map((w) => w.text),
    ["antes", "durante", "depois"],
  );
  // The audio plan of the lesson as exported silences the narration with its envelope.
  const plan = buildAudioPlan(applyVoiceRule(p), {});
  assert.match(plan.filter, /volume='if\(lte\(/);
});

test("check_before_export: two voices are an error with the rule off, fixed by silencing the teacher", () => {
  const off = aula02({ voiceRule: { enabled: false } });
  const both = twoVoices(off);
  assert.equal(both.length, 1);
  assert.equal(both[0].character, "Dedé");
  assert.equal(both[0].teacherClip, "prof1");
  const finding = preflight(off).find((f) => f.kind === "two-voices");
  assert.equal(finding?.severity, "error");
  assert.equal(finding?.fix?.action, "silence-teacher");
  assert.equal(finding?.fix?.label, "Silenciar a professora");
  assert.deepEqual(twoVoices(aula02()), []);
  assert.ok(!preflight(aula02()).some((f) => f.kind === "two-voices"));
  assert.deepEqual(
    characterSpans(aula02()).map((s) => [s.name, s.start]),
    [["Dedé", 2.5]],
  );
});

test("place_insert with a row of the kids table: Dedé over the teacher's line, where her avatar is", () => {
  const p = aula02({
    clips: aula02().clips.filter((c) => c.id !== "dede1"),
    kids: {
      videos: ["dede"],
      pieces: [
        {
          id: "video-a2-retomada-K1",
          character: "Dedé",
          assetId: "dede",
          in: 4,
          out: 6.5,
          voice: { assetId: "narr", from: 40, to: 42 },
        },
      ],
    },
    clips2: undefined,
  } as Partial<Project>);
  // The teacher says it at source 40–42 of the narration (clip from 2.5, in 0): timeline 42.5.
  const narr = { ...(p.clips.find((c) => c.id === "narr1") as Clip), duration: 60 };
  const lesson = { ...p, clips: p.clips.map((c) => (c.id === "narr1" ? narr : c)) };
  const r = placeSubstitutions(lesson, ["video-a2-retomada-K1", "nao-existe"]);
  assert.equal(r.placed.length, 1);
  assert.equal(r.problems[0].id, "nao-existe");
  const put = r.project.clips.find((c) => c.id === r.placed[0].clipId);
  assert.ok(put);
  assert.equal(put.start, 42.5);
  assert.deepEqual([put.in, put.duration], [4, 2.5]);
  assert.deepEqual(put.transform, placed, "where her avatar is");
  const tr = r.project.tracks.find((t) => t.id === put.trackId);
  assert.deepEqual(tr?.voiceRole, { kind: "character", name: "Dedé" });
  // Right above the teacher's track, and the rule silences her there.
  const order = r.project.tracks.map((t) => t.id);
  assert.equal(order.indexOf(put.trackId) + 1, order.indexOf("f4"));
  assert.deepEqual(teacherSilence(r.project), [[42.5, 45]]);
  // Nothing else moved.
  assert.deepEqual(
    r.project.clips.filter((c) => c.id !== put.id),
    lesson.clips,
  );
  // Placed again: refused as already there.
  assert.equal(placeSubstitutions(r.project, ["video-a2-retomada-K1"]).placed.length, 0);
});
