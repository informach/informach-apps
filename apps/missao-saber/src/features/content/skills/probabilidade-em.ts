import { c, n, type SkillPack } from "../skill-factory";

/**
 * Probabilidade no ensino médio: espaço amostral e eventos, contagem para
 * probabilidade, eventos complementares e união, probabilidade condicional
 * e independência, e valor esperado em decisões. Trilhas OBMEP N3 e Canguru S.
 */
export const probabilidadeEm: SkillPack = {
  id: "probabilidade-em",
  name: "Probabilidade",
  domain: "common",
  lab: null,
  missions: [
    {
      title: "Casos favoráveis, casos possíveis",
      objective: "Montar o espaço amostral e calcular probabilidades em situações equiprováveis.",
      introduction:
        "Quando todos os resultados são igualmente prováveis, a probabilidade é o número de casos favoráveis dividido pelo total. O cuidado está em listar o espaço amostral certo: (cara, coroa) e (coroa, cara) são resultados diferentes.",
      specs: [
        n(
          "equiprovavel",
          "Lançando dois dados, qual é a probabilidade de a soma ser 7? Responda o denominador b da fração irredutível 1/b.",
          6,
          "Há 6 pares com soma 7 entre 36: 6/36 = 1/6.",
          {
            misreads: [
              { value: 36, feedback: "36 é o total de casos; a probabilidade é 6/36 = 1/6." },
            ],
          },
        ),
        c(
          "equiprovavel",
          "Lançando duas moedas, a probabilidade de sair exatamente uma cara é:",
          "1/2",
          ["1/3", "1/4"],
          "Espaço: CC, CK, KC, KK; favoráveis CK e KC: 2/4.",
          {
            feedback: [
              "1/3 vem de considerar 'duas caras, uma cara, nenhuma' como igualmente prováveis, mas não são.",
              "1/4 é a probabilidade de duas caras.",
            ],
          },
        ),
        n(
          "equiprovavel",
          "Uma urna tem 5 bolas vermelhas e 3 azuis. Retirando uma ao acaso, qual é a probabilidade de ser azul? Responda em porcentagem, com uma casa decimal.",
          37.5,
          "3/8 = 0,375 = 37,5%.",
          {
            misreads: [
              {
                value: 60,
                feedback: "60% seria 3/5, comparando azuis com vermelhas em vez de com o total.",
              },
            ],
          },
        ),
        c(
          "equiprovavel",
          "Num baralho de 52 cartas, a probabilidade de tirar um rei ou uma carta de copas é:",
          "16/52",
          ["17/52", "4/52"],
          "4 reis + 13 copas − 1 rei de copas = 16.",
          {
            feedback: ["17 conta o rei de copas duas vezes.", "4/52 é só os reis."],
          },
        ),
        n(
          "equiprovavel",
          "Lançando dois dados, quantos resultados têm produto ímpar?",
          9,
          "Produto ímpar exige os dois ímpares: 3 × 3 = 9.",
          {
            misreads: [
              {
                value: 18,
                feedback: "18 é metade dos casos, mas produto ímpar é mais raro que par.",
              },
            ],
          },
        ),
        c(
          "equiprovavel",
          "Uma roleta tem 8 setores iguais numerados de 1 a 8. A probabilidade de sair um número primo é:",
          "1/2",
          ["3/8", "5/8"],
          "Primos: 2, 3, 5, 7: 4/8.",
          {
            feedback: ["3/8 esquece um dos primos.", "5/8 inclui o 1, que não é primo."],
          },
        ),
        n(
          "equiprovavel",
          "Uma senha de 2 algarismos é escolhida ao acaso entre 00 e 99. Qual é a probabilidade de os dois algarismos serem iguais? Responda em porcentagem.",
          10,
          "10 casos (00, 11, ..., 99) em 100: 10%.",
          {
            misreads: [
              { value: 1, feedback: "1% seria um caso só; há 10 senhas com algarismos iguais." },
            ],
          },
        ),
        c(
          "equiprovavel",
          "Ao lançar um dado, os eventos 'sair par' e 'sair maior que 4' têm em comum:",
          "Só o resultado 6",
          ["Os resultados 4 e 6", "Nenhum resultado"],
          "Par: 2, 4, 6. Maior que 4: 5, 6.",
          {
            feedback: ["4 não é maior que 4.", "6 está nos dois."],
          },
        ),
      ],
    },
    {
      title: "Contar para calcular",
      objective: "Usar combinações e permutações no cálculo de probabilidades.",
      introduction:
        "Quando os resultados são muitos, conta-se com combinatória: favoráveis e possíveis pela mesma regra. É essencial contar os dois com o mesmo critério, com ordem ou sem ordem nos dois.",
      specs: [
        c(
          "contagem",
          "De uma turma com 6 meninas e 4 meninos, sorteiam-se 2 alunos. A probabilidade de serem duas meninas é:",
          "1/3",
          ["9/25", "3/5"],
          "C(6, 2)/C(10, 2) = 15/45 = 1/3.",
          {
            feedback: [
              "9/25 seria com reposição.",
              "3/5 é a probabilidade de a primeira ser menina.",
            ],
          },
        ),
        n(
          "contagem",
          "Numa sala há 3 pessoas. Supondo os 12 meses igualmente prováveis, qual é a probabilidade de pelo menos duas fazerem aniversário no mesmo mês? Responda em porcentagem, arredondando para o inteiro mais próximo.",
          24,
          "Todos diferentes: (12 × 11 × 10)/12³ = 1.320/1.728 ≈ 0,764; complementar ≈ 0,236 → 24%.",
          {
            misreads: [
              {
                value: 25,
                feedback:
                  "25% soma 1/12 para cada um dos 3 pares e conta mais de uma vez o caso dos três no mesmo mês; o valor é 23,6%.",
              },
            ],
          },
        ),
        c(
          "contagem",
          "Cinco pessoas sentam em fila ao acaso. A probabilidade de Ana e Bia ficarem juntas é:",
          "2/5",
          ["1/5", "1/2"],
          "48 arrumações com as duas juntas entre 120: 48/120 = 2/5.",
          {
            feedback: [
              "1/5 esquece as 2 ordens dentro do bloco.",
              "1/2 não confere: dos 10 pares de lugares, só 4 são vizinhos, e 4/10 = 2/5.",
            ],
          },
        ),
        n(
          "contagem",
          "Uma prova tem 4 questões de múltipla escolha com 5 alternativas. Chutando tudo, qual é a probabilidade de acertar todas? Responda o denominador da fração 1/b.",
          625,
          "(1/5)⁴ = 1/625.",
          {
            misreads: [
              {
                value: 20,
                feedback: "20 soma 5 quatro vezes; a probabilidade multiplica: 5⁴ = 625.",
              },
            ],
          },
        ),
        c(
          "contagem",
          "Retirando 2 cartas de um baralho de 52 sem reposição, a probabilidade de ambas serem ases é:",
          "1/221",
          ["1/169", "2/52"],
          "(4/52) × (3/51) = 12/2.652 = 1/221.",
          {
            feedback: ["1/169 seria com reposição.", "2/52 não é o produto das duas retiradas."],
          },
        ),
        n(
          "contagem",
          "Lançando 4 moedas, qual é a probabilidade de exatamente 2 caras? Responda em porcentagem, com uma casa decimal.",
          37.5,
          "C(4, 2)/2⁴ = 6/16 = 37,5%.",
          {
            misreads: [
              {
                value: 50,
                feedback:
                  "50% seria se metade dos resultados tivesse exatamente 2 caras, mas são 6 de 16.",
              },
            ],
          },
        ),
        c(
          "contagem",
          "Numa loteria escolhem-se 6 números entre 60. A probabilidade de acertar todos com uma aposta é 1 dividido por:",
          "C(60, 6), cerca de 50 milhões",
          ["60⁶, cerca de 47 bilhões", "60 × 59 × 58 × 57 × 56 × 55"],
          "A ordem não importa: C(60, 6) = 50.063.860.",
          {
            feedback: [
              "60⁶ conta a ordem dos números e ainda deixa o mesmo número sair mais de uma vez; na loteria não há repetição nem ordem.",
              "Esse produto conta as sequências ordenadas; como a ordem dos 6 números não importa, falta dividir por 6! = 720.",
            ],
          },
        ),
        n(
          "contagem",
          "Uma urna tem 4 bolas brancas e 2 pretas. Retiram-se 2 sem reposição. Qual é a probabilidade de serem de cores diferentes? Responda em porcentagem, arredondando para o inteiro mais próximo.",
          53,
          "(4 × 2)/C(6, 2) = 8/15 ≈ 53%.",
          {
            misreads: [
              {
                value: 27,
                feedback:
                  "27% conta só uma ordem (branca depois preta): 8/30; as duas ordens somam 8/15.",
              },
            ],
          },
        ),
      ],
    },
    {
      title: "Ou, e, não",
      objective: "Usar complementar, união e produto para eventos independentes.",
      introduction:
        "P(não A) = 1 − P(A). Para 'A ou B': P(A) + P(B) − P(A e B). Para eventos independentes, P(A e B) = P(A) × P(B). 'Pelo menos um' quase sempre pede o complementar.",
      specs: [
        n(
          "regras",
          "A probabilidade de chover em cada um de dois dias é 30%, de forma independente. Qual é a probabilidade de não chover em nenhum dos dois? Responda em porcentagem.",
          49,
          "0,7 × 0,7 = 0,49.",
          {
            misreads: [
              {
                value: 40,
                feedback: "40% subtrai 60% de 100%, mas as probabilidades se multiplicam.",
              },
            ],
          },
        ),
        c(
          "regras",
          "Lançando um dado 3 vezes, a probabilidade de sair pelo menos um 6 é:",
          "1 − (5/6)³ ≈ 42%",
          ["3/6 = 50%", "(1/6)³"],
          "Complementar de 'nenhum 6'.",
          {
            feedback: [
              "3/6 soma probabilidades de eventos que se sobrepõem.",
              "(1/6)³ é a probabilidade de três 6.",
            ],
          },
        ),
        n(
          "regras",
          "Num grupo, 40% falam inglês, 30% falam espanhol e 15% falam os dois. Que porcentagem fala pelo menos um dos dois?",
          55,
          "40 + 30 − 15 = 55.",
          { misreads: [{ value: 70, feedback: "70 conta duas vezes quem fala os dois idiomas." }] },
        ),
        c(
          "regras",
          "Dois eventos A e B são mutuamente exclusivos com P(A) = 0,3 e P(B) = 0,5. Então P(A ou B) é:",
          "0,8",
          ["0,15", "0,65"],
          "Exclusivos: sem interseção, soma direta.",
          {
            feedback: [
              "0,15 é o produto, que valeria para independentes, não para exclusivos.",
              "0,65 subtraiu P(A)·P(B) como se fossem independentes; aqui a interseção é zero.",
            ],
          },
        ),
        n(
          "regras",
          "Uma máquina tem duas peças independentes que falham com probabilidade 10% cada. A máquina para se qualquer uma falhar. Qual é a probabilidade de a máquina parar? Responda em porcentagem.",
          19,
          "1 − 0,9 × 0,9 = 0,19.",
          {
            misreads: [
              { value: 20, feedback: "20% soma sem descontar o caso em que as duas falham (1%)." },
            ],
          },
        ),
        c(
          "regras",
          "Se A e B são independentes com P(A) = 0,5 e P(B) = 0,4, então P(A e B) é:",
          "0,2",
          ["0,9", "0,1"],
          "0,5 × 0,4 = 0,2.",
          {
            feedback: ["0,9 é a soma.", "0,1 é a diferença."],
          },
        ),
        n(
          "regras",
          "Um atirador acerta o alvo com probabilidade 80%. Em 2 tiros independentes, qual é a probabilidade de acertar exatamente um? Responda em porcentagem.",
          32,
          "0,8 × 0,2 + 0,2 × 0,8 = 0,32.",
          {
            misreads: [
              { value: 16, feedback: "16% conta só uma das duas ordens (acerto depois erro)." },
            ],
          },
        ),
        c(
          "regras",
          "Eventos mutuamente exclusivos com probabilidades positivas podem ser independentes?",
          "Não, pois P(A e B) = 0 ≠ P(A) × P(B)",
          ["Sim, pois um não altera a chance do outro", "Depende dos valores de P(A) e P(B)"],
          "Se um acontece, o outro não pode acontecer: P(A e B) = 0, enquanto P(A) × P(B) é positivo. Exclusividade é dependência forte.",
          {
            feedback: [
              "Isso confunde 'não se sobrepõem' com 'não se influenciam': se A acontece, B fica impossível, então saber de A muda totalmente a chance de B.",
              "Não depende: para quaisquer probabilidades positivas, P(A e B) continua 0, e P(A) × P(B) continua positivo.",
            ],
          },
        ),
      ],
    },
    {
      title: "Dado que...",
      objective:
        "Calcular probabilidades condicionais e usar tabelas e árvores para informação parcial.",
      introduction:
        "P(A | B) é a probabilidade de A sabendo que B aconteceu: P(A e B)/P(B). A informação reduz o espaço amostral. Tabelas de dupla entrada e árvores tornam a conta visível.",
      specs: [
        n(
          "condicional",
          "Lançando dois dados, sabe-se que a soma é 8. Qual é a probabilidade de aparecer pelo menos um 4? Responda o denominador da fração 1/b.",
          5,
          "Soma 8: (2,6), (3,5), (4,4), (5,3), (6,2); só (4,4) tem um 4: 1/5.",
          {
            misreads: [
              { value: 36, feedback: "Sabendo a soma, o espaço amostral cai para 5 casos." },
            ],
          },
        ),
        c(
          "condicional",
          "Numa turma, 60% são meninas; 50% das meninas e 30% dos meninos usam óculos. Escolhendo um aluno de óculos ao acaso, a probabilidade de ser menina é:",
          "5/7 ≈ 71%",
          ["50%", "60%"],
          "Óculos: 0,6 × 0,5 = 0,30 (meninas) e 0,4 × 0,3 = 0,12 (meninos); 0,30/0,42.",
          {
            feedback: [
              "50% é a proporção de meninas com óculos, não a de meninas entre quem usa óculos.",
              "60% é a proporção de meninas na turma toda.",
            ],
          },
        ),
        n(
          "condicional",
          "Uma família tem dois filhos e sabe-se que pelo menos um é menino. Qual é a probabilidade de os dois serem meninos? Responda o denominador da fração 1/b.",
          3,
          "Casos com pelo menos um menino: MM, MF, FM; favorável: MM. 1/3.",
          {
            misreads: [
              { value: 2, feedback: "1/2 valeria se soubéssemos que o mais velho é menino." },
            ],
          },
        ),
        c(
          "condicional",
          "Um teste detecta uma doença em 99% dos doentes e dá falso positivo em 5% dos sadios. Se 1% da população tem a doença, a probabilidade de quem testou positivo estar doente é aproximadamente:",
          "17%",
          ["99%", "95%"],
          "Positivos: 0,01 × 0,99 = 0,0099 e 0,99 × 0,05 = 0,0495; 0,0099/0,0594 ≈ 0,17.",
          {
            feedback: [
              "99% é a sensibilidade, não a probabilidade de estar doente dado positivo.",
              "95% confunde com a especificidade.",
            ],
          },
        ),
        n(
          "condicional",
          "De uma urna com 3 bolas vermelhas e 2 azuis retiram-se duas sem reposição. Sabendo que a primeira foi vermelha, qual é a probabilidade de a segunda também ser vermelha? Responda em porcentagem.",
          50,
          "Sobram 2 vermelhas e 2 azuis: 2/4.",
          {
            misreads: [
              { value: 60, feedback: "60% é 3/5, a probabilidade antes de retirar a primeira." },
            ],
          },
        ),
        c(
          "condicional",
          "Se P(A) = 0,4, P(B) = 0,5 e P(A e B) = 0,2, então A e B são:",
          "Independentes",
          ["Mutuamente exclusivos", "Dependentes"],
          "0,4 × 0,5 = 0,2, que é exatamente P(A e B). Como P(A e B) = P(A) × P(B), são independentes.",
          {
            feedback: [
              "Exclusivos teriam P(A e B) = 0, e aqui a interseção vale 0,2.",
              "Dependência exigiria P(A e B) diferente de P(A) × P(B), mas 0,4 × 0,5 dá exatamente 0,2.",
            ],
          },
        ),
        n(
          "condicional",
          "Numa caixa há 10 lâmpadas, 3 queimadas. Testam-se duas sem reposição. Qual é a probabilidade de a segunda ser boa sabendo que a primeira era queimada? Responda em porcentagem, arredondando para o inteiro mais próximo.",
          78,
          "Sobram 9 lâmpadas com 7 boas: 7/9 ≈ 78%.",
          { misreads: [{ value: 70, feedback: "70% é 7/10, sem retirar a primeira lâmpada." }] },
        ),
        c(
          "condicional",
          "Por que P(doente | positivo) pode ser baixa mesmo com um teste muito preciso?",
          "Porque a doença é rara e os falsos positivos superam os verdadeiros",
          [
            "Porque o teste deixa de detectar muitos doentes",
            "Não pode; um teste preciso garante probabilidade alta",
          ],
          "Quando a doença é rara, os poucos erros entre os muitos sadios geram mais positivos que os acertos entre os poucos doentes. A prevalência pesa tanto quanto a precisão.",
          {
            feedback: [
              "Um teste muito preciso detecta quase todos os doentes; o que derruba a probabilidade são os sadios que dão positivo.",
              "Pode, e é comum em triagens de doenças raras: uma pequena porcentagem de muitos sadios pode ser mais gente que quase todos os poucos doentes.",
            ],
          },
        ),
      ],
    },
    {
      title: "Decidir com probabilidade",
      objective: "Usar valor esperado e comparação de riscos para escolher entre alternativas.",
      introduction:
        "Valor esperado é a média ponderada dos resultados pelas suas probabilidades. Ele orienta decisões repetidas, mas não descreve o que acontece numa única vez; risco e variabilidade também importam.",
      estimatedMinutes: 18,
      specs: [
        n(
          "decidir",
          "Um jogo paga R$ 10 com probabilidade 1/5 e R$ 0 caso contrário. Qual é o valor esperado do prêmio, em reais?",
          2,
          "10 × 1/5 = 2.",
          { misreads: [{ value: 5, feedback: "5 divide 10 por 2, mas a probabilidade é 1/5." }] },
        ),
        c(
          "decidir",
          "Um bilhete custa R$ 5 e paga R$ 100 com probabilidade 1/50. Em média, quem joga muitas vezes:",
          "Perde R$ 3 por bilhete",
          ["Ganha R$ 2 por bilhete", "Empata"],
          "Esperado do prêmio: 100/50 = 2; menos o custo 5: −3.",
          {
            feedback: [
              "2 é o prêmio esperado, antes de pagar o bilhete.",
              "Empataria se o bilhete custasse R$ 2.",
            ],
          },
        ),
        n(
          "decidir",
          "Um dado é lançado e você recebe em reais o valor da face. Qual é o valor esperado, em reais?",
          3.5,
          "(1 + 2 + 3 + 4 + 5 + 6)/6 = 3,5.",
          {
            misreads: [
              { value: 3, feedback: "3 é um valor possível, mas a média das faces é 3,5." },
            ],
          },
        ),
        c(
          "decidir",
          "Duas opções: A dá R$ 50 com certeza; B dá R$ 200 com probabilidade 30% e nada com 70%. Sobre o valor esperado:",
          "B tem valor esperado maior: 60 contra 50",
          ["A tem valor esperado maior, por ser garantido", "As duas têm o mesmo valor esperado"],
          "0,3 × 200 + 0,7 × 0 = 60 > 50. B tem média maior, mas com 70% de chance de sair sem nada; a decisão depende da tolerância ao risco.",
          {
            feedback: [
              "A certeza não aumenta o valor esperado: A vale 50, e B vale 0,3 × 200 = 60. A vantagem de A é o risco menor, não a média.",
              "0,3 × 200 = 60, que é diferente dos 50 de A.",
            ],
          },
        ),
        n(
          "decidir",
          "Um seguro cobre um prejuízo de R$ 20.000 que ocorre com probabilidade 2% ao ano. Qual é o valor esperado do prejuízo anual, em reais?",
          400,
          "20.000 × 0,02 = 400.",
          { misreads: [{ value: 40, feedback: "40 usa 0,2%; a probabilidade é 2%." }] },
        ),
        c(
          "decidir",
          "Numa rifa com 200 números e um prêmio de R$ 600, o preço justo do número (valor esperado do prêmio) é:",
          "R$ 3",
          ["R$ 6", "R$ 30"],
          "600/200 = 3.",
          {
            feedback: ["R$ 6 seria com 100 números.", "R$ 30 seria com 20 números."],
          },
        ),
        n(
          "decidir",
          "Um jogo paga R$ 4 se sair 6 no dado e cobra R$ 1 caso contrário. Qual é o valor esperado por jogada, em reais? Responda com duas casas decimais e sinal se for negativo.",
          -0.17,
          "4 × 1/6 − 1 × 5/6 = −1/6 ≈ −0,17.",
          {
            misreads: [
              {
                value: 0.5,
                feedback: "0,5 usou 1/6 também para a perda, que acontece em 5 de 6 casos.",
              },
              { value: 0.17, feedback: "O sinal: o valor esperado é negativo, −1/6." },
            ],
          },
        ),
        c(
          "decidir",
          "Por que o valor esperado não basta para decidir uma escolha feita uma única vez, como uma cirurgia?",
          "Porque ele é a média de muitas repetições, e aqui há uma só",
          [
            "Porque o valor esperado só existe para dinheiro",
            "Porque ele ignora os resultados pouco prováveis",
          ],
          "O valor esperado descreve a média de muitas repetições; numa decisão única, o que importa é a distribuição dos resultados, o pior caso e o que se pode suportar perder.",
          {
            feedback: [
              "Valor esperado se aplica a qualquer grandeza numérica, como dias de recuperação ou anos de vida.",
              "Ele usa todos os resultados, cada um pesado pela sua probabilidade; nada é ignorado. O problema é que uma média não descreve um caso só.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt:
      "Organize os passos para calcular a probabilidade de 'pelo menos um' em tentativas independentes.",
    labels: [
      "Achar a probabilidade de falhar em uma tentativa",
      "Elevar essa probabilidade ao número de tentativas para obter 'nenhum'",
      "Subtrair o resultado de 1",
      "Conferir se o valor faz sentido comparado com uma tentativa só",
    ],
    explanation:
      "O complementar de 'pelo menos um' é 'nenhum', e independência permite multiplicar.",
  },
  justification: {
    prompts: [
      "Explique por que a probabilidade de exatamente uma cara em duas moedas é 1/2 e não 1/3.",
      "Explique por que 'pelo menos um 6 em três dados' não é 3 × 1/6.",
      "Explique por que um teste que detecta 99% dos doentes e erra em 5% dos sadios pode dar mais falsos positivos do que verdadeiros positivos.",
    ],
    samples: [
      "Os resultados igualmente prováveis são CC, CK, KC e KK, quatro ao todo. 'Exatamente uma cara' acontece em CK e KC, dois deles: 2/4 = 1/2. Contar 'duas caras, uma cara, nenhuma cara' como três casos iguais está errado, porque 'uma cara' pode acontecer de dois jeitos.",
      "Somar 1/6 três vezes conta mais de uma vez os resultados em que sai 6 em dois ou três dados. O certo é o complementar: a probabilidade de não sair 6 em nenhum é (5/6)³ ≈ 0,58, então pelo menos um 6 tem probabilidade 1 − 0,58 ≈ 0,42, menor que 0,5.",
      "Se a doença atinge 1 em 100 pessoas, em 10.000 pessoas há 100 doentes e 9.900 sadios. O teste acerta 99 dos doentes, mas erra 5% dos sadios: 495 falsos positivos. Entre os 594 positivos, só 99 estão doentes, cerca de 17%. A raridade da doença faz os erros nos sadios pesarem mais.",
    ],
    focus: "o espaço amostral certo",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const azuis = 2 + (seed % 4);
      const vermelhasBase = azuis + 1 + (Math.floor(seed / 4) % 4);
      // 4 e 2 e 6 e 3 já aparecem nas missões.
      const vermelhas =
        (vermelhasBase === 4 && azuis === 2) || (vermelhasBase === 6 && azuis === 3)
          ? vermelhasBase + 1
          : vermelhasBase;
      const total = vermelhas + azuis;
      const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
      const g = gcd(azuis, total);
      const fracao = `${azuis / g}/${total / g}`;
      const g2 = gcd(azuis, vermelhas);
      const errada1 = `${azuis / g2}/${vermelhas / g2}`;
      const g3 = gcd(vermelhas, total);
      const errada2 = `${vermelhas / g3}/${total / g3}`;
      return c(
        "bola-na-urna",
        `Uma urna tem ${vermelhas} bolas vermelhas e ${azuis} azuis, todas iguais ao toque. Retirando uma ao acaso, qual é a probabilidade de ela ser azul?`,
        fracao,
        [errada1 === fracao ? `${azuis}/${total + 1}` : errada1, errada2],
        `${azuis} azuis em ${total} bolas: ${fracao}.`,
        {
          feedback: [
            "Comparou azuis com vermelhas; o total de casos é o número de bolas.",
            "Essa é a probabilidade de sair vermelha.",
          ],
        },
      );
    }
    if (variant === 1) {
      const p = 10 * (1 + (seed % 5));
      const tentativas = 2 + (seed % 2);
      const nenhum = ((100 - p) / 100) ** tentativas;
      const peloMenosUm = Math.round((1 - nenhum) * 1000) / 10;
      const texto = (v: number) => String(v).replace(".", ",");
      return c(
        "pelo-menos-um-independente",
        `Cada tentativa de um jogo tem ${p}% de chance de sucesso, e as tentativas são independentes. Em ${tentativas} tentativas, qual é a probabilidade de pelo menos um sucesso?`,
        `${texto(peloMenosUm)}%`,
        [
          p * tentativas < 100 ? `${p * tentativas}%` : `${p}%`,
          `${texto(Math.round(nenhum * 1000) / 10)}%`,
        ],
        `Nenhum sucesso: ${texto(Math.round(nenhum * 1000) / 10)}%; pelo menos um: 100% − isso = ${texto(peloMenosUm)}%.`,
        {
          feedback: [
            p * tentativas < 100
              ? "Somou as chances, contando mais de uma vez os casos com mais de um sucesso."
              : "Essa é a chance de uma tentativa só; com mais tentativas a chance de pelo menos um sucesso aumenta.",
            "Essa é a probabilidade de nenhum sucesso.",
          ],
        },
      );
    }
    const premio = 50 * (2 + (seed % 7));
    const bilhetes = 20 * (2 + (seed % 5));
    const esperado = premio / bilhetes;
    const texto = (v: number) => v.toFixed(2).replace(".", ",");
    const igual = Number.isInteger(esperado * 100) ? "=" : "≈";
    return c(
      "preco-justo-da-rifa",
      `Uma rifa tem ${bilhetes} bilhetes e um único prêmio de R$ ${premio}. Qual é o valor esperado do prêmio por bilhete?`,
      `R$ ${texto(esperado)}`,
      [`R$ ${texto(esperado * 2)}`, `R$ ${texto(premio / 10)}`],
      `${premio} ÷ ${bilhetes} ${igual} ${texto(esperado)}.`,
      {
        feedback: [
          "Dividiu pela metade do número de bilhetes.",
          "Dividiu o prêmio por 10, não pelo número de bilhetes.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "probabilidade-em",
    title: "O jogo que parece justo",
    prompt:
      "Escolha um jogo de azar simples (dados, moedas, cartas) ou uma promoção com sorteio. Calcule o valor esperado, simule 50 rodadas anotando os resultados e compare a média observada com a esperada.",
    lab: null,
    steps: [
      "Descreva as regras e calcule a probabilidade de cada resultado e o valor esperado.",
      "Simule 50 rodadas e registre os resultados numa tabela.",
      "Compare média observada e esperada e explique a diferença.",
    ],
    rubric: [
      "Probabilidades e valor esperado corretos (0–3)",
      "Simulação registrada com 50 rodadas (0–2)",
      "Comparação com explicação da variabilidade (0–3)",
      "Conclusão sobre a justiça do jogo (0–2)",
    ],
  },
  homeSupport: [
    "Discutam uma promoção com sorteio: quanto vale de verdade cada cupom se o prêmio for dividido pelo número de participantes?",
    "Ao ouvir 'chance de 30% de chuva', perguntem o que isso significa em dez dias parecidos.",
  ],
};
