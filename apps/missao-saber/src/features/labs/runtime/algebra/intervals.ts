import { fractionNumber, readFraction } from "./math";
import { normalized } from "./shared";
export function intervalAnswer(answer: string, expected: string) {
  const normalize = (value: string) => normalized(value).replace(/−/g, "-").replace(/\s/g, "");
  const boundary = (token: string) => {
    if (["-∞", "-infinito"].includes(token)) return Number.NEGATIVE_INFINITY;
    if (["+∞", "∞", "+infinito", "infinito"].includes(token)) return Number.POSITIVE_INFINITY;
    const value = readFraction(token);
    return value ? fractionNumber(value) : Number.NaN;
  };
  type Interval = { left: number; right: number; openLeft: boolean; openRight: boolean };
  const intervals = (raw: string): Interval[] | null => {
    const value = normalize(raw);
    if (["vazio", "∅", "{}"].includes(value)) return [];
    if (["reais", "todos", "r", "ℝ"].includes(value))
      return [{ left: -Infinity, right: Infinity, openLeft: true, openRight: true }];
    const parsed: Interval[] = [];
    for (const piece of value.split(/∪|u/)) {
      const match = /^([[\](])(.+);(.+)([[\])])$/.exec(piece);
      if (!match?.[1] || !match[2] || !match[3] || !match[4]) return null;
      const interval = {
        left: boundary(match[2]),
        right: boundary(match[3]),
        openLeft: match[1] !== "[",
        openRight: match[4] !== "]",
      };
      if (
        Number.isNaN(interval.left) ||
        Number.isNaN(interval.right) ||
        interval.left > interval.right ||
        interval.left === Infinity ||
        interval.right === -Infinity ||
        (!Number.isFinite(interval.left) && !interval.openLeft) ||
        (!Number.isFinite(interval.right) && !interval.openRight)
      )
        return null;
      if (interval.left !== interval.right || (!interval.openLeft && !interval.openRight))
        parsed.push(interval);
    }
    parsed.sort((a, b) => a.left - b.left || Number(a.openLeft) - Number(b.openLeft));
    const union: Interval[] = [];
    for (const interval of parsed) {
      const previous = union.at(-1);
      if (
        previous &&
        (interval.left < previous.right ||
          (interval.left === previous.right && (!interval.openLeft || !previous.openRight)))
      ) {
        if (interval.right > previous.right) {
          previous.right = interval.right;
          previous.openRight = interval.openRight;
        } else if (interval.right === previous.right) previous.openRight &&= interval.openRight;
      } else union.push({ ...interval });
    }
    return union;
  };
  const actual = intervals(answer),
    target = intervals(expected);
  if (!actual || !target || actual.length !== target.length) return false;
  const same = (left: number, right: number) => left === right || Math.abs(left - right) <= 0.001;
  const unused = [...target];
  for (const interval of actual) {
    if (!interval) return false;
    const index = unused.findIndex(
      (candidate) =>
        candidate !== null &&
        same(candidate.left, interval.left) &&
        same(candidate.right, interval.right) &&
        candidate.openLeft === interval.openLeft &&
        candidate.openRight === interval.openRight,
    );
    if (index < 0) return false;
    unused.splice(index, 1);
  }
  return unused.length === 0;
}
