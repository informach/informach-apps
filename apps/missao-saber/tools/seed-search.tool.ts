import { it } from "vitest";
import { courses } from "@/features/content/catalog";
import { legacyReservedSpec, makeAssessmentBank } from "@/features/content/commercial-curriculum";
import { skillPacks } from "@/features/content/skills";

const packById = new Map(skillPacks.map((pack) => [pack.id, pack]));
const resolve = (skillId: string, seed: number, variant: 0 | 1 | 2) =>
  packById.get(skillId)?.reserved(seed, variant) ?? legacyReservedSpec(skillId, seed, variant);
const signature = (item: { prompt: string; type: string; answer?: string; options?: string[] }) =>
  JSON.stringify({
    prompt: item.prompt.replace(/^Questão \d+\.\s*/, ""),
    answer: item.type === "choice" ? item.answer : null,
    options: item.type === "choice" ? [...(item.options ?? [])].sort() : null,
  });

/* Procura um bankSeed livre para uma trilha: intervalos de diagnóstico e de
   simulado sem sobreposição e nenhuma questão reservada repetida em relação a
   todos os outros bancos. Rodar com
   MISSAO_SEED_TRACK=<id> pnpm exec vitest run --config vitest.tools.config.ts tools/seed-search.tool.ts */
const trackId = process.env.MISSAO_SEED_TRACK ?? "canguru-j";

it(`procura seed livre para ${trackId}`, () => {
  const others = courses.filter((course) => course.id !== trackId);
  const target = courses.find((course) => course.id === trackId);
  if (!target) throw new Error(`sem ${trackId}`);
  const ranges: [number, number][] = others.flatMap((course): [number, number][] => [
    [course.bankSeed, course.bankSeed + 11],
    [course.bankSeed + 101, course.bankSeed + 112],
  ]);
  const base = new Set<string>();
  for (const course of others)
    for (const mode of ["diagnostic", "exam"] as const)
      for (const item of makeAssessmentBank(course, mode, resolve).items)
        base.add(signature(item as never));
  const found: number[] = [];
  for (let seed = 440; seed <= 800 && found.length < 8; seed++) {
    const mine: [number, number][] = [
      [seed, seed + 11],
      [seed + 101, seed + 112],
    ];
    if (mine.some(([a, b]) => ranges.some(([c, d]) => !(b < c || d < a)))) continue;
    const candidate = { ...target, bankSeed: seed };
    const sigs = (["diagnostic", "exam"] as const).flatMap((mode) =>
      makeAssessmentBank(candidate, mode, resolve).items.map((item) => signature(item as never)),
    );
    if (new Set(sigs).size !== sigs.length) continue;
    if (sigs.some((sig) => base.has(sig))) continue;
    found.push(seed);
  }
  console.log("SEEDS", found.join(", "));
});
