import { it } from "vitest";
import { legacyLessonIds, lessons } from "@/features/content/catalog";

/* Mede quantas questões de múltipla escolha denunciam a resposta pelo
   tamanho: a certa é a mais longa e passa de 1,6 vez a maior das erradas. */
it("mede a pista de tamanho nas alternativas", () => {
  const bySkill = new Map<string, { total: number; cue: number }>();
  for (const lesson of lessons)
    for (const item of lesson.items) {
      if (item.type !== "choice") continue;
      const legacy = legacyLessonIds.has(lesson.id);
      const key = legacy ? "(legado)" : item.skillId;
      const wrong = item.options.filter((option) => option !== item.answer);
      const longest = Math.max(...wrong.map((option) => option.length));
      const cue = item.answer.length > 1.6 * longest && item.answer.length > longest + 15;
      const entry = bySkill.get(key) ?? { total: 0, cue: 0 };
      entry.total += 1;
      if (cue) entry.cue += 1;
      bySkill.set(key, entry);
    }
  let total = 0;
  let cues = 0;
  for (const [skill, { total: t, cue }] of [...bySkill.entries()].sort(
    (a, b) => b[1].cue - a[1].cue,
  )) {
    total += t;
    cues += cue;
    if (cue > 0) console.log("CUE", skill, `${cue}/${t}`);
  }
  console.log("TOTAL", `${cues}/${total}`);
});
