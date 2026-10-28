export function numberValue(data: FormData, name: string) {
  const raw = data.get(name);
  if (typeof raw !== "string" || !raw.trim() || !Number.isFinite(Number(raw)))
    throw new Error(`Informe ${name} como número válido.`);
  return Number(raw);
}
export function textValue(data: FormData, name: string) {
  const raw = data.get(name);
  if (typeof raw !== "string") throw new Error(`Campo ${name} ausente.`);
  return raw;
}
/** Inspector fields (artboard and object transform) show and commit at most
 * two decimals. A stored value too small for that shows two significant digits
 * instead of a misleading 0. */
export const roundInput = (value: number) => Math.round(value * 100) / 100 || 0;
export const formatInput = (value: number) => {
  if (!Number.isFinite(value)) return "";
  const rounded = roundInput(value);
  return String(rounded === 0 && value !== 0 ? Number(value.toPrecision(2)) : rounded);
};
/** Rounds a typed value, refusing a non-zero value that would collapse to 0. */
export function roundTypedInput(value: number) {
  const rounded = roundInput(value);
  if (rounded === 0 && value !== 0)
    throw new Error("Use pelo menos 0,01: o inspetor aceita até duas casas decimais.");
  return rounded;
}
