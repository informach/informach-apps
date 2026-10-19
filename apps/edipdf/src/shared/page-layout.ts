export type PageLayout = "continuous" | "single" | "spread";
export interface PageLayoutRow {
  top: number;
  height: number;
  width: number;
  indices: number[];
}
export interface PageLayoutGeometry {
  rows: PageLayoutRow[];
  tops: number[];
  width: number;
  height: number;
}
/** Pure geometry shared by virtualization, navigation, fit and position restoration. */
export function pageLayoutGeometry(
  sizes: { w: number; h: number }[],
  scale: number,
  mode: PageLayout,
  current: number,
  pad = 28,
  gap = 18,
): PageLayoutGeometry {
  if (!Number.isFinite(scale) || scale <= 0 || !sizes.length)
    return { rows: [], tops: [], width: 0, height: pad * 2 };
  const rows: PageLayoutRow[] = [],
    tops = Array<number>(sizes.length).fill(pad);
  const indices =
    mode === "single"
      ? [Math.max(0, Math.min(sizes.length - 1, current))]
      : sizes.map((_, index) => index);
  const count = mode === "spread" ? 2 : 1;
  let y = pad,
    width = 0;
  for (let i = 0; i < indices.length; i += count) {
    const group = indices.slice(i, i + count);
    const height = group.reduce((max, index) => Math.max(max, sizes[index].h * scale), 0);
    const rowWidth = group.reduce(
      (sum, index) => sum + sizes[index].w * scale,
      gap * (group.length - 1),
    );
    rows.push({ top: y, height, width: rowWidth, indices: group });
    for (const index of group) tops[index] = y;
    width = Math.max(width, rowWidth);
    y += height + gap;
  }
  return { rows, tops, width: width + pad * 2, height: y - gap + pad };
}
export function visiblePageRows(rows: PageLayoutRow[], low: number, high: number): PageLayoutRow[] {
  let left = 0,
    right = rows.length;
  while (left < right) {
    const mid = (left + right) >>> 1;
    if (rows[mid].top + rows[mid].height < low) left = mid + 1;
    else right = mid;
  }
  let end = left;
  while (end < rows.length && rows[end].top <= high) end++;
  return rows.slice(left, end);
}
