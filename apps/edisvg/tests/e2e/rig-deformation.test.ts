import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyBehavior } from "@informach/edi-motion/behavior";
import { chromium } from "playwright";
import { buildClipExport } from "../../src/renderer/src/clipExport";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import type { Project } from "../../src/shared/project";
import { deformationFixture } from "../deformationFixture";
import { offlineBundle } from "../offlineBundle";
import { rendererServer } from "../rendererServer";

test("morph, arclength follow-path and discrete solos agree in interactive HTML and independent sampled SVG, including backward seeks", {
  timeout: 60000,
}, async () => {
  const fixture = deformationFixture(),
    project = fixture.project(),
    compiled = compileInteractiveArtboard(project, fixture.rootId, { animationId: fixture.clipId }),
    runtime = await offlineBundle(),
    html = buildClipExport(
      project,
      fixture.clipId,
      { format: "html", alt: "Expressões", reduced: true, offscreen: false },
      runtime,
    ),
    svg = buildClipExport(
      project,
      fixture.clipId,
      { format: "svg", alt: "Expressões", reduced: false, offscreen: false },
      "",
    ),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const interactive = await browser.newPage(),
      timeline = await browser.newPage(),
      sampled = await browser.newPage(),
      errors: string[] = [];
    for (const page of [interactive, timeline, sampled]) {
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => route.abort());
    }
    await interactive.setContent(compiled.svg);
    await interactive.addScriptTag({ content: runtime });
    await interactive.evaluate((document) => {
      const root = window.document.querySelector("svg"),
        api = window.EdiSVGRuntime;
      if (!(root instanceof SVGSVGElement) || !api) throw new Error("Missing runtime");
      window.interactivePlayer = api.createInteractiveSvgPlayer(root, document, {
        autoplay: false,
        pauseOffscreen: false,
      });
    }, compiled.document);
    await timeline.setContent(html.content);
    await timeline.waitForFunction(() => !!window.ediSVGPlayer);
    await timeline.evaluate(() => window.ediSVGPlayer?.pause());
    await sampled.setContent(svg.content);
    await sampled.evaluate(() => document.querySelector("svg")?.pauseAnimations());
    for (const time of [0, 0.5, 1, 0.2, 0.8, 0]) {
      await interactive.evaluate((time) => {
        window.interactivePlayer?.reset();
        window.interactivePlayer?.advance(time);
      }, time);
      await timeline.evaluate((time) => window.ediSVGPlayer?.seek(time), time);
      await sampled.evaluate((time) => document.querySelector("svg")?.setCurrentTime(time), time);
      const snapshots = [];
      for (const page of [interactive, timeline, sampled])
        snapshots.push(
          await page.evaluate(
            (ids) => {
              const root = document.querySelector("svg"),
                mouth = document.querySelector(`[data-edi-object="${ids.mouth}"]>path`),
                follower = document.querySelector(`[data-edi-object="${ids.follower}"]`),
                a = document.querySelector(`[data-edi-object="${ids.a}"]`),
                b = document.querySelector(`[data-edi-object="${ids.b}"]`);
              if (
                !(root instanceof SVGSVGElement) ||
                !(mouth instanceof SVGGraphicsElement) ||
                !(follower instanceof SVGGraphicsElement) ||
                !a ||
                !b
              )
                throw new Error("Missing shapes");
              const box = mouth.getBBox(),
                matrix = follower.getScreenCTM(),
                base = root.getScreenCTM();
              if (!matrix || !base) throw new Error("Missing matrices");
              const point = new DOMPoint(0, 0)
                .matrixTransform(matrix)
                .matrixTransform(base.inverse());
              return {
                height: box.height,
                x: point.x,
                y: point.y,
                a: getComputedStyle(a).display,
                b: getComputedStyle(b).display,
              };
            },
            {
              mouth: fixture.mouthId,
              follower: fixture.followerId,
              a: fixture.faceA,
              b: fixture.faceB,
            },
          ),
        );
      const reference = snapshots[0];
      if (!reference) throw new Error("Missing snapshot");
      assert.ok(
        Math.abs(reference.height - (100 + 100 * time)) < 0.001,
        JSON.stringify({ time, reference }),
      );
      assert.equal(reference.a, time < 0.5 ? "inline" : "none");
      assert.equal(reference.b, time >= 0.5 && time < 1 ? "inline" : "none");
      for (const value of snapshots.slice(1)) {
        assert.ok(
          Math.abs(value.height - reference.height) < 0.001,
          JSON.stringify({ time, value, reference }),
        );
        assert.ok(
          Math.hypot(value.x - reference.x, value.y - reference.y) < 0.01,
          JSON.stringify({ time, value, reference }),
        );
        assert.equal(value.a, reference.a);
        assert.equal(value.b, reference.b);
      }
    }
    assert.deepEqual(errors, []);
    await interactive.evaluate(() => {
      window.interactivePlayer?.reset();
      window.interactivePlayer?.advance(1);
    });
    await timeline.evaluate(() => window.ediSVGPlayer?.seek(1));
    for (const page of [interactive, timeline]) {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForFunction((id) => {
        const shape = document.querySelector(`[data-edi-object="${id}"]>path`);
        return shape instanceof SVGGraphicsElement && shape.getBBox().height === 100;
      }, fixture.mouthId);
    }
    assert.equal(await interactive.evaluate(() => window.interactivePlayer?.time), 1);
    assert.equal(await timeline.evaluate(() => window.ediSVGPlayer?.time), 1);
    for (const page of [interactive, timeline]) {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.waitForFunction((id) => {
        const shape = document.querySelector(`[data-edi-object="${id}"]>path`);
        return shape instanceof SVGGraphicsElement && shape.getBBox().height === 200;
      }, fixture.mouthId);
    }
    await interactive.evaluate(() => window.interactivePlayer?.destroy());
    await timeline.evaluate(() => window.ediSVGPlayer?.destroy());
  } finally {
    await browser.close();
  }
});

test("parameter bindings are authored in the workbench and inputs drive morph in the isolated test session", {
  timeout: 60000,
}, async (context) => {
  const fixture = deformationFixture();
  fixture.run([
    {
      type: "behavior",
      operation: "replace",
      value: {
        ...emptyBehavior(),
        inputs: [
          { id: "input-mood", name: "Humor", kind: "number", initial: 0.25, min: 0, max: 1 },
        ],
      },
    },
  ]);
  const server = await rendererServer();
  context.after(() => server.close());
  const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.addInitScript((project) => {
      if (localStorage.getItem("edisvg-project") === null)
        localStorage.setItem("edisvg-project", JSON.stringify(project));
    }, fixture.project());
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    const snapshot = () =>
      page.evaluate((): Project => JSON.parse(localStorage.getItem("edisvg-project") ?? "null"));
    await page.locator('[data-action="machine"]').click();
    await page.getByLabel("Tipo do binding", { exact: true }).selectOption("parameter");
    await page.getByLabel("Input do binding", { exact: true }).selectOption("input-mood");
    await page
      .getByLabel("Destino de rig", { exact: true })
      .selectOption(JSON.stringify([[], "morph-smile", "weight"]));
    await page.getByLabel("Direção do binding", { exact: true }).selectOption("two-way");
    await page.getByRole("button", { name: "Criar binding", exact: true }).click();
    const authored = await snapshot();
    assert.equal(authored.artboards[0]?.behavior?.version, 2);
    assert.equal(authored.artboards[0]?.behavior?.bindings[0]?.kind, "parameter");
    await page.locator('[data-action="test"]').click();
    await page.getByRole("button", { name: "Pausar teste", exact: true }).click();
    await page.getByRole("button", { name: "Resetar teste", exact: true }).click();
    const height = () =>
      page
        .locator(`.behavior-test-preview [data-edi-object="${fixture.mouthId}"]>path`)
        .evaluate((element) =>
          element instanceof SVGGraphicsElement ? element.getBBox().height : -1,
        );
    assert.equal(await height(), 125);
    await page.locator(".behavior-test-controls").getByLabel("Humor", { exact: true }).fill("0.8");
    await page.locator(".behavior-test-controls").getByLabel("Humor", { exact: true }).press("Tab");
    assert.equal(await height(), 180);
    await page.getByRole("button", { name: "Fechar teste", exact: true }).click();
    assert.deepEqual(await snapshot(), authored);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("morph capture and exclusive expressions are authored through UI, keep the selected parameter across writes, and preserve history/reload", {
  timeout: 60000,
}, async (context) => {
  const fixture = deformationFixture(false),
    server = await rendererServer();
  context.after(() => server.close());
  const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.addInitScript((project) => {
      if (localStorage.getItem("edisvg-project") === null)
        localStorage.setItem("edisvg-project", JSON.stringify(project));
    }, fixture.project());
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    const snapshot = () =>
      page.evaluate((): Project => JSON.parse(localStorage.getItem("edisvg-project") ?? "null"));
    await page.locator(`[data-scene-select="${fixture.mouthId}"]`).click();
    await page.getByRole("button", { name: "Restrições", exact: true }).click();
    await page.getByLabel("Nome da pose morph", { exact: true }).fill("Sorriso");
    await page.getByLabel("Caminho da pose morph", { exact: true }).selectOption(fixture.poseId);
    await page.getByLabel("Peso inicial do morph (%)", { exact: true }).fill("50");
    await page.getByRole("button", { name: "Capturar pose morph", exact: true }).click();
    assert.equal((await snapshot()).artboards[0]?.rig?.morphs?.[0]?.weight, 0.5);
    await page.locator(`[data-scene-select="${fixture.faceId}"]`).click();
    await page.getByRole("button", { name: "Criar grupo solo", exact: true }).click();
    const solo = (await snapshot()).artboards[0]?.rig?.solos?.[0];
    if (!solo) throw new Error("Missing solo");
    const channelKey = JSON.stringify([[], solo.id, "activeIndex"]);
    await page.getByLabel("Restrição do canal de rig", { exact: true }).selectOption(channelKey);
    for (const [frame, value] of [
      [0, 0],
      [5, 1],
    ]) {
      await page.getByLabel("Quadro do parâmetro", { exact: true }).fill(String(frame));
      await page.getByLabel("Filho ativo (-1 = nenhum)", { exact: true }).fill(String(value));
      await page.getByRole("button", { name: "Gravar chave de rig", exact: true }).click();
      assert.equal(
        await page.getByLabel("Restrição do canal de rig", { exact: true }).inputValue(),
        channelKey,
      );
    }
    const keyed = await snapshot();
    assert.equal(keyed.artboards[0]?.rig?.parameterClips?.[0]?.tracks[0]?.keys.length, 2);
    await page.locator('[data-action="undo"]').click();
    assert.equal(
      (await snapshot()).artboards[0]?.rig?.parameterClips?.[0]?.tracks[0]?.keys.length,
      1,
    );
    await page.locator('[data-action="redo"]').click();
    assert.deepEqual(await snapshot(), keyed);
    await page.reload();
    await page.locator(".scene-artwork>svg").waitFor();
    assert.deepEqual(await snapshot(), keyed);
    await page.getByRole("button", { name: "Testar rig", exact: true }).click();
    await page.getByRole("button", { name: "Pausar teste", exact: true }).click();
    await page.getByRole("button", { name: "Resetar teste", exact: true }).click();
    const height = await page
      .locator(`.behavior-test-preview [data-edi-object="${fixture.mouthId}"]>path`)
      .evaluate((element) =>
        element instanceof SVGGraphicsElement ? element.getBBox().height : -1,
      );
    assert.equal(height, 150);
    await page.getByRole("button", { name: "Fechar teste", exact: true }).click();
    assert.deepEqual(await snapshot(), keyed);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
