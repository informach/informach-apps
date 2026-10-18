import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { buildClipExport } from "../../src/renderer/src/clipExport";
import type { Project } from "../../src/shared/project";
import { offlineBundle } from "../offlineBundle";
import { rendererServer } from "../rendererServer";
import { rigFixture } from "../rigFixture";

test("real vector skin binding, vertex selection and weight edits preserve history/reference and export the same deformation without helpers", {
  timeout: 60000,
}, async (context) => {
  const fixture = rigFixture(),
    art = fixture.run([
      {
        type: "scene",
        operation: "add",
        targetId: null,
        value: {
          tag: "path",
          attrs: { d: "M0 -10 L100 -10 L200 -10 L200 10 L100 10 L0 10 Z", fill: "#3050a0" },
        },
      },
    ]).selected;
  if (!art) throw new Error("Missing art");
  const reference = structuredClone(fixture.project().artboards[0]?.scene),
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
    await page.locator(`[data-scene-select="${art}"]`).click();
    await page.getByRole("button", { name: "Malha", exact: true }).click();
    await page
      .getByLabel("Ossos para malha", { exact: true })
      .selectOption(["node-upper", "node-lower"]);
    await page
      .getByLabel("Capturar referência atual; acrescentar deformação futura.", { exact: true })
      .check();
    await page.getByRole("button", { name: "Vincular malha vetorial", exact: true }).click();
    assert.equal((await snapshot()).artboards[0]?.rig?.skins?.[0]?.weights.length, 6);
    assert.deepEqual((await snapshot()).artboards[0]?.scene, reference);
    await page.getByRole("button", { name: "Vértice 1 da malha", exact: true }).click();
    assert.equal(await page.getByLabel("Vértice da malha", { exact: true }).inputValue(), "1");
    await page.getByLabel("Osso da influência 1", { exact: true }).selectOption("node-upper");
    await page.getByLabel("Peso da influência 1 (%)", { exact: true }).fill("100");
    for (const slot of [2, 3, 4])
      await page.getByLabel(`Peso da influência ${slot} (%)`, { exact: true }).fill("0");
    await page.getByRole("button", { name: "Aplicar pesos do vértice", exact: true }).click();
    const keyed = await snapshot();
    assert.deepEqual(keyed.artboards[0]?.rig?.skins?.[0]?.weights[1], [
      { boneId: "node-upper", weight: 1 },
    ]);
    await page.locator('[data-action="undo"]').click();
    assert.equal((await snapshot()).artboards[0]?.rig?.skins?.[0]?.weights[1]?.length, 2);
    await page.locator('[data-action="redo"]').click();
    assert.deepEqual(await snapshot(), keyed);
    await page.reload();
    await page.locator(".scene-artwork>svg").waitFor();
    assert.deepEqual(await snapshot(), keyed);
    const runtime = await offlineBundle(),
      html = buildClipExport(
        keyed,
        fixture.clipId,
        { format: "html", alt: "Malha", reduced: false, offscreen: false },
        runtime,
      ),
      svg = buildClipExport(
        keyed,
        fixture.clipId,
        { format: "svg", alt: "Malha", reduced: false, offscreen: false },
        "",
      );
    assert.ok(!svg.content.includes("data-edi-skin-overlay"));
    const timeline = await browser.newPage(),
      sampled = await browser.newPage();
    for (const target of [timeline, sampled]) {
      target.on("pageerror", (error) => errors.push(error.message));
      await target.route("**/*", (route) => route.abort());
    }
    await timeline.setContent(html.content);
    await timeline.waitForFunction(() => !!window.ediSVGPlayer);
    await timeline.evaluate(() => window.ediSVGPlayer?.pause());
    await sampled.setContent(svg.content);
    await sampled.evaluate(() => document.querySelector("svg")?.pauseAnimations());
    for (const time of [0, 0.5, 1, 0]) {
      await timeline.evaluate((time) => window.ediSVGPlayer?.seek(time), time);
      await sampled.evaluate((time) => document.querySelector("svg")?.setCurrentTime(time), time);
      const geometries = [];
      for (const target of [timeline, sampled])
        geometries.push(
          await target.locator(`[data-edi-object="${art}"]>path`).evaluate((element) => {
            if (!(element instanceof SVGGeometryElement)) throw new Error("Missing path");
            const box = element.getBBox(),
              point = element.getPointAtLength(element.getTotalLength() * 0.25);
            return {
              x: box.x,
              y: box.y,
              width: box.width,
              height: box.height,
              px: point.x,
              py: point.y,
            };
          }),
        );
      const [a, b] = geometries;
      if (!a || !b) throw new Error("Missing geometry");
      for (const key of ["x", "y", "width", "height", "px", "py"] as const)
        assert.ok(Math.abs(a[key] - b[key]) < 0.01, JSON.stringify({ time, a, b }));
      assert.ok(a.height > 90, "IK bends the actual vector surface, not only its wrapper");
    }
    await timeline.evaluate(() => window.ediSVGPlayer?.destroy());
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
