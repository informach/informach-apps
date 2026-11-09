import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { Project } from "../src/shared/types.ts";

/*
 * The export queue of the editor (renderer/src/state/exportQueue.ts) with the main process
 * stood in for: an export cancelled while it is being prepared never reaches export:start, so
 * the chosen file is never written. The app's import aliases point at the sources; React
 * components become empty stand-ins, as nothing here draws.
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

/** What main is asked; `onExists` runs while the export checks the treated voice is on disk. */
const calls: string[] = [];
let onExists = (): void => {};
const api = {
  exists: async (paths: string[]) => {
    onExists();
    return paths.map(() => true);
  },
  startExport: async (id: string) => {
    calls.push(`start ${id}`);
  },
  cancelJob: async (id: string) => {
    calls.push(`cancel ${id}`);
  },
  exportQueue: { save: async () => {} },
  getGlossary: async () => [],
  saveProject: async () => {},
};
Object.assign(globalThis, { window: { api }, Path2D: class {} });
const { exportQueue, useExportQueue } = await import("../src/renderer/src/state/exportQueue.ts");
hooks.deregister();

/** A lesson of one treated voice: the export only checks its file is there before starting. */
const lesson = (): Project => ({
  version: 1,
  id: "p1",
  name: "Aula",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets: [
    {
      id: "voz",
      name: "voz",
      path: "C:\\aulas\\voz.wav",
      kind: "audio",
      duration: 10,
      width: 0,
      height: 0,
      fps: 0,
      hasVideo: false,
      hasAudio: true,
      size: 1,
      proxyStatus: "none",
      voicePreset: "teacher",
      treated: { path: "C:\\cache\\voz-tratada.wav", preset: "teacher", version: 3 },
    },
  ],
  tracks: [{ id: "a", kind: "audio", name: "Voz", muted: false, hidden: false, locked: false }],
  clips: [{ id: "c", assetId: "voz", trackId: "a", start: 0, in: 0, duration: 10, volume: 1 }],
});

/** Resolves when the queue has no export preparing or running any more. */
const settled = (): Promise<void> =>
  new Promise((resolve) => {
    const done = () =>
      !useExportQueue
        .getState()
        .items.some((i) => ["waiting", "preparing", "exporting"].includes(i.state));
    if (done()) return resolve();
    const stop = useExportQueue.subscribe(() => {
      if (!done()) return;
      stop();
      resolve();
    });
  });

test("an export cancelled while it is being prepared never starts, so the file is not written", async () => {
  calls.length = 0;
  // The person cancels while the export is checking the treated voice (an await of its own).
  onExists = () => exportQueue.cancel("e1");
  exportQueue.add({
    id: "e1",
    project: lesson(),
    spec: { outPath: "C:\\saida\\aula.m4a", audioOnly: true } as never,
  });
  await settled();
  onExists = () => {};
  assert.deepEqual(calls, ["cancel e1"], "main is told to cancel and export:start is never called");
  assert.equal(useExportQueue.getState().items.find((i) => i.id === "e1")?.state, "cancelled");
});
