import { c, n, type SkillPack } from "../skill-factory";

/**
 * Funções: ler e construir relações entre grandezas, funções afins e
 * quadráticas, gráficos, composição e inversa, e modelagem de situações.
 * Trilhas OBMEP N3 e Canguru J.
 */
export const funcoes: SkillPack = {
  id: "funcoes",
  name: "Funções e gráficos",
  domain: "common",
  lab: "grid",
  missions: [
    {
      title: "Uma regra, muitos valores",
      objective: "Avaliar funções, ler domínio e imagem e reconhecer quando uma relação é função.",
      free: true,
      introduction:
        "Uma função associa a cada entrada exatamente uma saída. Avaliar é substituir; o domínio é o conjunto das entradas permitidas e a imagem é o conjunto das saídas que de fato aparecem.",
      specs: [
        n("avaliar", "Se f(x) = 3x − 5, quanto vale f(4)?", 7, "3 × 4 − 5 = 7.", {
          misreads: [{ value: 17, feedback: "Somou 5 em vez de subtrair." }],
        }),
        c(
          "avaliar",
          "Se g(x) = x² − 2x, então g(−3) vale:",
          "15",
          ["3", "−15"],
          "(−3)² − 2 × (−3) = 9 + 6 = 15.",
          {
            feedback: [
              "3 usou (−3)² = 9 e −2 × 3 = −6 com sinal errado.",
              "−15 errou dois sinais: usou (−3)² = −9 e −2 × (−3) = −6.",
            ],
          },
        ),
        n(
          "avaliar",
          "Se f(x) = 2x + 1, para qual valor de x temos f(x) = 15?",
          7,
          "2x + 1 = 15 dá 2x = 14, x = 7.",
          { misreads: [{ value: 31, feedback: "Calculou f(15) em vez de resolver f(x) = 15." }] },
        ),
        c(
          "funcao-ou-nao",
          "Qual destas relações NÃO é uma função de x?",
          "A relação que associa a cada x os dois números y com y² = x, para x > 0",
          ["y = x²", "y = |x|"],
          "Para x = 4, a relação dá y = 2 e y = −2: duas saídas para uma entrada.",
          {
            feedback: [
              "y = x² dá uma única saída para cada x.",
              "y = |x| dá uma única saída para cada x.",
            ],
          },
        ),
        n(
          "dominio-imagem",
          "Para f(x) = 1/(x − 3), qual é o único valor real que não pode ser entrada?",
          3,
          "O denominador não pode ser zero: x ≠ 3.",
          {
            misreads: [
              { value: 0, feedback: "0 é uma entrada válida: f(0) = −1/3. O problema é x = 3." },
            ],
          },
        ),
        c(
          "dominio-imagem",
          "A imagem da função f(x) = x² + 1, com x real, é:",
          "Todos os reais maiores ou iguais a 1",
          ["Todos os reais", "Todos os reais positivos"],
          "x² ≥ 0, então x² + 1 ≥ 1, e 1 é atingido em x = 0.",
          {
            feedback: [
              "Valores abaixo de 1 nunca são atingidos.",
              "Positivos entre 0 e 1 não são atingidos.",
            ],
          },
        ),
        n(
          "avaliar",
          "Se f(x) = x² e g(x) = x + 2, quanto vale f(g(1))?",
          9,
          "g(1) = 3; f(3) = 9.",
          {
            misreads: [
              { value: 3, feedback: "3 é g(f(1)) = 1 + 2; a ordem pedida é f depois de g." },
            ],
          },
        ),
        c(
          "dominio-imagem",
          "Uma função f tem f(1) = 4, f(2) = 4 e f(3) = 5. É correto afirmar que:",
          "f não é injetora, porque duas entradas diferentes têm a mesma saída",
          ["f não é uma função, porque repete a saída 4", "f é injetora"],
          "Repetir saída é permitido em função; injetora é que não pode.",
          {
            feedback: [
              "Função pode repetir saída; o que não pode é uma entrada ter duas saídas.",
              "Injetora exige saídas diferentes para entradas diferentes.",
            ],
          },
        ),
      ],
    },
    {
      title: "Retas e taxas",
      objective:
        "Trabalhar funções afins: coeficiente angular, intercepto, retas por dois pontos e crescimento.",
      free: true,
      introduction:
        "Uma função afim f(x) = ax + b varia sempre à mesma taxa a: cada unidade a mais em x soma a à saída. O b é o valor em x = 0. Dois pontos determinam a e b.",
      specs: [
        n(
          "afim",
          "Uma função afim tem f(0) = 3 e f(2) = 11. Qual é o coeficiente angular?",
          4,
          "(11 − 3) ÷ (2 − 0) = 4.",
          {
            misreads: [
              { value: 8, feedback: "8 é a variação de f; divida pela variação de x, que é 2." },
            ],
          },
        ),
        c(
          "afim",
          "A reta que passa por (1, 5) e (3, 1) tem equação:",
          "y = −2x + 7",
          ["y = 2x + 3", "y = −2x + 3"],
          "a = (1 − 5) ÷ (3 − 1) = −2; 5 = −2 × 1 + b dá b = 7.",
          {
            feedback: [
              "Com a = 2 a reta seria crescente, mas y diminui quando x aumenta.",
              "b = 3 não satisfaz (1, 5): −2 + 3 = 1.",
            ],
          },
        ),
        n(
          "afim",
          "Um táxi cobra R$ 5 de bandeirada mais R$ 3 por quilômetro. Quantos quilômetros custam R$ 35?",
          10,
          "5 + 3k = 35 dá k = 10.",
          { misreads: [{ value: 11.67, feedback: "Dividiu 35 por 3 sem tirar a bandeirada." }] },
        ),
        c(
          "afim",
          "Se f(x) = ax + b é decrescente e f(0) = 2, então:",
          "a < 0 e b = 2",
          ["a > 0 e b = 2", "a < 0 e b = 0"],
          "Decrescente significa a negativo; f(0) = b = 2.",
          {
            feedback: ["a > 0 daria função crescente.", "f(0) = b, e f(0) = 2."],
          },
        ),
        n(
          "afim",
          "A reta y = 2x − 6 corta o eixo x em qual valor de x?",
          3,
          "2x − 6 = 0 dá x = 3.",
          { misreads: [{ value: -6, feedback: "−6 é onde a reta corta o eixo y (x = 0)." }] },
        ),
        c(
          "afim",
          "Duas retas: y = 3x + 1 e y = 3x − 4. Elas:",
          "São paralelas, porque têm o mesmo coeficiente angular e interceptos diferentes",
          ["Se cruzam em x = 5", "São a mesma reta"],
          "Mesma inclinação e b diferentes: nunca se encontram.",
          {
            feedback: [
              "3x + 1 = 3x − 4 não tem solução.",
              "Interceptos diferentes: retas diferentes.",
            ],
          },
        ),
        n(
          "afim",
          "Uma piscina tem 200 litros e perde 8 litros por hora. Em quantas horas fica com 40 litros?",
          20,
          "200 − 8t = 40 dá t = 20.",
          { misreads: [{ value: 25, feedback: "25 seria o tempo até esvaziar por completo." }] },
        ),
        c(
          "afim",
          "O ponto onde as retas y = x + 2 e y = −x + 6 se cruzam é:",
          "(2, 4)",
          ["(4, 2)", "(2, 8)"],
          "x + 2 = −x + 6 dá x = 2; y = 4.",
          {
            feedback: ["(4, 2) troca as coordenadas.", "Em x = 2 as duas retas valem 4, não 8."],
          },
        ),
      ],
    },
    {
      title: "Parábolas",
      objective:
        "Trabalhar funções quadráticas: raízes, vértice, concavidade e valor máximo ou mínimo.",
      introduction:
        "f(x) = ax² + bx + c é uma parábola: para cima se a > 0, para baixo se a < 0. O vértice fica em x = −b/(2a) e é o ponto de mínimo ou de máximo. As raízes, se existem, são simétricas em relação ao eixo da parábola, a reta vertical que passa pelo vértice.",
      specs: [
        n(
          "quadratica",
          "Qual é a abscissa (x) do vértice da parábola y = x² − 6x + 5?",
          3,
          "x = −b/(2a) = 6/2 = 3.",
          { misreads: [{ value: -3, feedback: "O sinal: −b/(2a) = −(−6)/2 = 3." }] },
        ),
        c(
          "quadratica",
          "As raízes de x² − 6x + 5 = 0 são:",
          "1 e 5",
          ["−1 e −5", "2 e 3"],
          "Produto 5, soma 6: 1 e 5.",
          {
            feedback: ["−1 e −5 têm soma −6; a soma deve ser 6.", "2 e 3 têm produto 6, não 5."],
          },
        ),
        n(
          "quadratica",
          "Qual é o valor mínimo de f(x) = x² − 6x + 5?",
          -4,
          "No vértice x = 3: f(3) = 9 − 18 + 5 = −4.",
          {
            misreads: [
              { value: 3, feedback: "3 é onde o mínimo acontece; o valor mínimo é f(3) = −4." },
            ],
          },
        ),
        c(
          "quadratica",
          "A parábola y = −2x² + 8x tem:",
          "Ponto de máximo em x = 2, com valor 8",
          ["Ponto de mínimo em x = 2", "Ponto de máximo em x = 4"],
          "a < 0: máximo. x = −8/(−4) = 2; y = −8 + 16 = 8.",
          {
            feedback: [
              "Com a negativo a parábola é para baixo: é máximo.",
              "x = 4 é uma raiz, não o vértice.",
            ],
          },
        ),
        n(
          "quadratica",
          "Uma parábola tem raízes 2 e 8. Qual é a abscissa do vértice?",
          5,
          "O vértice fica no meio das raízes: (2 + 8) ÷ 2 = 5.",
          {
            misreads: [
              { value: 10, feedback: "10 é a soma das raízes; o vértice fica na metade." },
            ],
          },
        ),
        c(
          "quadratica",
          "Para que valores de k a equação x² + 4x + k = 0 tem duas raízes reais distintas?",
          "k < 4",
          ["k > 4", "k = 4"],
          "Discriminante 16 − 4k > 0 dá k < 4.",
          {
            feedback: [
              "k > 4 deixa o discriminante negativo: sem raízes reais.",
              "k = 4 dá uma raiz dupla.",
            ],
          },
        ),
        n(
          "quadratica",
          "Um retângulo tem perímetro 20. Qual é a maior área possível?",
          25,
          "Lados x e 10 − x; área x(10 − x) tem máximo em x = 5: 25.",
          {
            misreads: [
              {
                value: 100,
                feedback:
                  "100 = 10² usa o semiperímetro como lado; com perímetro 20 o quadrado tem lado 5 e área 25.",
              },
            ],
          },
        ),
        c(
          "quadratica",
          "Se f(x) = ax² + bx + c, com a ≠ 0, tem f(1) = f(5), então o vértice está em:",
          "x = 3",
          ["x = 6", "x = 4"],
          "Valores iguais em pontos simétricos: o vértice é o ponto médio, 3.",
          {
            feedback: ["6 é a soma; o vértice é a média.", "4 não é o ponto médio de 1 e 5."],
          },
        ),
      ],
    },
    {
      title: "Ler o gráfico",
      objective:
        "Extrair informações de gráficos: crescimento, sinal, máximos, interseções e transformações.",
      introduction:
        "Um gráfico conta a história da função: onde sobe, onde desce, onde é positiva, onde cruza os eixos. Transformações como f(x) + k ou f(x − h) deslocam a curva sem mudar sua forma.",
      specs: [
        c(
          "grafico",
          "O gráfico de y = f(x) + 3, comparado ao de y = f(x), está:",
          "Deslocado 3 unidades para cima",
          ["Deslocado 3 unidades para a direita", "Esticado 3 vezes"],
          "Somar fora da função move o gráfico na vertical.",
          {
            feedback: ["Para a direita seria f(x − 3).", "Esticar seria 3f(x)."],
          },
        ),
        n(
          "grafico",
          "O gráfico de uma função afim passa por (0, 4) e (2, 0). Qual é f(−1)?",
          6,
          "a = (0 − 4)/2 = −2; f(x) = −2x + 4; f(−1) = 6.",
          { misreads: [{ value: 2, feedback: "2 é f(1); em x = −1 a reta sobe para 6." }] },
        ),
        c(
          "grafico",
          "Uma função é positiva para x < 1, zero em x = 1 e negativa para x > 1. Ela pode ser:",
          "f(x) = 1 − x",
          ["f(x) = x − 1", "f(x) = (x − 1)²"],
          "1 − x é positivo antes de 1 e negativo depois.",
          {
            feedback: ["x − 1 é negativo antes de 1.", "(x − 1)² nunca é negativo."],
          },
        ),
        c(
          "grafico",
          "O gráfico de y = f(x − 2), comparado ao de y = f(x), está:",
          "Deslocado 2 unidades para a direita",
          ["Deslocado 2 unidades para a esquerda", "Deslocado 2 unidades para baixo"],
          "f(x − 2) atinge em x o valor que f atingia em x − 2: a curva anda para a direita.",
          {
            feedback: ["Para a esquerda seria f(x + 2).", "Para baixo seria f(x) − 2."],
          },
        ),
        n(
          "grafico",
          "O gráfico de y = x² − 4 cruza o eixo x em dois pontos. Qual é a distância entre eles?",
          4,
          "Raízes −2 e 2: distância 4.",
          {
            misreads: [{ value: 2, feedback: "2 é uma das raízes; a distância entre −2 e 2 é 4." }],
          },
        ),
        c(
          "grafico",
          "O gráfico de y = −f(x) é o de y = f(x):",
          "Refletido em relação ao eixo x",
          ["Refletido em relação ao eixo y", "Deslocado para baixo"],
          "Trocar o sinal da saída vira o gráfico de cabeça para baixo.",
          {
            feedback: ["Reflexão no eixo y seria f(−x).", "Deslocar seria somar constante."],
          },
        ),
        n(
          "grafico",
          "Uma função quadrática tem gráfico com vértice em (2, −1) e passa por (0, 3). Qual é o valor de f(4)?",
          3,
          "4 é simétrico de 0 em relação a x = 2: f(4) = f(0) = 3.",
          { misreads: [{ value: -1, feedback: "−1 é o valor no vértice, em x = 2." }] },
        ),
        c(
          "grafico",
          "Se o gráfico de f é uma reta crescente e o de g é uma reta decrescente, quantas vezes eles se cruzam?",
          "Exatamente uma vez",
          ["Nenhuma", "Duas vezes"],
          "Inclinações diferentes: um único ponto de encontro.",
          {
            feedback: [
              "Retas com inclinações diferentes sempre se cruzam.",
              "Duas retas se cruzam no máximo uma vez.",
            ],
          },
        ),
      ],
    },
    {
      title: "Funções para modelar",
      objective: "Traduzir situações em funções, compor, inverter e decidir com o modelo.",
      introduction:
        "Modelar é escolher a função que descreve a situação e depois perguntar a ela. Compor funções encadeia processos; inverter responde 'que entrada dá esta saída'. O modelo tem limites, e vale dizer quais.",
      estimatedMinutes: 18,
      specs: [
        n(
          "modelar",
          "Uma loja vende x unidades a R$ (50 − x) cada. Qual é a quantidade que maximiza a receita x(50 − x)?",
          25,
          "Parábola com raízes 0 e 50: vértice em 25.",
          { misreads: [{ value: 50, feedback: "Em x = 50 o preço é zero e a receita também." }] },
        ),
        c(
          "modelar",
          "Se f(x) = 2x + 3, a função inversa é:",
          "f⁻¹(x) = (x − 3)/2",
          ["f⁻¹(x) = (x + 3)/2", "f⁻¹(x) = 1/(2x + 3)"],
          "Trocando x e y: x = 2y + 3, y = (x − 3)/2.",
          {
            feedback: [
              "Teste: f(0) = 3, então f⁻¹(3) deve ser 0, e (3 + 3)/2 = 3.",
              "1/f não é a inversa.",
            ],
          },
        ),
        n(
          "modelar",
          "Um plano de celular cobra R$ 30 fixos mais R$ 0,50 por minuto. Outro cobra R$ 0,80 por minuto sem taxa fixa. Com quantos minutos os dois planos custam o mesmo?",
          100,
          "30 + 0,5m = 0,8m dá m = 100; com mais minutos que isso, o primeiro fica mais barato.",
          {
            misreads: [
              {
                value: 60,
                feedback: "60 = 30 ÷ 0,5 ignora que o segundo plano também cobra por minuto.",
              },
            ],
          },
        ),
        c(
          "modelar",
          "Se f(x) = x + 1 e g(x) = 2x, então (g ∘ f)(x) = g(f(x)) é:",
          "2x + 2",
          ["2x + 1", "x + 2"],
          "g(f(x)) = 2(x + 1) = 2x + 2.",
          {
            feedback: ["2x + 1 é f(g(x)).", "x + 2 é f(f(x)); g nem foi aplicada."],
          },
        ),
        n(
          "modelar",
          "A temperatura em Fahrenheit é F = 1,8C + 32. Qual temperatura em Celsius corresponde a 212 °F?",
          100,
          "1,8C = 180 dá C = 100.",
          {
            misreads: [
              { value: 413.6, feedback: "Aplicou a fórmula no sentido errado: 1,8 × 212 + 32." },
            ],
          },
        ),
        c(
          "modelar",
          "Uma bola é lançada e sua altura é h(t) = −5t² + 20t. Em que instante ela volta ao chão?",
          "t = 4",
          ["t = 2", "t = 20"],
          "−5t² + 20t = 0 dá t = 0 ou t = 4.",
          {
            feedback: [
              "t = 2 é o instante de altura máxima.",
              "20 é o coeficiente, não um instante.",
            ],
          },
        ),
        n(
          "modelar",
          "Na mesma bola, h(t) = −5t² + 20t, qual é a altura máxima, em metros?",
          20,
          "Em t = 2: −20 + 40 = 20.",
          { misreads: [{ value: 2, feedback: "2 é o instante; a altura é h(2) = 20." }] },
        ),
        c(
          "modelar",
          "Um modelo linear prevê que uma planta cresce 2 cm por semana para sempre. Qual é a limitação mais importante?",
          "Nenhuma planta cresce indefinidamente; o modelo só vale por um período",
          [
            "Funções lineares não servem para plantas",
            "O modelo deveria usar pés em vez de centímetros",
          ],
          "Todo modelo tem um intervalo de validade.",
          {
            feedback: [
              "Lineares servem bem por um tempo; o problema é estender demais.",
              "A unidade não muda a limitação.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Organize os passos para achar o valor máximo de uma função quadrática com a < 0.",
    labels: [
      "Conferir que a é negativo, para a parábola ter máximo",
      "Calcular a abscissa do vértice, x = −b/(2a)",
      "Substituir esse x na função",
      "Interpretar o valor no contexto do problema",
    ],
    explanation:
      "Sem conferir o sinal de a, o vértice pode ser um mínimo; a substituição dá o valor e o contexto dá o sentido.",
  },
  justification: {
    prompts: [
      "Explique por que uma relação que dá duas saídas para a mesma entrada não é função, com um exemplo.",
      "Explique por que o vértice de uma parábola fica no ponto médio das raízes.",
      "Duas empresas de aluguel: uma cobra taxa fixa mais um valor por dia, a outra só um valor maior por dia. Explique como decidir qual é melhor.",
    ],
    samples: [
      "Função é uma regra que, dada a entrada, devolve uma única saída. Se y² = x, para x = 9 temos y = 3 e y = −3: a mesma entrada 9 leva a duas saídas. Não dá para dizer 'o valor' da função em 9, então não é função.",
      "Uma parábola é simétrica em relação à reta vertical que passa pelo vértice. As raízes são pontos onde a função vale zero, e valores iguais aparecem em pontos simétricos. Então as duas raízes estão à mesma distância do eixo de simetria, e o vértice tem abscissa igual à média delas.",
      "Escrevo o custo de cada uma como função dos dias: C1 = F + a·d e C2 = b·d, com b > a. Igualo para achar o ponto de empate: d = F/(b − a). Para menos dias que isso, a segunda é mais barata; para mais dias, a primeira. A decisão depende de quantos dias serão usados.",
    ],
    focus: "a leitura do modelo",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const a = 2 + (seed % 5);
      const b = -6 + (seed % 13);
      const x0 = 1 + (seed % 4);
      const y0 = a * x0 + b;
      const x1 = x0 + 2 + (seed % 3);
      const y1 = a * x1 + b;
      const f = (v: number) => String(v).replace("-", "−");
      return c(
        "reta-por-dois-pontos",
        `Uma função afim tem f(${x0}) = ${f(y0)} e f(${x1}) = ${f(y1)}. Qual é f(0)?`,
        f(b),
        [f(b + a), f(b - a)],
        `Coeficiente angular (${f(y1)} − ${y0 < 0 ? `(${f(y0)})` : f(y0)}) ÷ (${x1} − ${x0}) = ${a}; f(0) = ${f(y0)} − ${a} × ${x0} = ${f(b)}.`,
        {
          feedback: ["Esse é f(1), não f(0).", "Esse é f(−1); f(0) fica entre f(−1) e f(1)."],
        },
      );
    }
    if (variant === 1) {
      const r1 = 1 + (seed % 5);
      const r2 = r1 + 2 + (Math.floor(seed / 5) % 5);
      const soma = r1 + r2;
      const produto = r1 * r2;
      const vertice = soma / 2;
      const texto = (v: number) =>
        Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ",");
      return c(
        "vertice-pelas-raizes",
        `A parábola y = x² − ${soma}x + ${produto} tem raízes ${r1} e ${r2}. Qual é a abscissa do vértice?`,
        texto(vertice),
        [texto(soma), texto(produto)],
        `O vértice fica no ponto médio das raízes: (${r1} + ${r2}) ÷ 2 = ${texto(vertice)}.`,
        {
          feedback: [
            "Essa é a soma das raízes; o vértice fica na metade.",
            "Esse é o produto das raízes, não a média.",
          ],
        },
      );
    }
    const fixo = 10 * (2 + (seed % 5));
    const porMinuto = 3 + (seed % 3);
    const semFixo = porMinuto + 2;
    const empate = fixo / 2;
    return c(
      "ponto-de-empate",
      `Um plano de internet cobra R$ ${fixo} fixos mais R$ ${porMinuto} por hora de uso. Outro cobra R$ ${semFixo} por hora, sem taxa fixa. Com quantas horas de uso os dois custam o mesmo?`,
      `${empate}`,
      [`${fixo}`, `${empate + porMinuto}`],
      `${fixo} + ${porMinuto}h = ${semFixo}h dá 2h = ${fixo}, h = ${empate}.`,
      {
        feedback: [
          "Essa é a taxa fixa, não o número de horas.",
          "Não confere: iguale as duas funções de custo e resolva.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "funcoes",
    title: "O modelo de uma conta da casa",
    prompt:
      "Escolha uma conta da casa que dependa do consumo (água, luz, celular). Descubra a parte fixa e a parte que varia, escreva a função, faça o gráfico e use o modelo para prever um mês diferente.",
    lab: "grid",
    steps: [
      "Leia duas contas de meses diferentes e identifique a parte fixa e o valor por unidade consumida.",
      "Escreva a função custo em termos do consumo e desenhe o gráfico com os dois pontos reais.",
      "Preveja o custo para um consumo hipotético e diga em que faixa o modelo é confiável.",
    ],
    rubric: [
      "Parte fixa e taxa identificadas a partir de dados reais (0–2)",
      "Função escrita corretamente e gráfico coerente (0–3)",
      "Previsão calculada e interpretada (0–2)",
      "Limites do modelo discutidos, como faixas de tarifa (0–1)",
    ],
  },
  homeSupport: [
    "Olhem juntos uma conta com parte fixa e parte variável e perguntem: se o consumo dobrar, a conta dobra?",
    "Ao ver um gráfico no noticiário, peçam para o estudante dizer onde ele sobe, onde desce e o que isso significa.",
  ],
};
