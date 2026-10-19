import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { parseDocument } from "./document.ts";
import { LibraryIndex, summarize } from "./library-index.ts";

const entry = (name: string, values = {}) =>
  summarize(
    parseDocument({
      id: randomUUID(),
      name,
      kind: "image",
      created: "2026-10-18T12:00:00.000Z",
      updated: "2026-10-18T12:00:00.000Z",
      ...values,
    }),
  );
test("indexed search normalizes accents and updates/removes stale grams incrementally", () => {
  const index = new LibraryIndex(),
    a = entry("Reunião escola", { tags: ["Português"], sourceApp: "Navegador" });
  index.upsert(a);
  assert.equal(index.query({ search: "reuniao" }).total, 1);
  assert.equal(index.query({ search: "portugues" }).total, 1);
  index.upsert({ ...a, name: "Almoço", tags: [] });
  assert.equal(index.query({ search: "reuniao" }).total, 0);
  assert.equal(index.query({ search: "almoco" }).total, 1);
  assert.equal(index.query({ search: "na" }).total, 1);
});
test("filter combination, trash and stable pages remain bounded", () => {
  const index = new LibraryIndex();
  for (let i = 0; i < 150; i++)
    index.upsert(
      entry(`Capture ${i}`, {
        favorite: true,
        collection: "Aulas",
        tags: ["escola"],
        sourceApp: "Office",
      }),
    );
  const q = {
    favorite: true,
    tag: "escola",
    collection: "Aulas",
    sourceApp: "Office",
    kind: "image" as const,
    from: "2026-10-18",
    to: "2026-10-18",
  };
  const first = index.query(q),
    second = index.query({ ...q, offset: 60 });
  assert.equal(first.total, 150);
  assert.equal(first.items.length, 60);
  assert.equal(new Set([...first.items, ...second.items].map((item) => item.id)).size, 120);
  const trashed = first.items[0];
  assert.ok(trashed);
  index.upsert({ ...trashed, deletedAt: "2026-10-18T13:00:00.000Z" });
  assert.equal(index.query(q).total, 149);
  assert.equal(index.query({ trash: true }).total, 1);
  assert.equal(index.query({ kind: "video" }).total, 0);
  assert.throws(() => index.query({ limit: 61 }));
  assert.throws(() => index.query({ offset: -1 }));
  assert.throws(() => index.query({ from: "2026-99-99" }));
});
test("returned index summaries cannot mutate the source index", () => {
  const index = new LibraryIndex();
  index.upsert(entry("A", { tags: ["original"] }));
  const item = index.query().items[0];
  assert.ok(item);
  item.tags.push("mutated");
  assert.equal(index.query({ tag: "mutated" }).total, 0);
});
