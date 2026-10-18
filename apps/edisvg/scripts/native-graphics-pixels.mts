import type { Page } from "playwright";
/** Actual shipped ESM/file/CSP rasterization; helpers do not modify the user's
 * document, bypass CSP, or emulate SVG/Web Audio behavior. */
export async function nativeGraphicPixels(
  page: Page,
  compiled: { svg: string; document: unknown },
  points: [number, number][],
  advance = 0,
) {
  return page.evaluate(
    async ({ compiled, points, advance }) => {
      const before = localStorage.getItem("edisvg-project"),
        host = document.createElement("div");
      host.setAttribute("data-native-rig-fixture", "");
      host.style.cssText =
        "width:100px;height:100px;position:fixed;right:550px;top:500px;z-index:9999;background:white";
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"),
        title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = "Host nativo";
      svg.setAttribute("viewBox", "0 0 3 3");
      svg.append(title);
      host.append(svg);
      document.body.append(host);
      svg.style.width = "100%";
      svg.style.height = "100%";
      try {
        const runtime = await import(new URL("edi-player.mjs", location.href).href),
          player = await runtime.createVisualSvgPlayerAsync(svg, compiled.document, {
            autoplay: false,
            pauseOffscreen: false,
            respectReducedMotion: false,
          });
        let pixels: number[][];
        try {
          player.advance(advance);
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          const copy = svg.cloneNode(true);
          if (!(copy instanceof SVGSVGElement)) throw new Error("Missing native graphic copy");
          copy.setAttribute("width", "100");
          copy.setAttribute("height", "100");
          copy.removeAttribute("style");
          const image = new Image();
          image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = 100;
          canvas.height = 100;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Missing actual native pixel canvas");
          context.drawImage(image, 0, 0);
          pixels = points.map(([x, y]) => [...context.getImageData(x, y, 1, 1).data]);
        } finally {
          await player.destroyAsync();
        }
        if (
          svg.childNodes.length !== 1 ||
          svg.firstChild !== title ||
          svg.getAttribute("viewBox") !== "0 0 3 3"
        )
          throw new Error("Portable native player did not restore host ownership");
        return {
          pixels,
          preserved: localStorage.getItem("edisvg-project") === before,
        };
      } finally {
        host.remove();
      }
    },
    { compiled, points, advance },
  );
}
