import { z } from "zod";
import type { ToolLaunch, ToolModule } from "../types";
import { activity, choiceAssessment, ensureMode, numberAssessment, openAssessment } from "./common";
import { matchingTool } from "./matching";
import { processTool } from "./processes";

export const logicStateSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("order"),
      order: z.array(z.enum(["Gato", "Panda", "Raposa"])).length(3),
      eliminated: z.array(z.number().int().min(0).max(5)).max(6),
    })
    .strict(),
  z.object({ kind: z.literal("truth"), p: z.boolean(), q: z.boolean(), r: z.boolean() }).strict(),
  z.object({ kind: z.literal("counterexample"), value: z.number().int().min(0).max(50) }).strict(),
  z.object({ kind: z.literal("quantifier"), selected: z.number().int().min(0).max(3) }).strict(),
  z
    .object({
      kind: z.literal("proof"),
      steps: z.array(z.number().int().min(0).max(5)).max(6),
      example: z.number().int().min(1).max(12),
    })
    .strict(),
]);
export type LogicState = z.infer<typeof logicStateSchema>;
type LogicKind = LogicState["kind"];
type ProofScene = {
  claim: string;
  givenSteps?: string[];
  cards: string[];
  rubric: string[];
  example: (n: number) => string;
};
type LogicDefinition = { title: string; kind: LogicKind; question: string };
export const logicDefinitions: Record<string, LogicDefinition> = {
  "conectivos-basicos": {
    title: "E e ou: condições diferentes",
    kind: "truth",
    question:
      "Compare os valores de P e Q com o conectivo indicado. O ou é inclusivo: aceita que ambas sejam verdadeiras.",
  },
  "inducao-quadrados": {
    title: "Somar quadrados por indução",
    kind: "proof",
    question:
      "Justifique a fórmula da soma dos quadrados. Organize base, hipótese e passo; no passo, acrescente exatamente (n + 1)².",
  },
  "contraexemplos-primos": {
    title: "Uma exceção entre primos e ímpares",
    kind: "counterexample",
    question:
      "Encontre um contraexemplo da afirmação indicada e informe n. Confira tanto a hipótese quanto a conclusão; um caso fora da hipótese não é contraexemplo.",
  },
  "auto-referencia": {
    title: "Uma fala sobre quem a diz",
    kind: "truth",
    question:
      "Ana diz “eu sempre minto”; Beto diz “Ana fala a verdade”. P afirma que Ana fala a verdade e Q que Beto fala a verdade. A atribuição selecionada é coerente com ambas as falas, supondo que cada pessoa sempre mente ou sempre fala a verdade?",
  },
  "pistas-com-desenho": {
    title: "Quem vem antes?",
    kind: "order",
    question: "Troque os bichos de lugar até a fila respeitar todas as pistas. Quem fica no meio?",
  },
  "testar-casos-visuais": {
    title: "Teste cada fila",
    kind: "order",
    question:
      "Veja as seis filas possíveis. Risque apenas as que desobedecem às pistas e monte uma fila válida. Quem fica no meio?",
  },
  "pistas-e-eliminacao": {
    title: "Eliminar com uma razão",
    kind: "order",
    question:
      "Use as pistas para eliminar filas impossíveis. Monte uma fila que satisfaça todas elas e indique quem fica no meio.",
  },
  "tabela-deducao": {
    title: "Deduzir sem adivinhar",
    kind: "order",
    question:
      "As pistas restringem posições. Examine todas as filas antes de escolher: quem ocupa o meio em uma fila válida?",
  },
  "necessario-ou-possivel": {
    title: "Toda solução ou somente uma?",
    kind: "order",
    question:
      "Pela única pista Gato antes de Raposa, como classificar a afirmação “Panda está no meio”?",
  },
  implicacoes: {
    title: "Quando uma implicação falha?",
    kind: "truth",
    question:
      "P significa “o número é múltiplo de 4” e Q “o número é par”. Na linha selecionada, a frase lógica P → Q é verdadeira ou falsa? A tabela estuda a forma da frase; algumas linhas não correspondem a um inteiro real com essas propriedades.",
  },
  "encadear-implicacoes": {
    title: "Duas setas em sequência",
    kind: "truth",
    question:
      "Na linha escolhida, avalie ((P → Q) e (Q → R)) → (P → R). Compare todas as linhas para examinar a validade dessa forma lógica.",
  },
  "tabela-logica": {
    title: "E, ou e negação",
    kind: "truth",
    question:
      "Na linha selecionada, qual é o valor de (P ou Q) e não (P e Q)? O “ou” simples é inclusivo; aqui a expressão exige exatamente uma verdadeira.",
  },
  "conectivos-tabela-verdade": {
    title: "Conectivos em uma tabela completa",
    kind: "truth",
    question:
      "Qual é o valor de não (P e Q) ↔ (não P ou não Q) na linha selecionada? Compare as duas expressões nas quatro linhas.",
  },
  "implicacao-reciproca-contrapositiva": {
    title: "Recíproca e contrapositiva",
    kind: "truth",
    question:
      "A implicação P → Q tem sempre o mesmo valor que não Q → não P? Na linha selecionada, responda se essas duas expressões têm o mesmo valor. Compare também com Q → P.",
  },
  "validade-falacias": {
    title: "Uma conclusão pode não seguir",
    kind: "truth",
    question:
      "Avalie ((P → Q) e Q) → P na linha selecionada. Uma linha falsa basta para mostrar que essa forma de argumento não é válida para todas as interpretações.",
  },
  "verdade-mentira": {
    title: "As falas combinam com os falantes?",
    kind: "truth",
    question:
      "Ana diz: “Beto mente”. Beto diz: “Ana e eu mentimos”. P indica que Ana fala a verdade e Q indica que Beto fala a verdade. A atribuição selecionada é coerente com as duas falas?",
  },
  contraexemplos: {
    title: "Um caso que derruba o “todo”",
    kind: "counterexample",
    question:
      "Afirmação: “Para todo inteiro n ≥ 0, n² > n”. Encontre um contraexemplo no controle e informe esse n. Testar vários casos favoráveis não provaria a afirmação.",
  },
  "negacao-e-contraexemplo": {
    title: "Negar com uma testemunha",
    kind: "counterexample",
    question:
      "Afirmação: “Todo natural par é múltiplo de 4”. Encontre um par que não é múltiplo de 4 e informe esse número.",
  },
  quantificadores: {
    title: "Todo ou existe?",
    kind: "quantifier",
    question: "Qual frase nega corretamente “Todos os alunos resolveram pelo menos um problema”?",
  },
  "quantificadores-negacao": {
    title: "Negar dois quantificadores",
    kind: "quantifier",
    question:
      "Qual frase nega “Existe um aluno que resolveu todos os problemas”? O universo de alunos e de problemas não é vazio.",
  },
  "conjectura-ou-teorema": {
    title: "Muitos exemplos ainda não são prova",
    kind: "counterexample",
    question:
      "Investigue a expressão indicada. Os primeiros valores parecem primos. Encontre um valor que dê um número composto e informe n. Isso refuta a afirmação universal.",
  },
  impossibilidade: {
    title: "Uma propriedade que não muda",
    kind: "proof",
    question:
      "Organize um argumento de impossibilidade. Diferencie uma propriedade preservada de uma lista de tentativas que falharam.",
  },
  extremos: {
    title: "Escolha um caso extremo",
    kind: "proof",
    question:
      "Use um elemento de valor mínimo para construir um argumento que não dependa de testar todos os exemplos.",
  },
  "argumento-completo": {
    title: "Do enunciado à conclusão",
    kind: "proof",
    question:
      "Monte o argumento, confira suas hipóteses e escreva uma justificativa que cubra todos os inteiros do domínio.",
  },
  justificar: {
    title: "Explique por que a operação preserva a igualdade",
    kind: "proof",
    question:
      "Organize uma justificativa da equivalência de uma equação. Verificar apenas a resposta final não justifica cada transformação.",
  },
  provas: {
    title: "Uma prova sobre inteiros",
    kind: "proof",
    question:
      "Passe de exemplos a uma razão que vale para qualquer inteiro. Organize as etapas e escreva a prova.",
  },
  prova: {
    title: "Coordenadas e um argumento geral",
    kind: "proof",
    question:
      "Justifique a fórmula do ponto médio por deslocamentos iguais, sem depender de um desenho particular.",
  },
  "provas-geometricas": {
    title: "Uma construção ajuda uma prova",
    kind: "proof",
    question:
      "Organize a prova da soma dos ângulos de um triângulo no plano euclidiano. Medir uma figura é uma observação, não a prova para todos os triângulos.",
  },
  "casos-e-absurdo": {
    title: "Uma suposição impossível",
    kind: "proof",
    question:
      "Organize uma prova por absurdo e identifique precisamente onde aparece a contradição.",
  },
  "revisar-prova": {
    title: "Encontre o passo que precisa de hipótese",
    kind: "proof",
    question:
      "Revise a suposta prova. Identifique a primeira passagem que não é justificada e explique qual hipótese falha.",
  },
  "escrever-prova": {
    title: "Uma afirmação para todo n",
    kind: "proof",
    question:
      "Escreva uma prova geral usando as peças como apoio. Explicite o domínio, as hipóteses e por que a conclusão segue.",
  },
  "base-e-passo": {
    title: "A primeira peça e a ligação entre peças",
    kind: "proof",
    question:
      "Separe base, hipótese de indução e passo. Não use a conclusão para justificar a própria hipótese.",
  },
  "inducao-somas-desigualdades": {
    title: "Somas e desigualdades por indução",
    kind: "proof",
    question:
      "Complete a prova por indução da afirmação indicada. O passo precisa partir da hipótese para n e obter o caso n + 1; justifique também qualquer desigualdade usada.",
  },
  inducao: {
    title: "Base e passagem para o sucessor",
    kind: "proof",
    question:
      "Organize base, hipótese e passo para justificar a soma 1 + 2 + ... + n. Explique por que os dois requisitos são necessários.",
  },
};

export function logicDefinition(launch: ToolLaunch) {
  ensureMode(launch, "L15", Object.keys(logicDefinitions));
  const definition = logicDefinitions[launch.mode];
  if (!definition) throw new Error("Modo de lógica não publicado.");
  return definition;
}

export function proofScene(launch: ToolLaunch): ProofScene {
  const shift = launch.variant;
  if (launch.mode === "inducao-somas-desigualdades" && shift === 1)
    return {
      claim: "Para todo inteiro n ≥ 1, 2ⁿ ≥ n + 1.",
      cards: [
        "Base n = 1: 2¹ = 2 ≥ 1 + 1.",
        "Hipótese: suponha 2ⁿ ≥ n + 1 para um inteiro n ≥ 1.",
        "Multiplicar por 2, que é positivo, preserva a desigualdade: 2ⁿ⁺¹ ≥ 2n + 2.",
        "Como n ≥ 1, também n ≥ 0; logo 2n + 2 ≥ n + 2.",
        "Assim 2ⁿ⁺¹ ≥ (n + 1) + 1. Base e passo demonstram a afirmação para todo n ≥ 1.",
      ],
      rubric: [
        "Verificar a base",
        "Usar a hipótese somente para n",
        "Justificar o sinal do multiplicador",
        "Comparar 2n + 2 com n + 2 usando o domínio",
        "Concluir o caso n + 1",
      ],
      example: (n) =>
        `2 elevado a ${n} é ${2 ** n}; ${n} + 1 = ${n + 1}. Um exemplo não substitui o passo geral.`,
    };
  if (launch.mode === "inducao-quadrados")
    return {
      claim: "Para todo inteiro n ≥ 1, 1² + 2² + ... + n² = n(n + 1)(2n + 1)/6.",
      cards: [
        "Base n = 1: 1² = 1·2·3/6.",
        "Hipótese: S(n) = n(n + 1)(2n + 1)/6.",
        "O próximo termo é (n + 1)²: S(n + 1) = S(n) + (n + 1)².",
        "Substitua a hipótese e fatore: (n + 1)[n(2n + 1) + 6(n + 1)]/6.",
        "O colchete é (n + 2)(2n + 3), obtendo a fórmula para n + 1.",
        "Base e passo cobrem todos os inteiros n ≥ 1.",
      ],
      rubric: [
        "Conferir a base",
        "Separar hipótese e conclusão",
        "Somar o quadrado do sucessor",
        "Justificar a fatoração",
      ],
      example: (n) =>
        `Os quadrados de 1 a ${n} somam ${(n * (n + 1) * (2 * n + 1)) / 6}. A fórmula precisa ser justificada para todo n, além desses exemplos.`,
    };
  if (["base-e-passo", "inducao-somas-desigualdades"].includes(launch.mode))
    return {
      claim: "Para todo inteiro n ≥ 1, 1 + 3 + ... + (2n − 1) = n².",
      cards: [
        "Base: para n = 1, 1 = 1².",
        "Hipótese: suponha que a soma dos n primeiros ímpares seja n².",
        "O próximo ímpar é 2(n + 1) − 1 = 2n + 1.",
        "Somar esse termo à hipótese dá n² + 2n + 1 = (n + 1)².",
        "Base e passo garantem a afirmação para todos os inteiros n ≥ 1.",
      ],
      rubric: [
        "Verificar a base n = 1",
        "Usar a hipótese apenas para n",
        "Demonstrar o passo n → n + 1",
        "Explicitar o domínio n ≥ 1",
      ],
      example: (n) => `${n} primeiros ímpares somam ${n * n}; o próximo ímpar é ${2 * n + 1}.`,
    };
  if (launch.mode === "inducao")
    return {
      claim: "Para todo inteiro n ≥ 1, 1 + 2 + ... + n = n(n + 1)/2.",
      cards: [
        "Base: 1 = 1·2/2.",
        "Hipótese: S(n) = n(n + 1)/2.",
        "S(n + 1) = S(n) + (n + 1).",
        "Substituir a hipótese: S(n + 1) = (n + 1)(n + 2)/2.",
        "Pela base e pelo passo, a igualdade vale para todo n ≥ 1.",
      ],
      rubric: [
        "Identificar base e hipótese",
        "Acrescentar o termo n + 1",
        "Fatorar sem supor o resultado desejado",
      ],
      example: (n) => `S(${n}) = ${(n * (n + 1)) / 2}; S(${n + 1}) = ${((n + 1) * (n + 2)) / 2}.`,
    };
  if (launch.mode === "impossibilidade")
    return {
      claim: `Partindo de ${2 + shift * 2} e somando ou subtraindo 2 a cada passo, é impossível chegar a ${7 + shift * 2}.`,
      cards: [
        "O valor inicial é par.",
        "Somar ou subtrair 2 preserva a paridade.",
        "Logo, todos os valores alcançáveis são pares.",
        "O alvo é ímpar e, portanto, não é alcançável.",
      ],
      rubric: [
        "Nomear a propriedade preservada",
        "Conferir cada operação permitida",
        "Comparar a propriedade do alvo",
      ],
      example: (n) =>
        `${n} passos de +2 levam a ${2 + shift * 2 + 2 * n}, ainda par. Outros caminhos também preservam a paridade.`,
    };
  if (launch.mode === "extremos")
    return {
      claim:
        "Em qualquer conjunto finito não vazio de inteiros positivos, um dos números não pode ser a soma de dois números do próprio conjunto.",
      cards: [
        "Escolha o menor número m do conjunto.",
        "Todos os números do conjunto são pelo menos m > 0.",
        "A soma de dois deles é pelo menos 2m, que é maior que m.",
        "Portanto m não é soma de dois números do conjunto.",
      ],
      rubric: [
        "Usar que o conjunto é finito e não vazio",
        "Usar a positividade",
        "Escolher um extremo e justificar a desigualdade",
      ],
      example: (n) =>
        `Se o menor número for ${n}, qualquer soma de dois números do conjunto será pelo menos ${2 * n}.`,
    };
  if (launch.mode === "justificar")
    return {
      claim: `A equação ${2 + shift}x + ${3 + shift} = ${13 + shift * 6} é equivalente à equação obtida subtraindo ${3 + shift} dos dois lados e dividindo por ${2 + shift}.`,
      cards: [
        "Subtrair a mesma quantidade de ambos os lados preserva a igualdade.",
        "O coeficiente de x é diferente de zero.",
        "Dividir ambos os lados por esse coeficiente preserva a igualdade.",
        "As operações são reversíveis, logo não se perdem nem se criam soluções.",
      ],
      rubric: ["Operar nos dois lados", "Justificar divisor não nulo", "Explicar reversibilidade"],
      example: (n) =>
        `Para x = ${n}, o lado esquerdo é ${(2 + shift) * n + 3 + shift}. A equivalência de operações é geral, mesmo quando esse x não resolve a equação.`,
    };
  if (launch.mode === "prova")
    return {
      claim: "O ponto M = ((x₁ + x₂)/2, (y₁ + y₂)/2) é o ponto médio do segmento AB.",
      cards: [
        "O deslocamento A → M é ((x₂ − x₁)/2, (y₂ − y₁)/2).",
        "O deslocamento M → B tem exatamente as mesmas coordenadas.",
        "Os deslocamentos são iguais e têm o mesmo sentido.",
        "Portanto A, M e B são colineares e AM = MB.",
      ],
      rubric: [
        "Demonstrar colinearidade",
        "Comparar os dois deslocamentos",
        "Incluir segmentos horizontais, verticais e oblíquos",
      ],
      example: (n) =>
        `A = (0, ${shift}), B = (${2 * n}, ${2 * n + shift}); M = (${n}, ${n + shift}).`,
    };
  if (launch.mode === "provas-geometricas")
    return {
      claim: "A soma dos ângulos internos de qualquer triângulo euclidiano é 180°.",
      cards: [
        "Trace pelo vértice A uma paralela ao lado BC.",
        "Ângulos alternos internos reproduzem nessa reta os ângulos de B e C.",
        "Esses dois ângulos e o ângulo de A formam um ângulo raso.",
        "Logo a soma dos três ângulos internos é 180°.",
      ],
      rubric: [
        "Declarar a construção auxiliar",
        "Citar a relação de paralelas",
        "Evitar usar medidas de um único desenho como prova",
      ],
      example: (n) =>
        `Exemplo: ângulos ${20 + n}°, ${40 + shift * 10}° e ${120 - n - shift * 10}° somam 180°. A prova precisa cobrir outros triângulos.`,
    };
  if (launch.mode === "casos-e-absurdo")
    return {
      claim: "Não existe um menor número racional positivo.",
      cards: [
        "Suponha, por absurdo, que r seja o menor racional positivo.",
        "r/2 é racional e também é positivo.",
        "Como r > 0, temos r/2 < r.",
        "Isso contradiz a minimalidade de r; portanto tal menor número não existe.",
      ],
      rubric: [
        "Declarar a suposição",
        "Construir outro racional positivo",
        "Identificar a contradição exata",
      ],
      example: (n) => `Se o candidato fosse 1/${n}, então 1/${2 * n} seria positivo e menor.`,
    };
  if (launch.mode === "revisar-prova")
    return {
      claim: `Uma suposta prova começa com a = b = ${1 + shift} e conclui ${2 * (1 + shift)} = ${1 + shift}. Onde está o erro?`,
      givenSteps: [
        `Partindo de a = b = ${1 + shift}, multiplicamos a = b por a: a² = ab.`,
        "Subtraindo b² dos dois lados: a² − b² = ab − b².",
        "Fatorando: (a − b)(a + b) = b(a − b).",
        "Dividindo os dois lados por a − b, obtemos a + b = b.",
        `Substituindo a = b = ${1 + shift}, obtemos ${2 * (1 + shift)} = ${1 + shift}.`,
      ],
      cards: [
        `a = b = ${1 + shift}, então a² = ab.`,
        "Subtraindo b²: a² − b² = ab − b².",
        "Fatorando: (a − b)(a + b) = b(a − b).",
        "Passo inválido: dividir os dois lados por a − b.",
        "Aqui a − b = 0; divisão por zero não é definida.",
      ],
      rubric: [
        "Apontar o passo exato",
        "Verificar as condições de cada operação sob a hipótese",
        "Explicar por que as etapas anteriores não autorizam essa passagem",
      ],
      example: (n) =>
        `Com a = b = ${n}, a − b continua igual a zero; a mesma divisão permanece inválida.`,
    };
  return {
    claim:
      shift === 0
        ? "O produto de dois inteiros consecutivos é sempre par."
        : "O quadrado de qualquer inteiro ímpar é ímpar.",
    cards:
      shift === 0
        ? [
            "Seja n um inteiro qualquer.",
            "Se n é par, n(n + 1) tem um fator par.",
            "Se n é ímpar, n + 1 é par, e o produto também tem um fator par.",
            "Os dois casos cobrem todos os inteiros; o produto é par.",
          ]
        : [
            "Escreva um inteiro ímpar como 2k + 1, com k inteiro.",
            "Seu quadrado é 4k² + 4k + 1.",
            "Isso é 2(2k² + 2k) + 1, com 2k² + 2k inteiro.",
            "Logo o quadrado é ímpar.",
          ],
    rubric: [
      "Declarar um inteiro arbitrário",
      "Cobrir todos os casos do domínio",
      "Conectar cada etapa à conclusão",
    ],
    example: (n) =>
      shift === 0
        ? `${n}·${n + 1} = ${n * (n + 1)}, par. Esse exemplo não substitui o argumento geral.`
        : `${2 * n + 1}² = ${(2 * n + 1) ** 2}, ímpar. Esse exemplo não substitui a expressão geral.`,
  };
}

export function logicInitial(launch: ToolLaunch): LogicState {
  switch (logicDefinition(launch).kind) {
    case "order":
      return {
        kind: "order",
        order: launch.variant === 0 ? ["Raposa", "Panda", "Gato"] : ["Panda", "Gato", "Raposa"],
        eliminated: [],
      };
    case "truth":
      return { kind: "truth", p: launch.variant === 0, q: launch.variant === 1, r: false };
    case "counterexample":
      return { kind: "counterexample", value: 2 + launch.variant };
    case "quantifier":
      return { kind: "quantifier", selected: launch.variant };
    case "proof":
      return { kind: "proof", steps: [], example: 2 + launch.variant };
  }
}
export function parseLogic(launch: ToolLaunch, raw: unknown): LogicState {
  const state = logicStateSchema.parse(raw);
  if (state.kind !== logicDefinition(launch).kind)
    throw new Error("Representação lógica incompatível.");
  if (
    state.kind === "order" &&
    (new Set(state.order).size !== 3 || new Set(state.eliminated).size !== state.eliminated.length)
  )
    throw new Error("Uma fila não repete personagens nem casos eliminados.");
  if (
    state.kind === "proof" &&
    (new Set(state.steps).size !== state.steps.length ||
      state.steps.some((step) => step >= proofScene(launch).cards.length))
  )
    throw new Error("Etapa de prova inexistente ou repetida.");
  return state;
}
export const allOrders = [
  ["Gato", "Panda", "Raposa"],
  ["Gato", "Raposa", "Panda"],
  ["Panda", "Gato", "Raposa"],
  ["Panda", "Raposa", "Gato"],
  ["Raposa", "Gato", "Panda"],
  ["Raposa", "Panda", "Gato"],
];
export function orderClues(launch: ToolLaunch): string[] {
  if (launch.mode === "necessario-ou-possivel") return ["Gato vem antes de Raposa."];
  return launch.variant === 0
    ? ["Gato vem antes de Panda.", "Raposa vem depois de Panda."]
    : ["Panda vem antes de Raposa.", "Gato vem depois de Raposa."];
}
export function orderValid(launch: ToolLaunch, order: readonly string[]) {
  return launch.mode === "necessario-ou-possivel"
    ? order.indexOf("Gato") < order.indexOf("Raposa")
    : launch.variant === 0
      ? order.indexOf("Gato") < order.indexOf("Panda") &&
        order.indexOf("Panda") < order.indexOf("Raposa")
      : order.indexOf("Panda") < order.indexOf("Raposa") &&
        order.indexOf("Raposa") < order.indexOf("Gato");
}
export function truthValue(launch: ToolLaunch, p: boolean, q: boolean, r: boolean) {
  switch (launch.mode) {
    case "conectivos-basicos":
      return launch.variant === 0 ? p && q : p || q;
    case "auto-referencia":
      return p === !p && q === p;
    case "encadear-implicacoes":
      return !((!p || q) && (!q || r)) || !p || r;
    case "tabela-logica":
      return (p || q) && !(p && q);
    case "conectivos-tabela-verdade":
      return !(p && q) === (!p || !q);
    case "implicacao-reciproca-contrapositiva":
      return (!p || q) === (q || !p);
    case "validade-falacias":
      return !((!p || q) && q) || p;
    case "verdade-mentira":
      return p === !q && q === (!p && !q);
    default:
      return !p || q;
  }
}
export function counterexample(launch: ToolLaunch, value: number) {
  if (launch.mode === "contraexemplos-primos") {
    let prime = value >= 2;
    for (let divisor = 2; divisor * divisor <= value; divisor++)
      if (value % divisor === 0) prime = false;
    const odd = value % 2 === 1;
    return {
      expression: `${value} é ${odd ? "ímpar" : "par"} e ${prime ? "primo" : "não primo"}`,
      valid: launch.variant === 0 ? odd && !prime : prime && !odd,
    };
  }
  if (launch.mode === "contraexemplos")
    return { expression: `${value}² = ${value * value}`, valid: value * value <= value };
  if (launch.mode === "negacao-e-contraexemplo")
    return {
      expression: `Resto por 2: ${value % 2}; resto por 4: ${value % 4}`,
      valid: value % 2 === 0 && value % 4 !== 0,
    };
  const result = value * value + (launch.variant === 0 ? value : -value) + 41;
  let divisor: number | null = null;
  for (let candidate = 2; candidate * candidate <= result; candidate++)
    if (result % candidate === 0) {
      divisor = candidate;
      break;
    }
  return {
    expression: `n² ${launch.variant === 0 ? "+" : "−"} n + 41 = ${result}${divisor === null ? " (primo)" : ` = ${divisor} × ${result / divisor}`}`,
    valid: divisor !== null,
  };
}
export function quantifierChoices(launch: ToolLaunch) {
  return launch.mode === "quantificadores"
    ? [
        "Nenhum aluno resolveu um problema",
        "Existe um aluno que não resolveu nenhum problema",
        "Todos resolveram todos os problemas",
        "Existe um problema que ninguém resolveu",
      ]
    : [
        "Nenhum aluno resolveu nenhum problema",
        "Todos resolveram pelo menos um problema",
        "Para cada aluno, existe um problema que ele não resolveu",
        "Existe um problema que ninguém resolveu",
      ];
}
export function summarizeLogic(launch: ToolLaunch, state: LogicState) {
  if (state.kind === "order")
    return `Pistas: ${orderClues(launch).join(" ")} Fila: ${state.order.join(" → ")}. ${state.eliminated.length} casos eliminados.`;
  if (state.kind === "truth")
    return `Linha escolhida: P = ${state.p ? "V" : "F"}; Q = ${state.q ? "V" : "F"}; R = ${state.r ? "V" : "F"}. Resultado da expressão: ${truthValue(launch, state.p, state.q, state.r) ? "V" : "F"}.`;
  if (state.kind === "counterexample")
    return `${logicDefinition(launch).title}. n = ${state.value}. ${counterexample(launch, state.value).expression}.`;
  if (state.kind === "quantifier")
    return `Negação escolhida: ${quantifierChoices(launch)[state.selected]}.`;
  const scene = proofScene(launch);
  return `${scene.claim} Etapas escolhidas: ${state.steps.map((step) => scene.cards[step]).join(" ")} Teste ilustrativo: ${scene.example(state.example)} A redação exige revisão por rubrica.`;
}
const deductionTool: ToolModule = {
  family: "L15",
  modes: Object.keys(logicDefinitions),
  parse: parseLogic,
  activity: (launch) => {
    const definition = logicDefinition(launch);
    const choices =
      definition.kind === "order"
        ? launch.mode === "necessario-ou-possivel"
          ? ["Necessário", "Possível, mas não necessário", "Impossível"]
          : ["Gato", "Panda", "Raposa"]
        : definition.kind === "truth"
          ? ["Verdadeiro", "Falso"]
          : definition.kind === "quantifier"
            ? quantifierChoices(launch)
            : undefined;
    const scene = definition.kind === "proof" ? proofScene(launch) : null;
    return activity({
      title: definition.title,
      prompt: `${definition.question}${scene ? ` ${scene.claim}` : ""}${launch.mode === "conectivos-basicos" ? ` Avalie P ${launch.variant === 0 ? "e" : "ou"} Q na linha selecionada.` : ""}${launch.mode === "conjectura-ou-teorema" ? ` Expressão: n² ${launch.variant === 0 ? "+" : "−"} n + 41.` : ""}${launch.mode === "contraexemplos-primos" ? (launch.variant === 0 ? " Afirmação: todo inteiro positivo ímpar é primo." : " Afirmação: todo número primo é ímpar.") : ""}`,
      initialState: logicInitial(launch),
      answerLabel: scene
        ? "Seu argumento (revise com a rubrica)"
        : definition.kind === "counterexample"
          ? "Valor de n"
          : "Sua conclusão",
      choices,
      rubric: scene?.rubric ?? [
        "Respeitar todas as pistas ou hipóteses",
        "Distinguir um caso de uma afirmação universal",
        "Justificar a conclusão",
      ],
    });
  },
  summarize: (launch, raw) => summarizeLogic(launch, parseLogic(launch, raw)),
  assess: (launch, raw, answer) => {
    const state = parseLogic(launch, raw);
    const summary = summarizeLogic(launch, state);
    if (state.kind === "proof") return openAssessment(summary, proofScene(launch).rubric);
    if (state.kind === "truth")
      return choiceAssessment(
        answer,
        truthValue(launch, state.p, state.q, state.r) ? "Verdadeiro" : "Falso",
        summary,
        "Confira os valores da expressão na linha escolhida. Uma tabela completa prova uma equivalência entre essas formas proposicionais; exemplos numéricos isolados não provam uma afirmação sobre todos os inteiros.",
      );
    if (state.kind === "quantifier") {
      const expected = quantifierChoices(launch)[launch.mode === "quantificadores" ? 1 : 2];
      if (!expected) throw new Error("Negação não definida.");
      return choiceAssessment(
        answer,
        expected,
        summary,
        "Negar “todo” exige uma exceção; negar “existe” exige que nenhum elemento satisfaça a propriedade. A ordem dos quantificadores importa.",
      );
    }
    if (state.kind === "counterexample") {
      if (!counterexample(launch, state.value).valid)
        return {
          correct: false,
          message:
            "O caso escolhido ainda satisfaz a afirmação. Para refutá-la, encontre um caso do domínio em que ela falha.",
          summary,
        };
      return numberAssessment(
        answer,
        state.value,
        summary,
        "Esse caso pertence ao domínio e contradiz a afirmação. Um contraexemplo basta para refutar o “todo”; vários exemplos favoráveis não bastariam para prová-lo.",
      );
    }
    if (launch.mode === "necessario-ou-possivel")
      return choiceAssessment(
        answer,
        "Possível, mas não necessário",
        summary,
        "Gato–Panda–Raposa satisfaz a frase, mas Panda–Gato–Raposa também respeita a pista e deixa Panda fora do meio.",
      );
    if (
      !orderValid(launch, state.order) ||
      state.eliminated.some((index) => {
        const order = allOrders[index];
        return order ? orderValid(launch, order) : true;
      })
    )
      return {
        correct: false,
        message:
          "A fila montada viola uma pista ou uma fila válida foi riscada. Confira cada pista antes de concluir.",
        summary,
      };
    return choiceAssessment(
      answer,
      state.order[1] ?? "",
      summary,
      "A fila respeita todas as pistas; o personagem indicado ocupa a posição central.",
    );
  },
};

function selectedLogicTool(launch: ToolLaunch) {
  return matchingTool.modes.includes(launch.mode)
    ? matchingTool
    : processTool.modes.includes(launch.mode)
      ? processTool
      : deductionTool;
}
export const logicTool: ToolModule = {
  family: "L15",
  modes: [...deductionTool.modes, ...processTool.modes, ...matchingTool.modes],
  activity: (launch) => selectedLogicTool(launch).activity(launch),
  parse: (launch, raw) => selectedLogicTool(launch).parse(launch, raw),
  summarize: (launch, raw) => selectedLogicTool(launch).summarize(launch, raw),
  assess: (launch, raw, answer) => selectedLogicTool(launch).assess(launch, raw, answer),
};
