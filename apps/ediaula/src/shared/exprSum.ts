/**
 * Terms of an FFmpeg expression summed as a balanced tree. FFmpeg 9 refuses an expression nested
 * about 100 levels deep, and its parser nests a flat `a+b+c+…` one level per term, so a long sum
 * (a volume envelope, a zoom's focus points) is split in halves inside parentheses: the depth
 * grows with the logarithm of the terms. A term may start with a minus sign.
 */
export function sumExpr(terms: readonly string[]): string {
  if (!terms.length) return "0";
  const tree = (from: number, to: number): string => {
    if (to - from === 1) return terms[from];
    const mid = (from + to) >> 1;
    return `(${tree(from, mid)}+${tree(mid, to)})`;
  };
  return tree(0, terms.length).replaceAll("+-", "-");
}
