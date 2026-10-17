function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function normalizeRect(a, b, bounds) {
  const x = clamp(Math.min(a.x, b.x), 0, bounds.width);
  const y = clamp(Math.min(a.y, b.y), 0, bounds.height);
  return {
    x,
    y,
    width: clamp(Math.max(a.x, b.x), 0, bounds.width) - x,
    height: clamp(Math.max(a.y, b.y), 0, bounds.height) - y,
  };
}
function pixelRect(rect, display, image) {
  if (!rect || !["x", "y", "width", "height"].every((k) => Number.isFinite(rect[k])))
    throw new Error("Seleção inválida.");
  if (
    rect.width < 2 ||
    rect.height < 2 ||
    rect.x < 0 ||
    rect.y < 0 ||
    rect.x + rect.width > display.width + 1 ||
    rect.y + rect.height > display.height + 1
  )
    throw new Error("Seleção fora do monitor.");
  const x = clamp(Math.round((rect.x * image.width) / display.width), 0, image.width - 1);
  const y = clamp(Math.round((rect.y * image.height) / display.height), 0, image.height - 1);
  return {
    x,
    y,
    width: clamp(Math.round((rect.width * image.width) / display.width), 1, image.width - x),
    height: clamp(Math.round((rect.height * image.height) / display.height), 1, image.height - y),
  };
}
function stitchedHeight(heights, overlap) {
  if (
    !heights.length ||
    !Number.isFinite(overlap) ||
    overlap < 0 ||
    heights.some((h) => !Number.isFinite(h) || h <= overlap)
  )
    throw new Error("Sobreposição inválida.");
  const height = heights.reduce((a, b) => a + b, 0) - overlap * (heights.length - 1);
  if (height > 30000) throw new Error("A imagem atingiu o limite de 30.000 pixels de altura.");
  return height;
}
module.exports = { clamp, normalizeRect, pixelRect, stitchedHeight };
