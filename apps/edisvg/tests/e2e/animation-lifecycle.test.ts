import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { executeDocumentTransaction } from "../../src/shared/documentCommands";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { parseProject } from "../../src/shared/project";
import { assetTestBundle } from "../assetBundle";
import { audioProjectFixture } from "../audioFixture";
import { rendererServer } from "../rendererServer";
import { trimFixture } from "../trimFixture";

test("real clip duplication keeps rig playback; deletion confirmation, cancellation, history and reload preserve the complete animation", {
  timeout: 60000,
}, async () => {
  const fixture = trimFixture(),
    server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [],
      confirmations: string[] = [];
    let cancelDeletion = false;
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => {
      if (dialog.message().startsWith("Excluir esta animação")) {
        confirmations.push(dialog.message());
        return cancelDeletion ? dialog.dismiss() : dialog.accept();
      }
      return dialog.accept();
    });
    await page.addInitScript((project) => {
      if (localStorage.getItem("edisvg-project") === null)
        localStorage.setItem("edisvg-project", JSON.stringify(project));
    }, fixture.project());
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    const snapshot = () => page.evaluate(() => localStorage.getItem("edisvg-project"));
    const before = await snapshot();
    await page.locator('[data-action="animate"]').click();
    await page.locator('[data-action="clip-duplicate"]').click();
    const copiedText = await snapshot();
    assert.ok(copiedText);
    const copied = parseProject(JSON.parse(copiedText)),
      clip = copied.motion.animations.at(-1),
      channels = copied.artboards[0]?.rig?.parameterClips;
    assert.ok(clip && channels?.[1]);
    assert.equal(channels[1].animationId, clip.id);
    assert.notEqual(channels[1].tracks[0]?.id, channels[0]?.tracks[0]?.id);
    await page.getByRole("button", { name: "Restrições", exact: true }).click();
    await page.getByRole("button", { name: "Testar rig", exact: true }).click();
    await page.getByRole("button", { name: "Pausar teste", exact: true }).click();
    await page.getByRole("button", { name: "Resetar teste", exact: true }).click();
    for (let index = 0; index < 30; index++)
      await page.getByRole("button", { name: "Avançar teste 1/60s", exact: true }).click();
    const length = await page
      .locator(`.behavior-test-preview [data-edi-object="${fixture.shapeId}"]>path`)
      .evaluate((path) => {
        if (!(path instanceof SVGPathElement)) throw new Error("Missing cloned clip geometry");
        return path.getTotalLength();
      });
    assert.ok(Math.abs(length - 100) < 0.001, String(length));
    await page.getByRole("button", { name: "Fechar teste", exact: true }).click();
    assert.equal(await snapshot(), copiedText);
    await page.locator('[data-action="clip-settings"]').click();
    cancelDeletion = true;
    await page.locator("[data-delete-clip]").click();
    assert.equal(await snapshot(), copiedText);
    cancelDeletion = false;
    await page.locator("[data-delete-clip]").click();
    assert.equal(await snapshot(), before);
    assert.equal(
      await page
        .locator("#clip-dialog")
        .evaluate((dialog) => dialog instanceof HTMLDialogElement && dialog.open),
      false,
    );
    assert.equal(confirmations.length, 2);
    assert.ok(
      confirmations.every((message) => message.includes("canais") && message.includes("áudio")),
    );
    await page.locator('[data-action="undo"]').click();
    assert.equal(await snapshot(), copiedText);
    await page.locator('[data-action="redo"]').click();
    assert.equal(await snapshot(), before);
    await page.locator('[data-action="undo"]').click();
    await page.reload();
    await page.locator(".scene-artwork>svg").waitFor();
    assert.equal(await snapshot(), copiedText);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("copied clip emits its distinct real timeline event and muted audio cue without losing the original", {
  timeout: 60000,
}, async () => {
  const fixture = audioProjectFixture(),
    sessionId = crypto.randomUUID(),
    copied = executeDocumentTransaction(
      { project: fixture.project, sessionId, revision: 0 },
      {
        projectId: fixture.project.id,
        sessionId,
        revision: 0,
        commands: [
          {
            type: "motion",
            command: {
              type: "duplicate-animation",
              animationId: "animation-tone",
              id: "animation-copy",
              name: "Cópia",
            },
          },
        ],
      },
    ).project,
    compiled = compileInteractiveArtboard(copied, fixture.boardId, {
      animationId: "animation-copy",
    }),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.setContent("<svg></svg>");
    await page.addScriptTag({ content: code });
    const result = await page.evaluate(async (blueprint) => {
      const svg = document.querySelector("svg"),
        api = window.EdiAssetTest;
      if (!(svg instanceof SVGSVGElement) || !api) throw new Error("Missing copied audio runtime");
      const cues: { eventId: string; caption: string }[] = [],
        player = await api.createVisualSvgPlayerAsync(svg, blueprint, {
          autoplay: false,
          pauseOffscreen: false,
        });
      try {
        player.onAudioCue((cue) => cues.push({ eventId: cue.eventId, caption: cue.caption }));
        player.advance(0.2);
        return { cues, audio: player.inspectAudio() };
      } finally {
        await player.destroyAsync();
      }
    }, compiled.document);
    assert.equal(result.cues.length, 1);
    assert.equal(result.cues[0]?.caption, "Tom de confirmação");
    assert.notEqual(result.cues[0]?.eventId, "event-tone");
    assert.equal(result.audio.enabled, false);
    assert.equal(result.audio.buffers, 0);
  } finally {
    await browser.close();
  }
});
