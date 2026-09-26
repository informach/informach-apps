import { c, n, type SkillPack } from "../skill-factory";

/**
 * Sequências iniciais: padrões de cores e formas que se repetem, contar de
 * 2 em 2, 5 em 5 e 10 em 10, sequências que crescem e diminuem, e achar o
 * que falta. Trilha Mirim 1.
 */
export const sequenciasIniciais: SkillPack = {
  id: "sequencias-iniciais",
  name: "Sequências",
  domain: "mirim",
  lab: "grid",
  missions: [
    {
      title: "O que se repete",
      objective: "Descobrir o pedaço que se repete num padrão de cores ou formas e continuar.",
      introduction:
        "Num padrão, um pedaço se repete sempre igual: bola, quadrado, bola, quadrado. Descobrir esse pedaço ajuda a saber o que vem depois.",
      specs: [
        c(
          "repeticao",
          "O padrão é: vermelho, azul, vermelho, azul, vermelho, ... Qual cor vem depois?",
          "Azul",
          ["Vermelho", "Verde"],
          "O pedaço que se repete é vermelho, azul.",
          {
            feedback: ["Depois do vermelho vem o azul.", "Verde não aparece no padrão."],
          },
        ),
        n(
          "repeticao",
          "O padrão é: estrela, lua, lua, estrela, lua, lua, ... Quantas figuras tem o pedaço que se repete?",
          3,
          "Estrela, lua, lua: 3 figuras.",
          {
            misreads: [
              {
                value: 2,
                feedback: "2 são os tipos de figura; o pedaço tem 3 figuras: estrela, lua, lua.",
              },
            ],
          },
        ),
        c(
          "repeticao",
          "O padrão é: bola, bola, quadrado, bola, bola, quadrado, ... Qual figura vem depois do segundo quadrado?",
          "Bola",
          ["Quadrado", "Triângulo"],
          "Depois do quadrado o pedaço recomeça com bola.",
          {
            feedback: ["Não há dois quadrados seguidos.", "Triângulo não faz parte do padrão."],
          },
        ),
        n(
          "repeticao",
          "Num colar o padrão é: branca, preta, branca, preta. Se o colar tem 10 contas, quantas são pretas?",
          5,
          "Metade das 10: 5 pretas.",
          { misreads: [{ value: 10, feedback: "10 são todas as contas; metade é preta." }] },
        ),
        c(
          "repeticao",
          "Qual destas sequências tem um padrão que se repete?",
          "sol, chuva, sol, chuva, sol, chuva",
          ["sol, sol, chuva, sol, chuva, chuva", "sol, sol, sol, chuva"],
          "Sol, chuva se repete sempre.",
          {
            feedback: [
              "Não há um pedaço que se repete igual.",
              "Não se repete: acaba sem voltar a começar.",
            ],
          },
        ),
        n(
          "repeticao",
          "O padrão é: A, B, C, A, B, C, ... Qual é a posição da segunda letra C?",
          6,
          "A primeira C é a 3ª; a segunda é a 6ª.",
          { misreads: [{ value: 3, feedback: "3 é a posição da primeira C." }] },
        ),
        c(
          "repeticao",
          "O padrão é: palma, palma, pé, palma, palma, pé, ... Qual é o 7º movimento?",
          "Palma",
          ["Pé", "Pulo"],
          "O pedaço tem 3 movimentos; o 7º recomeça: palma.",
          {
            feedback: ["Pé é o 3º, o 6º e o 9º.", "Pulo não faz parte do padrão."],
          },
        ),
        n(
          "repeticao",
          "Numa fila de azulejos o padrão é: azul, azul, amarelo. Em 9 azulejos, quantos são amarelos?",
          3,
          "Cada grupo de 3 tem 1 amarelo; 9 azulejos têm 3 grupos.",
          { misreads: [{ value: 6, feedback: "6 são os azuis." }] },
        ),
      ],
    },
    {
      title: "De 2 em 2, de 5 em 5",
      objective: "Contar pulando de 2, de 5 e de 10 para a frente e para trás.",
      introduction:
        "Contar pulando é mais rápido: de 2 em 2 (2, 4, 6), de 5 em 5 (5, 10, 15), de 10 em 10 (10, 20, 30). Também dá para pular para trás: 20, 18, 16.",
      specs: [
        n(
          "pulos",
          "Contando de 2 em 2: 2, 4, 6, 8, ... Qual número vem depois do 8?",
          10,
          "8 + 2 = 10.",
          { misreads: [{ value: 9, feedback: "O pulo é de 2, não de 1." }] },
        ),
        c(
          "pulos",
          "Contando de 5 em 5: 5, 10, 15, ... Qual número NÃO aparece?",
          "22",
          ["20", "25"],
          "De 5 em 5 só aparecem números terminados em 0 ou 5.",
          {
            feedback: ["20 aparece: 15, 20.", "25 aparece: 20, 25."],
          },
        ),
        n(
          "pulos",
          "Contando de 10 em 10 a partir do 10, qual é o 5º número?",
          50,
          "10, 20, 30, 40, 50.",
          { misreads: [{ value: 15, feedback: "Somou 10 com 5; o 5º número é 50." }] },
        ),
        c(
          "pulos",
          "A sequência 30, 25, 20, 15, ... está:",
          "Diminuindo de 5 em 5",
          ["Aumentando de 5 em 5", "Diminuindo de 10 em 10"],
          "Cada número é 5 a menos.",
          {
            feedback: ["Os números estão ficando menores.", "30 para 25 é só 5 a menos."],
          },
        ),
        n(
          "pulos",
          "Contando para trás de 2 em 2: 20, 18, 16, ... Qual vem depois do 16?",
          14,
          "16 − 2 = 14.",
          {
            misreads: [
              { value: 18, feedback: "18 já apareceu; contando para trás, o próximo é menor." },
            ],
          },
        ),
        c(
          "pulos",
          "Para saber quantas meias há em 8 pares, a forma mais rápida é:",
          "Contar de 2 em 2 até 16",
          ["Contar de 1 em 1 até 8", "Contar de 10 em 10"],
          "Cada par tem 2 meias.",
          {
            feedback: ["Contar até 8 conta os pares, não as meias.", "Pular de 10 passa do certo."],
          },
        ),
        n(
          "pulos",
          "Rita guarda 5 moedas por dia. Depois de 6 dias, quantas moedas ela guardou?",
          30,
          "5, 10, 15, 20, 25, 30.",
          { misreads: [{ value: 11, feedback: "Somou 5 com 6; são 6 dias de 5 moedas." }] },
        ),
        c(
          "pulos",
          "Qual número falta: 12, 14, __, 18?",
          "16",
          ["15", "17"],
          "De 2 em 2: 12, 14, 16, 18.",
          {
            feedback: [
              "15 é ímpar; a sequência é de pares.",
              "17 é ímpar; a sequência é de pares.",
            ],
          },
        ),
      ],
    },
    {
      title: "Sequências que crescem",
      objective: "Descobrir quanto uma sequência cresce ou diminui e achar o próximo número.",
      introduction:
        "Algumas sequências crescem sempre o mesmo tanto: 3, 6, 9, 12 cresce de 3 em 3. Para descobrir, veja quanto se soma de um número para o outro.",
      specs: [
        n(
          "crescer",
          "A sequência é 3, 6, 9, 12, ... Qual é o próximo número?",
          15,
          "Cresce de 3 em 3: 12 + 3 = 15.",
          { misreads: [{ value: 13, feedback: "O pulo é de 3, não de 1." }] },
        ),
        c(
          "crescer",
          "Na sequência 4, 8, 12, 16, cada número é:",
          "4 a mais que o anterior",
          ["2 a mais que o anterior", "8 a mais que o anterior"],
          "8 − 4 = 4, 12 − 8 = 4.",
          {
            feedback: ["2 a mais daria 4, 6, 8.", "8 a mais daria 4, 12, 20."],
          },
        ),
        n(
          "crescer",
          "Uma planta tinha 5 folhas e ganha 2 folhas por semana. Quantas folhas terá depois de 3 semanas?",
          11,
          "5, 7, 9, 11.",
          { misreads: [{ value: 7, feedback: "7 é depois de 1 semana só; são 3 semanas." }] },
        ),
        c("crescer", "Qual número falta: 10, 20, __, 40, 50?", "30", ["25", "35"], "De 10 em 10.", {
          feedback: ["25 seria pulo de 5.", "35 não está no pulo de 10."],
        }),
        n(
          "crescer",
          "A sequência é 60, 50, 40, 30, ... Qual é o próximo número?",
          20,
          "Diminui de 10 em 10: 30 − 10 = 20.",
          { misreads: [{ value: 40, feedback: "40 já apareceu; a sequência está diminuindo." }] },
        ),
        c(
          "crescer",
          "Uma torre cresce assim: 1 bloco, depois 3, depois 5, depois 7. Quantos blocos ela terá no próximo passo?",
          "9",
          ["8", "14"],
          "Cresce de 2 em 2.",
          {
            feedback: ["8 somaria só 1.", "14 dobraria o 7."],
          },
        ),
        n("crescer", "Qual número falta: 7, 10, __, 16?", 13, "Cresce de 3 em 3: 10 + 3 = 13.", {
          misreads: [{ value: 11, feedback: "11 somou só 1 ao 10; o pulo é de 3." }],
        }),
        c(
          "crescer",
          "Um menino disse que a sequência 2, 4, 6 continua com 7. O que ele errou?",
          "Depois do 6 vem 8, de 2 em 2",
          ["Nada; ela cresce de 1 em 1", "Ela dobra; depois do 6 vem 12"],
          "6 + 2 = 8.",
          {
            feedback: [
              "De 2 para 4 e de 4 para 6 cresce 2, não 1.",
              "Dobrar daria 2, 4, 8; mas de 4 foi para 6.",
            ],
          },
        ),
      ],
    },
    {
      title: "Figuras que crescem",
      objective: "Contar peças em figuras que crescem passo a passo e prever o próximo passo.",
      introduction:
        "Algumas figuras crescem: cada passo ganha mais peças. Conte as peças de cada passo e veja quantas foram acrescentadas; assim dá para prever o próximo.",
      specs: [
        n(
          "figuras-crescem",
          "Um trenzinho tem 2 vagões no passo 1, 4 no passo 2 e 6 no passo 3. Quantos vagões terá no passo 4?",
          8,
          "Cresce de 2 em 2.",
          { misreads: [{ value: 7, feedback: "O trenzinho ganha 2 vagões por passo, não 1." }] },
        ),
        c(
          "figuras-crescem",
          "Uma escada de blocos tem 1 bloco no primeiro degrau, 2 no segundo, 3 no terceiro. Quantos blocos há na escada de 3 degraus ao todo?",
          "6",
          ["3", "9"],
          "1 + 2 + 3 = 6.",
          {
            feedback: ["3 é só o último degrau.", "9 contaria 3 blocos em cada degrau."],
          },
        ),
        n(
          "figuras-crescem",
          "Uma flor desenhada tem 5 pétalas. Quantas pétalas têm 4 flores iguais?",
          20,
          "5, 10, 15, 20.",
          { misreads: [{ value: 9, feedback: "Somou 4 com 5; são 4 flores de 5 pétalas." }] },
        ),
        c(
          "figuras-crescem",
          "Com palitos: 1 quadrado usa 4 palitos; 2 quadrados colados usam 7; 3 quadrados colados usam 10. Cada quadrado a mais acrescenta:",
          "3 palitos",
          ["4 palitos", "7 palitos"],
          "7 − 4 = 3 e 10 − 7 = 3.",
          {
            feedback: [
              "O novo quadrado aproveita um palito do anterior.",
              "7 é o total de 2 quadrados.",
            ],
          },
        ),
        n(
          "figuras-crescem",
          "Numa fileira de quadrados colados, 1 quadrado usa 4 palitos, 2 usam 7 e 3 usam 10. Quantos palitos são usados para 4 quadrados?",
          13,
          "10 + 3 = 13.",
          {
            misreads: [
              {
                value: 16,
                feedback:
                  "16 daria 4 palitos por quadrado, mas os quadrados colados dividem palitos.",
              },
            ],
          },
        ),
        c(
          "figuras-crescem",
          "Uma pirâmide de latas tem 1 lata em cima, 2 no meio e 3 na base. Quantas latas há ao todo?",
          "6",
          ["3", "5"],
          "1 + 2 + 3 = 6.",
          {
            feedback: ["3 é só a base.", "Faltou uma lata."],
          },
        ),
        n(
          "figuras-crescem",
          "Um desenho tem 3 estrelas no passo 1, 6 no passo 2 e 9 no passo 3. Quantas estrelas terá no passo 5?",
          15,
          "Cresce de 3 em 3: 9, 12, 15.",
          { misreads: [{ value: 12, feedback: "12 é o passo 4; falta mais um." }] },
        ),
        c(
          "figuras-crescem",
          "Para prever o próximo passo de uma figura que cresce, o que se faz primeiro?",
          "Ver quantas peças entram a cada passo",
          ["Contar só as peças do primeiro passo", "Contar só as peças do último passo"],
          "O acréscimo mostra a regra.",
          {
            feedback: [
              "Um passo só não mostra como a figura cresce.",
              "O último passo sozinho não mostra quanto entra de um para o outro.",
            ],
          },
        ),
      ],
    },
    {
      title: "Achar o que falta",
      objective: "Completar sequências com um número ou uma figura que falta e explicar a regra.",
      introduction:
        "Quando falta um pedaço numa sequência, descubra a regra olhando os vizinhos. Depois confira: a regra funciona para todos os números?",
      estimatedMinutes: 15,
      specs: [
        n("falta", "Qual número falta: 5, 10, 15, __, 25?", 20, "De 5 em 5.", {
          misreads: [{ value: 16, feedback: "O pulo é de 5: 15 + 5 = 20." }],
        }),
        c(
          "falta",
          "Qual figura falta: triângulo, círculo, triângulo, __, triângulo?",
          "Círculo",
          ["Triângulo", "Quadrado"],
          "Triângulo e círculo se alternam.",
          {
            feedback: ["Depois do triângulo vem o círculo.", "Quadrado não aparece no padrão."],
          },
        ),
        n("falta", "Qual número falta: 40, 35, __, 25, 20?", 30, "Diminui de 5 em 5.", {
          misreads: [
            { value: 40, feedback: "35 + 5 = 40 sobe, mas a sequência desce: 35 − 5 = 30." },
          ],
        }),
        c(
          "falta",
          "Na sequência 2, 4, 6, 9, 10, qual número está errado?",
          "O 9",
          ["O 4", "O 10"],
          "De 2 em 2, depois do 6 viria o 8.",
          {
            feedback: ["2, 4 está certo.", "10 está certo: 8 + 2."],
          },
        ),
        n("falta", "Qual número falta: 1, 3, 5, __, 9?", 7, "Números ímpares, de 2 em 2.", {
          misreads: [{ value: 6, feedback: "6 é par; a sequência é de ímpares." }],
        }),
        c(
          "falta",
          "Qual regra serve para 11, 21, 31, 41?",
          "Somar 10",
          ["Somar 1", "Somar 11"],
          "21 − 11 = 10.",
          {
            feedback: ["Somar 1 daria 12.", "Somar 11 daria 22."],
          },
        ),
        n(
          "falta",
          "Hoje é segunda-feira, dia 3. A semana tem 7 dias. Em que dia do mês vai ser a próxima segunda-feira?",
          10,
          "3 + 7 = 10.",
          {
            misreads: [
              {
                value: 4,
                feedback: "4 é o dia seguinte, uma terça; a próxima segunda é 7 dias depois.",
              },
            ],
          },
        ),
        c(
          "falta",
          "Depois de achar o número que falta, por que conferir a regra com todos os números?",
          "Porque a regra pode servir só para alguns números",
          ["Porque a regra sempre muda no meio", "Porque o que falta é sempre o maior"],
          "Conferir mostra se a regra está certa.",
          {
            feedback: [
              "Numa sequência com regra, ela não muda; conferir mostra se você achou a regra certa.",
              "O número que falta pode estar em qualquer lugar.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Coloque em ordem os passos para achar o número que falta.",
    labels: [
      "Olhar os números que estão lá",
      "Descobrir quanto se soma ou tira de um para o outro",
      "Usar essa regra para achar o que falta",
      "Conferir a regra com todos os números",
    ],
    explanation: "A regra vem dos números conhecidos e é conferida no fim.",
  },
  justification: {
    prompts: [
      "Explique por que 2, 4, 6 não continua com 7.",
      "Numa fileira de quadrados feitos com palitos, 1 quadrado usa 4 palitos e 2 quadrados usam 7. Explique por que cada quadrado novo usa só 3 palitos.",
      "Explique como você descobriu o número que falta em 7, 10, __, 16.",
    ],
    samples: [
      "De 2 para 4 somei 2, de 4 para 6 somei 2. Então a regra é somar 2. Depois do 6 vem 6 + 2 = 8. O 7 somaria só 1, e isso não segue a regra.",
      "O quadrado novo fica colado no anterior. Um dos lados ele divide com o vizinho, então só precisa de 3 palitos novos. Por isso 1 quadrado usa 4, 2 usam 7, e cada quadrado a mais soma 3.",
      "De 7 para 10 são 3 a mais. Então a regra é somar 3, e o que falta é 10 + 3 = 13. Conferi: 13 + 3 = 16.",
    ],
    focus: "a regra da sequência",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const inicio = 2 + (seed % 8);
      const pulo = 2 + (Math.floor(seed / 8) % 4);
      const faltando = inicio + 2 * pulo;
      return c(
        "numero-que-falta",
        `Qual número falta: ${inicio}, ${inicio + pulo}, __, ${inicio + 3 * pulo}?`,
        `${faltando}`,
        [`${faltando + 1}`, `${inicio + pulo + 1}`],
        `A sequência cresce de ${pulo} em ${pulo}: ${inicio + pulo} + ${pulo} = ${faltando}.`,
        {
          feedback: [
            "Não confere: o pulo entre os números é sempre o mesmo.",
            `Somou 1, mas o pulo é de ${pulo}.`,
          ],
        },
      );
    }
    if (variant === 1) {
      // Pedaços de 3 a 5 e colares de 6 a 9 pedaços: nenhuma alternativa coincide.
      const pedaco = 3 + (seed % 3);
      const total = pedaco * (6 + (Math.floor(seed / 3) % 4));
      const especiais = total / pedaco;
      return c(
        "quantos-no-padrao",
        `Um colar repete sempre um pedaço de ${pedaco} contas. Em cada pedaço, só a última conta é dourada. O colar tem ${total} contas. Quantas são douradas?`,
        `${especiais}`,
        [`${total - especiais}`, `${pedaco}`],
        `O colar tem ${especiais} pedaços de ${pedaco} contas, cada um com 1 dourada.`,
        {
          feedback: [
            "Essas são as contas que não são douradas.",
            "Esse é o tamanho do pedaço que se repete.",
          ],
        },
      );
    }
    const pulo = [2, 5, 10][seed % 3] ?? 2;
    const passos = 4 + (Math.floor(seed / 3) % 5);
    const final = pulo * passos;
    return c(
      "contar-pulando",
      `Contando de ${pulo} em ${pulo}, começando no ${pulo}, qual é o ${passos}º número?`,
      `${final}`,
      [`${final + pulo}`, `${pulo + passos}`],
      `${pulo} × ${passos} = ${final}.`,
      {
        feedback: [
          "Contou um pulo a mais.",
          "Somou o pulo com a posição; é preciso pular várias vezes.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "sequencias-iniciais",
    title: "Meu colar de padrões",
    prompt:
      "Invente um padrão com cores ou objetos (feijões, botões, lápis) e monte uma fila com pelo menos 15 peças. Desafie alguém da família a descobrir o pedaço que se repete e a dizer qual é a 20ª peça.",
    lab: "grid",
    steps: [
      "Monte o padrão e desenhe as primeiras 15 peças.",
      "Escreva qual é o pedaço que se repete.",
      "Descubra a 20ª peça sem montar até lá e confira montando.",
    ],
    rubric: [
      "Padrão montado e desenhado (0–2)",
      "Pedaço que se repete identificado (0–2)",
      "20ª peça prevista corretamente (0–3)",
      "Explicação para alguém da família (0–1)",
    ],
  },
  homeSupport: [
    "Façam juntos palmas em padrão (palma, palma, pé) e parem de repente: a criança diz qual é o próximo movimento.",
    "Contem juntos de 2 em 2 os degraus ou os passos até a porta, e depois para trás.",
  ],
};
