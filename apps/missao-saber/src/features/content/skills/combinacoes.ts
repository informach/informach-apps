import { c, decimal, n, type SkillPack, sobrescrito } from "../skill-factory";

/**
 * Combinações: princípio multiplicativo, permutações com e sem repetição,
 * combinações, contagem por complementar e casos, e problemas com
 * restrições. Trilhas OBMEP N3, Canguru J e Canguru S.
 */
export const combinacoes: SkillPack = {
  id: "combinacoes",
  name: "Contagem e combinações",
  domain: "common",
  lab: "groups",
  missions: [
    {
      title: "Multiplicar escolhas",
      objective:
        "Usar o princípio multiplicativo e o aditivo com clareza sobre quando cada um vale.",
      introduction:
        "Escolhas em sequência se multiplicam; alternativas que se excluem se somam. A pergunta certa em cada etapa é: quantas opções sobram agora, dado o que já foi escolhido?",
      specs: [
        n(
          "multiplicativo",
          "Quantas senhas de 4 algarismos existem, permitindo repetição?",
          10000,
          "10 × 10 × 10 × 10 = 10.000.",
          { misreads: [{ value: 5040, feedback: "5.040 seria sem repetição (10 × 9 × 8 × 7)." }] },
        ),
        c(
          "multiplicativo",
          "Quantos números de 3 algarismos distintos podem ser formados com 1, 2, 3, 4 e 5?",
          "60",
          ["125", "15"],
          "5 × 4 × 3 = 60.",
          {
            feedback: [
              "125 permite repetição.",
              "15 é 5 × 3, sem contar as escolhas em sequência.",
            ],
          },
        ),
        n(
          "multiplicativo",
          "Um restaurante oferece 3 entradas, 4 pratos e 2 sobremesas. Quantas refeições completas diferentes existem?",
          24,
          "3 × 4 × 2 = 24.",
          {
            misreads: [
              {
                value: 9,
                feedback: "Somou; cada entrada combina com cada prato e cada sobremesa.",
              },
            ],
          },
        ),
        c(
          "multiplicativo",
          "Quantos números pares de 3 algarismos distintos podem ser formados com 1, 2, 3, 4, 5?",
          "24",
          ["60", "30"],
          "Último algarismo par: 2 opções; depois 4 × 3 para os outros: 2 × 12 = 24.",
          {
            feedback: [
              "60 é o total sem a restrição de par.",
              "30 seria metade do total, mas só 2 dos 5 algarismos são pares.",
            ],
          },
        ),
        n(
          "multiplicativo",
          "Quantas placas com 3 letras (26 possíveis) seguidas de 2 algarismos existem, com repetição?",
          1757600,
          "26³ × 10² = 17.576 × 100 = 1.757.600.",
          { misreads: [{ value: 175760, feedback: "175.760 usa um algarismo só." }] },
        ),
        c(
          "multiplicativo",
          "De quantas maneiras 4 pessoas podem sentar em 4 cadeiras em fila?",
          "24",
          ["16", "4"],
          "4 × 3 × 2 × 1 = 24.",
          {
            feedback: [
              "16 = 4 × 4 multiplica pessoas por cadeiras em vez de contar as opções que sobram.",
              "4 é só a escolha da primeira cadeira.",
            ],
          },
        ),
        n(
          "multiplicativo",
          "Quantos números de 3 algarismos (de 100 a 999) não têm nenhum algarismo igual a 0?",
          729,
          "9 × 9 × 9 = 729.",
          {
            misreads: [
              {
                value: 900,
                feedback:
                  "900 é o total de números de 3 algarismos; os com zero devem ser excluídos.",
              },
            ],
          },
        ),
        c(
          "multiplicativo",
          "Para ir da cidade A à C passando por B há 3 estradas de A a B e 2 de B a C. Quantos caminhos de ida e volta existem sem repetir estrada?",
          "12",
          ["36", "6"],
          "Ida: 3 × 2 = 6; volta sem repetir: 1 × 2 = 2; total 6 × 2 = 12.",
          {
            feedback: ["36 permite repetir as estradas na volta.", "6 é só a ida."],
          },
        ),
      ],
    },
    {
      title: "Ordem importa ou não?",
      objective: "Distinguir arranjos de combinações e calcular C(n, k).",
      introduction:
        "Quando a ordem importa, contam-se arranjos: n(n − 1)...(n − k + 1). Quando não importa, cada grupo foi contado k! vezes, então divide-se: C(n, k) = n!/(k!(n − k)!).",
      specs: [
        n(
          "combinacao",
          "De quantas maneiras podemos escolher 3 alunos de uma turma de 10 para uma comissão?",
          120,
          "C(10, 3) = 10 × 9 × 8 ÷ 6 = 120.",
          {
            misreads: [
              { value: 720, feedback: "720 conta a ordem; numa comissão a ordem não importa." },
            ],
          },
        ),
        c(
          "combinacao",
          "Numa corrida com 8 competidores, de quantas maneiras podem ser distribuídos ouro, prata e bronze?",
          "336",
          ["56", "24"],
          "8 × 7 × 6 = 336; a ordem importa.",
          {
            feedback: [
              "56 é C(8, 3), que ignora a ordem das medalhas.",
              "24 = 8 × 3 multiplica competidores por medalhas.",
            ],
          },
        ),
        n(
          "combinacao",
          "Quantas diagonais tem um polígono convexo de 12 lados?",
          54,
          "C(12, 2) − 12 = 66 − 12 = 54.",
          { misreads: [{ value: 66, feedback: "66 inclui os 12 lados." }] },
        ),
        c(
          "combinacao",
          "C(7, 2) e C(7, 5) são:",
          "Iguais, ambos 21",
          ["Diferentes: 21 e 42", "Diferentes: 42 e 21"],
          "Escolher 2 para entrar é o mesmo que escolher 5 para ficar de fora.",
          {
            feedback: ["C(7, 5) = C(7, 2) = 21.", "C(7, 2) = 21, não 42."],
          },
        ),
        n(
          "combinacao",
          "Quantos apertos de mão acontecem numa reunião de 15 pessoas se cada par se cumprimenta uma vez?",
          105,
          "C(15, 2) = 15 × 14 ÷ 2 = 105.",
          { misreads: [{ value: 210, feedback: "210 conta cada aperto duas vezes." }] },
        ),
        c(
          "combinacao",
          "Uma pizza pode ter até 3 sabores escolhidos entre 6, sem repetir, e pelo menos 1. Quantas pizzas diferentes existem?",
          "41",
          ["20", "56"],
          "C(6, 1) + C(6, 2) + C(6, 3) = 6 + 15 + 20 = 41.",
          {
            feedback: [
              "20 é só com exatamente 3 sabores.",
              "56 = C(8, 3) contaria 3 sabores podendo repetir; aqui não se repete e pode haver 1 ou 2 sabores.",
            ],
          },
        ),
        n(
          "combinacao",
          "De quantas maneiras podemos formar uma dupla e um trio a partir de 5 pessoas?",
          10,
          "Escolher a dupla determina o trio: C(5, 2) = 10.",
          {
            misreads: [
              {
                value: 100,
                feedback:
                  "100 multiplica C(5, 2) por C(5, 3), mas a escolha da dupla já fixa o trio.",
              },
            ],
          },
        ),
        c(
          "combinacao",
          "Numa estante, de quantas maneiras podemos dispor 5 livros diferentes se dois deles precisam ficar juntos?",
          "48",
          ["120", "24"],
          "Junte os dois num bloco: 4! arranjos do bloco com os outros, vezes 2 ordens internas: 48.",
          {
            feedback: ["120 é sem a restrição.", "24 esquece as 2 ordens dentro do bloco."],
          },
        ),
      ],
    },
    {
      title: "Contar pelo complementar",
      objective: "Contar 'pelo menos um' e 'nenhum' pelo complementar, e usar inclusão e exclusão.",
      introduction:
        "Muitas vezes é mais fácil contar o que não queremos e subtrair do total. 'Pelo menos um' é o total menos 'nenhum'. Quando duas condições se sobrepõem, soma-se cada uma e subtrai-se a interseção.",
      specs: [
        n(
          "complementar",
          "Quantas senhas de 3 algarismos têm pelo menos um algarismo 7?",
          271,
          "1.000 − 9³ = 1.000 − 729 = 271.",
          {
            misreads: [
              {
                value: 300,
                feedback:
                  "300 conta senhas com 7 em cada posição, mas repete as que têm mais de um 7.",
              },
            ],
          },
        ),
        c(
          "complementar",
          "Numa turma de 30 alunos, 18 gostam de futebol, 15 de vôlei e 8 gostam dos dois. Quantos não gostam de nenhum?",
          "5",
          ["22", "17"],
          "Gostam de pelo menos um: 18 + 15 − 8 = 25; não gostam: 30 − 25 = 5.",
          {
            feedback: [
              "22 tira só os 8 que gostam dos dois; o que se tira é quem gosta de pelo menos um, 25.",
              "17 é quantos gostam de só um dos dois esportes (10 + 7).",
            ],
          },
        ),
        n(
          "complementar",
          "Quantos inteiros de 1 a 1.000 não são divisíveis nem por 2 nem por 5?",
          400,
          "Por 2: 500; por 5: 200; por 10: 100. Por 2 ou 5: 600. Nenhum: 400.",
          {
            misreads: [
              {
                value: 300,
                feedback: "300 subtrai 700 sem descontar os múltiplos de 10 contados duas vezes.",
              },
            ],
          },
        ),
        c(
          "complementar",
          "De quantas maneiras 5 pessoas podem sentar em fila se Ana e Bia NÃO podem ficar juntas?",
          "72",
          ["48", "96"],
          "Total 120 menos as 48 em que ficam juntas: 72.",
          {
            feedback: [
              "48 é o número em que ficam juntas.",
              "96 subtrai 24, mas esquece as 2 ordens de Ana e Bia dentro do bloco.",
            ],
          },
        ),
        n(
          "complementar",
          "Lançando 3 moedas, em quantos dos 8 resultados aparece pelo menos uma cara?",
          7,
          "Só 1 resultado não tem cara (três coroas): 8 − 1 = 7.",
          {
            misreads: [{ value: 3, feedback: "3 conta só os resultados com exatamente uma cara." }],
          },
        ),
        c(
          "complementar",
          "Quantos números de 1 a 100 são múltiplos de 3 ou de 5?",
          "47",
          ["53", "40"],
          "33 + 20 − 6 = 47.",
          {
            feedback: [
              "53 soma sem descontar os múltiplos de 15.",
              "40 é 33 + 20 − 13, com a interseção errada.",
            ],
          },
        ),
        n(
          "complementar",
          "Quantos subconjuntos de {1, 2, 3, 4, 5} têm pelo menos 2 elementos?",
          26,
          "Total 32, menos 1 vazio e 5 unitários: 26.",
          {
            misreads: [
              {
                value: 31,
                feedback:
                  "31 tira só o conjunto vazio; os 5 unitários também têm menos de 2 elementos.",
              },
            ],
          },
        ),
        c(
          "complementar",
          "Contar 'pelo menos um' diretamente, somando 'exatamente um', 'exatamente dois' e assim por diante:",
          "Funciona, mas o complementar (total menos nenhum) costuma ser muito mais curto",
          ["Está sempre errado", "É a única maneira correta"],
          "Os dois caminhos dão o mesmo número; um deles é mais rápido.",
          {
            feedback: [
              "Somar casos disjuntos é correto.",
              "O complementar também é correto e mais direto.",
            ],
          },
        ),
      ],
    },
    {
      title: "Repetições e arrumações",
      objective: "Contar anagramas com letras repetidas, distribuições e caminhos em malha.",
      introduction:
        "Quando há objetos iguais, permutações que só trocam iguais entre si não são novas: divide-se pelo fatorial de cada repetição. Caminhos numa malha e distribuições de bolas em caixas são o mesmo tipo de conta.",
      specs: [
        n(
          "repeticao",
          "Quantos anagramas tem a palavra BANANA?",
          60,
          "6! ÷ (3! × 2!) = 720 ÷ 12 = 60.",
          {
            misreads: [{ value: 720, feedback: "720 trata as letras repetidas como diferentes." }],
          },
        ),
        c(
          "repeticao",
          "Numa malha, quantos caminhos mais curtos há de um canto ao canto oposto de um retângulo de 3 por 4 casas, andando pelas linhas da malha só para a direita e para cima?",
          "35",
          ["12", "7"],
          "7 passos, 3 para cima: C(7, 3) = 35.",
          {
            feedback: ["12 é 3 × 4, a área.", "7 é o número de passos."],
          },
        ),
        n(
          "repeticao",
          "Quantos anagramas da palavra ARARA começam com R?",
          4,
          "Fixando R, sobram A, A, A, R: 4! ÷ 3! = 4.",
          {
            misreads: [
              {
                value: 10,
                feedback: "10 é o total de anagramas de ARARA; os que começam com R são 4.",
              },
            ],
          },
        ),
        c(
          "repeticao",
          "De quantas maneiras podemos distribuir 7 balas iguais entre 3 crianças, podendo alguma ficar sem?",
          "36",
          ["15", "2.187"],
          "Barras e bolas: C(7 + 2, 2) = C(9, 2) = 36.",
          {
            feedback: [
              "15 = C(6, 2) seria com pelo menos uma bala para cada criança.",
              "2.187 = 3⁷ trata as balas como diferentes, cada uma escolhendo uma criança.",
            ],
          },
        ),
        n(
          "repeticao",
          "Quantas sequências de 5 letras usando só A e B têm exatamente 2 letras A?",
          10,
          "Escolher as 2 posições do A: C(5, 2) = 10.",
          {
            misreads: [
              { value: 32, feedback: "32 é o total de sequências, com qualquer número de A." },
            ],
          },
        ),
        c(
          "repeticao",
          "Quantos números de 4 algarismos podem ser formados usando os algarismos 1, 1, 2, 2?",
          "6",
          ["24", "4"],
          "4! ÷ (2! × 2!) = 6: 1122, 1212, 1221, 2112, 2121, 2211.",
          {
            feedback: [
              "24 trata os algarismos repetidos como diferentes.",
              "4 esquece arrumações como 1212.",
            ],
          },
        ),
        n(
          "repeticao",
          "De quantas maneiras 6 pessoas podem sentar em torno de uma mesa redonda, considerando iguais as disposições que só giram?",
          120,
          "(6 − 1)! = 120.",
          {
            misreads: [
              { value: 720, feedback: "720 conta cada disposição 6 vezes, uma para cada giro." },
            ],
          },
        ),
        c(
          "repeticao",
          "Quantas soluções inteiras não negativas tem x + y + z = 5?",
          "21",
          ["15", "125"],
          "C(5 + 2, 2) = C(7, 2) = 21.",
          {
            feedback: ["15 seria para soma 4.", "125 = 5³ não é uma contagem de soluções."],
          },
        ),
      ],
    },
    {
      title: "Contar com estratégia",
      objective:
        "Escolher a estratégia de contagem e organizar casos em problemas com várias restrições.",
      introduction:
        "Problemas de contagem se resolvem escolhendo bem a ordem das decisões: primeiro a restrição mais forte. Quando as restrições se misturam, divide-se em casos disjuntos e soma-se. Conferir com um caso pequeno evita erros de dupla contagem.",
      estimatedMinutes: 18,
      specs: [
        n(
          "estrategia",
          "Quantos números de 3 algarismos distintos, formados com 0 a 9, começam com algarismo ímpar e terminam com algarismo par?",
          200,
          "Primeiro: 5 ímpares; último: 5 pares; meio: 8 restantes. 5 × 5 × 8 = 200.",
          {
            misreads: [
              {
                value: 225,
                feedback: "225 desconta só um dos dois algarismos já usados; no meio sobram 8.",
              },
            ],
          },
        ),
        c(
          "estrategia",
          "Uma comissão de 4 pessoas será escolhida entre 5 mulheres e 4 homens, com pelo menos 2 mulheres. Quantas comissões existem?",
          "105",
          ["126", "60"],
          "Total C(9, 4) = 126, menos 0 mulheres (1) e 1 mulher (5 × 4 = 20): 105.",
          {
            feedback: [
              "126 é o total sem a restrição.",
              "60 é só o caso com exatamente 2 mulheres: C(5, 2) × C(4, 2) = 60.",
            ],
          },
        ),
        n(
          "estrategia",
          "Quantos números de 4 algarismos distintos existem?",
          4536,
          "Primeiro algarismo: 9 (não pode ser 0); depois 9 × 8 × 7. 9 × 9 × 8 × 7 = 4.536.",
          { misreads: [{ value: 5040, feedback: "5.040 permite o 0 na primeira posição." }] },
        ),
        c(
          "estrategia",
          "De quantas maneiras 3 meninos e 3 meninas podem sentar em fila alternando meninos e meninas?",
          "72",
          ["36", "720"],
          "Duas ordens (M-F-M-F-M-F ou F-M-F-M-F-M), cada uma com 3! × 3! = 36: 72.",
          {
            feedback: [
              "36 esquece que a fila pode começar por menino ou por menina.",
              "720 é sem a restrição de alternar.",
            ],
          },
        ),
        n(
          "estrategia",
          "Numa prova com 10 questões de verdadeiro ou falso, de quantas maneiras se pode responder acertando exatamente 8?",
          45,
          "Escolher as 2 erradas: C(10, 2) = 45.",
          { misreads: [{ value: 1024, feedback: "1.024 é o total de gabaritos possíveis." }] },
        ),
        c(
          "estrategia",
          "Quantos retângulos existem numa malha de 3 por 3 quadradinhos, contando todos os tamanhos?",
          "36",
          ["9", "14"],
          "Escolher 2 linhas entre 4 e 2 colunas entre 4: C(4, 2)² = 36.",
          {
            feedback: ["9 conta só os quadradinhos.", "14 conta só os quadrados (9 + 4 + 1)."],
          },
        ),
        n(
          "estrategia",
          "Numa reunião com 6 casais, cada pessoa cumprimenta todas as outras exceto o próprio par. Quantos cumprimentos acontecem?",
          60,
          "C(12, 2) − 6 = 66 − 6 = 60.",
          { misreads: [{ value: 66, feedback: "66 inclui os 6 cumprimentos entre pares." }] },
        ),
        c(
          "estrategia",
          "Ao contar 'números de 4 algarismos com pelo menos dois algarismos iguais', o melhor caminho é:",
          "Total menos os que têm todos os algarismos distintos",
          ["Somar os casos com exatamente 2, 3 e 4 iguais, sem organizar", "Listar todos"],
          "O complementar é uma única conta simples.",
          {
            feedback: [
              "Somar casos funciona, mas exige cuidado com posições e valores repetidos.",
              "Listar não é viável para milhares de números.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt:
      "Organize os passos para contar arrumações com uma restrição forte, como 'terminar em algarismo par'.",
    labels: [
      "Identificar a restrição mais forte",
      "Contar as opções para a posição restrita primeiro",
      "Contar as opções das demais posições descontando o que já foi usado",
      "Multiplicar e conferir com um caso pequeno",
    ],
    explanation:
      "Começar pela restrição evita casos; descontar o já usado evita repetir; o caso pequeno pega a dupla contagem.",
  },
  justification: {
    prompts: [
      "Explique por que C(10, 3) = 120 divide 10 × 9 × 8 por 6.",
      "Explique por que contar 'pelo menos um 7' entre 000 e 999 por 1.000 − 9³ é correto e por que 3 × 100 não é.",
      "Explique por que BANANA tem 60 anagramas e não 720.",
    ],
    samples: [
      "Escolhendo 3 alunos em ordem há 10 × 9 × 8 = 720 sequências. Mas uma comissão não tem ordem: o grupo {A, B, C} aparece 6 vezes nessa conta, uma para cada ordem (3! = 6). Cada grupo foi contado 6 vezes, então divido: 720 ÷ 6 = 120.",
      "O total é 1.000 senhas. As que não têm nenhum 7 usam 9 algarismos em cada posição: 9 × 9 × 9 = 729. O resto, 271, tem pelo menos um 7. Já 3 × 100 conta as senhas com 7 na primeira posição, com 7 na segunda e com 7 na terceira, mas uma senha como 777 é contada três vezes.",
      "Se as 6 letras fossem diferentes haveria 720 arrumações. Mas trocar os três A entre si não muda a palavra, e há 3! = 6 jeitos de fazer isso; trocar os dois N entre si também não muda, em 2! = 2 jeitos. Cada anagrama de verdade foi contado 6 × 2 = 12 vezes: 720 ÷ 12 = 60.",
    ],
    focus: "reconhecer o que foi contado mais de uma vez",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const k = 2 + (seed % 3);
      // 10 escolhe 3 e 7 escolhe 3 já aparecem nas missões.
      const n = (k === 3 && [7, 10].includes(6 + (seed % 7)) ? 7 : 6) + (seed % 7);
      const comb = (a: number, b: number) => {
        let r = 1;
        for (let i = 1; i <= b; i++) r = (r * (a - b + i)) / i;
        return r;
      };
      const fat = (a: number): number => (a <= 1 ? 1 : a * fat(a - 1));
      const resposta = comb(n, k);
      const arranjos = resposta * fat(k);
      return c(
        "escolher-comissao",
        `De quantas maneiras podemos escolher ${k} pessoas de um grupo de ${n} para uma comissão sem cargos?`,
        decimal(resposta),
        [decimal(arranjos), decimal(n * k)],
        `C(${n}, ${k}) = ${decimal(arranjos)} ÷ ${fat(k)} = ${decimal(resposta)}.`,
        {
          feedback: [
            "Contou a ordem; numa comissão sem cargos ela não importa.",
            "Multiplicou n por k, o que não conta grupos.",
          ],
        },
      );
    }
    if (variant === 1) {
      const posicoes = 3 + (seed % 2);
      const total = 10 ** posicoes;
      const semDigito = 9 ** posicoes;
      // Três algarismos com pelo menos um 7 já é uma missão.
      const digito = posicoes === 3 && 1 + (seed % 9) === 7 ? 8 : 1 + (seed % 9);
      return c(
        "pelo-menos-um-digito",
        `Quantas sequências de ${posicoes} algarismos (de ${"0".repeat(posicoes)} a ${"9".repeat(posicoes)}) têm pelo menos um algarismo ${digito}?`,
        decimal(total - semDigito),
        [decimal(posicoes * 10 ** (posicoes - 1)), decimal(semDigito)],
        `Total ${decimal(total)} menos as que não têm o ${digito}: ${decimal(total)} − 9${sobrescrito(posicoes)} = ${decimal(total - semDigito)}.`,
        {
          feedback: [
            "Somou os casos por posição, contando várias vezes as sequências com mais de um desses algarismos.",
            "Esse é o número de sequências sem o algarismo; a pergunta pede as que têm pelo menos um.",
          ],
        },
      );
    }
    const linhas = 2 + (seed % 3);
    // O retângulo 3 por 4 já é uma missão.
    const colunas =
      linhas === 3 && 3 + (Math.floor(seed / 3) % 3) === 4 ? 5 : 3 + (Math.floor(seed / 3) % 3);
    const comb = (a: number, b: number) => {
      let r = 1;
      for (let i = 1; i <= b; i++) r = (r * (a - b + i)) / i;
      return r;
    };
    const caminhos = comb(linhas + colunas, linhas);
    return c(
      "caminhos-na-malha",
      `Numa malha de ${linhas} por ${colunas} casas, quantos caminhos mais curtos levam do canto inferior esquerdo ao canto superior direito, andando pelas linhas da malha só para a direita e para cima?`,
      `${caminhos}`,
      [`${linhas * colunas}`, `${linhas + colunas}`],
      `São ${linhas + colunas} passos, dos quais ${linhas} para cima: C(${linhas + colunas}, ${linhas}) = ${caminhos}.`,
      {
        feedback: [
          "Esse é o número de casas, não de caminhos.",
          "Esse é o número de passos de cada caminho, não de caminhos.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "combinacoes",
    title: "Quantos jeitos de verdade",
    prompt:
      "Escolha uma situação da sua rotina com escolhas em sequência (um cardápio, uma senha, a ordem de tarefas) e conte de quantas maneiras ela pode acontecer. Depois acrescente uma restrição realista e conte de novo, explicando o método.",
    lab: "groups",
    steps: [
      "Descreva a situação e conte o total pelo princípio multiplicativo.",
      "Acrescente uma restrição (algo obrigatório ou proibido) e conte por casos ou pelo complementar.",
      "Confira com um caso pequeno listado à mão e explique a diferença entre os dois métodos.",
    ],
    rubric: [
      "Total correto com o princípio multiplicativo (0–2)",
      "Contagem com restrição correta e método nomeado (0–3)",
      "Conferência com caso pequeno listado (0–3)",
      "Explicação clara de por que os métodos coincidem (0–2)",
    ],
  },
  homeSupport: [
    "Ao montar um lanche ou escolher roupa, perguntem quantas combinações existem e o que muda se uma peça for obrigatória.",
    "Discutam por que uma senha de 4 dígitos tem 10.000 possibilidades e o que acontece ao proibir repetição.",
  ],
};
