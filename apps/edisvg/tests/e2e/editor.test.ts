import assert from "node:assert/strict";
import { mkdir, readFile, realpath } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { test } from "node:test";
import {
  applyMotionCommands,
  evaluateAnimation,
  type Track,
  transformMatrix,
} from "@informach/edi-motion";
import type { createSvgPlayer } from "@informach/edi-motion/runtime";
import { chromium, type Page } from "playwright";
import { build } from "vite";
import { buildClipExport } from "../../src/renderer/src/clipExport";
import { parsePath } from "../../src/shared/pathGeometry.js";
import { newProject, PROJECT_VERSION } from "../../src/shared/project";
import { editScene, renderScene } from "../../src/shared/scene.js";

declare global {
  interface Window {
    ediSVGPlayer?: ReturnType<typeof createSvgPlayer>;
  }
}

async function snapshot(page: Page) {
  const project = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("edisvg-project") ?? "null"),
  );
  return { ...project, scene: project?.artboards?.[0]?.scene };
}

test("built renderer preserves work, navigation undo and actual exported HTML", {
  timeout: 60_000,
}, async () => {
  const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL;
  if (channel && !["msedge", "chrome"].includes(channel))
    throw new Error("Unsupported test browser channel");
  const root = await realpath(resolve("out/renderer"));
  const mime: Record<string, string> = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
  };
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const file = await realpath(
        resolve(
          root,
          `.${decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)}`,
        ),
      );
      const child = relative(root, file);
      if (child.startsWith("..") || isAbsolute(child)) {
        response.writeHead(403).end();
        return;
      }
      response.writeHead(200, {
        "Content-Type": `${mime[extname(file)] ?? "application/octet-stream"}; charset=utf-8`,
      });
      response.end(await readFile(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind");
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch(channel ? { channel } : {});
    const page = await browser.newPage({
      viewport: { width: 1600, height: 960 },
      acceptDownloads: true,
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.locator(".scene-artwork>svg").waitFor();
    assert.equal(await page.locator('[data-action="auto"]').isDisabled(), true);
    await page.locator('[data-action="tool-shapes"]').click();
    const box = await page.locator(".scene-artwork>svg").boundingBox();
    if (!box) throw new Error("Missing artboard");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2 + 45, { steps: 5 });
    await page.mouse.up();
    const x = page.locator('[data-scene-transform="x"]');
    await x.fill("42");
    await x.press("Tab");
    const beforeWorkspace = await snapshot(page);
    await page.keyboard.press("Control+k");
    await page.getByLabel("Buscar comando", { exact: true }).fill("ajuda");
    await page.getByLabel("Buscar comando", { exact: true }).press("Enter");
    await page.locator("#help-dialog[open]").waitFor();
    await page.keyboard.press("Escape");
    assert.deepEqual(await snapshot(page), beforeWorkspace);
    await page.locator('[data-action="object"]').click();
    await page.locator('[data-command="object-duplicate"]').waitFor();
    await page.keyboard.press("Escape");
    await page.locator("[data-object]").first().click({ button: "right" });
    await page.locator('[data-command="object-delete"]').waitFor();
    await page.keyboard.press("Escape");
    const resize = page.getByRole("separator", { name: "Redimensionar hierarquia", exact: true }),
      oldWidth = Number(await resize.getAttribute("aria-valuenow"));
    await resize.focus();
    await resize.press("ArrowRight");
    assert.equal(Number(await resize.getAttribute("aria-valuenow")), oldWidth + 10);
    const resizeBox = await resize.boundingBox();
    if (!resizeBox) throw new Error("Missing panel resizer");
    await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + 30);
    await page.mouse.down();
    await page.mouse.move(resizeBox.x + 50, resizeBox.y + 30, { steps: 3 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.equal(Number(await resize.getAttribute("aria-valuenow")), oldWidth + 10);
    assert.deepEqual(
      await snapshot(page),
      beforeWorkspace,
      "Panel and command navigation never consume content undo",
    );
    await page.locator('[data-action="animate"]').click();
    await page.locator("#animation-select").selectOption("Pular");
    await x.fill("43");
    await x.press("Tab");
    await page.locator('[data-action="undo"]').click();
    assert.equal((await snapshot(page)).scene.nodes[0].transform.x, 42);
    assert.equal(await page.locator("#animation-select").inputValue(), "Pular");
    assert.ok(
      (await page.locator('[data-action="animate"]').getAttribute("class"))?.includes("active"),
    );
    await page.reload();
    await page.locator(".scene-artwork>svg").waitFor();
    assert.equal((await snapshot(page)).scene.nodes[0].transform.x, 42);
    await page.locator("#loop-mode").selectOption("loop");
    await page.locator('[data-action="export"]').click();
    assert.doesNotMatch(await page.locator("#export-dialog").innerText(), /Zezé · máquina/);
    const downloading = page.waitForEvent("download");
    await page.locator("#download").click();
    const download = await downloading;
    const path = await download.path();
    if (!path) throw new Error("No actual HTML download");
    const html = await readFile(path, "utf8");
    assert.match(html, /"name":"Pular"/);
    assert.match(html, /"mode":"loop"/);
    const exported = await browser.newPage();
    exported.on("pageerror", (error) => errors.push(error.message));
    await exported.setContent(html);
    await exported.locator("#play-toggle").click();
    const paused = await exported.locator(".motion").getAttribute("style");
    assert.ok(paused?.includes("translate(0px,"));
    assert.ok(html.includes('transform="translate(42 '));
    assert.equal(await exported.locator("#play-toggle").innerText(), "Reproduzir");
    await exported.locator("#play-toggle").click();
    await exported.waitForFunction(
      (previous) => document.querySelector(".motion")?.getAttribute("style") !== previous,
      paused,
    );
    const reduced = await browser.newPage({ reducedMotion: "reduce" });
    await reduced.clock.install({ time: 0 });
    await reduced.clock.pauseAt(0);
    await reduced.setContent(html);
    const still = await reduced.locator(".motion").getAttribute("style");
    await reduced.clock.runFor(2000);
    assert.equal(await reduced.locator(".motion").getAttribute("style"), still);
    // Real UI authoring, two independent objects, actual offline download.
    await page.locator('[data-action="design"]').click();
    await page.locator("[data-scene-select]").first().click();
    await page.locator('[data-inspector-section="organize"] > summary').click();
    await page.locator('[data-scene-operation="duplicate"]').click();
    const objects = (await snapshot(page)).scene.nodes;
    await page.locator(`[data-scene-select="${objects[0].id}"]`).click();
    await page.locator('[data-action="clip-new"]').click();
    await page.locator('#clip-dialog input[name="name"]').fill("Dois objetos");
    await page.locator('#clip-dialog input[name="fps"]').fill("24");
    await page.locator('#clip-dialog input[name="frames"]').fill("48");
    await page.locator('#clip-dialog [type="submit"]').click();
    assert.equal(await page.locator('[data-action="auto"]').isDisabled(), false);
    await page.locator('[data-action="add-key"]').click();
    await page.locator('[data-action="auto"]').click();
    await page.locator('[data-action="end"]').click();
    await page.locator('[data-scene-transform="x"]').fill("90");
    await page.locator('[data-scene-transform="x"]').press("Tab");
    await page.locator(`[data-scene-select="${objects[1].id}"]`).click();
    await page.locator('[data-action="start"]').click();
    await page.locator('[data-scene-transform="rotation"]').fill("10");
    await page.locator('[data-scene-transform="rotation"]').press("Tab");
    await page.locator('[data-action="end"]').click();
    await page.locator('[data-scene-transform="rotation"]').fill("90");
    await page.locator('[data-scene-transform="rotation"]').press("Tab");
    assert.equal((await snapshot(page)).motion.animations[0].tracks.length, 7);
    await page.locator('[data-action="undo"]').click();
    assert.equal((await snapshot(page)).motion.animations[0].tracks[6].keys.length, 1);
    await page.locator('[data-action="redo"]').click();
    assert.equal((await snapshot(page)).motion.animations[0].tracks[6].keys.length, 2);
    await page.locator('[data-action="export"]').click();
    const clipDownloading = page.waitForEvent("download");
    await page.locator("#download").click();
    const clipPath = await (await clipDownloading).path();
    if (!clipPath) throw new Error("No clip HTML download");
    const clipHtml = await readFile(clipPath, "utf8");
    const clipPage = await browser.newPage();
    clipPage.on("pageerror", (error) => errors.push(error.message));
    await clipPage.setContent(clipHtml);
    const pose = await clipPage.evaluate(
      (ids) => {
        const player = window.ediSVGPlayer;
        if (!player) throw new Error("Offline public player missing");
        player.pause();
        player.seek(1);
        return ids.map((id: string) =>
          document.querySelector(`[data-edi-object="${id}"]`)?.getAttribute("transform"),
        );
      },
      objects.map((object: { id: string }) => object.id),
    );
    assert.match(pose[0] ?? "", /^translate\(66 0\)/);
    assert.match(pose[1] ?? "", /rotate\(50\)/);
    await page.locator('[data-action="export"]').click();
    await page.locator('input[name="format"][value="svg"]').check();
    const svgDownloading = page.waitForEvent("download");
    await page.locator("#download").click();
    const svgPath = await (await svgDownloading).path();
    if (!svgPath) throw new Error("Missing animated SVG download");
    const clipSvg = await readFile(svgPath, "utf8");
    const svgPage = await browser.newPage();
    await svgPage.setContent(clipSvg);
    assert.equal(
      await svgPage.evaluate(
        (source) =>
          new DOMParser().parseFromString(source, "image/svg+xml").querySelector("parsererror")
            ?.textContent ?? null,
        clipSvg,
      ),
      null,
    );
    const smilPose = await svgPage.evaluate(
      (ids) => {
        const svg = document.querySelector("svg");
        if (!svg) throw new Error("Missing SVG");
        svg.pauseAnimations();
        svg.setCurrentTime(1);
        return ids.map((id: string) => {
          const group = document.querySelector(`[data-edi-object="${id}"]`);
          if (!(group instanceof SVGGElement)) throw new Error("Missing animated object");
          // animVal is read-only; consolidate() would mutate the transform list.
          let matrix = new DOMMatrix();
          for (let index = 0; index < group.transform.animVal.numberOfItems; index++)
            matrix = matrix.multiply(group.transform.animVal.getItem(index).matrix);
          return { x: matrix.e, a: matrix.a, b: matrix.b };
        });
      },
      objects.map((object: { id: string }) => object.id),
    );
    assert.ok(Math.abs((smilPose[0]?.x ?? NaN) - 66) < 1e-5);
    assert.ok(Math.abs((smilPose[1]?.a ?? NaN) - Math.cos((50 * Math.PI) / 180)) < 1e-5);
    assert.ok(Math.abs((smilPose[1]?.b ?? NaN) - Math.sin((50 * Math.PI) / 180)) < 1e-5);
    await svgPage.emulateMedia({ reducedMotion: "reduce" });
    assert.deepEqual(
      await svgPage.evaluate(() =>
        ["[data-edi-animated]", "[data-edi-still]"].map((selector) => {
          const element = document.querySelector(selector);
          if (!element) throw new Error("Missing reduced-motion SVG layer");
          return getComputedStyle(element).display;
        }),
      ),
      ["none", "inline"],
    );
    const authored = await snapshot(page);
    const xTrack: Track | undefined = authored.motion.animations[0].tracks.find(
      (track: Track) => track.targetId === objects[0].id && track.property === "x",
    );
    const lastKey = xTrack?.keys[1];
    assert.ok(xTrack);
    assert.ok(lastKey);
    await page.locator(`[data-clip-key="${lastKey.id}"]`).click();
    await page.locator('[data-action="edit-key"]').click();
    await page.locator('#clip-dialog input[name="frame"]').fill("36");
    await page.locator('#clip-dialog [type="submit"]').click();
    const dragKey = async (
      frame: number,
      cancel: "escape" | "pointercancel" | "blur" | "dispose" | false = false,
    ) => {
      const element = page.locator(`[data-clip-key="${lastKey.id}"]`);
      const start = await element.boundingBox(),
        trackBox = await page.locator(`[data-track-id="${xTrack.id}"]`).boundingBox();
      if (!start || !trackBox) throw new Error("Missing draggable key");
      const current = Number(await element.getAttribute("data-clip-frame"));
      await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        start.x + start.width / 2 + ((frame - current) / 48) * trackBox.width,
        start.y + start.height / 2,
        { steps: 5 },
      );
      if (cancel === "escape") await page.keyboard.press("Escape");
      if (cancel === "pointercancel") await element.dispatchEvent("pointercancel");
      if (cancel === "blur") await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      if (cancel === "dispose") await page.keyboard.press("ArrowRight");
      await page.mouse.up();
    };
    await dragKey(24);
    assert.equal((await snapshot(page)).motion.animations[0].tracks[0].keys[1].frame, 24);
    await page.locator('[data-action="undo"]').click();
    assert.equal((await snapshot(page)).motion.animations[0].tracks[0].keys[1].frame, 36);
    await page.locator('[data-action="redo"]').click();
    const beforeCanceledDrag = JSON.stringify(await snapshot(page));
    for (const reason of ["escape", "pointercancel", "blur", "dispose"] as const) {
      await dragKey(30, reason);
      assert.equal(JSON.stringify(await snapshot(page)), beforeCanceledDrag);
    }
    await dragKey(0);
    assert.equal(
      JSON.stringify(await snapshot(page)),
      beforeCanceledDrag,
      "Colliding key drag must not replace another key",
    );
    const firstKey = xTrack.keys[0];
    assert.ok(firstKey);
    await page.locator(`[data-clip-key="${firstKey.id}"]`).click();
    await page.locator('[data-action="edit-key"]').click();
    await page.locator('#clip-dialog select[name="easing"]').selectOption("cubic-bezier");
    await page.locator('#clip-dialog input[name="p0"]').fill("0.1");
    await page.locator('#clip-dialog input[name="p1"]').fill("0.8");
    await page.locator('#clip-dialog input[name="p2"]').fill("0.2");
    await page.locator('#clip-dialog input[name="p3"]').fill("1");
    const beforeCurveDraft = await snapshot(page);
    const handle = page.locator('[data-curve-handle="0"]');
    await handle.focus();
    await handle.press("ArrowRight");
    assert.ok(
      Math.abs(Number(await page.locator('#clip-dialog input[name="p0"]').inputValue()) - 0.11) <
        1e-9,
    );
    await handle.press("ArrowLeft");
    const handleBox = await handle.boundingBox();
    if (!handleBox) throw new Error("Missing Bézier handle");
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + 30, handleBox.y + 15, { steps: 3 });
    assert.deepEqual(await snapshot(page), beforeCurveDraft, "Curve handle is a dialog draft");
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.ok(
      Math.abs(Number(await page.locator('#clip-dialog input[name="p0"]').inputValue()) - 0.1) <
        1e-9,
    );
    await mkdir(resolve("../../.cache"), { recursive: true });
    await page.screenshot({ path: resolve("../../.cache/edisvg-key-curve.png") });
    await page.locator('#clip-dialog [type="submit"]').click();
    const curved = await snapshot(page);
    assert.deepEqual(curved.motion.animations[0].tracks[0].keys[0].easing, {
      kind: "cubic-bezier",
      points: [0.1, 0.8, 0.2, 1],
    });
    const expectedX = evaluateAnimation(curved.motion.animations[0], 12).get(objects[0].id)?.x;
    assert.ok(expectedX !== undefined);
    await page.locator('[data-action="export"]').click();
    const curvedDownloading = page.waitForEvent("download");
    await page.locator("#download").click();
    const curvedPath = await (await curvedDownloading).path();
    if (!curvedPath) throw new Error("Missing curved HTML download");
    const curvedPage = await browser.newPage();
    curvedPage.on("pageerror", (error) => errors.push(error.message));
    await curvedPage.setContent(await readFile(curvedPath, "utf8"));
    const actualX = await curvedPage.evaluate((id: string) => {
      const player = window.ediSVGPlayer;
      if (!player) throw new Error("Missing curved player");
      player.pause();
      player.seek(0.5);
      const group = document.querySelector(`[data-edi-object="${id}"]`);
      if (!(group instanceof SVGGElement)) throw new Error("Missing curved object");
      return group.transform.baseVal.getItem(0).matrix.e;
    }, objects[0].id);
    assert.ok(Math.abs(actualX - expectedX) < 1e-4);
    const keyPair = [
      curved.motion.animations[0].tracks[0].keys[0].id,
      curved.motion.animations[0].tracks[6].keys[0].id,
    ];
    const choosePair = async () => {
      await page.locator(`[data-clip-key="${keyPair[0]}"]`).click();
      await page.locator(`[data-clip-key="${keyPair[1]}"]`).click({ modifiers: ["Shift"] });
    };
    await choosePair();
    assert.equal(await page.locator('[data-clip-key][aria-pressed="true"]').count(), 2);
    const beforeKeys = await snapshot(page);
    for (const operation of ["move-keys", "copy-keys"]) {
      await page.locator('[data-action="retime-keys"]').click();
      await page.locator('#clip-dialog select[name="operation"]').selectOption(operation);
      await page.locator('#clip-dialog input[name="delta"]').fill("6");
      await page.locator('#clip-dialog [type="submit"]').click();
      const keys = (await snapshot(page)).motion.animations[0].tracks;
      for (const index of [0, 6])
        assert.ok(keys[index].keys.some((key: { frame: number }) => key.frame === 6));
      await page.locator('[data-action="undo"]').click();
      assert.deepEqual(await snapshot(page), beforeKeys);
      await choosePair();
    }
    await page.locator('[data-action="delete-key"]').click();
    assert.equal((await snapshot(page)).motion.animations[0].tracks[0].keys.length, 1);
    assert.equal((await snapshot(page)).motion.animations[0].tracks[6].keys.length, 1);
    await page.locator('[data-action="undo"]').click();
    assert.deepEqual(await snapshot(page), beforeKeys);
    await page.locator('[data-action="timeline-zoom-in"]').click();
    assert.equal((await snapshot(page)).version, PROJECT_VERSION);
    assert.deepEqual(await snapshot(page), beforeKeys, "Timeline zoom does not edit the document");
    await page.locator('[data-action="timeline-zoom-out"]').click();
    await page.locator('[data-action="onion"]').click();
    assert.ok((await page.locator("[data-onion-skin]").count()) > 0);
    assert.equal(
      await page
        .locator("[data-onion-skin] [data-object],[data-onion-skin] [data-edi-object]")
        .count(),
      0,
    );
    assert.deepEqual(await snapshot(page), beforeKeys);
    await page.locator('[data-action="onion"]').click();
    await page.locator('[data-action="clip-duplicate"]').click();
    const copied = await snapshot(page);
    assert.equal(copied.motion.animations.length, 2);
    assert.notEqual(
      copied.motion.animations[0].tracks[0].id,
      copied.motion.animations[1].tracks[0].id,
    );
    const copiedKeyId = copied.motion.animations[1].tracks[0].keys[0].id;
    await page.locator(`[data-clip-key="${copiedKeyId}"]`).click();
    await page.keyboard.press("Delete");
    assert.equal(
      (await snapshot(page)).scene.nodes.length,
      2,
      "Timeline Delete must not remove the selected object",
    );
    assert.equal((await snapshot(page)).motion.animations[1].tracks[0].keys.length, 1);
    await page.locator('[data-action="undo"]').click();
    await page.reload();
    await page.locator("#clip-select").waitFor();
    assert.equal((await snapshot(page)).motion.animations[0].tracks[6].keys.length, 2);
    await page.locator('[data-action="animate"]').click();
    await mkdir(resolve("../../.cache"), { recursive: true });
    await page.locator('[data-action="design"]').click();
    const layerRows = page.locator("[data-scene-select]");
    // A multi-object gesture previews only in DOM and commits one transaction.
    await layerRows.nth(0).locator(".layer-icon").click();
    await layerRows
      .nth(1)
      .locator(".layer-icon")
      .click({ modifiers: ["Shift"] });
    await page.locator('[data-action="tool-select"]').click();
    const beforeMove = await snapshot(page);
    const canvasObject = page.locator(`[data-object="${objects[0].id}"]`);
    const startMove = await canvasObject.boundingBox();
    if (!startMove) throw new Error("Missing canvas selection");
    await page.mouse.move(startMove.x + 8, startMove.y + 8);
    await page.mouse.down();
    await page.mouse.move(startMove.x + 38, startMove.y + 28, { steps: 4 });
    assert.deepEqual(await snapshot(page), beforeMove, "Gesture preview must not persist");
    await page.mouse.up();
    const afterMove = await snapshot(page);
    for (let i = 0; i < 2; i++) {
      assert.notEqual(afterMove.scene.nodes[i].transform.x, beforeMove.scene.nodes[i].transform.x);
      assert.notEqual(afterMove.scene.nodes[i].transform.y, beforeMove.scene.nodes[i].transform.y);
    }
    await page.locator('[data-action="undo"]').click();
    assert.deepEqual(await snapshot(page), beforeMove, "One undo restores the entire selection");
    for (const reason of ["escape", "pointercancel", "blur", "dispose"]) {
      const current = await canvasObject.boundingBox();
      if (!current) throw new Error("Missing cancel target");
      await page.mouse.move(current.x + 8, current.y + 8);
      await page.mouse.down();
      await page.mouse.move(current.x + 48, current.y + 28, { steps: 3 });
      if (reason === "escape") await page.keyboard.press("Escape");
      if (reason === "pointercancel")
        await page.locator(".scene-artwork>svg").dispatchEvent("pointercancel");
      if (reason === "blur") await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      if (reason === "dispose") await page.keyboard.press("ArrowRight");
      await page.mouse.up();
      assert.deepEqual(await snapshot(page), beforeMove, `Cancelled ${reason} must not mutate`);
    }
    await layerRows.nth(0).focus();
    await page.keyboard.press("Enter");
    await layerRows
      .nth(1)
      .locator(".layer-icon")
      .click({ modifiers: ["Shift"] });
    assert.equal(await page.locator('[data-scene-select][aria-pressed="true"]').count(), 2);
    await page.locator('[data-inspector-section="organize"] > summary').click();
    await page.locator('[data-composition="group"]').click();
    const groupedProject = await snapshot(page);
    assert.equal(groupedProject.scene.nodes.length, 1);
    const groupId = groupedProject.scene.nodes[0].id;
    assert.equal(groupedProject.scene.nodes[0].children.length, 2);
    assert.equal(groupedProject.motion.animations[0].tracks.length, 7);
    await page.locator('[data-scene-transform="rotation"]').fill("25");
    await page.locator('[data-scene-transform="rotation"]').press("Tab");
    const boundsFor = () =>
      page.locator(`[data-object="${objects[0].id}"]`).evaluate((element) => {
        const box = element.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      });
    const groupedBounds = await boundsFor();
    await page.locator('[data-composition="ungroup"]').click();
    assert.equal((await snapshot(page)).scene.nodes.length, 2);
    const ungroupedBounds = await boundsFor();
    for (const name of ["x", "y", "width", "height"] as const)
      assert.ok(Math.abs(groupedBounds[name] - ungroupedBounds[name]) < 0.01);
    assert.ok((await snapshot(page)).scene.nodes[0].basis);
    await page.locator('[data-action="undo"]').click();
    assert.equal((await snapshot(page)).scene.nodes[0].id, groupId);
    await page.locator('[data-action="redo"]').click();
    await page.reload();
    await page.locator(".scene-artwork>svg").waitFor();
    assert.ok((await snapshot(page)).scene.nodes[0].basis);
    await page.locator('[data-action="artboards"]').click();
    await page.locator("[data-artboard-create]").click();
    assert.equal((await snapshot(page)).artboards.length, 2);
    const newBoard = (await snapshot(page)).artboards[1];
    await page.getByLabel("Nome da prancheta", { exact: true }).fill("Botão responsivo");
    await page.getByLabel("Nome da prancheta", { exact: true }).press("Enter");
    await page.getByLabel("Largura", { exact: true }).fill("320");
    await page.getByLabel("Largura", { exact: true }).press("Enter");
    await page.getByLabel("Altura", { exact: true }).fill("80");
    await page.getByLabel("Altura", { exact: true }).press("Enter");
    assert.deepEqual((await snapshot(page)).artboards[1].scene.viewBox, [0, 0, 320, 80]);
    const beforeSwitch = await snapshot(page);
    await page.locator('[data-artboard-select="artboard-main"]').click();
    assert.deepEqual(
      await snapshot(page),
      beforeSwitch,
      "Switching boards must not mutate content",
    );
    await page.locator(`[data-artboard-select="${newBoard.id}"]`).click();
    await page.getByRole("button", { name: "Duplicar prancheta", exact: true }).click();
    assert.equal((await snapshot(page)).artboards.length, 3);
    await page.getByRole("button", { name: "Excluir prancheta", exact: true }).click();
    await page.getByRole("button", { name: "Cancelar exclusão", exact: true }).click();
    assert.equal((await snapshot(page)).artboards.length, 3);
    await page.getByRole("button", { name: "Excluir prancheta", exact: true }).click();
    await page
      .getByRole("button", { name: "Confirmar exclusão da prancheta", exact: true })
      .click();
    assert.equal((await snapshot(page)).artboards.length, 2);
    await page.locator('[data-action="undo"]').click();
    assert.equal((await snapshot(page)).artboards.length, 3);
    await page.locator('[data-action="redo"]').click();
    assert.equal((await snapshot(page)).artboards.length, 2);
    await page.reload();
    await page.locator("[data-artboard-panel]").waitFor();
    assert.equal((await snapshot(page)).artboards[1].name, "Botão responsivo");
    await page.screenshot({ path: resolve("../../.cache/edisvg-artboards.png") });
    await page.locator(`[data-artboard-select="${newBoard.id}"]`).click();
    await page.locator('[data-action="tool-shapes"]').click();
    const componentBox = await page.locator(".scene-artwork>svg").boundingBox();
    if (!componentBox) throw new Error("Missing component board");
    await page.mouse.move(
      componentBox.x + componentBox.width * 0.25,
      componentBox.y + componentBox.height * 0.25,
    );
    await page.mouse.down();
    await page.mouse.move(
      componentBox.x + componentBox.width * 0.5,
      componentBox.y + componentBox.height * 0.5,
      { steps: 3 },
    );
    await page.mouse.up();
    const sourceObject = (await snapshot(page)).artboards[1].scene.nodes[0];
    await page.locator('[data-action="clip-new"]').click();
    await page.locator('#clip-dialog input[name="name"]').fill("Componente animado");
    await page.locator('#clip-dialog input[name="fps"]').fill("24");
    await page.locator('#clip-dialog input[name="frames"]').fill("24");
    await page.locator('#clip-dialog button[type="submit"]').click();
    await page.locator('[data-action="start"]').click();
    await page.locator('[data-action="add-key"]').click();
    await page.locator('[data-action="end"]').click();
    await page.locator('[data-action="add-key"]').click();
    await page.locator('[data-scene-transform="x"]').fill("100");
    await page.locator('[data-scene-transform="x"]').press("Tab");
    const sourceClip = (await snapshot(page)).motion.animations.at(-1);
    await page.locator('[data-action="artboards"]').click();
    await page.locator('[data-artboard-select="artboard-main"]').click();
    await page.getByText("Reutilizar outra prancheta como componente", { exact: true }).click();
    await page.getByLabel("Componente de origem", { exact: true }).selectOption(newBoard.id);
    await page.getByLabel("Animação da instância", { exact: true }).selectOption(sourceClip.id);
    await page.getByLabel("Largura da instância", { exact: true }).fill("160");
    await page.getByLabel("Altura da instância", { exact: true }).fill("40");
    await page.locator("[data-component-create]").click();
    await page.locator("[data-instance-inspector]").waitFor();
    await page.getByLabel("Objeto do override", { exact: true }).selectOption(sourceObject.id);
    await page.getByLabel("Propriedade do override", { exact: true }).selectOption("fill");
    await page.getByLabel("Valor do override", { exact: true }).fill("#ff0000");
    await page.getByRole("button", { name: "Adicionar ao rascunho", exact: true }).click();
    assert.equal(
      (await snapshot(page)).scene.nodes.at(-1).instance.overrides.length,
      0,
      "Override draft must not mutate the document",
    );
    await page.getByRole("button", { name: "Aplicar instância", exact: true }).click();
    const withComponent = await snapshot(page),
      instanceId = withComponent.scene.nodes.at(-1).id;
    assert.equal(withComponent.scene.nodes.at(-1).instance.overrides[0].attrs.fill, "#ff0000");
    await page.locator("#clip-select").selectOption(withComponent.motion.animations[0].id);
    await page.locator('[data-action="export"]').click();
    const componentDownloading = page.waitForEvent("download");
    await page.locator("#download").click();
    const componentPath = await (await componentDownloading).path();
    if (!componentPath) throw new Error("Missing component export");
    const componentPage = await browser.newPage();
    componentPage.on("pageerror", (error) => errors.push(error.message));
    await componentPage.setContent(await readFile(componentPath, "utf8"));
    const componentPose = await componentPage.evaluate((id: string) => {
      const player = window.ediSVGPlayer;
      if (!player) throw new Error("Missing component player");
      player.pause();
      player.seek(0.5);
      const object = document.querySelector(`[data-edi-object="${id}"] svg rect`);
      if (!(object instanceof SVGRectElement) || !(object.parentElement instanceof SVGGElement))
        throw new Error("Missing compiled component shape");
      const viewport = object.closest("svg"),
        root = document.querySelector(".artwork>svg");
      if (!(viewport instanceof SVGSVGElement) || !(root instanceof SVGSVGElement))
        throw new Error("Missing component viewport");
      const nestedMatrix = viewport.getScreenCTM(),
        rootMatrix = root.getScreenCTM();
      if (!nestedMatrix || !rootMatrix) throw new Error("Missing component coordinate matrices");
      return {
        fill: object.getAttribute("fill"),
        x: object.parentElement.transform.baseVal.getItem(0).matrix.e,
        scale: Math.hypot(nestedMatrix.a, nestedMatrix.b) / Math.hypot(rootMatrix.a, rootMatrix.b),
        clipping: getComputedStyle(viewport).overflow,
      };
    }, instanceId);
    assert.equal(componentPose.fill, "#ff0000");
    assert.ok(Math.abs(componentPose.x - 50) < 0.001);
    assert.ok(Math.abs(componentPose.scale - 0.5) < 0.0001);
    assert.equal(componentPose.clipping, "hidden");
    await page.keyboard.press("Escape");
    await page.screenshot({ path: resolve("../../.cache/edisvg-components.png") });
    await page.reload();
    await page.locator(".scene-artwork>svg").waitFor();
    assert.equal(
      (await snapshot(page)).scene.nodes.at(-1).instance.overrides[0].attrs.fill,
      "#ff0000",
    );
    await page.locator('[data-action="hierarchy"]').click();
    await page.locator('[data-action="artboards"]').click();
    await page.locator("[data-artboard-create]").click();
    await page.locator('[data-action="tool-shapes"]').click();
    const vectorBox = await page.locator(".scene-artwork>svg").boundingBox();
    if (!vectorBox) throw new Error("Missing vector artboard");
    await page.mouse.move(
      vectorBox.x + vectorBox.width * 0.25,
      vectorBox.y + vectorBox.height * 0.25,
    );
    await page.mouse.down();
    await page.mouse.move(
      vectorBox.x + vectorBox.width * 0.6,
      vectorBox.y + vectorBox.height * 0.6,
      { steps: 3 },
    );
    await page.mouse.up();
    await page.locator("[data-path-enter]").click();
    const vectorNode = () =>
      snapshot(page).then((project) => project.artboards.at(-1).scene.nodes[0]);
    const initialVector = await vectorNode(),
      initialPoints = parsePath(initialVector.attrs.d)[0]?.points;
    assert.ok(initialPoints);
    await page.locator('[data-vertex-part="anchor"][data-vertex-index="0"]').click();
    await page
      .locator('[data-vertex-part="anchor"][data-vertex-index="1"]')
      .click({ modifiers: ["Shift"] });
    assert.equal(await page.locator(".vertex-anchor.is-active").count(), 2);
    await page.keyboard.press("ArrowRight");
    const movedPoints = parsePath((await vectorNode()).attrs.d)[0]?.points;
    assert.ok(movedPoints);
    assert.equal(movedPoints[0]?.x, (initialPoints[0]?.x ?? NaN) + 1);
    assert.equal(movedPoints[1]?.x, (initialPoints[1]?.x ?? NaN) + 1);
    assert.equal(movedPoints[2]?.x, initialPoints[2]?.x);
    await page.locator('[data-action="undo"]').click();
    assert.deepEqual(await vectorNode(), initialVector);
    await page.locator('[data-vertex-part="anchor"][data-vertex-index="0"]').click();
    await page
      .locator('[data-vertex-part="anchor"][data-vertex-index="1"]')
      .click({ modifiers: ["Shift"] });
    await page.getByRole("button", { name: "Suavizar pontos", exact: true }).click();
    const smoothVector = await vectorNode();
    assert.match(smoothVector.attrs.d, /C/);
    await page.getByLabel("Converter curvas em segmentos retos", { exact: true }).check();
    await page.getByRole("button", { name: "Simplificar caminho", exact: true }).click();
    assert.doesNotMatch((await vectorNode()).attrs.d, /C/);
    await page.locator('[data-action="undo"]').click();
    assert.deepEqual(await vectorNode(), smoothVector);
    await page.getByRole("button", { name: "Separar no vértice", exact: true }).click();
    assert.equal(parsePath((await vectorNode()).attrs.d)[0]?.closed, false);
    await page.locator('[data-action="undo"]').click();
    assert.deepEqual(await vectorNode(), smoothVector);
    const beforeImport = await snapshot(page);
    await page.locator('[data-action="import-svg"]').first().click();
    await page.locator('#clip-dialog input[type="file"]').setInputFiles({
      name: "unsafe.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><script/><rect onload="bad" width="20" height="20"/><image href="https://example.com"/></svg>',
      ),
    });
    await page.waitForFunction(() =>
      document.querySelector("#clip-dialog")?.textContent?.includes("3 erros"),
    );
    assert.equal(
      await page.getByRole("button", { name: "Importar nova prancheta", exact: true }).isDisabled(),
      true,
    );
    assert.deepEqual(await snapshot(page), beforeImport);
    const safeSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><title>Exemplo</title><rect style="fill:red" fill="blue" x="10" y="20" width="30" height="40"/></svg>';
    await page.locator('#clip-dialog input[type="file"]').setInputFiles({
      name: "componente.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(safeSvg),
    });
    await page.waitForFunction(() =>
      document.querySelector("#clip-dialog")?.textContent?.includes("0 erros · 1 avisos"),
    );
    await page.getByRole("button", { name: "Importar nova prancheta", exact: true }).click();
    const importedProject = await snapshot(page);
    assert.equal(importedProject.artboards.length, beforeImport.artboards.length + 1);
    assert.deepEqual(importedProject.artboards.slice(0, -1), beforeImport.artboards);
    assert.deepEqual(importedProject.motion, beforeImport.motion);
    const semanticRoot = importedProject.artboards.at(-1).scene.nodes[0];
    assert.deepEqual(semanticRoot.semantics, { kind: "group", label: "Exemplo" });
    assert.equal(semanticRoot.children[0].attrs.fill, "red");
    await page.locator('[data-action="undo"]').click();
    assert.deepEqual(await snapshot(page), beforeImport);
    // Exercise the paste ingress event without touching the OS clipboard.
    await page.evaluate((source) => {
      const data = new DataTransfer();
      data.setData("image/svg+xml", source);
      document.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
      );
    }, safeSvg);
    await page.getByRole("button", { name: "Importar nova prancheta", exact: true }).waitFor();
    await page.keyboard.press("Escape");
    assert.deepEqual(await snapshot(page), beforeImport);
    await page.screenshot({ path: resolve("../../.cache/edisvg-lote1.png") });
    await page.locator('[data-action="artboards"]').click();
    await page.locator("[data-artboard-create]").click();
    for (const offset of [0.25, 0.4]) {
      await page.locator('[data-action="tool-shapes"]').click();
      const art = await page.locator(".scene-artwork>svg").boundingBox();
      if (!art) throw new Error("Missing boolean board");
      await page.mouse.move(art.x + art.width * offset, art.y + art.height * 0.25);
      await page.mouse.down();
      await page.mouse.move(art.x + art.width * (offset + 0.25), art.y + art.height * 0.5, {
        steps: 3,
      });
      await page.mouse.up();
    }
    const beforeBoolean = await snapshot(page),
      booleanBoard = beforeBoolean.artboards.at(-1),
      booleanIds = booleanBoard.scene.nodes.map((node: { id: string }) => node.id);
    await page.locator('[data-action="hierarchy"]').click();
    await page.locator(`[data-scene-select="${booleanIds[0]}"] .layer-icon`).click();
    await page
      .locator(`[data-scene-select="${booleanIds[1]}"] .layer-icon`)
      .click({ modifiers: ["Shift"] });
    await page.getByLabel(/Usar aparência e animação de/).check();
    // Submit and replace the panel in the same event-loop turn. A real worker
    // is terminated on unmount before its asynchronous result can publish.
    await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find(
        (button) => button.textContent === "Calcular booleana",
      );
      if (!button) throw new Error("Missing worker submit");
      button.click();
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true }),
      );
    });
    await page.locator('#clip-dialog[open] [name="command-search"]').waitFor();
    await page.keyboard.press("Escape");
    assert.deepEqual(
      await snapshot(page),
      beforeBoolean,
      "Cancellation must not publish a worker result",
    );
    await page.getByLabel(/Usar aparência e animação de/).check();
    await page.getByRole("button", { name: "Calcular booleana", exact: true }).click();
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("edisvg-project") ?? "null")?.artboards.at(-1)?.scene.nodes
          .length === 1,
    );
    const afterBoolean = await snapshot(page);
    assert.equal(afterBoolean.artboards.at(-1).scene.nodes[0].tag, "path");
    assert.equal(afterBoolean.artboards.at(-1).scene.nodes[0].id, booleanIds[0]);
    assert.deepEqual(afterBoolean.motion, beforeBoolean.motion);
    await page.locator('[data-action="undo"]').click();
    assert.deepEqual(await snapshot(page), beforeBoolean);
    await page.getByRole("button", { name: "Escolher cor de preenchimento" }).click();
    const colorPicker = page.getByRole("dialog", { name: "Escolher cor de preenchimento" });
    await colorPicker.getByLabel("Hexadecimal").fill("#123456");
    await page.screenshot({ path: resolve("../../.cache/edisvg-paint-picker.png") });
    assert.deepEqual(await snapshot(page), beforeBoolean, "Color drafts do not edit the project");
    await colorPicker.getByRole("button", { name: "Aplicar cor" }).click();
    assert.equal((await snapshot(page)).artboards.at(-1).scene.nodes[0].attrs.fill, "#123456");
    await page.getByRole("button", { name: "Escolher cor de preenchimento" }).click();
    await page
      .getByRole("dialog", { name: "Escolher cor de preenchimento" })
      .getByRole("button", { name: "Guardar na paleta" })
      .click();
    assert.deepEqual((await snapshot(page)).artboards.at(-1).scene.palette, ["#123456"]);
    await page.getByText("Estilos e paleta", { exact: true }).click();
    await page.getByLabel("Nome do estilo", { exact: true }).fill("Menta de teste");
    await page.getByRole("button", { name: "Guardar estilo", exact: true }).click();
    assert.equal((await snapshot(page)).artboards.at(-1).scene.styles[0].name, "Menta de teste");
    const beforeText = await snapshot(page);
    await page.locator('[data-action="tool-text"]').click();
    await page.locator(".scene-artwork>svg").click({ position: { x: 50, y: 50 } });
    assert.equal(
      (await snapshot(page)).artboards.at(-1).scene.nodes.at(-1).tag,
      "text",
      JSON.stringify({ errors, toast: await page.locator("#toast").textContent() }),
    );
    await page.getByLabel("Conteúdo", { exact: true }).fill("Olá <&>\nمرحبا");
    await page.locator('[data-text-panel] [name="direction"]').selectOption("rtl");
    await page.getByRole("button", { name: "Aplicar texto", exact: true }).click();
    assert.equal(await page.locator(".scene-artwork text tspan").count(), 2);
    assert.equal(await page.locator(".scene-artwork text tspan").first().textContent(), "Olá <&>");
    const editedText = (await snapshot(page)).artboards.at(-1).scene.nodes.at(-1);
    assert.equal(editedText.text, "Olá <&>\nمرحبا");
    assert.equal(editedText.attrs.direction, "rtl");
    await page.locator('[data-action="undo"]').click();
    assert.equal((await snapshot(page)).artboards.at(-1).scene.nodes.at(-1).text, "Seu texto");
    await page.locator('[data-action="undo"]').click();
    assert.deepEqual(await snapshot(page), beforeText);
    await page.locator('[data-action="export"]').click();
    await page.locator('input[name="format"][value="json"]').check();
    const canonicalDownload = page.waitForEvent("download");
    await page.locator("#download").click();
    const canonicalPath = await (await canonicalDownload).path();
    if (!canonicalPath) throw new Error("No canonical JSON download");
    assert.deepEqual(
      JSON.parse(await readFile(canonicalPath, "utf8")),
      await page.evaluate(() => JSON.parse(localStorage.getItem("edisvg-project") ?? "null")),
    );
    await page.setViewportSize({ width: 980, height: 680 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      JSON.stringify(
        await page.evaluate(() =>
          [
            "html",
            "body",
            "#app",
            ".workspace",
            ".timeline",
            ".timeline-header",
            ".timeline-body",
            ".virtual-timeline",
            ".assistant-panel",
          ].map((selector) => {
            const element = document.querySelector(selector);
            if (!element) return { selector };
            const css = getComputedStyle(element),
              box = element.getBoundingClientRect();
            return {
              selector,
              x: box.x,
              width: box.width,
              scroll: element.scrollWidth,
              overflow: css.overflow,
              display: css.display,
              minwidth: css.minWidth,
              position: css.position,
            };
          }),
        ),
      ),
    );
    assert.deepEqual(errors, []);
    const corrupt = await browser.newPage();
    await corrupt.addInitScript(() => localStorage.setItem("edisvg-project", "broken-json{"));
    await corrupt.goto(`http://127.0.0.1:${address.port}`);
    await corrupt.locator("[data-retry-recovery]").waitFor();
    assert.equal(
      await corrupt.evaluate(() => localStorage.getItem("edisvg-project")),
      "broken-json{",
    );
    assert.equal(
      await corrupt
        .locator("#app")
        .evaluate((element) => element instanceof HTMLElement && element.inert),
      true,
    );
    await corrupt.keyboard.press("Escape");
    assert.equal(
      await corrupt.locator("#help-dialog").evaluate((element) => element.matches(":modal")),
      true,
    );
  } finally {
    try {
      await browser?.close();
    } finally {
      await new Promise<void>((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      );
    }
  }
});

test("real DOMParser import preserves aspect ratio and rejects active SVG content", {
  timeout: 60_000,
}, async () => {
  const bundle = await build({
    configFile: false,
    logLevel: "error",
    build: {
      write: false,
      emptyOutDir: false,
      minify: false,
      lib: {
        entry: resolve("src/renderer/src/svgImport.js"),
        formats: ["es"],
        fileName: "svg-import-test",
      },
    },
  });
  const output = Array.isArray(bundle) ? bundle[0] : bundle;
  if (!output || !("output" in output)) throw new Error("Missing SVG import test bundle");
  const chunk = output.output.find((entry) => entry.type === "chunk");
  if (chunk?.type !== "chunk") throw new Error("Missing executable SVG import module");
  const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL;
  if (channel && !["msedge", "chrome"].includes(channel))
    throw new Error("Unsupported test browser channel");
  const browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.route("http://127.0.0.1/edisvg-import-fixture", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><html><body></body></html>",
      }),
    );
    await page.goto("http://127.0.0.1/edisvg-import-fixture");
    const moduleUrl = await page.evaluate(
      (code) => URL.createObjectURL(new Blob([code], { type: "text/javascript" })),
      chunk.code,
    );
    const source =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><rect x="10" y="20" width="30" height="40" fill="red"/></svg>';
    const imported = await page.evaluate(
      async ({ moduleUrl, source }) => {
        const { importSvg } = await import(moduleUrl);
        const scene = importSvg(source);
        const rejected = [];
        for (const bad of [
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><script>alert(1)</script></svg>',
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="1e999" height="2"/></svg>',
        ]) {
          try {
            importSvg(bad);
            rejected.push(false);
          } catch {
            rejected.push(true);
          }
        }
        return { scene, rejected };
      },
      { moduleUrl, source },
    );
    assert.deepEqual(imported.rejected, [true, true]);
    const exported = renderScene(imported.scene);
    for (const [width, height] of [
      [200, 100],
      [100, 200],
    ]) {
      const bounds = await page.evaluate(
        ({ source, exported, width, height }) => {
          document.body.innerHTML = `<div>${source}</div><div>${exported}</div>`;
          for (const svg of document.querySelectorAll("svg")) {
            svg.style.width = `${width}px`;
            svg.style.height = `${height}px`;
          }
          return [...document.querySelectorAll("rect")].map((rect) => {
            const box = rect.getBoundingClientRect();
            return { width: box.width, height: box.height };
          });
        },
        { source, exported, width, height },
      );
      assert.deepEqual(bounds[0], bounds[1]);
    }
  } finally {
    await browser.close();
  }
});

test("HTML and sampled SVG preserve pivot, skew and signed scale matrices at the same time", {
  timeout: 60000,
}, async () => {
  const project = newProject(),
    scene = project.artboards[0]?.scene;
  if (!scene) throw new Error("Missing fixture scene");
  const id = editScene(scene, null, "add", "rect"),
    node = scene.nodes[0];
  if (!id || !node) throw new Error("Missing fixture object");
  Object.assign(node.transform, {
    x: 30,
    y: 40,
    rotation: 20,
    sx: -1,
    sy: 2,
    px: 20,
    py: -15,
    skewX: 12,
  });
  project.motion = applyMotionCommands(project.motion, new Set([id]), [
    {
      type: "create-animation",
      animation: {
        id: "animation-matrix",
        name: "Pivô",
        fps: 30,
        frames: 30,
        mode: "once",
        tracks: [],
      },
    },
    ...[0, 30].flatMap((frame) => [
      {
        type: "set-key",
        animationId: "animation-matrix",
        targetId: id,
        property: "rotation",
        frame,
        value: 20 + frame * 2,
      },
      {
        type: "set-key",
        animationId: "animation-matrix",
        targetId: id,
        property: "px",
        frame,
        value: 20 + frame,
      },
      {
        type: "set-key",
        animationId: "animation-matrix",
        targetId: id,
        property: "skewX",
        frame,
        value: 12 + frame / 2,
      },
      {
        type: "set-key",
        animationId: "animation-matrix",
        targetId: id,
        property: "sx",
        frame,
        value: -1 + frame / 15,
      },
    ]),
  ]);
  const clip = project.motion.animations[0];
  if (!clip) throw new Error("Missing fixture clip");
  const expected = transformMatrix({ ...node.transform, ...evaluateAnimation(clip, 15).get(id) });
  const source = await readFile(resolve("out/renderer/edi-player.global.js"), "utf8");
  const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL;
  if (channel && !["msedge", "chrome"].includes(channel))
    throw new Error("Unsupported test browser channel");
  const browser = await chromium.launch(channel ? { channel } : {});
  try {
    for (const format of ["html", "svg"] satisfies ("html" | "svg")[]) {
      const exported = buildClipExport(
          project,
          clip.id,
          { format, alt: "Matriz", reduced: false, offscreen: false },
          source,
        ),
        page = await browser.newPage();
      await page.setContent(exported.content);
      const actual = await page.evaluate(
        ({ id, format }) => {
          const svg = document.querySelector("svg");
          if (!(svg instanceof SVGSVGElement)) throw new Error("Missing SVG");
          if (format === "html") {
            const player = window.ediSVGPlayer;
            if (!player) throw new Error("Missing player");
            player.pause();
            player.seek(0.5);
          } else {
            svg.pauseAnimations();
            svg.setCurrentTime(0.5);
          }
          const group = document.querySelector(`[data-edi-object="${id}"]`);
          if (!(group instanceof SVGGElement)) throw new Error("Missing matrix group");
          const list = format === "html" ? group.transform.baseVal : group.transform.animVal;
          let matrix = new DOMMatrix();
          for (let i = 0; i < list.numberOfItems; i++)
            matrix = matrix.multiply(list.getItem(i).matrix);
          return [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f];
        },
        { id, format },
      );
      actual.forEach((value, index) => {
        assert.ok(
          Math.abs(value - (expected[index] ?? NaN)) < 1e-4,
          `${format} matrix coefficient ${index}: ${value} != ${expected[index]}`,
        );
      });
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
