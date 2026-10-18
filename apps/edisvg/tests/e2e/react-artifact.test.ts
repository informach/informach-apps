import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { emptyBehavior } from "@informach/edi-motion/behavior";
import { strFromU8, unzipSync } from "fflate";
import { chromium } from "playwright";
import ts from "typescript";
import { build } from "vite";
import { applyAsset } from "../../src/shared/assets";
import { executeDocumentTransaction } from "../../src/shared/documentCommands";
import { newProject } from "../../src/shared/project";
import { editScene } from "../../src/shared/scene.js";
import { audioFixture, fontFixture, mathFontFixture, sliceImageFixture } from "../assetFixtures";
import { gradientFixture } from "../gradientFixture";
import { rendererServer } from "../rendererServer";

test("downloaded React ZIP compiles in an independent typed host and runs the real runtime without workspace packages or network", {
  timeout: 60000,
}, async () => {
  const project = newProject(),
    board = project.artboards[0];
  if (!board) throw new Error("Missing board");
  const node = editScene(board.scene, null, "add", "text");
  if (!node) throw new Error("Missing text");
  editScene(board.scene, node, "semantics", {
    kind: "image",
    label: "Texto exportado com significado",
    description: "Descrição portátil criada pelo autor.",
  });
  const asset = sliceImageFixture();
  applyAsset(project, board.scene, { type: "asset", operation: "put", value: asset });
  const font = fontFixture(),
    fallback = mathFontFixture();
  applyAsset(project, board.scene, { type: "asset", operation: "put", value: font });
  applyAsset(project, board.scene, { type: "asset", operation: "put", value: fallback });
  applyAsset(project, board.scene, {
    type: "asset",
    operation: "set-font",
    assetId: font.id,
    fontFallbackIds: [fallback.id],
    targetId: node,
  });
  const sliced = applyAsset(project, board.scene, {
    type: "asset",
    operation: "insert-image",
    assetId: asset.id,
  });
  if (!sliced) throw new Error("Missing sliced image");
  editScene(board.scene, sliced, "attrs", { x: "0", y: "0", width: "100", height: "60" });
  editScene(board.scene, sliced, "image-slice", { top: 10, right: 10, bottom: 10, left: 10 });
  applyAsset(project, board.scene, { type: "asset", operation: "insert-image", assetId: asset.id });
  const gradient = gradientFixture().gradient,
    painted = editScene(board.scene, null, "add", {
      tag: "rect",
      attrs: { x: "0", y: "100", width: "100", height: "50" },
    });
  if (!painted) throw new Error("Missing gradient shape");
  editScene(board.scene, painted, "gradients", { fill: gradient });
  const clipping = editScene(board.scene, null, "add", {
    tag: "path",
    attrs: { d: "M0 100L100 100L100 150L0 150Z" },
  });
  if (!clipping) throw new Error("Missing exported clipping source");
  editScene(board.scene, clipping, "visibility", false);
  const nativeMask = editScene(board.scene, null, "add", {
    tag: "circle",
    attrs: { cx: "50", cy: "125", r: "60" },
  });
  if (!nativeMask) throw new Error("Missing exported native mask");
  editScene(board.scene, nativeMask, "visibility", false);
  editScene(board.scene, painted, "effects", {
    clip: { sourceId: clipping, rule: "nonzero" },
    mask: { sourceId: nativeMask, rule: "nonzero", opacity: 0.5 },
  });
  project.motion = {
    version: 2,
    animations: [
      {
        id: "animation-react",
        name: "Movimento",
        fps: 60,
        frames: 60,
        mode: "loop",
        tracks: [
          {
            id: "track-x",
            targetId: node,
            property: "x",
            keys: [
              { id: "key-a", frame: 0, value: 0, easing: "linear" },
              { id: "key-b", frame: 60, value: 100, easing: "linear" },
            ],
          },
        ],
      },
    ],
  };
  const tone = audioFixture();
  board.rig = {
    version: 3,
    bones: [],
    constraints: [],
    targets: [],
    trims: [
      {
        id: "trim-react-clip",
        targetId: clipping,
        start: 0,
        end: 1,
        offset: 0,
        tolerance: 0.001,
        mode: "parallel",
      },
    ],
    parameterClips: [
      {
        animationId: "animation-react",
        tracks: [
          {
            id: "track-react-trim",
            targetId: "trim-react-clip",
            property: "end",
            keys: [
              { id: "key-react-trim-zero", frame: 0, value: 0, easing: "linear" },
              { id: "key-react-trim-full", frame: 60, value: 1, easing: "linear" },
            ],
          },
        ],
      },
    ],
  };
  applyAsset(project, board.scene, { type: "asset", operation: "put", value: tone });
  board.behavior = {
    ...emptyBehavior(),
    events: [
      { id: "event-tone", animationId: "animation-react", frame: 15, name: "Som", data: {} },
    ],
  };
  board.audio = {
    version: 1,
    bindings: [
      {
        id: "audio-tone",
        eventId: "event-tone",
        assetId: tone.id,
        volume: 0.5,
        caption: "Confirmação exportada",
      },
    ],
  };
  editScene(
    board.scene,
    node,
    "text",
    '</script><script>throw new Error("injection")</script>\nمرحبا 𝒜',
  );
  editScene(board.scene, node, "text-layout", { lineHeight: 1.2 });
  const sessionId = crypto.randomUUID(),
    duplicated = executeDocumentTransaction(
      { project, sessionId, revision: 0 },
      {
        projectId: project.id,
        sessionId,
        revision: 0,
        commands: [{ type: "scene", operation: "duplicate", targetId: clipping }],
      },
    ),
    copiedClipId = duplicated.selected;
  assert.ok(copiedClipId);
  const server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.addInitScript(
      (project) => localStorage.setItem("edisvg-project", JSON.stringify(project)),
      duplicated.project,
    );
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    await page.locator('[data-action="test"]').click();
    await page.getByRole("button", { name: "Ativar áudio", exact: true }).waitFor();
    assert.equal(await page.locator(".behavior-test-preview defs image").count(), 1);
    assert.equal(await page.locator(".behavior-test-preview use").count(), 10);
    assert.equal(await page.locator(".behavior-test-preview [data-edi-slice]>svg").count(), 9);
    assert.equal(await page.locator(".behavior-test-preview linearGradient stop").count(), 2);
    assert.equal(
      await page.locator(".behavior-test-preview [data-edi-live-effects] clipPath").count(),
      1,
    );
    assert.equal(
      await page.locator(".behavior-test-preview text").getAttribute("font-family"),
      `edi-${font.id}, edi-${fallback.id}`,
    );
    await page.getByRole("button", { name: "Fechar teste", exact: true }).click();
    await page.locator('[data-action="export"]').click();
    await page.locator('[name="format"][value="react"]').check();
    const downloading = page.waitForEvent("download");
    await page.locator("#download").click();
    const download = await downloading,
      path = await download.path();
    if (!path) throw new Error("Missing ZIP");
    assert.match(download.suggestedFilename(), /\.react\.zip$/);
    const archive = unzipSync(new Uint8Array(await readFile(path))),
      files = new Map(
        Object.entries(archive).map(([key, value]) => [
          resolve("tests/react-artifact", key).replaceAll("\\", "/"),
          strFromU8(value),
        ]),
      );
    assert.deepEqual(
      Object.keys(archive).sort(),
      [
        "EdiAnimation.jsx",
        "EdiAnimation.d.ts",
        "edi-react-player.mjs",
        "README.md",
        "THIRD_PARTY_LICENSES.txt",
        "NextExample.tsx",
      ].sort(),
    );
    const entry = resolve("tests/react-artifact/consumer.tsx").replaceAll("\\", "/"),
      component = resolve("tests/react-artifact/EdiAnimation.jsx").replaceAll("\\", "/"),
      runtime = resolve("tests/react-artifact/edi-react-player.mjs").replaceAll("\\", "/");
    const source = `import {StrictMode,useRef} from "react";import {createRoot} from "react-dom/client";import EdiAnimation,{type EdiSvgHandle} from "./EdiAnimation.jsx";function App(){const ref=useRef<EdiSvgHandle>(null);return <EdiAnimation ref={ref} title="Arte exportada" fit="stretch" style={{width:400,height:240}} autoplay={false} onAudioCue={cue=>Reflect.set(window,"artifactCaption",cue.caption)} onReady={()=>Reflect.set(window,"artifactHandle",ref.current)}/>;} const host=document.getElementById("host");if(!host)throw new Error("Missing host");createRoot(host).render(<StrictMode><App/></StrictMode>);`;
    files.set(entry, source);
    const compilerOptions: ts.CompilerOptions = {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        jsx: ts.JsxEmit.ReactJSX,
        allowImportingTsExtensions: true,
        types: ["node"],
      },
      host = ts.createCompilerHost(compilerOptions),
      originalRead = host.readFile.bind(host),
      originalExists = host.fileExists.bind(host),
      originalDirectory = host.directoryExists?.bind(host),
      originalSource = host.getSourceFile.bind(host);
    host.readFile = (path) => files.get(path.replaceAll("\\", "/")) ?? originalRead(path);
    host.fileExists = (path) => files.has(path.replaceAll("\\", "/")) || originalExists(path);
    host.directoryExists = (path) =>
      [...files.keys()].some((file) => file.startsWith(`${path.replaceAll("\\", "/")}/`)) ||
      (originalDirectory?.(path) ?? false);
    host.getSourceFile = (path, language, onError, shouldCreate) => {
      const source = files.get(path.replaceAll("\\", "/"));
      return source === undefined
        ? originalSource(path, language, onError, shouldCreate)
        : ts.createSourceFile(path, source, language, true);
    };
    const contract = `import type {EdiSvgHandle as Actual} from "@informach/edi-motion/react";import type {EdiSvgHandle as Portable} from "./EdiAnimation.jsx";type Equal<A,B>=(<T>()=>T extends A?1:2) extends (<T>()=>T extends B?1:2)?true:false;declare const actual:Actual;declare const portable:Portable;const sourceHandle:Actual=portable;const exportedHandle:Portable=actual;const keys:Equal<keyof Actual,keyof Portable>=true;`;
    const contractFile = resolve("tests/react-artifact/contract.ts").replaceAll("\\", "/");
    files.set(contractFile, contract);
    const diagnostics = ts.getPreEmitDiagnostics(
      ts.createProgram([entry, contractFile], compilerOptions, host),
    );
    assert.deepEqual(
      diagnostics.map((value) => ts.flattenDiagnosticMessageText(value.messageText, "\n")),
      [],
    );
    const bundled = await build({
      configFile: false,
      logLevel: "error",
      define: { "process.env.NODE_ENV": JSON.stringify("development") },
      plugins: [
        {
          name: "actual-export-consumer",
          enforce: "pre",
          resolveId(id, importer) {
            if (resolve(id).replaceAll("\\", "/") === entry) return entry;
            if (importer === entry && id === "./EdiAnimation.jsx") return component;
            if (importer === component && id === "./edi-react-player.mjs") return runtime;
          },
          load(id) {
            return files.get(id);
          },
        },
      ],
      build: { write: false, lib: { entry, formats: ["iife"], name: "ReactArtifactConsumer" } },
    });
    const result = Array.isArray(bundled) ? bundled[0] : bundled;
    if (!result || !("output" in result)) throw new Error("Missing consumer bundle");
    const chunk = result.output.find((item) => item.type === "chunk");
    if (chunk?.type !== "chunk") throw new Error("Missing consumer script");
    const consumer = await browser.newPage(),
      requests: string[] = [];
    consumer.on("request", (request) => requests.push(request.url()));
    consumer.on("pageerror", (error) => errors.push(error.message));
    await consumer.setContent('<main id="host"></main>');
    await consumer.addScriptTag({ content: chunk.code });
    await consumer.waitForFunction(() => !!Reflect.get(window, "artifactHandle"));
    assert.equal(
      await consumer.locator(`[data-edi-object="${clipping}"]>path`).getAttribute("d"),
      "",
    );
    assert.equal(
      await consumer
        .locator("svg[aria-label='Arte exportada']")
        .getAttribute("preserveAspectRatio"),
      "none",
    );
    assert.equal(await consumer.locator("text tspan").count(), 2);
    assert.equal(await consumer.locator("svg script").count(), 0);
    assert.equal(await consumer.locator("svg defs image").count(), 1);
    assert.equal(await consumer.locator("svg use").count(), 10);
    assert.equal(await consumer.locator("[data-edi-slice]>svg").count(), 9);
    assert.equal(await consumer.locator("linearGradient stop").count(), 2);
    assert.equal(await consumer.locator("[data-edi-live-effects] clipPath").count(), 1);
    assert.equal(
      await consumer.locator("[data-edi-live-effects] mask circle").getAttribute("r"),
      "60",
    );
    assert.match(
      (await consumer.locator(`[data-edi-object="${painted}"]`).getAttribute("mask")) ?? "",
      /^url\(#edi-effect-live-/,
    );
    assert.match(
      (await consumer.locator(`[data-edi-object="${painted}"]>rect`).getAttribute("fill")) ?? "",
      /^url\(#edi-gradient-[a-f0-9]{64}\)$/,
    );
    assert.equal(
      await consumer.locator("text").getAttribute("font-family"),
      `edi-${font.id}, edi-${fallback.id}`,
    );
    const loaded = await consumer.evaluate(
      (ids) =>
        ids.every((id) =>
          [...document.fonts].some(
            (font) =>
              font.family.replace(/^["']|["']$/g, "") === `edi-${id}` && font.status === "loaded",
          ),
        ),
      [font.id, fallback.id],
    );
    assert.equal(loaded, true);
    const accessible = consumer.getByRole("img", {
      name: "Texto exportado com significado",
      exact: true,
    });
    assert.equal(await accessible.count(), 1);
    const cdp = await consumer.context().newCDPSession(consumer),
      tree = await cdp.send("Accessibility.getFullAXTree");
    assert.ok(
      tree.nodes.some(
        (item) =>
          !item.ignored &&
          item.name?.value === "Texto exportado com significado" &&
          item.description?.value === "Descrição portátil criada pelo autor.",
      ),
    );
    await cdp.detach();
    const pixel = await consumer.evaluate(async () => {
      const definition = [...document.querySelectorAll("svg defs")]
          .map((defs) => defs.outerHTML)
          .join(""),
        image = document.querySelector("svg use")?.parentElement?.cloneNode(true);
      if (!definition || !(image instanceof SVGElement)) throw new Error("Missing exported image");
      image.setAttribute("x", "0");
      image.setAttribute("y", "0");
      image.setAttribute("width", "8");
      image.setAttribute("height", "8");
      const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 8 8">${definition}${image.outerHTML}</svg>`,
        raster = new Image();
      const ready = new Promise<void>((resolve, reject) => {
        raster.onload = () => resolve();
        raster.onerror = () => reject(new Error("Exported SVG image did not decode"));
      });
      raster.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
      await ready;
      const canvas = document.createElement("canvas");
      canvas.width = 8;
      canvas.height = 8;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Missing pixel canvas");
      context.drawImage(raster, 0, 0);
      return [...context.getImageData(4, 4, 1, 1).data];
    });
    assert.deepEqual(pixel, [255, 0, 0, 255]);
    assert.match((await consumer.locator("text tspan").first().textContent()) ?? "", /injection/);
    await consumer.evaluate(() => {
      const value = Reflect.get(window, "artifactHandle");
      value.advance(0.5);
    });
    const trimmedLength = await consumer
      .locator(`[data-edi-object="${clipping}"]>path`)
      .evaluate((element) => {
        if (!(element instanceof SVGPathElement)) throw new Error("Missing exported trim source");
        return element.getTotalLength();
      });
    assert.ok(Math.abs(trimmedLength - 150) < 0.001, String(trimmedLength));
    assert.equal(
      await consumer.locator(`[data-edi-object="${copiedClipId}"]>path`).getAttribute("d"),
      await consumer.locator(`[data-edi-object="${clipping}"]>path`).getAttribute("d"),
    );
    assert.equal(
      await consumer.evaluate(() => Reflect.get(window, "artifactCaption")),
      "Confirmação exportada",
    );
    assert.equal(
      await consumer.evaluate(() => Reflect.get(window, "artifactHandle").inspectAudio().buffers),
      0,
    );
    await consumer.getByRole("button", { name: "Ativar áudio", exact: true }).waitFor();
    assert.match(
      (await consumer.getByLabel("Alternativas dos efeitos de áudio").textContent()) ?? "",
      /Confirmação exportada/,
    );
    assert.match(
      (await consumer.locator(`[data-edi-object="${node}"]`).getAttribute("transform")) ?? "",
      /translate\(50 0\)/,
    );
    assert.deepEqual(requests, []);
    assert.deepEqual(errors, []);
    await consumer.close();
  } finally {
    await browser.close();
    await server.close();
  }
});
