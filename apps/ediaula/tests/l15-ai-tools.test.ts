import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { Asset, Clip, Project, Track } from "../src/shared/types.ts";

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
