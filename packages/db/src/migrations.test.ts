import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import journal from "./migrations/meta/_journal.json" with { type: "json" };

// O migrator do Drizzle só aplica a migração cujo `when` é maior que o
// `created_at` da última registrada no banco. Uma migração com `when` menor
// que o de outra já aplicada é pulada sem erro, e `/api/ready` não acusa,
// porque só pergunta se o banco está atrás. Isso acontece quando duas
// branches geram migrações em paralelo e uma entra na `main` antes: ao
// integrar, as migrações da outra precisam ir para depois no journal.
const folder = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");
const entries = journal.entries;

describe("journal de migrations", () => {
  it("tem idx em sequência a partir de zero", () => {
    expect(entries.map((entry) => entry.idx)).toEqual(entries.map((_, index) => index));
  });

  it("tem `when` estritamente crescente, para o migrator não pular nenhuma", () => {
    const outOfOrder = entries.filter(
      (entry, index) => index > 0 && entry.when <= (entries[index - 1]?.when ?? 0),
    );
    expect(outOfOrder.map((entry) => entry.tag)).toEqual([]);
  });

  it("tem tags únicas, cada uma com o seu SQL", () => {
    expect(new Set(entries.map((entry) => entry.tag)).size).toBe(entries.length);
    const missing = entries.filter((entry) => !existsSync(path.join(folder, `${entry.tag}.sql`)));
    expect(missing.map((entry) => entry.tag)).toEqual([]);
  });

  it("não tem SQL fora do journal", () => {
    const tags = new Set(entries.map((entry) => entry.tag));
    const orphans = readdirSync(folder)
      .filter((name) => name.endsWith(".sql"))
      .map((name) => name.slice(0, -4))
      .filter((tag) => !tags.has(tag));
    expect(orphans).toEqual([]);
  });

  it("tem um snapshot por entrada, encadeado na ordem do journal", () => {
    // A 0030 é uma migração escrita à mão, de antes desta regra, sem snapshot.
    const historicalGaps = new Set(["0030_agenda_search_trgm"]);
    type Snapshot = { tag: string; id?: string; prevId?: string };
    const snapshots = entries.flatMap((entry): Snapshot[] => {
      const file = path.join(folder, "meta", `${String(entry.idx).padStart(4, "0")}_snapshot.json`);
      if (!existsSync(file)) return historicalGaps.has(entry.tag) ? [] : [{ tag: entry.tag }];
      const { id, prevId } = JSON.parse(readFileSync(file, "utf8")) as Required<Snapshot>;
      return [{ tag: entry.tag, id, prevId }];
    });
    const missing = snapshots.filter((snapshot) => !snapshot.id);
    expect(missing.map((snapshot) => snapshot.tag)).toEqual([]);
    const broken = snapshots.filter(
      (snapshot, index) => index > 0 && snapshot.prevId !== snapshots[index - 1]?.id,
    );
    expect(broken.map((snapshot) => snapshot.tag)).toEqual([]);
  });
});
