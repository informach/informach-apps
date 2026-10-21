import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { parseProject } from "../../src/shared/project";
import { renderScene } from "../../src/shared/scene.js";
import { assetTestBundle } from "../assetBundle";
import { sliceImageFixture } from "../assetFixtures";
import { rendererServer } from "../rendererServer";
import { rigFixture } from "../rigFixture";

/** Two bones along x (0→100→200) and a 200×40 image laid on them, viewBox -50,-100. */
function bentProject(columns = 8) {
  const fixture = rigFixture(),
    image = sliceImageFixture(),
    rig = fixture.project().artboards[0]?.rig;
  assert.ok(rig);
  fixture.run([
    { type: "rig", operation: "replace", value: { ...rig, constraints: [] } },
    { type: "asset", operation: "put", value: image },
  ]);
  const id = fixture.run([
    { type: "asset", operation: "insert-image", assetId: image.id },
  ]).selected;
  assert.ok(id);
  fixture.run([
    {
      type: "scene",
      operation: "attrs",
      targetId: id,
      value: { x: "0", y: "-20", width: "200", height: "40", preserveAspectRatio: "none" },
    },
    { type: "scene", operation: "image-mesh", targetId: id, value: { columns, rows: 1 } },
    {
      type: "rig",
      operation: "bind-skin",
      id: "skin-photo",
      targetId: id,
      boneIds: ["node-upper", "node-lower"],
      confirmRestPose: true,
    },
    {
      type: "motion",
      command: {
        type: "set-key",
        animationId: "animation-rig",
        targetId: "node-lower",
        property: "rotation",
        frame: 0,
        value: 0,
      },
    },
    {
      type: "motion",
      command: {
        type: "set-key",
        animationId: "animation-rig",
        targetId: "node-lower",
        property: "rotation",
        frame: 10,
        value: 60,
      },
    },
  ]);
  const project = structuredClone(fixture.project()),
    board = project.artboards[0];
  assert.ok(board);
  board.scene.viewBox = [-50, -100, 300, 300];
  return { project: parseProject(project), boardId: board.id, id, image };
}

test("at rest the mesh draws the same pixels as the plain image", { timeout: 60000 }, async () => {
  const f = bentProject(),
    board = f.project.artboards[0];
  assert.ok(board);
  const plain = structuredClone(board.scene),
    node = plain.nodes.find((item) => item.id === f.id);
  assert.ok(node);
  delete node.imageMesh;
  const meshed = renderScene(board.scene, { assets: f.project.assets }),
    reference = renderScene(plain, { assets: f.project.assets }),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.setContent("<main></main>");
    await page.addScriptTag({ content: code });
    const result = await page.evaluate(
      async ({ meshed, reference }) => {
        const api = window.EdiAssetTest;
        if (!api) throw new Error("Missing bundle");
        const host = document.createElement("div");
        host.innerHTML = meshed + reference;
        document.body.append(host);
        const [a, b] = [...host.querySelectorAll(":scope>svg")];
        if (!(a instanceof SVGSVGElement) || !(b instanceof SVGSVGElement))
          throw new Error("Missing drawings");
        const points: [number, number][] = [];
        for (let y = 70; y < 130; y++) for (let x = 40; x < 260; x++) points.push([x, y]);
        const [actual, expected] = await Promise.all([
          api.svgPixels(a, 300, 300, points),
          api.svgPixels(b, 300, 300, points),
        ]);
        let mismatches = 0,
          painted = 0,
          worst = 0;
        for (const [index, pixel] of actual.entries()) {
          const other = expected[index] ?? [];
          if ((other[3] ?? 0) > 0) painted++;
          const difference = Math.max(
            ...pixel.map((value, channel) => Math.abs(value - (other[channel] ?? 0))),
          );
          worst = Math.max(worst, difference);
          if (difference > 2) mismatches++;
        }
        return { mismatches, painted, worst, total: points.length };
      },
      { meshed, reference },
    );
    assert.ok(result.painted > 7000, JSON.stringify(result));
    // Overlapping seams repeat the same pixels; only resampling along cut lines may differ.
    assert.ok(result.mismatches <= result.total * 0.01, JSON.stringify(result));
  } finally {
    await browser.close();
  }
});

test("the player bends the raster with the skinned grid and the panel creates meshes", {
  timeout: 60000,
}, async () => {
  const f = bentProject(),
    compiled = compileInteractiveArtboard(f.project, f.boardId, { animationId: "animation-rig" }),
    code = await assetTestBundle(),
    server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.setContent(compiled.svg.replace("<svg ", '<svg id="live" '));
    await page.addScriptTag({ content: code });
    const sample = () =>
      page.evaluate(async () => {
        const api = window.EdiAssetTest,
          root = document.querySelector("#live");
        if (!api || !(root instanceof SVGSVGElement)) throw new Error("Missing host");
        // viewBox -50,-100 at 300 px: pixel = (x + 50, y + 100).
        const [restEnd, bentEnd, middle] = await api.svgPixels(root, 300, 300, [
          [245, 100],
          [200, 180],
          [100, 100],
        ]);
        return { restEnd: restEnd?.[3], bentEnd: bentEnd?.[3], middle: middle?.[3] };
      });
    await page.evaluate(async (blueprint) => {
      const api = window.EdiAssetTest,
        root = document.querySelector("#live");
      if (!api || !(root instanceof SVGSVGElement)) throw new Error("Missing host");
      Reflect.set(
        window,
        "meshPlayer",
        await api.createInteractiveSvgPlayerAsync(root, blueprint, { autoplay: false }),
      );
    }, compiled.document);
    const rest = await sample();
    assert.equal(rest.restEnd, 255);
    assert.equal(rest.bentEnd, 0);
    await page.evaluate(() => Reflect.get(window, "meshPlayer").advance(1));
    const bent = await sample();
    // The right end swung down about the elbow (100, 0) by 60°: it left (195, 0) for (150, 80).
    assert.equal(bent.restEnd, 0, JSON.stringify(bent));
    assert.equal(bent.bentEnd, 255, JSON.stringify(bent));
    assert.equal(bent.middle, 255);

    const editor = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [],
      plain = structuredClone(f.project),
      board = plain.artboards[0],
      node = board?.scene.nodes.find((item) => item.id === f.id);
    assert.ok(board?.rig && node);
    board.rig.skins = [];
    delete node.imageMesh;
    editor.on("pageerror", (error) => errors.push(error.message));
    editor.on("dialog", (dialog) => dialog.accept());
    await editor.addInitScript(
      (value) => localStorage.setItem("edisvg-project", JSON.stringify(value)),
      parseProject(plain),
    );
    await editor.goto(server.url);
    await editor.locator(".scene-artwork>svg").waitFor();
    await editor.locator(`[data-scene-select="${f.id}"]`).click();
    const form = editor.getByRole("form", { name: "Malha raster", exact: true });
    await form.getByLabel("Colunas").fill("3");
    await form.getByLabel("Linhas").fill("2");
    await form.getByRole("button", { name: "Criar malha", exact: true }).click();
    await editor.waitForFunction(
      (id) =>
        JSON.parse(
          localStorage.getItem("edisvg-project") ?? "null",
        )?.artboards[0]?.scene.nodes.find((item: { id: string }) => item.id === id)?.imageMesh
          ?.columns === 3,
      f.id,
    );
    const shape = editor.locator(`.scene-artwork [data-object="${f.id}"]>g[data-edi-mesh="3x2"]`);
    assert.equal(await shape.locator(":scope>g").count(), 12);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
