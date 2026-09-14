import { createHash } from "node:crypto";
import { reviewedCatalogDigests } from "./reviewed-catalog";
import type { Lesson } from "./types";

export const authoringReviewCriteria = {
  all: ["enunciado suficiente", "solução coerente", "pistas graduais", "sem dependência oficial"],
  choice: ["alternativas únicas", "distratores plausíveis", "uma resposta defensável"],
  numeric: ["cálculo conferido", "tolerância e unidade coerentes"],
  ordering: ["passos completos", "ordem justificável", "uso por teclado"],
  justification: ["rubrica específica", "exemplo completo", "conclusão explícita"],
} as const;

function reviewDigest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/**
 * The ledger is deliberately independent from the generated answer checks.
 * Any new or changed item must be reviewed against the criteria and receive a
 * new literal digest before it can enter a checked authoring lot.
 */
export function catalogReviewAudit(units: Lesson[]) {
  const items = units.flatMap((unit) => unit.items);
  const actualIds = new Set(items.map((item) => item.id));
  return {
    reviewed: Object.keys(reviewedCatalogDigests).length,
    missing: items.filter((item) => !reviewedCatalogDigests[item.id]).map((item) => item.id),
    changed: items
      .filter(
        (item) =>
          reviewedCatalogDigests[item.id] && reviewedCatalogDigests[item.id] !== reviewDigest(item),
      )
      .map((item) => item.id),
    orphaned: Object.keys(reviewedCatalogDigests).filter((id) => !actualIds.has(id)),
  };
}
