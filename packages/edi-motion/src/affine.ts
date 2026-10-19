/** SVG affine matrices, column vectors, applied right to left. DOM-free so
 * authoring and native/web renderers share the same coordinate contract. */
export type Affine = [number, number, number, number, number, number];
export const identityMatrix = (): Affine => [1, 0, 0, 1, 0, 0];
export function multiply(a: Affine, b: Affine): Affine {
  const result: Affine = [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
  if (result.some((value) => !Number.isFinite(value)))
    throw new Error("Matriz fora do limite numérico.");
  return result;
}
export function isInvertible(a: Affine): boolean {
  const determinant = a[0] * a[3] - a[1] * a[2];
  const scale = Math.max(Math.abs(a[0]), Math.abs(a[1]), Math.abs(a[2]), Math.abs(a[3]));
  return (
    Number.isFinite(determinant) &&
    scale !== 0 &&
    Math.abs(determinant) > Number.EPSILON * scale * scale * 8
  );
}
export function inverse(a: Affine): Affine {
  const determinant = a[0] * a[3] - a[1] * a[2];
  if (!isInvertible(a))
    throw new Error("Não é possível editar um espaço singular ou numericamente instável.");
  return [
    a[3] / determinant,
    -a[1] / determinant,
    -a[2] / determinant,
    a[0] / determinant,
    (a[2] * a[5] - a[3] * a[4]) / determinant,
    (a[1] * a[4] - a[0] * a[5]) / determinant,
  ];
}
export function transformPoint(matrix: Affine, x: number, y: number) {
  return {
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  };
}
export function transformMatrix(transform: {
  x: number;
  y: number;
  rotation: number;
  sx: number;
  sy: number;
  px?: number;
  py?: number;
  skewX?: number;
}): Affine {
  const angle = (transform.rotation * Math.PI) / 180,
    cosine = Math.cos(angle),
    sine = Math.sin(angle);
  const px = transform.px ?? 0,
    py = transform.py ?? 0,
    tangent = Math.tan(((transform.skewX ?? 0) * Math.PI) / 180);
  const a = cosine * transform.sx,
    b = sine * transform.sx,
    c = (cosine * tangent - sine) * transform.sy,
    d = (sine * tangent + cosine) * transform.sy;
  return [a, b, c, d, transform.x + px - a * px - c * py, transform.y + py - b * px - d * py];
}
export function transformAttribute(t: {
  x: number;
  y: number;
  rotation: number;
  sx: number;
  sy: number;
  px?: number;
  py?: number;
  skewX?: number;
}) {
  if (!(t.px || t.py || t.skewX))
    return `translate(${t.x} ${t.y}) rotate(${t.rotation}) scale(${t.sx} ${t.sy})`;
  return `translate(${t.x + (t.px ?? 0)} ${t.y + (t.py ?? 0)}) rotate(${t.rotation}) skewX(${t.skewX ?? 0}) scale(${t.sx} ${t.sy}) translate(${-(t.px ?? 0)} ${-(t.py ?? 0)})`;
}
/** SVG transform-list grammar. Rejects garbage and non-finite coefficients;
 * unlike extracting just numeric tokens, verifies every character and arity. */
export function parseTransformList(source: string): Affine {
  if (source.length > 10000) throw new Error("Lista de transformações excessiva.");
  let result = identityMatrix(),
    end = 0;
  const number = "[-+]?(?:\\d*\\.\\d+|\\d+\\.?\\d*)(?:[eE][-+]?\\d+)?";
  const list = new RegExp(`^\\s*${number}(?:(?:\\s+,?\\s*|,\\s*)${number})*\\s*$`);
  for (const match of source.matchAll(/([A-Za-z]+)\(([^)]*)\)\s*/g)) {
    if (match.index !== end || !match[2] || !list.test(match[2]))
      throw new Error("Transformação SVG inválida.");
    const values = match[2]
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (values.some((value) => !Number.isFinite(value) || Math.abs(value) > 1e7))
      throw new Error("Número SVG fora do limite permitido.");
    const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = values;
    let operation: Affine;
    switch (match[1]) {
      case "matrix":
        if (values.length !== 6) throw new Error("Matriz SVG exige seis valores.");
        operation = [a, b, c, d, e, f];
        break;
      case "translate":
        if (values.length < 1 || values.length > 2) throw new Error("Translação SVG inválida.");
        operation = [1, 0, 0, 1, a, b];
        break;
      case "scale":
        if (values.length < 1 || values.length > 2) throw new Error("Escala SVG inválida.");
        operation = [a, 0, 0, values.length === 1 ? a : b, 0, 0];
        break;
      case "rotate": {
        if (values.length !== 1 && values.length !== 3) throw new Error("Rotação SVG inválida.");
        const rotation = transformMatrix({ x: 0, y: 0, rotation: a, sx: 1, sy: 1 });
        operation =
          values.length === 1
            ? rotation
            : multiply(multiply([1, 0, 0, 1, b, c], rotation), [1, 0, 0, 1, -b, -c]);
        break;
      }
      case "skewX":
      case "skewY": {
        if (values.length !== 1) throw new Error("Inclinação SVG inválida.");
        const tangent = Math.tan((a * Math.PI) / 180);
        if (!Number.isFinite(tangent) || Math.abs(tangent) > 1e7)
          throw new Error("Inclinação SVG singular.");
        operation = match[1] === "skewX" ? [1, 0, tangent, 1, 0, 0] : [1, tangent, 0, 1, 0, 0];
        break;
      }
      default:
        throw new Error("Transformação SVG não suportada.");
    }
    result = multiply(result, operation);
    end += match[0].length;
  }
  if (end !== source.length) throw new Error("Transformação SVG inválida.");
  return result;
}
