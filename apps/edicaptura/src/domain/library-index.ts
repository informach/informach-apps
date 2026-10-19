import { z } from "zod";
import type { CaptureDocument } from "./document.ts";

export type LibraryEntry = Pick<
  CaptureDocument,
  | "id"
  | "name"
  | "created"
  | "updated"
  | "preview"
  | "tags"
  | "favorite"
  | "collection"
  | "sourceApp"
  | "deletedAt"
  | "media"
> & {
  kind: "image" | "video" | "damaged";
  problem?: string;
};
export const querySchema = z.strictObject({
  search: z.string().max(200).default(""),
  kind: z.enum(["", "image", "video", "damaged"]).default(""),
  favorite: z.boolean().default(false),
  trash: z.boolean().default(false),
  tag: z.string().max(60).default(""),
  collection: z.string().max(80).default(""),
  sourceApp: z.string().max(120).default(""),
  from: z.union([z.literal(""), z.iso.date()]).default(""),
  to: z.union([z.literal(""), z.iso.date()]).default(""),
  /** Also look in the text recognized in the images (opt-in; loaded on first use). */
  content: z.boolean().default(false),
  offset: z.number().int().min(0).max(10_000_000).default(0),
  limit: z.number().int().min(1).max(60).default(60),
});
export type LibraryQuery = z.input<typeof querySchema>;
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
const grams = (text: string) =>
  new Set(Array.from({ length: Math.max(0, text.length - 2) }, (_, i) => text.slice(i, i + 3)));
export class LibraryIndex {
  private entries = new Map<string, LibraryEntry>();
  private texts = new Map<string, string>();
  private inverted = new Map<string, Set<string>>();
  /** Normalized recognized text by capture; searched linearly, never truncated. */
  private content = new Map<string, string>();
  setContent(id: string, text: string | null) {
    if (text?.trim()) this.content.set(id, normalize(text.replace(/\s+/g, " ")));
    else this.content.delete(id);
  }
  upsert(value: LibraryEntry) {
    const previous = this.texts.get(value.id);
    if (previous)
      for (const gram of grams(previous)) {
        const ids = this.inverted.get(gram);
        ids?.delete(value.id);
        if (!ids?.size) this.inverted.delete(gram);
      }
    const text = normalize(
      [value.name, ...value.tags, value.collection, value.sourceApp].join(" "),
    );
    this.entries.set(value.id, structuredClone(value));
    this.texts.set(value.id, text);
    for (const gram of grams(text)) {
      let ids = this.inverted.get(gram);
      if (!ids) {
        ids = new Set();
        this.inverted.set(gram, ids);
      }
      ids.add(value.id);
    }
  }
  all() {
    return [...this.entries.values()].map((entry) => structuredClone(entry));
  }
  query(input: LibraryQuery = {}) {
    const q = querySchema.parse(input),
      search = normalize(q.search.trim());
    const buckets = [...grams(search)]
      .map((gram) => this.inverted.get(gram) || new Set<string>())
      .sort((a, b) => a.size - b.size);
    // Content search scans every entry: recognized text is not in the trigram index.
    const candidateIds =
      q.content && search ? this.entries.keys() : buckets[0] || this.entries.keys();
    const found: LibraryEntry[] = [];
    for (const id of candidateIds) {
      const entry = this.entries.get(id);
      if (!entry) continue;
      const named = !buckets.some((ids) => !ids.has(id)) && !!this.texts.get(id)?.includes(search);
      if (!named && !(q.content && search && this.content.get(id)?.includes(search))) continue;
      if (
        Boolean(entry.deletedAt) !== q.trash ||
        (q.kind && entry.kind !== q.kind) ||
        (q.favorite && !entry.favorite) ||
        (q.tag && !entry.tags.includes(q.tag)) ||
        (q.collection && entry.collection !== q.collection) ||
        (q.sourceApp && entry.sourceApp !== q.sourceApp) ||
        (q.from && entry.created.slice(0, 10) < q.from) ||
        (q.to && entry.created.slice(0, 10) > q.to)
      )
        continue;
      found.push(entry);
    }
    found.sort((a, b) => b.updated.localeCompare(a.updated) || a.id.localeCompare(b.id));
    return {
      items: found.slice(q.offset, q.offset + q.limit).map((entry) => structuredClone(entry)),
      total: found.length,
      offset: q.offset,
      limit: q.limit,
    };
  }
}
export function summarize(doc: CaptureDocument): LibraryEntry {
  const {
    id,
    name,
    kind,
    created,
    updated,
    preview,
    tags,
    favorite,
    collection,
    sourceApp,
    deletedAt,
    media,
  } = doc;
  return {
    id,
    name,
    kind,
    created,
    updated,
    preview,
    tags,
    favorite,
    collection,
    sourceApp,
    deletedAt,
    media,
  };
}
