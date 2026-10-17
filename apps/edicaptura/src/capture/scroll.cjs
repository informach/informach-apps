// Samples preserve native rows so overlap is measured in physical pixels.
function signature(bitmap, width, height) {
  const columns = Math.min(48, width),
    data = new Uint8Array(columns * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < columns; x++) {
      const px = Math.min(width - 1, Math.floor(((x + 0.5) * width) / columns));
      const i = (y * width + px) * 4;
      data[y * columns + x] = Math.round((bitmap[i] + bitmap[i + 1] + bitmap[i + 2]) / 3);
    }
  return { data, columns, height };
}
function difference(a, b, offset = 0) {
  if (a.columns !== b.columns || a.height !== b.height) return Infinity;
  const rows = a.height - offset,
    step = Math.max(1, Math.floor(rows / 80));
  let total = 0,
    count = 0;
  for (let y = 0; y < rows; y += step)
    for (let x = 0; x < a.columns; x++) {
      total += Math.abs(a.data[(y + offset) * a.columns + x] - b.data[y * b.columns + x]);
      count++;
    }
  return total / count;
}
function findOverlap(a, b) {
  if (difference(a, b) < 1.5) return a.height;
  const minimum = Math.max(12, Math.ceil(a.height * 0.15));
  let best = { score: Infinity, offset: 0 };
  const scores = [];
  for (let offset = 1; offset <= a.height - minimum; offset++) {
    const score = difference(a, b, offset);
    scores.push({ score, offset });
    if (score < best.score) best = { score, offset };
  }
  // Refuse ambiguous/repeating or unrelated content instead of silently losing rows.
  const second = Math.min(
    ...scores.filter((s) => Math.abs(s.offset - best.offset) > 3).map((s) => s.score),
  );
  if (best.score > 7 || second - best.score < 0.5) return null;
  const start = best.offset * a.columns,
    sample = a.data.subarray(start);
  let low = 255,
    high = 0;
  for (const value of sample) {
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  return high - low < 20 ? null : a.height - best.offset;
}
function stitchBitmaps(frames, overlaps) {
  if (!frames.length || frames.length !== overlaps.length)
    throw new Error("Nenhum trecho disponível.");
  const width = frames[0].width;
  let height = 0;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i],
      cut = i ? overlaps[i] : 0;
    if (
      f.width !== width ||
      !Number.isInteger(cut) ||
      cut < 0 ||
      cut >= f.height ||
      f.bitmap.length !== f.width * f.height * 4
    )
      throw new Error("Trechos ou sobreposição inválidos.");
    height += f.height - cut;
  }
  if (height > 30000 || width * height > 100_000_000)
    throw new Error("Captura longa demais. Finalize com menos trechos.");
  const bitmap = Buffer.alloc(width * height * 4);
  let position = 0;
  frames.forEach((f, i) => {
    const part = f.bitmap.subarray((i ? overlaps[i] : 0) * width * 4);
    part.copy(bitmap, position);
    position += part.length;
  });
  return { bitmap, width, height };
}
module.exports = { signature, difference, findOverlap, stitchBitmaps };
