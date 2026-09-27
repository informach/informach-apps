import { createHash } from "node:crypto";
import type { DeepChallenge } from "./desafios-profundos";
import type { Domain, Item, Lesson } from "./types";

/**
 * Fábrica de itens e missões a partir de especificações curtas.
 *
 * O código veio do currículo comercial de 6º/7º e continua produzindo os
 * mesmos bytes para aquelas missões: o registro de revisão compara o hash de
 * cada item, então nada aqui pode mudar um item já revisado. As habilidades
 * das outras faixas entram como `SkillPack`, um arquivo por habilidade, e
 * usam estas mesmas funções.
 */

export type ChoiceSpec = {
  kind: "choice";
  family: string;
  prompt: string;
  answer: string;
  wrong: [string, string];
  explanation: string;
  /** Devolutiva autoral de cada alternativa errada. Sem ela, vale o texto genérico. */
  feedback?: [string, string];
  hints?: [string, string, string];
};
export type NumericSpec = {
  kind: "numeric";
  family: string;
  prompt: string;
  value: number;
  explanation: string;
  unit?: { symbol: string; aliases: string[]; required: boolean };
  /** Etapa trocada previsível, com a devolutiva que a nomeia. */
  misreads?: { value: number; feedback: string }[];
  hints?: [string, string, string];
};
export type ObjectiveSpec = ChoiceSpec | NumericSpec;

export const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const decimal = (value: number) =>
  value.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const SOBRESCRITOS = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const SUBSCRITOS = "₀₁₂₃₄₅₆₇₈₉";
/** Expoente tipográfico para enunciados gerados: `2${sobrescrito(10)}` = "2¹⁰". */
export const sobrescrito = (value: number) =>
  String(value)
    .replace(/\d/g, (digit) => SOBRESCRITOS[Number(digit)] ?? digit)
    .replace("-", "⁻");
/** Índice tipográfico: `a${subscrito(12)}` = "a₁₂". */
export const subscrito = (value: number) =>
  String(value).replace(/\d/g, (digit) => SUBSCRITOS[Number(digit)] ?? digit);
export function stageValue<T>(values: readonly [T, T, T], stage: number): T {
  return values[stage as 0 | 1 | 2] ?? values[0];
}
export const c = (
  family: string,
  prompt: string,
  answer: string | number,
  wrong: [string | number, string | number],
  explanation: string,
  extra: { feedback?: ChoiceSpec["feedback"]; hints?: ChoiceSpec["hints"] } = {},
): ChoiceSpec => ({
  kind: "choice",
  family,
  prompt,
  answer: String(answer),
  wrong: [String(wrong[0]), String(wrong[1])],
  explanation,
  ...extra,
});
export const n = (
  family: string,
  prompt: string,
  value: number,
  explanation: string,
  extra: {
    unit?: NumericSpec["unit"];
    misreads?: NumericSpec["misreads"];
    hints?: NumericSpec["hints"];
  } = {},
): NumericSpec => ({ kind: "numeric", family, prompt, value, explanation, ...extra });

export function orderedOptions(itemId: string, values: string[]) {
  const score = (value: string) => createHash("sha256").update(`${itemId}:${value}`).digest("hex");
  return [...values].sort((a, b) => score(a).localeCompare(score(b)));
}

export function objectiveItem(
  skillId: string,
  lessonId: string,
  index: number,
  spec: ObjectiveSpec,
): Item {
  const id = `${lessonId}-${index + 1}`;
  const purpose = index < 2 ? "discovery" : index < 6 ? "guided-practice" : "independent-practice";
  const hints: [string, string, string] = spec.hints ?? [
    "Separe os dados da pergunta antes de calcular.",
    `Procure a relação central desta família: ${spec.family.replaceAll("-", " ")}.`,
    `Confira cada etapa: ${spec.explanation}`,
  ];
  if (spec.kind === "numeric")
    return {
      type: "numeric",
      id,
      skillId,
      familyId: `${skillId}:learn:${spec.family}`,
      purpose,
      domain: "common",
      prompt: spec.prompt,
      explanation: spec.explanation,
      hints,
      grading: {
        value: spec.value,
        tolerance: 0,
        acceptedForms: Number.isInteger(spec.value)
          ? ["integer", "decimal"]
          : ["decimal", "fraction"],
        unit: spec.unit,
      },
      misreads: spec.misreads ?? [],
    };
  const options = orderedOptions(id, [spec.answer, ...spec.wrong]);
  return {
    type: "choice",
    id,
    skillId,
    familyId: `${skillId}:learn:${spec.family}`,
    purpose,
    domain: "common",
    prompt: spec.prompt,
    answer: spec.answer,
    options,
    explanation: spec.explanation,
    hints,
    misconceptions: Object.fromEntries(
      spec.wrong.map((wrong, wrongIndex) => [
        wrong,
        spec.feedback
          ? `${spec.feedback[wrongIndex]} ${spec.explanation}`
          : wrongIndex === 0
            ? `Essa alternativa usa apenas parte dos dados. ${spec.explanation}`
            : `Essa alternativa troca a relação pedida por outra. ${spec.explanation}`,
      ]),
    ),
  };
}

export type OrderDefinition = {
  prompt: string;
  labels: [string, string, string, string];
  explanation: string;
};

export function orderingItem(
  skillId: string,
  lessonId: string,
  stage: number,
  definition: OrderDefinition,
): Item {
  const order = ["understand", "represent", "solve", "verify"];
  const stageLabels: [string, string, string, string] =
    stage === 0
      ? definition.labels
      : stage === 1
        ? [
            "Retomar a pergunta e a unidade esperada",
            "Refazer a representação ou relação usada",
            "Recalcular e testar um limite ou caso simples",
            "Comparar com a resposta e corrigir a etapa divergente",
          ]
        : [
            "Descrever duas estratégias possíveis",
            "Executar ambas com os mesmos dados",
            "Comparar hipóteses, etapas e resultados",
            "Escolher uma conclusão e justificar o critério",
          ];
  const steps = stageLabels.map((label, index) => ({ id: order[index] ?? String(index), label }));
  const rotated = [
    ...steps.slice((stage + 1) % steps.length),
    ...steps.slice(0, (stage + 1) % steps.length),
  ];
  return {
    type: "ordering",
    id: `${lessonId}-9`,
    skillId,
    familyId: `${skillId}:learn:${["metodo-organizado", "verificacao-de-solucao", "comparacao-de-metodos"][stage] ?? "metodo-organizado"}`,
    purpose: "guided-practice",
    domain: "common",
    prompt:
      stage === 0
        ? definition.prompt
        : stage === 1
          ? `Organize uma verificação de resposta para esta ideia: ${definition.prompt.toLocaleLowerCase("pt-BR")}`
          : `Organize a comparação de dois caminhos de solução para esta ideia: ${definition.prompt.toLocaleLowerCase("pt-BR")}`,
    explanation:
      stage === 0
        ? definition.explanation
        : stage === 1
          ? "Verificar é repetir a relação com atenção à unidade e testar se a resposta respeita limites simples."
          : "Comparar métodos exige aplicar os mesmos dados, explicitar hipóteses e conferir se chegam à mesma conclusão.",
    hints: [
      "Descubra qual passo define o objetivo antes da execução.",
      "Coloque a representação antes do cálculo e a conferência depois dele.",
      `A ordem completa é: ${stageLabels.join(" → ")}.`,
    ],
    steps: rotated,
    grading: { mode: "exact", order },
  };
}

export type JustificationDefinition = {
  /** As introduções das três missões geradas; a explicação cita a do estágio. */
  introductions: [string, string, string];
  prompts: [string, string, string];
  samples: [string, string, string];
  focus: string;
};

export function justificationItem(
  skillId: string,
  lessonId: string,
  stage: number,
  definition: JustificationDefinition,
): Item {
  return {
    type: "justification",
    id: `${lessonId}-10`,
    skillId,
    familyId: `${skillId}:learn:argumentacao-${stage + 1}`,
    purpose: "independent-practice",
    domain: "common",
    prompt: definition.prompts[stage] ?? definition.prompts[0],
    explanation: `Uma boa justificativa liga a ideia “${definition.introductions[stage] ?? definition.introductions[0]}” a uma conclusão verificável.`,
    hints: [
      "Declare primeiro a relação que você vai usar.",
      "Inclua um exemplo, cálculo ou caso que sustente essa relação.",
      "Conclua retomando exatamente o que precisava ser explicado.",
    ],
    response: { label: "Escreva sua justificativa", minLength: 30, maxLength: 800 },
    rubric: [
      `Declara e usa corretamente ${definition.focus}.`,
      "Conecta a relação ao caso ou afirmação da atividade.",
      "Chega a uma conclusão explícita sem depender de autoridade ou opinião.",
    ],
    sampleResponse: definition.samples[stage] ?? definition.samples[0],
  };
}

export function distinctNumericOptions(answer: number): [string, string] {
  const first = answer + Math.max(1, Math.round(Math.abs(answer) * 0.1));
  const second = answer - Math.max(1, Math.round(Math.abs(answer) * 0.15));
  return [decimal(first), decimal(second)];
}

export function verificationSpec(spec: ChoiceSpec): ChoiceSpec {
  return c(spec.family, spec.prompt, spec.answer, spec.wrong, spec.explanation);
}

/** Uma missão de habilidade nova: título, objetivo, introdução e oito itens objetivos. */
export type SkillPackMission = {
  title: string;
  objective: string;
  introduction: string;
  specs: ObjectiveSpec[];
  estimatedMinutes?: number;
  /** Só a primeira habilidade de cada faixa abre as duas primeiras missões de graça. */
  free?: boolean;
};

/**
 * Uma habilidade completa de uma faixa nova, em um arquivo.
 *
 * Cinco missões: as duas primeiras só com itens objetivos (descoberta e
 * prática), as três seguintes ganham um item de ordenação e uma justificativa,
 * como as missões geradas de 6º/7º. O banco reservado (`reserved`) alimenta o
 * diagnóstico e o simulado de toda trilha que inclui a habilidade; a
 * assinatura das questões precisa ser diferente da das missões.
 */
export type SkillPack = {
  id: string;
  name: string;
  domain: Domain;
  lab: Lesson["lab"];
  missions: [
    SkillPackMission,
    SkillPackMission,
    SkillPackMission,
    SkillPackMission,
    SkillPackMission,
  ];
  ordering: OrderDefinition;
  justification: Omit<JustificationDefinition, "introductions">;
  reserved: (seed: number, variant: 0 | 1 | 2) => ChoiceSpec;
  deepChallenge: DeepChallenge;
  homeSupport: readonly [string, string];
};

export function packMissionIds(pack: Pick<SkillPack, "id">) {
  return [1, 2, 3, 4, 5].map((position) => `${pack.id}-${position}`);
}

/**
 * Habilidades do 2º ao 5º ano: pistas e ordenações com linguagem de criança.
 * Fica aqui, e não em cada pacote, para que a regra valha para todos juntos.
 */
const EARLY_READING_PACKS = new Set([
  "contagem-inicial",
  "padroes-iniciais",
  "orientacao-espacial",
  "composicao-de-figuras",
  "tempo-e-medidas",
  "balancas",
  "caminhos",
  "tabelas",
  "contar-e-comparar",
  "formas-e-posicoes",
  "sequencias-iniciais",
  "medir-e-comparar",
  "problemas-com-desenho",
]);

/** Primeira frase de um texto, para lembrar a ideia da missão numa pista. */
/** Os passos são verbos no infinitivo; no meio da frase começam em minúscula. */
function minuscula(text: string) {
  return text.charAt(0).toLocaleLowerCase("pt-BR") + text.slice(1);
}
function firstSentence(text: string) {
  const end = text.search(/[.?!]\s/);
  return end < 0 ? text : text.slice(0, end + 1);
}

/**
 * Pistas das atividades das habilidades novas: a segunda lembra a ideia da
 * missão (e não o nome interno da família), e a terceira mostra o caminho.
 */
function packHints(
  early: boolean,
  introduction: string,
  spec: ObjectiveSpec,
): [string, string, string] {
  return (
    spec.hints ??
    (early
      ? [
          "Leia de novo: o que a pergunta quer saber?",
          `Lembre o que a missão explicou. ${firstSentence(introduction)}`,
          `Veja como se resolve. ${spec.explanation}`,
        ]
      : [
          "Separe os dados da pergunta antes de calcular.",
          `Retome a ideia da missão. ${firstSentence(introduction)}`,
          `Confira cada etapa. ${spec.explanation}`,
        ])
  );
}

/**
 * Ordenação das missões 4 e 5 das habilidades novas: conferir uma resposta e
 * comparar dois caminhos, com enunciado completo e passos no nível da faixa.
 * A missão 3 usa a ordenação autoral do pacote.
 */
function packOrderingItem(
  pack: SkillPack,
  lessonId: string,
  stage: number,
  early: boolean,
  title: string,
): Item {
  if (stage === 0) {
    const base = orderingItem(pack.id, lessonId, 0, pack.ordering);
    // Nos anos iniciais, as dicas da ordenação falam como a criança fala.
    return early
      ? {
          ...base,
          hints: [
            "O que você faz primeiro?",
            `O primeiro passo é ${minuscula(pack.ordering.labels[0])}.`,
            `A ordem completa é: ${pack.ordering.labels.map(minuscula).join(", depois ")}.`,
          ],
        }
      : base;
  }
  const order = ["understand", "represent", "solve", "verify"];
  const labels: [string, string, string, string] =
    stage === 1
      ? early
        ? [
            "Ler de novo a pergunta",
            "Olhar o desenho ou a conta que fiz",
            "Fazer a conta de novo, com calma",
            "Ver se a resposta combina com a história",
          ]
        : [
            "Retomar a pergunta e a unidade esperada",
            "Refazer a relação usada na solução",
            "Recalcular e testar um caso simples",
            "Comparar com a primeira resposta e corrigir a etapa que diverge",
          ]
      : early
        ? [
            "Pensar em dois jeitos de resolver",
            "Resolver dos dois jeitos",
            "Comparar as duas respostas",
            "Escolher a resposta e explicar por quê",
          ]
        : [
            "Descrever duas estratégias possíveis",
            "Executar as duas com os mesmos dados",
            "Comparar etapas e resultados",
            "Escolher uma conclusão e justificar a escolha",
          ];
  const steps = labels.map((label, index) => ({ id: order[index] ?? String(index), label }));
  const rotated = [...steps.slice(stage + 1), ...steps.slice(0, stage + 1)];
  return {
    type: "ordering",
    id: `${lessonId}-9`,
    skillId: pack.id,
    familyId: `${pack.id}:learn:${stage === 1 ? "verificacao-de-solucao" : "comparacao-de-metodos"}`,
    purpose: "guided-practice",
    domain: "common",
    prompt:
      stage === 1
        ? early
          ? `Na missão “${title}”, você resolveu uma atividade. Coloque em ordem os passos para conferir a resposta.`
          : `Depois de resolver uma atividade da missão “${title}”, coloque em ordem os passos para conferir a resposta.`
        : early
          ? `Na missão “${title}”, coloque em ordem os passos para resolver uma atividade de dois jeitos e comparar.`
          : `Na missão “${title}”, coloque em ordem os passos para resolver uma atividade por dois caminhos e comparar.`,
    explanation:
      stage === 1
        ? "Conferir é voltar à pergunta, refazer o caminho e ver se a resposta combina com o que foi pedido."
        : early
          ? "Resolver de dois jeitos e comparar ajuda a ter certeza da resposta."
          : "Comparar dois caminhos com os mesmos dados mostra se a conclusão é firme.",
    hints: [
      "O que precisa vir primeiro, antes de fazer qualquer conta?",
      stage === 1
        ? "A conferência termina olhando a resposta de novo."
        : "A escolha vem só depois de comparar.",
      `A ordem completa é: ${labels.map(minuscula).join(", depois ")}.`,
    ],
    steps: rotated,
    grading: { mode: "exact", order },
  };
}

/** Justificativa das habilidades novas: explicação e rubrica que valem para qualquer estágio. */
function packJustificationItem(
  pack: SkillPack,
  lessonId: string,
  stage: number,
  early: boolean,
): Item {
  const base = justificationItem(pack.id, lessonId, stage, {
    ...pack.justification,
    introductions: ["", "", ""],
  });
  if (base.type !== "justification") return base;
  if (early)
    return {
      ...base,
      explanation:
        "Uma boa explicação diz qual ideia você usou, mostra um exemplo ou uma conta e termina respondendo à pergunta.",
      hints: [
        "Comece dizendo qual ideia você usou.",
        "Mostre um exemplo ou uma conta que ajude a entender.",
        "Termine respondendo à pergunta.",
      ],
      response: {
        label: "Escreva sua explicação. Se quiser, fale e um adulto escreve para você.",
        minLength: 12,
        maxLength: 800,
      },
      rubric: [
        `Usa bem a ideia da missão: ${pack.justification.focus}.`,
        "Mostra um exemplo ou uma conta.",
        "Termina respondendo à pergunta.",
      ],
    };
  return {
    ...base,
    explanation:
      "Uma boa justificativa declara a relação usada, mostra um caso ou cálculo que a sustenta e termina respondendo exatamente ao que foi perguntado.",
    rubric: [
      `Usa com correção a ideia central: ${pack.justification.focus}.`,
      "Conecta a relação ao caso ou afirmação da atividade.",
      "Chega a uma conclusão explícita sem depender de autoridade ou opinião.",
    ],
  };
}

export function packLessons(pack: SkillPack): Lesson[] {
  const early = EARLY_READING_PACKS.has(pack.id);
  return pack.missions.map((mission, position) => {
    const id = `${pack.id}-${position + 1}`;
    const stage = position - 2;
    const items = mission.specs.map((spec, index) =>
      objectiveItem(pack.id, id, index, {
        ...spec,
        hints: packHints(early, mission.introduction, spec),
      }),
    );
    if (stage >= 0)
      items.push(
        packOrderingItem(pack, id, stage, early, mission.title),
        packJustificationItem(pack, id, stage, early),
      );
    return {
      id,
      version: 1,
      title: mission.title,
      skillId: pack.id,
      objective: mission.objective,
      introduction: mission.introduction,
      lab: pack.lab,
      free: mission.free ?? false,
      kind: "mission",
      stage: position === 0 ? "discover" : position === 4 ? "challenge" : "practice",
      prerequisites: [],
      estimatedMinutes: mission.estimatedMinutes ?? (position === 4 ? 18 : position >= 2 ? 15 : 12),
      items: items.map((item) => ({ ...item, domain: pack.domain })),
    } satisfies Lesson;
  });
}
