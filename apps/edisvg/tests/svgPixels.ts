/** Real browser SVG rasterization, only used by fidelity tests. */
export async function svgPixels(
  svg: SVGSVGElement,
  width: number,
  height: number,
  points: [number, number][],
) {
  if (![width, height].every((size) => Number.isInteger(size) && size > 0 && size <= 2048))
    throw new Error("Pixel fixture outside test budget");
  const copy = svg.cloneNode(true);
  if (!(copy instanceof SVGSVGElement)) throw new Error("Missing copied SVG");
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("width", String(width));
  copy.setAttribute("height", String(height));
  copy.removeAttribute("style");
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Missing real pixel canvas");
  context.drawImage(image, 0, 0);
  return points.map(([x, y]) => [...context.getImageData(x, y, 1, 1).data]);
}
