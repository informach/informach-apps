import type { PublicItem } from "../content/types";

/** Mostra a resposta registrada com os mesmos textos que o estudante organizou. */
export function responseLabel(item: PublicItem | undefined, answer: string): string {
  if (answer === "__skip__") return "Ainda não sei";
  if (item?.type !== "ordering") return answer;
  let order: unknown;
  try {
    order = JSON.parse(answer);
  } catch {
    return "Não foi possível ler a ordem registrada.";
  }
  if (
    !Array.isArray(order) ||
    order.length !== item.steps.length ||
    new Set(order).size !== order.length ||
    !order.every((id) => typeof id === "string" && item.steps.some((step) => step.id === id))
  )
    return "Não foi possível ler a ordem registrada.";
  return order.map((id) => item.steps.find((step) => step.id === id)?.label).join(" → ");
}
