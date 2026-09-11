/** Stable identity for repeated source lines without treating their position as identity. */
export function keyedLines<T>(items: readonly T[], text: (item: T) => string) {
  const occurrences = new Map<string, number>();
  return items.map((item) => {
    const value = text(item);
    const occurrence = (occurrences.get(value) ?? 0) + 1;
    occurrences.set(value, occurrence);
    return { item, key: `${value}:${occurrence}` };
  });
}
