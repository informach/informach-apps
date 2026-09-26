import { c, decimal, n, type SkillPack } from "../skill-factory";

/**
 * Polinômios: operações e valor numérico, raízes e fatoração, divisão e
 * teorema do resto, relações entre coeficientes e raízes, e identidades
 * algébricas em problemas. Trilha Canguru J.
 */
export const polinomios: SkillPack = {
  id: "polinomios",
  name: "Polinômios",
  domain: "canguru",
  lab: null,
  missions: [
    {
      title: "Grau, coeficientes e valor",
      objective:
        "Operar com polinômios, identificar grau e coeficientes e calcular valores numéricos.",
      introduction:
        "Um polinômio é uma soma de termos aₖxᵏ. O grau é o maior expoente com coeficiente não nulo. Somar e multiplicar seguem as regras usuais; o valor em x = 1 é a soma dos coeficientes.",
      specs: [
        n("valor", "Se p(x) = 2x³ − 3x + 1, quanto vale p(2)?", 11, "16 − 6 + 1 = 11.", {
          misreads: [{ value: 23, feedback: "Somou 3x em vez de subtrair." }],
        }),
        c(
          "valor",
          "O grau do polinômio (x² + 1)(x³ − x) é:",
          "5",
          ["6", "3"],
          "Graus se somam no produto: 2 + 3.",
          {
            feedback: ["6 multiplica os graus.", "3 é só o grau de um fator."],
          },
        ),
        n(
          "valor",
          "Qual é a soma dos coeficientes de (2x − 1)⁵?",
          1,
          "Basta calcular em x = 1: (2 − 1)⁵ = 1.",
          {
            misreads: [
              { value: 32, feedback: "32 é o coeficiente líder, 2⁵, não a soma dos coeficientes." },
            ],
          },
        ),
        c(
          "valor",
          "O coeficiente de x² em (x + 3)(x − 2)(x + 1) é:",
          "2",
          ["−6", "1"],
          "Soma dos termos constantes: 3 − 2 + 1 = 2.",
          {
            feedback: ["−6 é o termo constante.", "1 é o coeficiente de x³."],
          },
        ),
        n(
          "valor",
          "Se p(x) = x² + bx + 5 e p(1) = 9, quanto vale b?",
          3,
          "1 + b + 5 = 9 dá b = 3.",
          { misreads: [{ value: 4, feedback: "Esqueceu de somar o 1 de x²." }] },
        ),
        c(
          "valor",
          "O termo independente de (x² − 2x + 3)(x − 4) é:",
          "−12",
          ["12", "3"],
          "Produto dos termos independentes: 3 × (−4).",
          {
            feedback: [
              "O sinal: 3 × (−4) = −12.",
              "3 é o termo independente do primeiro fator só.",
            ],
          },
        ),
        n(
          "valor",
          "Se p(x) tem grau 4 e q(x) tem grau 4, qual é o maior grau possível de p(x) − q(x)?",
          4,
          "A subtração não aumenta o grau; pode até diminuir se os líderes coincidirem.",
          { misreads: [{ value: 8, feedback: "8 seria o grau do produto." }] },
        ),
        c(
          "valor",
          "Para p(x) = x³ − 6x² + 11x − 6, a soma dos coeficientes é zero. Isso significa que:",
          "x = 1 é raiz",
          ["x = 0 é raiz", "O polinômio é nulo"],
          "p(1) = soma dos coeficientes = 0.",
          {
            feedback: ["p(0) = −6, não zero.", "Só um valor é zero; o polinômio não é nulo."],
          },
        ),
      ],
    },
    {
      title: "Raízes e fatoração",
      objective: "Encontrar raízes por fatoração, produtos notáveis e teste de raízes racionais.",
      introduction:
        "Se p(a) = 0, então (x − a) divide p(x). Fatorar transforma uma equação em produtos de fatores simples. Raízes racionais de um polinômio de coeficientes inteiros são frações irredutíveis a/b com a dividindo o termo independente e b o coeficiente líder.",
      specs: [
        n(
          "raizes",
          "Quantas raízes reais distintas tem x³ − 4x = 0?",
          3,
          "x(x − 2)(x + 2) = 0: 0, 2 e −2.",
          { misreads: [{ value: 2, feedback: "Esqueceu a raiz x = 0." }] },
        ),
        c(
          "raizes",
          "As raízes de x² − 5x + 6 = 0 são:",
          "2 e 3",
          ["−2 e −3", "1 e 6"],
          "Soma 5, produto 6.",
          {
            feedback: ["−2 e −3 têm soma −5.", "1 e 6 têm soma 7."],
          },
        ),
        n(
          "raizes",
          "Dividindo x³ − 3x² + 4 por (x − 2), obtém-se um polinômio de grau 2. Qual é a soma das raízes desse quociente?",
          1,
          "x³ − 3x² + 4 = (x − 2)(x² − x − 2); as raízes do quociente são 2 e −1, com soma 1.",
          {
            misreads: [
              { value: 3, feedback: "3 é a soma das três raízes do polinômio original." },
              { value: -1, feedback: "−1 é só uma das raízes do quociente; a outra é 2." },
            ],
          },
        ),
        c(
          "raizes",
          "Quais são as possíveis raízes racionais de 2x³ + x² − 7x − 6?",
          "±1, ±2, ±3, ±6, ±1/2, ±3/2",
          ["±1, ±2, ±3, ±6 apenas", "Qualquer racional"],
          "O numerador divide 6 e o denominador divide 2.",
          {
            feedback: [
              "Faltam as frações com denominador 2.",
              "O teste restringe muito as candidatas.",
            ],
          },
        ),
        n(
          "raizes",
          "Qual é a raiz de x⁴ − 16 = 0 que é real e positiva?",
          2,
          "(x² − 4)(x² + 4) = 0; reais: ±2.",
          { misreads: [{ value: 4, feedback: "4 é x², não x." }] },
        ),
        c(
          "raizes",
          "Um polinômio de grau 3 com coeficientes reais:",
          "Tem pelo menos uma raiz real",
          ["Tem sempre três raízes reais distintas", "Pode não ter raiz real"],
          "Grau ímpar: para x muito negativo e muito positivo os valores têm sinais opostos, e o gráfico é contínuo, então cruza o eixo.",
          {
            feedback: ["x³ − x² tem raiz dupla em 0.", "Grau ímpar garante pelo menos uma."],
          },
        ),
        n(
          "raizes",
          "Se (x − 1)² divide p(x) = x³ + ax + b, quanto vale a? (Dica: as raízes são 1, 1 e r; como não há termo em x², a soma delas é 0.)",
          -3,
          "1 + 1 + r = 0 dá r = −2; a é a soma dos produtos dois a dois: 1 × 1 + 1 × (−2) + 1 × (−2) = −3.",
          { misreads: [{ value: 3, feedback: "O sinal: 1 − 2 − 2 = −3." }] },
        ),
        c(
          "raizes",
          "x² + 1 = 0 tem:",
          "Nenhuma raiz real",
          ["Raiz x = −1", "Raiz x = 1"],
          "x² ≥ 0 para todo real.",
          {
            feedback: ["(−1)² + 1 = 2 ≠ 0.", "1 + 1 = 2 ≠ 0."],
          },
        ),
      ],
    },
    {
      title: "Dividir e achar o resto",
      objective: "Dividir polinômios e usar o teorema do resto e a divisão por (x − a).",
      introduction:
        "Dividir p(x) por d(x) dá p = d·q + r com grau de r menor que o de d. O teorema do resto diz que o resto da divisão por (x − a) é p(a). O dispositivo de Briot-Ruffini organiza essa divisão.",
      specs: [
        n(
          "divisao",
          "Qual é o resto da divisão de x³ + 2x − 5 por x − 2?",
          7,
          "p(2) = 8 + 4 − 5 = 7.",
          { misreads: [{ value: -5, feedback: "−5 é p(0), o resto na divisão por x." }] },
        ),
        c(
          "divisao",
          "O resto da divisão de x¹⁰⁰ − 1 por x + 1 é:",
          "0",
          ["−2", "2"],
          "p(−1) = 1 − 1 = 0.",
          {
            feedback: ["−2 seria se o expoente fosse ímpar.", "2 não corresponde a p(−1)."],
          },
        ),
        n(
          "divisao",
          "Na divisão de 2x³ − 3x² + x − 4 por x − 1, qual é o resto?",
          -4,
          "p(1) = 2 − 3 + 1 − 4 = −4.",
          { misreads: [{ value: 4, feedback: "O sinal: a soma dos coeficientes é −4." }] },
        ),
        c(
          "divisao",
          "Se p(x) dividido por (x − 3) deixa resto 5, então:",
          "p(3) = 5",
          ["p(5) = 3", "3 é raiz de p"],
          "Teorema do resto.",
          {
            feedback: ["Trocou os papéis de 3 e 5.", "3 seria raiz se o resto fosse 0."],
          },
        ),
        n(
          "divisao",
          "Dividindo x² + 5x + 6 por x + 2, qual é o quociente avaliado em x = 0?",
          3,
          "x² + 5x + 6 = (x + 2)(x + 3); quociente x + 3, que em 0 vale 3.",
          { misreads: [{ value: 6, feedback: "6 é p(0), não o quociente em 0." }] },
        ),
        c(
          "divisao",
          "Um polinômio deixa resto 2 na divisão por x − 1 e resto 4 na divisão por x − 3. O resto na divisão por (x − 1)(x − 3) é:",
          "x + 1",
          ["6", "2x"],
          "Resto r(x) = ax + b com r(1) = 2 e r(3) = 4: a = 1, b = 1.",
          {
            feedback: [
              "Um resto constante não pode valer 2 em 1 e 4 em 3.",
              "2x dá 2 em 1, mas 6 em 3.",
            ],
          },
        ),
        n(
          "divisao",
          "Para que valor de k o polinômio x³ − kx + 6 é divisível por x − 2?",
          7,
          "p(2) = 8 − 2k + 6 = 0 dá k = 7.",
          { misreads: [{ value: -7, feedback: "O sinal: 14 − 2k = 0 dá k = 7." }] },
        ),
        c(
          "divisao",
          "O grau do resto na divisão de um polinômio por x² + 1 é:",
          "No máximo 1",
          ["Exatamente 2", "Sempre 0"],
          "O resto tem grau menor que o divisor.",
          {
            feedback: [
              "Se tivesse grau 2, ainda daria para dividir.",
              "Pode ser 0, mas em geral é 1.",
            ],
          },
        ),
      ],
    },
    {
      title: "Coeficientes e raízes",
      objective:
        "Usar as relações de Girard para soma e produto de raízes e montar polinômios a partir das raízes.",
      introduction:
        "Para ax² + bx + c, a soma das raízes é −b/a e o produto é c/a. Para ax³ + bx² + cx + d, soma −b/a, soma dos produtos dois a dois c/a, produto −d/a. Muitas perguntas sobre raízes se respondem sem achá-las.",
      specs: [
        n(
          "girard",
          "Se r e s são as raízes de x² − 7x + 10, quanto vale r² + s²?",
          29,
          "(r + s)² − 2rs = 49 − 20 = 29.",
          { misreads: [{ value: 49, feedback: "49 é (r + s)²; falta subtrair 2rs." }] },
        ),
        c(
          "girard",
          "O polinômio mônico de grau 2 com raízes 3 e −5 é:",
          "x² + 2x − 15",
          ["x² − 2x − 15", "x² + 2x + 15"],
          "Soma −2 (então +2x), produto −15.",
          {
            feedback: ["Soma das raízes é −2, então o coeficiente de x é +2.", "O produto é −15."],
          },
        ),
        n(
          "girard",
          "As raízes de x³ − 6x² + 11x − 6 são 1, 2 e 3. Qual é a soma dos produtos dois a dois?",
          11,
          "1×2 + 1×3 + 2×3 = 11, igual ao coeficiente de x.",
          { misreads: [{ value: 6, feedback: "6 é o produto das três raízes." }] },
        ),
        c(
          "girard",
          "Se as raízes de x² + px + q são inversas uma da outra, então:",
          "q = 1",
          ["p = 1", "p = q"],
          "Produto das raízes r × 1/r = 1 = q.",
          {
            feedback: [
              "p é menos a soma, que não fica determinada.",
              "Não há relação forçada entre p e q além de q = 1.",
            ],
          },
        ),
        n(
          "girard",
          "Uma raiz de x² − 8x + k é o triplo da outra. Quanto vale k?",
          12,
          "r + 3r = 8 dá r = 2; k = 2 × 6 = 12.",
          { misreads: [{ value: 16, feedback: "16 seria o produto de raízes iguais a 4." }] },
        ),
        c(
          "girard",
          "Se r e s são raízes de 2x² − 5x + 1, então 1/r + 1/s vale:",
          "5",
          ["5/2", "1/2"],
          "(r + s)/(rs) = (5/2)/(1/2) = 5.",
          {
            feedback: ["5/2 é a soma das raízes.", "1/2 é o produto."],
          },
        ),
        n(
          "girard",
          "As raízes de x³ − 7x² + 14x − 8 são r₁, r₂ e r₃, e uma delas é 2. Qual é o produto das outras duas?",
          4,
          "O produto das três raízes é 8; 8 ÷ 2 = 4. De fato, as raízes são 1, 2 e 4.",
          {
            misreads: [
              { value: 6, feedback: "6 seria a diferença 8 − 2, mas a relação é de produto." },
            ],
          },
        ),
        c(
          "girard",
          "Se um polinômio de grau 2 tem raízes reais de sinais opostos, então o produto c/a é:",
          "Negativo",
          ["Positivo", "Zero"],
          "Produto de números de sinais opostos é negativo.",
          {
            feedback: ["Positivo seria com raízes de mesmo sinal.", "Zero exigiria raiz nula."],
          },
        ),
      ],
    },
    {
      title: "Identidades para resolver",
      objective:
        "Usar produtos notáveis e identidades para simplificar, provar e resolver problemas numéricos.",
      introduction:
        "Identidades como a² − b² = (a − b)(a + b), (a + b)² = a² + 2ab + b² e a³ − b³ = (a − b)(a² + ab + b²) transformam contas difíceis em fáceis e provam propriedades de números.",
      estimatedMinutes: 18,
      specs: [
        n(
          "identidades",
          "Calcule 101² − 99² sem calculadora.",
          400,
          "(101 − 99)(101 + 99) = 2 × 200 = 400.",
          {
            misreads: [
              {
                value: 4,
                feedback: "4 é só (101 − 99)²; a diferença de quadrados usa também a soma.",
              },
            ],
          },
        ),
        c(
          "identidades",
          "Se x + 1/x = 5, então x² + 1/x² vale:",
          "23",
          ["25", "27"],
          "(x + 1/x)² = x² + 2 + 1/x² dá x² + 1/x² = 25 − 2.",
          {
            feedback: [
              "25 é o quadrado de 5; falta tirar o 2 do termo cruzado.",
              "27 soma 2 em vez de subtrair.",
            ],
          },
        ),
        n(
          "identidades",
          "Se a + b = 7 e ab = 10, quanto vale a³ + b³?",
          133,
          "(a + b)³ − 3ab(a + b) = 343 − 210 = 133.",
          { misreads: [{ value: 343, feedback: "343 é (a + b)³; falta subtrair 3ab(a + b)." }] },
        ),
        c(
          "identidades",
          "O número 2¹⁰ − 1 = 1.023 é divisível por:",
          "3 e 11 (e 31)",
          ["Só por primos maiores que 10", "2"],
          "2¹⁰ − 1 = (2⁵ − 1)(2⁵ + 1) = 31 × 33 = 31 × 3 × 11.",
          {
            feedback: ["A fatoração revela 3 e 11.", "É ímpar."],
          },
        ),
        n(
          "identidades",
          "Quanto vale 999 × 1.001? Digite o número sem pontos.",
          999999,
          "(1.000 − 1)(1.000 + 1) = 1.000.000 − 1.",
          { misreads: [{ value: 1000000, feedback: "Falta subtrair 1." }] },
        ),
        c(
          "identidades",
          "Para provar que n³ − n é múltiplo de 6 para todo inteiro n, fatora-se:",
          "n³ − n = (n − 1)n(n + 1)",
          ["n³ − n = n(n − 1)²", "n³ − n = n(n − 1)(n − 2)"],
          "n³ − n = n(n² − 1) = (n − 1)n(n + 1), produto de três consecutivos. Três consecutivos contêm um múltiplo de 2 e um de 3.",
          {
            feedback: [
              "n(n − 1)² = n³ − 2n² + n, que não é n³ − n; o certo é n² − 1 = (n − 1)(n + 1).",
              "n(n − 1)(n − 2) = n³ − 3n² + 2n, que não é n³ − n; os consecutivos certos são n − 1, n e n + 1.",
            ],
          },
        ),
        n(
          "identidades",
          "Se x − y = 3 e x² − y² = 27, quanto vale x + y?",
          9,
          "x² − y² = (x − y)(x + y) dá 27 = 3(x + y).",
          { misreads: [{ value: 24, feedback: "24 subtrai 3 de 27; a relação é de produto." }] },
        ),
        c(
          "identidades",
          "Qual expressão é sempre não negativa para reais a e b?",
          "a² − 2ab + b²",
          ["a² − b²", "a² + 2ab − b²"],
          "É (a − b)².",
          {
            feedback: [
              "a² − b² é negativo quando |a| < |b|.",
              "Não é um quadrado perfeito; por exemplo a = 0, b = 1 dá −1.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt:
      "Organize os passos para achar todas as raízes de um polinômio cúbico com coeficientes inteiros que tem uma raiz racional.",
    labels: [
      "Listar as candidatas a raiz racional (divisores do termo independente sobre divisores do líder)",
      "Testar candidatas até achar uma raiz a",
      "Dividir o polinômio por (x − a) para obter um quadrático",
      "Resolver o quadrático e reunir as raízes",
    ],
    explanation:
      "Uma raiz reduz o grau; o quadrático restante se resolve por fórmula ou fatoração.",
  },
  justification: {
    prompts: [
      "Explique por que o resto da divisão de p(x) por (x − a) é p(a).",
      "Explique por que a soma dos coeficientes de um polinômio é igual a p(1).",
      "Explique como calcular 101² − 99² de cabeça e por que funciona.",
    ],
    samples: [
      "Pela divisão, p(x) = (x − a)q(x) + r, com r constante porque o divisor tem grau 1. Substituindo x = a, o termo (a − a)q(a) some e fica p(a) = r. Então o resto é exatamente o valor do polinômio em a.",
      "Substituir x = 1 transforma cada termo aₖxᵏ em aₖ, porque 1 elevado a qualquer expoente é 1. Somando todos os termos, p(1) = a₀ + a₁ + ... + aₙ, que é a soma dos coeficientes.",
      "Uso a² − b² = (a − b)(a + b) com a = 101 e b = 99: (101 − 99)(101 + 99) = 2 × 200 = 400. Funciona porque expandir (a − b)(a + b) dá a² + ab − ab − b², e os termos do meio se cancelam.",
    ],
    focus: "a identidade que encurta a conta",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const a = 2 + (seed % 4);
      const b = 2 + (seed % 6);
      const cc = 1 + (seed % 9);
      const ponto = 1 + (seed % 3);
      const valor = a * ponto ** 3 + b * ponto + cc;
      return c(
        "resto-por-x-menos-a",
        `Qual é o resto da divisão de ${a}x³ + ${b}x + ${cc} por x − ${ponto}?`,
        `${valor}`,
        [`${valor - cc}`, String(valor - 2 * cc).replace("-", "−")],
        `Pelo teorema do resto, o resto é p(${ponto}) = ${a} × ${ponto}³ + ${b} × ${ponto} + ${cc} = ${valor}.`,
        {
          feedback: [
            "Esqueceu o termo independente ao avaliar.",
            "Trocou o sinal do termo independente ao avaliar.",
          ],
        },
      );
    }
    if (variant === 1) {
      const r1 = 1 + (seed % 6);
      // Raízes 2 e 5 já aparecem numa missão.
      const r2 = r1 === 2 && r1 + 1 + (seed % 5) === 5 ? 6 : r1 + 1 + (seed % 5);
      const soma = r1 + r2;
      const produto = r1 * r2;
      const quadrados = r1 * r1 + r2 * r2;
      return c(
        "soma-dos-quadrados-das-raizes",
        `Se r e s são as raízes de x² − ${soma}x + ${produto}, quanto vale r² + s²?`,
        `${quadrados}`,
        [`${soma * soma}`, `${soma * soma + 2 * produto}`],
        `(r + s)² − 2rs = ${soma}² − 2 × ${produto} = ${quadrados}.`,
        {
          feedback: ["Esse é (r + s)²; falta subtrair 2rs.", "Somou 2rs em vez de subtrair."],
        },
      );
    }
    const base = 10 * (5 + (seed % 10));
    const d = 1 + (seed % 4);
    const resultado = (base + d) ** 2 - (base - d) ** 2;
    return c(
      "diferenca-de-quadrados",
      `Sem calculadora, quanto vale ${base + d}² − ${base - d}²?`,
      decimal(resultado),
      [decimal((2 * d) ** 2), decimal(resultado / 2)],
      `(${base + d} − ${base - d})(${base + d} + ${base - d}) = ${2 * d} × ${2 * base} = ${decimal(resultado)}.`,
      {
        feedback: [
          "Usou só o quadrado da diferença; a identidade usa a diferença vezes a soma.",
          "Multiplicou a diferença pela base, e não pela soma, que é o dobro da base.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "polinomios",
    title: "A fórmula que economiza contas",
    prompt:
      "Escolha três contas grandes (como 48 × 52, 1.003², 75² − 25²) e mostre como identidades algébricas resolvem cada uma de cabeça. Depois invente uma conta em que a identidade não ajuda e explique por quê.",
    lab: null,
    steps: [
      "Para cada conta, escreva a identidade usada e a substituição feita.",
      "Confira o resultado por outro caminho.",
      "Apresente a conta em que nenhuma identidade simples ajuda e justifique.",
    ],
    rubric: [
      "Três contas resolvidas com a identidade nomeada (0–3)",
      "Conferência por outro caminho (0–2)",
      "Contraexemplo bem explicado (0–3)",
      "Clareza da escrita algébrica (0–2)",
    ],
  },
  homeSupport: [
    "Proponham uma conta como 29 × 31 e vejam quem chega primeiro usando 30² − 1.",
    "Conversem sobre por que um polinômio de grau 2 não pode ter três raízes: peçam para o estudante explicar com um gráfico.",
  ],
};
