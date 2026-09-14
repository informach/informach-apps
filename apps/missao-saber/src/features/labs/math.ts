export function gridMeasures(cells: boolean[], columns: number) {
  let area = 0;
  let perimeter = 0;
  for (let i = 0; i < cells.length; i++) {
    if (!cells[i]) continue;
    area++;
    const row = Math.floor(i / columns);
    const col = i % columns;
    if (row === 0 || !cells[i - columns]) perimeter++;
    if (i + columns >= cells.length || !cells[i + columns]) perimeter++;
    if (col === 0 || !cells[i - 1]) perimeter++;
    if (col === columns - 1 || !cells[i + 1]) perimeter++;
  }
  return { area, perimeter };
}
export function successiveDiscounts(initial: number, first: number, second: number) {
  const intermediate = initial * (1 - first / 100);
  return {
    intermediate,
    final: intermediate * (1 - second / 100),
    combinedPercent: (1 - (1 - first / 100) * (1 - second / 100)) * 100,
  };
}
