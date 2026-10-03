import { z } from "zod";
import type { ToolLaunch, ToolModule } from "../types";
import { activity, ensureMode, openAssessment } from "./common";

const pair = z
  .object({ first: z.number().int().min(0).max(11), second: z.number().int().min(0).max(11) })
  .strict();
export const processSchema = z
  .object({
    actions: z.array(pair).max(50),
    selected: z.array(z.number().int().min(0).max(11)).max(2),
  })
  .strict();
export type ProcessState = z.infer<typeof processSchema>;
export const processDefinitions: Record<
  string,
  { title: string; rule: string; invariant: string }
> = {
  "processo-soma": {
    title: "Apagar dois e escrever a soma",
    rule: "Escolha dois números e substitua-os pela soma. Investigue o que não muda e preveja o último número.",
    invariant: "A soma total é preservada: retirar a e b e acrescentar a + b não muda o total.",
  },
  "processo-diferenca": {
    title: "Retirar uma ficha de cada pilha",
    rule: "Retire exatamente uma ficha de cada pilha por jogada. Preveja o que resta quando uma pilha acaba.",
    invariant: "A diferença entre as quantidades é preservada, porque ambas diminuem em 1.",
  },
  "processo-copos": {
    title: "Virar exatamente dois copos",
    rule: "Escolha dois copos distintos e vire ambos. Investigue se é possível deixar todos para baixo. Compare a quantidade para cima e sua paridade.",
    invariant: "A quantidade para cima muda em −2, 0 ou +2; sua paridade não muda.",
  },
  "processo-camaleoes": {
    title: "Encontros que trocam as duas cores",
    rule: "Escolha duas cores diferentes que ainda tenham camaleões. Um de cada cor passa para a terceira cor. Investigue a possibilidade de terminar com uma só cor.",
    invariant:
      "O total é preservado. As diferenças entre as três quantidades mantêm seus restos módulo 3; no estado monocromático, as três quantidades precisam ter o mesmo resto módulo 3.",
  },
  "processo-sinais": {
    title: "Trocar dois sinais pelo seu produto",
    rule: "Escolha dois sinais. Iguais viram + e diferentes viram −. Preveja o último sinal e explique por que a ordem das escolhas não o altera.",
    invariant:
      "O produto dos sinais é preservado. A paridade da quantidade de sinais negativos também é preservada.",
  },
  "processo-bolas": {
    title: "Duas bolas entram, uma volta",
    rule: "Escolha duas bolas: cores iguais voltam como uma branca; cores diferentes voltam como uma preta. Preveja a cor da última bola.",
    invariant:
      "A paridade da quantidade de bolas pretas é preservada em todos os tipos de retirada.",
  },
  "processo-diferenca-absoluta": {
    title: "Dois números viram sua diferença",
    rule: "Substitua dois números pelo valor absoluto de sua diferença. Investigue a paridade do número final, sem confundir isso com preservar a soma exata.",
    invariant:
      "Trocar a e b por |a − b| diminui a soma em 2·min(a,b). A soma exata muda, mas sua paridade é preservada.",
  },
};
export function processDefinition(launch: ToolLaunch) {
  ensureMode(launch, "L15", Object.keys(processDefinitions));
  const definition = processDefinitions[launch.mode];
  if (!definition) throw new Error("Processo não publicado.");
  return definition;
}
export function processValues(launch: ToolLaunch, actions: ProcessState["actions"]) {
  processDefinition(launch);
  let values =
    launch.mode === "processo-diferenca"
      ? [7 + launch.variant * 2, 4 + launch.variant]
      : launch.mode === "processo-camaleoes"
        ? launch.variant === 0
          ? [2, 3, 4]
          : [2, 2, 5]
        : launch.mode === "processo-copos"
          ? [1, 1, launch.variant, 0, 0, 0]
          : launch.mode === "processo-sinais" || launch.mode === "processo-bolas"
            ? [-1, -1, launch.variant === 0 ? 1 : -1, 1, 1]
            : [1 + launch.variant, 2 + launch.variant, 3 + launch.variant, 4 + launch.variant];
  const history = [values];
  for (const action of actions) {
    const { first, second } = action;
    if (first === second || first >= values.length || second >= values.length)
      throw new Error("Escolha dois objetos distintos que ainda existam.");
    const a = values[first];
    const b = values[second];
    if (a === undefined || b === undefined) throw new Error("Objeto ausente no processo.");
    if (launch.mode === "processo-diferenca") {
      if (first + second !== 1 || a <= 0 || b <= 0)
        throw new Error("As duas pilhas precisam ter uma ficha.");
      values = values.map((value) => value - 1);
    } else if (launch.mode === "processo-camaleoes") {
      if (a <= 0 || b <= 0) throw new Error("As duas cores escolhidas precisam estar presentes.");
      values = values.map((value, index) =>
        index === first || index === second ? value - 1 : value + 2,
      );
    } else if (launch.mode === "processo-copos") {
      values = values.map((value, index) =>
        index === first || index === second ? 1 - value : value,
      );
    } else {
      const next =
        launch.mode === "processo-sinais" || launch.mode === "processo-bolas"
          ? a * b
          : launch.mode === "processo-diferenca-absoluta"
            ? Math.abs(a - b)
            : a + b;
      values = [...values.filter((_, index) => index !== first && index !== second), next];
    }
    history.push(values);
  }
  return { values, history };
}
export function parseProcess(launch: ToolLaunch, raw: unknown) {
  const state = processSchema.parse(raw);
  const { values } = processValues(launch, state.actions);
  if (
    new Set(state.selected).size !== state.selected.length ||
    state.selected.some((index) => index >= values.length)
  )
    throw new Error("Seleção inválida para o estado atual.");
  return state;
}
export function processSummary(launch: ToolLaunch, state: ProcessState) {
  const { history, values } = processValues(launch, state.actions);
  const sum = values.reduce((total, value) => total + value, 0);
  return `${processDefinition(launch).title}. Inicial: ${history[0]?.join(", ")}. Após ${state.actions.length} operações: ${values.join(", ")}. Soma atual: ${sum}; paridade da soma: ${Math.abs(sum % 2)}. ${processDefinition(launch).invariant}`;
}
export const processTool: ToolModule = {
  family: "L15",
  modes: Object.keys(processDefinitions),
  parse: parseProcess,
  activity: (launch) => {
    const definition = processDefinition(launch);
    return activity({
      title: definition.title,
      prompt: `${definition.rule} Estado inicial: ${processValues(launch, []).values.join(", ")}.`,
      initialState: { actions: [], selected: [] },
      answerLabel: "Seu argumento sobre o processo",
      rubric: [
        "Descrever a operação permitida",
        "Provar que cada tipo de operação preserva a propriedade",
        "Relacionar o estado inicial ao alvo",
        "Distinguir condição necessária de condição suficiente",
      ],
    });
  },
  summarize: (launch, raw) => processSummary(launch, parseProcess(launch, raw)),
  assess: (launch, raw) =>
    openAssessment(processSummary(launch, parseProcess(launch, raw)), [
      "Conferir todas as operações permitidas",
      "Explicar a propriedade preservada",
      "Usar a propriedade para justificar a conclusão; tentativas isoladas não são uma prova",
    ]),
};
