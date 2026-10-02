import { cubeNets } from "../figures";
import { c, n, type SkillPack } from "../skill-factory";

/**
 * Geometria espacial: poliedros e a relação de Euler, planificações,
 * volumes e áreas de prismas, cilindros, pirâmides, cones e esferas,
 * seções e coordenadas no espaço. Trilha Canguru S.
 */
export const espaco: SkillPack = {
  id: "espaco",
  name: "Geometria espacial",
  domain: "canguru",
  lab: null,
  missions: [
    {
      title: "Vértices, arestas e faces",
      objective: "Contar elementos de poliedros e usar a relação de Euler V − A + F = 2.",
      introduction:
        "Em todo poliedro convexo, vértices menos arestas mais faces é igual a 2. Contar arestas pelas faces ajuda: cada aresta pertence a exatamente duas faces.",
      specs: [
        n(
          "euler",
          "Quantas arestas tem um cubo?",
          12,
          "8 − A + 6 = 2 dá A = 12; ou 6 faces × 4 arestas ÷ 2.",
          { misreads: [{ value: 24, feedback: "24 conta cada aresta duas vezes, uma por face." }] },
        ),
        c(
          "euler",
          "Um poliedro convexo tem 12 faces, todas pentagonais. Quantas arestas ele tem?",
          "30",
          ["60", "20"],
          "12 × 5 ÷ 2 = 30.",
          {
            feedback: [
              "60 esquece que cada aresta está em duas faces.",
              "20 é o número de vértices (V = 2 + A − F).",
            ],
          },
        ),
        n(
          "euler",
          "Um prisma de base hexagonal tem quantas faces?",
          8,
          "6 faces laterais + 2 bases.",
          { misreads: [{ value: 6, feedback: "Esqueceu as duas bases." }] },
        ),
        c(
          "euler",
          "Uma pirâmide de base quadrada tem:",
          "5 vértices, 8 arestas e 5 faces",
          ["4 vértices, 8 arestas e 5 faces", "5 vértices, 4 arestas e 5 faces"],
          "4 vértices da base + o topo; 4 arestas da base + 4 laterais; 4 laterais + base. 5 − 8 + 5 = 2.",
          {
            feedback: ["Falta o vértice do topo.", "Faltam as quatro arestas laterais."],
          },
        ),
        n(
          "euler",
          "Um poliedro convexo tem 20 vértices e 12 faces. Quantas arestas ele tem?",
          30,
          "20 − A + 12 = 2 dá A = 30.",
          { misreads: [{ value: 34, feedback: "O sinal: V − A + F = 2 dá A = V + F − 2." }] },
        ),
        c(
          "euler",
          "Um plano corta as três arestas de um vértice de um cubo perto dele, sem passar por outros vértices, e o canto é retirado. O novo sólido tem:",
          "10 vértices, 15 arestas e 7 faces",
          ["7 vértices, 12 arestas e 7 faces", "8 vértices, 12 arestas e 6 faces"],
          "Sai 1 vértice e entram 3; entram 3 arestas; entra 1 face. 10 − 15 + 7 = 2.",
          {
            feedback: [
              "O corte cria três vértices novos no lugar de um.",
              "Essa é a contagem do cubo original.",
            ],
          },
        ),
        n(
          "euler",
          "Quantas diagonais espaciais (que passam pelo interior) tem um cubo?",
          4,
          "Cada vértice liga ao oposto: 8 ÷ 2 = 4.",
          { misreads: [{ value: 12, feedback: "12 são as diagonais das faces." }] },
        ),
        c(
          "euler",
          "Existe um poliedro convexo com 7 arestas?",
          "Não, nenhum poliedro convexo tem 7 arestas",
          ["Sim, uma pirâmide de base triangular", "Sim, um prisma de base triangular"],
          "O tetraedro, com 6 arestas, é o menor, mas 7 não dá: A tem que satisfazer 3F ≤ 2A e 3V ≤ 2A; com A = 7 não há solução de Euler.",
          {
            feedback: [
              "A pirâmide de base triangular é o tetraedro, com 6 arestas: 3 na base e 3 laterais.",
              "O prisma de base triangular tem 9 arestas: 3 em cada base e 3 laterais.",
            ],
          },
        ),
      ],
    },
    {
      title: "Planificações e áreas",
      version: 2,
      objective:
        "Reconhecer planificações e calcular áreas de superfícies de prismas, cilindros, pirâmides e cones.",
      introduction:
        "Planificar é abrir a superfície no plano. A área total é a soma das faces: retângulos e bases no prisma, retângulo e dois círculos no cilindro, setor circular e círculo no cone.",
      specs: [
        n("area-superficie", "Qual é a área total de um cubo de aresta 5?", 150, "6 × 25 = 150.", {
          misreads: [{ value: 125, feedback: "125 é o volume." }],
        }),
        c(
          "area-superficie",
          "A planificação de um cilindro é formada por:",
          "Um retângulo e dois círculos",
          ["Três retângulos", "Um setor circular e um círculo"],
          "A superfície lateral desenrola num retângulo de largura igual ao comprimento da circunferência da base.",
          {
            feedback: [
              "Três retângulos formariam parte de um prisma.",
              "Setor e círculo formam um cone.",
            ],
          },
        ),
        n(
          "area-superficie",
          "Um paralelepípedo tem arestas 2, 3 e 4. Qual é a sua área total?",
          52,
          "2 × (6 + 8 + 12) = 52.",
          { misreads: [{ value: 24, feedback: "24 é o volume." }] },
        ),
        c(
          "area-superficie",
          "A área lateral de um cilindro de raio 3 e altura 10 é:",
          "60π",
          ["90π", "30π"],
          "2π × 3 × 10.",
          {
            feedback: [
              "90π é o volume.",
              "30π esquece o fator 2 do comprimento da circunferência.",
            ],
          },
        ),
        n(
          "area-superficie",
          "Uma pirâmide de base quadrada de lado 6 tem faces laterais triangulares com altura 5. Qual é a área total?",
          96,
          "Base 36 + 4 × (6 × 5 ÷ 2) = 36 + 60.",
          { misreads: [{ value: 60, feedback: "60 é só a área lateral; falta a base." }] },
        ),
        c(
          "area-superficie",
          "Qual arranjo pode ser dobrado nas linhas internas para formar um cubo fechado, sem cortar, sobrepor ou esticar faces?",
          "A",
          ["B", "C"],
          "Em A, o quadrado central recebe quatro faces vizinhas e a extensão fecha a face oposta. Os seis quadrados ocupam faces diferentes.",
          {
            figure: cubeNets,
            feedback: [
              "Em B, o bloco de quatro quadrados impede as dobras sem sobreposição.",
              "Em C, quatro quadrados já contornam o cubo; os seguintes se sobrepõem e não fecham as tampas.",
            ],
            hints: [
              "Imagine um quadrado como a base e levante seus vizinhos.",
              "As faces dobradas precisam apontar em seis direções diferentes.",
              "A cruz A tem quatro vizinhos ao redor do centro e mais um quadrado para fechar a face oposta.",
            ],
          },
        ),
        n(
          "area-superficie",
          "Qual é a área de uma esfera de raio 3, em termos de π? Responda o coeficiente de π.",
          36,
          "4π × 9 = 36π.",
          {
            misreads: [
              { value: 9, feedback: "9π é a área de um círculo máximo; a esfera tem 4 vezes." },
            ],
          },
        ),
        c(
          "area-superficie",
          "Dobrando todas as arestas de um cubo, a área total:",
          "Quadruplica",
          ["Dobra", "Fica 8 vezes maior"],
          "Áreas escalam pelo quadrado do fator.",
          {
            feedback: [
              "Dobrar o lado dobra comprimentos, não áreas.",
              "8 vezes é o fator do volume.",
            ],
          },
        ),
      ],
    },
    {
      title: "Volumes",
      objective:
        "Calcular volumes de prismas, cilindros, pirâmides, cones e esferas e compará-los.",
      introduction:
        "Prisma e cilindro: área da base × altura. Pirâmide e cone: um terço disso. Esfera: (4/3)πr³. Ao ampliar um sólido por um fator k, o volume multiplica por k³.",
      specs: [
        n(
          "volume",
          "Qual é o volume de um cilindro de raio 2 e altura 5, em termos de π? Responda o coeficiente de π.",
          20,
          "π × 4 × 5 = 20π.",
          { misreads: [{ value: 10, feedback: "10π usa o raio sem elevar ao quadrado." }] },
        ),
        c(
          "volume",
          "Um cone e um cilindro têm a mesma base e a mesma altura. O volume do cone é:",
          "Um terço do volume do cilindro",
          ["Metade do volume do cilindro", "Igual ao volume do cilindro"],
          "Pirâmides e cones têm ⅓ × base × altura.",
          {
            feedback: [
              "Metade é um palpite comum, mas cones e pirâmides têm um terço: são precisos três cones cheios para encher o cilindro.",
              "O cone é mais estreito em cima.",
            ],
          },
        ),
        n(
          "volume",
          "Uma pirâmide de base quadrada de lado 6 tem altura 10. Qual é o seu volume?",
          120,
          "⅓ × 36 × 10.",
          {
            misreads: [
              { value: 360, feedback: "360 é o volume do prisma de mesma base e altura." },
            ],
          },
        ),
        c(
          "volume",
          "Dobrando o raio de uma esfera, o volume:",
          "Fica 8 vezes maior",
          ["Dobra", "Quadruplica"],
          "(2r)³ = 8r³.",
          {
            feedback: ["Dobrar é o fator de comprimentos.", "Quadruplicar é o fator de áreas."],
          },
        ),
        n(
          "volume",
          "Uma caixa-d'água tem 2 m × 1,5 m × 1 m. Quantos metros cúbicos ela comporta?",
          3,
          "2 × 1,5 × 1 = 3 m³, ou 3.000 litros.",
          {
            misreads: [
              {
                value: 3000,
                feedback: "3.000 é o volume em litros; a pergunta pede metros cúbicos.",
              },
            ],
          },
        ),
        c(
          "volume",
          "Qual tem mais volume: uma esfera de raio 3 ou um cubo de aresta 5?",
          "O cubo: 125 contra cerca de 113",
          ["A esfera: cerca de 339 contra 125", "Empatam, com cerca de 125 cada"],
          "(4/3)π × 27 = 36π ≈ 113,1, menos que os 125 do cubo.",
          {
            feedback: [
              "339 vem de 4π × 27, esquecendo o 1/3 da fórmula; o volume da esfera é (4/3)π × 27 = 36π ≈ 113.",
              "O volume da esfera é 36π ≈ 113,1, não 125; o cubo tem cerca de 12 unidades a mais.",
            ],
          },
        ),
        n(
          "volume",
          "Um cubo de aresta 10 cm é derretido e refeito em cubinhos de aresta 2 cm. Quantos cubinhos saem?",
          125,
          "1.000 ÷ 8 = 125.",
          {
            misreads: [{ value: 5, feedback: "5 é quantos cabem numa aresta; em volume são 5³." }],
          },
        ),
        c(
          "volume",
          "Um cone de altura 12 tem água até a metade da altura, com o vértice para baixo. A fração do volume ocupada é:",
          "1/8",
          ["1/2", "1/4"],
          "O cone de água é semelhante com fator 1/2: volume (1/2)³.",
          {
            feedback: [
              "Metade da altura não é metade do volume.",
              "1/4 é a razão das áreas das bases.",
            ],
          },
        ),
      ],
    },
    {
      title: "Seções e sombras",
      objective: "Imaginar cortes planos de sólidos, vistas e projeções.",
      introduction:
        "Cortar um sólido por um plano revela uma figura plana: um cubo pode dar triângulo, quadrado, retângulo, pentágono ou hexágono. Vistas de frente, de lado e de cima ajudam a reconstruir o sólido.",
      specs: [
        c(
          "secoes",
          "Qual destas figuras NÃO pode ser seção plana de um cubo?",
          "Um heptágono",
          ["Um hexágono regular", "Um triângulo equilátero"],
          "O cubo tem 6 faces; a seção tem no máximo 6 lados.",
          {
            feedback: [
              "O plano perpendicular a uma diagonal pelo centro dá um hexágono regular.",
              "Cortar três arestas vizinhas de um vértice a igual distância dá um triângulo equilátero.",
            ],
          },
        ),
        c(
          "secoes",
          "Cortando um cilindro por um plano paralelo à base, a seção é:",
          "Um círculo",
          ["Uma elipse", "Um retângulo"],
          "Paralelo à base reproduz a base.",
          {
            feedback: [
              "A elipse aparece com um corte inclinado.",
              "O retângulo aparece com corte pelo eixo.",
            ],
          },
        ),
        n(
          "secoes",
          "Um cubo de aresta 4 é cortado por um plano que passa por duas arestas opostas, que não estão numa mesma face. A área da seção é k√2. Quanto vale k?",
          16,
          "É um retângulo de lados 4 e 4√2 (a diagonal de uma face): área 16√2.",
          {
            misreads: [
              {
                value: 8,
                feedback:
                  "8 usaria a metade da diagonal da face; o lado da seção é a diagonal inteira, 4√2.",
              },
            ],
          },
        ),
        c(
          "secoes",
          "Um sólido tem vista de frente triangular, vista lateral triangular e vista de cima quadrada. Ele pode ser:",
          "Uma pirâmide de base quadrada",
          ["Um cone", "Um prisma triangular"],
          "O cone teria vista de cima circular; o prisma teria vista de cima retangular e uma das laterais retangular.",
          {
            feedback: [
              "Vista de cima do cone é círculo.",
              "Um prisma triangular deitado tem uma das vistas retangular.",
            ],
          },
        ),
        n(
          "secoes",
          "Uma esfera de raio 5 é cortada por um plano a 3 unidades do centro. Qual é o raio da seção circular?",
          4,
          "√(25 − 9) = 4.",
          { misreads: [{ value: 2, feedback: "2 é 5 − 3; o raio sai de Pitágoras." }] },
        ),
        c(
          "secoes",
          "Cortando um cone por um plano que passa pelo vértice e pelo centro da base, a seção é:",
          "Um triângulo isósceles",
          ["Um círculo", "Uma parábola"],
          "Duas geratrizes e um diâmetro.",
          {
            feedback: [
              "O círculo vem de corte paralelo à base.",
              "A parábola vem de corte paralelo a uma geratriz, sem passar pelo vértice.",
            ],
          },
        ),
        n(
          "secoes",
          "Um cubo 3 × 3 × 3 formado por cubinhos é pintado nas seis faces. Quantos cubinhos ficam sem nenhuma face pintada?",
          1,
          "Só o cubinho central.",
          {
            misreads: [
              { value: 8, feedback: "8 são os cubinhos de canto, com três faces pintadas." },
            ],
          },
        ),
        c(
          "secoes",
          "Pintando a superfície de um cubo 4 × 4 × 4 formado por cubinhos, quantos cubinhos têm exatamente uma face pintada?",
          "24",
          ["16", "8"],
          "Cada face tem 2 × 2 = 4 centrais: 6 × 4.",
          {
            feedback: [
              "16 conta todos de uma face.",
              "8 são os cubinhos internos, sem face pintada.",
            ],
          },
        ),
      ],
    },
    {
      title: "Coordenadas e decisões no espaço",
      objective:
        "Usar coordenadas no espaço para distâncias e resolver problemas de capacidade e embalagem.",
      introduction:
        "No espaço, um ponto tem três coordenadas e a distância é √(Δx² + Δy² + Δz²). A diagonal de uma caixa a × b × c mede √(a² + b² + c²). Problemas de embalagem pedem volume, mas também formato.",
      estimatedMinutes: 18,
      specs: [
        n(
          "coordenadas-espaco",
          "Qual é a diagonal de uma caixa de 2 × 3 × 6?",
          7,
          "√(4 + 9 + 36) = √49.",
          {
            misreads: [
              {
                value: 11,
                feedback: "11 é a soma das arestas; a diagonal usa Pitágoras duas vezes.",
              },
            ],
          },
        ),
        c(
          "coordenadas-espaco",
          "A distância entre (1, 2, 3) e (4, 6, 3) é:",
          "5",
          ["7", "√34"],
          "√(9 + 16 + 0).",
          {
            feedback: [
              "7 soma as diferenças.",
              "√34 usou z = 3 como diferença, mas as terceiras coordenadas são iguais: Δz = 0.",
            ],
          },
        ),
        n(
          "coordenadas-espaco",
          "Qual é o comprimento da diagonal de um cubo de aresta 3? Responda com duas casas decimais, usando √3 ≈ 1,732.",
          5.2,
          "3√3 ≈ 5,196 ≈ 5,20.",
          { misreads: [{ value: 4.24, feedback: "4,24 é a diagonal de uma face (3√2)." }] },
        ),
        c(
          "coordenadas-espaco",
          "Uma lata cilíndrica de raio 5 cm e altura 10 cm é embalada numa caixa cúbica justa de aresta 10 cm. A fração da caixa ocupada pela lata é:",
          "π/4, cerca de 79%",
          ["100%", "π/6"],
          "250π ÷ 1.000 = π/4.",
          {
            feedback: [
              "Os cantos da caixa ficam vazios.",
              "π/6 é a fração ocupada por uma esfera inscrita na caixa.",
            ],
          },
        ),
        n(
          "coordenadas-espaco",
          "Quantas caixas de 10 × 20 × 30 cm cabem, sem cortar, num contêiner de 1 m × 1 m × 1 m, alinhadas da mesma forma?",
          150,
          "10 × 5 × 3 = 150, com as medidas alinhadas a 100/10, 100/20 e a parte inteira de 100/30.",
          {
            misreads: [
              {
                value: 166,
                feedback: "166 divide volumes, mas 100 não é múltiplo de 30 e sobra espaço.",
              },
            ],
          },
        ),
        c(
          "coordenadas-espaco",
          "Para embalar a maior quantidade de líquido com a menor área de material, entre um cubo e uma esfera de mesmo volume, é melhor:",
          "A esfera, porque tem a menor área para um dado volume",
          ["O cubo, porque não deixa espaços vazios", "Tanto faz, a área é a mesma"],
          "Entre todos os sólidos de mesmo volume, a esfera tem a menor superfície.",
          {
            feedback: [
              "Cubos se encaixam sem vãos numa caixa, mas a pergunta é o material de cada embalagem, e a esfera gasta menos área.",
              "Mesmo volume não significa mesma área: a esfera tem área menor que o cubo de mesmo volume.",
            ],
          },
        ),
        n(
          "coordenadas-espaco",
          "Uma formiga anda na superfície de um cubo de aresta 1, de um vértice ao vértice oposto. Qual é o menor caminho? Responda com duas casas decimais, usando √5 ≈ 2,236.",
          2.24,
          "Planificando duas faces vizinhas, o caminho é a diagonal de um retângulo 1 × 2: √5.",
          {
            misreads: [
              {
                value: 1.73,
                feedback: "1,73 é a diagonal pelo interior, que a formiga não pode usar.",
              },
            ],
          },
        ),
        c(
          "coordenadas-espaco",
          "Ao comparar duas embalagens de mesmo volume, qual informação decide o gasto de material?",
          "A área da superfície",
          ["O volume", "A altura"],
          "O material cobre a superfície.",
          {
            feedback: ["O volume é igual nas duas.", "Altura sozinha não determina a área."],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt:
      "Organize os passos para achar o menor caminho de uma formiga sobre a superfície de uma caixa.",
    labels: [
      "Escolher as faces que o caminho atravessa",
      "Planificar essas faces lado a lado no plano",
      "Traçar o segmento reto entre os pontos na planificação",
      "Comparar com as outras escolhas de faces e ficar com o menor",
    ],
    explanation:
      "Na planificação o caminho mais curto é reto; testar as combinações de faces garante o mínimo.",
  },
  justification: {
    prompts: [
      "Explique por que um cubo tem 12 arestas usando só as faces.",
      "Explique por que um cone tem um terço do volume do cilindro de mesma base e altura, usando uma comparação de recipientes.",
      "Explique por que o menor caminho sobre a superfície de um cubo de aresta 1, entre vértices opostos, mede √5 e não √3.",
    ],
    samples: [
      "O cubo tem 6 faces quadradas, cada uma com 4 arestas: 24 lados de faces. Mas cada aresta é o encontro de exatamente duas faces, então foi contada duas vezes. 24 ÷ 2 = 12. Pela relação de Euler, 8 − 12 + 6 = 2, o que confere.",
      "Um experimento clássico: enchendo um cone com água e despejando num cilindro de mesma base e altura, são necessários três cones cheios para encher o cilindro. A fórmula ⅓ × base × altura resume isso. A mesma razão vale para pirâmides e prismas.",
      "√3 é o comprimento da diagonal que passa por dentro do cubo, e a formiga não pode atravessar o interior. Andando na superfície, ela passa por duas faces vizinhas. Abrindo essas faces no plano, formam um retângulo 1 × 2, e o caminho reto entre os vértices mede √(1 + 4) = √5.",
    ],
    focus: "planificar para medir",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const lados = 5 + (seed % 6);
      const tipo = seed % 2 === 0 ? "prisma" : "pirâmide";
      const faces = tipo === "prisma" ? lados + 2 : lados + 1;
      const arestas = tipo === "prisma" ? 3 * lados : 2 * lados;
      const vertices = tipo === "prisma" ? 2 * lados : lados + 1;
      return c(
        "euler-prismas-piramides",
        `Um poliedro convexo com base de ${lados} lados tem ${vertices} vértices e ${faces} faces. Quantas arestas ele tem?`,
        `${arestas}`,
        [`${vertices + faces}`, `${vertices + faces + 2}`],
        `Pela relação de Euler, V − A + F = 2: ${vertices} − A + ${faces} = 2, então A = ${arestas}.`,
        {
          feedback: [
            "Somou vértices e faces sem subtrair 2.",
            "O sinal: A = V + F − 2, não V + F + 2.",
          ],
        },
      );
    }
    if (variant === 1) {
      const r = 2 + (seed % 5);
      const h = 3 * (1 + (seed % 4));
      const volume = (r * r * h) / 3;
      return c(
        "volume-do-cone",
        `Qual é o volume de um cone de raio ${r} e altura ${h}, em termos de π? Dê o coeficiente de π.`,
        `${volume}`,
        [`${r * r * h}`, `${(r * h) / 3}`],
        `⅓ × π × ${r}² × ${h} = ${volume}π.`,
        {
          feedback: [
            "Esse é o volume do cilindro de mesma base e altura; o cone tem um terço.",
            "Usou o raio sem elevar ao quadrado.",
          ],
        },
      );
    }
    const ternas: [number, number, number, number][] = [
      [6, 6, 7, 11],
      [1, 4, 8, 9],
      [2, 6, 9, 11],
      [4, 4, 7, 9],
      [3, 4, 12, 13],
      [2, 10, 11, 15],
    ];
    const [a, b, cc, d] = ternas[seed % 6] ?? [6, 6, 7, 11];
    return c(
      "diagonal-da-caixa",
      `Qual é o comprimento da diagonal de uma caixa com arestas ${a}, ${b} e ${cc}?`,
      `${d}`,
      [`${a + b + cc}`, `${d * d}`],
      `√(${a}² + ${b}² + ${cc}²) = √${d * d} = ${d}.`,
      {
        feedback: [
          "Somou as arestas; a diagonal usa Pitágoras em três dimensões.",
          "Esse é o quadrado da diagonal.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "espaco",
    title: "A embalagem mais econômica",
    prompt:
      "Escolha um volume de 1 litro e compare três embalagens possíveis (cubo, cilindro e paralelepípedo de proporções diferentes). Calcule as dimensões, a área de material de cada uma e discuta qual é mais econômica e qual é mais prática.",
    lab: null,
    steps: [
      "Calcule dimensões de três embalagens com volume de 1.000 cm³.",
      "Calcule a área total de cada uma.",
      "Compare, escolha uma e justifique considerando material e praticidade.",
    ],
    rubric: [
      "Dimensões corretas para o volume dado (0–3)",
      "Áreas calculadas corretamente (0–3)",
      "Comparação e escolha justificadas com dois critérios (0–3)",
      "Clareza e unidades corretas (0–1)",
    ],
  },
  homeSupport: [
    "Abram uma caixa de papelão com cuidado e vejam a planificação; tentem montar de novo com as faces em outra ordem.",
    "Comparem uma lata e uma caixa de leite de mesmo volume e discutam qual usa mais material.",
  ],
};
