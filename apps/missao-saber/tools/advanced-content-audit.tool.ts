import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { skillPacks } from "../src/features/content/skills";

const skip = new Set(
  "contagem-inicial padroes-iniciais orientacao-espacial composicao-de-figuras tempo-e-medidas balancas caminhos tabelas contar-e-comparar formas-e-posicoes sequencias-iniciais medir-e-comparar problemas-com-desenho".split(
    " ",
  ),
);
it("exports advanced content for an independent mathematical audit", () => {
  const packs = skillPacks.filter((pack) => !skip.has(pack.id));
  const output = mkdtempSync(join(tmpdir(), "missao-saber-advanced-audit-"));
  for (const pack of packs) {
    const lines: string[] = [`PACK ${pack.id} ${pack.name}`];
    for (const [m, mission] of pack.missions.entries()) {
      lines.push(
        `MISSION ${m + 1} ${mission.title} | ${mission.objective} | ${mission.introduction}`,
      );
      for (const [q, item] of mission.specs.entries()) {
        lines.push(
          `${pack.id}-${m + 1}-${q + 1} | ${item.prompt} | A: ${item.kind === "choice" ? item.answer : item.value} | ${item.explanation}`,
        );
        if (item.kind === "choice")
          lines.push(
            `  WRONG: ${item.wrong.join(" || ")} | FEEDBACK: ${(item.feedback ?? []).join(" || ")}`,
          );
        else if (item.misreads) lines.push(`  MISREADS: ${JSON.stringify(item.misreads)}`);
        if (item.hints) lines.push(`  HINTS: ${JSON.stringify(item.hints)}`);
      }
    }
    lines.push(`ORDER ${JSON.stringify(pack.ordering)}`);
    lines.push(`JUSTIFICATION ${JSON.stringify(pack.justification)}`);
    lines.push(`DEEP ${JSON.stringify(pack.deepChallenge)}`);
    lines.push(`HOME ${JSON.stringify(pack.homeSupport)}`);
    writeFileSync(join(output, `${pack.id}.txt`), lines.join("\n"));
  }
  console.log(
    `EXPORTED ${packs.length} packs, ${packs.reduce((sum, p) => sum + p.missions.reduce((total, m) => total + m.specs.length, 0), 0)} objective questions`,
  );
  const duplicates: unknown[] = [];
  for (const pack of packs)
    for (let seed = 0; seed < 1000; seed++)
      for (const variant of [0, 1, 2] as const) {
        const item = pack.reserved(seed, variant);
        if (new Set([item.answer, ...item.wrong]).size !== 3)
          duplicates.push({ pack: pack.id, seed, variant, item });
      }
  writeFileSync(join(output, "reserved-duplicates.json"), JSON.stringify(duplicates, null, 2));
  console.log(`RESERVED_DUPLICATES ${duplicates.length}`);
  console.log(`AUDIT_OUTPUT ${output}`);
  expect(packs).toHaveLength(33);
  expect(duplicates).toEqual([]);
});
