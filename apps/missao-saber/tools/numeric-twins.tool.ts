import { it } from "vitest";
import { assessmentBanks, lessons } from "@/features/content/catalog";

/* Questões reservadas cujos números no enunciado e cuja resposta são os de
   uma atividade de ensino da mesma habilidade: mesma conta, outra redação. */
const numbers = (text: string) =>
  (text.replace(/^Questão \d+\.\s*/, "").match(/[−-]?\d+(?:[.,]\d+)?/g) ?? [])
    .map((value) => value.replace("−", "-").replace(",", "."))
    .sort()
    .join("|");

type Answerable = { type: string; answer?: string; grading?: { value?: number } };
const answerOf = (item: Answerable) =>
  item.type === "numeric" ? String(item.grading?.value) : numbers(item.answer ?? "");

it("lista gêmeos numéricos entre reservadas e ensino", () => {
  const teaching = new Map<string, string[]>();
  for (const lesson of lessons)
    for (const item of lesson.items) {
      const key = `${item.skillId}#${numbers(item.prompt)}#${answerOf(item as Answerable)}`;
      teaching.set(key, [...(teaching.get(key) ?? []), item.id]);
    }
  const seen = new Set<string>();
  for (const bank of assessmentBanks)
    for (const item of bank.items) {
      const key = `${item.skillId}#${numbers(item.prompt)}#${answerOf(item as Answerable)}`;
      const twins = teaching.get(key);
      if (!twins || numbers(item.prompt).split("|").length < 2 || seen.has(key)) continue;
      seen.add(key);
      console.log("TWIN", item.id, "~", twins.join(","), "\n   ", item.prompt.slice(0, 140));
    }
});
