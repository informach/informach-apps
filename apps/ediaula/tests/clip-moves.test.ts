import assert from "node:assert/strict";
import { test } from "node:test";
import { ALIGN_TOLERANCE, planAlign, planMoves, splitOneClip } from "../src/shared/clipMoves.ts";
import { clipEnd, sourceAt } from "../src/shared/clipTime.ts";
import type { Clip, Project, Track } from "../src/shared/types.ts";

const track = (id: string, extra: Partial<Track> = {}): Track => ({
  id,
  kind: "video",
  name: id,
  muted: false,
  hidden: false,
  locked: false,
  ...extra,
});
const clip = (id: string, trackId: string, start: number, end: number, extra: Partial<Clip> = {}) =>
  ({ id, assetId: id, trackId, start, in: 0, duration: end - start, volume: 1, ...extra }) as Clip;

/** Aula02: the avatar on Faixa 4 is the whole narration joined; the narration has 4 s pauses. */
const NARRATION: [number, number][] = [
  [2.5, 29.2],
  [33.2, 79.5],
  [83.5, 237.6],
  [241.6, 400.1],
  [404.1, 467.7],
];
function aula02(extra: { locked?: boolean } = {}): Pick<Project, "clips" | "tracks"> {
  return {
    tracks: [track("f4", { locked: extra.locked ?? false }), track("narr"), track("tela")],
    clips: [
      clip("avatar", "f4", 2.5, 451.6, {
        assetId: "render",
        transform: { x: 0.8, y: 0.6, scale: 0.4, opacity: 0.9 },
        enter: "fade",
        exit: "pop",
      }),
      ...NARRATION.map(([a, b], i) => clip(`n${i + 1}`, "narr", a, b, { assetId: "voz" })),
      clip("screen", "tela", 0, 500, { assetId: "tela" }),
    ],
  };
}
const near = (a: number, b: number, tol: number) =>
  assert.ok(Math.abs(a - b) <= tol, `${a} difere de ${b} em mais de ${tol}`);
const untouched = (before: Pick<Project, "clips">, after: Pick<Project, "clips">, track: string) =>
  assert.deepEqual(
    after.clips.filter((c) => c.trackId === track),
    before.clips.filter((c) => c.trackId === track),
  );

test("aceitação: align_track_to divide o avatar onde a narração termina e põe cada pedaço no início", () => {
  const p = aula02();
  const plan = planAlign(p, "f4", "narr");
  assert.ok(plan.ok, plan.ok ? "" : plan.error);
  // Dados arredondados ao décimo: as divisões batem com 0:29.2, 1:15.4, 3:49.5 e 6:27.9.
  for (const [got, want] of plan.splits.map((s, i) => [s, [29.2, 75.4, 229.5, 387.9][i]]))
    near(got, want, 0.25);
  const avatar = plan.clips.filter((c) => c.trackId === "f4").sort((a, b) => a.start - b.start);
  assert.equal(avatar.length, 5);
  avatar.forEach((c, i) => {
    near(c.start, NARRATION[i][0], 1e-9);
  });
  near(clipEnd(avatar[4]), 467.6, 0.05);
  // A fala continua: cada pedaço começa na mídia onde o anterior terminou.
  for (let i = 1; i < 5; i++) near(avatar[i].in, avatar[i - 1].in + avatar[i - 1].duration, 1e-9);
  assert.equal(plan.warning, undefined, "a diferença de 0,1 s fica abaixo do limite");
  untouched(p, plan, "narr");
  untouched(p, plan, "tela");
});

test("aceitação: 4 split_clip e um move_clips com +4, +8, +12, +16 dão o mesmo resultado", () => {
  const p = aula02();
  const align = planAlign(p, "f4", "narr");
  assert.ok(align.ok);
  let state = p;
  const ids = ["avatar"];
  for (const at of align.splits) {
    const r = splitOneClip(state, ids[ids.length - 1], at);
    assert.ok(r.ok, r.ok ? "" : r.error);
    state = { ...state, clips: r.clips };
    ids.push(r.second);
  }
  const moved = planMoves(
    state,
    ids.slice(1).map((id, i) => ({ id, delta: 4 * (i + 1) })),
  );
  assert.ok(moved.ok, moved.ok ? "" : moved.error);
  const manual = moved.clips.filter((c) => c.trackId === "f4").sort((a, b) => a.start - b.start);
  const auto = align.clips.filter((c) => c.trackId === "f4").sort((a, b) => a.start - b.start);
  assert.deepEqual(
    manual.map((c) => [c.start, c.in, c.duration]),
    auto.map((c) => [c.start, c.in, c.duration]),
  );
  untouched(p, moved, "narr");
});

test("split_clip: só o clipe pedido; metades com tudo dele, entrada na primeira e saída na segunda", () => {
  const p = aula02();
  p.clips = p.clips.map((c) => (c.id === "avatar" ? { ...c, speed: 2, in: 10, groupId: "g" } : c));
  const r = splitOneClip(p, "avatar", 100);
  assert.ok(r.ok);
  const [a, b] = [r.clips.find((c) => c.id === r.first)!, r.clips.find((c) => c.id === r.second)!];
  assert.equal(a.id, "avatar");
  assert.deepEqual([a.start, clipEnd(a), b.start, clipEnd(b)], [2.5, 100, 100, 451.6]);
  // Com velocidade 2, a segunda metade começa na mídia onde a primeira termina.
  assert.equal(b.in, sourceAt({ ...p.clips[0] }, 100));
  assert.equal(b.in, 10 + (100 - 2.5) * 2);
  for (const half of [a, b]) {
    assert.deepEqual(half.transform, p.clips[0].transform);
    assert.equal(half.speed, 2);
    assert.equal(half.groupId, "g");
  }
  assert.deepEqual([a.enter, a.exit, b.enter, b.exit], ["fade", undefined, undefined, "pop"]);
  assert.equal(r.clips.length, p.clips.length + 1);
  untouched(p, r, "narr");
  assert.equal(splitOneClip(p, "avatar", 500).ok, false);
  assert.equal(splitOneClip(p, "nada", 10).ok, false);
  assert.equal(splitOneClip(aula02({ locked: true }), "avatar", 100).ok, false);
});

test("move_clips: recusa sobreposição e início negativo sem mexer em nada, e diz onde", () => {
  const p = aula02();
  const over = planMoves(p, [{ id: "n2", delta: -10 }]);
  assert.equal(over.ok, false);
  assert.match(over.ok ? "" : over.error, /n2.*sobre o clipe n1.*0:2[3-9]/);
  const negative = planMoves(p, [
    { id: "n1", start: 0 },
    { id: "n1", delta: -3 },
  ]);
  assert.equal(negative.ok, false);
  assert.equal(planMoves(p, [{ id: "n1", delta: -3 }]).ok, false);
  assert.equal(planMoves(p, [{ id: "x", delta: 1 }]).ok, false);
});

test("move_clips: só o estado final vale; clipes podem se cruzar no caminho", () => {
  const p = aula02();
  // n1 e n2 trocam de lugar: no meio do caminho se sobrepõem, no fim não.
  const swap = planMoves(p, [
    { id: "n1", start: 50 }, // n2 (46,3 s) vai para 0:02.5 e termina em 0:48.8
    { id: "n2", start: 2.5 },
  ]);
  assert.ok(swap.ok, swap.ok ? "" : swap.error);
});

test("move_clips: grupos andam juntos; faixa travada fica de fora e é nomeada", () => {
  const p = aula02();
  p.clips = p.clips.map((c) => (c.id === "n5" || c.id === "screen" ? { ...c, groupId: "g" } : c));
  const r = planMoves(p, [{ id: "n5", delta: 1 }]);
  assert.ok(r.ok);
  assert.deepEqual(r.moved.map((m) => m.id).sort(), ["n5", "screen"]);
  const locked = planMoves(
    { ...p, tracks: p.tracks.map((t) => (t.id === "tela" ? { ...t, locked: true } : t)) },
    [{ id: "n5", delta: 1 }],
  );
  assert.ok(locked.ok);
  assert.deepEqual(locked.locked, ["screen"]);
  assert.deepEqual(
    locked.moved.map((m) => m.id),
    ["n5"],
  );
});

test("align_track_to: avisa quando referência e conteúdo diferem, recusa faixa travada e grupo de fora", () => {
  const p = aula02();
  p.clips = p.clips.map((c) => (c.id === "avatar" ? { ...c, duration: c.duration - 2 } : c));
  const plan = planAlign(p, "f4", "narr");
  assert.ok(plan.ok);
  assert.match(plan.warning ?? "", /2\.1 s/);
  assert.ok(ALIGN_TOLERANCE === 0.2);
  assert.equal(planAlign(aula02({ locked: true }), "f4", "narr").ok, false);
  const grouped = aula02();
  grouped.clips = grouped.clips.map((c) =>
    c.id === "avatar" || c.id === "screen" ? { ...c, groupId: "g" } : c,
  );
  const refused = planAlign(grouped, "f4", "narr");
  assert.equal(refused.ok, false);
  assert.match(refused.ok ? "" : refused.error, /desagrupe/);
  assert.equal(planAlign(p, "f4", "f4").ok, false);
  assert.equal(planAlign(p, "x", "narr").ok, false);
});

test("align_track_to: a track already aligned is refused, so a second call never cuts it again", () => {
  const p = aula02();
  const first = planAlign(p, "f4", "narr");
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const again = planAlign({ ...p, clips: first.clips }, "f4", "narr");
  assert.equal(again.ok, false);
  if (again.ok) return;
  assert.match(again.error, /já tem .* s de pausas entre os clipes: ela parece já estar alinhada/);
});

test("move_clips and align_track_to: a magnetic track would pack the result back, so it is refused", () => {
  // Magnetic track M: A 0–5 and B 5–10 packed from 0:00.
  const m = {
    tracks: [track("M", { magnetic: true })],
    clips: [clip("A", "M", 0, 5), clip("B", "M", 5, 10)],
  };
  const moved = planMoves(m, [{ id: "A", start: 20 }]);
  assert.equal(moved.ok, false);
  if (!moved.ok) assert.match(moved.error, /A faixa M é magnética.*A.*não ficaria onde foi pedido/);
  // The avatar on a magnetic track: the pauses given back would be packed away.
  const p = aula02();
  const aligned = planAlign(
    { ...p, tracks: p.tracks.map((t) => (t.id === "f4" ? { ...t, magnetic: true } : t)) },
    "f4",
    "narr",
  );
  assert.equal(aligned.ok, false);
  if (!aligned.ok) assert.match(aligned.error, /f4 é magnética/);
  // Not magnetic: the same move goes through.
  assert.equal(planMoves({ ...m, tracks: [track("M")] }, [{ id: "A", start: 20 }]).ok, true);
});
