import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { parseAnimationArtifact } from "@informach/edi-motion/animation-artifact";
import type { WebAnimationHandle } from "@informach/edi-motion/web-player/types";
import { chromium } from "playwright";
import { build } from "vite";
import type { Project } from "../src/shared/project";
import { parseProject } from "../src/shared/project";
import { flattenScene } from "../src/shared/scene.js";
import { rendererServer } from "../tests/rendererServer";

declare global {
  interface Window {
    __webAssets?: {
      exportFile(project: Project, options: unknown): Promise<{ content: string }>;
      mountFile(content: string): Promise<void>;
      advance(seconds: number): void;
      dispose(): Promise<void>;
      player: WebAnimationHandle | null;
    };
  }
}

const [sourceArgument, outputArgument] = process.argv.slice(2);
if (!sourceArgument || !outputArgument)
  throw new Error("Informe a pasta de projetos e uma pasta nova de saída.");
const source = resolve(sourceArgument),
  output = resolve(outputArgument);
const within = relative(source, output);
if (!within || (!within.startsWith("..") && !isAbsolute(within)))
  throw new Error("A saída não pode alterar a pasta de originais.");
await mkdir(output, { recursive: false });
const hash = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
const buildResult = await build({
  configFile: false,
  logLevel: "error",
  build: {
    write: false,
    emptyOutDir: false,
    minify: true,
    rolldownOptions: { output: { codeSplitting: false } },
    lib: {
      entry: resolve("src/renderer/src/player-web-poster.ts"),
      formats: ["es"],
      fileName: "exporter",
    },
  },
});
const bundleOutput = Array.isArray(buildResult) ? buildResult[0] : buildResult;
if (!bundleOutput || !("output" in bundleOutput)) throw new Error("Exportador não compilou.");
const chunk = bundleOutput.output.find((item) => item.type === "chunk");
if (chunk?.type !== "chunk" || chunk.imports.length || chunk.dynamicImports.length)
  throw new Error("Exportador não é independente.");
const runtime = await readFile("out/renderer/edi-web-player.mjs", "utf8");
const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><link rel="icon" href="data:,"><title>Prévia de animação</title><style>body{margin:0;background:#eff3f5;font:16px system-ui}main{padding:16px}svg#art{display:block;width:320px;height:320px;background:white;border:1px solid #dde3e8}h1{font-size:16px}</style><main><h1>Arte exportada</h1><svg id="art" xmlns="http://www.w3.org/2000/svg"></svg></main><script type="module">import {buildPlayerWebExportWithPoster} from '/exporter.mjs';import {mountWebAnimation} from '/player.mjs';const root=document.querySelector('#art');const api={player:null,exportFile:buildPlayerWebExportWithPoster,async mountFile(content){await api.dispose();api.player=await mountWebAnimation(root,content,{autoplay:false,pauseOffscreen:false});},advance(seconds){api.player.advance(seconds)},async dispose(){await api.player?.destroy();api.player=null;}};window.__webAssets=api;</script></html>`;
const server = await rendererServer(
  new Map([
    ["/assets-qa.html", { content: html, mime: "text/html" }],
    ["/exporter.mjs", { content: chunk.code, mime: "text/javascript" }],
    ["/player.mjs", { content: runtime, mime: "text/javascript" }],
  ]),
);
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const receipt: {
  startedAt: string;
  completedAt?: string;
  runtimeSha256: string;
  exports: Record<string, unknown>[];
  errors: string[];
  passed?: boolean;
} = { startedAt: new Date().toISOString(), runtimeSha256: hash(runtime), exports: [], errors: [] };
try {
  const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL;
  if (channel && !["chrome", "msedge"].includes(channel))
    throw new Error("Navegador fora do perfil.");
  browser = await chromium.launch(channel ? { channel } : {});
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  page.on("pageerror", (error) => receipt.errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("favicon.ico"))
      receipt.errors.push(message.text());
  });
  await page.goto(server.url + "/assets-qa.html");
  await page.waitForFunction(() => !!window.__webAssets);
  for (const file of (await readdir(source)).filter((name) => name.endsWith(".edisvg")).sort()) {
    const original = await readFile(resolve(source, file));
    const project = parseProject(JSON.parse(original.toString("utf8")));
    const boards = project.artboards.filter((board) => flattenScene(board.scene).length > 0);
    assert.ok(boards.length, `${file}: falta a prancheta com o desenho`);
    for (const [boardIndex, board] of boards.entries()) {
      const ids = new Set(flattenScene(board.scene).map(({ node }) => node.id));
      const clips = project.motion.animations.filter((clip) =>
        clip.tracks.some((track) => ids.has(track.targetId)),
      );
      const machines = board.behavior?.machines ?? [];
      const entries = machines.length ? [null] : clips.length ? clips : [null];
      for (const [clipIndex, clip] of entries.entries()) {
        const base = file
          .replace(/\.edisvg$/, "")
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9]+/g, "-")
          .toLowerCase();
        const name = `${base}-b${boardIndex + 1}-a${clipIndex + 1}`;
        const options = {
          format: "player-web",
          alt: `${file.replace(/\.edisvg$/, "")} · ${clip?.name ?? machines[0]?.name ?? "Pose"}`,
          reduced: true,
          offscreen: true,
          fit: "contain",
          artboardId: board.id,
          animationId: clip?.id ?? null,
          machineId: machines.length ? (board.behavior?.defaultMachineId ?? machines[0]?.id) : null,
        };
        const start = performance.now();
        const exported = await page.evaluate(
          async ({ project, options }) => {
            if (!window.__webAssets) throw new Error("Exportador não carregou.");
            return window.__webAssets.exportFile(project, options);
          },
          { project, options },
        );
        const artifact = parseAnimationArtifact(exported.content);
        assert.ok(artifact.poster, `${name}: falta a imagem de reserva`);
        await writeFile(resolve(output, name + ".edi-animation.json"), exported.content, {
          flag: "wx",
        });
        await page.evaluate(async (content) => {
          if (!window.__webAssets) throw new Error("Player ausente.");
          await window.__webAssets.mountFile(content);
        }, exported.content);
        const first = await page
          .locator("#art")
          .screenshot({ path: resolve(output, name + "-desktop.png") });
        const control = board.behavior?.inputs.find((value) => value.kind === "boolean");
        if (machines.length && control?.kind === "boolean")
          await page.evaluate(
            ({ name, value }) => window.__webAssets?.player?.setInput(name, value),
            { name: control.name, value: !control.initial },
          );
        if (clip || machines.length)
          await page.evaluate(
            (seconds) => window.__webAssets?.advance(seconds),
            clip ? Math.min(9, (clip.frames / clip.fps) * 0.61) : 2,
          );
        const next = await page
          .locator("#art")
          .screenshot({ path: resolve(output, name + "-desktop-next.png") });
        const desktopChanged = hash(first) !== hash(next);
        if (clip || machines.length)
          assert.ok(desktopChanged, `${name}: a animação precisa mudar o desenho após avançar`);
        await page.evaluate(async () => window.__webAssets?.dispose());
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(
          async (content) => window.__webAssets?.mountFile(content),
          exported.content,
        );
        await page.locator("#art").screenshot({ path: resolve(output, name + "-mobile.png") });
        await page.evaluate(async () => window.__webAssets?.dispose());
        await page.setViewportSize({ width: 900, height: 700 });
        receipt.exports.push({
          file,
          sourceSha256: hash(original),
          name,
          boardId: board.id,
          animationId: clip?.id ?? null,
          blueprint: artifact.document.version,
          bytes: Buffer.byteLength(exported.content),
          sha256: hash(exported.content),
          posterBytes: artifact.poster.byteLength,
          posterWidth: artifact.poster.width,
          posterHeight: artifact.poster.height,
          desktopChanged,
          elapsedMs: performance.now() - start,
        });
        await writeFile(resolve(output, "receipt.json"), JSON.stringify(receipt, null, 2));
        console.log(JSON.stringify(receipt.exports.at(-1)));
      }
    }
    assert.equal(
      hash(await readFile(resolve(source, file))),
      hash(original),
      "O original mudou durante a conferência",
    );
  }
  receipt.passed = receipt.errors.length === 0;
} catch (error) {
  receipt.passed = false;
  receipt.errors.push(error instanceof Error ? error.message : String(error));
  throw error;
} finally {
  await browser?.close();
  await server.close();
  receipt.completedAt = new Date().toISOString();
  await writeFile(resolve(output, "receipt.json"), JSON.stringify(receipt, null, 2));
}
if (!receipt.passed) throw new Error("A conferência teve erros de navegador.");
