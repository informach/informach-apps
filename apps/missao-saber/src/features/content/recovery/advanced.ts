import type { RecoveryBank } from "./types";

export const advancedRecovery: RecoveryBank = {
  funcoes: [
    [
      "learn:dominio-imagem",
      "Verifique quais operações limitam as entradas.",
      "Uma raiz quadrada real exige radicando não negativo; denominador não pode zerar.",
      [
        "Para f(x) = √(x − 7), qual é a menor entrada real permitida?",
        7,
        "É necessário x − 7 ≥ 0, logo x ≥ 7.",
      ],
      [
        "Para g(x) = 5/(2x + 6), qual é a única entrada real proibida?",
        -3,
        "2x + 6 = 0 em x = −3.",
      ],
    ],
    [
      "learn:quadratica",
      "O vértice é o ponto de máximo ou mínimo da parábola.",
      "Complete o quadrado ou use x = −b/(2a).",
      [
        "Uma receita é modelada por R(x) = −x² + 14x, com 0 ≤ x ≤ 14. Qual é o maior valor de R?",
        49,
        "R(x) = 49 − (x − 7)², cujo máximo é 49.",
      ],
      [
        "Qual é o menor valor de f(x) = (x + 4)² + 6, para x real?",
        6,
        "O quadrado vale no mínimo zero, em x = −4; o mínimo é 6.",
      ],
    ],
    [
      "learn:modelar",
      "Compor aplica primeiro a função de dentro.",
      [
        "Calcule a função de dentro e use seu resultado como entrada da função de fora.",
        "Na inversa, desfaça as operações na ordem contrária.",
      ],
      ["f(x) = x − 3 e g(x) = x² + 1. Quanto vale g(f(8))?", 26, "f(8) = 5, depois g(5) = 26."],
      ["Uma máquina faz y = 4x − 7. Qual entrada produz saída 45?", 13, "4x = 52, então x = 13."],
    ],
  ],
  recorrencias: [
    [
      "learn:soma-pa",
      "Em uma progressão aritmética, os pares das extremidades têm a mesma soma.",
      "Multiplique a média entre primeiro e último pela quantidade de termos.",
      [
        "Uma escada decorativa tem 10 degraus com 4, 7, 10, ... peças, aumentando sempre 3. Quantas peças há nos dez degraus?",
        175,
        "O último tem 31; a soma é 10 × (4 + 31)/2 = 175.",
      ],
      [
        "Um atleta corre 2 km no primeiro dia e aumenta 0,5 km por dia, durante 9 dias. Quantos km corre ao todo?",
        36,
        "No nono dia corre 6; soma 9 × (2 + 6)/2 = 36.",
      ],
    ],
    [
      "learn:pg",
      "Uma razão constante multiplica cada termo para obter o seguinte.",
      [
        "Depois de quatro etapas, o valor inicial foi multiplicado pela razão quatro vezes.",
        "Do primeiro ao enésimo termo há n − 1 multiplicações.",
      ],
      [
        "Um cultivo idealizado começa com 5 unidades e triplica a cada etapa. Quantas unidades há após 4 etapas?",
        405,
        "5 × 3⁴ = 405.",
      ],
      [
        "Uma sequência geométrica começa em 96 e cada termo é metade do anterior. Qual é o quinto termo?",
        6,
        "96, 48, 24, 12, 6.",
      ],
    ],
    [
      "learn:recorrencia",
      "Use os valores já encontrados para calcular o próximo.",
      "Aplique exatamente a regra da recorrência, sem supor diferença constante.",
      ["a₁ = 2 e aₙ₊₁ = 3aₙ − 1. Quanto vale a₄?", 41, "a₂ = 5, a₃ = 14, a₄ = 41."],
      [
        "b₁ = 1, b₂ = 4 e cada termo seguinte é a soma dos dois anteriores. Quanto vale b₆?",
        23,
        "A sequência começa 1, 4, 5, 9, 14, 23.",
      ],
    ],
  ],
  "estruturas-numericas": [
    [
      "learn:fatorar",
      "Decomponha o número em fatores primos.",
      "Divida por primos até todos os fatores serem primos.",
      ["Na fatoração prima de 756, qual é o expoente de 3?", 3, "756 = 4 × 189 = 2² × 3³ × 7."],
      [
        "Quantos divisores positivos tem 540?",
        24,
        "540 = 2² × 3³ × 5; há (2 + 1)(3 + 1)(1 + 1) = 24 divisores.",
      ],
    ],
    [
      "learn:mdc-mmc",
      "Para repartir sem sobras, procure divisores comuns; para reencontrar ciclos, múltiplos comuns.",
      "Use os menores expoentes no MDC e os maiores no MMC.",
      [
        "Fitas de 84 cm e 126 cm serão cortadas em pedaços iguais, do maior comprimento possível, sem sobras. Qual é esse comprimento em cm?",
        42,
        "MDC(84, 126) = 42.",
      ],
      [
        "Dois alarmes tocam juntos agora e repetem a cada 14 e 20 minutos. Após quantos minutos voltarão a tocar juntos pela primeira vez?",
        140,
        "MMC(14, 20) = 140.",
      ],
    ],
    [
      "learn:digitos",
      "O valor de um algarismo depende de sua posição decimal.",
      "Escreva um número de dois algarismos como 10a + b.",
      [
        "Um número de dois algarismos tem soma dos algarismos 11. Trocando-os, o número diminui 27. Qual é o número original?",
        74,
        "a + b = 11 e 9(a − b) = 27; a = 7, b = 4.",
      ],
      [
        "Um número de dois algarismos é 4 vezes a soma de seus algarismos. A dezena é 2. Qual é o número?",
        24,
        "20 + b = 4(2 + b), então b = 4.",
      ],
    ],
  ],
  "geometria-plana": [
    [
      "learn:angulos",
      "Use a soma dos ângulos internos e as relações de uma reta.",
      [
        "Em um triângulo, os três ângulos somam 180 graus.",
        "Os ângulos externos de um polígono convexo somam 360 graus; divida pelo ângulo de cada vértice.",
      ],
      [
        "Um triângulo tem ângulos 2x, 3x e 4x graus. Quanto vale x?",
        20,
        "9x = 180, portanto x = 20.",
      ],
      [
        "Um polígono regular tem ângulo externo de 24°. Quantos lados tem?",
        15,
        "Os ângulos externos somam 360°: 360/24 = 15.",
      ],
    ],
    [
      "learn:area",
      "Escolha uma base e sua altura perpendicular.",
      [
        "No triângulo, a área é metade do produto base × altura.",
        "No trapézio, some as bases, multiplique pela altura e divida por dois.",
      ],
      [
        "Um triângulo de base 17 cm tem área de 102 cm². Qual é a altura relativa a essa base, em cm?",
        12,
        "17h/2 = 102, logo h = 12.",
      ],
      [
        "Um trapézio tem bases 9 e 15 cm e altura 7 cm. Qual é sua área em cm²?",
        84,
        "(9 + 15) × 7/2 = 84.",
      ],
    ],
    [
      "learn:circulo",
      [
        "Um setor ocupa a mesma fração do círculo que seu ângulo ocupa de uma volta.",
        "Uma coroa circular é o círculo maior sem a região do círculo menor.",
      ],
      [
        "Multiplique a área total pela razão ângulo/360.",
        "Subtraia os quadrados dos raios para encontrar o coeficiente de π.",
      ],
      [
        "Um setor de 120° pertence a um círculo de raio 6 cm. Sua área é kπ cm². Quanto vale k?",
        12,
        "120/360 × 36π = 12π.",
      ],
      [
        "Uma coroa circular tem raios 8 cm e 3 cm. Sua área é kπ cm². Quanto vale k?",
        55,
        "π(8² − 3²) = 55π.",
      ],
    ],
  ],
  combinacoes: [
    [
      "learn:combinacao",
      "Escolher um grupo não atribui uma ordem a seus integrantes.",
      "Divida a contagem ordenada pelas permutações internas do grupo.",
      [
        "Doze pontos no plano não têm três alinhados. Quantos triângulos diferentes têm seus vértices entre esses pontos?",
        220,
        "Cada trio de pontos forma um triângulo: 12 × 11 × 10/3! = 220.",
      ],
      [
        "Um bilhete tem 14 números distintos. Escolhem-se exatamente 4 para marcar, sem importar a ordem das marcas. Quantos bilhetes diferentes podem ser preenchidos?",
        1001,
        "Escolhem-se quatro posições entre catorze: 14 × 13 × 12 × 11/4! = 1.001.",
      ],
    ],
    [
      "learn:complementar",
      "Conte o universo e retire os casos que não atendem à condição.",
      "O evento contrário a 'pelo menos um' é 'nenhum'.",
      [
        "Entre 6 pessoas há 2 médicas. Quantas duplas sem cargos incluem pelo menos uma médica?",
        9,
        "Há 15 duplas; as 4 não médicas formam 6 duplas. Restam 9.",
      ],
      [
        "Quantas sequências de quatro lançamentos de moeda contêm ao menos uma cara?",
        15,
        "Há 2⁴ = 16 sequências; retire a única com quatro coroas.",
      ],
    ],
    [
      "learn:repeticao",
      "Repetições indistinguíveis reduzem a quantidade de ordens diferentes.",
      "Divida as permutações pelo fatorial de cada quantidade repetida.",
      [
        "Quantos anagramas distintos tem BANANA?",
        60,
        "São 6 letras com três A e dois N: 6!/(3!2!) = 60.",
      ],
      [
        "Quantas sequências usam exatamente 4 fichas pretas idênticas e 2 brancas idênticas?",
        15,
        "Escolha as duas posições brancas entre seis: 6 × 5/2 = 15.",
      ],
    ],
  ],
  "probabilidade-em": [
    [
      "learn:condicional",
      "A condição reduz o universo considerado.",
      "Conte favoráveis somente entre os casos que satisfazem a condição.",
      [
        "Sorteia-se um inteiro de 1 a 24 com chances iguais. Sabendo que ele é múltiplo de 3, qual é a chance de ser par?",
        0.5,
        "Os oito possíveis são 3, 6, ..., 24; quatro são pares: 4/8.",
      ],
      [
        "Num grupo há 12 pessoas com bicicleta, das quais 5 também têm patins. Sorteia-se uniformemente alguém entre quem tem bicicleta. Qual é a chance de ter patins?",
        5 / 12,
        "A condição limita o total a 12; cinco atendem ao evento.",
      ],
    ],
    [
      "learn:regras",
      "A probabilidade da união soma os eventos e desconta a interseção.",
      "Use P(A ou B) = P(A) + P(B) − P(A e B).",
      [
        "P(A) = 0,45, P(B) = 0,35 e P(A e B) = 0,15. Quanto vale P(A ou B)?",
        0.65,
        "0,45 + 0,35 − 0,15 = 0,65.",
      ],
      [
        "Dois sensores independentes falham com probabilidades 0,2 e 0,1. Qual é a probabilidade de pelo menos um falhar?",
        0.28,
        "A chance de nenhum falhar é 0,8 × 0,9 = 0,72; o complemento é 0,28.",
      ],
    ],
    [
      "learn:contagem",
      "Conte o total e os resultados favoráveis sem misturar ordens.",
      [
        "Quando a seleção não considera ordem, use combinações nos dois lados.",
        "Nos dois dados, conte pares ordenados igualmente prováveis: (a, b) difere de (b, a).",
      ],
      [
        "Uma urna tem 4 bolas vermelhas e 3 azuis. Duas são sorteadas sem reposição, com chances iguais para cada bola disponível. Qual é a probabilidade de ambas serem azuis?",
        1 / 7,
        "C(3,2)/C(7,2) = 3/21 = 1/7.",
      ],
      [
        "Lançam-se dois dados comuns justos e independentes. Qual é a probabilidade de a soma ser 10?",
        1 / 12,
        "Os pares (4,6), (5,5), (6,4) são 3 entre 36: 1/12.",
      ],
    ],
  ],
  "argumentacao-em": [
    [
      "learn:implicacao",
      "Uma implicação equivale à sua contrapositiva.",
      "Negue a conclusão e a condição, invertendo sua ordem.",
      [
        "Qual é a contrapositiva de 'Se n é múltiplo de 6, então n é par'?",
        "Se n não é par, então n não é múltiplo de 6",
        "A contrapositiva de P ⇒ Q é não Q ⇒ não P.",
        ["Se n é par, então é múltiplo de 6", "Se n não é múltiplo de 6, então é ímpar"],
      ],
      [
        "Qual afirmação é equivalente a 'Se x > 5, então f(x) > 2'?",
        "Se f(x) ≤ 2, então x ≤ 5",
        "Negar > produz ≤; a contrapositiva preserva a validade.",
        ["Se f(x) > 2, então x > 5", "Se x ≤ 5, então f(x) ≤ 2"],
      ],
    ],
    [
      "learn:casos-absurdo",
      [
        "Uma prova por casos precisa incluir todas as possibilidades.",
        "Uma contradição mostra que a hipótese produz algo incompatível com ela.",
      ],
      [
        "Par e ímpar cobrem todos os inteiros.",
        "Compare M + 1 com a hipótese de que M seria o maior inteiro.",
      ],
      [
        "Para provar que n(n + 1) é par para todo inteiro n, qual divisão de casos é suficiente?",
        "n par ou n ímpar",
        "Se n é par, o produto tem fator par; se n é ímpar, n + 1 é par.",
        [
          "n positivo ou n negativo, omitindo zero",
          "n primo ou n composto, omitindo outros inteiros",
        ],
      ],
      [
        "Uma prova supõe que existe o maior inteiro M e constrói M + 1. Qual é a contradição?",
        "M + 1 é inteiro e maior que M",
        "A construção viola exatamente a hipótese de M ser o maior.",
        ["M + 1 deixa de ser inteiro", "M precisa ser negativo"],
      ],
    ],
    [
      "learn:ler-solucao",
      "Uma igualdade pode ter sido obtida por uma operação proibida.",
      "Antes de dividir, confira se o divisor pode ser zero.",
      [
        "De x² = x, alguém divide por x e conclui x = 1 como única solução. Qual solução foi perdida?",
        0,
        "A divisão excluiu x = 0, que satisfaz 0² = 0.",
      ],
      [
        "De (a − b)(a + b) = 0 com a = b, alguém cancela a − b. Qual é o problema?",
        "Dividiu por zero",
        "Como a = b, o fator cancelado é zero e não pode ser divisor.",
        ["Multiplicou por número negativo", "Usou soma de quadrados"],
      ],
    ],
  ],
  polinomios: [
    [
      "learn:divisao",
      "O resto da divisão por x − a é o valor do polinômio em a.",
      "Substitua a e calcule respeitando os sinais.",
      ["Qual é o resto de x³ − 4x + 9 na divisão por x − 2?", 9, "P(2) = 8 − 8 + 9 = 9."],
      [
        "P(x) = x³ + kx + 2 é divisível por x + 2. Qual é k?",
        -3,
        "P(−2) = −8 − 2k + 2 = 0; k = −3.",
      ],
    ],
    [
      "learn:girard",
      "Os coeficientes dão soma e produto das raízes, com atenção aos sinais.",
      "Em x² − Sx + P, as raízes somam S e multiplicam P.",
      [
        "As raízes de x² − 11x + 24 são a e b. Quanto vale a² + b²?",
        73,
        "(a + b)² − 2ab = 121 − 48 = 73.",
      ],
      [
        "As raízes não nulas de x² − 9x + 14 são a e b. Quanto vale 1/a + 1/b?",
        9 / 14,
        "1/a + 1/b = (a + b)/(ab) = 9/14.",
      ],
    ],
    [
      "learn:identidades",
      "Use uma identidade para agrupar produtos.",
      ["A diferença de quadrados é (a − b)(a + b).", "Use (x − y)² = (x + y)² − 4xy."],
      [
        "Calcule 103² − 97² sem expandir os dois quadrados.",
        1200,
        "(103 − 97)(103 + 97) = 6 × 200 = 1.200.",
      ],
      [
        "Se x + y = 13 e xy = 30, quanto vale (x − y)²?",
        49,
        "(x − y)² = (x + y)² − 4xy = 169 − 120 = 49.",
      ],
    ],
  ],
  inducao: [
    [
      "learn:estrutura",
      "A indução precisa de base e transmissão de um caso para o seguinte.",
      [
        "A hipótese serve para k; a conclusão a provar é o caso k + 1.",
        "Partindo da base 2 e avançando de 2 em 2, quais números são alcançados?",
      ],
      [
        "Para provar uma propriedade P(n) para todo inteiro n ≥ 4, qual deve ser o primeiro caso?",
        4,
        "A cadeia precisa começar em P(4).",
      ],
      [
        "Uma prova verifica P(2) e mostra P(k) ⇒ P(k + 2) para k ≥ 2. Quais inteiros ficam garantidos?",
        "Os pares a partir de 2",
        "Os passos preservam a paridade: 2, 4, 6, ...; não alcançam os ímpares.",
        ["Todos a partir de 2", "Só os ímpares a partir de 3"],
      ],
    ],
    [
      "learn:somas",
      "No passo indutivo, separe a soma antiga do termo novo.",
      "A diferença entre as fórmulas consecutivas deve ser o novo termo.",
      [
        "Na passagem de 1 + 3 + ... + (2k − 1) = k² para o caso k + 1, qual termo é acrescentado?",
        "2k + 1",
        "O próximo ímpar é 2(k + 1) − 1 = 2k + 1.",
        ["2k − 1", "k + 1"],
      ],
      [
        "A soma dos n primeiros múltiplos positivos de 5 é 5n(n + 1)/2. Quanto a soma aumenta de n = 8 para n = 9?",
        45,
        "Acrescenta-se apenas o nono múltiplo, 5 × 9 = 45.",
      ],
    ],
    [
      "learn:processos",
      "Verifique o que uma nova etapa acrescenta ao processo.",
      "Conte as partes novas e evite recontar as antigas.",
      [
        "Uma torre começa com 3 blocos. Em cada etapa são acrescentados 2 blocos. Depois de 7 etapas, quantos blocos há?",
        17,
        "A base é 3; após 7 acréscimos de 2, são 3 + 14 = 17.",
      ],
      [
        "Uma árvore finita começa com um vértice e nenhuma aresta. Cada passo adiciona um vértice ligado por uma aresta a um vértice antigo. Com 15 vértices, quantas arestas terá?",
        14,
        "A cada passo, vértices e arestas crescem juntos; a diferença permanece 1.",
      ],
    ],
  ],
  "coordenadas-em": [
    [
      "learn:distancia",
      "A distância combina as variações horizontal e vertical.",
      "Use a raiz da soma dos quadrados das diferenças.",
      [
        "Qual é a distância entre A(−4, 2) e B(8, 7)?",
        13,
        "As diferenças são 12 e 5: √(144 + 25) = 13.",
      ],
      [
        "Um ponto (x, 0), com x > 0, está a distância 10 de (0, 6). Qual é x?",
        8,
        "x² + 6² = 100; x² = 64, x = 8.",
      ],
    ],
    [
      "learn:intersecao",
      "No encontro de duas retas, o ponto satisfaz as duas equações.",
      [
        "Iguale as expressões para y e resolva x.",
        "Some as equações para eliminar y; depois substitua x e descubra y.",
      ],
      [
        "As retas y = 4x − 9 e y = x + 6 se encontram em qual coordenada x?",
        5,
        "4x − 9 = x + 6; 3x = 15.",
      ],
      [
        "No encontro de x + y = 11 e 2x − y = 7, qual é a coordenada y?",
        5,
        "Somando: 3x = 18, x = 6; y = 5.",
      ],
    ],
    [
      "learn:area-circ",
      "A equação reduzida revela centro e raio da circunferência.",
      "Compare (x − a)² + (y − b)² = r².",
      ["Qual é o raio da circunferência (x − 5)² + (y + 2)² = 81?", 9, "r² = 81, portanto r = 9."],
      [
        "Qual é a coordenada y do centro da circunferência (x + 3)² + (y − 7)² = 16?",
        7,
        "O centro é (−3, 7); o sinal dentro do parêntese é o oposto.",
      ],
    ],
  ],
  "equacoes-em": [
    [
      "learn:segundo-grau",
      "Use fatoração, completar quadrados ou discriminante.",
      "Depois de achar as raízes, confira a restrição do enunciado.",
      ["Qual é a maior raiz de x² − 13x + 36 = 0?", 9, "(x − 4)(x − 9) = 0; a maior raiz é 9."],
      [
        "Para qual valor de k a equação x² − 10x + k = 0 tem uma raiz real dupla?",
        25,
        "O discriminante deve ser zero: 100 − 4k = 0.",
      ],
    ],
    [
      "learn:modulo-raiz",
      [
        "Raízes quadradas reais exigem radicando não negativo.",
        "O módulo pode corresponder a uma expressão positiva ou negativa.",
      ],
      [
        "Ao elevar ao quadrado, verifique a solução na expressão original.",
        "Resolva 2x − 3 = 7 e 2x − 3 = −7; some as duas soluções.",
      ],
      ["Resolva √(3x + 4) = 5. Qual é x?", 7, "3x + 4 = 25 dá x = 7, que confere na raiz."],
      [
        "Qual é a soma das soluções reais de |2x − 3| = 7?",
        3,
        "2x − 3 = 7 ou −7; x = 5 ou −2, soma 3.",
      ],
    ],
    [
      "learn:exp-log",
      [
        "Reescreva os dois lados usando a mesma base.",
        "Um logaritmo informa o expoente de uma potência.",
      ],
      [
        "Bases positivas diferentes de 1 permitem igualar os expoentes.",
        "Reescreva o logaritmo como x − 1 = 2⁵ e isole x.",
      ],
      ["Se 3^(x + 1) = 81, qual é x?", 3, "81 = 3⁴; x + 1 = 4."],
      ["Se log₂(x − 1) = 5, qual é x?", 33, "x − 1 = 2⁵ = 32, logo x = 33."],
    ],
  ],
  trigonometria: [
    [
      "learn:razoes",
      "Identifique cateto oposto, adjacente e hipotenusa para o ângulo indicado.",
      "Seno é oposto/hipotenusa; cosseno é adjacente/hipotenusa.",
      [
        "Num triângulo retângulo, o cateto oposto a θ mede 8 e a hipotenusa mede 17. Quanto vale sen θ?",
        8 / 17,
        "sen θ = 8/17.",
      ],
      [
        "Num triângulo retângulo, cos θ = 12/13 e a hipotenusa mede 26 cm. Qual é o cateto adjacente a θ, em cm?",
        24,
        "Adjacente/26 = 12/13, então adjacente = 24.",
      ],
    ],
    [
      "learn:leis",
      "Quando o triângulo não é retângulo, use os dados de lados e ângulo entre eles.",
      "A lei dos cossenos diz a² = b² + c² − 2bc cos A.",
      [
        "Dois lados de um triângulo medem 5 e 8 e formam ângulo de 60°. Qual é o lado oposto a esse ângulo?",
        7,
        "a² = 25 + 64 − 80 × 1/2 = 49; a = 7.",
      ],
      [
        "Dois lados de comprimento 4 formam ângulo de 120°. Qual é o quadrado do lado oposto?",
        48,
        "a² = 16 + 16 − 32 × (−1/2) = 48.",
      ],
    ],
    [
      "learn:area-seno",
      "A altura pode ser obtida com o seno do ângulo entre dois lados.",
      "Use área = bc sen A/2.",
      [
        "Dois lados de um triângulo medem 9 e 14 cm e formam 30°. Qual é a área em cm²?",
        31.5,
        "9 × 14 × 1/2 ÷ 2 = 31,5.",
      ],
      [
        "Dois lados medem 6 e 10 cm e a área é 15 cm². Quanto vale o seno do ângulo entre esses lados?",
        0.5,
        "15 = 6 × 10 × sen A/2; sen A = 1/2.",
      ],
    ],
  ],
  espaco: [
    [
      "learn:euler",
      "Para poliedros convexos, vértices, arestas e faces se relacionam.",
      "Use V − A + F = 2.",
      [
        "Um poliedro convexo tem 14 vértices e 9 faces. Quantas arestas tem?",
        21,
        "A = V + F − 2 = 14 + 9 − 2 = 21.",
      ],
      [
        "Um prisma tem bases pentagonais. Quantas arestas possui?",
        15,
        "Há 5 em cada base e 5 ligando as bases: 15.",
      ],
    ],
    [
      "learn:volume",
      "O volume de um prisma é área da base vezes altura.",
      "Na pirâmide, divida por três o prisma de mesma base e altura.",
      [
        "Um prisma reto tem base triangular de área 18 cm² e altura 7 cm. Qual é seu volume em cm³?",
        126,
        "18 × 7 = 126 cm³.",
      ],
      [
        "Uma pirâmide tem base quadrada de lado 9 cm e altura 8 cm. Qual é seu volume em cm³?",
        216,
        "9² × 8/3 = 216 cm³.",
      ],
    ],
    [
      "learn:coordenadas-espaco",
      "As três direções perpendiculares entram no cálculo da distância.",
      "Some os quadrados das diferenças em x, y e z.",
      ["Qual é a distância entre (0, 0, 0) e (2, 3, 6)?", 7, "√(4 + 9 + 36) = √49 = 7."],
      [
        "Uma caixa retangular tem arestas 4, 4 e 7 cm. Quanto mede a diagonal interna em cm?",
        9,
        "√(16 + 16 + 49) = 9 cm.",
      ],
    ],
  ],
  "logica-em": [
    [
      "learn:conectivos",
      "Uma implicação só é falsa com condição verdadeira e conclusão falsa.",
      "O 'ou' inclusivo aceita que ambos os lados sejam verdadeiros.",
      [
        "P é falsa e Q é verdadeira. Qual é o valor lógico de (P ou Q) e não P?",
        "Verdadeiro",
        "P ou Q é verdadeiro e não P também é verdadeiro.",
        ["Falso", "Indeterminado"],
      ],
      [
        "P é verdadeira e Q é falsa. Qual é o valor lógico de P ⇒ Q?",
        "Falso",
        "Essa é exatamente a combinação que torna uma implicação falsa.",
        ["Verdadeiro", "Indeterminado"],
      ],
    ],
    [
      "learn:quantificadores",
      "Negar uma frase com quantificadores troca 'todo' por 'existe' e vice-versa.",
      "Negue também a propriedade final.",
      [
        "Qual é a negação de 'Para todo x real, existe y real tal que y > x'?",
        "Existe x real tal que todo y real satisfaz y ≤ x",
        "A negação de ∀x ∃y P é ∃x ∀y não P.",
        [
          "Para todo x real, existe y real que satisfaz y ≤ x",
          "Existe x real e existe y real que satisfazem y > x",
        ],
      ],
      [
        "A frase 'Existe um inteiro maior que todos os outros inteiros' é verdadeira?",
        "Não",
        "Para qualquer candidato n, o inteiro n + 1 é maior.",
        ["Sim, é o zero", "Sim, mas não se conhece esse inteiro"],
      ],
    ],
    [
      "learn:validade",
      "Validade exige que a conclusão siga das premissas.",
      "Uma conclusão verdadeira por acaso não torna a forma do argumento válida.",
      [
        "Se estudo, aprendo. Aprendi. Logo, estudei. Qual é o problema lógico?",
        "Afirmou o consequente",
        "Aprender pode ter outras causas; a premissa não afirma a volta da implicação.",
        ["Usou corretamente a contrapositiva", "Negou o antecedente"],
      ],
      [
        "Todos os A são B; nenhum B é C. Pode existir algo que seja A e C?",
        "Não",
        "Se fosse A, seria B; mas B e C são disjuntos.",
        ["Sim, necessariamente existe", "Sim, todo C é A"],
      ],
    ],
  ],
};
