/**
 * Golden dataset para o `runEvals` script. Cada entrada descreve uma chamada
 * realista de IA e o que se espera observar no output do `recipeParser` /
 * `recipeParserVision`.
 *
 * Edição:
 *  - Acrescente novos casos sem remover os antigos (regressão se mantém).
 *  - Quando trocar `expected`, atualize o baseline com `pnpm --filter
 *    @informach/cozya eval -- --snapshot` num momento que se esteja confiante
 *    no estado atual do parser.
 *  - Imagens: as 4 entradas `kind: "image"` apontam para arquivos em
 *    `./fixtures/`; o runner converte para data URL antes de chamar o vision
 *    agent. Comece adicionando 4 fotos pequenas (< 200 KB cada) representativas
 *    do que usuários reais mandam (foto de livro, manuscrito, screenshot de
 *    receita).
 */

export type DatasetEntryKind = "text" | "voice" | "image" | "prompt";

export type DatasetExpected = {
  isValidRecipe?: boolean;
  /** Substrings que devem aparecer em `output.ingredients` (case-insensitive). */
  mustContainIngredients?: string[];
  /** Substrings que devem aparecer em `output.preparation` (case-insensitive). */
  mustMentionInPreparation?: string[];
  /** Quando `true`, exige `output.name` não-nulo. */
  expectsName?: boolean;
};

export type DatasetEntry = {
  id: string;
  kind: DatasetEntryKind;
  /**
   * Para `text`/`voice`/`prompt`: conteúdo direto. Para `image`: caminho
   * relativo a `./fixtures/`. Mantemos string para que o dataset seja
   * inteiramente serializável em JSON (útil em diagnóstico).
   */
  input: string;
  expected: DatasetExpected;
  /** Notas humanas — não usadas pelo runner, ajudam quem revisa. */
  notes?: string;
};

export const DATASET: readonly DatasetEntry[] = [
  // ───── Texto colado (5) ─────
  {
    id: "text-001-bolo-cenoura-blog",
    kind: "text",
    input: [
      "Bolo de Cenoura Simples",
      "",
      "Ingredientes:",
      "- 3 cenouras médias",
      "- 4 ovos",
      "- 1 xícara de óleo",
      "- 2 xícaras de açúcar",
      "- 2 xícaras e meia de farinha de trigo",
      "- 1 colher de sopa de fermento",
      "",
      "Modo de preparo:",
      "Bata no liquidificador as cenouras, ovos e óleo. Em uma tigela, junte com o açúcar e a farinha. Adicione o fermento por último, mexa devagar e leve ao forno preaquecido a 180°C por 40 minutos.",
    ].join("\n"),
    expected: {
      isValidRecipe: true,
      expectsName: true,
      mustContainIngredients: ["cenoura", "ovos", "óleo", "açúcar", "farinha", "fermento"],
      mustMentionInPreparation: ["liquidificador", "forno"],
    },
  },
  {
    id: "text-002-feijoada-livro",
    kind: "text",
    input: [
      "FEIJOADA TRADICIONAL",
      "",
      "Ingredientes (8 porções):",
      "500 g feijão preto",
      "300 g costela salgada",
      "200 g paio",
      "200 g linguiça calabresa",
      "150 g bacon em cubos",
      "1 cebola grande picada",
      "4 dentes de alho",
      "2 folhas de louro",
      "Sal a gosto",
      "",
      "Modo:",
      "Deixar o feijão e a costela de molho na véspera trocando a água. No dia, cozinhar o feijão com louro até amaciar. Refogar à parte cebola e alho com bacon, juntar paio e calabresa picados. Misturar tudo na panela do feijão, ajustar sal e cozinhar mais 30 minutos em fogo baixo.",
    ].join("\n"),
    expected: {
      isValidRecipe: true,
      expectsName: true,
      mustContainIngredients: ["feijão", "costela", "paio", "calabresa", "bacon", "cebola", "alho"],
      mustMentionInPreparation: ["molho", "cozinhar"],
    },
  },
  {
    id: "text-003-suco-detox-blog-curto",
    kind: "text",
    input:
      "Suco verde detox. Bata no liquidificador 1 maçã, 1 folha de couve, suco de meio limão, 1 pedaço de gengibre e 200ml de água. Coe e sirva gelado.",
    expected: {
      isValidRecipe: true,
      expectsName: true,
      mustContainIngredients: ["maçã", "couve", "limão", "gengibre", "água"],
      mustMentionInPreparation: ["liquidificador"],
    },
  },
  {
    id: "text-004-mensagem-nao-receita",
    kind: "text",
    input:
      "Oi pessoal, alguém viu o cachorro do vizinho hoje? Estou preocupado porque ele costuma estar no portão.",
    expected: { isValidRecipe: false },
    notes: "Mensagem aleatória — agent deve recusar como não-receita.",
  },
  {
    id: "text-005-instagram-pao-queijo",
    kind: "text",
    input: [
      "🧀 PÃO DE QUEIJO MINEIRO 🧀",
      "",
      "Já fizeram? Receita da minha avó 😍",
      "",
      "👇 Anota aí:",
      "- 500g polvilho azedo",
      "- 1 xícara de leite",
      "- 1/2 xícara de óleo",
      "- 2 ovos",
      "- 200g queijo minas curado ralado",
      "- sal a gosto",
      "",
      "Ferve o leite com o óleo e escalda o polvilho. Deixa esfriar, junta os ovos e o queijo, sova. Faz bolinhas e leva ao forno 200°C por 25min ✨",
    ].join("\n"),
    expected: {
      isValidRecipe: true,
      expectsName: true,
      mustContainIngredients: ["polvilho", "leite", "ovos", "queijo"],
      mustMentionInPreparation: ["forno"],
    },
    notes: "Texto com emojis e ruído — agent deve normalizar (sem markdown/emoji nos campos).",
  },

  // ───── Transcrição de voz (3) ─────
  {
    id: "voice-001-bolo-fuba-mae",
    kind: "voice",
    input:
      "Então a receita do bolo de fubá da minha mãe é assim, você pega duas xícaras de fubá, uma xícara de farinha de trigo, três ovos, uma xícara de óleo, duas xícaras de leite e uma xícara e meia de açúcar e uma colher de sopa de fermento. Bate tudo no liquidificador menos o fermento. Adiciona o fermento no final mexendo devagar e leva ao forno médio uns 40 minutos.",
    expected: {
      isValidRecipe: true,
      expectsName: true,
      mustContainIngredients: ["fubá", "farinha", "ovos", "óleo", "leite", "açúcar", "fermento"],
      mustMentionInPreparation: ["liquidificador", "forno"],
    },
  },
  {
    id: "voice-002-omelete-rapida-erros-transcricao",
    kind: "voice",
    input:
      "Omelete rápida pro almoço. Bati três ovo numa tijela com sal e pimenta do reino, uma colhe de chá de leite, joguei numa frigideira quente com manteiga, esperei dourar dos dois lado e tava pronto.",
    expected: {
      isValidRecipe: true,
      expectsName: true,
      mustContainIngredients: ["ovo", "sal", "pimenta", "leite", "manteiga"],
      mustMentionInPreparation: ["frigideira"],
    },
    notes:
      "Erros típicos de Whisper PT-BR (concordância) — agent deve preservar conteúdo, não corrigir.",
  },
  {
    id: "voice-003-conversa-cozinhar-vagamente",
    kind: "voice",
    input:
      "Cara hoje tá frio demais, queria comer alguma coisa quente. Sopa, sei lá. Não sei se faço.",
    expected: { isValidRecipe: false },
    notes: "Cogitação sem ingredientes nem preparo — agent deve recusar.",
  },

  // ───── Imagens (4) — placeholders, fixtures populadas pelo usuário ─────
  {
    id: "image-001-receita-livro",
    kind: "image",
    input: "fixtures/image-001-receita-livro.jpg",
    expected: { isValidRecipe: true, expectsName: true },
    notes:
      "Sugerido: foto de receita impressa em livro de culinária (panqueca, bolo simples, etc.). Adicione manualmente em fixtures/.",
  },
  {
    id: "image-002-manuscrito-caderno",
    kind: "image",
    input: "fixtures/image-002-manuscrito-caderno.jpg",
    expected: { isValidRecipe: true, expectsName: true },
    notes: "Sugerido: receita escrita à mão em caderno (caligrafia legível).",
  },
  {
    id: "image-003-screenshot-blog",
    kind: "image",
    input: "fixtures/image-003-screenshot-blog.png",
    expected: { isValidRecipe: true, expectsName: true },
    notes: "Sugerido: screenshot de receita em blog (Panelinha, Tudo Gostoso).",
  },
  {
    id: "image-004-foto-paisagem-nao-receita",
    kind: "image",
    input: "fixtures/image-004-foto-paisagem.jpg",
    expected: { isValidRecipe: false },
    notes: "Sugerido: foto sem texto culinário (paisagem, animal, selfie). Agent deve recusar.",
  },

  // ───── Research-from-prompt (2) ─────
  {
    id: "prompt-001-bolo-cenoura-classico",
    kind: "prompt",
    input: "bolo de cenoura clássico com cobertura de chocolate",
    expected: {
      isValidRecipe: true,
      expectsName: true,
      mustContainIngredients: ["cenoura", "ovos", "farinha", "açúcar", "fermento", "chocolate"],
    },
  },
  {
    id: "prompt-002-torta-morango-chantilly",
    kind: "prompt",
    input: "torta de morango com chantilly e biscoito champagne",
    expected: {
      isValidRecipe: true,
      expectsName: true,
      mustContainIngredients: ["morango", "chantilly", "biscoito"],
    },
  },
];

/**
 * Helper para o runner — agrupa entradas por tipo, útil para distribuir
 * paralelismo (vision é mais caro/lento que text).
 */
export function groupByKind(
  entries: readonly DatasetEntry[],
): Record<DatasetEntryKind, DatasetEntry[]> {
  return entries.reduce(
    (acc, e) => {
      acc[e.kind].push(e);
      return acc;
    },
    { text: [], voice: [], image: [], prompt: [] } as Record<DatasetEntryKind, DatasetEntry[]>,
  );
}
