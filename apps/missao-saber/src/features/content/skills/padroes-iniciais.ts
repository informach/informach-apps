import { c, n, type SkillPack } from "../skill-factory";

/**
 * Padrões iniciais: continuar sequências de figuras e números, descobrir a
 * regra, achar o termo distante sem escrever todos, ler padrões que se
 * repetem em ciclos e usar padrões para resolver problemas.
 * Trilhas Canguru P e Mirim 2.
 */
export const padroesIniciais: SkillPack = {
  id: "padroes-iniciais",
  name: "Descobrir padrões",
  domain: "common",
  lab: null,
  missions: [
    {
      title: "O que vem depois?",
      objective:
        "Continuar sequências que se repetem e sequências que crescem sempre do mesmo jeito.",
      introduction:
        "Um padrão é uma regra que se repete. Em alguns, um pedaço volta sempre igual: bola, estrela, bola, estrela. Em outros, cada número cresce a mesma quantidade: 3, 6, 9, 12.",
      specs: [
        n(
          "continuar",
          "A sequência é 4, 7, 10, 13, ... Qual é o próximo número?",
          16,
          "Cada número é 3 a mais que o anterior: 13 + 3 = 16.",
          { misreads: [{ value: 14, feedback: "Somou 1; o salto da sequência é 3." }] },
        ),
        c(
          "continuar",
          "Um colar segue o padrão: azul, azul, vermelha, azul, azul, vermelha... Qual é a cor da 7ª conta?",
          "Azul",
          ["Vermelha", "Não dá para saber"],
          "O pedaço que se repete tem 3 contas. A 7ª começa um pedaço novo, igual à 1ª: azul.",
          {
            feedback: [
              "Vermelha aparece nas posições 3, 6, 9; a 7ª não é uma delas.",
              "Dá para saber: o padrão se repete de 3 em 3.",
            ],
          },
        ),
        n(
          "continuar",
          "A sequência é 50, 45, 40, 35, ... Qual é o próximo número?",
          30,
          "Cada número é 5 a menos que o anterior: 35 − 5 = 30.",
          { misreads: [{ value: 40, feedback: "40 já apareceu; a sequência está diminuindo." }] },
        ),
        c(
          "continuar",
          "Uma sequência de figuras é: triângulo, quadrado, círculo, triângulo, quadrado, círculo... Qual figura fica na 9ª posição?",
          "Círculo",
          ["Triângulo", "Quadrado"],
          "As posições 3, 6 e 9 são círculos.",
          {
            feedback: [
              "Triângulo fica nas posições 1, 4, 7, 10.",
              "Quadrado fica nas posições 2, 5, 8.",
            ],
          },
        ),
        n(
          "continuar",
          "A sequência é 1, 2, 4, 8, ... Qual é o próximo número?",
          16,
          "Cada número é o dobro do anterior: 8 × 2 = 16.",
          { misreads: [{ value: 12, feedback: "Somou 4; a regra é dobrar, e o salto cresce." }] },
        ),
        c(
          "continuar",
          "Na sequência 2, 5, 8, 11, ..., qual é a regra?",
          "Somar 3 a cada passo",
          ["Somar 2 a cada passo", "Dobrar a cada passo"],
          "5 − 2 = 3, 8 − 5 = 3, 11 − 8 = 3.",
          {
            feedback: ["Somar 2 daria 2, 4, 6, 8.", "Dobrar daria 2, 4, 8, 16."],
          },
        ),
        n(
          "continuar",
          "A sequência é 3, 6, 9, 12, 15, ... Qual é o 7º número?",
          21,
          "Os números são 3, 6, 9, 12, 15, 18, 21.",
          { misreads: [{ value: 18, feedback: "18 é o 6º número; falta mais um salto de 3." }] },
        ),
        c(
          "continuar",
          "Uma sequência de figuras cresce assim: 1 quadradinho, depois 3, depois 5, depois 7. Quantos quadradinhos tem a figura seguinte?",
          "9",
          ["8", "10"],
          "Cada figura ganha 2 quadradinhos: 7 + 2 = 9.",
          {
            feedback: ["8 somaria só 1; o salto é 2.", "10 somaria 3; a figura ganha sempre 2."],
          },
        ),
      ],
    },
    {
      title: "Qual é a regra?",
      objective: "Descobrir a regra de uma sequência e usá-la para achar um termo mais distante.",
      introduction:
        "Para achar um termo distante, não é preciso escrever todos. Descubra a regra, veja quantos passos faltam e calcule.",
      specs: [
        n(
          "regra",
          "Uma sequência começa em 5 e cresce de 4 em 4: 5, 9, 13, ... Qual é o 10º número?",
          41,
          "Do 1º ao 10º há 9 saltos de 4: 5 + 9 × 4 = 41.",
          {
            misreads: [
              { value: 45, feedback: "45 usa 10 saltos, mas do 1º ao 10º há só 9 saltos." },
            ],
          },
        ),
        c(
          "regra",
          "Em uma fila de casas, os números são 3, 7, 11, 15, ... Qual é o número da 8ª casa?",
          "31",
          ["27", "35"],
          "7 saltos de 4 depois do 3: 3 + 28 = 31.",
          {
            feedback: ["27 é a 7ª casa.", "35 seria a 9ª casa."],
          },
        ),
        n(
          "regra",
          "Uma sequência é 100, 90, 80, ... Em que posição aparece o número 30?",
          8,
          "De 100 a 30 são 7 saltos de 10: posição 1 + 7 = 8.",
          { misreads: [{ value: 7, feedback: "7 é o número de saltos; a posição é um a mais." }] },
        ),
        c(
          "regra",
          "Na sequência 1, 4, 9, 16, 25, ..., qual é a regra?",
          "Multiplicar a posição por ela mesma",
          ["Somar 3 a cada passo", "Multiplicar o número anterior por 4"],
          "Cada número é a posição multiplicada por ela mesma: 1×1, 2×2, 3×3... Os saltos crescem: 3, 5, 7, 9. São os quadrados das posições.",
          {
            feedback: [
              "Somar 3 sempre daria 1, 4, 7, 10.",
              "Multiplicar por 4 serve de 1 para 4, mas depois daria 16, e não 9.",
            ],
          },
        ),
        n(
          "regra",
          "Cada mesa de uma festa recebe 6 copos. Seguindo o padrão 6, 12, 18, ..., quantos copos há em 9 mesas?",
          54,
          "9 × 6 = 54.",
          { misreads: [{ value: 48, feedback: "48 é para 8 mesas." }] },
        ),
        c(
          "regra",
          "Uma sequência é 2, 4, 8, 16, 32, ... Qual número vem duas posições depois do 32?",
          "128",
          ["64", "34"],
          "32 × 2 = 64 e 64 × 2 = 128.",
          {
            feedback: ["64 é só uma posição depois.", "34 soma 2; a regra é dobrar."],
          },
        ),
        n(
          "regra",
          "Uma escadinha de blocos tem 1 bloco no primeiro degrau, 2 no segundo, 3 no terceiro, e assim por diante. Quantos blocos há ao todo em 6 degraus?",
          21,
          "1 + 2 + 3 + 4 + 5 + 6 = 21.",
          {
            misreads: [{ value: 6, feedback: "6 é só o último degrau; a pergunta pede o total." }],
          },
        ),
        c(
          "regra",
          "Uma sequência é 7, 14, 21, 28, ... Qual destes números aparece nela?",
          "63",
          ["50", "40"],
          "Todos os números da sequência são múltiplos de 7, e 63 = 9 × 7.",
          {
            feedback: [
              "50 não é múltiplo de 7: fica entre 49 e 56.",
              "40 não é múltiplo de 7: fica entre 35 e 42.",
            ],
          },
        ),
      ],
    },
    {
      title: "Padrões que dão voltas",
      objective:
        "Usar a repetição em ciclos para descobrir posições distantes, como dias da semana e cores que se repetem.",
      introduction:
        "Quando um padrão se repete em ciclos, basta saber o tamanho do ciclo. Dividir a posição pelo tamanho do ciclo mostra onde ela cai: o resto diz a resposta.",
      specs: [
        c(
          "ciclo",
          "As luzes de uma árvore acendem na ordem vermelha, amarela, verde, azul, e recomeçam. Qual é a cor da 14ª luz?",
          "Amarela",
          ["Vermelha", "Azul"],
          "O ciclo tem 4 cores. 14 = 3 ciclos completos (12) e mais 2: a 2ª cor, amarela.",
          {
            feedback: [
              "Vermelha fica nas posições 1, 5, 9, 13.",
              "Azul fica nas posições 4, 8, 12, 16.",
            ],
          },
        ),
        c(
          "ciclo",
          "Hoje é terça-feira. Que dia da semana será daqui a 10 dias?",
          "Sexta-feira",
          ["Quinta-feira", "Sábado"],
          "7 dias voltam à terça; sobram 3: quarta, quinta, sexta.",
          {
            feedback: ["Quinta seria daqui a 9 dias.", "Sábado seria daqui a 11 dias."],
          },
        ),
        c(
          "ciclo",
          "Um padrão de piso repete: cinza, cinza, branco. Quantos ladrilhos brancos há nos primeiros 20 ladrilhos?",
          "6",
          ["7", "10"],
          "Os brancos ficam nas posições 3, 6, 9, 12, 15 e 18: 6 brancos. A posição 21 já passa de 20.",
          {
            feedback: [
              "O 7º branco seria o ladrilho 21, que não está nos 20 primeiros.",
              "10 seria se metade fosse branca, mas só 1 em cada 3 é.",
            ],
          },
        ),
        n(
          "ciclo",
          "Uma dança repete 5 passos sempre na mesma ordem. Qual passo é feito no 23º movimento? Responda o número do passo dentro do ciclo.",
          3,
          "4 ciclos completos usam 20 movimentos; sobram 3: o 3º passo.",
          {
            misreads: [
              {
                value: 4,
                feedback: "4 é o número de ciclos completos; a pergunta pede o passo que sobra.",
              },
              { value: 23, feedback: "O ciclo só tem 5 passos; tire os ciclos completos." },
            ],
          },
        ),
        c(
          "ciclo",
          "Se hoje é sábado, que dia será daqui a 21 dias?",
          "Sábado",
          ["Domingo", "Sexta-feira"],
          "21 dias são 3 semanas exatas: volta ao mesmo dia.",
          {
            feedback: ["Domingo seria daqui a 22 dias.", "Sexta seria daqui a 20 dias."],
          },
        ),
        n(
          "ciclo",
          "Num colar, o padrão é: 2 contas brancas e 1 preta, repetindo. Se o colar tem 30 contas, quantas são pretas?",
          10,
          "Cada ciclo de 3 tem 1 preta; 30 ÷ 3 = 10 ciclos: 10 pretas.",
          { misreads: [{ value: 20, feedback: "20 são as brancas: 2 por ciclo." }] },
        ),
        c(
          "ciclo",
          "Um relógio de parede toca uma música a cada 3 horas, começando às 3 da manhã. Ele toca ao meio-dia?",
          "Sim, porque 12 é múltiplo de 3",
          ["Não, porque só toca de manhã", "Não, porque 12 não está na sequência"],
          "Toca às 3, 6, 9 e 12: o meio-dia está no ciclo.",
          {
            feedback: ["O padrão continua o dia inteiro.", "12 = 4 × 3, então está na sequência."],
          },
        ),
        c(
          "ciclo",
          "Para saber a cor da 50ª conta em um colar que repete 4 cores, o jeito mais rápido é:",
          "Dividir 50 por 4 e olhar o resto",
          ["Desenhar as 50 contas, uma por uma", "Dividir 50 por 4 e olhar o resultado"],
          "50 = 12 × 4 + 2: resto 2 significa a 2ª cor. A 50ª conta tem a mesma cor da 2ª.",
          {
            feedback: [
              "Desenhar funciona, mas é lento e fácil de errar.",
              "O resultado, 12, diz quantas voltas completas o colar deu; quem diz a cor é o resto.",
            ],
          },
        ),
      ],
    },
    {
      title: "Padrões em tabelas e figuras",
      objective: "Reconhecer padrões em quadros de números e em figuras que crescem em etapas.",
      introduction:
        "Padrões também aparecem em tabelas de números e em figuras que crescem. Em uma tabela, olhe linhas e colunas; em figuras, veja o que muda de uma etapa para a outra.",
      specs: [
        n(
          "tabela",
          "Em um quadro, cada linha tem 5 números seguidos: a 1ª linha é 1 a 5, a 2ª é 6 a 10, e assim por diante. Qual é o primeiro número da 6ª linha?",
          26,
          "Cada linha começa 5 depois da anterior: 1, 6, 11, 16, 21, 26.",
          {
            misreads: [
              { value: 30, feedback: "30 é o último número da 6ª linha, não o primeiro." },
            ],
          },
        ),
        c(
          "tabela",
          "No mesmo quadro de 5 números por linha, em que linha está o número 33?",
          "7ª linha",
          ["6ª linha", "8ª linha"],
          "A 7ª linha vai de 31 a 35.",
          {
            feedback: ["A 6ª linha vai de 26 a 30.", "A 8ª linha vai de 36 a 40."],
          },
        ),
        n(
          "figura-que-cresce",
          "Uma figura é feita com palitos: a etapa 1 tem 4 palitos, a etapa 2 tem 7, a etapa 3 tem 10. Quantos palitos tem a etapa 6?",
          19,
          "Cada etapa ganha 3 palitos: 4 + 5 × 3 = 19.",
          {
            misreads: [{ value: 22, feedback: "22 seria a etapa 7; da etapa 1 à 6 são 5 saltos." }],
          },
        ),
        c(
          "figura-que-cresce",
          "Um jardim quadrado tem 1 canteiro na etapa 1, 4 na etapa 2 e 9 na etapa 3, sempre formando um quadrado. Quantos canteiros há na etapa 5?",
          "25",
          ["15", "16"],
          "Na etapa 5 o quadrado tem 5 canteiros de lado: 5 × 5 = 25.",
          {
            feedback: [
              "15 continua de 3 em 3 depois do 9, mas os saltos crescem: 3, 5, 7, 9.",
              "16 é a etapa 4.",
            ],
          },
        ),
        n(
          "tabela",
          "Em uma tabela de multiplicação, a linha do 6 é 6, 12, 18, 24, ... Qual número fica na 8ª coluna dessa linha?",
          48,
          "8 × 6 = 48.",
          { misreads: [{ value: 42, feedback: "42 é a 7ª coluna." }] },
        ),
        c(
          "figura-que-cresce",
          "Uma torre de latas tem 1 lata em cima, 2 embaixo dela, 3 embaixo, e assim por diante. Uma torre de 4 andares tem quantas latas?",
          "10",
          ["4", "16"],
          "1 + 2 + 3 + 4 = 10.",
          {
            feedback: [
              "4 é só o andar de baixo.",
              "16 seria um quadrado de 4 por 4, não uma torre.",
            ],
          },
        ),
        n(
          "tabela",
          "Em um calendário, os números de uma mesma coluna crescem de 7 em 7. Se um dia da coluna é 4, qual é o próximo dia da mesma coluna?",
          11,
          "4 + 7 = 11: uma semana depois.",
          { misreads: [{ value: 5, feedback: "5 é o dia seguinte, que fica na coluna ao lado." }] },
        ),
        c(
          "figura-que-cresce",
          "Uma cerca cresce assim: 1 quadrado usa 4 palitos, 2 quadrados em fila usam 7, 3 usam 10. Qual regra dá o número de palitos?",
          "Multiplicar o número de quadrados por 3 e somar 1",
          ["Multiplicar o número de quadrados por 4", "Somar 4 ao número de quadrados"],
          "3 × 1 + 1 = 4, 3 × 2 + 1 = 7, 3 × 3 + 1 = 10.",
          {
            feedback: [
              "Multiplicar por 4 daria 8 para dois quadrados, mas eles dividem um palito.",
              "Somar 4 daria 5, 6, 7, que não bate.",
            ],
          },
        ),
      ],
    },
    {
      title: "Padrões para resolver problemas",
      objective: "Usar um padrão para prever, conferir e explicar a resposta de um problema.",
      introduction:
        "Muitos problemas ficam fáceis quando se descobre o padrão: montar uma tabela pequena, ver a regra e aplicar. Depois vale conferir com um caso que já se conhece.",
      estimatedMinutes: 18,
      specs: [
        n(
          "resolver",
          "Uma planta cresce 2 centímetros por semana. Hoje ela tem 9 centímetros. Quantos centímetros terá daqui a 6 semanas?",
          21,
          "9 + 6 × 2 = 21.",
          {
            misreads: [
              {
                value: 15,
                feedback: "15 soma 6 uma vez; são 2 centímetros em cada uma das 6 semanas.",
              },
            ],
          },
        ),
        c(
          "resolver",
          "Um cofrinho recebe 5 moedas por dia. No 1º dia ficou com 5, no 2º com 10. Em que dia chega a 45 moedas?",
          "9º dia",
          ["8º dia", "10º dia"],
          "45 ÷ 5 = 9.",
          {
            feedback: ["No 8º dia há 40 moedas.", "No 10º dia há 50 moedas."],
          },
        ),
        n(
          "resolver",
          "Mesas quadradas são encostadas em fila. Em 1 mesa cabem 4 pessoas; em 2 mesas em fila cabem 6; em 3 cabem 8. Quantas pessoas cabem em 7 mesas em fila?",
          16,
          "Cada mesa nova acrescenta 2 lugares: 4 + 6 × 2 = 16.",
          {
            misreads: [
              {
                value: 28,
                feedback: "28 seria 4 por mesa, mas as mesas encostadas perdem os lados do meio.",
              },
            ],
          },
        ),
        c(
          "resolver",
          "Numa brincadeira, a roda começa com 1 criança e a cada rodada o número dobra: depois de 1 rodada são 2, depois de 2 são 4, depois de 3 são 8. Depois de quantas rodadas haverá pelo menos 30 crianças?",
          "5 rodadas",
          ["4 rodadas", "30 rodadas"],
          "Depois de 1, 2, 3, 4 e 5 rodadas: 2, 4, 8, 16, 32. Com 5 rodadas passa de 30.",
          {
            feedback: [
              "Após 4 rodadas são 16 crianças.",
              "Dobrar chega a 30 muito antes de 30 rodadas.",
            ],
          },
        ),
        n(
          "resolver",
          "Uma sequência de figuras usa 5, 8, 11, 14 bolinhas. Qual etapa usa exatamente 32 bolinhas?",
          10,
          "De 5 a 32 são 27, ou seja, 9 saltos de 3: etapa 1 + 9 = 10.",
          { misreads: [{ value: 9, feedback: "9 é o número de saltos; a etapa é um a mais." }] },
        ),
        c(
          "resolver",
          "Um colega diz que a sequência 3, 6, 12 continua com 15, porque 'vai de 3 em 3'. O que está errado?",
          "A regra é dobrar, então o próximo é 24",
          ["Nada; vai de 3 em 3 e o próximo é 15", "O salto é 6, então o próximo é 18"],
          "De 6 para 12 o salto foi 6, não 3: a regra é dobrar. 3 × 2 = 6, 6 × 2 = 12, 12 × 2 = 24.",
          {
            feedback: [
              "Se fosse de 3 em 3, depois do 6 viria 9, não 12.",
              "18 usa um salto fixo de 6, mas os saltos foram 3 e depois 6: dobram.",
            ],
          },
        ),
        n(
          "resolver",
          "Um padrão de azulejos usa 1 azul para cada 4 brancos. Em uma parede com 60 azulejos, quantos são azuis?",
          12,
          "Cada grupo de 5 tem 1 azul; 60 ÷ 5 = 12 grupos.",
          {
            misreads: [
              {
                value: 15,
                feedback: "15 divide por 4, mas cada grupo tem 5 azulejos: 1 azul e 4 brancos.",
              },
            ],
          },
        ),
        c(
          "resolver",
          "Por que vale a pena conferir um padrão com um caso que já se conhece antes de usar a regra para uma posição distante?",
          "Porque uma regra que parece certa pode falhar",
          ["Porque conferir é obrigatório em prova", "Não vale a pena; a regra sempre funciona"],
          "Uma regra que parece certa nos primeiros termos pode falhar, e conferir evita levar o erro para longe. Testar a regra em um termo conhecido é a forma mais simples de pegar um engano.",
          {
            feedback: [
              "Não é uma regra de prova; é uma forma de não errar.",
              "Regras erradas parecem certas no começo, como 3, 6 e depois 9 ou 12.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Coloque em ordem os passos para descobrir um termo distante de uma sequência.",
    labels: [
      "Olhar os primeiros termos e ver o que muda de um para o outro",
      "Escrever a regra da sequência",
      "Contar quantos passos faltam até a posição pedida",
      "Aplicar a regra e conferir com um termo já conhecido",
    ],
    explanation:
      "A regra vem da observação; o número de passos decide a conta; a conferência com um termo conhecido fecha o trabalho.",
  },
  justification: {
    prompts: [
      "Explique como descobrir a cor da 50ª conta em um colar que repete 4 cores, sem desenhar as 50.",
      "Uma sequência começa em 5 e cresce de 4 em 4. Explique por que o 10º termo usa 9 saltos e não 10.",
      "Um colega acha que 3, 6, 12 continua com 15. Explique por que não e diga qual é o próximo.",
    ],
    samples: [
      "O colar repete de 4 em 4, então a 4ª, a 8ª, a 12ª conta são todas da 4ª cor. 48 é múltiplo de 4, então a 48ª é a 4ª cor. A 49ª recomeça com a 1ª cor e a 50ª é a 2ª cor. Fazendo pela divisão: 50 ÷ 4 dá 12 e sobra 2, que é a posição dentro do ciclo.",
      "O 1º termo já está lá, sem salto nenhum. Para chegar ao 2º dou 1 salto, ao 3º dou 2 saltos, e para chegar ao 10º dou 9 saltos. Por isso é 5 + 9 × 4 = 41. Se usasse 10 saltos, chegaria no 11º termo.",
      "Se a regra fosse somar 3, depois do 6 viria 9, mas veio 12. De 3 para 6 e de 6 para 12 o número dobrou. Então a regra é dobrar, e o próximo é 24.",
    ],
    focus: "a descoberta e a conferência da regra",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const inicio = 2 + (seed % 7);
      const salto = 3 + (seed % 5);
      const posicao = 8 + (seed % 6);
      const termo = inicio + (posicao - 1) * salto;
      return c(
        "termo-distante",
        `Uma sequência começa em ${inicio} e cresce de ${salto} em ${salto}: ${inicio}, ${inicio + salto}, ${inicio + 2 * salto}, ... Qual é o ${posicao}º número?`,
        `${termo}`,
        [`${termo + salto}`, `${termo - salto}`],
        `Do 1º ao ${posicao}º há ${posicao - 1} saltos: ${inicio} + ${posicao - 1} × ${salto} = ${termo}.`,
        {
          feedback: [
            `Usou ${posicao} saltos, mas do 1º ao ${posicao}º há ${posicao - 1}.`,
            `Esse é o ${posicao - 1}º número.`,
          ],
        },
      );
    }
    if (variant === 1) {
      const ciclo = 4;
      const cores = ["vermelha", "azul", "verde", "amarela"];
      const posicao = 20 + (seed % 23);
      const resto = posicao % ciclo;
      const indice = resto === 0 ? ciclo - 1 : resto - 1;
      const outra = (indice + 1) % ciclo;
      const maisUma = (indice + 2) % ciclo;
      const lista = cores.slice(0, ciclo).join(", ");
      return c(
        "cor-no-ciclo",
        `Um colar repete sempre estas cores, nesta ordem: ${lista}. Qual é a cor da ${posicao}ª conta?`,
        cores[indice] ?? "vermelha",
        [cores[outra] ?? "azul", cores[maisUma] ?? "verde"],
        resto === 0
          ? `${posicao} = ${posicao / ciclo} ciclos completos de ${ciclo}: a última cor, ${cores[indice]}.`
          : `${posicao} = ${Math.floor(posicao / ciclo)} ciclos de ${ciclo} e mais ${resto}: a ${resto}ª cor, ${cores[indice]}.`,
        {
          feedback: [
            "Essa é a cor da conta seguinte; confira a posição dentro do ciclo.",
            "Essa cor fica duas posições depois; confira a posição dentro do ciclo.",
          ],
        },
      );
    }
    const base = 3 + (seed % 4);
    const passo = 2 + (seed % 3);
    const etapa = 6 + (seed % 5);
    const total = base + (etapa - 1) * passo;
    return c(
      "figura-que-cresce",
      `Uma figura feita com palitos tem ${base} palitos na etapa 1, ${base + passo} na etapa 2 e ${base + 2 * passo} na etapa 3, sempre crescendo do mesmo jeito. Quantos palitos tem a etapa ${etapa}?`,
      `${total}`,
      [`${total + passo}`, `${total - passo}`],
      `Cada etapa ganha ${passo} palitos: ${base} + ${etapa - 1} × ${passo} = ${total}.`,
      {
        feedback: [
          `Contou ${etapa} saltos, mas da etapa 1 à etapa ${etapa} há ${etapa - 1}.`,
          `Parou na etapa ${etapa - 1}; falta mais um salto de ${passo}.`,
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "padroes-iniciais",
    title: "O padrão da minha casa",
    prompt:
      "Encontre um padrão que se repete na sua casa ou na rua (azulejos, grades, uma cerca, um calendário). Descreva a regra, preveja o que aparece em uma posição distante e vá conferir.",
    lab: null,
    steps: [
      "Escolha o padrão e escreva ou desenhe os primeiros elementos.",
      "Descreva a regra com suas palavras e preveja a 20ª posição ou outra posição distante.",
      "Confira olhando o padrão de verdade e explique se acertou.",
    ],
    rubric: [
      "Padrão escolhido e registrado com clareza (0–2)",
      "Regra descrita corretamente (0–3)",
      "Previsão feita com a regra, não contando um a um (0–2)",
      "Conferência com o padrão real e explicação (0–1)",
    ],
  },
  homeSupport: [
    "Ao ver um piso, uma grade ou um colar, perguntem qual é o pedaço que se repete e qual será a cor ou forma da 10ª peça.",
    "Brinquem de inventar sequências de números: um diz três números, o outro descobre a regra e diz o próximo.",
  ],
};
