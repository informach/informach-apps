import assert from "node:assert/strict";
import type { Page } from "playwright";
export async function verifyNativeImageSlice(
  page: Page,
  compiled: { svg: string; document: unknown },
) {
  const result = await page.evaluate(async (compiled) => {
    const before = localStorage.getItem("edisvg-project"),
      host = document.createElement("div");
    host.setAttribute("data-native-rig-fixture", "");
    host.style.cssText =
      "width:200px;height:100px;position:fixed;right:700px;top:500px;z-index:9999;background:white";
    host.innerHTML = compiled.svg;
    document.body.append(host);
    const svg = host.querySelector("svg");
    if (!svg) throw new Error("Missing native slice SVG");
    svg.style.width = "100%";
    svg.style.height = "100%";
    const runtime = await import(new URL("edi-player.mjs", location.href).href),
      player = await runtime.createInteractiveSvgPlayerAsync(svg, compiled.document, {
        autoplay: false,
        pauseOffscreen: false,
      });
    try {
      const copy = svg.cloneNode(true);
      if (!(copy instanceof SVGSVGElement)) throw new Error("Missing raster copy");
      copy.setAttribute("width", "200");
      copy.setAttribute("height", "100");
      copy.removeAttribute("style");
      const raster = new Image();
      raster.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`;
      await raster.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 200;
      canvas.height = 100;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Missing native pixel canvas");
      context.drawImage(raster, 0, 0);
      const pixels = [
          [5, 5],
          [20, 5],
          [195, 5],
        ].map(([x, y]) => [...context.getImageData(x ?? 0, y ?? 0, 1, 1).data]),
        corner = svg.querySelector("[data-edi-slice]>svg")?.getAttribute("width");
      host.style.width = "12px";
      host.style.height = "12px";
      player.advance(0);
      const small = svg.querySelector("[data-edi-slice]>svg")?.getAttribute("width");
      return {
        pixels,
        corner,
        small,
        preserved: localStorage.getItem("edisvg-project") === before,
      };
    } finally {
      await player.destroyAsync();
    }
  }, compiled);
  assert.deepEqual(result.pixels, [
    [255, 0, 0, 255],
    [255, 0, 255, 255],
    [0, 255, 0, 255],
  ]);
  assert.equal(result.corner, "10");
  assert.equal(result.small, "6");
  assert.equal(result.preserved, true);
  console.log(
    "Verified native sliced PNG pixels and real responsive border resizing under file/CSP",
  );
}
