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
  /**
   * Uma lista vazia de leituras equivocadas não é conteúdo autoral e não pode
   * mudar a identidade do item — pela mesma razão que `source` fica de fora.
   *
   * Isto não é cosmético. O hash de invalidação é calculado sobre a versão
   * CONGELADA na sessão, e reparsear um snapshot antigo com o schema atual
   * injeta `misreads: []` onde antes não havia chave nenhuma. Sem esta
   * exclusão, toda atividade numérica retirada por um mantenedor voltaria a
   * contar como evidência no primeiro deploy depois do campo novo.
   */
  if ("misreads" in authoredItem && authoredItem.misreads.length === 0) {
    const { misreads: _misreads, ...semLeituras } = authoredItem;
    return createHash("sha256").update(canonicalJson(semLeituras)).digest("hex");
  }
  return createHash("sha256").update(canonicalJson(authoredItem)).digest("hex");
}
