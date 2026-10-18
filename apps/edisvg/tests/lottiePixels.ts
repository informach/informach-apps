import type { LottiePlayer } from "lottie-web";
import type { Page } from "playwright";
import type { compileInteractiveArtboard } from "../src/shared/interactive";
import type { LottieDocument } from "../src/shared/lottie/model";

declare global {
  interface Window {
    lottie?: LottiePlayer;
  }
}
interface Options {
  blueprint: ReturnType<typeof compileInteractiveArtboard>["document"];
  animation: LottieDocument;
  frames: number[];
  strokes: boolean;
  checkPrecision: boolean;
}
/** Real Edi SVG and independent lottie-web SVG-light consumers. Pixel tolerance
 * is one channel unit; diagnostic precision canaries keep separate assertions. */
export function compareLottiePixels(page: Page, options: Options) {
  return page.evaluate(
    async ({ blueprint, animation, frames, strokes, checkPrecision }) => {
      const api = window.EdiAssetTest,
        lottie = window.lottie,
        original = document.querySelector("#edi>svg"),
        container = document.querySelector("#lottie");
      if (!api || !lottie || !(original instanceof SVGSVGElement) || !container)
        throw new Error("Missing independent players");
      const edi = await api.createVisualSvgPlayerAsync(original, blueprint, {
          autoplay: false,
          pauseOffscreen: false,
          respectReducedMotion: false,
        }),
        player = lottie.loadAnimation({
          container,
          renderer: "svg",
          autoplay: false,
          loop: false,
          animationData: animation,
        });
      try {
        await new Promise<void>((resolve, reject) => {
          player.addEventListener("DOMLoaded", () => resolve());
          player.addEventListener("data_failed", () => reject(new Error("Lottie data failed")));
          player.addEventListener("error", () => reject(new Error("Lottie renderer failed")));
          if (player.isLoaded) resolve();
        });
        const svg = container.querySelector("svg");
        if (!svg) throw new Error("Lottie did not build SVG");
        const points: [number, number][] = [];
        for (let y = 15; y < 150; y += strokes ? 3 : 17)
          for (let x = 5; x < 290; x += strokes ? 3 : 13) points.push([x, y]);
        const differences: {
          frame: number;
          point: [number, number];
          actual: number[];
          expected: number[];
        }[] = [];
        let previous = 0,
          painted = 0,
          geometricError = 0;
        for (const frame of frames) {
          if (frame < previous) {
            edi.reset();
            previous = 0;
          }
          edi.advance((frame - previous) / animation.fr);
          previous = frame;
          player.goToAndStop(frame, true);
          if (checkPrecision) {
            const references = [...original.querySelectorAll("path")],
              seen = new Set<Element>(),
              renderedPaths = [...svg.querySelectorAll("path")].filter((path) => {
                const parent = path.parentElement;
                if (!parent || seen.has(parent)) return false;
                seen.add(parent);
                return true;
              }),
              rootA = original.getCTM(),
              rootB = svg.getCTM();
            if (references.length !== renderedPaths.length || !rootA || !rootB)
              throw new Error("Missing precision curve mapping");
            for (const [index, reference] of references.entries()) {
              const rendered = renderedPaths[index];
              if (
                !(reference instanceof SVGPathElement) ||
                !(rendered instanceof SVGPathElement) ||
                !rootA ||
                !rootB
              )
                throw new Error("Missing actual precision curves");
              const a = reference.getCTM(),
                b = rendered.getCTM();
              if (!a || !b) throw new Error("Missing actual precision matrices");
              const matrixA = rootA.inverse().multiply(a),
                matrixB = rootB.inverse().multiply(b);
              for (let step = 0; step <= 32; step++) {
                const p = reference
                    .getPointAtLength((reference.getTotalLength() * step) / 32)
                    .matrixTransform(matrixA),
                  q = rendered
                    .getPointAtLength((rendered.getTotalLength() * step) / 32)
                    .matrixTransform(matrixB);
                geometricError = Math.max(geometricError, Math.hypot(p.x - q.x, p.y - q.y));
              }
            }
          }
          const expected = await api.svgPixels(original, animation.w, animation.h, points),
            actual = await api.svgPixels(svg, animation.w, animation.h, points);
          for (const [index, pixel] of actual.entries()) {
            if ((pixel[3] ?? 0) > 0) painted++;
            const reference = expected[index],
              point = points[index];
            if (!reference || !point) throw new Error("Pixel sample missing");
            if (
              pixel.some((channel, at) => Math.abs(channel - (reference[at] ?? -999)) > 1) &&
              differences.length < 20
            )
              differences.push({ frame, point, actual: pixel, expected: reference });
          }
        }
        return {
          differences,
          loaded: player.isLoaded,
          painted,
          totalFrames: player.totalFrames,
          geometricError,
          svg: svg.outerHTML,
        };
      } finally {
        player.destroy();
        await edi.destroyAsync();
      }
    },

    options,
  );
}
