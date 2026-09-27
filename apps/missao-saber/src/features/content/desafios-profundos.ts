/**
 * Desafios profundos, um por habilidade.
 *
 * A página do laboratório trazia um único desafio escrito à mão no JSX — "Uma
 * borda, muitas possibilidades" — para um catálogo de 61 missões e doze
 * habilidades. Aqui ele vira conteúdo, e cada habilidade ganha o seu.
 *
 * Formato herdado do desafio original, porque ele já estava certo: 20–30
 * minutos, pausável, três passos que pedem exemplo → explicação →
 * contraexemplo, e uma rubrica de autoavaliação com faixas de pontos. A rubrica
 * é formativa: nada aqui é corrigido automaticamente, e o caderno continua
 * sendo o lugar da explicação escrita.
 */
import { skillPacks } from "./skills";

export type DeepChallenge = {
  skillId: string;
  title: string;
  /** A investigação, em uma ou duas frases. */
  prompt: string;
  /** Laboratório que ajuda a representar a ideia, quando existe um. */
  lab: "bars" | "grid" | "groups" | null;
  steps: [string, string, string];
  /** Critérios com faixa de pontos, para autoavaliação. */
  rubric: [string, string, string, string];
};

export const deepChallenges: Readonly<Record<string, DeepChallenge>> = {
  fracoes: {
    skillId: "fracoes",
    title: "Quando a metade não é a metade",
    prompt:
      "Encontre duas situações em que “metade” significa quantidades diferentes. Depois explique o que muda de uma para a outra.",
    lab: "bars",
    steps: [
      "Registre dois exemplos com os valores de cada inteiro de referência.",
      "Explique o que a metade está medindo em cada caso.",
      "Procure um exemplo em que as duas metades dão o mesmo número e diga por quê.",
    ],
    rubric: [
      "Exemplos válidos e diferentes entre si (0–2)",
      "Inteiro de referência identificado em cada um (0–3)",
      "Explicação de por que o mesmo nome dá valores diferentes (0–3)",
      "Tentativa de enunciar uma regra geral (0–2)",
    ],
  },
  porcentagem: {
    skillId: "porcentagem",
    title: "Dois descontos e uma armadilha",
    prompt:
      "Investigue se 20% e depois 10% é igual a 30% de uma vez. Depois descubra se existe alguma ordem que muda o resultado.",
    lab: "bars",
    steps: [
      "Compare os dois caminhos com um mesmo valor inicial e anote os resultados.",
      "Explique sobre qual valor cada porcentagem foi aplicada.",
      "Troque a ordem dos dois descontos e diga se o final muda.",
    ],
    rubric: [
      "Comparação feita com o mesmo valor inicial (0–2)",
      "Base de cada porcentagem identificada (0–3)",
      "Explicação de por que a soma direta falha (0–3)",
      "Conclusão sobre a troca de ordem (0–2)",
    ],
  },
  precos: {
    skillId: "precos",
    title: "A embalagem maior compensa sempre?",
    prompt:
      "Encontre um caso em que a embalagem maior sai mais cara por unidade. Depois descreva o que faz isso acontecer.",
    lab: "bars",
    steps: [
      "Escolha dois tamanhos do mesmo produto e calcule o preço por unidade.",
      "Explique por que o total maior pode ser o pior negócio.",
      "Procure um caso em que a maior realmente compensa e compare.",
    ],
    rubric: [
      "Dois tamanhos comparáveis registrados (0–2)",
      "Preço por unidade calculado corretamente (0–3)",
      "Explicação do que torna um caso melhor que o outro (0–3)",
      "Critério próprio de decisão enunciado (0–2)",
    ],
  },
  orcamento: {
    skillId: "orcamento",
    title: "A meta que cabe no mês",
    prompt:
      "Monte duas formas de juntar o mesmo valor em prazos diferentes e descubra o que muda para quem guarda.",
    lab: "bars",
    steps: [
      "Escolha uma meta e escreva dois planos com aportes diferentes.",
      "Explique o que acontece com o prazo quando o aporte cai pela metade.",
      "Inclua um imprevisto no meio do plano e ajuste o cálculo.",
    ],
    rubric: [
      "Dois planos completos e comparáveis (0–2)",
      "Relação entre aporte e prazo demonstrada (0–3)",
      "Ajuste do imprevisto com conta refeita (0–3)",
      "Escolha justificada entre os planos (0–2)",
    ],
  },
  medidas: {
    skillId: "medidas",
    title: "Uma borda, muitas possibilidades",
    prompt:
      "Na malha, construa duas figuras de mesma área e perímetros diferentes. Depois tente manter o perímetro e mudar a área.",
    lab: "grid",
    steps: [
      "Registre dois exemplos e suas medidas.",
      "Explique por que lados compartilhados mudam o resultado.",
      "Procure um exemplo que contrarie sua primeira ideia.",
    ],
    rubric: [
      "Exemplos válidos (0–2)",
      "Contagem verificável (0–3)",
      "Explicação dos lados compartilhados (0–3)",
      "Tentativa de generalização (0–2)",
    ],
  },
  simetria: {
    skillId: "simetria",
    title: "Quantos eixos cabem numa figura",
    prompt:
      "Monte figuras na malha com exatamente um, dois e nenhum eixo de simetria. Depois descubra o que decide essa quantidade.",
    lab: "grid",
    steps: [
      "Construa e registre as três figuras pedidas.",
      "Explique como você testou cada eixo sem recortar nada.",
      "Tente uma figura com quatro eixos e diga o que ela precisa ter.",
    ],
    rubric: [
      "As três figuras construídas (0–2)",
      "Método de verificação descrito (0–3)",
      "Explicação do que cria um eixo (0–3)",
      "Conclusão sobre a figura de quatro eixos (0–2)",
    ],
  },
  contagem: {
    skillId: "contagem",
    title: "Contar sem repetir e sem esquecer",
    prompt:
      "Organize todas as combinações de três escolhas e encontre um jeito de ter certeza de que nenhuma ficou de fora.",
    lab: "groups",
    steps: [
      "Liste as combinações usando alguma ordem fixa.",
      "Explique por que a sua ordem garante que nada se repete.",
      "Aumente uma das escolhas e preveja o novo total antes de contar.",
    ],
    rubric: [
      "Lista completa e sem repetições (0–2)",
      "Ordem de listagem explicada (0–3)",
      "Justificativa de que nada ficou de fora (0–3)",
      "Previsão do novo total conferida (0–2)",
    ],
  },
  gavetas: {
    skillId: "gavetas",
    title: "O número que obriga a repetir",
    prompt:
      "Descubra a menor quantidade de peças que obriga alguma caixa a receber duas. Depois explique por que uma a menos não obriga.",
    lab: "groups",
    steps: [
      "Distribua as peças tentando evitar a repetição o máximo possível.",
      "Explique qual é a melhor distribuição possível e por quê.",
      "Refaça com um número diferente de caixas e compare.",
    ],
    rubric: [
      "Distribuição sem repetição encontrada (0–2)",
      "Melhor caso justificado (0–3)",
      "Explicação de por que a peça seguinte obriga (0–3)",
      "Regra escrita para qualquer número de caixas (0–2)",
    ],
  },
  probabilidade: {
    skillId: "probabilidade",
    title: "O que a previsão promete e o que não promete",
    prompt:
      "Compare o que o modelo prevê com o que acontece em poucas repetições. Depois descubra o que muda com muitas.",
    lab: "groups",
    steps: [
      "Anote sua previsão antes de qualquer resultado.",
      "Compare a previsão com uma quantidade pequena de repetições.",
      "Explique o que você esperaria com dez vezes mais repetições.",
    ],
    rubric: [
      "Previsão registrada antes do resultado (0–2)",
      "Comparação honesta com o observado (0–3)",
      "Explicação da diferença entre poucas e muitas repetições (0–3)",
      "Conclusão sobre o que o modelo não promete (0–2)",
    ],
  },
  paridade: {
    skillId: "paridade",
    title: "O resto que não muda",
    prompt:
      "Investigue o que acontece com o resto de uma divisão quando você soma sempre o mesmo número. Depois use isso para prever um caso distante.",
    lab: "groups",
    steps: [
      "Monte uma sequência somando sempre o mesmo valor e anote os restos.",
      "Explique o padrão que aparece nos restos.",
      "Use o padrão para prever um termo distante e confira.",
    ],
    rubric: [
      "Sequência e restos registrados (0–2)",
      "Padrão descrito com clareza (0–3)",
      "Previsão feita antes da conferência (0–3)",
      "Explicação de por que o padrão se repete (0–2)",
    ],
  },
  padroes: {
    skillId: "padroes",
    title: "Da figura para a fórmula",
    prompt:
      "Construa uma sequência de figuras que cresce sempre do mesmo jeito e descreva a figura de posição dez sem montá-la.",
    lab: "grid",
    steps: [
      "Monte as três primeiras figuras e conte as peças de cada uma.",
      "Descreva em palavras o que é somado de uma figura para a seguinte.",
      "Preveja a décima figura e confira a previsão em uma delas.",
    ],
    rubric: [
      "Três figuras construídas e contadas (0–2)",
      "Regra de crescimento descrita (0–3)",
      "Previsão feita sem montar a figura (0–3)",
      "Conferência da previsão registrada (0–2)",
    ],
  },
  logica: {
    skillId: "logica",
    title: "Um contraexemplo vale mais que dez acertos",
    prompt:
      "Enuncie uma afirmação que pareça verdadeira e procure um caso que a derrube. Depois conserte a afirmação.",
    lab: null,
    steps: [
      "Escreva a afirmação e três casos em que ela funciona.",
      "Procure um caso em que ela falha e registre.",
      "Reescreva a afirmação para que o contraexemplo deixe de derrubá-la.",
    ],
    rubric: [
      "Afirmação clara e testável (0–2)",
      "Casos favoráveis registrados (0–3)",
      "Contraexemplo válido encontrado ou busca documentada (0–3)",
      "Afirmação corrigida e ainda interessante (0–2)",
    ],
  },
};

export function deepChallengeFor(skillId: string) {
  return deepChallenges[skillId] ?? skillPacks.find((pack) => pack.id === skillId)?.deepChallenge;
}
