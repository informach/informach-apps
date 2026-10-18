import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import type { Project } from "../src/shared/types.ts";

// The editor's store resolves the app's import aliases; here they point at the sources.
const src = new URL("../src/", import.meta.url);
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
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
Object.assign(globalThis, { window: { api: { saveProject: async () => {} } } });
const { draftView, useProject } = await import("../src/renderer/src/state/project.ts");
hooks.deregister();

test("a draft is shown as a commit would leave it: magnetic track packed, markers along", () => {
  const p: Project = {
    version: 1,
    id: "p",
    name: "Aula",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    assets: [
      {
        id: "v",
        name: "v",
        path: "C:/x/v.mp4",
        kind: "video",
        duration: 100,
        width: 1920,
        height: 1080,
        fps: 30,
        hasVideo: true,
        hasAudio: true,
        size: 1,
        proxyStatus: "none",
      },
    ],
    tracks: [
      {
        id: "V",
        kind: "video",
        name: "V",
        muted: false,
        hidden: false,
        locked: false,
        magnetic: true,
      },
    ],
    clips: [
      { id: "a", assetId: "v", trackId: "V", start: 0, in: 0, duration: 10, volume: 1 },
      { id: "b", assetId: "v", trackId: "V", start: 10, in: 20, duration: 10, volume: 1 },
    ],
    markers: [{ id: "m", t: 12, label: "Exercício" }],
  };
  useProject.getState().load(null as unknown as string, p);
  assert.equal(
    useProject.getState().writeDraft("teste", "Cortes", (q) => ({
      ...q,
      clips: q.clips.filter((c) => c.id !== "a"),
    })),
    true,
  );
  const shown = draftView().project;
  assert.equal(shown?.clips.find((c) => c.id === "b")?.start, 0);
  assert.equal(shown?.markers?.[0].t, 2);
  // The lesson itself waits for the review.
  assert.equal(useProject.getState().project?.clips.length, 2);
});
