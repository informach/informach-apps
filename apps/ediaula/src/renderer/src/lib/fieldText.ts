/**
 * What leaving a typed number field does. The field shows `shown` (the current value, as it is
 * displayed) and the person typed `text`: Esc (`cancelled`) and a text equal to what was shown
 * change nothing, so focusing a rounded value and leaving it does not round the value; text that
 * does not read as a value is `wrong` and changes nothing either.
 */
export type FieldResult = { kind: "none" } | { kind: "wrong" } | { kind: "commit"; value: number };

export function leaveField(
  text: string | null,
  shown: string,
  cancelled: boolean,
  parse: (text: string) => number | null,
): FieldResult {
  if (cancelled || text === null || text.trim() === shown.trim()) return { kind: "none" };
  const value = parse(text);
  return value === null ? { kind: "wrong" } : { kind: "commit", value };
}

/** A number typed with a comma or a dot. */
export function typedNumber(text: string): number | null {
  const v = Number(text.trim().replace(",", "."));
  return text.trim() && Number.isFinite(v) ? v : null;
}
