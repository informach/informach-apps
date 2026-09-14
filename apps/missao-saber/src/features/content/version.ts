import "server-only";
import { createHash } from "node:crypto";
import type { Item, Lesson } from "./types";

function canonicalJson(value: unknown): string {
  const normalize = (current: unknown): unknown => {
    if (Array.isArray(current)) return current.map(normalize);
    if (current && typeof current === "object")
      return Object.fromEntries(
        Object.entries(current)
          .filter(([, entry]) => entry !== undefined)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, normalize(entry)]),
      );
    return current;
  };
  return JSON.stringify(normalize(value));
}

export function contentHash(lesson: Lesson) {
  return createHash("sha256").update(canonicalJson(lesson)).digest("hex");
}

export function itemHash(item: Item) {
  const { source: _source, ...authoredItem } = item;
  return createHash("sha256").update(canonicalJson(authoredItem)).digest("hex");
}
