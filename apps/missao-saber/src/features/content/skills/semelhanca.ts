import { c, n, type SkillPack } from "../skill-factory";

/**
 * Semelhança: figuras com a mesma forma, razão entre lados correspondentes,
 * teorema de Tales, sombras e a relação entre razão linear e razão de áreas.
 * Compartilhada por OBMEP N2 e Canguru C.
 */
export const semelhanca: SkillPack = {
  id: "semelhanca",
  name: "Semelhança e escala",
  domain: "common",
  lab: "grid",
  missions: [
    {
      title: "Figuras com a mesma forma",
      objective: "Reconhecer figuras semelhantes e a razão de semelhança.",
      introduction:
        "Duas figuras são semelhantes quando têm a mesma forma: os ângulos são iguais e todos os lados correspondentes guardam a mesma razão. Somar a mesma quantidade a cada lado não preserva a forma.",
      specs: [
        c(
          "reconhecer-semelhanca",
          "Dois retângulos têm lados 4 cm por 6 cm e 6 cm por 9 cm. Eles são semelhantes?",
          "Sim, porque 6 ÷ 4 = 9 ÷ 6 = 1,5",
          [
            "Não, porque os lados aumentaram valores diferentes: 2 e 3",
            "Só se tiverem a mesma área",
          ],
          "Semelhança exige razão constante entre lados correspondentes: 6 ÷ 4 = 1,5 e 9 ÷ 6 = 1,5.",
          {
            feedback: [
              "Semelhança compara por divisão, não por diferença.",
              "Área igual não é critério de semelhança; a forma é que precisa ser a mesma.",
            ],
          },
        ),
        n(
          "lado-correspondente",
          "Um triângulo tem lados 3 cm, 4 cm e 5 cm. Um triângulo semelhante tem o menor lado medindo 9 cm. Quanto mede o maior lado desse segundo triângulo, em cm?",
          15,
          "A razão é 9 ÷ 3 = 3; o maior lado é 5 × 3 = 15 cm.",
          { misreads: [{ value: 11, feedback: "Somou 6 a cada lado; a semelhança multiplica." }] },
        ),
        c(
          "reconhecer-semelhanca",
          "Qual transformação produz uma figura semelhante à original?",
          "Ampliar todos os lados na mesma razão",
          ["Aumentar 2 cm em cada lado", "Dobrar só a altura"],
          "Só a multiplicação de todas as medidas pelo mesmo número preserva a forma.",
          {
            feedback: [
              "Somar a mesma quantidade muda as proporções entre os lados.",
              "Dobrar uma dimensão só deforma a figura.",
            ],
          },
        ),
        n(
          "lado-correspondente",
          "Uma foto tem 10 cm por 15 cm. Ela é ampliada mantendo a forma, e o lado menor passa a medir 24 cm. Quanto passa a medir o lado maior, em cm?",
          36,
          "24 ÷ 10 = 2,4; 15 × 2,4 = 36 cm.",
          {
            misreads: [
              {
                value: 29,
                feedback: "Somou 14 cm ao lado maior, a mesma diferença do lado menor.",
              },
            ],
          },
        ),
        c(
          "criterio-de-angulos",
          "Dois triângulos têm ângulos de 40°, 60° e 80° e de 40°, 80° e 60°. Eles são:",
          "Semelhantes, pois têm os mesmos ângulos",
          [
            "Congruentes, pois têm os mesmos ângulos",
            "Não semelhantes, pois a ordem dos ângulos é diferente",
          ],
          "Ângulos iguais garantem a mesma forma; o tamanho pode variar.",
          {
            feedback: [
              "Ângulos iguais não garantem lados iguais; congruência exige mais.",
              "A ordem em que os ângulos são listados não muda a forma.",
            ],
          },
        ),
        n(
          "escala-como-semelhanca",
          "Em um mapa, um terreno retangular de 30 m por 50 m aparece com 6 cm por 10 cm. A escala do mapa é 1 : k. Qual é o valor de k?",
          500,
          "30 m = 3.000 cm; 3.000 ÷ 6 = 500. Conferindo com o outro lado: 5.000 ÷ 10 = 500.",
          { misreads: [{ value: 5, feedback: "Comparou metros com centímetros sem converter." }] },
        ),
        c(
          "lado-correspondente",
          "Um triângulo tem lados 6, 8 e 10. Qual conjunto de medidas forma um triângulo semelhante a ele?",
          "9, 12 e 15",
          ["8, 10 e 12", "6, 8 e 12"],
          "9 ÷ 6 = 12 ÷ 8 = 15 ÷ 10 = 1,5.",
          {
            feedback: [
              "8, 10 e 12 soma 2 a cada lado; as razões 8/6, 10/8 e 12/10 são diferentes.",
              "Mudou só o maior lado, e a forma muda.",
            ],
          },
        ),
        c(
          "razao-de-semelhanca",
          "Se a razão de semelhança de uma figura A para uma figura B é 2 : 5, então:",
          "Cada lado de B mede 2,5 vezes o lado correspondente de A",
          ["Cada lado de B é 3 cm maior que o de A", "A área de B é 2,5 vezes a área de A"],
          "Razão 2 : 5 significa que 2 unidades em A viram 5 em B: fator 2,5 nos lados.",
          {
            feedback: [
              "A razão é multiplicativa, não uma diferença fixa.",
              "A área cresce com o quadrado da razão: 6,25 vezes, e não 2,5.",
            ],
          },
        ),
      ],
    },
    {
      title: "Razão de semelhança e medidas",
      objective: "Calcular medidas desconhecidas por proporção entre lados correspondentes.",
      introduction:
        "Emparelhe os lados correspondentes antes de escrever a proporção. Perímetros e alturas seguem a mesma razão dos lados.",
      specs: [
        n(
          "lado-correspondente",
          "Os triângulos ABC e DEF são semelhantes, com AB correspondendo a DE e BC a EF. Se AB = 4, DE = 10 e BC = 6, quanto mede EF?",
          15,
          "A razão é 10 ÷ 4 = 2,5; EF = 6 × 2,5 = 15.",
          {
            misreads: [
              { value: 12, feedback: "Somou 6 a BC, repetindo a diferença entre DE e AB." },
            ],
          },
        ),
        c(
          "perimetros-semelhantes",
          "Dois triângulos semelhantes têm perímetros 24 cm e 36 cm. Um lado do menor mede 8 cm. Quanto mede o lado correspondente do maior?",
          "12 cm",
          ["20 cm", "18 cm"],
          "A razão dos perímetros é 36 ÷ 24 = 1,5, a mesma dos lados: 8 × 1,5 = 12 cm.",
          {
            feedback: [
              "20 cm soma a diferença dos perímetros ao lado.",
              "18 cm usa razão 2,25, o quadrado da razão de semelhança, que vale para áreas, não para lados.",
            ],
          },
        ),
        n(
          "sombras",
          "Um poste de 6 m projeta uma sombra de 4 m. No mesmo instante, uma árvore projeta uma sombra de 10 m. Qual é a altura da árvore, em m?",
          15,
          "6 ÷ 4 = h ÷ 10, então h = 15 m.",
          {
            misreads: [
              {
                value: 12,
                feedback:
                  "Somou 2 m à sombra, a diferença entre altura e sombra do poste, como se essa diferença fosse sempre a mesma.",
              },
            ],
          },
        ),
        c(
          "perimetros-semelhantes",
          "Em dois polígonos semelhantes, a razão entre lados correspondentes é 3 : 4. A razão entre os perímetros é:",
          "3 : 4",
          ["9 : 16", "1 : 2"],
          "O perímetro é uma soma de lados, então cresce na mesma razão que os lados.",
          {
            feedback: [
              "9 : 16 é a razão entre as áreas.",
              "1 : 2 não tem relação com 3 : 4; a razão dos perímetros é a mesma dos lados.",
            ],
          },
        ),
        n(
          "perimetros-semelhantes",
          "Um triângulo tem lados 5 cm, 7 cm e 9 cm. Um triângulo semelhante a ele tem perímetro 63 cm. Qual é o maior lado desse triângulo, em cm?",
          27,
          "O perímetro original é 21; a razão é 63 ÷ 21 = 3; 9 × 3 = 27 cm.",
          { misreads: [{ value: 51, feedback: "Somou ao lado a diferença entre os perímetros." }] },
        ),
        c(
          "escala-como-semelhanca",
          "Uma planta de casa está na escala 1 : 50. Uma sala mede 8 cm por 6 cm na planta. As medidas reais são:",
          "4 m por 3 m",
          ["400 m por 300 m", "8,5 m por 6,5 m"],
          "8 × 50 = 400 cm = 4 m; 6 × 50 = 300 cm = 3 m.",
          {
            feedback: [
              "Esqueceu de converter centímetros em metros.",
              "Tratou 8 e 6 como metros e somou 50 cm, em vez de multiplicar por 50 e converter.",
            ],
          },
        ),
        n(
          "alturas-semelhantes",
          "Dois triângulos são semelhantes na razão 2 : 3. Se uma altura do menor mede 6 cm, a altura correspondente do maior mede quantos centímetros?",
          9,
          "Alturas correspondentes seguem a razão dos lados: 6 × 3 ÷ 2 = 9 cm.",
          {
            misreads: [
              { value: 7, feedback: "Somou 1 cm, usando a diferença 3 − 2 em vez da razão." },
            ],
          },
        ),
        c(
          "reducao",
          "Ao reduzir uma figura na razão 5 : 2, um lado que media 15 cm passa a medir:",
          "6 cm",
          ["12 cm", "37,5 cm"],
          "Reduzir na razão 5 : 2 multiplica por 2/5: 15 × 2 ÷ 5 = 6 cm.",
          {
            feedback: [
              "12 cm subtrai 3 cm, sem usar a razão.",
              "37,5 cm amplia em vez de reduzir.",
            ],
          },
        ),
      ],
    },
    {
      version: 2,
      title: "Triângulos que se repetem",
      objective: "Usar retas paralelas e o teorema de Tales para achar segmentos.",
      introduction:
        "Uma reta paralela a um lado do triângulo recorta um triângulo menor semelhante ao grande. Os segmentos que ela determina nos outros lados são proporcionais.",
      specs: [
        n(
          "tales",
          "Em um triângulo ABC, uma reta paralela a BC corta AB em D e AC em E. Se AD = 4, DB = 6 e AE = 6, quanto mede EC?",
          9,
          "AD ÷ DB = AE ÷ EC: 4 ÷ 6 = 6 ÷ EC, então EC = 9.",
          { misreads: [{ value: 8, feedback: "Somou 2 a AE, copiando a diferença DB − AD." }] },
        ),
        c(
          "tales",
          "Três retas paralelas cortam duas transversais. Em uma transversal, os segmentos medem 3 cm e 5 cm; na outra, o primeiro segmento mede 6 cm. Quanto mede o segundo segmento da outra transversal?",
          "10 cm",
          ["8 cm", "12 cm"],
          "Pelo teorema de Tales, 3 ÷ 5 = 6 ÷ x, então x = 10 cm.",
          {
            feedback: [
              "8 cm soma 2 cm, a diferença entre 3 e 5.",
              "12 cm dobra o 6 sem relação com 3 e 5.",
            ],
          },
        ),
        n(
          "inclinacao-constante",
          "Uma rampa sobe 2 m a cada 5 m de distância horizontal. Uma pessoa está a 7,5 m do início da rampa, medidos na horizontal. A que altura ela está, em m?",
          3,
          "2 ÷ 5 = h ÷ 7,5, então h = 3 m.",
          {
            misreads: [
              {
                value: 4.5,
                feedback:
                  "Subtraiu de 7,5 a diferença 5 − 2 = 3, em vez de usar a proporção da rampa.",
              },
            ],
          },
        ),
        c(
          "triangulo-dentro-de-triangulo",
          "No triângulo ABC, o segmento DE é paralelo a BC, com D em AB e E em AC. Se AD = 3, AB = 9 e BC = 12, quanto mede DE?",
          4,
          [6, 8],
          "DE ÷ BC = AD ÷ AB = 3 ÷ 9 = 1/3; DE = 12 ÷ 3 = 4.",
          {
            feedback: [
              "6 usa a razão 1/2, como se D fosse o ponto médio de AB.",
              "8 usa DB ÷ AB = 6/9 em vez de AD ÷ AB.",
            ],
          },
        ),
        n(
          "espelho-no-chao",
          "Um espelho está no chão horizontal a 3 m de uma pessoa cujos olhos estão a 1,6 m do chão. Ela vê nele o topo de um prédio vertical cuja base está a 30 m do espelho, no mesmo nível do chão. Qual é a altura do prédio, em m?",
          16,
          "Os dois triângulos são semelhantes: 1,6 ÷ 3 = h ÷ 30, então h = 16 m.",
          {
            misreads: [
              { value: 31.6, feedback: "Somou 1,6 à distância; a semelhança multiplica." },
            ],
          },
        ),
        c(
          "base-media",
          "Em um triângulo, o segmento que liga os pontos médios de dois lados, em relação ao terceiro lado, é:",
          "Paralelo e mede a metade dele",
          ["Paralelo e mede o mesmo que ele", "Perpendicular e mede a metade dele"],
          "O triângulo formado é semelhante ao original na razão 1 : 2.",
          {
            feedback: [
              "Com razão 1 : 2, o segmento mede a metade, não o mesmo.",
              "O segmento é paralelo ao terceiro lado, não perpendicular.",
            ],
          },
        ),
        n(
          "sombras",
          "Uma pessoa de 1,8 m está a 4 m de um poste de luz e sua sombra, projetada pela lâmpada no topo do poste, mede 2 m. Qual é a altura do poste, em m?",
          5.4,
          "Os triângulos são semelhantes: 1,8 ÷ 2 = h ÷ (4 + 2), então h = 1,8 × 3 = 5,4 m.",
          {
            misreads: [
              {
                value: 3.6,
                feedback:
                  "Usou só a distância até o poste, esquecendo a sombra na base do triângulo maior.",
              },
            ],
          },
        ),
        c(
          "triangulo-dentro-de-triangulo",
          "Em um triângulo ABC, DE é paralelo a BC e divide AB de modo que AD : DB = 1 : 2. Então DE : BC é:",
          "1 : 3",
          ["1 : 2", "2 : 3"],
          "AD ÷ AB = 1 ÷ (1 + 2) = 1/3, e DE ÷ BC é igual a AD ÷ AB.",
          {
            feedback: [
              "1 : 2 compara AD com DB, não com AB inteiro.",
              "2 : 3 é a razão DB : AB, do outro pedaço.",
            ],
          },
        ),
      ],
    },
    {
      title: "Áreas de figuras semelhantes",
      objective: "Relacionar razão de semelhança e razão entre áreas.",
      introduction:
        "Se os lados ficam k vezes maiores, a área fica k² vezes maior: ela cresce nas duas direções. Sempre pergunte se a razão pedida é de comprimento ou de área.",
      specs: [
        c(
          "area-e-quadrado-da-razao",
          "Dobrando todos os lados de um quadrado, a área fica:",
          "4 vezes maior",
          ["2 vezes maior", "8 vezes maior"],
          "Área = lado²; (2L)² = 4L².",
          {
            feedback: [
              "A área cresce com o quadrado da razão, não com a razão.",
              "8 seria o fator do volume de um cubo, que cresce em três direções.",
            ],
          },
        ),
        n(
          "area-e-quadrado-da-razao",
          "Dois triângulos semelhantes têm razão de semelhança 3. Se a área do menor é 5 cm², qual é a área do maior, em cm²?",
          45,
          "A razão das áreas é 3² = 9; 5 × 9 = 45 cm².",
          {
            misreads: [
              { value: 15, feedback: "Multiplicou pela razão dos lados, não pelo quadrado dela." },
            ],
          },
        ),
        c(
          "area-em-escala",
          "Um mapa na escala 1 : 1.000 mostra um terreno com área de 4 cm². A área real do terreno é:",
          "400 m²",
          ["40 m²", "4.000 m²"],
          "1 cm vira 1.000 cm = 10 m; então 1 cm² vira 100 m²; 4 × 100 = 400 m².",
          {
            feedback: [
              "40 m² usa o fator 10 na área; o fator 10 é nas dimensões, e na área ele vale 100.",
              "4.000 m² multiplica a área por 1.000, a razão linear, e esquece a conversão de unidade.",
            ],
          },
        ),
        n(
          "area-e-quadrado-da-razao",
          "Duas pizzas redondas têm diâmetros 20 cm e 30 cm. A área da maior é quantas vezes a área da menor?",
          2.25,
          "A razão dos diâmetros é 1,5; a razão das áreas é 1,5² = 2,25.",
          { misreads: [{ value: 1.5, feedback: "Usou a razão dos diâmetros para a área." }] },
        ),
        c(
          "razao-a-partir-da-area",
          "Se a área de uma figura ampliada é 16 vezes a área da original, a razão de ampliação dos lados foi:",
          4,
          [16, 8],
          "k² = 16, então k = 4.",
          {
            feedback: [
              "16 é a razão das áreas, não dos lados.",
              "8 é a metade de 16, não sua raiz quadrada.",
            ],
          },
        ),
        n(
          "area-e-quadrado-da-razao",
          "Um triângulo tem área 18 cm². Um triângulo semelhante tem lados iguais a 2/3 dos lados originais. Qual é a área dele, em cm²?",
          8,
          "(2/3)² = 4/9; 18 × 4 ÷ 9 = 8 cm².",
          { misreads: [{ value: 12, feedback: "Multiplicou por 2/3 em vez de por (2/3)²." }] },
        ),
        c(
          "area-e-quadrado-da-razao",
          "Uma foto de 3 cm por 4 cm é ampliada para 15 cm por 20 cm. Quantas fotos do tamanho original cabem, em área, na ampliada?",
          25,
          [5, 10],
          "A razão linear é 5; a razão de áreas é 5² = 25.",
          {
            feedback: [
              "5 é a razão dos lados.",
              "10 soma as razões dos dois lados em vez de multiplicá-las.",
            ],
          },
        ),
        c(
          "area-e-quadrado-da-razao",
          "Dois hexágonos regulares têm lados 2 cm e 6 cm. A razão entre a área do maior e a do menor é:",
          "9 : 1",
          ["3 : 1", "6 : 1"],
          "A razão dos lados é 3; a razão das áreas é 3² = 9.",
          {
            feedback: [
              "3 : 1 é a razão dos lados e dos perímetros.",
              "6 : 1 é o dobro da razão dos lados, sem significado geométrico aqui.",
            ],
          },
        ),
      ],
    },
    {
      title: "Semelhança para argumentar",
      objective: "Combinar critérios de semelhança, escalas e áreas em problemas de várias etapas.",
      introduction:
        "Antes de calcular, diga por que as figuras são semelhantes (quais ângulos coincidem). Depois escolha a razão certa: linear para comprimentos, ao quadrado para áreas.",
      estimatedMinutes: 18,
      specs: [
        c(
          "criterio-de-angulos",
          "Para garantir que dois triângulos são semelhantes, basta que:",
          "Dois ângulos de um sejam iguais a dois ângulos do outro",
          ["Um lado de um seja proporcional a um lado do outro", "Os dois tenham a mesma área"],
          "Dois ângulos iguais determinam o terceiro: os triângulos têm a mesma forma.",
          {
            feedback: [
              "Um único par de lados não define a forma.",
              "Áreas iguais não garantem forma igual.",
            ],
          },
        ),
        n(
          "altura-por-semelhanca",
          "Um triângulo retângulo tem catetos 6 e 8 e hipotenusa 10. Qual é a medida da altura relativa à hipotenusa?",
          4.8,
          "A área é 6 × 8 ÷ 2 = 24, e também 10 × h ÷ 2; então h = 4,8.",
          {
            misreads: [
              {
                value: 7,
                feedback:
                  "Fez a média dos catetos; a altura vem da área ou da semelhança dos triângulos formados.",
              },
            ],
          },
        ),
        c(
          "escala-como-semelhanca",
          "Um modelo de avião na escala 1 : 40 tem envergadura de 75 cm. A envergadura real é:",
          "30 m",
          ["3 m", "300 m"],
          "75 × 40 = 3.000 cm = 30 m.",
          {
            feedback: ["3 m troca a unidade: 3.000 cm são 30 m.", "300 m multiplica por 400."],
          },
        ),
        n(
          "razao-a-partir-da-area",
          "Dois triângulos semelhantes têm áreas 20 cm² e 45 cm². Se um lado do menor mede 4 cm, quanto mede o lado correspondente do maior, em cm?",
          6,
          "A razão das áreas é 45 ÷ 20 = 9/4; a razão dos lados é 3/2; 4 × 3 ÷ 2 = 6 cm.",
          { misreads: [{ value: 9, feedback: "Multiplicou o lado pela razão das áreas." }] },
        ),
        c(
          "escala-como-semelhanca",
          "Em uma fotografia, uma pessoa de 1,7 m aparece com 3,4 cm, e um prédio ao lado dela, à mesma distância da câmera, aparece com 30 cm. A altura do prédio é:",
          "15 m",
          ["51 m", "1,5 m"],
          "1,7 m para 3,4 cm dá 0,5 m por centímetro; 30 × 0,5 = 15 m.",
          {
            feedback: [
              "51 multiplica 30 por 1,7 sem dividir por 3,4.",
              "1,5 m erra a unidade em 10 vezes.",
            ],
          },
        ),
        n(
          "reducao",
          "Um retângulo de 12 cm por 18 cm é reduzido, mantendo a forma, para caber em uma moldura de 8 cm de largura. Qual é o comprimento reduzido, em cm?",
          12,
          "A razão é 8 ÷ 12 = 2/3; 18 × 2 ÷ 3 = 12 cm.",
          {
            misreads: [
              { value: 14, feedback: "Subtraiu 4 cm de cada lado em vez de usar a razão." },
            ],
          },
        ),
        c(
          "corte-paralelo",
          "Um cone é cortado por um plano paralelo à base, na metade da altura. O raio do círculo do corte, em relação ao raio da base, é:",
          "A metade",
          ["Um quarto", "Igual"],
          "O corte forma um triângulo semelhante ao da seção do cone, com razão 1 : 2; o raio também fica na metade.",
          {
            feedback: [
              "Um quarto seria a razão das áreas dos círculos, não dos raios.",
              "Se fosse igual, o sólido seria um cilindro, não um cone.",
            ],
          },
        ),
        c(
          "area-e-quadrado-da-razao",
          "Um triângulo tem lados 5, 12 e 13, e outro tem lados 10, 24 e 26. A razão entre as áreas, do menor para o maior, é:",
          "1 : 4",
          ["1 : 2", "1 : 8"],
          "A razão de semelhança é 2, então as áreas ficam na razão 1 : 4.",
          {
            feedback: [
              "1 : 2 é a razão dos lados.",
              "1 : 8 seria a razão de volumes de sólidos semelhantes.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Organize um método para achar uma medida desconhecida em triângulos semelhantes.",
    labels: [
      "Identificar os ângulos iguais que garantem a semelhança",
      "Emparelhar os lados correspondentes dos dois triângulos",
      "Escrever a proporção entre lados correspondentes",
      "Resolver a proporção e conferir se a medida cabe na figura",
    ],
    explanation:
      "Primeiro justificamos a semelhança, depois emparelhamos os lados; só então escrevemos a proporção e conferimos o resultado no desenho.",
  },
  justification: {
    prompts: [
      "Explique por que dois quadrados quaisquer são sempre semelhantes, mas dois retângulos nem sempre são.",
      "Um colega diz que, ao dobrar os lados de um triângulo, a área também dobra. Mostre com um exemplo o que acontece de fato e explique.",
      "Explique como a sombra de um objeto e a de uma pessoa, medidas no mesmo instante, permitem descobrir a altura do objeto, e diga que condição precisa valer.",
    ],
    samples: [
      "Todo quadrado tem quatro ângulos retos e quatro lados iguais, então a razão entre os lados de dois quadrados é a mesma para todos os pares de lados: eles têm a mesma forma. Em dois retângulos os ângulos também são retos, mas a razão entre largura e comprimento pode ser diferente: 2 por 3 e 2 por 5 não são semelhantes.",
      "Um triângulo retângulo de catetos 3 e 4 tem área 6. Dobrando os lados, os catetos viram 6 e 8 e a área vira 24, quatro vezes maior. A área cresce nas duas direções, então fica multiplicada pelo quadrado da razão, que é 2² = 4.",
      "O sol está tão longe que seus raios chegam paralelos; por isso a pessoa e sua sombra e o objeto e sua sombra formam triângulos com os mesmos ângulos, logo semelhantes. Então altura da pessoa ÷ sombra da pessoa = altura do objeto ÷ sombra do objeto. A condição é medir as duas sombras no mesmo instante e em chão plano.",
    ],
    focus: "a razão constante entre lados correspondentes",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const sombraMastro = 2 + (seed % 3);
      const fator = 2 + (seed % 11);
      const alturaMastro = sombraMastro + 1 + (seed % 5);
      const sombraTorre = sombraMastro * fator;
      const answer = alturaMastro * fator;
      return c(
        "sombras-simultaneas",
        `A sombra de um mastro de ${alturaMastro} m mede ${sombraMastro} m enquanto a sombra de uma torre, ao lado, mede ${sombraTorre} m. Quanto mede a torre?`,
        `${answer} m`,
        [`${alturaMastro + sombraTorre - sombraMastro} m`, `${answer + alturaMastro} m`],
        `A razão altura ÷ sombra é a mesma: ${alturaMastro} ÷ ${sombraMastro} = h ÷ ${sombraTorre}, então h = ${answer} m.`,
        {
          feedback: [
            "Somou à altura do mastro a diferença das sombras; a semelhança multiplica.",
            "Não confere: a razão altura ÷ sombra precisa ser a mesma nos dois triângulos.",
          ],
        },
      );
    }
    if (variant === 1) {
      const razao = 3 + (seed % 3);
      const area = 3 + (seed % 11);
      const answer = area * razao * razao;
      return c(
        "area-ampliada",
        `Uma figura foi ampliada na razão ${razao}. A figura original tem área ${area} cm². Qual é a área da ampliação?`,
        `${answer} cm²`,
        [`${area * razao} cm²`, `${area * razao * 2} cm²`],
        `A área fica multiplicada por ${razao}² = ${razao * razao}: ${area} × ${razao * razao} = ${answer} cm².`,
        {
          feedback: [
            "Multiplicou pela razão dos lados; a área usa o quadrado da razão.",
            "Dobrou a razão em vez de elevá-la ao quadrado.",
          ],
        },
      );
    }
    const ad = 2 + (seed % 5);
    const multiplicador = 1 + (seed % 3);
    const ae = 3 + (seed % 7);
    const db = ad * multiplicador;
    const answer = ae * multiplicador;
    return c(
      "segmentos-proporcionais",
      `No triângulo ABC, o segmento DE é paralelo a BC, com D em AB e E em AC. Sabendo que AD = ${ad}, DB = ${db} e AE = ${ae}, quanto mede EC?`,
      answer,
      [answer + 2, answer - 1],
      `AD ÷ DB = AE ÷ EC: ${ad} ÷ ${db} = ${ae} ÷ EC, então EC = ${answer}.`,
      {
        feedback: [
          `Com EC = ${answer + 2}, a razão AE ÷ EC seria diferente de AD ÷ DB = ${ad} ÷ ${db}.`,
          `Com EC = ${answer - 1}, a razão AE ÷ EC não coincide com ${ad} ÷ ${db}.`,
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "semelhanca",
    title: "Medir o que não dá para alcançar",
    prompt:
      "Escolha algo alto perto de casa, como um poste ou uma árvore, e descubra sua altura sem subir nele, usando sombras ou um espelho no chão. Depois repita em outro horário e compare.",
    lab: "grid",
    steps: [
      "Desenhe os dois triângulos, marque as medidas que você conseguiu obter e explique por que eles são semelhantes.",
      "Escreva a proporção, calcule a altura e registre o resultado com a unidade.",
      "Refaça em outro horário ou com outro método; compare os resultados e explique de onde vêm as diferenças.",
    ],
    rubric: [
      "Semelhança justificada pelos ângulos, não só afirmada (0–2)",
      "Proporção montada com os lados correspondentes certos (0–3)",
      "Duas medições comparadas com discussão das diferenças (0–2)",
      "Desenho e registro que outra pessoa consegue reproduzir (0–1)",
    ],
  },
  homeSupport: [
    "Na rua, comparem a sombra de vocês dois e perguntem quem é mais alto só pelas sombras, e como saber quanto mais alto.",
    "Diante de uma planta de imóvel ou de um mapa de bairro, peça para estimar a medida real de um cômodo ou de uma quadra a partir da escala impressa.",
  ],
};
