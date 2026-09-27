import { c, decimal, n, type SkillPack } from "../skill-factory";

/**
 * Trigonometria geométrica: razões no triângulo retângulo, ângulos notáveis,
 * lei dos senos e dos cossenos, área com seno, e problemas de medida
 * indireta. Trilha Canguru S.
 */
export const trigonometria: SkillPack = {
  id: "trigonometria",
  name: "Trigonometria",
  domain: "canguru",
  lab: null,
  missions: [
    {
      title: "Razões no triângulo retângulo",
      objective: "Usar seno, cosseno e tangente de um ângulo agudo em triângulos retângulos.",
      introduction:
        "Num triângulo retângulo, para um ângulo agudo θ: sen θ = oposto/hipotenusa, cos θ = adjacente/hipotenusa, tg θ = oposto/adjacente. Esses números dependem só do ângulo, não do tamanho do triângulo.",
      specs: [
        c(
          "razoes",
          "Num triângulo retângulo de catetos 3 e 4, o seno do ângulo oposto ao cateto 3 é:",
          "3/5",
          ["3/4", "4/5"],
          "Hipotenusa 5; seno = oposto/hipotenusa.",
          {
            feedback: ["3/4 é a tangente.", "4/5 é o cosseno desse ângulo."],
          },
        ),
        n(
          "razoes",
          "Num triângulo retângulo, a hipotenusa mede 10 e um ângulo agudo tem seno 0,6. Quanto mede o cateto oposto a esse ângulo?",
          6,
          "0,6 × 10 = 6.",
          { misreads: [{ value: 8, feedback: "8 é o outro cateto." }] },
        ),
        c(
          "razoes",
          "Para qualquer ângulo agudo θ, sen² θ + cos² θ vale:",
          "1",
          ["2", "Depende do ângulo"],
          "(o/h)² + (a/h)² = (o² + a²)/h² = 1 por Pitágoras.",
          {
            feedback: [
              "2 exigiria sen² θ = 1 e cos² θ = 1 ao mesmo tempo, o que não acontece: quando um cresce, o outro diminui.",
              "Não depende: por Pitágoras, o² + a² = h², então a soma vale 1 para todo θ.",
            ],
          },
        ),
        n(
          "razoes",
          "Uma rampa sobe 1 metro a cada 8 metros na horizontal. Qual é a tangente do ângulo da rampa? Responda com três casas decimais.",
          0.125,
          "1/8 = 0,125.",
          { misreads: [{ value: 8, feedback: "8 é o inverso: horizontal sobre vertical." }] },
        ),
        c(
          "razoes",
          "Se sen θ = 0,8 e θ é agudo, então cos θ é:",
          "0,6",
          ["0,2", "0,8"],
          "√(1 − 0,64) = √0,36.",
          {
            feedback: [
              "0,2 é 1 − 0,8, mas a relação é entre os quadrados.",
              "Seno e cosseno só coincidem em 45°.",
            ],
          },
        ),
        n(
          "razoes",
          "Uma escada de 5 m está encostada num muro e forma com o chão um ângulo cujo cosseno é 0,6. A que distância do muro está o pé da escada, em metros?",
          3,
          "Cateto adjacente ao ângulo do chão: 5 × 0,6 = 3.",
          { misreads: [{ value: 4, feedback: "4 é a altura que a escada alcança no muro." }] },
        ),
        c(
          "razoes",
          "Num triângulo retângulo, os ângulos agudos α e β somam 90°. Então:",
          "sen α = cos β",
          ["sen α = sen β", "tg α = tg β"],
          "O cateto oposto a α é o adjacente a β.",
          {
            feedback: ["Só seria verdade com α = β = 45°.", "tg α = 1/tg β."],
          },
        ),
        n(
          "razoes",
          "De um ponto no chão, vê-se o topo de uma torre sob um ângulo cuja tangente é 0,75. A torre está a 40 m. Qual é a altura da torre, em metros?",
          30,
          "0,75 × 40 = 30.",
          {
            misreads: [
              {
                value: 53.33,
                feedback: "Dividiu 40 por 0,75; a altura é o cateto oposto, tg × adjacente.",
              },
            ],
          },
        ),
      ],
    },
    {
      title: "Ângulos notáveis",
      objective:
        "Conhecer seno, cosseno e tangente de 30°, 45° e 60° e deduzi-los geometricamente.",
      introduction:
        "O quadrado cortado pela diagonal dá 45°: sen = cos = √2/2. O triângulo equilátero cortado pela altura dá 30° e 60°: sen 30° = 1/2, cos 30° = √3/2. Esses valores resolvem muitos problemas sem calculadora.",
      specs: [
        c(
          "notaveis",
          "sen 30° vale:",
          "1/2",
          ["√3/2", "√2/2"],
          "Metade do lado do equilátero sobre o lado.",
          {
            feedback: ["√3/2 é sen 60°.", "√2/2 é sen 45°."],
          },
        ),
        n(
          "notaveis",
          "Num triângulo retângulo com um ângulo de 30°, a hipotenusa mede 14. Quanto mede o cateto oposto ao ângulo de 30°?",
          7,
          "sen 30° = 1/2: 14 ÷ 2 = 7.",
          { misreads: [{ value: 12.12, feedback: "12,12 é o cateto oposto a 60°, 14 × √3/2." }] },
        ),
        c("notaveis", "tg 45° vale:", "1", ["√2", "0"], "Catetos iguais.", {
          feedback: ["√2 é a razão diagonal/lado.", "tg 0° = 0."],
        }),
        n(
          "notaveis",
          "Um quadrado tem diagonal 10√2. Qual é o seu lado?",
          10,
          "Diagonal = lado × √2.",
          {
            misreads: [
              {
                value: 20,
                feedback: "Multiplicou por √2 em vez de dividir: diagonal = lado × √2.",
              },
            ],
          },
        ),
        c(
          "notaveis",
          "A altura de um triângulo equilátero de lado 6 é:",
          "3√3",
          ["6√3", "3"],
          "6 × sen 60° = 6 × √3/2.",
          {
            feedback: ["6√3 esquece de dividir por 2.", "3 é metade do lado."],
          },
        ),
        n("notaveis", "Qual é o valor de sen² 60° + cos² 60°?", 1, "3/4 + 1/4 = 1.", {
          misreads: [{ value: 0.75, feedback: "0,75 é só sen² 60°." }],
        }),
        c("notaveis", "cos 60° vale:", "1/2", ["√3/2", "√3"], "cos 60° = sen 30°.", {
          feedback: ["√3/2 é cos 30°.", "√3 é tg 60°."],
        }),
        n(
          "notaveis",
          "Uma pipa está presa por uma linha esticada de 50 m que forma 30° com o chão. A que altura ela está, em metros?",
          25,
          "50 × sen 30° = 25.",
          {
            misreads: [
              { value: 43.3, feedback: "43,3 usa cos 30°, que dá a distância horizontal." },
            ],
          },
        ),
      ],
    },
    {
      title: "Leis dos senos e dos cossenos",
      objective: "Resolver triângulos quaisquer com a lei dos cossenos e a lei dos senos.",
      introduction:
        "Lei dos cossenos: a² = b² + c² − 2bc·cos A, uma extensão de Pitágoras. Lei dos senos: a/sen A = b/sen B = c/sen C. A primeira serve com dois lados e o ângulo entre eles, ou com os três lados para achar um ângulo; a segunda, com dois ângulos e um lado.",
      specs: [
        n(
          "leis",
          "Num triângulo, dois lados medem 5 e 8 e o ângulo entre eles é 60°. Quanto mede o terceiro lado?",
          7,
          "a² = 25 + 64 − 2 × 5 × 8 × 1/2 = 49.",
          { misreads: [{ value: 9.43, feedback: "9,43 é √89, que esquece o termo −2bc·cos A." }] },
        ),
        c(
          "leis",
          "Com a lei dos cossenos, se o ângulo A é de 90°, a fórmula vira:",
          "a² = b² + c²",
          ["a² = b² + c² − 2bc", "a² = b² − c²"],
          "O termo −2bc·cos A desaparece, porque cos 90° = 0: sobra o teorema de Pitágoras.",
          {
            feedback: [
              "Isso usaria cos 90° = 1; como cos 90° = 0, o termo −2bc·cos A some inteiro.",
              "É soma de quadrados, não diferença: a² = b² + c² − 2bc × 0.",
            ],
          },
        ),
        n(
          "leis",
          "Num triângulo, o ângulo A mede 30°, o ângulo B mede 90° e o lado a (oposto a A) mede 4. Quanto mede b (oposto a B)?",
          8,
          "4/sen 30° = b/sen 90°: b = 8.",
          {
            misreads: [
              { value: 2, feedback: "2 é 4 × sen 30°; pela lei dos senos b = 4 ÷ (1/2)." },
            ],
          },
        ),
        c(
          "leis",
          "Um triângulo tem lados 7, 8 e 13. O maior ângulo é:",
          "Obtuso",
          ["Reto", "Agudo"],
          "13² = 169 > 7² + 8² = 113: o cosseno do maior ângulo é negativo, então ele é obtuso.",
          {
            feedback: [
              "Reto exigiria 13² = 7² + 8², isto é, 169 = 113.",
              "Agudo exigiria 13² < 7² + 8², isto é, 169 < 113.",
            ],
          },
        ),
        n(
          "leis",
          "Num triângulo de lados 3, 5 e 7, qual é o cosseno do ângulo oposto ao lado 7? Responda com uma casa decimal e sinal.",
          -0.5,
          "49 = 9 + 25 − 30 cos C dá cos C = −1/2 (C = 120°).",
          { misreads: [{ value: 0.5, feedback: "O sinal: 15 = −30 cos C dá cos C negativo." }] },
        ),
        c(
          "leis",
          "Na lei dos senos, a razão a/sen A é igual a:",
          "O diâmetro da circunferência circunscrita",
          ["O raio da circunferência circunscrita", "O raio da circunferência inscrita"],
          "a/sen A = 2R, em que R é o raio da circunferência circunscrita ao triângulo.",
          {
            feedback: [
              "É o dobro do raio: a/sen A = 2R, o diâmetro da circunscrita.",
              "A circunferência inscrita não aparece na lei dos senos; a razão é o diâmetro da circunscrita, 2R.",
            ],
          },
        ),
        n(
          "leis",
          "Dois barcos saem do mesmo porto em direções que formam 60°. Um anda 3 km e o outro 8 km. Qual é a distância entre eles, em km?",
          7,
          "d² = 9 + 64 − 24 = 49.",
          {
            misreads: [
              { value: 5, feedback: "5 é 8 − 3, que valeria se fossem na mesma direção." },
            ],
          },
        ),
        c(
          "leis",
          "Conhecendo dois ângulos e um lado de um triângulo, a ferramenta mais direta é:",
          "A lei dos senos",
          ["A lei dos cossenos", "O teorema de Pitágoras"],
          "Com dois ângulos, o terceiro sai de 180°, e os lados saem das razões.",
          {
            feedback: [
              "A lei dos cossenos precisa de dois lados.",
              "Pitágoras só vale no triângulo retângulo.",
            ],
          },
        ),
      ],
    },
    {
      title: "Áreas com seno",
      objective: "Calcular áreas de triângulos e polígonos com a fórmula ½·a·b·sen C.",
      introduction:
        "A área de um triângulo com lados a e b e ângulo C entre eles é ½·a·b·sen C. A altura relativa a a é b·sen C. Isso permite calcular áreas sem conhecer a altura diretamente.",
      specs: [
        n(
          "area-seno",
          "Um triângulo tem lados 6 e 10 com ângulo de 30° entre eles. Qual é a sua área?",
          15,
          "½ × 6 × 10 × ½ = 15.",
          { misreads: [{ value: 30, feedback: "30 esquece o ½ da fórmula." }] },
        ),
        c(
          "area-seno",
          "A área de um triângulo equilátero de lado 4 é:",
          "4√3",
          ["8√3", "16"],
          "½ × 4 × 4 × sen 60° = 8 × √3/2.",
          {
            feedback: ["8√3 esquece metade.", "16 seria o quadrado de lado 4."],
          },
        ),
        n(
          "area-seno",
          "Um paralelogramo tem lados 8 e 5 e um ângulo de 30°. Qual é a sua área?",
          20,
          "8 × 5 × sen 30° = 20.",
          { misreads: [{ value: 40, feedback: "40 seria com ângulo reto." }] },
        ),
        c(
          "area-seno",
          "Mantendo dois lados de um triângulo fixos e variando o ângulo entre eles, a área é máxima quando o ângulo é:",
          "90°",
          ["60°", "180°"],
          "sen C é máximo em 90°.",
          {
            feedback: ["sen 60° < sen 90°.", "Com 180° o triângulo degenera e a área é zero."],
          },
        ),
        n(
          "area-seno",
          "Um hexágono regular de lado 2 é formado por 6 triângulos equiláteros. Qual é a sua área? Responda com duas casas decimais, usando √3 ≈ 1,732.",
          10.39,
          "6 × (√3/4) × 4 = 6√3 ≈ 10,39.",
          { misreads: [{ value: 1.73, feedback: "1,73 é a área de um só triângulo." }] },
        ),
        c(
          "area-seno",
          "Dois triângulos têm lados 5 e 7 com ângulos entre eles de 30° e 150°. Suas áreas são:",
          "As duas são iguais",
          ["A primeira é maior", "A segunda é maior"],
          "Ângulos suplementares têm o mesmo seno: sen 30° = sen 150° = 1/2, e as duas áreas valem ½ × 5 × 7 × ½ = 35/4.",
          {
            feedback: [
              "A primeira não é maior: sen 30° = sen 150° = 1/2, então as duas áreas valem ½ × 5 × 7 × ½.",
              "Um ângulo maior não dá área maior aqui: 30° e 150° são suplementares e têm o mesmo seno, 1/2.",
            ],
          },
        ),
        n(
          "area-seno",
          "Um terreno triangular tem lados 20 m e 30 m com ângulo de 45° entre eles. Qual é a área, em m², arredondada para o inteiro? Use √2 ≈ 1,414.",
          212,
          "½ × 20 × 30 × √2/2 = 150√2 ≈ 212.",
          { misreads: [{ value: 300, feedback: "300 seria com ângulo reto." }] },
        ),
        c(
          "area-seno",
          "A fórmula ½·a·b·sen C vem de:",
          "Da área ½ × base × altura, com altura b·sen C",
          [
            "Da lei dos cossenos, trocando cos C por sen C",
            "Do retângulo a × b cortado ao meio pela diagonal",
          ],
          "A altura relativa ao lado a é o cateto oposto a C num triângulo de hipotenusa b: h = b·sen C, e a área é ½ × a × h.",
          {
            feedback: [
              "A lei dos cossenos relaciona lados e ângulo, não área; trocar cosseno por seno não é uma passagem válida.",
              "Isso só vale quando C é reto, pois sen 90° = 1; em geral a altura relativa ao lado a é b·sen C, não b.",
            ],
          },
        ),
      ],
    },
    {
      title: "Medir sem alcançar",
      objective: "Modelar problemas de altura, distância e navegação com trigonometria.",
      introduction:
        "Trigonometria mede o que não se alcança: a altura de um prédio pelo ângulo de visada, a largura de um rio sem atravessar, a distância entre barcos. O trabalho é desenhar o triângulo certo e escolher a razão ou a lei.",
      estimatedMinutes: 18,
      specs: [
        n(
          "medir",
          "De um ponto a 30 m de um prédio, o topo é visto sob 60°. Qual é a altura do prédio, em metros, arredondada para o inteiro? Use √3 ≈ 1,732.",
          52,
          "30 × tg 60° = 30√3 ≈ 51,96.",
          { misreads: [{ value: 17, feedback: "17 usa tg 30°; o ângulo é 60°." }] },
        ),
        c(
          "medir",
          "Para medir a largura de um rio sem atravessar, uma pessoa parte do ponto bem em frente a uma árvore da outra margem, anda 50 m pela margem e mede o ângulo até a árvore. Ela está usando:",
          "A tangente do ângulo, num triângulo retângulo",
          [
            "A lei dos cossenos, porque o triângulo não é retângulo",
            "O seno do ângulo medido, multiplicado por 50",
          ],
          "Partindo do ponto em frente à árvore, o triângulo é retângulo nesse ponto: largura = 50 × tg(ângulo).",
          {
            feedback: [
              "Partindo do ponto em frente à árvore, o triângulo é retângulo, e a tangente basta.",
              "O seno daria a razão com a hipotenusa, que não foi medida; a largura é o cateto oposto, e o adjacente é 50.",
            ],
          },
        ),
        n(
          "medir",
          "Um avião decola com ângulo de subida de 30° e percorre 800 m em linha reta. Que altura ele atinge, em metros?",
          400,
          "800 × sen 30° = 400.",
          {
            misreads: [
              { value: 692.8, feedback: "692,8 usa cos 30°, que dá a distância horizontal." },
            ],
          },
        ),
        c(
          "medir",
          "Duas pessoas, a 100 m uma da outra, veem um balão entre elas sob ângulos de 45° e 45°. O balão está a que altura?",
          "50 m",
          ["100 m", "70,7 m"],
          "Com 45° dos dois lados, o pé da altura é o ponto médio e altura = 50 × tg 45°.",
          {
            feedback: [
              "100 m é a distância entre as pessoas.",
              "70,7 m seria 100 × sen 45°, que não é a altura aqui.",
            ],
          },
        ),
        n(
          "medir",
          "Um barco navega 6 km para o norte e depois 8 km para o leste. A que distância está do ponto de partida, em km?",
          10,
          "√(36 + 64) = 10.",
          {
            misreads: [
              { value: 14, feedback: "14 é o caminho percorrido, não a distância em linha reta." },
            ],
          },
        ),
        c(
          "medir",
          "No problema do barco (6 km norte, 8 km leste), o ângulo θ entre a direção norte e a linha até o barco tem tangente:",
          "8/6",
          ["6/8", "6/10"],
          "Oposto a θ é o deslocamento leste, adjacente é o norte.",
          {
            feedback: ["6/8 é a tangente do ângulo com a direção leste.", "6/10 é o cosseno de θ."],
          },
        ),
        n(
          "medir",
          "Uma árvore projeta sombra de 12 m quando o Sol está a 45° acima do horizonte. Qual é a altura da árvore, em metros?",
          12,
          "tg 45° = 1: altura igual à sombra.",
          { misreads: [{ value: 8.49, feedback: "8,49 é 12 × sen 45°, que não é a altura." }] },
        ),
        c(
          "medir",
          "Num problema de medida indireta, a fonte de erro mais importante costuma ser:",
          "A medida do ângulo, sobretudo perto de 90°",
          [
            "O arredondamento da tangente na calculadora",
            "A unidade escolhida para medir as distâncias",
          ],
          "A tangente cresce muito perto de 90°: um erro pequeno na medida do ângulo gera um erro grande na distância calculada.",
          {
            feedback: [
              "O arredondamento da calculadora afeta casas decimais distantes; o erro que pesa vem de medir o ângulo no campo.",
              "Trocar metros por centímetros não cria erro, só muda a escala dos números; o erro vem da medição.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt:
      "Organize os passos para calcular a altura de um prédio a partir de um ângulo de visada.",
    labels: [
      "Desenhar o triângulo: olho do observador, topo e o ponto do prédio na altura do olho",
      "Medir a distância horizontal até o prédio e o ângulo de visada até o topo",
      "Multiplicar a distância pela tangente do ângulo",
      "Somar a altura dos olhos do observador",
    ],
    explanation:
      "A tangente dá a altura acima dos olhos; a altura do observador completa a medida.",
  },
  justification: {
    prompts: [
      "Explique por que a lei dos cossenos vira o teorema de Pitágoras quando o ângulo é reto.",
      "Explique por que dois triângulos com lados 5 e 7 e ângulos de 30° e de 150° entre eles têm a mesma área.",
      "Explique por que sen² θ + cos² θ = 1 para todo ângulo agudo.",
    ],
    samples: [
      "A lei dos cossenos diz a² = b² + c² − 2bc·cos A. Se A = 90°, cos A = 0 e o último termo some: a² = b² + c². Esse é exatamente Pitágoras, com a como hipotenusa. A lei dos cossenos corrige Pitágoras quando o ângulo não é reto.",
      "A área é ½ × 5 × 7 × sen do ângulo entre os lados. sen 150° = sen(180° − 30°) = sen 30° = 1/2. Nos dois casos a área é ½ × 35 × ½ = 8,75. Os triângulos são diferentes, mas a altura relativa ao lado 5 é a mesma, 7 × ½.",
      "Num triângulo retângulo com catetos o e a e hipotenusa h, sen θ = o/h e cos θ = a/h. Então sen² θ + cos² θ = (o² + a²)/h². Por Pitágoras, o² + a² = h², e a fração vale 1, qualquer que seja o triângulo ou o ângulo.",
    ],
    focus: "a escolha da razão ou da lei certa",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      // Hipotenusa 14 já é uma missão.
      const hipotenusa = 2 * (3 + (seed % 12)) === 14 ? 30 : 2 * (3 + (seed % 12));
      const cateto = hipotenusa / 2;
      return c(
        "cateto-oposto-a-30",
        `Num triângulo retângulo, um ângulo agudo mede 30° e a hipotenusa mede ${hipotenusa}. Quanto mede o cateto oposto ao ângulo de 30°?`,
        `${cateto}`,
        [`${hipotenusa}`, `${cateto}√3`],
        `sen 30° = 1/2: ${hipotenusa} ÷ 2 = ${cateto}.`,
        {
          feedback: ["Essa é a hipotenusa.", "Esse é o cateto oposto ao ângulo de 60°."],
        },
      );
    }
    if (variant === 1) {
      const a = 3 + (seed % 6);
      // Lados 6 e 10 já são uma missão.
      const b = a === 6 && a + 2 + (seed % 5) === 10 ? 11 : a + 2 + (seed % 5);
      const area = (a * b) / 4;
      const texto = (v: number) => decimal(v);
      return c(
        "area-com-seno",
        `Um triângulo tem dois lados medindo ${a} e ${b}, com ângulo de 30° entre eles. Qual é a sua área?`,
        texto(area),
        [texto(area * 2), texto(a * b)],
        `½ × ${a} × ${b} × sen 30° = ${a * b} ÷ 4 = ${texto(area)}.`,
        {
          feedback: ["Esqueceu o ½ da fórmula.", "Multiplicou os lados sem o ½ e sem o seno."],
        },
      );
    }
    const ternas: [number, number, number][] = [
      [7, 8, 13],
      [9, 24, 21],
      [7, 15, 13],
      [5, 21, 19],
      [8, 15, 13],
      [5, 16, 19],
    ];
    const [p, q, r] = ternas[seed % 6] ?? [7, 15, 13];
    // 7 e 8 com 13 e 5 e 16 com 19 pedem 120°; os outros, 60°. Nenhuma terna
    // repete as da missão 3 (5, 8 e 7; 3, 5 e 7; 3, 8 e 7).
    const angulo = (p === 7 && q === 8) || (p === 5 && q === 16) ? 120 : 60;
    return c(
      "terceiro-lado-cossenos",
      `Num triângulo, dois lados medem ${p} e ${q} e o ângulo entre eles mede ${angulo}°. Quanto mede o terceiro lado?`,
      `${r}`,
      [`${p + q}`, `${Math.abs(q - p)}`],
      `Pela lei dos cossenos, ${p}² + ${q}² − 2 × ${p} × ${q} × cos ${angulo}° = ${r * r}, então o lado mede ${r}.`,
      {
        feedback: [
          "Somou os lados, o que só valeria se o triângulo fosse degenerado.",
          "Subtraiu os lados, o que também é um triângulo degenerado.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "trigonometria",
    title: "A altura que ninguém mediu",
    prompt:
      "Construa um medidor de ângulos simples (transferidor com canudo e barbante com peso) e use-o para medir a altura de algo alto perto de você. Faça duas medidas de pontos diferentes e compare.",
    lab: null,
    steps: [
      "Monte o medidor e teste-o num ângulo conhecido.",
      "Meça a distância até a base e o ângulo até o topo em dois pontos diferentes, e calcule a altura com a tangente.",
      "Compare os dois resultados e discuta as fontes de erro.",
    ],
    rubric: [
      "Medidor construído e testado (0–2)",
      "Duas medidas com cálculo correto pela tangente (0–4)",
      "Comparação dos resultados (0–2)",
      "Discussão das fontes de erro, incluindo altura dos olhos (0–2)",
    ],
  },
  homeSupport: [
    "Numa rampa ou escada, estimem juntos o ângulo de subida medindo quanto se sobe e quanto se anda.",
    "Perguntem como um topógrafo mede a altura de um morro sem subir nele e deixem a criança desenhar o triângulo.",
  ],
};
