const { performance } = require("node:perf_hooks");
const { LibraryIndex, summarize } = require("../src/domain/library-index.ts");
const { parseDocument } = require("../src/domain/document.ts");
const { randomUUID } = require("node:crypto");
for (const count of [1000, 10000]) {
  const index = new LibraryIndex(),
    start = performance.now();
  for (let i = 0; i < count; i++)
    index.upsert(
      summarize(
        parseDocument({
          id: randomUUID(),
          name: `Aula de matemática ${i}`,
          kind: i % 3 ? "image" : "video",
          created: "2026-10-18T12:00:00.000Z",
          updated: "2026-10-18T12:00:00.000Z",
          tags: [i % 7 ? "escola" : "ciências"],
          collection: `Turma ${i % 10}`,
          sourceApp: "Navegador",
        }),
      ),
    );
  const built = performance.now() - start;
  const measure = (query) => {
    const begin = performance.now();
    let result;
    for (let n = 0; n < 30; n++) result = index.query(query);
    return {
      meanMs: Number(((performance.now() - begin) / 30).toFixed(3)),
      total: result.total,
      rendered: result.items.length,
    };
  };
  console.log(
    JSON.stringify({
      items: count,
      buildMs: Number(built.toFixed(1)),
      list: measure({}),
      search: measure({ search: "matematica 999" }),
      filter: measure({ tag: "ciências", kind: "video" }),
    }),
  );
}
