import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseScript, speechItems } from "../src/shared/script.ts";
import type { Asset, Clip, Project, Track, Transcript, Word } from "../src/shared/types.ts";

/*
 * The AI tools as the editor runs them (renderer/src/lib/aiTools.ts runAiTool), on the real
 * project store. The app's import aliases point at the sources; React components and the
 * Vite-only imports they bring become empty stand-ins, as nothing here draws.
 */
const src = new URL("../src/", import.meta.url);
const withExt = (base: URL): string => {
  for (const ext of [".ts", ".tsx"]) {
    const url = new URL(`${base.href}${ext}`);
    if (existsSync(fileURLToPath(url))) return url.href;
  }
  return `${base.href}.ts`;
};
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@shared/"))
      return { url: new URL(`shared/${specifier.slice(8)}.ts`, src).href, shortCircuit: true };
    if (specifier.startsWith("@/")) {
      const rest = specifier.slice(2);
      return {
        url: /\.[a-z]+$/i.test(rest)
          ? new URL(`renderer/src/${rest}`, src).href
          : withExt(new URL(`renderer/src/${rest}`, src)),
        shortCircuit: true,
      };
    }
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL?.includes("/renderer/src/") &&
      !/\.[a-z]+$/i.test(specifier)
    )
      return { url: withExt(new URL(specifier, context.parentURL)), shortCircuit: true };
    if (/\?(url|worker|raw)$/.test(specifier))
      return { url: `stub:${specifier}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("stub:"))
      return { format: "module", shortCircuit: true, source: "export default '';" };
    if (url.endsWith(".css")) return { format: "module", shortCircuit: true, source: "" };
    if (url.endsWith(".tsx")) {
      const text = readFileSync(fileURLToPath(url), "utf8");
      const names = [...text.matchAll(/export (?:async )?(?:function|const|class|let) (\w+)/g)].map(
        (m) => m[1],
      );
      return {
        format: "module",
        shortCircuit: true,
        source: `${names.map((n) => `export const ${n} = () => {};`).join("\n")}\nexport default () => null;`,
      };
    }
    return nextLoad(url, context);
  },
});

/** What the tools ask of the main process here; detectScreen can be told to wait. */
const api = {
  saveProject: async () => {},
  getGlossary: async () => [],
  recentProjects: async () => [],
  detectScreen: async (): Promise<string | null> => "#00FF00",
  // Sound effects of the library and the files the sound tools import (lib/soundLibrary.ts).
  sounds: {
    library: async () =>
      ["clique", "pop", "sucesso", "comemoracao", "woosh-curto"].map((id) => ({
        id,
        path: `C:/sons/${id}.wav`,
      })),
  },
  exists: async (paths: string[]) => paths.map(() => true),
  probe: async (path: string) => {
    const video = path.endsWith(".mp4");
    return {
      kind: video ? "video" : "audio",
      duration: video ? 8 : 0.6,
      width: video ? 1920 : 0,
      height: video ? 1080 : 0,
      fps: video ? 30 : 0,
      hasVideo: video,
      hasAudio: true,
      size: 1,
      vfr: false,
      videoCodec: "h264",
    };
  },
  thumbnail: async () => "",
  waveform: async () => [],
  listLibrary: async () => ({
    media: [
      {
        id: "meu-tada",
        name: "Meu tada",
        path: "C:/sons/meu-tada.wav",
        kind: "audio",
        category: "efeito",
        addedAt: 0,
      },
    ],
    styles: [],
  }),
};
Object.assign(globalThis, { window: { api }, Path2D: class {} });
const { runAiTool } = await import("../src/renderer/src/lib/aiTools.ts");
const { useProject } = await import("../src/renderer/src/state/project.ts");
hooks.deregister();

const asset = (id: string, kind: Asset["kind"], extra: Partial<Asset> = {}): Asset => ({
  id,
  name: id,
  path: `C:\\aulas\\${id}`,
  kind,
  duration: kind === "image" ? 0 : 100,
  width: kind === "audio" ? 0 : 1920,
  height: kind === "audio" ? 0 : 1080,
  fps: kind === "video" ? 30 : 0,
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

function lesson(id = "p1", extra: Partial<Project> = {}): Project {
  const clips: Clip[] = [
    { id: "s", assetId: "screen", trackId: "v", start: 0, in: 0, duration: 100, volume: 1 },
    { id: "m", assetId: "mic", trackId: "a", start: 0, in: 0, duration: 100, volume: 1 },
    { id: "cam", assetId: "camera", trackId: "v2", start: 10, in: 0, duration: 20, volume: 0 },
  ];
  return {
    version: 1,
    id,
    name: `Aula ${id}`,
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    assets: [asset("screen", "video"), asset("mic", "audio"), asset("camera", "video")],
    tracks: [track("v", "video"), track("a", "audio"), track("v2", "video")],
    clips,
    ...extra,
  };
}

let seq = 0;
const call = (
  name: string,
  input: unknown,
  extra: { projectId?: string; source?: "mcp" | "assistant" } = {},
) =>
  runAiTool({
    id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
    name,
    input,
    source: extra.source ?? "mcp",
    client: "g-externo",
    ...(extra.projectId ? { projectId: extra.projectId } : {}),
  });

const open = (p: Project): void => useProject.getState().load(null as unknown as string, p);
const now = (): Project => {
  const p = useProject.getState().project;
  assert.ok(p);
  return p;
};
const clip = (id: string): Clip | undefined => now().clips.find((c) => c.id === id);

test("C3: a call without a project of its own never writes into a lesson opened while it waits", async () => {
  open(lesson("p1"));
  const other = lesson("p2");
  api.detectScreen = async () => {
    // The person opens another lesson while the background color is being detected.
    open(other);
    return "#00FF00";
  };
  const r = await call("set_background_removal", { media: "camera", enabled: true });
  api.detectScreen = async () => "#00FF00";
  assert.equal(r.ok, false);
  assert.match(r.text, /trocou de aula/);
  assert.equal(now().id, "p2");
  assert.equal(now().assets.find((a) => a.id === "camera")?.key, undefined);
  assert.equal(useProject.getState().past.length, 0, "nothing in the history of the other lesson");
});

test("C6: clips on a locked track are left as they are, and the answer names them", async () => {
  open(
    lesson("p1", {
      tracks: [track("v", "video"), track("a", "audio"), track("v2", "video", { locked: true })],
    }),
  );
  const only = await call("set_clip_layout", { clip_ids: ["cam"], placement: "corner-right" });
  assert.equal(only.ok, false);
  assert.match(only.text, /faixa travada/);
  assert.equal(clip("cam")?.transform, undefined);

  const mixed = await call("set_motion", { clip_ids: ["s", "cam"], enter: "fade" });
  assert.equal(mixed.ok, true);
  assert.match(mixed.text, /cam.*faixa travada/);
  assert.equal(clip("s")?.enter, "fade");
  assert.equal(clip("cam")?.enter, undefined);

  const moved = await call("move_clip", {
    clip_id: "cam",
    keyframes: [{ at: 12, x: 0.5, y: 0.5, scale: 1 }],
  });
  assert.equal(moved.ok, false);
  assert.equal(clip("cam")?.keyframes, undefined);
});

test("C7: a tool given one clip of a group changes the whole group; get_overview shows it", async () => {
  const p = lesson("p1");
  p.clips = p.clips.map((c) => (c.id === "s" || c.id === "cam" ? { ...c, groupId: "g1" } : c));
  open(p);
  const r = await call("set_clip_layout", { clip_ids: ["s"], opacity: 0.5 });
  assert.equal(r.ok, true, r.text);
  assert.equal(clip("s")?.transform?.opacity, 0.5);
  assert.equal(clip("cam")?.transform?.opacity, 0.5);
  assert.equal(clip("m")?.transform, undefined);
  const overview = await call("get_overview", {});
  assert.match(overview.text, /\[s\][^;]*grupo g1/);
  assert.match(overview.text, /\[cam\][^;]*grupo g1/);
});

test("C8: one wrong id and nothing is done; a repeated music file is not added twice", async () => {
  open(lesson("p1"));
  const style = await call("set_style", { clip_ids: ["s", "nao-existe"], shadow: "soft" });
  assert.equal(style.ok, false);
  assert.match(style.text, /nao-existe/);
  assert.equal(clip("s")?.transform, undefined, "the valid clip was not changed either");
  assert.equal(useProject.getState().past.length, 0);

  const audio = await call("set_audio", {
    denoise: true,
    music_tracks: [{ track_id: "faixa-x", music: true }],
  });
  assert.equal(audio.ok, false);
  assert.equal(clip("m")?.denoise, undefined);

  // The changes of one call go in together, as one step of the history.
  const both = await call("set_style", { clip_ids: ["s", "cam"], shadow: "soft" });
  assert.equal(both.ok, true, both.text);
  assert.ok(clip("s")?.transform?.shadow && clip("cam")?.transform?.shadow);
  assert.equal(useProject.getState().past.length, 1);

  const withMusic = lesson("p1", {
    assets: [...lesson().assets, asset("trilha", "audio", { path: "C:\\musicas\\trilha.mp3" })],
    tracks: [...lesson().tracks, track("mu", "audio", { music: true, name: "Música" })],
  });
  withMusic.clips.push({
    id: "bg",
    assetId: "trilha",
    trackId: "mu",
    start: 0,
    in: 0,
    duration: 100,
    volume: 0.35,
  });
  open(withMusic);
  const again = await call("set_audio", { add_music_path: "C:/musicas/TRILHA.mp3" });
  assert.equal(again.ok, true, again.text);
  assert.match(again.text, /já está/);
  assert.equal(now().tracks.filter((t) => t.music).length, 1);
});

test("C9: while a draft that changes the structure waits, direct edits are refused", async () => {
  open(lesson("p1"));
  const p = now();
  useProject.setState({
    draft: {
      id: "d1",
      projectId: p.id,
      author: "preparar:limpeza",
      title: "Limpeza",
      base: p,
      items: [
        {
          id: "i1",
          kind: "structure",
          label: "Corte",
          clips: ["s"],
          keys: ["clip:s"],
          needs: [],
          patches: [],
          status: "pending",
        },
      ],
      ops: [],
    },
  });
  const revision = useProject.getState().revision;
  const cut = await call("cut_ranges", { ranges: [{ start: 1, end: 2 }], revision });
  assert.equal(cut.ok, false);
  assert.match(cut.text, /rascunho que muda a estrutura/);
  const speed = await call("set_speed", { clip_ids: ["s"], speed: 2 });
  assert.equal(speed.ok, false);
  assert.match(speed.text, /rascunho que muda a estrutura/);
  const card = await call("add_card", { where: "start", title: "Oi" });
  assert.equal(card.ok, false);
  assert.equal(now().clips.length, 3);
  useProject.setState({ draft: null });
});

test("C4: with chapter markers, chapters sent by the AI are refused and nothing is saved", async () => {
  open(
    lesson("p1", {
      markers: [
        { id: "m1", t: 0, label: "Abertura", chapter: true },
        { id: "m2", t: 40, label: "Blocos", chapter: true },
      ],
    }),
  );
  const r = await call("save_publish_info", {
    title: "Aula de blocos",
    chapters: [
      { time: 0, title: "Intro" },
      { time: 30, title: "Meio" },
    ],
  });
  assert.equal(r.ok, false);
  assert.match(r.text, /marcadores-capítulo/);
  assert.equal(now().publish, undefined);
  const title = await call("save_publish_info", { title: "Aula de blocos" });
  assert.equal(title.ok, true);
  assert.equal(now().publish?.title, "Aula de blocos");
  const overview = await call("get_overview", {});
  assert.match(overview.text, /2 capítulos \(dos marcadores-capítulo da timeline\)/);
});

/** Aula02: Faixa 4 com o avatar da narração emendada; a narração em 5 clipes com pausas de 4 s. */
const NARRATION: [number, number][] = [
  [2.5, 29.2],
  [33.2, 79.5],
  [83.5, 237.6],
  [241.6, 400.1],
  [404.1, 467.7],
];
function aula02(): Project {
  const long = { duration: 600 };
  return {
    ...lesson("aula02"),
    assets: [
      asset("render", "video", long),
      asset("voz", "audio", long),
      asset("tela", "video", long),
    ],
    tracks: [track("f4", "video"), track("narr", "audio"), track("tela", "video")],
    clips: [
      {
        id: "avatar",
        assetId: "render",
        trackId: "f4",
        start: 2.5,
        in: 0,
        duration: 449.1,
        volume: 1,
      },
      ...NARRATION.map(([a, b], i) => ({
        id: `n${i + 1}`,
        assetId: "voz",
        trackId: "narr",
        start: a,
        in: a,
        duration: b - a,
        volume: 1,
      })),
      { id: "screen", assetId: "tela", trackId: "tela", start: 0, in: 0, duration: 500, volume: 1 },
    ],
  };
}
const onTrack = (id: string) =>
  now()
    .clips.filter((c) => c.trackId === id)
    .sort((a, b) => a.start - b.start);
const revision = () => useProject.getState().revision;

test("tempo numa faixa: 4 split_clip e um move_clips alinham o avatar; o undo do assistente desfaz tudo", async () => {
  open(aula02());
  const original = now().clips;
  const narration = onTrack("narr");
  let last = "avatar";
  for (const at of [29.2, 75.5, 229.6, 388.1]) {
    const r = await call("split_clip", { clip_id: last, at, revision: revision() });
    assert.equal(r.ok, true, r.text);
    last = /\[([^\]]+)\] a partir/.exec(r.text)?.[1] ?? "";
    assert.ok(last);
  }
  const pieces = onTrack("f4");
  assert.equal(pieces.length, 5);
  const stale = await call("move_clips", { clip_ids: [pieces[1].id], delta: 4, revision: 0 });
  assert.equal(stale.ok, false);
  assert.match(stale.text, /mudou desde a leitura/);
  const moved = await call("move_clips", {
    moves: pieces.slice(1).map((c, i) => ({ clip_id: c.id, delta: 4 * (i + 1) })),
    revision: revision(),
  });
  assert.equal(moved.ok, true, moved.text);
  assert.deepEqual(
    onTrack("f4").map((c) => Math.round(c.start * 10) / 10),
    NARRATION.map(([a]) => a),
  );
  assert.deepEqual(onTrack("narr"), narration);
  // Cada chamada é um passo; o undo do próprio assistente volta as cinco.
  const undo = await call("undo", { steps: 5 });
  assert.equal(undo.ok, true, undo.text);
  assert.deepEqual(now().clips, original);
});

test("tempo numa faixa: align_track_to propõe um rascunho de estrutura; em apply é um passo só", async () => {
  open(aula02());
  const original = now().clips;
  const proposed = await call("align_track_to", {
    track_id: "f4",
    reference_track_id: "narr",
    revision: revision(),
  });
  assert.equal(proposed.ok, true, proposed.text);
  assert.match(proposed.text, /rascunho/);
  assert.deepEqual(now().clips, original, "o rascunho não muda a aula");
  const draft = useProject.getState().draft;
  assert.ok(draft?.items.some((i) => i.kind === "structure" && i.status === "pending"));
  // Com o rascunho de estrutura esperando, as edições diretas de tempo são recusadas.
  const blocked = await call("split_clip", { clip_id: "avatar", at: 100, revision: revision() });
  assert.equal(blocked.ok, false);
  assert.match(blocked.text, /rascunho que muda a estrutura/);
  useProject.setState({ draft: null });

  const history = useProject.getState().pastMeta.length;
  const applied = await call("align_track_to", {
    track_id: "f4",
    reference_track_id: "narr",
    mode: "apply",
    revision: revision(),
  });
  assert.equal(applied.ok, true, applied.text);
  assert.equal(useProject.getState().pastMeta.length, history + 1);
  assert.deepEqual(
    onTrack("f4").map((c) => Math.round(c.start * 10) / 10),
    NARRATION.map(([a]) => a),
  );
  assert.equal(onTrack("narr").length, 5);
  assert.equal((await call("undo", {})).ok, true);
  assert.deepEqual(now().clips, original);
});

test("tempo numa faixa: id inválido ou sobreposição não mudam nada nem deixam passo no histórico", async () => {
  open(aula02());
  const original = now().clips;
  const history = useProject.getState().pastMeta.length;
  const bad = await call("move_clips", {
    moves: [
      { clip_id: "n2", delta: 1 },
      { clip_id: "nao-existe", delta: 1 },
    ],
    revision: revision(),
  });
  assert.equal(bad.ok, false);
  assert.match(bad.text, /nao-existe/);
  const over = await call("move_clips", { clip_ids: ["n2"], delta: -10, revision: revision() });
  assert.equal(over.ok, false);
  assert.match(over.text, /n2.*sobre o clipe n1/);
  const outside = await call("split_clip", { clip_id: "avatar", at: 470, revision: revision() });
  assert.equal(outside.ok, false);
  assert.deepEqual(now().clips, original);
  assert.equal(useProject.getState().pastMeta.length, history);
});

test("tempo numa faixa: as ferramentas também valem no assistente do painel lateral", async () => {
  open(aula02());
  const r = await call(
    "split_clip",
    { clip_id: "avatar", at: 29.2, revision: revision() },
    { source: "assistant", projectId: "aula02" },
  );
  assert.equal(r.ok, true, r.text);
  assert.equal(onTrack("f4").length, 2);
});

/** Aula02 com o balão de 1:09 numa faixa de anotações e a tela gravada no EdiAula (cursor salvo). */
function aula02Sons(): Project {
  const p = aula02();
  return {
    ...p,
    assets: [
      // Quem fala é a narração: o avatar e a tela não têm som aqui.
      ...p.assets.map((a) =>
        a.id === "tela"
          ? { ...a, hasAudio: false, cursor: "C:/aula/tela-cursor.json" }
          : a.id === "render"
            ? { ...a, hasAudio: false }
            : a,
      ),
      asset("balao-img", "image", { generated: "annotation" }),
    ],
    tracks: [track("notas", "video"), ...p.tracks],
    clips: [
      ...p.clips,
      {
        id: "balao",
        assetId: "balao-img",
        trackId: "notas",
        start: 69,
        in: 0,
        duration: 4,
        volume: 0,
        annotation: { kind: "balloon", text: "Olha aqui" } as unknown as Clip["annotation"],
      },
    ],
  };
}
const history = () => useProject.getState().pastMeta.length;
const effects = () =>
  now()
    .clips.filter((c) => now().tracks.find((x) => x.id === c.trackId)?.sfx)
    .sort((a, b) => a.start - b.start);

test("sons: add_sound_effects faz um rascunho; aplicado, os efeitos ficam na faixa de efeitos sem mexer nas outras", async () => {
  open(aula02Sons());
  const original = now();
  const r = await call("add_sound_effects", {
    items: [
      { sfx: "sucesso", at: 167 },
      { sfx: "comemoração", at: 442 },
      { sfx: "pop", on_annotation: "balao" },
    ],
  });
  assert.equal(r.ok, true, r.text);
  assert.match(r.text, /rascunho/);
  // Toda a narração está sem transcrição: a fala é o clipe inteiro, então os três são baixados.
  assert.match(r.text, /baixado para 30%/);
  assert.deepEqual(now().clips, original.clips, "o rascunho não muda a aula");
  const applied = useProject.getState().applyDraft();
  assert.equal(applied.ok, true);
  const fx = effects();
  assert.deepEqual(
    fx.map((c) => [c.start, now().assets.find((a) => a.id === c.assetId)?.name]),
    [
      [69, "pop"],
      [167, "sucesso"],
      [442, "comemoracao"],
    ],
  );
  assert.ok(fx.every((c) => c.volume === 0.3));
  assert.deepEqual(
    now().clips.filter((c) => original.clips.some((o) => o.id === c.id)),
    original.clips,
    "as outras faixas ficam como estavam",
  );
  useProject.getState().undo();
  assert.deepEqual(now().clips, original.clips);
  assert.deepEqual(now().tracks, original.tracks);
  assert.deepEqual(now().assets, original.assets, "os sons trazidos saem com o desfazer");
});

test("sons: em apply, um passo só; o undo do assistente devolve a aula", async () => {
  open(aula02Sons());
  const original = now();
  const steps = history();
  const r = await call("add_sound_effects", {
    items: [
      { sfx: "pop", at: 30.5 },
      { sfx: "sucesso", at: 80.2 },
      { sfx: "nao-existe", at: 90 },
    ],
    mode: "apply",
  });
  assert.equal(r.ok, true, r.text);
  assert.match(r.text, /nao-existe/);
  assert.equal(history(), steps + 1);
  // Nos vãos da narração (29,2–33,2 e 79,5–83,5) o volume pedido fica.
  assert.deepEqual(
    effects().map((c) => [c.start, c.volume]),
    [
      [30.5, 0.8],
      [80.2, 0.8],
    ],
  );
  assert.equal((await call("undo", {})).ok, true);
  assert.deepEqual(now().clips, original.clips);
  assert.deepEqual(now().tracks, original.tracks);
  assert.deepEqual(now().assets, original.assets);
});

test("sons: add_clip em 4:00 numa faixa ocupada vai para outra faixa, sem empurrar nada; faixa travada é recusada", async () => {
  open(aula02Sons());
  const original = now();
  const steps = history();
  const r = await call("add_clip", { media_id: "tela", track_id: "f4", at: 240, in: 10, out: 15 });
  assert.equal(r.ok, true, r.text);
  assert.match(r.text, /estava ocupada/);
  const id = /\[([^\]]+)\]/.exec(r.text)?.[1] ?? "";
  const placed = clip(id);
  assert.ok(placed);
  assert.notEqual(placed.trackId, "f4");
  assert.deepEqual([placed.start, placed.in, placed.duration], [240, 10, 5]);
  assert.deepEqual(
    now().clips.filter((c) => c.id !== id),
    original.clips,
  );
  assert.equal(history(), steps + 1);
  assert.equal((await call("undo", {})).ok, true);
  assert.deepEqual(now().clips, original.clips);
  assert.deepEqual(now().tracks, original.tracks);

  open({
    ...aula02Sons(),
    tracks: aula02Sons().tracks.map((x) => (x.id === "f4" ? { ...x, locked: true } : x)),
  });
  const before = history();
  const locked = await call("add_clip", { media_id: "tela", track_id: "f4", at: 240 });
  assert.equal(locked.ok, false);
  assert.match(locked.text, /travada/);
  assert.equal(history(), before);

  // Sem faixa: um som vai para "Efeitos sonoros", criada quando falta.
  const sound = await call("add_clip", { media_id: "sfx:sucesso", at: 31 });
  assert.equal(sound.ok, true, sound.text);
  assert.match(sound.text, /Efeitos sonoros/);
  assert.equal(effects().length, 1);
});

test("sons: set_click_sound liga o clique da gravação e cria a faixa Cliques, num passo que se desfaz", async () => {
  open(aula02Sons());
  const original = now();
  const steps = history();
  const r = await call("set_click_sound", {
    enabled: true,
    sound: "pop",
    volume: 0.5,
    include: ["click", "typing"],
  });
  assert.equal(r.ok, true, r.text);
  assert.match(r.text, /ligado em tela/);
  const fx = now().assets.find((a) => a.id === "tela")?.cursorFx;
  assert.equal(fx?.clickSound, true);
  assert.equal(fx?.clickSoundKind, "pop");
  assert.equal(fx?.clickVolume, 0.5);
  assert.deepEqual(fx?.clickInclude, ["click", "typing"]);
  assert.equal(now().tracks.filter((x) => x.clicks).length, 1);
  assert.equal(history(), steps + 1);
  assert.equal((await call("undo", {})).ok, true);
  assert.deepEqual(now().assets, original.assets);
  assert.deepEqual(now().tracks, original.tracks);

  const none = await call("set_click_sound", { media: "voz", enabled: true });
  assert.equal(none.ok, false);
  assert.equal(history(), steps);
});

test("sons: list_library mostra mídias, efeitos e a biblioteca da pessoa; import_media com at não empurra nada", async () => {
  open(aula02Sons());
  const all = await call("list_library", {});
  assert.match(all.text, /\[tela\] tela · video/);
  assert.match(all.text, /\[sfx:sucesso\] Sucesso/);
  assert.match(all.text, /\[lib:meu-tada\] Meu tada · Efeito sonoro/);
  assert.doesNotMatch(all.text, /balao-img/, "imagens geradas das anotações não aparecem");
  const sfx = await call("list_library", { kind: "sfx", search: "comemoracao" });
  assert.doesNotMatch(sfx.text, /\[tela\]/);
  assert.match(sfx.text, /sfx:comemoracao/);
  assert.doesNotMatch(sfx.text, /sfx:pop/);

  const original = now();
  const r = await call("import_media", {
    paths: ["C:/aula/vinheta.mp4"],
    at: 100,
    track_id: "tela",
  });
  assert.equal(r.ok, true, r.text);
  const added = now().clips.filter((c) => !original.clips.some((o) => o.id === c.id));
  assert.equal(added.length, 1);
  assert.equal(added[0].start, 100);
  assert.notEqual(added[0].trackId, "tela", "a faixa pedida estava ocupada");
  assert.deepEqual(
    now().clips.filter((c) => c.id !== added[0].id),
    original.clips,
  );
  // O arquivo entra junto com o clipe: um desfazer tira os dois.
  assert.ok(now().assets.some((a) => a.path === "C:/aula/vinheta.mp4"));
  assert.equal((await call("undo", {})).ok, true);
  assert.deepEqual(now().assets, original.assets);
  assert.deepEqual(now().clips, original.clips);
  // A biblioteca da pessoa também entra pelo add_clip.
  const mine = await call(
    "add_clip",
    { media_id: "lib:meu-tada", at: 31 },
    { source: "assistant", projectId: "aula02" },
  );
  assert.equal(mine.ok, true, mine.text);
  assert.match(mine.text, /Meu tada|meu-tada/);
});

/** Aula02 com a Faixa 4 em 6 clipes do avatar, centralizado à direita, como na aula de verdade. */
const FAIXA4: [number, number, number][] = [
  [2.5, 0, 26.71],
  [33.23, 26.71, 31.27],
  [64.5, 57.97, 14.98],
  [83.5, 72.95, 154.11],
  [241.63, 227.06, 158.44],
  [404.07, 385.5, 63.63],
];
function aula02Recorte(): Project {
  const p = aula02();
  const placed = { x: 0.8, y: 0.62, scale: 0.75, opacity: 1, shadow: undefined };
  return {
    ...p,
    assets: p.assets.map((a) =>
      a.id === "render" ? { ...a, key: { color: "#00FF00" } } : a,
    ) as Asset[],
    clips: [
      ...p.clips.filter((c) => c.trackId !== "f4"),
      ...FAIXA4.map(([start, at, duration], i) => ({
        id: `av${i + 1}`,
        assetId: "render",
        trackId: "f4",
        start,
        in: at,
        duration,
        volume: 0,
        transform: { ...placed, mask: "rounded" as const },
        ...(i === 1
          ? {
              keyframes: [
                { t: 0, x: 0.8, y: 0.62, scale: 0.75 },
                { t: 5, x: 0.7, y: 0.62, scale: 0.75 },
              ],
            }
          : {}),
      })),
    ],
  };
}

test("set_crop: 2% de cada lado nos 6 clipes da Faixa 4, centro e escala iguais; um desfazer volta tudo", async () => {
  open(aula02Recorte());
  const original = now();
  const steps = history();
  const ids = FAIXA4.map((_, i) => `av${i + 1}`);
  const r = await call("set_crop", { clip_ids: ids, left: 0.02, right: 0.02 });
  assert.equal(r.ok, true, r.text);
  assert.match(r.text, /esquerda 2%, direita 2%/);
  assert.equal(history(), steps + 1);
  for (const id of ids) {
    const before = original.clips.find((c) => c.id === id);
    const after = clip(id);
    assert.deepEqual(after?.transform?.crop, { left: 0.02, top: 0, right: 0.02, bottom: 0 });
    // A professora fica no mesmo lugar e do mesmo tamanho (a sombra, a borda e o movimento também).
    assert.deepEqual(
      { ...after?.transform, crop: undefined },
      { ...before?.transform, crop: undefined },
    );
    assert.deepEqual(after?.keyframes, before?.keyframes);
  }
  assert.deepEqual(
    now().clips.filter((c) => !ids.includes(c.id)),
    original.clips.filter((c) => !ids.includes(c.id)),
    "os outros clipes não mudam",
  );
  const overview = await call("get_overview", {});
  assert.match(overview.text, /\[av1\][^;]*recorte esquerda 2%, direita 2%/);
  assert.equal((await call("undo", {})).ok, true);
  assert.deepEqual(now().clips, original.clips);
});

test("set_crop: sem valores tira o recorte; grupo junto, faixa travada de fora, id errado não muda nada", async () => {
  open(aula02Recorte());
  await call("set_crop", { clip_ids: ["av1"], left: 0.03 });
  const removed = await call("set_crop", { clip_ids: ["av1"] });
  assert.equal(removed.ok, true, removed.text);
  assert.match(removed.text, /Recorte tirado/);
  assert.equal(clip("av1")?.transform?.crop, undefined);
  assert.equal(clip("av1")?.transform?.x, 0.8);

  const steps = history();
  const before = now().clips;
  const wrong = await call("set_crop", { clip_ids: ["av1", "nao-existe"], left: 0.02 });
  assert.equal(wrong.ok, false);
  assert.match(wrong.text, /nao-existe/);
  assert.deepEqual(now().clips, before);
  assert.equal(history(), steps);
  assert.equal((await call("set_crop", { clip_ids: ["av1"], left: 0.5 })).ok, false, "até 0,45");

  // O grupo vai junto (o som do grupo fica de fora); a faixa travada não muda.
  const grouped = aula02Recorte();
  open({
    ...grouped,
    tracks: grouped.tracks.map((x) => (x.id === "tela" ? { ...x, locked: true } : x)),
    clips: grouped.clips.map((c) =>
      c.id === "av2" || c.id === "n2" || c.id === "screen" ? { ...c, groupId: "g" } : c,
    ),
  });
  const g = await call("set_crop", { clip_ids: ["av2"], right: 0.02 });
  assert.equal(g.ok, true, g.text);
  assert.equal(clip("av2")?.transform?.crop?.right, 0.02);
  assert.equal(clip("n2")?.transform, undefined, "som não ganha recorte");
  assert.equal(clip("screen")?.transform, undefined, "faixa travada");
  assert.match(g.text, /travada|screen/);

  // Também no assistente do painel lateral.
  const side = await call(
    "set_crop",
    { clip_ids: ["av3"], left: 0.02 },
    { source: "assistant", projectId: "aula02" },
  );
  assert.equal(side.ok, true, side.text);
});

/**
 * Aula02 das vozes: o Dedé na Faixa 6 de 0:02.5 a 0:15.2; a voz da professora sai do avatar na
 * Faixa 4 (a narração da Faixa 2 está muda); o som da página continua.
 */
function aula02Vozes(): Project {
  const key = { color: "#0CBB25" } as Asset["key"];
  return {
    ...lesson("aula02"),
    assets: [
      asset("prof", "video", { name: "CadeTodoMundoAula02_2160p", duration: 449, key }),
      asset("dede", "video", { name: "CadeTodoMundoAula02Dede_2160p", duration: 12.74, key }),
      asset("narr", "audio", { duration: 449, recording: { id: "r", role: "narration" } }),
      asset("pagina", "audio", { duration: 449, recording: { id: "r", role: "system" } }),
    ],
    tracks: [
      track("f6", "video", { name: "Faixa 6" }),
      track("f4", "video", { name: "Faixa 4" }),
      track("f2", "audio", { name: "Narração guiada", muted: true }),
      track("f1", "audio", { name: "Som da página" }),
    ],
    clips: [
      {
        id: "dede1",
        assetId: "dede",
        trackId: "f6",
        start: 2.5,
        in: 0,
        duration: 12.74,
        volume: 1,
      },
      { id: "prof1", assetId: "prof", trackId: "f4", start: 2.5, in: 0, duration: 18.1, volume: 1 },
      {
        id: "prof2",
        assetId: "prof",
        trackId: "f4",
        start: 33.23,
        in: 26.71,
        duration: 31.27,
        volume: 1,
      },
      {
        id: "narr1",
        assetId: "narr",
        trackId: "f2",
        start: 2.5,
        in: 0,
        duration: 26.71,
        volume: 1,
      },
      { id: "pag1", assetId: "pagina", trackId: "f1", start: 0, in: 0, duration: 80, volume: 1 },
    ],
  };
}

test("vozes: com a regra ligada a professora fica muda de 0:02.5 a 0:15.2; mover o Dedé leva o silêncio; desligar devolve", async () => {
  open(aula02Vozes());
  const original = now();
  const overview = await call("get_overview", {});
  assert.match(
    overview.text,
    /Regra "personagem silencia a professora": ligada \(o avatar dela some com fade de 0,2 s\)/,
  );
  assert.match(overview.text, /Personagens na timeline: Dedé \[dede1\] 0:02\.5–0:15\.2/);
  assert.match(overview.text, /Professora calada em: 0:02\.5–0:15\.2\./);
  assert.match(
    overview.text,
    /\[prof1\][^;\n]*voz: professora, calada pelo personagem 0:02\.5–0:15\.2/,
  );
  assert.match(overview.text, /\[dede1\][^;\n]*voz: personagem: Dedé/);
  assert.doesNotMatch(overview.text, /\[pag1\][^;\n]*voz:/, "o som da página não é voz de ninguém");
  assert.doesNotMatch(overview.text, /\[prof2\][^;\n]*calada/, "fora do Dedé nada muda");

  // Mover o Dedé para 1:00 leva o silêncio junto.
  const moved = await call("move_clips", { clip_ids: ["dede1"], start: 60, revision: revision() });
  assert.equal(moved.ok, true, moved.text);
  const after = await call("set_voice_rule", {});
  assert.match(after.text, /Professora calada em: 1:00\.0–1:12\.7\./);

  // Desligar devolve o volume original (nada fica gravado nos clipes da professora).
  const off = await call("set_voice_rule", { enabled: false });
  assert.equal(off.ok, true, off.text);
  assert.match(off.text, /desligada/);
  assert.doesNotMatch(off.text, /calada/);
  assert.deepEqual(
    now().clips.filter((c) => c.trackId !== "f6"),
    original.clips.filter((c) => c.trackId !== "f6"),
  );
  // Com a regra desligada, a verificação acusa duas vozes.
  const check = await call("check_before_export", {});
  assert.match(check.text, /Dedé e a professora falam juntos/);

  // Desfazer devolve tudo como estava.
  assert.equal((await call("undo", { steps: 2 })).ok, true);
  assert.deepEqual(now().clips, original.clips);
  assert.deepEqual(now().voiceRule, original.voiceRule);
});

test("vozes: set_volume num trecho e no clipe inteiro, grupo junto, faixa travada de fora, um passo só", async () => {
  open(aula02Vozes());
  const original = now();
  const steps = history();
  const bad = await call("set_volume", { clip_ids: ["pag1", "nao-existe"], volume: 0.5 });
  assert.equal(bad.ok, false);
  assert.equal(history(), steps);
  const part = await call("set_volume", {
    clip_ids: ["pag1"],
    volume: 0,
    mute: true,
    from: 10,
    to: 12,
  });
  assert.equal(part.ok, true, part.text);
  assert.equal(history(), steps + 1);
  const pag = clip("pag1");
  assert.equal(pag?.volume, 1, "sem dividir e sem mexer no volume do clipe");
  assert.deepEqual(
    pag?.gain?.map((g) => [Math.round(g.t * 100) / 100, g.db]),
    [
      [9.95, 0],
      [10, -60],
      [12, -60],
      [12.05, 0],
    ],
  );
  const overview = await call("get_overview", {});
  assert.match(overview.text, /\[pag1\][^;\n]*mudo 0:10\.0–0:12\.0/);
  const whole = await call("set_volume", { clip_ids: ["narr1"], volume: 0.3 });
  assert.equal(whole.ok, true, whole.text);
  assert.equal(clip("narr1")?.volume, 0.3);
  assert.match((await call("get_overview", {})).text, /\[narr1\][^;\n]*volume 30%/);
  assert.equal((await call("undo", { steps: 2 })).ok, true);
  assert.deepEqual(now().clips, original.clips);

  open({
    ...aula02Vozes(),
    tracks: aula02Vozes().tracks.map((x) => (x.id === "f1" ? { ...x, locked: true } : x)),
    clips: aula02Vozes().clips.map((c) =>
      c.id === "pag1" || c.id === "narr1" ? { ...c, groupId: "g" } : c,
    ),
  });
  const g = await call("set_volume", { clip_ids: ["narr1"], volume: 0.5 });
  assert.equal(g.ok, true, g.text);
  assert.equal(clip("narr1")?.volume, 0.5);
  assert.equal(clip("pag1")?.volume, 1, "faixa travada");
  assert.match(g.text, /pag1/);
});

test("vozes: set_voice_role corrige quem fala, num passo que se desfaz", async () => {
  open(aula02Vozes());
  const original = now();
  const r = await call("set_voice_role", { media: "pagina", role: "personagem", name: "Debinha" });
  assert.equal(r.ok, true, r.text);
  assert.match(r.text, /personagem: Debinha/);
  assert.match(r.text, /Debinha \[pag1\]/);
  const back = await call("set_voice_role", { media: "pagina", role: "automatico" });
  assert.equal(back.ok, true, back.text);
  assert.equal(now().assets.find((a) => a.id === "pagina")?.voiceRole, undefined);
  assert.equal((await call("set_voice_role", { track_id: "f6", role: "personagem" })).ok, false);
  assert.equal((await call("undo", { steps: 2 })).ok, true);
  assert.deepEqual(now().assets, original.assets);
});

test("vozes: place_insert com a linha da tabela kids põe o Dedé sobre a fala da professora, num passo", async () => {
  const base = aula02Vozes();
  open({
    ...base,
    clips: base.clips.filter((c) => c.id !== "dede1"),
    kids: {
      videos: ["dede"],
      pieces: [
        {
          id: "video-a2-retomada-K1",
          character: "Dedé",
          assetId: "dede",
          in: 1,
          out: 3.4,
          voice: { assetId: "narr", from: 20, to: 22 },
        },
      ],
    },
  });
  const original = now();
  const steps = history();
  const r = await call("place_insert", { insert_id: "video-a2-retomada-K1" });
  assert.equal(r.ok, true, r.text);
  assert.match(r.text, /Dedé \[[^\]]+\] 0:22\.5–0:24\.9/);
  assert.match(r.text, /sem procurar pausa e sem mover nada/);
  assert.equal(history(), steps + 1);
  const silence = await call("set_voice_rule", {});
  assert.match(silence.text, /Professora calada em: 0:22\.5–0:24\.9\./);
  assert.deepEqual(
    now().clips.filter((c) => original.clips.some((o) => o.id === c.id)),
    original.clips,
    "nada se moveu",
  );
  assert.equal((await call("undo", {})).ok, true);
  assert.deepEqual(now().clips, original.clips);
  assert.deepEqual(now().tracks, original.tracks);
  // Em place_inserts também, e uma linha que ainda não foi achada é dita.
  const many = await call("place_inserts", { insert_ids: ["video-a2-retomada-K1"], mode: "apply" });
  assert.equal(many.ok, true, many.text);
});

/**
 * Seção 4 do roteiro do Farol (o mesmo de tests/inserts.test.ts): a narração da professora, com
 * uma pausa longa onde a F1P4-D01 cabe, o vídeo da Debinha com as falas dela e uma linha da
 * tabela kids (o Dedé no lugar das primeiras palavras da professora).
 */
function farolComKids(): { project: Project; files: Map<string, Transcript> } {
  const text = readFileSync(new URL("./fixtures/roteiro-farol-dia1.md", import.meta.url), "utf8");
  const items = speechItems(parseScript(text).sections[3]);
  const say = (text: string, from: number): Word[] =>
    text
      .split(/\s+/)
      .filter(Boolean)
      .map((w, i) => ({ text: w, start: from + i * 0.4, end: from + i * 0.4 + 0.3, p: 0.9 }));
  const transcriptOf = (words: Word[], duration: number): Transcript => ({
    version: 1,
    model: "m",
    language: "pt",
    duration,
    words,
    silences: [],
  });
  const words: Word[] = [];
  let at = 0;
  items.forEach((item, k) => {
    if (item.avatar) return;
    words.push(...say(item.text, at));
    at = words[words.length - 1].end + (items[k + 1]?.insertId === "F1P4-D01" ? 6 : 0.8);
  });
  const debinha = items.filter((i) => i.avatar).flatMap((item, k) => say(item.text, 1 + k * 6));
  const project: Project = {
    ...lesson("farol"),
    script: { text, section: 3, confirmed: true },
    assets: [
      asset("tela", "video", { duration: 600 }),
      asset("voz", "audio", { duration: 600, transcript: "voz.json", transcriptStatus: "ready" }),
      asset("deb", "video", {
        duration: 20,
        width: 1080,
        height: 1920,
        transcript: "deb.json",
        transcriptStatus: "ready",
      }),
      asset("dede", "video", { name: "Dedé", duration: 5 }),
    ],
    tracks: [track("v1", "video", { name: "Tela" }), track("a1", "audio", { name: "Voz" })],
    clips: [
      { id: "cv", assetId: "tela", trackId: "v1", start: 0, in: 0, duration: at, volume: 1 },
      { id: "ca", assetId: "voz", trackId: "a1", start: 0, in: 0, duration: at, volume: 1 },
    ],
    kids: {
      videos: ["dede"],
      pieces: [
        {
          id: "video-d1-andar-K1",
          character: "Dedé",
          assetId: "dede",
          in: 0,
          out: 1.2,
          voice: { assetId: "voz", from: 0, to: 1.1 },
        },
      ],
    },
  };
  return {
    project,
    files: new Map([
      ["voz.json", transcriptOf(words, at)],
      ["deb.json", transcriptOf(debinha, 20)],
    ]),
  };
}

test("vozes: place_inserts com uma linha kids e uma fala do avatar coloca as duas, num passo", async () => {
  const { project, files } = farolComKids();
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const name = decodeURIComponent(String(url).replace("media://local/", ""));
    const t = files.get(name);
    return { ok: !!t, status: t ? 200 : 404, json: async () => t };
  }) as typeof fetch;
  try {
    open(project);
    const steps = history();
    const r = await call("place_inserts", {
      insert_ids: ["video-d1-andar-K1", "F1P4-D01"],
      mode: "apply",
    });
    assert.equal(r.ok, true, r.text);
    assert.equal(history(), steps + 1, "um passo só");
    const dede = now().clips.filter((c) => c.assetId === "dede");
    const deb = now().clips.filter((c) => c.assetId === "deb");
    assert.equal(dede.length, 1, "a linha kids continua na aula");
    assert.equal(deb.length, 1, "a fala do avatar entrou");
    assert.ok(
      now().tracks.some((t) => t.id === dede[0].trackId),
      "a faixa do Dedé existe",
    );
    assert.match(r.text, new RegExp(`Dedé \\[${dede[0].id}\\]`), "o id dito é o que ficou");
  } finally {
    globalThis.fetch = fetchBefore;
  }
});

/** A Aula02 com as faixas na ordem do editor: Faixa 6, 5, 4 (avatar), 3 (tela, travada), áudios. */
function aula02Faixas(): Project {
  const p = aula02Vozes();
  return {
    ...p,
    tracks: [
      track("f6", "video", { name: "Faixa 6" }),
      track("f5", "video", { name: "Faixa 5" }),
      track("tw8hjtowq0mpy", "video", { name: "Faixa 4" }),
      track("f3", "video", { name: "Faixa 3", locked: true }),
      track("f2", "audio", { name: "Narração guiada", muted: true }),
      track("f1", "audio", { name: "Som da página" }),
    ],
    clips: p.clips.map((c) => (c.trackId === "f4" ? { ...c, trackId: "tw8hjtowq0mpy" } : c)),
  };
}
const trackOrder = () => now().tracks.map((x) => x.id);

test("faixas: com a Faixa 4 selecionada, add_track abaixo e acima; get_overview mostra; desfazer remove", async () => {
  open(aula02Faixas());
  const original = now();
  // Sem seleção, recusa e explica.
  const none = await call("add_track", { position: "below" });
  assert.equal(none.ok, false);
  assert.match(none.text, /Nenhuma faixa selecionada/);
  const first = await call("get_overview", {});
  assert.match(first.text, /^Seleção: nenhuma\n/);
  // The tracks come in the same answer, never in a structured copy that a client reads alone.
  assert.match(first.text, /\nFaixas:\n/);
  assert.equal("structured" in first, false);

  useProject.getState().selectTrack("tw8hjtowq0mpy");
  const steps = history();
  const below = await call("add_track", { position: "below" });
  assert.equal(below.ok, true, below.text);
  const id = /Faixa nova \[([^\]]+)\]/.exec(below.text)?.[1] ?? "";
  assert.deepEqual(trackOrder(), ["f6", "f5", "tw8hjtowq0mpy", id, "f3", "f2", "f1"]);
  assert.equal(now().tracks.find((x) => x.id === id)?.kind, "video");
  assert.equal(now().tracks.find((x) => x.id === id)?.name, "Faixa 7");
  assert.deepEqual(now().clips, original.clips, "os clipes ficam nos mesmos tempos e posições");
  assert.equal(history(), steps + 1);
  assert.match(below.text, /← esta/);

  const above = await call("add_track", { position: "above", track_id: "tw8hjtowq0mpy" });
  assert.equal(above.ok, true, above.text);
  const id2 = /Faixa nova \[([^\]]+)\]/.exec(above.text)?.[1] ?? "";
  assert.deepEqual(trackOrder(), ["f6", "f5", id2, "tw8hjtowq0mpy", id, "f3", "f2", "f1"]);

  const overview = await call("get_overview", {});
  assert.match(overview.text, /^Seleção: faixa \[tw8hjtowq0mpy\] Faixa 4\n/);
  assert.match(overview.text, new RegExp(`\\[${id2}\\] F6 Faixa 8: vazia`));
  assert.match(overview.text, new RegExp(`\\[${id}\\] F4 Faixa 7: vazia`));
  assert.equal("structured" in overview, false);

  // Só clipes selecionados: a faixa é a do primeiro clipe.
  useProject.getState().select(["prof2", "pag1"]);
  const clips = await call("get_overview", {});
  assert.match(
    clips.text,
    /^Seleção: faixa \[tw8hjtowq0mpy\] Faixa 4; clipes \[prof2\], \[pag1\]\n/,
  );

  // Desfazer remove a faixa criada, uma de cada vez.
  assert.equal((await call("undo", {})).ok, true);
  assert.deepEqual(trackOrder(), ["f6", "f5", "tw8hjtowq0mpy", id, "f3", "f2", "f1"]);
  assert.equal((await call("undo", {})).ok, true);
  assert.deepEqual(now().tracks, original.tracks);
});

test("faixas: move_track, rename_track, remove_track (só vazia), set_track; revisão velha recusada", async () => {
  open(aula02Faixas());
  const original = now();
  const stale = await call("rename_track", { track_id: "f5", label: "Personagens", revision: 0 });
  assert.equal(stale.ok, false);
  assert.match(stale.text, /mudou desde a leitura/);
  const named = await call("rename_track", {
    track_id: "f5",
    label: "Personagens",
    revision: revision(),
  });
  assert.equal(named.ok, true, named.text);
  const moved = await call("move_track", {
    track_id: "f1",
    position: "above",
    reference_track_id: "f2",
  });
  assert.equal(moved.ok, true, moved.text);
  assert.deepEqual(trackOrder().slice(-2), ["f1", "f2"]);
  const lockedMove = await call("move_track", {
    track_id: "f3",
    position: "above",
    reference_track_id: "f6",
  });
  assert.equal(lockedMove.ok, false);
  assert.match(lockedMove.text, /travada/);
  const full = await call("remove_track", { track_id: "tw8hjtowq0mpy" });
  assert.equal(full.ok, false);
  assert.match(full.text, /tem 2 clipes/);
  const flags = await call("set_track", { track_id: "f3", locked: false, hidden: true });
  assert.equal(flags.ok, true, flags.text);
  assert.match(flags.text, /destravada, oculta/);
  const empty = await call("remove_track", { track_id: "f5" });
  assert.equal(empty.ok, true, empty.text);
  assert.ok(!trackOrder().includes("f5"));
  assert.deepEqual(now().clips, original.clips);
  // Também no assistente do painel lateral.
  const side = await call(
    "set_track",
    { track_id: "f6", muted: true },
    { source: "assistant", projectId: "aula02" },
  );
  assert.equal(side.ok, true, side.text);
  assert.equal((await call("undo", { steps: 5 })).ok, true);
  assert.deepEqual(now().tracks, original.tracks);
});

test('export_video com split "clips": uma pasta, "Parte 1" a "Parte N", todas na fila de uma vez', async () => {
  const { useExportQueue } = await import("../src/renderer/src/state/exportQueue.ts");
  const { exportQueue } = await import("../src/renderer/src/state/exportQueue.ts");
  // Duas gravações de tela cortadas pela limpeza na faixa v; a fila não começa a exportar aqui.
  const rec = (id: string) => asset(id, "video", { recording: { id, role: "screen" } });
  open(
    lesson("p1", {
      name: "Aula02 gravação automática",
      assets: [rec("t1"), rec("t2"), asset("mic", "audio")],
      clips: [
        { id: "a", assetId: "t1", trackId: "v", start: 0, in: 0, duration: 20, volume: 1 },
        { id: "b", assetId: "t1", trackId: "v", start: 20, in: 25, duration: 10, volume: 1 },
        { id: "c", assetId: "t2", trackId: "v", start: 31, in: 0, duration: 29, volume: 1 },
        { id: "m", assetId: "mic", trackId: "a", start: 0, in: 0, duration: 60, volume: 1 },
      ],
    }),
  );
  exportQueue.hold(true);
  const folders: string[] = [];
  Object.assign(api, {
    pickFolder: async (title: string) => {
      folders.push(title);
      return "D:\\Partes";
    },
    exists: async (paths: string[]) => paths.map(() => false),
    // The queue keeps what it has for the next time the app opens.
    exportQueue: { save: async () => {} },
  });
  try {
    const before = useExportQueue.getState().items.length;
    const r = await call("export_video", {
      preset: "draft",
      formats: ["captions"],
      split: "clips",
      track_id: "v",
    });
    assert.equal(r.ok, true, r.text);
    assert.deepEqual(folders, ["Onde salvar as 2 partes"], "uma janela de pasta só");
    const items = useExportQueue.getState().items.slice(before);
    assert.deepEqual(
      items.map((i) => i.spec.outPath),
      [
        "D:\\Partes\\Aula02 gravação automática - Parte 1.mp4",
        "D:\\Partes\\Aula02 gravação automática - Parte 2.mp4",
      ],
    );
    // Cada parte é o seu trecho da aula: 0–31 s e 31–60 s.
    assert.deepEqual(
      items.map((i) => Math.round(Math.max(...i.project.clips.map((c) => c.start + c.duration)))),
      [31, 29],
    );
    assert.ok(items.every((i) => i.extras?.platform === false && i.extras?.translations === false));
    assert.match(r.text, /2 partes na fila/);
    const status = await call("get_export_status", {});
    assert.match(status.text, /Parte 1\.mp4[\s\S]*Parte 2\.mp4/);
    // Pedidos que não fazem sentido são recusados antes de qualquer janela.
    const both = await call("export_video", {
      preset: "draft",
      range: { from: 0, to: 5 },
      split: "clips",
      track_id: "v",
    });
    assert.equal(both.ok, false);
    const platform = await call("export_video", {
      preset: "draft",
      formats: ["platform"],
      split: "clips",
      track_id: "v",
    });
    assert.equal(platform.ok, false);
    assert.match(platform.text, /As partes saem sem o pacote da plataforma/);
    assert.deepEqual(folders.length, 1);
  } finally {
    for (const i of useExportQueue.getState().items) exportQueue.remove(i.id);
    exportQueue.hold(false);
  }
});
