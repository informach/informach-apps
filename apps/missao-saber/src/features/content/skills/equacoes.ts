import { c, n, type SkillPack } from "../skill-factory";

/**
 * Equações do 1º grau e sistemas simples: traduzir uma situação em igualdade,
 * resolver mantendo o equilíbrio e conferir a solução no contexto.
 * Compartilhada por OBMEP N2 e Canguru C.
 */
export const equacoes: SkillPack = {
  id: "equacoes",
  name: "Equações e incógnitas",
  domain: "common",
  lab: "bars",
  missions: [
    {
      title: "Da frase à igualdade",
      objective: "Traduzir enunciados em expressões e equações com uma incógnita.",
      introduction:
        "Uma equação é uma balança: os dois lados valem o mesmo. O primeiro passo é nomear o que não se sabe e escrever a igualdade que a história descreve.",
      specs: [
        c(
          "traduzir-enunciado",
          "Um número somado ao seu dobro dá 27. Qual equação descreve essa frase, chamando o número de x?",
          "x + 2x = 27",
          ["x + 2 = 27", "2x = 27"],
          "O dobro de x é 2x; a soma do número com o dobro é x + 2x, e isso vale 27.",
          {
            feedback: [
              "Somou 2 em vez de somar o dobro do número.",
              "Deixou de fora o próprio número na soma.",
            ],
          },
        ),
        n(
          "resolver-um-passo",
          "Se x + 15 = 42, qual é o valor de x?",
          27,
          "Tirando 15 dos dois lados: x = 42 − 15 = 27.",
          { misreads: [{ value: 57, feedback: "Somou 15 em vez de subtrair dos dois lados." }] },
        ),
        c(
          "traduzir-enunciado",
          "Ana tem o triplo da idade de seu irmão. Se o irmão tem i anos, a idade de Ana é:",
          "3i",
          ["i + 3", "i ÷ 3"],
          "Triplo significa três vezes: 3 × i = 3i.",
          {
            feedback: [
              "Somar 3 daria três anos a mais, não o triplo.",
              "Dividir por 3 daria a terça parte, o contrário do triplo.",
            ],
          },
        ),
        n(
          "resolver-um-passo",
          "Se 6y = 84, qual é o valor de y?",
          14,
          "Dividindo os dois lados por 6: y = 84 ÷ 6 = 14.",
          { misreads: [{ value: 78, feedback: "Subtraiu 6 em vez de dividir por 6." }] },
        ),
        c(
          "conferir-solucao",
          "Qual valor de x torna verdadeira a igualdade 4x − 7 = 21?",
          7,
          [3.5, 5],
          "4x = 21 + 7 = 28, então x = 7. Conferindo: 4 × 7 − 7 = 21.",
          {
            feedback: [
              "3,5 vem de 4x = 21 − 7; ao passar o −7 para o outro lado, ele vira +7.",
              "5 não confere: 4 × 5 − 7 = 13, e não 21.",
            ],
          },
        ),
        n(
          "traduzir-enunciado",
          "O perímetro de um quadrado de lado L é 52 cm. Qual é o valor de L, em cm?",
          13,
          "4L = 52, então L = 13 cm.",
          {
            misreads: [
              { value: 26, feedback: "Dividiu por 2, como se o quadrado tivesse dois lados." },
            ],
          },
        ),
        c(
          "expressao-com-variavel",
          "Um táxi cobra R$ 5 fixos mais R$ 2 por quilômetro. Qual expressão dá o preço de uma corrida de k quilômetros?",
          "5 + 2k",
          ["7k", "2 + 5k"],
          "A parte fixa não depende de k; a parte variável é 2 por quilômetro: 5 + 2k.",
          {
            feedback: [
              "7k multiplica também a parte fixa pelos quilômetros.",
              "Trocou os papéis: 5 é o valor fixo e 2 é o valor por quilômetro.",
            ],
          },
        ),
        c(
          "conferir-solucao",
          "Para a equação 3(x + 2) = 24, qual é o valor de x?",
          6,
          [8, 22],
          "Dividindo por 3: x + 2 = 8, então x = 6.",
          {
            feedback: [
              "8 é o valor de x + 2, falta tirar o 2.",
              "22 subtrai 2 de 24 sem dividir por 3 antes.",
            ],
          },
        ),
      ],
    },
    {
      title: "Mantendo o equilíbrio",
      objective: "Resolver equações com a incógnita nos dois lados e com parênteses.",
      introduction:
        "O que se faz de um lado, faz-se do outro. Reúna os termos com incógnita de um lado e os números do outro, um passo por vez.",
      specs: [
        n(
          "incognita-nos-dois-lados",
          "Resolva: 5x − 4 = 3x + 10. Qual é o valor de x?",
          7,
          "5x − 3x = 10 + 4, ou seja, 2x = 14, então x = 7.",
          {
            misreads: [
              {
                value: 3,
                feedback: "Subtraiu 4 de 10 em vez de somar ao passar para o outro lado.",
              },
            ],
          },
        ),
        c(
          "incognita-nos-dois-lados",
          "Na equação 2(x − 3) = x + 5, o valor de x é:",
          11,
          [8, "−1"],
          "2x − 6 = x + 5, então 2x − x = 5 + 6 e x = 11.",
          {
            feedback: [
              "8 esquece de multiplicar o 3 por 2 ao abrir os parênteses.",
              "−1 troca o sinal do 6 ao passar para o outro lado: fez 5 − 6 em vez de 5 + 6.",
            ],
          },
        ),
        n(
          "incognita-nos-dois-lados",
          "Resolva: 7 − 2x = 3x − 8. Qual é o valor de x?",
          3,
          "7 + 8 = 3x + 2x, ou seja, 15 = 5x, então x = 3.",
          {
            misreads: [
              {
                value: -1,
                feedback:
                  "Errou os sinais ao passar os termos: fez 7 − 8 = 3x − 2x. O certo é 7 + 8 = 3x + 2x.",
              },
            ],
          },
        ),
        c(
          "equacao-com-fracao",
          "Qual é a solução de x/3 + 4 = 9?",
          15,
          [5, 39],
          "x/3 = 9 − 4 = 5, então x = 5 × 3 = 15.",
          {
            feedback: [
              "5 é o valor de x/3; falta multiplicar por 3.",
              "39 multiplica o 13 por 3 depois de somar 4 e 9, invertendo a ordem das operações.",
            ],
          },
        ),
        n(
          "equacao-com-fracao",
          "Resolva: (2x + 1)/5 = 3. Qual é o valor de x?",
          7,
          "2x + 1 = 15, então 2x = 14 e x = 7.",
          {
            misreads: [
              {
                value: 8,
                feedback: "Somou 1 aos dois lados em vez de subtrair depois de multiplicar por 5.",
              },
            ],
          },
        ),
        c(
          "conferir-solucao",
          "Qual afirmação sobre a equação 4x + 6 = 4x − 2 está correta?",
          "Não tem solução",
          ["A solução é x = −2", "A solução é x = 0"],
          "Tirando 4x dos dois lados sobra 6 = −2, que é falso para qualquer x: 6 nunca é igual a −2.",
          {
            feedback: [
              "Com x = −2: 4(−2) + 6 = −2 e 4(−2) − 2 = −10, lados diferentes.",
              "Com x = 0: 6 e −2, lados diferentes.",
            ],
          },
        ),
        n(
          "incognita-nos-dois-lados",
          "Resolva: 3(x + 4) − 2 = 2(x + 9). Qual é o valor de x?",
          8,
          "3x + 12 − 2 = 2x + 18; 3x + 10 = 2x + 18; x = 8.",
          { misreads: [{ value: 6, feedback: "Esqueceu o −2 do lado esquerdo." }] },
        ),
        c(
          "conferir-solucao",
          "Um estudante encontrou x = 4 para 5x − 3 = 2x + 9. A conferência mostra que:",
          "Está certo: os dois lados valem 17",
          [
            "Está errado: o lado esquerdo vale 17 e o direito, 13",
            "Está errado: a solução é x = 2",
          ],
          "5 × 4 − 3 = 17 e 2 × 4 + 9 = 17; os dois lados coincidem.",
          {
            feedback: ["2 × 4 + 9 é 17, não 13.", "Com x = 2: 7 e 13, lados diferentes."],
          },
        ),
      ],
    },
    {
      title: "Problemas que viram equações",
      objective: "Modelar situações com uma incógnita e interpretar a solução.",
      introduction:
        "Escolha a incógnita com cuidado, escreva as outras quantidades em função dela e só então monte a igualdade. No fim, volte ao problema para ver se a resposta faz sentido.",
      specs: [
        n(
          "modelar-com-uma-incognita",
          "A soma de três números consecutivos é 72. Qual é o menor deles?",
          23,
          "n + (n + 1) + (n + 2) = 72, então 3n + 3 = 72 e n = 23.",
          { misreads: [{ value: 24, feedback: "24 é o número do meio, a média dos três." }] },
        ),
        c(
          "modelar-com-uma-incognita",
          "Um retângulo tem o comprimento 5 cm maior que a largura e perímetro 50 cm. Qual é a largura?",
          "10 cm",
          ["15 cm", "20 cm"],
          "2L + 2(L + 5) = 50, então 4L + 10 = 50 e L = 10 cm.",
          {
            feedback: [
              "15 cm é o comprimento, não a largura.",
              "20 cm ignora o dobro dos lados no perímetro.",
            ],
          },
        ),
        n(
          "modelar-com-uma-incognita",
          "Pedro tem o dobro do dinheiro de Lia. Juntos têm R$ 96. Quanto tem Lia, em reais?",
          32,
          "L + 2L = 96, então 3L = 96 e L = 32.",
          {
            misreads: [
              { value: 48, feedback: "Dividiu ao meio, como se os dois tivessem o mesmo." },
            ],
          },
        ),
        c(
          "modelar-com-uma-incognita",
          "Daqui a 6 anos, a idade de Bia será o triplo da idade que ela tinha há 4 anos. Qual é a idade atual de Bia?",
          9,
          [5, 12],
          "x + 6 = 3(x − 4), então x + 6 = 3x − 12 e x = 9.",
          {
            feedback: [
              "Com 5 anos: daqui a 6 terá 11, e há 4 anos tinha 1; o triplo de 1 é 3, não 11.",
              "Com 12 anos: 18 e 8; o triplo de 8 é 24, não 18.",
            ],
          },
        ),
        n(
          "modelar-com-uma-incognita",
          "Em uma prova de 20 questões, cada acerto vale 5 pontos e cada erro tira 2. Quem acertou a questões e errou o resto fez 65 pontos. Quantas acertou?",
          15,
          "5a − 2(20 − a) = 65, então 7a − 40 = 65 e a = 15.",
          {
            misreads: [
              { value: 13, feedback: "Dividiu 65 por 5, ignorando os pontos perdidos nos erros." },
            ],
          },
        ),
        c(
          "modelar-com-uma-incognita",
          "Um número aumentado de 20% resulta em 90. Que número é esse?",
          75,
          [72, 108],
          "1,2x = 90, então x = 75.",
          {
            feedback: [
              "72 tira 20% de 90, mas o aumento foi sobre o número original, não sobre 90.",
              "108 aumenta 90 em 20% em vez de desfazer o aumento.",
            ],
          },
        ),
        n(
          "modelar-com-uma-incognita",
          "Uma caixa de canetas custa o mesmo que 4 lápis, e 3 caixas mais 2 lápis custam R$ 42. Quanto custa um lápis, em reais?",
          3,
          "Se o lápis custa p, a caixa custa 4p: 3 × 4p + 2p = 14p = 42, então p = 3.",
          {
            misreads: [
              { value: 14, feedback: "Dividiu 42 por 3, ignorando que cada caixa vale 4 lápis." },
            ],
          },
        ),
        c(
          "interpretar-solucao",
          "Ao resolver um problema sobre quantidade de ingressos, um estudante encontrou x = 12,5. O que isso indica?",
          "Que há um erro no modelo ou nas contas",
          ["Que a resposta é 12 ingressos", "Que a resposta é 13 ingressos"],
          "Ingressos são contados em unidades inteiras. Um número que não faz sentido no contexto pede revisão da equação, não arredondamento.",
          {
            feedback: [
              "Arredondar para baixo não corrige um modelo errado.",
              "Arredondar para cima também não: a equação deveria dar um inteiro.",
            ],
          },
        ),
      ],
    },
    {
      title: "Duas incógnitas, duas condições",
      objective: "Resolver sistemas simples por substituição ou soma.",
      introduction:
        "Com duas incógnitas são necessárias duas condições. Escolha o método que elimina uma delas com menos conta: substituir quando uma já está isolada, somar quando os coeficientes se cancelam.",
      specs: [
        c(
          "sistema-por-substituicao",
          "No sistema y = x + 3 e x + y = 11, o valor de x é:",
          4,
          [7, 3],
          "Substituindo: x + (x + 3) = 11, então 2x = 8 e x = 4.",
          {
            feedback: [
              "7 é o valor de y, não de x.",
              "3 é a diferença entre eles, não o valor de x.",
            ],
          },
        ),
        n(
          "sistema-por-soma",
          "No sistema x + y = 14 e x − y = 4, qual é o valor de x?",
          9,
          "Somando as equações: 2x = 18, então x = 9.",
          { misreads: [{ value: 5, feedback: "5 é o valor de y." }] },
        ),
        c(
          "sistema-em-contexto",
          "Em um estacionamento há carros e motos, 20 veículos e 64 rodas ao todo. Quantos carros há?",
          12,
          [8, 16],
          "c + m = 20 e 4c + 2m = 64; substituindo m = 20 − c: 4c + 40 − 2c = 64, então c = 12.",
          {
            feedback: [
              "8 é o número de motos.",
              "16 divide 64 por 4, esquecendo as rodas das motos.",
            ],
          },
        ),
        n(
          "sistema-em-contexto",
          "Dois números somam 30 e um é o quádruplo do outro. Qual é o maior deles?",
          24,
          "n + 4n = 30, então n = 6 e o maior é 4 × 6 = 24.",
          { misreads: [{ value: 6, feedback: "6 é o menor dos dois números." }] },
        ),
        c(
          "sistema-por-soma",
          "No sistema 2x + y = 13 e x + y = 8, os valores são:",
          "x = 5 e y = 3",
          ["x = 3 e y = 5", "x = 4 e y = 5"],
          "Subtraindo a segunda da primeira: x = 5; então y = 8 − 5 = 3.",
          {
            feedback: ["Trocou x e y: 2 × 3 + 5 = 11, não 13.", "4 e 5 somam 9, e não 8."],
          },
        ),
        n(
          "sistema-em-contexto",
          "Uma caneta e um caderno custam R$ 12 juntos; duas canetas e um caderno custam R$ 15. Quanto custa o caderno, em reais?",
          9,
          "A caneta a mais custa 15 − 12 = 3; então o caderno custa 12 − 3 = 9.",
          { misreads: [{ value: 3, feedback: "3 é o preço da caneta." }] },
        ),
        c(
          "sistema-em-contexto",
          "A soma das idades de mãe e filha é 48 anos, e a mãe tem 24 anos a mais. A idade da filha é:",
          12,
          [24, 36],
          "f + (f + 24) = 48, então 2f = 24 e f = 12.",
          {
            feedback: ["24 é a diferença de idades, não a idade da filha.", "36 é a idade da mãe."],
          },
        ),
        c(
          "sistema-por-substituicao",
          "Se 3a + b = 20 e b = a + 4, então a vale:",
          4,
          [6, 5],
          "3a + a + 4 = 20, então 4a = 16 e a = 4.",
          {
            feedback: [
              "Com a = 6: b = 10 e 3 × 6 + 10 = 28, não 20.",
              "Com a = 5: b = 9 e 15 + 9 = 24, não 20.",
            ],
          },
        ),
      ],
    },
    {
      title: "Equações que argumentam",
      objective:
        "Usar equações para provar afirmações numéricas e resolver problemas de várias etapas.",
      introduction:
        "Uma equação bem montada também prova: se a igualdade só vale para um valor, esse valor é a única resposta. Escreva a condição geral e depois decida.",
      estimatedMinutes: 18,
      specs: [
        n(
          "modelar-com-uma-incognita",
          "Um número de dois algarismos tem soma dos algarismos 11 e, trocando os algarismos de lugar, aumenta 27. Qual é o número?",
          47,
          "Se o número é 10d + u com d + u = 11: 10u + d − (10d + u) = 27 dá u − d = 3; então u = 7, d = 4: 47.",
          {
            misreads: [
              {
                value: 74,
                feedback:
                  "74 é o número trocado; o pedido é o número que aumenta 27 ao ser trocado.",
              },
            ],
          },
        ),
        c(
          "modelar-com-uma-incognita",
          "Um tanque tem 3/5 da capacidade ocupados. Colocando mais 120 litros, fica com 4/5. Qual é a capacidade do tanque?",
          "600 litros",
          ["480 litros", "360 litros"],
          "(4/5 − 3/5) × C = 120, ou seja, C/5 = 120 e C = 600.",
          {
            feedback: [
              "480 é o volume de 4/5 do tanque, não a capacidade.",
              "360 é o volume de 3/5 do tanque.",
            ],
          },
        ),
        n(
          "sistema-em-contexto",
          "Uma torneira enche um tanque em 6 horas e outra em 3 horas. Juntas, em quantas horas enchem o tanque?",
          2,
          "Por hora enchem 1/6 + 1/3 = 1/2 do tanque; então levam 2 horas.",
          {
            misreads: [
              { value: 4.5, feedback: "Fez a média dos tempos; as vazões é que se somam." },
            ],
          },
        ),
        c(
          "modelar-com-uma-incognita",
          "Em um clube, 2/3 dos sócios são mulheres. Se saíssem 10 mulheres, elas passariam a ser metade dos sócios restantes. Quantos sócios há hoje?",
          30,
          [60, 45],
          "Com S sócios há 2S/3 mulheres: 2S/3 − 10 = (S − 10)/2, então 4S − 60 = 3S − 30 e S = 30. Conferindo: 20 mulheres, saem 10, ficam 10 em 20.",
          {
            feedback: [
              "Com 60 sócios há 40 mulheres; saindo 10, ficam 30 em 50, mais que a metade.",
              "Com 45 sócios há 30 mulheres; saindo 10, ficam 20 em 35, mais que a metade.",
            ],
          },
        ),
        n(
          "modelar-com-uma-incognita",
          "A diferença entre um número e sua terça parte é 18. Qual é o número?",
          27,
          "x − x/3 = 18, ou seja, 2x/3 = 18 e x = 27.",
          {
            misreads: [
              {
                value: 54,
                feedback:
                  "Tomou 18 como a terça parte do número; mas 18 é a diferença: 54 − 18 = 36, e não 18.",
              },
            ],
          },
        ),
        c(
          "interpretar-solucao",
          "Para quais valores de k a equação 2x + k = 2x + 6 tem solução?",
          "Só para k = 6, e então qualquer x serve",
          ["Para qualquer k, com x = 3", "Para nenhum valor de k"],
          "Tirando 2x dos dois lados sobra k = 6: se k = 6, todo x funciona; se não, nenhum.",
          {
            feedback: [
              "Com k diferente de 6 a igualdade é falsa para todo x, inclusive x = 3.",
              "Com k = 6 a igualdade é sempre verdadeira.",
            ],
          },
        ),
        n(
          "sistema-em-contexto",
          "Em uma balança, 3 maçãs iguais equilibram 1 pera e 60 g; 1 maçã e 1 pera equilibram 180 g. Quanto pesa uma maçã, em gramas?",
          60,
          "3m = p + 60 e m + p = 180; então p = 180 − m e 3m = 240 − m, logo 4m = 240 e m = 60.",
          { misreads: [{ value: 120, feedback: "120 g é o peso da pera." }] },
        ),
        c(
          "modelar-com-uma-incognita",
          "Um trem de 200 m atravessa um túnel de 1.000 m em 60 segundos, da entrada da frente à saída do fim. Qual é a velocidade do trem, em m/s?",
          20,
          ["16,7", 60],
          "O trem percorre 1.000 + 200 = 1.200 m em 60 s: 20 m/s.",
          {
            feedback: [
              "16,7 divide só o túnel pelo tempo, esquecendo o comprimento do trem.",
              "60 é o tempo, não a velocidade.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Organize um método para resolver um problema com uma equação do 1º grau.",
    labels: [
      "Escolher a incógnita e escrever as outras quantidades em função dela",
      "Montar a igualdade que o problema descreve",
      "Isolar a incógnita fazendo a mesma operação nos dois lados",
      "Substituir a solução no problema e conferir se faz sentido",
    ],
    explanation:
      "Primeiro nomeamos o desconhecido, depois montamos a igualdade; resolvemos mantendo o equilíbrio e voltamos ao contexto para conferir.",
  },
  justification: {
    prompts: [
      "Explique por que podemos subtrair o mesmo número dos dois lados de uma equação sem mudar a solução, usando a imagem da balança.",
      "Um colega resolveu 2(x + 5) = 30 fazendo 2x + 5 = 30 e encontrou x = 12,5. Explique o erro e mostre a solução correta.",
      "Mostre como decidir se um sistema de duas equações tem uma solução, nenhuma ou infinitas, com um exemplo de cada caso.",
    ],
    samples: [
      "Se dois pratos de uma balança estão equilibrados e tiro o mesmo peso dos dois, eles continuam equilibrados. Na equação x + 7 = 12, tirar 7 dos dois lados mantém a igualdade e deixa x sozinho: x = 5. A solução não mudou porque os dois lados continuam valendo o mesmo.",
      "Ao abrir os parênteses, o 2 multiplica os dois termos: 2(x + 5) = 2x + 10, e não 2x + 5. Então 2x + 10 = 30, 2x = 20 e x = 10. Conferindo: 2 × (10 + 5) = 30.",
      "Uma solução: x + y = 5 e x − y = 1 dão x = 3, y = 2. Nenhuma: x + y = 5 e x + y = 7 pedem que a mesma soma valha dois números diferentes. Infinitas: x + y = 5 e 2x + 2y = 10 são a mesma condição escrita duas vezes, então todo par que soma 5 serve.",
    ],
    focus: "a igualdade preservada pela mesma operação nos dois lados",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const coefficient = 3 + (seed % 4);
      const solution = 4 + (seed % 11);
      const constant = coefficient * (1 + (seed % 3));
      const result = coefficient * solution - constant;
      return c(
        "equacao-para-resolver",
        `Qual é o valor de t na equação ${coefficient}t − ${constant} = ${result}?`,
        solution,
        [solution + 1, solution - 2 * (1 + (seed % 3))],
        `${coefficient}t = ${result} + ${constant} = ${result + constant}; t = ${solution}.`,
        {
          feedback: [
            "Não confere: substitua na equação e o lado esquerdo não dá o resultado.",
            "Subtraiu a constante em vez de somá-la ao passar para o outro lado.",
          ],
        },
      );
    }
    if (variant === 1) {
      const smaller = 5 + (seed % 13);
      const gap = 2 * (1 + (seed % 3));
      const total = smaller * 2 + gap;
      return c(
        "dois-numeros-com-diferenca",
        `Dois números somam ${total} e o maior supera o menor em ${gap}. Qual é o maior deles?`,
        smaller + gap,
        [smaller, total / 2],
        `Se o menor é m, então m + (m + ${gap}) = ${total}; m = ${smaller} e o maior é ${smaller + gap}.`,
        {
          feedback: [
            "Esse é o menor dos dois números.",
            "Dividir a soma ao meio ignora a diferença entre eles.",
          ],
        },
      );
    }
    const weight = 4 + (seed % 11);
    const extra = 10 + 5 * (seed % 7);
    const boxes = 3 + (seed % 3);
    const total = boxes * weight + extra;
    return c(
      "peso-com-incognita",
      `${boxes} caixas iguais e um pacote de ${extra} g pesam juntos ${total} g. Quanto pesa cada caixa?`,
      `${weight} g`,
      [`${weight + 1} g`, `${weight - 1} g`],
      `${boxes} caixas pesam ${total} − ${extra} = ${boxes * weight} g; cada uma pesa ${weight} g.`,
      {
        feedback: [
          `Com ${weight + 1} g, ${boxes} × ${weight + 1} + ${extra} = ${boxes * (weight + 1) + extra} g, mais que o total.`,
          `Com ${weight - 1} g, ${boxes} × ${weight - 1} + ${extra} = ${boxes * (weight - 1) + extra} g, menos que o total.`,
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "equacoes",
    title: "O truque do número pensado",
    prompt:
      "Invente um truque: peça a alguém que pense um número, faça algumas operações e diga o resultado, e você adivinha o número. Depois explique por que o truque sempre funciona.",
    lab: "bars",
    steps: [
      "Escreva o truque passo a passo e teste com três números diferentes.",
      "Chame o número pensado de x e escreva a expressão que cada passo produz, até o resultado final.",
      "Mostre, com a expressão, como recuperar x a partir do resultado e diga se existe algum número para o qual o truque falha.",
    ],
    rubric: [
      "Truque descrito e testado com três números (0–2)",
      "Expressão algébrica correta para cada passo (0–3)",
      "Explicação de como recuperar x e discussão de casos de falha (0–2)",
      "Texto que outra pessoa consegue seguir e repetir (0–1)",
    ],
  },
  homeSupport: [
    "Ao dividir uma conta ou um pacote entre pessoas, pergunte quanto cabe a cada um antes de fazer a conta e peça a explicação do caminho.",
    "Brinquem de adivinhar um número: uma pessoa pensa, faz duas operações e diz o resultado; a outra descobre o número e conta como desfez cada passo.",
  ],
};
