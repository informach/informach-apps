import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { identityTransform } from "@informach/edi-motion";
import { parseAnimationArtifact } from "@informach/edi-motion/animation-artifact";
import { strFromU8, unzipSync } from "fflate";
import { chromium } from "playwright";
import { newProject } from "../../src/shared/project";
import { rendererServer } from "../rendererServer";

test("real export dialog downloads a reusable player and artwork with its verified PNG, preserving the editable project", {
  timeout: 60000,
}, async () => {
  const project = newProject();
  const board = structuredClone(project.artboards[0]);
  assert.ok(board);
  board.id = "artboard-drawing";
  board.name = "Desenho";
  board.scene.nodes = [
    {
      id: "node-ball",
      name: "Bola",
      tag: "circle",
      attrs: { cx: "100", cy: "100", r: "40", fill: "#e05010" },
      text: "",
      visible: true,
      locked: false,
      children: [],
      transform: identityTransform(),
    },
  ];
  project.artboards.push(board);
  const server = await rendererServer();
  const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL;
  const browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.addInitScript(
      (value) => localStorage.setItem("edisvg-project", JSON.stringify(value)),
      project,
    );
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    const before = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    await page.locator('[data-action="export"]').click();
    await page.locator('input[name="format"][value="player-web"]').check();
    const dialog = page.locator("#export-dialog");
    const selected = await dialog.getByLabel("Prancheta", { exact: true }).inputValue();
    assert.equal(selected, board.id, "A prancheta vazia não pode ser exportada por acidente");
    const downloadingPlayer = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Baixar player para outro aplicativo" }).click();
    const playerDownload = await downloadingPlayer;
    const playerPath = await playerDownload.path();
    assert.ok(playerPath);
    assert.match(playerDownload.suggestedFilename(), /web-player\.zip$/);
    const playerZip = unzipSync(await readFile(playerPath));
    const manifest = playerZip["manifest.json"];
    assert.ok(manifest);
    assert.equal(JSON.parse(strFromU8(manifest)).format, "edi-web-player");
    assert.ok(playerZip["edi-web-player.mjs"]);
    assert.ok(await dialog.isVisible(), "Baixar a biblioteca permite exportar a arte em seguida");
    const downloadingArt = page.waitForEvent("download");
    await dialog.locator("#download").click();
    const download = await downloadingArt;
    const file = await download.path();
    assert.ok(file);
    assert.match(download.suggestedFilename(), /\.edi-animation\.json$/);
    const artifact = parseAnimationArtifact(await readFile(file, "utf8"));
    assert.ok(artifact.poster);
    assert.ok(artifact.poster.byteLength > 100);
    assert.ok(artifact.document.content.length);
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), before);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
