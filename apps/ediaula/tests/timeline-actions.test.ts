import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import type { Clip, Project, Track } from "../src/shared/types.ts";

/**
 * The timeline's actions as the person uses them (lib/actions.ts), on the editor's own store:
 * "Excluir o intervalo", Ctrl + drop, the order of the tracks and Mudar formato. Only what needs
 * a screen is left out: the pointer's picture (CursorLayer) and Path2D.
 */

const src = new URL("../src/", import.meta.url);
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/editor/CursorLayer")
      return {
        url: "data:text/javascript,export const loadCursorData=async()=>null;export const cursorFxOf=()=>({});",
        shortCircuit: true,
      };
    if (specifier.startsWith("@shared/"))
      return { url: new URL(`shared/${specifier.slice(8)}.ts`, src).href, shortCircuit: true };
    if (specifier.startsWith("@/"))
      return {
        url: new URL(`renderer/src/${specifier.slice(2)}.ts`, src).href,
        shortCircuit: true,
      };
    if (
      specifier.startsWith("./") &&
      context.parentURL?.includes("/renderer/src/") &&
      !/\.[a-z]+$/i.test(specifier)
    )
      return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});
Object.assign(globalThis, {
  window: { api: { saveProject: async () => {} } },
  Path2D: class {},
});
const { actions } = await import("../src/renderer/src/lib/actions.ts");
const { useProject } = await import("../src/renderer/src/state/project.ts");
const { useApp } = await import("../src/renderer/src/state/app.ts");
const { usePlayback } = await import("../src/renderer/src/state/playback.ts");
hooks.deregister();

const track = (id: string, extra: Partial<Track> = {}): Track => ({
  id,
  kind: "video",
  name: id,
  muted: false,
  hidden: false,
  locked: false,
  ...extra,
});
const clip = (id: string, trackId: string, assetId: string, start: number, duration: number) =>
  ({ id, assetId, trackId, start, in: start, duration, volume: 1 }) satisfies Clip;

const lesson = (): Project => ({
  version: 1,
  id: "p",
  name: "Aula",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets: [
    {
      id: "tela",
      name: "tela",
      path: "C:/aulas/tela.mp4",
      kind: "video",
      duration: 600,
      width: 1920,
      height: 1080,
      fps: 30,
      hasVideo: true,
      hasAudio: true,
      size: 1,
      proxyStatus: "none",
      recording: { id: "r", role: "screen" },
    },
    {
      id: "mic",
      name: "mic",
      path: "C:/aulas/mic.wav",
      kind: "audio",
      duration: 600,
      width: 0,
      height: 0,
      fps: 0,
      hasVideo: false,
      hasAudio: true,
      size: 1,
      proxyStatus: "none",
      recording: { id: "r", role: "mic" },
    },
    {
      id: "song",
      name: "song",
      path: "C:/aulas/song.mp3",
      kind: "audio",
      duration: 600,
      width: 0,
      height: 0,
      fps: 0,
      hasVideo: false,
      hasAudio: true,
      size: 1,
      proxyStatus: "none",
    },
  ],
  tracks: [
    track("v"),
    track("voz", { kind: "audio" }),
    track("m", { kind: "audio", music: true }),
    track("fixa", { locked: true }),
  ],
  clips: [
    clip("tela", "v", "tela", 0, 60),
    clip("fala", "voz", "mic", 0, 60),
    clip("musica", "m", "song", 0, 60),
  ],
});
const on = (trackId: string): number[][] =>
  (useProject.getState().project?.clips ?? [])
    .filter((c) => c.trackId === trackId)
    .sort((a, b) => a.start - b.start)
    .map((c) => [c.start, c.duration, c.in].map((n) => Math.round(n * 1000) / 1000));

test("Excluir o intervalo cuts the screen and the voice on frames, and the music follows the end", () => {
  useProject.getState().load("C:/aulas/a.ediaula", lesson());
  // Off the frame grid, as a drag on the ruler leaves it.
  useApp.getState().set({ interval: { start: 10.012, end: 14.49 } });
  assert.equal(actions.rippleDeleteInterval(), true);
  assert.deepEqual(on("v"), [
    [0, 10, 0],
    [10, 45.5, 14.5],
  ]);
  assert.deepEqual(on("voz"), on("v"));
  assert.deepEqual(on("m"), [[0, 55.5, 0]]);
  assert.equal(useApp.getState().interval, null, "the interval is cleared once it is cut");
  assert.equal(usePlayback.getState().time, 10);
});

test("a protected passage refuses the cut and keeps the interval to try again", () => {
  useProject.getState().load("C:/aulas/a.ediaula", {
    ...lesson(),
    protected: [{ id: "pr", assetId: "mic", start: 12, end: 13, label: "Explicação" }],
  });
  usePlayback.setState({ time: 30 });
  const interval = { start: 10, end: 14 };
  useApp.getState().set({ interval });
  assert.equal(actions.rippleDeleteInterval(), false);
  assert.deepEqual(on("v"), [[0, 60, 0]]);
  assert.equal(useApp.getState().interval, interval);
  assert.equal(usePlayback.getState().time, 30, "the playhead stays where it was");
});

test("Ctrl + drop splits the screen and the voice at the point and pushes only them", () => {
  useProject.getState().load("C:/aulas/a.ediaula", lesson());
  const asset = { ...lesson().assets[0], id: "img", kind: "image" as const, duration: 0 };
  useProject.getState().commit((p) => ({ ...p, assets: [...p.assets, asset] }));
  actions.placeAssets([asset], lesson().tracks[0], 30, true);
  const screen = on("v");
  assert.equal(screen.length, 3);
  assert.deepEqual(
    [screen[0], screen[2]],
    [
      [0, 30, 0],
      [35, 30, 30],
    ],
  );
  assert.deepEqual(on("voz"), [
    [0, 30, 0],
    [35, 30, 30],
  ]);
  assert.deepEqual(on("m"), [[0, 65, 0]]);
});

test("a structural draft waiting for review holds the edits that move clips and tracks", () => {
  useProject.getState().load("C:/aulas/a.ediaula", lesson());
  // A draft that splits the screen: the clips on screen are not where the lesson has them.
  useProject.getState().writeDraft("teste", "Cortes", (p) => ({
    ...p,
    clips: [
      ...p.clips.filter((c) => c.id !== "tela"),
      clip("tela", "v", "tela", 0, 20),
      clip("tela-2", "v", "tela", 20, 40),
    ],
  }));
  const before = useProject.getState().project;
  useApp.getState().set({ interval: { start: 5, end: 8 } });
  assert.equal(actions.rippleDeleteInterval(), false);
  actions.moveTrack("m", 0);
  assert.equal(actions.reframe({ width: 1080, height: 1920, fps: 30 }, "fit"), false);
  assert.equal(useProject.getState().project, before, "nothing changed under the draft");
  assert.ok(useApp.getState().interval, "the interval waits too");
});

test("a locked track keeps its place; the others move around it", () => {
  useProject.getState().load("C:/aulas/a.ediaula", lesson());
  actions.moveTrack("fixa", 0);
  assert.equal(useProject.getState().project?.tracks[3].id, "fixa");
  actions.moveTrack("m", 0);
  assert.deepEqual(
    useProject.getState().project?.tracks.map((t) => t.id),
    ["m", "v", "voz", "fixa"],
  );
});

test("one clip of a group picked alone (Alt + click) is the only one deleted or cut", async () => {
  const grouped = lesson();
  grouped.clips = grouped.clips.map((c) =>
    c.id === "tela" || c.id === "fala" ? { ...c, groupId: "g" } : c,
  );
  useProject.getState().load("C:/aulas/a.ediaula", grouped);
  useProject.getState().select(["fala"]);
  actions.deleteSelection(false);
  const left = useProject.getState().project?.clips.map((c) => c.id) ?? [];
  assert.deepEqual(left.sort(), ["musica", "tela"]);
  // Ctrl+X takes only the selection too.
  useProject.getState().load("C:/aulas/a.ediaula", grouped);
  useProject.getState().select(["tela"]);
  const { copySelection, cutSelection } = await importClipboard();
  assert.equal(copySelection(), 1);
  cutSelection();
  assert.deepEqual((useProject.getState().project?.clips.map((c) => c.id) ?? []).sort(), [
    "fala",
    "musica",
  ]);
});

test("a track grouped with a locked one is not made magnetic, and the person is told why", () => {
  const grouped = lesson();
  grouped.clips = [
    ...grouped.clips.map((c) => (c.id === "tela" ? { ...c, groupId: "g" } : c)),
    { ...clip("logo", "fixa", "tela", 0, 60), groupId: "g" },
  ];
  useProject.getState().load("C:/aulas/a.ediaula", grouped);
  const messages: string[] = [];
  const toast = useApp.getState().toast;
  useApp.setState({ toast: (m: string) => void messages.push(m) });
  actions.toggleMagnetic("v");
  useApp.setState({ toast });
  assert.equal(
    useProject.getState().project?.tracks.find((t) => t.id === "v")?.magnetic,
    undefined,
  );
  assert.match(messages[0] ?? "", /travada fixa/);
});

async function importClipboard() {
  const again = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith("@shared/"))
        return { url: new URL(`shared/${specifier.slice(8)}.ts`, src).href, shortCircuit: true };
      if (specifier.startsWith("@/"))
        return {
          url: new URL(`renderer/src/${specifier.slice(2)}.ts`, src).href,
          shortCircuit: true,
        };
      return nextResolve(specifier, context);
    },
  });
  const mod = await import("../src/renderer/src/lib/clipboard.ts");
  again.deregister();
  return mod;
}
