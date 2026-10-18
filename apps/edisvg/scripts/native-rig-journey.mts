import assert from "node:assert/strict";
import type { Page } from "playwright";
import { tsImport } from "tsx/esm/api";
import { verifyNativeFontFallback } from "./native-font-fallback-journey.mts";
import { verifyNativeGradient } from "./native-gradient-journey.mts";
import { verifyNativeImageSlice } from "./native-image-slice-journey.mts";
import { verifyNativeJoystick } from "./native-joystick-journey.mts";
import { verifyNativeRigClone } from "./native-rig-clone-journey.mts";
import { verifyNativeSemantics } from "./native-semantics-journey.mts";
import { verifyNativeSvgEffectImport } from "./native-svg-effect-import.mts";
import { verifyNativeSvgSemanticImport } from "./native-svg-semantic-import.mts";
import { verifyNativeTrim } from "./native-trim-journey.mts";
import { verifyNativeVectorEffects } from "./native-vector-effects-journey.mts";

/** Real shipped module under Electron file origin/CSP, isolated from the open project. */
export async function verifySvgNativeRigJourney(page: Page, screenshotPath: string) {
  const {
    compileInteractiveArtboard,
    deformationFixture,
    rigFixture,
    nativeAssetFixture,
    audioProjectFixture,
    imageSliceFixture,
    gradientFixture,
    vectorEffectFixture,
    fontFallbackFixture,
    semanticFixture,
    parseProject,
    svgSemanticSource,
    svgEffectImportSources,
    trimFixture,
  }: typeof import("../tests/nativeRigFixtures.ts") = await tsImport(
    "../tests/nativeRigFixtures.ts",
    import.meta.url,
  );
  const rig = rigFixture(),
    art = rig.run([
      {
        type: "scene",
        operation: "add",
        targetId: null,
        value: {
          tag: "path",
          attrs: { d: "M0 -10L100 -10L200 -10L200 10L100 10L0 10Z", fill: "#3050a0" },
        },
      },
    ]).selected;
  if (!art) throw new Error("Missing native skin art");
  rig.run([
    {
      type: "rig",
      operation: "bind-skin",
      id: "skin-native",
      targetId: art,
      boneIds: ["node-upper", "node-lower"],
      confirmRestPose: true,
    },
  ]);
  const current = rig.project().artboards[0]?.rig;
  if (!current) throw new Error("Missing native rig");
  rig.run([
    {
      type: "rig",
      operation: "replace",
      value: {
        ...current,
        parameterClips: [
          {
            animationId: rig.clipId,
            tracks: [
              {
                id: "track-native-force",
                targetId: "constraint-hand",
                property: "strength",
                keys: [
                  { id: "key-native-force-zero", frame: 0, value: 0, easing: "linear" },
                  { id: "key-native-force-full", frame: 10, value: 1, easing: "linear" },
                ],
              },
            ],
          },
        ],
      },
    },
  ]);
  const deformation = deformationFixture(),
    rigProject = rig.project(),
    deformationProject = deformation.project();
  if (rigProject.artboards[0]) rigProject.artboards[0].scene.viewBox = [-40, -40, 320, 240];
  if (deformationProject.artboards[0])
    deformationProject.artboards[0].scene.viewBox = [-40, -40, 320, 300];
  const fixtures = [
    {
      ...compileInteractiveArtboard(rigProject, rig.rootId, { animationId: rig.clipId }),
      pathId: art,
      soloIds: [],
      ik: true,
    },
    {
      ...compileInteractiveArtboard(deformationProject, deformation.rootId, {
        animationId: deformation.clipId,
      }),
      pathId: deformation.mouthId,
      soloIds: [deformation.faceA, deformation.faceB],
      ik: false,
    },
  ];
  try {
    const result = await page.evaluate(async (fixtures) => {
      const before = localStorage.getItem("edisvg-project"),
        runtime = await import(new URL("edi-player.mjs", location.href).href),
        results = [];
      for (const fixture of fixtures) {
        const host = document.createElement("div");
        host.setAttribute("data-native-rig-fixture", "");
        host.style.cssText = `width:320px;height:320px;position:fixed;right:${20 + results.length * 340}px;top:120px;z-index:9999;background:white;border:2px solid #3050a0`;
        host.innerHTML = fixture.svg;
        document.body.append(host);
        const svg = host.querySelector("svg");
        if (!svg) throw new Error("Missing native rig SVG");
        svg.style.width = "100%";
        svg.style.height = "100%";
        const player = await runtime.createInteractiveSvgPlayerAsync(svg, fixture.document, {
          autoplay: false,
          pauseOffscreen: false,
        });
        try {
          const samples = [];
          for (const time of [0, 0.5, 1]) {
            player.reset();
            player.advance(time);
            const shape = host.querySelector(`[data-edi-object="${fixture.pathId}"]>path`);
            if (!(shape instanceof SVGGeometryElement))
              throw new Error("Missing native deformed path");
            const diagnostics = player.inspectRig();
            samples.push({
              time,
              d: shape.getAttribute("d"),
              length: shape.getTotalLength(),
              strength: fixture.ik ? diagnostics[0]?.strength : null,
              residual: fixture.ik ? diagnostics[0]?.residual : null,
              soloVisible: fixture.soloIds.map(
                (id) =>
                  host.querySelector(`[data-edi-object="${id}"]`)?.getAttribute("display") !==
                  "none",
              ),
            });
          }
          results.push(samples);
        } finally {
          player.destroy();
        }
      }
      return { results, preserved: localStorage.getItem("edisvg-project") === before };
    }, fixtures);
    assert.equal(result.preserved, true);
    assert.equal(result.results.length, 2);
    const first = result.results[0],
      second = result.results[1];
    if (!first || !second) throw new Error("Missing native samples");
    assert.deepEqual(
      first.map((value) => value.strength),
      [0, 0.5, 1],
    );
    assert.ok((first[2]?.residual ?? Infinity) < 0.01);
    assert.notEqual(first[0]?.d, first[2]?.d);
    assert.notEqual(second[0]?.d, second[2]?.d);
    assert.deepEqual(
      second.map((sample) => sample.soloVisible),
      [
        [true, false],
        [false, true],
        [false, false],
      ],
    );
    assert.ok(
      result.results.flat().every((value) => Number.isFinite(value.length) && value.length > 0),
    );
    const resources = nativeAssetFixture(),
      compiled = compileInteractiveArtboard(resources.project, resources.boardId);
    const assetResult = await page.evaluate(
      async ({ compiled, fontId }) => {
        const before = localStorage.getItem("edisvg-project"),
          host = document.createElement("div");
        host.setAttribute("data-native-rig-fixture", "");
        host.style.cssText =
          "width:320px;height:320px;position:fixed;right:700px;top:120px;z-index:9999;background:white;border:2px solid #3050a0";
        host.innerHTML = compiled.svg;
        document.body.append(host);
        const svg = host.querySelector("svg");
        if (!svg) throw new Error("Missing native asset SVG");
        svg.style.width = "100%";
        svg.style.height = "100%";
        const runtime = await import(new URL("edi-player.mjs", location.href).href),
          player = await runtime.createInteractiveSvgPlayerAsync(svg, compiled.document, {
            autoplay: false,
            pauseOffscreen: false,
          });
        try {
          const text = svg.querySelector("text"),
            image = svg.querySelector("defs>image"),
            bitmap = new Image();
          if (!text || !image) throw new Error("Missing native resource rendering");
          bitmap.src = image.getAttribute("href") ?? "";
          await bitmap.decode();
          const canvas = document.createElement("canvas");
          canvas.width = 1;
          canvas.height = 1;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Missing native raster context");
          context.drawImage(bitmap, 0, 0);
          return {
            font: text.getAttribute("font-family"),
            fontReady: [...document.fonts].some(
              (face) =>
                face.family.replace(/^["']|["']$/g, "") === `edi-${fontId}` &&
                face.status === "loaded",
            ),
            textLength: text.getComputedTextLength(),
            definitions: svg.querySelectorAll("defs>image").length,
            uses: svg.querySelectorAll("use").length,
            pixel: [...context.getImageData(0, 0, 1, 1).data],
            preserved: localStorage.getItem("edisvg-project") === before,
          };
        } finally {
          player.destroy();
        }
      },
      { compiled, fontId: resources.fontId },
    );
    assert.equal(assetResult.font, `edi-${resources.fontId}`);
    assert.equal(assetResult.fontReady, true);
    assert.ok(assetResult.textLength > 50 && assetResult.textLength < 300);
    assert.equal(assetResult.definitions, 1);
    assert.equal(assetResult.uses, 2);
    assert.deepEqual(assetResult.pixel, [255, 0, 0, 255]);
    assert.equal(assetResult.preserved, true);
    const sound = audioProjectFixture(),
      audioCompiled = compileInteractiveArtboard(sound.project, sound.boardId, {
        animationId: "animation-tone",
      });
    const audioResult = await page.evaluate(async (compiled) => {
      const before = localStorage.getItem("edisvg-project"),
        host = document.createElement("div");
      host.setAttribute("data-native-rig-fixture", "");
      host.innerHTML = compiled.svg;
      document.body.append(host);
      const svg = host.querySelector("svg");
      if (!svg) throw new Error("Missing audio host");
      const runtime = await import(new URL("edi-player.mjs", location.href).href),
        context = new OfflineAudioContext(1, 1000, 8000),
        captions: string[] = [],
        player = await runtime.createInteractiveSvgPlayerAsync(svg, compiled.document, {
          autoplay: false,
          pauseOffscreen: false,
          audioContext: context,
          onAudioCue: (cue: { caption: string }) => captions.push(cue.caption),
        });
      try {
        player.advance(0.11);
        const muted = player.inspectAudio();
        player.reset();
        await player.enableAudio();
        player.advance(0.11);
        const enabled = player.inspectAudio(),
          buffer = await context.startRendering();
        let energy = 0;
        for (const sample of buffer.getChannelData(0)) energy += sample * sample;
        return {
          muted,
          enabled,
          captions,
          energy,
          preserved: localStorage.getItem("edisvg-project") === before,
        };
      } finally {
        await player.destroyAsync();
      }
    }, audioCompiled);
    assert.equal(audioResult.muted.enabled, false);
    assert.equal(audioResult.muted.buffers, 0);
    assert.equal(audioResult.enabled.activeVoices, 1);
    assert.deepEqual(audioResult.captions, ["Tom de confirmação", "Tom de confirmação"]);
    assert.ok(audioResult.energy > 10);
    assert.equal(audioResult.preserved, true);
    const sliced = imageSliceFixture();
    await verifyNativeImageSlice(page, compileInteractiveArtboard(sliced.project, sliced.boardId));
    const painted = gradientFixture();
    await verifyNativeGradient(page, compileInteractiveArtboard(painted.project, painted.boardId));
    const clipped = vectorEffectFixture();
    await verifyNativeVectorEffects(
      page,
      compileInteractiveArtboard(clipped.project, clipped.boardId, {
        animationId: clipped.animationId,
      }),
    );
    await page.screenshot({ path: screenshotPath });
    const typography = fontFallbackFixture();
    const trimmed = trimFixture();
    await verifyNativeTrim(
      page,
      compileInteractiveArtboard(trimmed.project(), trimmed.boardId, {
        animationId: trimmed.animationId,
      }).document,
      trimmed.shapeId,
      screenshotPath.replace(/edisvg-rig-runtime\.png$/, "edisvg-trim.png"),
    );
    // Runtime fixtures use fixed overlays for screenshot evidence. Their
    // players are already destroyed; release the hosts before pointer-based
    // authoring journeys so they cannot intercept the editor's controls.
    await page.evaluate(() => {
      for (const host of document.querySelectorAll("[data-native-rig-fixture]")) host.remove();
    });
    await verifyNativeRigClone(
      page,
      parseProject,
      screenshotPath.replace(/edisvg-rig-runtime\.png$/, "edisvg-rig-clone.png"),
    );
    await verifyNativeSvgSemanticImport(
      page,
      svgSemanticSource,
      parseProject,
      screenshotPath.replace(/edisvg-rig-runtime\.png$/, "edisvg-svg-semantic-import.png"),
    );
    const semantics = semanticFixture();
    for (const [index, source] of svgEffectImportSources.entries()) {
      await verifyNativeSvgEffectImport(
        page,
        source,
        parseProject,
        screenshotPath.replace(/edisvg-rig-runtime\.png$/, `edisvg-svg-effect-${index}.png`),
      );
    }
    await verifyNativeSemantics(
      page,
      compileInteractiveArtboard(semantics.project, semantics.boardId).document,
      screenshotPath.replace(/edisvg-rig-runtime\.png$/, "edisvg-semantics.png"),
    );
    await verifyNativeFontFallback(
      page,
      compileInteractiveArtboard(typography.project, typography.boardId),
      screenshotPath.replace(/edisvg-rig-runtime\.png$/, "edisvg-font-fallback.png"),
    );
    await verifyNativeJoystick(
      page,
      parseProject,
      screenshotPath.replace(/edisvg-rig-runtime\.png$/, "edisvg-joystick.png"),
    );
    console.log(
      "Verified native file-origin rig channels, IK, vector skin, morph/path/solo runtime and unchanged project",
    );
    console.log(
      "Verified native file-origin PNG deduplication/pixels and actual embedded font load/metrics without project mutation",
    );
    console.log(
      "Verified native offline Web Audio PCM samples and muted captions under file/CSP without opening speakers",
    );
  } finally {
    await page.evaluate(() => {
      for (const host of document.querySelectorAll("[data-native-rig-fixture]")) host.remove();
    });
  }
}
