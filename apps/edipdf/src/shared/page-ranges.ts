/** Human page numbers are 1-based; returned indices retain the requested order. */
export function parsePageRange(input: string, total: number): number[] {
  if (!Number.isInteger(total) || total < 1) throw new Error("Documento sem páginas.");
  const text = input.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();
  if (!text) throw new Error("Informe páginas, como 1-3, 7, 10-12.");
  if (["todos", "todas"].includes(text)) return Array.from({ length: total }, (_, i) => i);
  if (["pares", "impares"].includes(text))
    return Array.from({ length: total }, (_, i) => i).filter(
      (i) => (i + 1) % 2 === (text === "pares" ? 0 : 1),
    );
  const selected = new Set<number>();
  for (const token of text.split(",")) {
    const range = /^(\d+|ultima)\s*(?:-\s*(\d+|ultima))?$/.exec(token.trim());
    if (!range) throw new Error(`Intervalo inválido: “${token.trim()}”. Use 1-3, 7, 10-12.`);
    const start = range[1] === "ultima" ? total : Number(range[1]);
    const end = range[2] === undefined ? start : range[2] === "ultima" ? total : Number(range[2]);
    if (start < 1 || end < 1 || start > total || end > total)
      throw new Error(`As páginas devem estar entre 1 e ${total}.`);
    const step = start <= end ? 1 : -1;
    for (let page = start; step > 0 ? page <= end : page >= end; page += step)
      selected.add(page - 1);
  }
  return [...selected];
}
export function parsePageGroups(input: string, total: number): number[][] {
  const parts = input.split(";");
  if (parts.length > 10000) throw new Error("Muitos grupos de páginas.");
  return parts.map((part) => parsePageRange(part, total));
}
