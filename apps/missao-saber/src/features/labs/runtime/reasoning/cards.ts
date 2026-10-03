import { z } from "zod";
import type { ToolLaunch, ToolModule } from "../types";
import { activity, ensureMode, fraction, numberAssessment } from "./common";

export const cardSchema = z
  .object({
    ranks: z.number().int().min(2).max(6),
    event: z.enum(["red", "even", "both", "either"]),
    given: z.enum(["all", "red", "even"]),
    selected: z.array(z.string().max(12)).max(24),
  })
  .strict();
export type CardState = z.infer<typeof cardSchema>;
export const cardEvents: { id: CardState["event"]; label: string }[] = [
  { id: "red", label: "Ser vermelha" },
  { id: "even", label: "Ter número par" },
  { id: "both", label: "Ser vermelha E ter número par" },
  { id: "either", label: "Ser vermelha OU ter número par (ou inclusivo)" },
];
export const cardConditions: { id: CardState["given"]; label: string }[] = [
  { id: "all", label: "Nenhuma informação adicional" },
  { id: "red", label: "Sabemos que a carta é vermelha" },
  { id: "even", label: "Sabemos que o número é par" },
];
export function cardOutcomes(state: CardState) {
  const suits = [
    { id: "copas", name: "Copas", symbol: "♥", red: true },
    { id: "ouros", name: "Ouros", symbol: "♦", red: true },
    { id: "paus", name: "Paus", symbol: "♣", red: false },
    { id: "espadas", name: "Espadas", symbol: "♠", red: false },
  ];
  return suits.flatMap((suit) =>
    Array.from({ length: state.ranks }, (_, index) => {
      const rank = index + 1;
      const even = rank % 2 === 0;
      return {
        id: `${suit.id}-${rank}`,
        rank,
        symbol: suit.symbol,
        red: suit.red,
        label: `${rank} de ${suit.name}, ${suit.red ? "vermelha" : "preta"}`,
        eligible: state.given === "all" || (state.given === "red" ? suit.red : even),
        favorable:
          state.event === "red"
            ? suit.red
            : state.event === "even"
              ? even
              : state.event === "both"
                ? suit.red && even
                : suit.red || even,
      };
    }),
  );
}
export function cardModel(state: CardState) {
  const eligible = cardOutcomes(state).filter((card) => card.eligible);
  const favorable = eligible.filter((card) => card.favorable);
  return { eligible, favorable, probability: favorable.length / eligible.length };
}
export function parseCards(launch: ToolLaunch, raw: unknown) {
  ensureMode(launch, "L13", ["cartas-eventos-condicionais"]);
  const state = cardSchema.parse(raw);
  const ids = new Set(cardOutcomes(state).map((card) => card.id));
  if (
    new Set(state.selected).size !== state.selected.length ||
    state.selected.some((id) => !ids.has(id))
  )
    throw new Error("Carta inexistente ou repetida na seleção.");
  return state;
}
export function cardSummary(state: CardState) {
  const event = cardEvents.find((event) => event.id === state.event);
  const condition = cardConditions.find((condition) => condition.id === state.given);
  if (!event || !condition) throw new Error("Evento ou condição de cartas não publicado.");
  return `Baralho didático: quatro naipes, números de 1 a ${state.ranks}, uma carta de cada combinação, todas equiprováveis. Evento: ${event.label}. Condição: ${condition.label}. Cartas marcadas: ${state.selected.join(", ") || "nenhuma"}.`;
}
export const cardsTool: ToolModule = {
  family: "L13",
  modes: ["cartas-eventos-condicionais"],
  parse: parseCards,
  activity: (launch) => {
    ensureMode(launch, "L13", ["cartas-eventos-condicionais"]);
    return activity({
      title: "Cartas: atributos, eventos e informação",
      prompt:
        "Retire uma carta ao acaso deste baralho didático. Cada carta física tem a mesma chance. Marque todas as cartas que atendem ao evento e à informação conhecida. Qual é a probabilidade do evento, considerando essa informação? Uma carta que atende a dois atributos continua sendo um único resultado.",
      initialState: {
        ranks: 4 + launch.variant,
        event: launch.variant === 0 ? "both" : "either",
        given: launch.variant === 0 ? "all" : "even",
        selected: [],
      },
      answerLabel: "Probabilidade (de 0 a 1)",
      answerHint: "Pode usar fração, decimal ou percentual: 1/2, 0,5 e 50% são equivalentes.",
      answerKeys: ["decimal", "fraction"],
      rubric: [
        "Contar cartas físicas distintas",
        "Restringir o denominador à informação conhecida",
        "Não duplicar a interseção",
      ],
    });
  },
  summarize: (launch, raw) => cardSummary(parseCards(launch, raw)),
  assess: (launch, raw, answer) => {
    const state = parseCards(launch, raw);
    const model = cardModel(state);
    const summary = cardSummary(state);
    if (
      state.selected.length !== model.favorable.length ||
      model.favorable.some((card) => !state.selected.includes(card.id))
    )
      return {
        correct: false,
        summary,
        message:
          "Confira as cartas marcadas: cada uma precisa atender ao evento e à condição, sem deixar uma carta válida de fora.",
      };
    return numberAssessment(
      answer,
      model.probability,
      summary,
      `Entre as ${model.eligible.length} cartas que respeitam a informação conhecida, ${model.favorable.length} também atendem ao evento: ${fraction(model.favorable.length, model.eligible.length)}.`,
      0.000001,
      "ratio",
    );
  },
};
