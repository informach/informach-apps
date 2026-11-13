/** Checks the complete known prefix, allowing a newer database for older builds.
 * A timestamp greater than the build's last migration cannot hide a hole in it.
 * This reads Drizzle's receipts; it does not certify arbitrary schema changes.
 */
export function assessMigrationHistory(
  expected: readonly number[],
  applied: readonly number[],
): "ready" | "behind" | "inconsistent" {
  const ordered = (values: readonly number[]) =>
    values.every(
      (value, index) =>
        Number.isSafeInteger(value) &&
        value > 0 &&
        (index === 0 || value > (values[index - 1] ?? 0)),
    );
  if (!ordered(expected) || !ordered(applied)) return "inconsistent";
  const last = expected.at(-1);
  if (last === undefined) return "ready";
  const known = applied.filter((value) => value <= last);
  if (known.some((value, index) => value !== expected[index])) return "inconsistent";
  if (known.length === expected.length) return "ready";
  // Drizzle only applies timestamps after the latest receipt. A missing suffix
  // is recoverable only while no later migration has already been recorded.
  return applied.some((value) => value > last) ? "inconsistent" : "behind";
}
