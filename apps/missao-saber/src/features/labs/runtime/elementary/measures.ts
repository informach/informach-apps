import { z } from "zod";
import type { ToolLaunch, ToolModule } from "../types";
import { activity, assessNumber, format, requireMode } from "./math";

export const measureSchema = z
  .object({
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(0).max(1439),
    nextDay: z.boolean(),
    day: z.number().int().min(1).max(31),
    daysLater: z.number().int().min(1).max(30),
    rulerStart: z.number().int().min(0).max(15),
    rulerEnd: z.number().int().min(1).max(30),
    rulerUnit: z.number().int().min(1).max(5).default(1),
    amount: z.number().int().min(1).max(5000),
    unit: z.enum(["mm", "cm", "m", "mL", "L", "g", "kg"]),
    vessel: z.number().int().min(1).max(10),
  })
  .strict()
  .refine(
    (state) => state.rulerEnd > state.rulerStart,
    "A ponta final deve ficar depois da ponta inicial.",
  )
  .refine(
    (state) => state.nextDay || state.endMinute >= state.startMinute,
    "Indique o dia seguinte quando o relógio atravessar a meia-noite.",
  );
export type MeasureState = z.infer<typeof measureSchema>;
type Kind = "clock" | "calendar" | "ruler" | "capacity" | "mass" | "convert" | "choose";
type Definition = { title: string; kind: Kind; prompt: string; label: string };
export const measureCases: Record<string, Definition> = {
  conversoes: {
    title: "A medida muda de unidade",
    kind: "convert",
    prompt:
      "O segmento tem a medida indicada em centímetros. Escolha milímetros, centímetros ou metros para expressar o mesmo comprimento. Qual é o valor na unidade escolhida?",
    label: "Valor na unidade escolhida",
  },
  "relogio-e-duracao": {
    title: "Quanto tempo passou?",
    kind: "clock",
    prompt:
      "Ajuste o relógio de saída e o de chegada. Use a linha do tempo para atravessar a hora. Quantos minutos se passaram? Marque dia seguinte se atravessar a meia-noite.",
    label: "Duração em minutos",
  },
  calendario: {
    title: "Passeio pelo calendário",
    kind: "calendar",
    prompt:
      "O primeiro calendário é outubro de 2026. Escolha um dia e avance a quantidade indicada. Em que dia do mês você chega? Observe quando passa para novembro.",
    label: "Dia do mês da chegada",
  },
  "regua-e-comprimentos": {
    title: "Medir começando fora do zero",
    kind: "ruler",
    prompt:
      "Mova as duas pontas do segmento sobre a régua. O comprimento é a distância entre elas, mesmo quando o começo não está no zero. Quanto ele mede em centímetros?",
    label: "Comprimento em cm",
  },
  "massas-capacidades": {
    title: "Gramas e quilogramas",
    kind: "mass",
    prompt:
      "A balança informa a massa em gramas. Troque a unidade de leitura entre g e kg sem alterar a massa. Qual é o valor na unidade escolhida?",
    label: "Massa na unidade escolhida",
  },
  "escolher-unidade": {
    title: "Uma unidade adequada",
    kind: "choose",
    prompt:
      "Vamos medir o comprimento de uma sala. Escolha a unidade mais prática entre as opções. A pergunta é sobre comprimento, e não sobre massa ou capacidade.",
    label: "Unidade escolhida",
  },
  "unidades-e-regua": {
    title: "Quantos intervalos cabem?",
    kind: "ruler",
    prompt:
      "Meça a fita com peças iguais, sem espaços nem sobreposição. Escolha quantos centímetros mede cada peça e ajuste as pontas da fita. Quantas dessas unidades cobrem a fita? Pode sobrar uma parte de unidade. Compare a mesma fita com unidades de tamanhos diferentes.",
    label: "Comprimento em unidades escolhidas",
  },
  capacidade: {
    title: "Encher com copos iguais",
    kind: "capacity",
    prompt:
      "Cada copo tem a capacidade indicada em mililitros. Encha a quantidade de copos escolhida. Qual é a capacidade total, em litros?",
    label: "Capacidade total em L",
  },
  "horas-e-calendario": {
    title: "Um compromisso e dois relógios",
    kind: "clock",
    prompt:
      "Marque o começo e o fim do compromisso. Conte os minutos entre eles. Se terminar no dia seguinte, marque essa opção.",
    label: "Tempo passado em minutos",
  },
  "problemas-medidas": {
    title: "Fita para fazer um laço",
    kind: "convert",
    prompt:
      "A fita tem o comprimento indicado em centímetros. Troque a unidade e descubra outra maneira de escrever o mesmo comprimento. Qual é o valor na unidade escolhida?",
    label: "Comprimento na unidade escolhida",
  },
};
export function measureDefinition(launch: ToolLaunch) {
  return requireMode(launch, "L04", measureCases);
}
export function parseMeasure(launch: ToolLaunch, raw: unknown): MeasureState {
  const definition = measureDefinition(launch);
  const state = measureSchema.parse(raw);
  const allowed = definition.kind === "mass" ? ["g", "kg"] : ["mm", "cm", "m"];
  if (
    (definition.kind === "mass" || definition.kind === "convert") &&
    !allowed.includes(state.unit)
  )
    throw new Error("A unidade precisa medir a grandeza deste roteiro.");
  return state;
}
export function clockText(minutes: number): string {
  return `${Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}`;
}
export function durationSegments(
  state: Pick<MeasureState, "startMinute" | "endMinute" | "nextDay">,
) {
  const end = state.endMinute + (state.nextDay ? 1440 : 0);
  const bounds = [
    ...new Set([
      state.startMinute,
      end,
      Math.ceil(state.startMinute / 60) * 60,
      Math.floor(end / 60) * 60,
      1440,
    ]),
  ]
    .filter((minute) => minute >= state.startMinute && minute <= end)
    .sort((a, b) => a - b);
  return bounds.slice(1).map((to, index) => {
    const from = bounds[index] ?? state.startMinute;
    return { from, to, minutes: to - from };
  });
}
export function calendarArrival(state: Pick<MeasureState, "day" | "daysLater">) {
  const date = new Date(Date.UTC(2026, 9, state.day + state.daysLater));
  return { day: date.getUTCDate(), month: date.getUTCMonth() === 9 ? "outubro" : "novembro" };
}
export function measureValue(launch: ToolLaunch, state: MeasureState): number {
  switch (measureDefinition(launch).kind) {
    case "clock":
      return state.endMinute + (state.nextDay ? 1440 : 0) - state.startMinute;
    case "calendar":
      return calendarArrival(state).day;
    case "ruler":
      return (
        (state.rulerEnd - state.rulerStart) /
        (launch.mode === "unidades-e-regua" ? state.rulerUnit : 1)
      );
    case "capacity":
      return (state.amount * state.vessel) / 1000;
    case "mass":
      return state.unit === "kg" ? state.amount / 1000 : state.amount;
    case "convert":
      return state.unit === "m"
        ? state.amount / 100
        : state.unit === "mm"
          ? state.amount * 10
          : state.amount;
    case "choose":
      return 0;
  }
}
export function measureSummary(launch: ToolLaunch, state: MeasureState): string {
  switch (measureDefinition(launch).kind) {
    case "clock":
      return `De ${clockText(state.startMinute)} a ${clockText(state.endMinute)}${state.nextDay ? " do dia seguinte" : " do mesmo dia"}: ${measureValue(launch, state)} minutos.`;
    case "calendar":
      return `${state.day} de outubro de 2026 + ${state.daysLater} dias = ${calendarArrival(state).day} de ${calendarArrival(state).month} de 2026.`;
    case "ruler":
      return `Segmento entre ${state.rulerStart} cm e ${state.rulerEnd} cm; ${launch.mode === "unidades-e-regua" ? `cada unidade escolhida mede ${state.rulerUnit} cm; comprimento ${format(measureValue(launch, state))} unidades escolhidas` : `comprimento ${measureValue(launch, state)} cm`}.`;
    case "capacity":
      return `${state.vessel} copos de ${state.amount} mL = ${format(measureValue(launch, state))} L.`;
    case "mass":
      return `${state.amount} g = ${format(measureValue(launch, state))} ${state.unit}.`;
    case "convert":
      return `${state.amount} cm = ${format(measureValue(launch, state))} ${state.unit}.`;
    case "choose":
      return launch.variant
        ? "Capacidade de uma jarra: litros medem quanto líquido ela comporta. Comprimento e massa são outras grandezas."
        : "Comprimento de uma sala: metros são uma unidade prática; massa e capacidade medem outras grandezas.";
  }
}
export const measuresTool: ToolModule = {
  family: "L04",
  modes: Object.keys(measureCases),
  activity(launch) {
    const definition = measureDefinition(launch);
    return activity(
      definition.title,
      definition.kind === "choose" && launch.variant
        ? "Vamos medir quanto líquido cabe em uma jarra. Escolha a unidade apropriada para a capacidade. Não estamos medindo seu comprimento nem sua massa."
        : definition.prompt,
      {
        startMinute: launch.variant ? 23 * 60 + 40 : 7 * 60 + 45,
        endMinute: launch.variant ? 25 : 9 * 60 + 10,
        nextDay: launch.variant === 1,
        day: 24 + launch.variant * 5,
        daysLater: 6,
        rulerStart: 3 + launch.variant,
        rulerEnd: 11 + launch.variant * 3,
        rulerUnit: 1 + launch.variant,
        amount: 250 + launch.variant * 125,
        unit: definition.kind === "mass" ? "kg" : "m",
        vessel: 4,
      },
      definition.label,
      definition.kind === "choose"
        ? { choices: ["m", "kg", "L"] }
        : {
            answerKeys:
              ["capacity", "convert", "mass"].includes(definition.kind) ||
              launch.mode === "unidades-e-regua"
                ? ["decimal", "fraction"]
                : [],
            answerHint: "Aceita decimal ou fração. A unidade já está indicada.",
          },
    );
  },
  parse: parseMeasure,
  assess(launch, raw, answer) {
    const state = parseMeasure(launch, raw);
    const summary = measureSummary(launch, state);
    const kind = measureDefinition(launch).kind;
    if (kind === "choose")
      return {
        correct: (launch.variant ? /^(l|litro|litros)$/i : /^(m|metro|metros)$/i).test(
          answer.trim(),
        ),
        message:
          "Metros medem comprimento; quilogramas medem massa; litros medem capacidade. Escolha pela grandeza pedida.",
        summary,
      };
    const unit =
      kind === "clock"
        ? ["min", "minutos", "minuto"]
        : kind === "ruler"
          ? launch.mode === "unidades-e-regua"
            ? ["unidades", "unidade"]
            : "cm"
          : kind === "capacity"
            ? "L"
            : kind === "mass" || kind === "convert"
              ? state.unit
              : undefined;
    return assessNumber(
      answer,
      measureValue(launch, state),
      kind === "clock"
        ? "Uma hora tem 60 minutos; acrescente 24 horas ao atravessar para o dia seguinte."
        : kind === "calendar"
          ? "Conte os dias depois da partida, sem contar o dia inicial duas vezes."
          : "A quantidade física fica igual quando mudamos apenas a unidade.",
      summary,
      unit,
    );
  },
  summarize: (launch, raw) => measureSummary(launch, parseMeasure(launch, raw)),
};
