import { c, decimal, n, type SkillPack, sobrescrito } from "../skill-factory";

/**
 * Indução introdutória: descobrir e conjecturar fórmulas, o passo indutivo,
 * somas e desigualdades, processos que se repetem e o cuidado com
 * conjecturas falsas. Trilha Canguru J.
 */
export const inducao: SkillPack = {
  id: "inducao",
  name: "Indução e generalização",
  domain: "canguru",
  lab: "bars",
  missions: [
    {
      title: "Do caso pequeno à conjectura",
      objective: "Calcular casos pequenos, organizar numa tabela e propor uma fórmula geral.",
      introduction:
        "Antes de provar, é preciso saber o que provar. Calcular casos pequenos e olhar as diferenças ou razões sugere a fórmula. A conjectura é uma hipótese: depois vem a prova.",
      specs: [
        n(
          "conjecturar",
          "A soma dos n primeiros números ímpares é 1, 4, 9, 16, ... Qual é a soma dos 20 primeiros ímpares?",
          400,
          "A soma dos n primeiros ímpares é n²: 20² = 400.",
          { misreads: [{ value: 39, feedback: "39 é o 20º ímpar, não a soma dos 20 primeiros." }] },
        ),
        c(
          "conjecturar",
          "Cortando uma pizza com 0, 1, 2, 3 e 4 cortes retos, o número máximo de pedaços é 1, 2, 4, 7 e 11. Para n cortes, a fórmula é:",
          "n(n + 1)/2 + 1",
          ["2ⁿ", "n²"],
          "As diferenças são 1, 2, 3, 4: cada corte novo acrescenta n pedaços.",
          {
            feedback: [
              "2ⁿ bate até n = 2, mas para n = 3 dá 8 e o máximo é 7.",
              "n² dá 9 para n = 3.",
            ],
          },
        ),
        n(
          "conjecturar",
          "Quantas diagonais tem um polígono convexo de n lados, para n = 6?",
          9,
          "n(n − 3)/2 = 6 × 3 ÷ 2 = 9.",
          { misreads: [{ value: 15, feedback: "15 é C(6, 2), que inclui os 6 lados." }] },
        ),
        c(
          "conjecturar",
          "Os números 1, 3, 6, 10, 15, ... (triangulares) têm fórmula:",
          "n(n + 1)/2",
          ["n²/2", "2n − 1"],
          "Diferenças 2, 3, 4, 5: somas de 1 até n.",
          {
            feedback: ["n²/2 dá 4,5 para n = 3.", "2n − 1 são os ímpares."],
          },
        ),
        n(
          "conjecturar",
          "Numa festa, cada pessoa cumprimenta todas as outras. Com 2, 3, 4 pessoas há 1, 3, 6 cumprimentos. Quantos há com 10 pessoas?",
          45,
          "n(n − 1)/2 = 10 × 9 ÷ 2 = 45.",
          { misreads: [{ value: 90, feedback: "90 conta cada cumprimento duas vezes." }] },
        ),
        c(
          "conjecturar",
          "A sequência 1, 2, 4, 8, 16 sugere 2ⁿ⁻¹. Em que casos a conjectura 'próximo termo é 32' pode falhar?",
          "Quando a regra geradora é outra, como o número máximo de regiões de um círculo com n pontos ligados, que dá 31 no sexto termo",
          ["Nunca; cinco termos bastam", "Só se a sequência for finita"],
          "Regras diferentes coincidem nos primeiros termos.",
          {
            feedback: ["Casos não determinam a regra.", "A regra é que decide, não o tamanho."],
          },
        ),
        n(
          "conjecturar",
          "A soma 1 + 2 + 4 + ... + 2ⁿ⁻¹ vale 1, 3, 7, 15, ... Quanto vale para n = 10?",
          1023,
          "2ⁿ − 1 = 1.024 − 1.",
          { misreads: [{ value: 1024, feedback: "1.024 é 2¹⁰; a soma é um a menos." }] },
        ),
        c(
          "conjecturar",
          "Depois de conjecturar uma fórmula a partir de 5 casos, o próximo passo correto é:",
          "Tentar provar para todo n, ou procurar um contraexemplo",
          ["Declarar a fórmula provada", "Testar mais 5 casos e declarar provada"],
          "Casos sugerem; provas confirmam.",
          {
            feedback: ["Cinco casos não provam.", "Dez casos também não."],
          },
        ),
      ],
    },
    {
      title: "O passo que puxa o próximo",
      objective: "Entender a estrutura da indução: base e passo indutivo.",
      introduction:
        "A indução prova uma afirmação P(n) para todo n ≥ 1 em dois passos: P(1) vale (base) e, se P(k) vale, então P(k + 1) vale (passo). Como dominós em fila: o primeiro cai e cada um derruba o seguinte.",
      specs: [
        c(
          "estrutura",
          "Numa prova por indução de que 1 + 2 + ... + n = n(n + 1)/2, a hipótese de indução é:",
          "1 + 2 + ... + k = k(k + 1)/2 para um certo k",
          ["A fórmula vale para todo n", "1 = 1 × 2/2"],
          "Supõe-se o caso k para provar o caso k + 1.",
          {
            feedback: [
              "Supor para todo n seria supor o que se quer provar.",
              "Isso é a base, não a hipótese de indução.",
            ],
          },
        ),
        n(
          "estrutura",
          "Na prova de 1 + 2 + ... + n = n(n + 1)/2, o passo indutivo soma (k + 1) aos dois lados. Se k = 9, que valor a hipótese fornece para a soma 1 + ... + 9?",
          45,
          "9 × 10 ÷ 2 = 45; somando 10 dá 55 = 10 × 11 ÷ 2.",
          {
            misreads: [
              { value: 55, feedback: "55 é a soma até 10; a hipótese é sobre a soma até 9." },
            ],
          },
        ),
        c(
          "estrutura",
          "Uma prova por indução sem o caso base:",
          "Não prova nada: o passo só transfere a verdade de k para k + 1, mas de onde ela começa?",
          ["Vale, porque o passo é o mais importante", "Vale se o passo for feito duas vezes"],
          "Exemplo: 'n = n + 1' passa de k para k + 1 e é falso.",
          {
            feedback: ["Sem base, nada garante P(1).", "Repetir o passo não cria a base."],
          },
        ),
        c(
          "estrutura",
          "Para provar que 2ⁿ > n para todo n ≥ 1, o passo indutivo usa 2ᵏ⁺¹ = 2 × 2ᵏ > 2k e depois:",
          "2k ≥ k + 1 para k ≥ 1",
          ["2k = k + 1", "k > k + 1"],
          "2k ≥ k + 1 equivale a k ≥ 1.",
          {
            feedback: ["2k = k + 1 só em k = 1.", "k > k + 1 é sempre falso."],
          },
        ),
        n(
          "estrutura",
          "Na prova por indução de que n³ − n é múltiplo de 6, escreve-se (k + 1)³ − (k + 1) = (k³ − k) + 3k² + 3k. Qual é o maior inteiro que divide 3k(k + 1) para todo k?",
          6,
          "k(k + 1) é par, então 3k(k + 1) é múltiplo de 6.",
          { misreads: [{ value: 3, feedback: "3 divide, mas k(k + 1) é par, então 6 divide." }] },
        ),
        c(
          "estrutura",
          "Qual afirmação é provada corretamente por indução com base n = 4?",
          "2ⁿ ≥ n² para n ≥ 4",
          ["2ⁿ ≥ n² para todo n ≥ 1", "n² ≥ 2ⁿ para n ≥ 4"],
          "Falha em n = 3 (8 < 9), vale a partir de 4 (16 = 16) e o passo funciona daí.",
          {
            feedback: ["Falha em n = 3.", "A desigualdade está invertida."],
          },
        ),
        c(
          "estrutura",
          "O 'passo indutivo' falho no falso argumento 'todos os cavalos têm a mesma cor' quebra em:",
          "k = 1 para k = 2: dois grupos de um cavalo não têm cavalo em comum",
          ["k = 100", "Na base"],
          "O argumento supõe sobreposição entre os grupos, que falha para k + 1 = 2.",
          {
            feedback: [
              "Para k grande a sobreposição existe; o furo é no início.",
              "A base (um cavalo) é verdadeira.",
            ],
          },
        ),
        n(
          "estrutura",
          "Para provar por indução que 3ⁿ ≥ 2n + 1 para n ≥ 1, verifica-se a base. Quanto vale 3¹ − (2 × 1 + 1)?",
          0,
          "3 − 3 = 0: a base vale com igualdade.",
          {
            misreads: [
              { value: 3, feedback: "3 é o lado esquerdo; a diferença com o direito é 0." },
            ],
          },
        ),
      ],
    },
    {
      title: "Somas e desigualdades",
      objective: "Provar fórmulas de somas e desigualdades por indução, manipulando o passo.",
      introduction:
        "Para somas, o passo é 'somar o próximo termo e reorganizar'. Para desigualdades, é 'usar a hipótese e depois uma desigualdade simples'. O trabalho está em escrever o lado direito de P(k + 1) e chegar nele.",
      specs: [
        n(
          "somas",
          "A fórmula 1² + 2² + ... + n² = n(n + 1)(2n + 1)/6 dá que valor para n = 5?",
          55,
          "5 × 6 × 11 ÷ 6 = 55. Conferindo: 1 + 4 + 9 + 16 + 25 = 55.",
          { misreads: [{ value: 30, feedback: "30 é a soma até 4." }] },
        ),
        c(
          "somas",
          "No passo indutivo de 1² + ... + n² = n(n + 1)(2n + 1)/6, soma-se (k + 1)² e deve-se chegar a:",
          "(k + 1)(k + 2)(2k + 3)/6",
          ["(k + 1)(k + 2)(2k + 1)/6", "k(k + 1)(2k + 3)/6"],
          "Substituindo n por k + 1: (k + 1)(k + 2)(2(k + 1) + 1)/6.",
          {
            feedback: [
              "2n + 1 com n = k + 1 dá 2k + 3.",
              "n(n + 1) com n = k + 1 dá (k + 1)(k + 2).",
            ],
          },
        ),
        n(
          "somas",
          "Calcule 1 × 2 + 2 × 3 + 3 × 4 + 4 × 5 e confira com a fórmula n(n + 1)(n + 2)/3. Qual é o valor?",
          40,
          "2 + 6 + 12 + 20 = 40; fórmula: 4 × 5 × 6 ÷ 3 = 40.",
          { misreads: [{ value: 20, feedback: "20 é só o último termo." }] },
        ),
        c(
          "somas",
          "Para provar 1/(1×2) + 1/(2×3) + ... + 1/(n(n+1)) = n/(n + 1), o passo usa:",
          "k/(k + 1) + 1/((k + 1)(k + 2)) = (k + 1)/(k + 2)",
          ["k/(k + 1) + 1/(k + 2) = (k + 1)/(k + 2)", "k/(k + 1) × 1/((k + 1)(k + 2))"],
          "Somando frações: (k(k + 2) + 1)/((k + 1)(k + 2)) = (k + 1)²/((k + 1)(k + 2)).",
          {
            feedback: [
              "O termo novo é 1/((k + 1)(k + 2)), não 1/(k + 2).",
              "O passo soma o próximo termo, não multiplica.",
            ],
          },
        ),
        n(
          "somas",
          "A desigualdade de Bernoulli diz (1 + x)ⁿ ≥ 1 + nx para x ≥ −1. Para x = 0,1 e n = 10, quanto vale o lado direito?",
          2,
          "1 + 10 × 0,1 = 2; o lado esquerdo é 1,1¹⁰ ≈ 2,59.",
          {
            misreads: [
              { value: 2.59, feedback: "2,59 é o lado esquerdo; a pergunta pede o lado direito." },
            ],
          },
        ),
        c(
          "somas",
          "Para provar n! > 2ⁿ para n ≥ 4, o passo indutivo escreve (k + 1)! = (k + 1) × k! e usa:",
          "k! > 2ᵏ e k + 1 > 2",
          ["k! > 2ᵏ e k + 1 = 2", "(k + 1)! = 2 × k!"],
          "(k + 1) × k! > 2 × 2ᵏ = 2ᵏ⁺¹.",
          {
            feedback: ["k + 1 ≥ 5 > 2, não igual.", "(k + 1)! não é 2 × k!."],
          },
        ),
        n("somas", "Qual é o menor n para o qual n! > 2ⁿ?", 4, "3! = 6 < 8; 4! = 24 > 16.", {
          misreads: [{ value: 3, feedback: "3! = 6 < 2³ = 8." }],
        }),
        c(
          "somas",
          "Numa prova por indução de uma desigualdade, depois de usar a hipótese costuma faltar:",
          "Uma desigualdade auxiliar simples que vale para k a partir da base",
          ["Nada; a hipótese fecha a prova", "Outra indução dentro da indução"],
          "Por exemplo, 2k ≥ k + 1 para k ≥ 1.",
          {
            feedback: [
              "A hipótese dá o lado de k; falta chegar ao lado de k + 1.",
              "Raramente é preciso outra indução.",
            ],
          },
        ),
      ],
    },
    {
      title: "Processos que se repetem",
      objective: "Aplicar indução a torres, tabuleiros, jogos e configurações.",
      introduction:
        "Indução também prova propriedades de objetos construídos passo a passo: torres de Hanói, coberturas de tabuleiro, grafos e jogos. O passo indutivo costuma ser 'reduza o caso k + 1 a um caso k mais algo'.",
      specs: [
        n(
          "processos",
          "Na torre de Hanói com n discos, o número mínimo de movimentos é 2ⁿ − 1. Quantos movimentos para 6 discos?",
          63,
          "2⁶ − 1 = 63.",
          { misreads: [{ value: 64, feedback: "64 é 2⁶; falta subtrair 1." }] },
        ),
        c(
          "processos",
          "A recorrência da torre de Hanói é Hₙ = 2Hₙ₋₁ + 1 porque:",
          "Move-se a torre de n − 1 discos, depois o maior, depois a torre de n − 1 de novo",
          ["Cada disco se move duas vezes", "O maior disco se move n vezes"],
          "Dois movimentos da torre menor e um do maior.",
          {
            feedback: ["Os discos pequenos se movem muitas vezes.", "O maior se move uma vez só."],
          },
        ),
        n(
          "processos",
          "Um tabuleiro 2ⁿ × 2ⁿ com uma casa removida pode ser coberto com peças em L de 3 casas. Para n = 3, quantas peças são usadas?",
          21,
          "(64 − 1) ÷ 3 = 21.",
          { misreads: [{ value: 64, feedback: "64 é o número de casas; a pergunta pede peças." }] },
        ),
        c(
          "processos",
          "Na prova de que um tabuleiro 2ⁿ × 2ⁿ menos uma casa é coberto por L-triminós, o passo indutivo:",
          "Divide em 4 quadrantes, coloca um L no centro cobrindo uma casa de cada um dos 3 quadrantes sem a casa removida, e aplica a hipótese a cada quadrante",
          ["Cobre linha por linha", "Usa que 4ⁿ − 1 é múltiplo de 3"],
          "Cada quadrante fica com exatamente uma casa faltando.",
          {
            feedback: [
              "Linha por linha não fecha em geral.",
              "A divisibilidade é necessária, mas não constrói a cobertura.",
            ],
          },
        ),
        n(
          "processos",
          "n retas em posição geral (nenhuma paralela, três nunca concorrentes) dividem o plano em 1 + n(n + 1)/2 regiões. Quantas regiões com 6 retas?",
          22,
          "1 + 21 = 22.",
          { misreads: [{ value: 21, feedback: "21 é n(n + 1)/2; falta somar a região inicial." }] },
        ),
        c(
          "processos",
          "Por que a k-ésima reta nova acrescenta exatamente k regiões?",
          "Ela cruza as k − 1 retas anteriores em k − 1 pontos, ficando dividida em k pedaços, e cada pedaço corta uma região em duas",
          ["Porque cada reta divide o plano em 2", "Porque k retas formam k triângulos"],
          "Cada pedaço da reta nova gera uma região nova.",
          {
            feedback: ["Isso só vale para a primeira reta.", "Não há relação com triângulos."],
          },
        ),
        n(
          "processos",
          "Num torneio em que cada par de n times joga uma vez, o número de jogos é n(n − 1)/2. Passando de 7 para 8 times, quantos jogos a mais?",
          7,
          "O time novo joga contra os 7 existentes; 28 − 21 = 7.",
          {
            misreads: [
              { value: 8, feedback: "O time novo joga contra os outros 7, não contra si mesmo." },
            ],
          },
        ),
        c(
          "processos",
          "A indução forte (usar todos os casos anteriores, não só o k) é o caminho natural para provar:",
          "Que todo inteiro maior que 1 é produto de primos",
          ["Que 1 + 2 + ... + n = n(n + 1)/2", "Que 2ⁿ > n"],
          "Um número composto n = ab usa a hipótese para a e b, ambos menores que n.",
          {
            feedback: ["Essa usa só o caso anterior.", "Essa também usa só o anterior."],
          },
        ),
      ],
    },
    {
      title: "Generalizar com cuidado",
      objective:
        "Distinguir conjectura de teorema, reconhecer falsos padrões e escolher quando a indução é o método.",
      introduction:
        "Generalizar é poderoso e perigoso. Padrões que valem em muitos casos podem falhar; a indução é o remédio quando há uma estrutura de 'próximo passo'. Sem essa estrutura, procure outro método.",
      estimatedMinutes: 18,
      specs: [
        c(
          "generalizar",
          "Ligando n pontos num círculo com todas as cordas, o número máximo de regiões (sem três cordas passando pelo mesmo ponto interior) é 1, 2, 4, 8, 16 para n = 1 a 5. Para n = 6 é:",
          "31",
          ["32", "64"],
          "A fórmula é C(n, 4) + C(n, 2) + 1 = 15 + 15 + 1 = 31.",
          {
            feedback: [
              "32 é a conjectura ingênua 2ⁿ⁻¹, que falha aqui.",
              "64 é 2⁶: segue o falso padrão e ainda erra o expoente.",
            ],
          },
        ),
        n(
          "generalizar",
          "A expressão n² + n + 41 parece ser sempre prima: vale para n = 0, 1, 2, ... Qual é o menor n positivo para o qual ela é composta?",
          40,
          "40² + 40 + 41 = 41 × 41.",
          { misreads: [{ value: 41, feedback: "41 também dá composto, mas 40 é o menor." }] },
        ),
        c(
          "generalizar",
          "A frase 'a fórmula vale para n de 1 a 1.000, logo vale sempre' é:",
          "Uma conjectura forte, não uma prova",
          ["Uma prova por indução", "Uma prova por exaustão"],
          "Exaustão só vale para conjuntos finitos.",
          {
            feedback: [
              "Indução exige o passo geral, não casos.",
              "Exaustão cobriria todos os casos, e aqui são infinitos.",
            ],
          },
        ),
        c(
          "generalizar",
          "Para provar que toda quantia de 8 ou mais reais pode ser paga com notas de 3 e 5, usando o passo de n − 3 para n (acrescentando uma nota de 3), quais casos base são necessários?",
          "8 = 3 + 5, 9 = 3 + 3 + 3 e 10 = 5 + 5",
          ["Só 8 = 3 + 5", "Só 9 = 3 + 3 + 3"],
          "Com o passo de 3, cada valor n ≥ 11 vem de n − 3; os três primeiros valores precisam ser verificados diretamente.",
          {
            feedback: [
              "Com passo de 3 em 3, só o 8 não alcança 9 e 10.",
              "Só o 9 não alcança 8 e 10.",
            ],
          },
        ),
        n(
          "generalizar",
          "Qual é o maior valor inteiro que NÃO pode ser pago com notas de 3 e 5?",
          7,
          "1, 2, 4, 7 não podem; a partir de 8 todos podem.",
          { misreads: [{ value: 4, feedback: "4 não pode, mas 7 também não e é maior." }] },
        ),
        c(
          "generalizar",
          "Quando a indução NÃO é o método natural?",
          "Quando a afirmação não é sobre inteiros sucessivos nem tem estrutura de 'próximo passo', como uma propriedade de todos os triângulos",
          ["Quando n é muito grande", "Quando a afirmação é uma desigualdade"],
          "Triângulos não vêm indexados por n.",
          {
            feedback: [
              "O tamanho de n não importa para a indução.",
              "Desigualdades se provam bem por indução.",
            ],
          },
        ),
        n(
          "generalizar",
          "Fermat conjecturou que 2 elevado a 2ⁿ, mais 1, é sempre primo; vale para n = 0 a 4. Para n = 5 o número é 4.294.967.297 = 641 × 6.700.417. Quantos casos verdadeiros seguidos precederam o primeiro contraexemplo?",
          5,
          "n = 0, 1, 2, 3, 4: cinco casos.",
          { misreads: [{ value: 4, feedback: "n começa em 0: são 5 casos." }] },
        ),
        c(
          "generalizar",
          "Depois de provar P(n) por indução, o que se pode afirmar?",
          "P(n) vale para todo n a partir da base, sem exceção",
          ["P(n) vale para n até onde testamos", "P(n) provavelmente vale"],
          "A indução é uma prova completa.",
          {
            feedback: [
              "A prova cobre todos os n, não só os testados.",
              "Não é probabilidade; é certeza.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Organize os passos de uma prova por indução.",
    labels: [
      "Enunciar claramente a afirmação P(n) e o n inicial",
      "Verificar o caso base",
      "Supor P(k) para um k qualquer a partir da base",
      "Provar P(k + 1) usando a hipótese e concluir",
    ],
    explanation:
      "Sem o enunciado preciso não se sabe o que supor; a base ancora e o passo propaga.",
  },
  justification: {
    prompts: [
      "Escreva o passo indutivo da prova de que 1 + 3 + 5 + ... + (2n − 1) = n².",
      "Explique com a imagem dos dominós por que base e passo juntos provam P(n) para todo n.",
      "Explique por que 'vale para n de 1 a 5' não prova uma fórmula, usando o exemplo das regiões do círculo.",
    ],
    samples: [
      "Suponha que 1 + 3 + ... + (2k − 1) = k². Somando o próximo ímpar, 2k + 1, dos dois lados: 1 + 3 + ... + (2k − 1) + (2k + 1) = k² + 2k + 1 = (k + 1)². Isso é exatamente a fórmula para n = k + 1. Com a base 1 = 1², a fórmula vale para todo n.",
      "Imagine uma fila infinita de dominós, um para cada n. O caso base derruba o primeiro. O passo indutivo garante que, sempre que um dominó cai, ele derruba o seguinte. Então o primeiro derruba o segundo, que derruba o terceiro, e assim por diante: nenhum fica em pé. Sem a base, nenhum cai; sem o passo, a queda para.",
      "Ligando n pontos de um círculo, o número máximo de regiões é 1, 2, 4, 8, 16 para n de 1 a 5, o que sugere 2ⁿ⁻¹. Mas para n = 6 o máximo é 31 regiões, não 32. Cinco casos formavam um padrão convincente e falso. Só uma prova, ou uma fórmula deduzida da estrutura, decide o caso geral.",
    ],
    focus: "a estrutura de base e passo da indução",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      // Os 20 primeiros ímpares já são uma missão.
      const n = 8 + (seed % 13) === 20 ? 21 : 8 + (seed % 13);
      const soma = n * n;
      return c(
        "soma-dos-impares",
        `A soma dos n primeiros números ímpares é n². Qual é a soma dos ${n} primeiros números ímpares?`,
        `${soma}`,
        [`${2 * n - 1}`, `${(n * (n + 1)) / 2}`],
        `${n}² = ${soma}. O ${n}º ímpar é ${2 * n - 1}, e a soma de todos até ele é ${soma}.`,
        {
          feedback: [
            "Esse é o último ímpar somado, não a soma.",
            "Essa é a soma de 1 até n, não dos ímpares.",
          ],
        },
      );
    }
    if (variant === 1) {
      // Seis discos já são uma missão.
      const n = 4 + (seed % 9) === 6 ? 13 : 4 + (seed % 9);
      const movimentos = 2 ** n - 1;
      return c(
        "torre-de-hanoi",
        `Na torre de Hanói, o número mínimo de movimentos para n discos é 2ⁿ − 1. Quantos movimentos são necessários para ${n} discos?`,
        decimal(movimentos),
        [decimal(2 ** n), decimal(2 * n - 1)],
        `2${sobrescrito(n)} − 1 = ${decimal(2 ** n)} − 1 = ${decimal(movimentos)}.`,
        {
          feedback: ["Esqueceu de subtrair 1.", "Usou 2n − 1 em vez de 2ⁿ − 1."],
        },
      );
    }
    // Seis retas já são uma missão.
    const n = 5 + (seed % 10) === 6 ? 15 : 5 + (seed % 10);
    const regioes = 1 + (n * (n + 1)) / 2;
    return c(
      "regioes-por-retas",
      `${n} retas em posição geral (sem paralelas e sem três passando pelo mesmo ponto) dividem o plano em quantas regiões?`,
      `${regioes}`,
      [`${regioes - 1}`, decimal(2 ** n)],
      `Cada reta nova acrescenta tantas regiões quanto seu número de ordem: 1 + (1 + 2 + ... + ${n}) = 1 + ${(n * (n + 1)) / 2} = ${regioes}.`,
      {
        feedback: [
          "Esqueceu a região inicial, antes da primeira reta.",
          "2ⁿ supõe que cada reta nova corta todas as regiões em duas; a k-ésima reta só atravessa k regiões.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "inducao",
    title: "Uma conjectura, uma prova, um contraexemplo",
    prompt:
      "Escolha uma sequência gerada por uma regra geométrica ou combinatória (regiões, diagonais, cortes). Calcule os cinco primeiros casos, conjecture a fórmula, prove por indução se conseguir e, se não conseguir, procure um contraexemplo.",
    lab: "bars",
    steps: [
      "Registre os cinco primeiros casos com desenhos ou tabelas e proponha uma fórmula.",
      "Tente escrever base e passo indutivo para a fórmula.",
      "Se o passo não fechar, calcule o sexto caso e discuta se a conjectura sobreviveu.",
    ],
    rubric: [
      "Casos corretos e conjectura formulada com clareza (0–3)",
      "Base e passo escritos, ou razão explícita de por que o passo não fecha (0–4)",
      "Sexto caso e discussão da conjectura (0–2)",
      "Escrita clara (0–1)",
    ],
  },
  homeSupport: [
    "Montem uma fila de dominós e conversem sobre o que é preciso para todos caírem: o primeiro empurrado e cada um alcançar o seguinte.",
    "Peçam para o estudante prever o próximo termo de uma sequência e, depois, explicar por que a previsão poderia estar errada.",
  ],
};
