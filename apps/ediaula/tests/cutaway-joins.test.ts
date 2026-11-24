import assert from "node:assert/strict";
import { test } from "node:test";
import { clipOf, placeCutaway } from "../src/shared/clipEdits.ts";
import { clipEnd, sourceEnd } from "../src/shared/clipTime.ts";
import {
  CUTAWAY_JOIN,
  closeSlivers,
  findSlivers,
  joinPresenterFlash,
  presenterFlashes,
} from "../src/shared/cutawayJoins.ts";
import type { Asset, Clip, Project, Track } from "../src/shared/types.ts";

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
const asset = (id: string, duration: number, extra: Partial<Asset> = {}) =>
  ({
    id,
    name: id,
    path: `C:/${id}`,
    kind: "video",
    duration,
    hasAudio: true,
    hasVideo: true,
    width: 1920,
    height: 1080,
    fps: 30,
    ...extra,
  }) as Asset;
const settings = { width: 1920, height: 1080, fps: 30 } as Project["settings"];
const circles = { kind: "colorcircles" as const, duration: 0.6 };

/** Clips of a track in order, as [id, start, end]. */
const onTrack = (clips: readonly Clip[], trackId: string) =>
  clips
    .filter((c) => c.trackId === trackId)
    .sort((a, b) => a.start - b.start)
    .map((c) => [c.id, +c.start.toFixed(3), +clipEnd(c).toFixed(3)] as const);

/** Nothing on the track overlaps and nothing is left uncovered from `from` to `to`. */
function covered(clips: readonly Clip[], trackId: string, from: number, to: number): void {
  let reach = from;
  for (const [id, start, end] of onTrack(clips, trackId)) {
    if (end <= from || start >= to) continue;
    assert.ok(Math.abs(start - reach) < 1e-6, `${id} começa em ${start}, não em ${reach}`);
    reach = end;
  }
  assert.ok(reach >= to - 1e-6, `coberto só até ${reach}`);
}

/**
 * Jardim Aula01 Parte 1, como ficou: três animações de conceito seguidas na faixa da tela, com
 * um quadro vazio e um vão de 2 ms entre elas, o som da página picado nas sobras e a
 * apresentadora cortada em pedaços de 0,3–0,4 s.
 */
function jardim(): Project {
  return {
    settings,
    tracks: [
      track("apres"),
      track("tela"),
      track("narr", { kind: "audio" }),
      track("pagina", { kind: "audio" }),
    ],
    assets: [
      asset("tela", 86.53),
      asset("heygen", 86.48, { key: { color: "#00A020" } } as Partial<Asset>),
      asset("c1", 13.2),
      asset("c2", 9.666),
      asset("c3", 7.366),
      asset("som", 86.519),
      asset("narracao", 86.52),
    ],
    clips: [
      clip("tela0", "tela", 30, 46.51, { assetId: "tela", in: 29.89 }),
      clip("conc1", "tela", 46.51, 60.01, { assetId: "c1", speed: 0.9778, transition: circles }),
      clip("conc2", "tela", 60.043, 70.108, { assetId: "c2", speed: 0.9604, transition: circles }),
      clip("conc3", "tela", 70.11, 77.476, { assetId: "c3", transition: circles }),
      clip("tela1", "tela", 77.476, 86.643, { assetId: "tela", in: 77.366, transition: circles }),
      clip("pag0", "pagina", 30, 46.51, { assetId: "som", in: 29.89 }),
      clip("pag1", "pagina", 59.71, 60.043, { assetId: "som", in: 59.6 }),
      clip("pag2", "pagina", 69.709, 70.11, { assetId: "som", in: 69.599 }),
      clip("pag3", "pagina", 77.476, 86.629, { assetId: "som", in: 77.366 }),
      clip("narr", "narr", 40.277, 86.608, { assetId: "narracao", in: 40.187 }),
      clip("ap1", "apres", 46.51, 59.71, { assetId: "heygen", in: 46.4 }),
      clip("ap2", "apres", 59.71, 60.04, {
        assetId: "heygen",
        in: 59.6,
        transition: { kind: "dissolve", duration: 0.3 },
      }),
      clip("ap3", "apres", 60.04, 69.71, {
        assetId: "heygen",
        in: 59.93,
        transition: { kind: "dissolve", duration: 0.3 },
      }),
      clip("ap4", "apres", 69.71, 70.11, {
        assetId: "heygen",
        in: 69.6,
        transition: { kind: "dissolve", duration: 0.3 },
      }),
      clip("ap5", "apres", 70.11, 77.55, {
        assetId: "heygen",
        in: 70,
        transition: { kind: "dissolve", duration: 0.3 },
      }),
    ],
  } as unknown as Project;
}

test("Jardim: as animações seguidas se encostam, sem quadro preto nem som da página no meio", () => {
  const p = jardim();
  const found = findSlivers(p);
  assert.deepEqual(
    found.map((s) => [s.pieceId, s.beforeId, s.afterId]),
    [
      [null, "conc1", "conc2"],
      [null, "conc2", "conc3"],
    ],
  );
  // The page sound left under the animations goes with them.
  assert.ok(found[0]!.companions.includes("pag1"));
  assert.ok(found[1]!.companions.includes("pag2"));
  assert.ok(found.every((s) => !s.companions.some((id) => ["pag0", "pag3", "narr"].includes(id))));
  // Less than a frame each: no held picture is needed, the animation runs that much slower.
  const r = closeSlivers(p, found, () => assert.fail("nenhum quadro parado é preciso"));
  assert.equal(r.closed.length, 2);
  assert.equal(r.slowed.length, 0);
  covered(r.clips, "tela", 46.51, 86.643);
  for (const id of ["conc1", "conc2"]) {
    const c = r.clips.find((x) => x.id === id)!;
    const a = p.assets.find((x) => x.id === c.assetId)!;
    assert.ok((c.speed ?? 1) >= CUTAWAY_JOIN.minSpeed);
    // The whole animation still plays, not a frame past its end.
    assert.ok(Math.abs(sourceEnd(c) - a.duration) < 0.01, `${id}: ${sourceEnd(c)}`);
  }
  assert.ok(!r.clips.some((c) => c.id === "pag1" || c.id === "pag2"));
  // One transition per change: each animation's own entrance, nothing in between.
  const withTransition = r.clips
    .filter((c) => c.trackId === "tela" && c.transition)
    .map((c) => c.id);
  assert.deepEqual(withTransition, ["conc1", "conc2", "conc3", "tela1"]);
  assert.deepEqual(findSlivers({ ...p, clips: r.clips }), []);
});

test("Jardim: a apresentadora não fica com pedaços de menos de 1 s", () => {
  const p = jardim();
  const flashes = presenterFlashes(p);
  assert.deepEqual(
    flashes.map((f) => [f.clipId, f.intoId]),
    [
      ["ap2", "ap1"],
      ["ap4", "ap3"],
    ],
  );
  let clips = p.clips;
  for (const f of flashes) clips = joinPresenterFlash(clips, f);
  assert.deepEqual(onTrack(clips, "apres"), [
    ["ap1", 46.51, 60.04],
    ["ap3", 60.04, 70.11],
    ["ap5", 70.11, 77.55],
  ]);
  // Same footage, same moments: the joined piece just runs on.
  const ap1 = clips.find((c) => c.id === "ap1")!;
  assert.equal(ap1.in, 46.4);
  assert.deepEqual(presenterFlashes({ ...p, clips }), []);
});

test("um pedaço curto em outro plano fica com o lugar e o tamanho do vizinho, sem transição", () => {
  const p = jardim();
  const slide = { x: 0.8, y: 1.13, scale: 1.97, opacity: 1 };
  const screen = { x: 0.86, y: 1.34, scale: 1.58, opacity: 1 };
  // The short piece is from another moment of the footage (a cut was made there).
  const clips = p.clips.map((c) =>
    c.id === "ap2"
      ? { ...c, in: 62, transform: screen }
      : c.id.startsWith("ap")
        ? { ...c, transform: slide }
        : c,
  ) as Clip[];
  const [f] = presenterFlashes({ ...p, clips });
  const out = joinPresenterFlash(clips, f!);
  const ap2 = out.find((c) => c.id === "ap2")!;
  assert.deepEqual(ap2.transform, slide);
  assert.equal(ap2.transition, undefined);
});

/** Farol: tela inteira, o som dela e duas animações de 6,6 s postas quase seguidas. */
function farol(): Project {
  return {
    settings,
    tracks: [track("tela"), track("som", { kind: "audio" })],
    assets: [asset("tela", 200), asset("som", 200), asset("anim1", 6.6), asset("anim2", 6.6)],
    clips: [
      clip("t", "tela", 0, 200, { assetId: "tela" }),
      clip("s", "som", 0, 200, { assetId: "som" }),
    ],
  } as unknown as Project;
}

test("place_cutaway: a sobra de tela entre duas animações vira o último quadro da primeira", () => {
  let p = farol();
  for (const [id, at] of [
    ["anim1", 10],
    ["anim2", 17],
  ] as const) {
    const r = placeCutaway(
      p,
      clipOf(p.assets.find((a) => a.id === id)!, "tela", at),
      "tela",
      ["som"],
      circles,
    );
    assert.ok(r.ok);
    p = { ...p, clips: r.clips };
  }
  const found = findSlivers(p);
  assert.equal(found.length, 1);
  const s = found[0]!;
  assert.ok(s.pieceId);
  assert.ok(Math.abs(s.start - 16.6) < 1e-6 && Math.abs(s.end - 17) < 1e-6);
  // The screen's sound of that stretch goes with it.
  assert.equal(s.companions.length, 1);
  const holds: string[] = [];
  const r = closeSlivers(p, found, (h) => {
    holds.push(`${h.side} ${h.from.toFixed(2)}–${h.to.toFixed(2)}`);
    return "quadro";
  });
  assert.deepEqual(holds, ["after 16.60–17.00"]);
  covered(r.clips, "tela", 0, 200);
  const held = r.clips.find((c) => c.assetId === "quadro")!;
  assert.equal(held.transition, undefined);
  assert.equal(held.volume, 0);
  // The second animation keeps its entrance: one transition at the change.
  const second = r.clips.find((c) => c.assetId === "anim2")!;
  assert.equal(second.transition?.kind, "colorcircles");
  assert.ok(
    !r.clips.some((c) => c.trackId === "som" && c.start >= 16.6 - 1e-6 && clipEnd(c) <= 17 + 1e-6),
  );
});

test("a animação com material sobrando só continua até a próxima", () => {
  let p = farol();
  // The first animation trimmed to 5 s: it has 1.6 s of its own left.
  const first = { ...clipOf(p.assets.find((a) => a.id === "anim1")!, "tela", 10), duration: 5 };
  for (const cut of [first, clipOf(p.assets.find((a) => a.id === "anim2")!, "tela", 15.8)]) {
    const r = placeCutaway(p, cut, "tela", ["som"], circles);
    assert.ok(r.ok);
    p = { ...p, clips: r.clips };
  }
  const r = closeSlivers(p, findSlivers(p), () => assert.fail("sem quadro parado"));
  const anim1 = r.clips.find((c) => c.assetId === "anim1")!;
  assert.ok(Math.abs(clipEnd(anim1) - 15.8) < 1e-6);
  assert.equal(anim1.speed, undefined);
  covered(r.clips, "tela", 0, 200);
});

test("sem quadro parado, a animação fica no máximo 5% mais lenta; além disso, nada muda", () => {
  const p = farol();
  const at = (anim: string, start: number) =>
    clipOf(p.assets.find((a) => a.id === anim)!, "tela", start);
  const build = (gap: number): Project => {
    let q = p;
    for (const cut of [at("anim1", 10), at("anim2", 16.6 + gap)]) {
      const r = placeCutaway(q, cut, "tela", [], circles);
      assert.ok(r.ok);
      q = { ...q, clips: r.clips };
    }
    return q;
  };
  // 0.3 s over 6.6 s: 4.3% slower.
  const near = build(0.3);
  const r = closeSlivers(near, findSlivers(near), () => undefined);
  assert.equal(r.slowed.length, 1);
  assert.ok(r.slowed[0]!.speed >= CUTAWAY_JOIN.minSpeed && r.slowed[0]!.speed < 1);
  covered(r.clips, "tela", 0, 200);
  // 1 s over 6.6 s would be 13% slower: left as it is, and said.
  const far = build(1);
  const left = closeSlivers(far, findSlivers(far), () => undefined);
  assert.equal(left.left.length, 1);
  assert.deepEqual(left.clips, far.clips);
});

test("no começo da faixa, a animação seguinte segura o primeiro quadro", () => {
  const p = farol();
  const r0 = placeCutaway(
    p,
    clipOf(p.assets.find((a) => a.id === "anim1")!, "tela", 0.4),
    "tela",
    [],
    circles,
  );
  assert.ok(r0.ok);
  const q = { ...p, clips: r0.clips };
  const found = findSlivers(q);
  assert.deepEqual(
    found.map((s) => [s.beforeId, !!s.afterId]),
    [[null, true]],
  );
  const r = closeSlivers(q, found, (h) => (h.side === "before" ? "primeiro" : undefined));
  const held = r.clips.find((c) => c.assetId === "primeiro")!;
  assert.equal(held.start, 0);
  // The animation's entrance moves to the held frame, where the picture now starts.
  assert.equal(held.transition?.kind, "colorcircles");
  assert.equal(r.clips.find((c) => c.assetId === "anim1")!.transition, undefined);
});

test("verificação antes de exportar: sobras entre slides e avatar picado, com correção", async () => {
  const { preflight } = await import("../src/shared/preflight.ts");
  const p = jardim();
  const found = preflight(p);
  const slivers = found.filter((f) => f.kind === "cutaway-sliver");
  assert.equal(slivers.length, 2);
  assert.ok(slivers.every((f) => f.fix?.action === "close-slivers"));
  // The one-frame gap is said once, as a sliver, not again as a black gap.
  assert.ok(!found.some((f) => f.kind === "black-gap" && Math.abs((f.at ?? 0) - 60.01) < 0.01));
  const flashes = found.filter((f) => f.kind === "presenter-flash");
  assert.deepEqual(
    flashes.map((f) => f.fix?.action === "join-presenter" && f.fix.clipId),
    ["ap2", "ap4"],
  );
  assert.match(flashes[0]!.message, /Avatar muda de plano por menos de 1 s/);
  // After the fixes, nothing of the kind is left.
  const closed = closeSlivers(p, findSlivers(p), () => undefined);
  let clips = closed.clips;
  for (const f of presenterFlashes({ ...p, clips })) clips = joinPresenterFlash(clips, f);
  const after = preflight({ ...p, clips });
  assert.ok(!after.some((f) => f.kind === "cutaway-sliver" || f.kind === "presenter-flash"));
});
