import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { executeDocumentTransaction } from "../../src/shared/documentCommands";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { contentSnapshot, parseProject } from "../../src/shared/project";
import { assetTestBundle } from "../assetBundle";
import { deformationFixture } from "../deformationFixture";
import { rendererServer } from "../rendererServer";
import { semanticFixture } from "../semanticFixture";
import { trimFixture } from "../trimFixture";

test("editing an existing path constraint preserves rig v3 trims, deformation channels and undo/reload", {
  timeout: 60000,
}, async () => {
  const fixture = deformationFixture(),
    board = fixture.project().artboards[0];
  assert.ok(board?.rig);
  fixture.run([
    {
      type: "rig",
      operation: "replace",
      value: {
        ...board.rig,
        version: 3,
        trims: [
          {
            id: "trim-mouth",
            targetId: fixture.mouthId,
            start: 0,
            end: 1,
            offset: 0,
            tolerance: 0.001,
            mode: "parallel",
          },
        ],
      },
    },
  ]);
  const before = contentSnapshot(fixture.project()),
    server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
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
    const snapshot = async () => {
      const text = await page.evaluate(() => localStorage.getItem("edisvg-project"));
      assert.ok(text);
      return parseProject(JSON.parse(text));
    };
    assert.deepEqual(contentSnapshot(await snapshot()), before);
    await page.getByRole("button", { name: "Restrições", exact: true }).click();
    assert.deepEqual(
      await page
        .getByLabel("Editar restrição", { exact: true })
        .locator("option")
        .evaluateAll((options) => options.map((option) => option.getAttribute("value"))),
      ["", "constraint-follow"],
    );
    await page.getByLabel("Editar restrição", { exact: true }).selectOption("constraint-follow");
    await page.getByLabel("Progresso do caminho (%)", { exact: true }).fill("37");
    await page.getByRole("button", { name: "Aplicar restrição", exact: true }).click();
    const edited = await snapshot(),
      rig = edited.artboards[0]?.rig,
      constraint = rig?.constraints.find((value) => value.id === "constraint-follow");
    assert.equal(rig?.version, 3);
    assert.ok(constraint?.kind === "path");
    assert.equal(constraint.progress, 0.37);
    assert.deepEqual(rig?.trims, fixture.project().artboards[0]?.rig?.trims);
    assert.deepEqual(rig?.parameterClips, fixture.project().artboards[0]?.rig?.parameterClips);
    await page.locator('[data-action="undo"]').click();
    assert.deepEqual(contentSnapshot(await snapshot()), before);
    await page.locator('[data-action="redo"]').click();
    assert.deepEqual(contentSnapshot(await snapshot()), contentSnapshot(edited));
    await page.reload();
    await page.locator(".scene-artwork>svg").waitFor();
    assert.deepEqual(contentSnapshot(await snapshot()), contentSnapshot(edited));
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("real object duplication preserves animated trim, undo/reload and the copied player geometry rather than silently copying a static source", {
  timeout: 60000,
}, async () => {
  const fixture = trimFixture(),
    before = contentSnapshot(fixture.project()),
    server = await rendererServer(),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
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
    const snapshot = async () => {
      const text = await page.evaluate(() => localStorage.getItem("edisvg-project"));
      assert.ok(text);
      return parseProject(JSON.parse(text));
    };
    await page.locator('[data-action="design"]').click();
    await page.locator(`[data-scene-select="${fixture.shapeId}"]`).click();
    await page.locator('[data-inspector-section="organize"] > summary').click();
    await page.locator('[data-scene-operation="duplicate"]').click();
    const copied = await snapshot(),
      copyId = copied.artboards[0]?.scene.nodes[1]?.id,
      controls = copied.artboards[0]?.rig?.trims;
    assert.ok(copyId && controls?.[1]);
    assert.equal(controls[1].targetId, copyId);
    assert.deepEqual(
      copied.artboards[0]?.scene.nodes[0],
      fixture.project().artboards[0]?.scene.nodes[0],
    );
    assert.equal(copied.artboards[0]?.rig?.parameterClips?.[0]?.tracks.length, 2);
    await page.locator('[data-action="undo"]').click();
    assert.deepEqual(contentSnapshot(await snapshot()), before);
    await page.locator('[data-action="redo"]').click();
    assert.deepEqual(contentSnapshot(await snapshot()), contentSnapshot(copied));
    await page.reload();
    await page.locator(".scene-artwork>svg").waitFor();
    assert.deepEqual(contentSnapshot(await snapshot()), contentSnapshot(copied));
    const compiled = compileInteractiveArtboard(copied, fixture.boardId, {
        animationId: fixture.animationId,
      }),
      consumer = await browser.newPage();
    consumer.on("pageerror", (error) => errors.push(error.message));
    await consumer.route("**/*", (route) => route.abort());
    await consumer.setContent("<svg><title>Copied rig consumer</title></svg>");
    await consumer.addScriptTag({ content: code });
    const result = await consumer.evaluate(
      async ({ blueprint, sourceId, copyId }) => {
        const svg = document.querySelector("svg"),
          api = window.EdiAssetTest;
        if (!(svg instanceof SVGSVGElement) || !api) throw new Error("Missing copy consumer API");
        const player = await api.createVisualSvgPlayerAsync(svg, blueprint, {
          autoplay: false,
          pauseOffscreen: false,
        });
        try {
          const rows = [];
          for (const time of [0, 0.5, 1, 0.2, 0]) {
            player.reset();
            player.advance(time);
            const shapes = [sourceId, copyId].map((id) => {
              const wrapper = svg.querySelector(`[data-edi-object="${id}"]`),
                path = wrapper?.firstElementChild;
              if (!(wrapper instanceof SVGGraphicsElement) || !(path instanceof SVGPathElement))
                throw new Error("Missing copied path");
              const matrix = wrapper.getCTM();
              if (!matrix) throw new Error("Missing copied world transform");
              return {
                d: path.getAttribute("d"),
                length: path.getTotalLength(),
                x: matrix.e,
                y: matrix.f,
                a: matrix.a,
                b: matrix.b,
                c: matrix.c,
                dMatrix: matrix.d,
              };
            });
            rows.push({ time, shapes });
          }
          return rows;
        } finally {
          await player.destroyAsync();
        }
      },
      { blueprint: compiled.document, sourceId: fixture.shapeId, copyId },
    );
    for (const row of result) {
      const source = row.shapes[0],
        copy = row.shapes[1];
      assert.ok(source && copy);
      assert.equal(copy.d, source.d);
      assert.ok(Math.abs(copy.length - 200 * row.time) < 0.001);
      // CTM includes responsive viewBox scale; translation uses its local units.
      assert.ok(Math.abs(copy.x - source.x - 20 * (source.a + source.c)) < 0.001);
      assert.ok(Math.abs(copy.y - source.y - 20 * (source.b + source.dMatrix)) < 0.001);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(contentSnapshot(await snapshot()), contentSnapshot(copied));
  } finally {
    await browser.close();
    await server.close();
  }
});

test("a copied semantic button retains a distinct real listener and keyboard activation in the exported runtime", {
  timeout: 60000,
}, async () => {
  const fixture = semanticFixture(),
    sessionId = crypto.randomUUID(),
    result = executeDocumentTransaction(
      { project: fixture.project, sessionId, revision: 0 },
      {
        projectId: fixture.project.id,
        sessionId,
        revision: 0,
        commands: [{ type: "scene", operation: "duplicate", targetId: fixture.buttonId }],
      },
    ),
    copyId = result.selected;
  assert.ok(copyId);
  const compiled = compileInteractiveArtboard(result.project, fixture.boardId),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage(),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent("<svg><title>Copied semantic button</title></svg>");
    await page.addScriptTag({ content: code });
    const owner = await page.evaluateHandle(async (blueprint) => {
      const svg = document.querySelector("svg"),
        api = window.EdiAssetTest;
      if (!(svg instanceof SVGSVGElement) || !api) throw new Error("Missing copied semantics API");
      return api.createVisualSvgPlayerAsync(svg, blueprint, {
        autoplay: false,
        pauseOffscreen: false,
      });
    }, compiled.document);
    try {
      const button = page.locator(`[data-edi-object="${copyId}"]`);
      assert.equal(await button.getAttribute("role"), "button");
      await button.focus();
      await page.keyboard.press("Enter");
      assert.equal(await owner.evaluate((player) => player.getInput("input-active")), true);
      await owner.evaluate((player) => player.reset());
      await button.focus();
      await page.keyboard.press("Space");
      assert.equal(await owner.evaluate((player) => player.getInput("input-active")), true);
      assert.deepEqual(errors, []);
    } finally {
      await owner.evaluate((player) => player.destroyAsync());
      await owner.dispose();
    }
  } finally {
    await browser.close();
  }
});
