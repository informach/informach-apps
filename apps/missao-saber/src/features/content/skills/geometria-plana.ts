import { c, n, type SkillPack } from "../skill-factory";

/**
 * Geometria plana: ângulos e triângulos, semelhança e relações métricas,
 * áreas por decomposição e razão, círculos, e argumentos geométricos.
 * Trilhas OBMEP N3 e Canguru J.
 */
export const geometriaPlana: SkillPack = {
  id: "geometria-plana",
  name: "Geometria plana",
  domain: "common",
  lab: "grid",
  missions: [
    {
      title: "Ângulos que se encontram",
      objective:
        "Usar soma de ângulos em triângulos e polígonos, ângulos em paralelas e ângulos externos.",
      introduction:
        "Os ângulos de um triângulo somam 180°; os de um polígono de n lados somam (n − 2) × 180°. Em retas paralelas cortadas por uma transversal, ângulos correspondentes são iguais. O ângulo externo de um triângulo é a soma dos dois internos não adjacentes.",
      specs: [
        n(
          "angulos",
          "Num triângulo, dois ângulos medem 47° e 68°. Quanto mede o terceiro, em graus?",
          65,
          "180 − 47 − 68 = 65.",
          {
            misreads: [
              {
                value: 115,
                feedback: "115 é a soma dos dois dados; o terceiro é 180 menos essa soma.",
              },
            ],
          },
        ),
        c(
          "angulos",
          "A soma dos ângulos internos de um hexágono é:",
          "720°",
          ["540°", "1.080°"],
          "(6 − 2) × 180° = 720°.",
          {
            feedback: ["540° é a soma para o pentágono.", "1.080° é para o octógono."],
          },
        ),
        n(
          "angulos",
          "Num triângulo isósceles, o ângulo do vértice (entre os lados iguais) mede 40°. Quanto mede cada ângulo da base, em graus?",
          70,
          "(180 − 40) ÷ 2 = 70.",
          { misreads: [{ value: 140, feedback: "140 é a soma dos dois ângulos da base." }] },
        ),
        c(
          "angulos",
          "Um ângulo externo de um triângulo mede 110° e um dos ângulos internos não adjacentes mede 45°. O outro não adjacente mede:",
          "65°",
          ["70°", "35°"],
          "Externo = soma dos internos não adjacentes: 110 − 45 = 65.",
          {
            feedback: [
              "70° seria o interno adjacente ao externo (180 − 110).",
              "35° não fecha a soma 110.",
            ],
          },
        ),
        n(
          "angulos",
          "Cada ângulo interno de um polígono regular mede 150°. Quantos lados ele tem?",
          12,
          "Externo = 30°; 360 ÷ 30 = 12.",
          { misreads: [{ value: 10, feedback: "10 lados dariam ângulo interno de 144°." }] },
        ),
        c(
          "angulos",
          "Duas retas paralelas são cortadas por uma transversal. Se um dos ângulos formados mede 70°, os outros sete medem:",
          "70° ou 110°",
          ["Todos 70°", "70°, 110° e 90°"],
          "Correspondentes e opostos pelo vértice são iguais; os suplementares dão 110°.",
          {
            feedback: [
              "Os ângulos ao lado de 70° na mesma reta medem 110°.",
              "Não aparece 90° a menos que a transversal seja perpendicular.",
            ],
          },
        ),
        n(
          "angulos",
          "Os ângulos de um triângulo estão na razão 2 : 3 : 4. Quanto mede o maior, em graus?",
          80,
          "2k + 3k + 4k = 180 dá k = 20; o maior é 80.",
          { misreads: [{ value: 20, feedback: "20 é o valor de k; o maior ângulo é 4k." }] },
        ),
        c(
          "angulos",
          "Num quadrilátero, três ângulos medem 80°, 95° e 100°. O quarto mede:",
          "85°",
          ["95°", "275°"],
          "360 − 275 = 85.",
          {
            feedback: [
              "95° repete um dos dados e não fecha 360°.",
              "275° é a soma dos três dados.",
            ],
          },
        ),
      ],
    },
    {
      title: "Semelhança e razões",
      objective: "Reconhecer triângulos semelhantes e usar razões entre lados, alturas e áreas.",
      introduction:
        "Triângulos com os mesmos ângulos são semelhantes: os lados correspondentes têm a mesma razão k. Alturas e perímetros escalam por k; áreas escalam por k².",
      specs: [
        n(
          "semelhanca",
          "Dois triângulos são semelhantes com razão 3. Se a área do menor é 8, qual é a área do maior?",
          72,
          "Áreas escalam pelo quadrado da razão: 8 × 9 = 72.",
          { misreads: [{ value: 24, feedback: "24 usa a razão 3 sem elevar ao quadrado." }] },
        ),
        c(
          "semelhanca",
          "Um poste de 6 m projeta uma sombra de 4 m. No mesmo instante, uma árvore projeta sombra de 10 m. A altura da árvore é:",
          "15 m",
          ["12 m", "6,67 m"],
          "6/4 = h/10 dá h = 15.",
          {
            feedback: [
              "12 m soma à altura do poste a diferença das sombras (6 + 6); a relação é de proporção, não de diferença.",
              "6,67 inverte a proporção.",
            ],
          },
        ),
        n(
          "semelhanca",
          "Num triângulo ABC, uma reta paralela a BC corta AB em D e AC em E, com AD = 4 e DB = 6. Se BC = 15, quanto mede DE?",
          6,
          "AD/AB = 4/10; DE = 15 × 4/10 = 6.",
          {
            misreads: [
              {
                value: 10,
                feedback:
                  "10 usa a razão 4/6 em vez de 4/10: a comparação é com o lado inteiro AB.",
              },
            ],
          },
        ),
        c(
          "semelhanca",
          "Dois triângulos têm ângulos 30°, 60°, 90° e 30°, 60°, 90°, com hipotenusas 10 e 25. A razão entre os perímetros é:",
          "2 : 5",
          ["4 : 25", "1 : 2"],
          "Perímetros escalam como os lados: 10 : 25 = 2 : 5.",
          {
            feedback: ["4 : 25 é a razão das áreas.", "1 : 2 não corresponde a 10 : 25."],
          },
        ),
        n(
          "semelhanca",
          "Um mapa está na escala 1 : 50.000. Uma distância de 3 cm no mapa corresponde a quantos quilômetros reais?",
          1.5,
          "3 × 50.000 = 150.000 cm = 1,5 km.",
          { misreads: [{ value: 150, feedback: "150.000 cm são 1,5 km, não 150." }] },
        ),
        c(
          "semelhanca",
          "Num trapézio, as diagonais se cortam em P. Os triângulos formados pelas bases e por P são:",
          "Semelhantes, com razão igual à razão das bases",
          ["Congruentes", "Semelhantes com razão sempre 1 : 2"],
          "Bases paralelas geram ângulos alternos iguais.",
          {
            feedback: [
              "Só seriam congruentes se as bases fossem iguais, e aí não seria trapézio.",
              "A razão é a das bases, não fixa.",
            ],
          },
        ),
        n(
          "semelhanca",
          "Uma fotografia de 10 cm de largura por 15 cm de altura é ampliada para 24 cm de largura, mantendo a proporção. Qual é a altura da ampliação, em centímetros?",
          36,
          "Razão 24/10 = 2,4; 15 × 2,4 = 36.",
          {
            misreads: [{ value: 29, feedback: "29 soma 14 à altura, mas a ampliação multiplica." }],
          },
        ),
        c(
          "semelhanca",
          "Se um triângulo tem lados 3, 4 e 5 e outro tem lados 6, 8 e 10, então:",
          "São semelhantes com razão 2, e o segundo tem área 4 vezes maior",
          [
            "São semelhantes com razão 2, e o segundo tem área 2 vezes maior",
            "Não são semelhantes",
          ],
          "Áreas: 6 e 24.",
          {
            feedback: ["A área escala por k² = 4.", "Lados proporcionais: são semelhantes."],
          },
        ),
      ],
    },
    {
      title: "Áreas por decomposição",
      objective:
        "Calcular áreas cortando, completando e comparando figuras, e usar razões de áreas.",
      introduction:
        "Muitas áreas se calculam sem fórmula nova: cortar em triângulos e retângulos, completar até um retângulo e subtrair, ou comparar triângulos de mesma altura, cujas áreas estão na razão das bases.",
      specs: [
        n(
          "area",
          "Um triângulo tem vértices (0, 0), (6, 0) e (2, 5). Qual é a sua área?",
          15,
          "Base 6 sobre o eixo x, altura 5: 6 × 5 ÷ 2 = 15.",
          { misreads: [{ value: 30, feedback: "Esqueceu de dividir por 2." }] },
        ),
        c(
          "area",
          "Num triângulo ABC, o ponto M é o ponto médio de BC. A área do triângulo ABM comparada à de ABC é:",
          "A metade",
          ["Um quarto", "Igual"],
          "Mesma altura a partir de A e metade da base.",
          {
            feedback: [
              "Um quarto seria com dois pontos médios.",
              "A base foi cortada ao meio; a área também.",
            ],
          },
        ),
        n(
          "area",
          "Um quadrado de lado 10 tem um triângulo retirado em cada canto, cada triângulo com catetos 3 e 3. Qual é a área da figura que sobra?",
          82,
          "100 − 4 × (3 × 3 ÷ 2) = 100 − 18 = 82.",
          {
            misreads: [
              {
                value: 64,
                feedback: "64 tira quadrados de lado 3 nos cantos, mas foram triângulos.",
              },
            ],
          },
        ),
        c(
          "area",
          "Um trapézio tem bases 8 e 12 e altura 5. Sua área é:",
          "50",
          ["60", "100"],
          "(8 + 12) × 5 ÷ 2 = 50.",
          {
            feedback: ["60 usa só a base maior como retângulo.", "100 esquece de dividir por 2."],
          },
        ),
        n(
          "area",
          "No retângulo ABCD, AB = 12 e BC = 8; M é o ponto médio de CD. Qual é a área do triângulo ADM?",
          24,
          "Base DM = 6 (metade de 12) e altura AD = 8: 6 × 8 ÷ 2 = 24.",
          { misreads: [{ value: 48, feedback: "48 usa a base inteira 12." }] },
        ),
        c(
          "area",
          "Dois triângulos têm a mesma altura e bases na razão 2 : 3. Suas áreas estão na razão:",
          "2 : 3",
          ["4 : 9", "1 : 1"],
          "Com a mesma altura, a área é proporcional à base.",
          {
            feedback: [
              "4 : 9 seria se fossem semelhantes com razão 2 : 3.",
              "Bases diferentes, áreas diferentes.",
            ],
          },
        ),
        n(
          "area",
          "Um losango tem diagonais 10 e 24. Qual é a sua área?",
          120,
          "10 × 24 ÷ 2 = 120.",
          {
            misreads: [
              { value: 240, feedback: "240 é o produto das diagonais; a área é a metade." },
            ],
          },
        ),
        c(
          "area",
          "As diagonais de um paralelogramo o dividem em quatro triângulos. Sobre as áreas deles:",
          "São todas iguais",
          ["Só os opostos são iguais", "Dependem do paralelogramo"],
          "As diagonais se cortam ao meio em O. AOB e BOC têm bases AO = OC na mesma reta e a mesma altura a partir de B; o mesmo vale ao redor de O, então as quatro áreas são iguais.",
          {
            feedback: [
              "Opostos são congruentes, e os vizinhos têm a mesma área por terem bases iguais e mesma altura.",
              "Vale para qualquer paralelogramo.",
            ],
          },
        ),
      ],
    },
    {
      title: "Círculos",
      objective:
        "Trabalhar comprimento e área do círculo, ângulos inscritos e centrais, e tangentes.",
      introduction:
        "Comprimento 2πr, área πr². Um ângulo inscrito mede metade do central que abrange o mesmo arco; um ângulo inscrito num semicírculo é reto. A tangente é perpendicular ao raio no ponto de contato.",
      specs: [
        n("circulo", "Um círculo tem área 36π. Qual é o seu raio?", 6, "πr² = 36π dá r = 6.", {
          misreads: [{ value: 18, feedback: "18 é a metade de 36; o raio é a raiz quadrada." }],
        }),
        c(
          "circulo",
          "Um ângulo central mede 80°. O ângulo inscrito que abrange o mesmo arco mede:",
          "40°",
          ["80°", "160°"],
          "Inscrito é metade do central.",
          {
            feedback: ["80° é o central.", "160° dobra em vez de dividir."],
          },
        ),
        n(
          "circulo",
          "Uma roda de raio 0,5 m dá 100 voltas. Quantos metros ela percorre? Use π ≈ 3,14.",
          314,
          "Cada volta é 2 × 3,14 × 0,5 = 3,14 m; 100 voltas: 314 m.",
          { misreads: [{ value: 157, feedback: "157 usa πr em vez de 2πr." }] },
        ),
        c(
          "circulo",
          "AB é diâmetro de um círculo e C é outro ponto do círculo. O triângulo ABC é:",
          "Retângulo em C",
          ["Equilátero", "Isósceles com AC = BC sempre"],
          "Ângulo inscrito num semicírculo é reto.",
          {
            feedback: [
              "Só seria equilátero se os três lados fossem iguais, e AB é o maior.",
              "AC = BC só quando C é o ponto médio do arco.",
            ],
          },
        ),
        n(
          "circulo",
          "Um setor circular de raio 6 tem ângulo central de 60°. Qual é a sua área, em termos de π? Responda o coeficiente de π.",
          6,
          "60/360 × π × 36 = 6π.",
          { misreads: [{ value: 36, feedback: "36π é o círculo inteiro; o setor é um sexto." }] },
        ),
        c(
          "circulo",
          "De um ponto P externo a um círculo traçam-se duas tangentes que tocam o círculo em A e B. Então:",
          "PA = PB",
          ["PA = raio", "O ângulo APB é sempre 90°"],
          "Os dois segmentos tangentes de um ponto externo são iguais.",
          {
            feedback: [
              "PA depende da distância de P ao centro.",
              "O ângulo APB depende da posição de P.",
            ],
          },
        ),
        n(
          "circulo",
          "Um quadrado de lado 4 tem um círculo inscrito. Qual é a área do quadrado que fica fora do círculo? Use π ≈ 3,14 e arredonde para uma casa decimal.",
          3.4,
          "16 − π × 2² ≈ 16 − 12,56 = 3,44 ≈ 3,4.",
          {
            misreads: [
              {
                value: 12.6,
                feedback: "12,6 é a área do círculo; a pergunta pede o que sobra do quadrado.",
              },
            ],
          },
        ),
        c(
          "circulo",
          "Dobrando o raio de um círculo, a área:",
          "Quadruplica",
          ["Dobra", "Triplica"],
          "π(2r)² = 4πr².",
          {
            feedback: ["Dobra o comprimento, não a área.", "Não há razão para triplicar."],
          },
        ),
      ],
    },
    {
      title: "Argumentar com figuras",
      objective:
        "Construir e avaliar justificativas geométricas: congruência, casos e contraexemplos.",
      introduction:
        "Uma justificativa geométrica nomeia o que se usa: um caso de congruência, um teorema de ângulos, uma razão de semelhança. Um bom desenho ajuda, mas não substitui o argumento; um contraexemplo derruba uma afirmação geral.",
      estimatedMinutes: 18,
      specs: [
        c(
          "argumentar",
          "Para provar que os ângulos da base de um triângulo isósceles são iguais, traça-se a bissetriz do ângulo do vértice e usa-se:",
          "Congruência LAL entre os dois triângulos formados",
          ["Que todo triângulo tem ângulos somando 180°", "Que a bissetriz é perpendicular à base"],
          "Lados iguais, ângulo bissectado igual, lado comum: LAL.",
          {
            feedback: [
              "A soma 180° não distingue os ângulos da base.",
              "A perpendicularidade é consequência, não pode ser usada antes.",
            ],
          },
        ),
        c(
          "argumentar",
          "A afirmação 'todo quadrilátero com quatro lados iguais é um quadrado' é:",
          "Falsa: um losango não quadrado é contraexemplo",
          ["Verdadeira", "Falsa: um retângulo é contraexemplo"],
          "Lados iguais não garantem ângulos retos.",
          {
            feedback: [
              "O losango tem quatro lados iguais e ângulos não retos.",
              "Um retângulo não quadrado não tem os quatro lados iguais.",
            ],
          },
        ),
        n(
          "argumentar",
          "Num triângulo com lados 7 e 10, o terceiro lado é inteiro. Quantos valores ele pode assumir?",
          13,
          "Deve ficar entre 3 e 17, exclusivos: de 4 a 16, 13 valores.",
          { misreads: [{ value: 15, feedback: "15 incluiria 3 e 17, que não formam triângulo." }] },
        ),
        c(
          "argumentar",
          "Dois triângulos têm dois lados e um ângulo iguais. Eles são necessariamente congruentes?",
          "Não: se o ângulo não fica entre os dois lados, pode falhar",
          [
            "Sim, sempre: dois lados e um ângulo fixam o triângulo",
            "Não: a congruência sempre exige os três lados iguais",
          ],
          "Com o ângulo entre os dois lados (LAL), há congruência. Com o ângulo oposto a um dos lados pode haver dois triângulos diferentes, então a congruência não é garantida.",
          {
            feedback: [
              "Lado-lado-ângulo não é caso de congruência em geral: com o ângulo oposto a um dos lados pode haver duas configurações.",
              "LAL e ALA também garantem congruência, sem conhecer os três lados.",
            ],
          },
        ),
        n(
          "argumentar",
          "Quantas diagonais tem um polígono convexo de 10 lados?",
          35,
          "10 × 7 ÷ 2 = 35.",
          { misreads: [{ value: 70, feedback: "70 conta cada diagonal duas vezes." }] },
        ),
        c(
          "argumentar",
          "Para mostrar que as diagonais de um retângulo são iguais, o argumento certo compara os triângulos formados por um lado e as duas diagonais usando:",
          "LAL: lado comum, lados opostos iguais e ângulos retos iguais",
          ["Que retângulos têm quatro lados iguais", "Que as diagonais se cortam ao meio"],
          "Os triângulos ABD e BAC têm AB comum, AD = BC e ângulos retos em A e B.",
          {
            feedback: [
              "Retângulos não têm os quatro lados iguais em geral.",
              "Cortar ao meio vale para qualquer paralelogramo e não dá a igualdade das diagonais.",
            ],
          },
        ),
        n(
          "argumentar",
          "Num triângulo retângulo, a altura relativa à hipotenusa divide-a em segmentos de 4 e 9. Quanto mede essa altura?",
          6,
          "h² = 4 × 9 = 36, h = 6.",
          { misreads: [{ value: 13, feedback: "13 é a hipotenusa inteira." }] },
        ),
        c(
          "argumentar",
          "Um desenho parece mostrar que um ângulo é reto. Isso basta para usar 'ângulo reto' numa prova?",
          "Não; precisa vir do enunciado ou ser demonstrado",
          [
            "Sim, se o desenho estiver bem feito",
            "Não, a não ser que seja medido com transferidor",
          ],
          "Desenhos ilustram; provas dependem de hipóteses e deduções. O ângulo reto precisa ser dado pelo enunciado ou demonstrado.",
          {
            feedback: [
              "Desenhos podem enganar por pequenas diferenças.",
              "Medir não é provar: o transferidor tem imprecisão, e a prova precisa de hipótese ou dedução.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Organize os passos para calcular a área de uma figura irregular desenhada numa malha.",
    labels: [
      "Enquadrar a figura no menor retângulo possível",
      "Decompor a sobra entre a figura e o retângulo em triângulos e retângulos",
      "Calcular a área do retângulo e a de cada parte da sobra",
      "Subtrair a sobra da área do retângulo",
    ],
    explanation: "Completar até o retângulo e subtrair evita fórmulas para formas estranhas.",
  },
  justification: {
    prompts: [
      "Num triângulo ABC, M é o ponto médio de BC. Explique por que a área do triângulo ABM é metade da área de ABC.",
      "Explique por que 'quatro lados iguais' não basta para ser quadrado, com um contraexemplo.",
      "Explique por que dois triângulos semelhantes com razão 3 têm áreas na razão 9.",
    ],
    samples: [
      "A área de um triângulo é base vezes altura dividido por 2. Trocando a base BC por BM, com M ponto médio, a base cai pela metade e a altura a partir de A continua a mesma, porque A não mudou e a reta BC é a mesma. Então a área cai pela metade.",
      "Um losango com ângulos de 60° e 120° tem quatro lados iguais e não é quadrado, porque os ângulos não são retos. Ser quadrado exige lados iguais e ângulos retos ao mesmo tempo. Um único exemplo assim mostra que a afirmação geral é falsa.",
      "Se a razão de semelhança é 3, cada lado do maior é 3 vezes o correspondente do menor, e a altura correspondente também é 3 vezes maior. A área é base vezes altura dividido por 2, então fica 3 × 3 = 9 vezes maior.",
    ],
    focus: "nomear o que se usa em cada passo",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const a = 35 + (seed % 31);
      const bBase = 40 + (seed % 37);
      // Se os dois somassem 90, o terceiro também seria 90 e coincidiria com a errada;
      // 47° e 68° já é o triângulo da missão 1.
      const b = a + bBase === 90 || (a === 47 && bBase === 68) ? bBase + 1 : bBase;
      const terceiro = 180 - a - b;
      return c(
        "terceiro-angulo",
        `Num triângulo, dois ângulos medem ${a}° e ${b}°. Quanto mede o terceiro ângulo?`,
        `${terceiro}°`,
        [`${a + b}°`, `${360 - a - b}°`],
        `180 − ${a} − ${b} = ${terceiro}.`,
        {
          feedback: [
            "Essa é a soma dos dois ângulos dados.",
            "Usou 360°, que é a soma de um quadrilátero; a de um triângulo é 180°.",
          ],
        },
      );
    }
    if (variant === 1) {
      const razao = 2 + (seed % 3);
      // Razão 3 com área 8 já aparece numa missão.
      const areaMenor = razao === 3 && 3 + (seed % 10) === 8 ? 9 : 3 + (seed % 10);
      const areaMaior = areaMenor * razao * razao;
      return c(
        "areas-e-semelhanca",
        `Dois triângulos são semelhantes e a razão entre lados correspondentes é ${razao}. Se a área do menor é ${areaMenor}, qual é a área do maior?`,
        `${areaMaior}`,
        [`${areaMenor * razao}`, `${areaMenor * razao ** 3}`],
        `As áreas escalam pelo quadrado da razão: ${areaMenor} × ${razao}² = ${areaMaior}.`,
        {
          feedback: [
            "Multiplicou pela razão sem elevar ao quadrado.",
            "Elevou a razão ao cubo, que é o fator de volumes, não de áreas.",
          ],
        },
      );
    }
    const lado = 6 + 2 * (seed % 6);
    const catetoBase = 1 + (Math.floor(seed / 6) % Math.max(1, Math.floor(lado / 3)));
    // Lado 10 com catetos 3 já aparece numa missão.
    const cateto = lado === 10 && catetoBase === 3 ? 2 : catetoBase;
    const area = lado * lado - 4 * ((cateto * cateto) / 2);
    return c(
      "area-por-subtracao",
      `De um quadrado de lado ${lado} retira-se, em cada canto, um triângulo retângulo isósceles de catetos ${cateto}. Qual é a área da figura que sobra?`,
      `${area}`,
      [`${lado * lado - 4 * cateto * cateto}`, `${lado * lado - cateto * cateto}`],
      `${lado}² − 4 × (${cateto} × ${cateto} ÷ 2) = ${lado * lado} − ${2 * cateto * cateto} = ${area}.`,
      {
        feedback: [
          "Retirou quadrados nos cantos, mas foram triângulos, com metade da área.",
          "Retirou só metade dos cantos.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "geometria-plana",
    title: "A planta de um cômodo",
    prompt:
      "Meça um cômodo da casa, ou o pátio da escola, e desenhe a planta em escala numa folha quadriculada. Calcule a área de dois jeitos diferentes, compare os resultados e estime o erro da medida.",
    lab: "grid",
    steps: [
      "Meça os lados com trena ou com passos de tamanho conhecido e desenhe a planta em escala, anotando a escala usada.",
      "Calcule a área dividindo a planta em retângulos e triângulos e, depois, tirando partes de um retângulo maior que a contém.",
      "Compare as duas contas com a contagem de quadradinhos da folha e explique de onde vêm as diferenças.",
    ],
    rubric: [
      "Medidas e escala registradas com unidades (0–2)",
      "Duas decomposições corretas e bem justificadas (0–3)",
      "Comparação com a contagem na malha (0–2)",
      "Discussão das fontes de erro (0–1)",
    ],
  },
  homeSupport: [
    "Ao arrumar um cômodo, perguntem quantos metros quadrados de piso ele tem e como descobrir isso sem contar cada lajota.",
    "Peçam para o estudante explicar por que o azulejo do banheiro fecha certinho, falando de ângulos que somam 360° em cada canto.",
  ],
};
