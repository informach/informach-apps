import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { startPending } from "../src/shared/courseTemplate.ts";
import type { Clip, Project } from "../src/shared/types.ts";

/**
 * A lesson started from its course template gets its cards and its music when the first media
 * reaches the timeline (lib/courseStart.ts), as one Ctrl+Z. Drawing a card needs a canvas: here
 * the cards are plain clips of 3 s, added through the commit they are given, as addCard does.
 */

const stub = (code: string) => ({
  url: `data:text/javascript,${encodeURIComponent(code)}`,
  shortCircuit: true,
});
const src = new URL("../src/", import.meta.url);
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    const fromRenderer = context.parentURL?.includes("/renderer/src/");
    if (fromRenderer && specifier === "./annotations")
      return stub(`
        export async function addCard(where, texts, commit) {
          await new Promise((r) => setTimeout(r, 5));
          const id = "card-" + where;
          commit((q) => {
            const end = q.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
            const clips = where === "start" ? q.clips.map((c) => ({ ...c, start: c.start + 3 })) : q.clips;
            const card = { id, assetId: "card", trackId: q.tracks[0].id, start: where === "start" ? 0 : end,
              in: 0, duration: 3, volume: 1, annotation: { kind: "card", text: texts.text ?? where, color: "#111111" } };
            return { ...q, clips: [...clips, card] };
          });
          return id;
        }`);
    if (fromRenderer && specifier === "./importMedia")
      return stub("export async function importMedia() { return []; }");
    if (specifier.startsWith("@shared/"))
      return { url: new URL(`shared/${specifier.slice(8)}.ts`, src).href, shortCircuit: true };
    if (specifier.startsWith("@/"))
      return {
        url: new URL(`renderer/src/${specifier.slice(2)}.ts`, src).href,
        shortCircuit: true,
      };
    if (specifier.startsWith("./") && fromRenderer && !/\.[a-z]+$/i.test(specifier))
      return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});
Object.assign(globalThis, { window: { api: { saveProject: async () => {} } } });
const { useProject } = await import("../src/renderer/src/state/project.ts");
await import("../src/renderer/src/lib/courseStart.ts");
hooks.deregister();

const started = (): Project => ({
  version: 1,
  id: "p",
  name: "Aula 4",
  course: "Sistema Zero",
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
    },
    {
      id: "song",
      name: "Trilha",
      path: "C:/aulas/trilha.mp3",
      kind: "audio",
      duration: 10,
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
    { id: "v", kind: "video", name: "Tela", muted: false, hidden: false, locked: false },
    {
      id: "m",
      kind: "audio",
      name: "Música",
      muted: false,
      hidden: false,
      locked: false,
      music: true,
    },
  ],
  clips: [],
  pendingStart: {
    opening: true,
    closing: true,
    closingText: "Até a próxima",
    music: { assetId: "song", trackId: "m", volume: 0.3 },
  },
});

const screen: Clip = {
  id: "c",
  assetId: "tela",
  trackId: "v",
  start: 0,
  in: 0,
  duration: 25,
  volume: 1,
};

async function until(done: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !done(); i++) await new Promise((r) => setTimeout(r, 5));
  assert.ok(done(), "the start was completed");
}

test("the first media brings the cards and the music, and one Ctrl+Z takes them out", async () => {
  useProject.getState().load("C:/aulas/Aula 4.ediaula", started());
  useProject.getState().commit((p) => ({ ...p, clips: [screen] }));
  await until(() => !useProject.getState().project?.pendingStart);
  const p = useProject.getState().project;
  assert.ok(p);
  const at = (id: string) => p.clips.find((c) => c.id === id);
  assert.equal(at("card-start")?.start, 0);
  assert.equal(at("c")?.start, 3, "the opening pushes the lesson forward");
  assert.equal(at("card-end")?.start, 28);
  assert.equal(at("card-end")?.annotation?.text, "Até a próxima");
  // The music from 0:00 to the end, repeated, under the cards too.
  const music = p.clips
    .filter((c) => c.trackId === "m")
    .sort((a, b) => a.start - b.start)
    .map((c) => [c.start, c.duration, c.volume]);
  assert.deepEqual(music, [
    [0, 10, 0.3],
    [10, 10, 0.3],
    [20, 10, 0.3],
    [30, 1, 0.3],
  ]);
  // All of it is one step: the lesson is back to the screen alone, at 0:00.
  useProject.getState().undo();
  const back = useProject.getState().project;
  assert.deepEqual(
    back?.clips.map((c) => [c.id, c.start]),
    [["c", 0]],
  );
  // Taken out by hand: "Preparar aula" may offer the cards again, they are no longer on their way.
  assert.ok(back && !startPending(back));
  assert.ok(startPending(started()));
  // And the media already there does not bring them again.
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(useProject.getState().project?.clips.length, 1);
});
