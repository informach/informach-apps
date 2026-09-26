import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { catalogReviewAudit } from "@/features/content/authoring-review";
import { contentUnits } from "@/features/content/catalog";

/**
 * Imprime os itens ainda sem hash de revisão e, com MISSAO_WRITE_DIGESTS=1,
 * grava-os em tmp/review-digests.json para serem colados em
 * reviewed-catalog.ts DEPOIS da conferência item a item de um lote. Não
 * escreve no ledger sozinha: o hash registra uma revisão feita, não a
 * substitui.
 */
it("lista os itens sem revisão", () => {
  const audit = catalogReviewAudit(contentUnits);
  const pending = new Set([...audit.missing, ...audit.changed]);
  const digests = Object.fromEntries(
    contentUnits
      .flatMap((unit) => unit.items)
      .filter((item) => pending.has(item.id))
      .map((item) => [item.id, createHash("sha256").update(JSON.stringify(item)).digest("hex")]),
  );
  console.log(
    `PENDENTES=${pending.size} REVISADOS=${audit.reviewed} ORFAOS=${audit.orphaned.length}`,
  );
  if (process.env.MISSAO_WRITE_DIGESTS === "1") {
    const target = path.resolve(process.cwd(), "tmp/review-digests.json");
    writeFileSync(target, `${JSON.stringify(digests, null, 2)}\n`);
    console.log(`GRAVADO=${target}`);
  }
});
