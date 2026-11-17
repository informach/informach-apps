/** Always add from the original anchor: Jan 31 -> Feb 28 -> Mar 31, not Mar 28. */
function monthBoundary(anchor: Date, offset: number) {
  const result = new Date(anchor);
  result.setUTCDate(1);
  result.setUTCMonth(anchor.getUTCMonth() + offset);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(anchor.getUTCDate(), lastDay));
  return result;
}

export function monthlyCreditWindow(start: Date, end: Date, at: Date) {
  if (![start, end, at].every((date) => Number.isFinite(date.getTime())) || end <= start)
    throw new Error("Invalid credit period");
  if (at < start || at >= end) return null;
  let offset =
    (at.getUTCFullYear() - start.getUTCFullYear()) * 12 + at.getUTCMonth() - start.getUTCMonth();
  if (monthBoundary(start, offset) > at) offset--;
  const beginsAt = monthBoundary(start, offset);
  const next = monthBoundary(start, offset + 1);
  const endsAt = next < end ? next : end;
  return { beginsAt, endsAt, nextGrantAt: endsAt < end ? endsAt : null };
}
