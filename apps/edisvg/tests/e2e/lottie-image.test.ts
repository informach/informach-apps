import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { chromium } from "playwright";
import { executeDocumentTransaction } from "../../src/shared/documentCommands";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { compileLottie } from "../../src/shared/lottie/compile";
import { newProject } from "../../src/shared/project";
import { assetTestBundle } from "../assetBundle";
import { sliceImageFixture } from "../assetFixtures";
import { compareLottiePixels } from "../lottiePixels";
import { rendererServer } from "../rendererServer";

/** Blue rect below, an animated PNG inside a translucent group, red rect above. */
function imageProject(rotate: boolean) {
  let project = newProject(),
    revision = 0;
  const sessionId = crypto.randomUUID(),
    run = (commands: unknown[]) => {
      const result = executeDocumentTransaction(
        { project, revision, sessionId },
        { projectId: project.id, sessionId, revision, commands },
      );
      project = result.project;
      revision = result.revision;
      return result;
    },
    board = project.artboards[0];
  assert.ok(board);
  run([
    {
      type: "artboard",
      operation: "update",
      id: board.id,
      name: board.name,
      width: 300,
      height: 160,
    },
  ]);
  const add = (attrs: Record<string, string>) => {
    const id = run([
      { type: "scene", operation: "add", targetId: null, value: { tag: "rect", attrs } },
    ]).selected;
    assert.ok(id);
    return id;
  };
  add({ x: "20", y: "20", width: "120", height: "100", fill: "#2050b0" });
  const image = sliceImageFixture();
  run([{ type: "asset", operation: "put", value: image }]);
  const photo = run([{ type: "asset", operation: "insert-image", assetId: image.id }]).selected;
  assert.ok(photo);
  run([
    {
      type: "scene",
      operation: "attrs",
      targetId: photo,
      value: { x: "60", y: "30", width: "120", height: "90", preserveAspectRatio: "none" },
    },
  ]);
  const group = run([
    { type: "composition", operation: "group", targetIds: [photo], name: "Foto" },
  ]).selected;
  assert.ok(group);
  run([{ type: "scene", operation: "attrs", targetId: group, value: { opacity: "0.8" } }]);
  add({ x: "150", y: "60", width: "120", height: "60", fill: "#e33a60" });
  run([
    {
      type: "motion",
      command: {
        type: "create-animation",
        animation: {
          id: "animation-photo",
          name: "Foto",
          fps: 10,
          frames: 10,
          mode: "once",
          tracks: [],
        },
      },
    },
    ...[
      ...(rotate
        ? [
            [0, "rotation", 0],
            [10, "rotation", 30],
          ]
        : []),
      [0, "opacity", 100],
      [10, "opacity", 60],
      [0, "x", 0],
      [10, "x", 40],
    ].map(([frame, property, value]) => ({
      type: "motion",
      command: {
        type: "set-key",
        animationId: "animation-photo",
        targetId: photo,
        property,
        frame,
        value,
      },
    })),
  ]);
  return { project, boardId: board.id, photo };
}

for (const rotate of [false, true])
  test(`PNG images export as Lottie image layers that lottie-web draws like the shared player (${rotate ? "rotating" : "moving and fading"})`, {
    timeout: 60000,
  }, async () => {
    const f = imageProject(rotate),
      exported = compileLottie(f.project, {
        artboardId: f.boardId,
        animationId: "animation-photo",
        alt: "Foto",
        confirmSampling: true,
        confirmRendererPrecision: true,
      }),
      document = exported.document;
    assert.deepEqual(
      document.layers.map((layer) => layer.ty),
      [4, 2, 3, 4, 3],
      "red shapes above, the image (with its holder), blue shapes below, global transform",
    );
    assert.equal(document.assets.length, 1);
    assert.match(document.assets[0]?.p ?? "", /^data:image\/png;base64,/);
    const require = createRequire(import.meta.url),
      light = await readFile(require.resolve("lottie-web/build/player/lottie_light.js"), "utf8"),
      code = await assetTestBundle(),
      compiled = compileInteractiveArtboard(f.project, f.boardId, {
        animationId: "animation-photo",
      }),
      server = await rendererServer(
        new Map([
          [
            "/lottie-image.html",
            {
              content: '<main id="edi"><svg></svg></main><main id="lottie"></main>',
              mime: "text/html",
            },
          ],
        ]),
      ),
      channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
      browser = await chromium.launch(channel ? { channel } : {});
    try {
      const page = await browser.newPage(),
        errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${server.url}/lottie-image.html`);
      await page.addScriptTag({ content: code });
      await page.addScriptTag({ content: light });
      const result = await compareLottiePixels(page, {
        blueprint: compiled.document,
        animation: document,
        strokes: true,
        checkPrecision: false,
        frames: [0, 5, 10],
      });
      assert.equal(result.loaded, true);
      assert.ok(result.painted > 1000, `painted ${result.painted}`);
      // Axis-aligned frames match; rotated ones resample the raster through different pipelines
      // (nested SVG viewport vs a Lottie image element): sparse differences on the image edges and
      // colour-cell seams only.
      assert.ok(
        result.differenceCount <= (rotate ? 200 : 4),
        `${result.differenceCount} ${JSON.stringify(result.differences.slice(0, 4))}`,
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await server.close();
    }
  });
