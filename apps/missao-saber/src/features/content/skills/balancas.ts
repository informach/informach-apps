import { c, n, type SkillPack } from "../skill-factory";

/**
 * Balanças e relações: equilíbrio de dois pratos, trocar um objeto por
 * outros do mesmo peso, comparar sem pesar, descobrir o peso escondido e
 * usar a ideia de balança em igualdades com números. Trilha Canguru P.
 */
export const balancas: SkillPack = {
  id: "balancas",
  name: "Balanças e trocas",
  domain: "canguru",
  lab: "bars",
  missions: [
    {
      title: "Pratos em equilíbrio",
      objective:
        "Ler uma balança de dois pratos e dizer qual lado é mais pesado ou se há equilíbrio.",
      introduction:
        "Numa balança de dois pratos, o prato que desce é o mais pesado. Se os pratos ficam na mesma altura, os dois lados pesam o mesmo. Tirar ou pôr a mesma coisa dos dois lados não muda o equilíbrio.",
      specs: [
        c(
          "ler-balanca",
          "Numa balança, o prato da esquerda tem 3 maçãs iguais e o da direita tem 2 maçãs iguais às outras. O que acontece?",
          "O prato da esquerda desce, porque tem mais peso",
          ["O prato da direita desce", "Os pratos ficam equilibrados"],
          "3 maçãs pesam mais que 2 maçãs iguais.",
          {
            feedback: [
              "O lado com menos maçãs sobe.",
              "Equilíbrio só com a mesma quantidade de maçãs iguais.",
            ],
          },
        ),
        n(
          "ler-balanca",
          "Uma balança está equilibrada: de um lado há uma caixa, do outro há 4 pesos de 100 gramas. Quanto pesa a caixa, em gramas?",
          400,
          "4 × 100 = 400 gramas.",
          { misreads: [{ value: 4, feedback: "4 é o número de pesos; cada um tem 100 gramas." }] },
        ),
        c(
          "ler-balanca",
          "Uma balança está equilibrada com um pacote de cada lado. Tira-se uma bala de cada pacote. O que acontece com a balança?",
          "Continua equilibrada",
          ["O lado esquerdo desce", "Não dá para saber"],
          "Tirar o mesmo peso dos dois lados mantém o equilíbrio.",
          {
            feedback: [
              "Os dois lados perderam o mesmo peso.",
              "Dá para saber: mudanças iguais mantêm o equilíbrio.",
            ],
          },
        ),
        n(
          "ler-balanca",
          "Numa balança equilibrada, um lado tem um livro e um peso de 200 gramas; o outro lado tem um peso de 1 quilo. Quanto pesa o livro, em gramas?",
          800,
          "1.000 − 200 = 800 gramas.",
          {
            misreads: [
              { value: 1200, feedback: "Somou; o peso de 200 já está no mesmo prato do livro." },
            ],
          },
        ),
        c(
          "ler-balanca",
          "Na balança, uma melancia equilibra 3 abacaxis iguais. Dois abacaxis equilibram 6 laranjas iguais. Quantas laranjas equilibram a melancia?",
          "9",
          ["6", "18"],
          "1 abacaxi = 3 laranjas; 3 abacaxis = 9 laranjas.",
          {
            feedback: [
              "6 laranjas equilibram só 2 abacaxis.",
              "18 seria 6 laranjas por abacaxi, mas são 3.",
            ],
          },
        ),
        n(
          "ler-balanca",
          "Uma balança está equilibrada com 5 bolinhas iguais de um lado e 1 cubo do outro. Se cada bolinha pesa 20 gramas, quanto pesa o cubo, em gramas?",
          100,
          "5 × 20 = 100 gramas.",
          { misreads: [{ value: 25, feedback: "Somou 5 com 20; são 5 bolinhas de 20 gramas." }] },
        ),
        c(
          "ler-balanca",
          "Numa balança, o prato da esquerda tem 2 maçãs e o da direita tem 2 maçãs e 1 uva. Qual prato desce?",
          "O da direita, por causa da uva",
          ["O da esquerda", "Nenhum; ficam iguais"],
          "As maçãs se anulam; sobra a uva na direita.",
          {
            feedback: ["A esquerda tem menos peso.", "A uva desequilibra, mesmo sendo leve."],
          },
        ),
        c(
          "ler-balanca",
          "Uma balança está desequilibrada: o lado da caixa A está embaixo. Coloca-se um peso igual nos dois pratos. O que acontece?",
          "Continua com o lado da caixa A embaixo",
          ["Fica equilibrada", "O outro lado desce"],
          "Somar o mesmo peso dos dois lados não muda quem é mais pesado.",
          {
            feedback: [
              "Para equilibrar, o peso teria de ir só no lado mais leve.",
              "Nada mudou na diferença entre os lados.",
            ],
          },
        ),
      ],
    },
    {
      title: "Trocas justas",
      objective: "Trocar um objeto por outros de mesmo peso e usar uma troca para descobrir outra.",
      introduction:
        "Se 1 pera pesa o mesmo que 2 ameixas, podemos trocar uma pela outra em qualquer balança sem mudar nada. Encadear trocas leva a descobrir pesos que não aparecem direto.",
      specs: [
        n(
          "trocar",
          "1 pera pesa o mesmo que 2 ameixas. 1 maçã pesa o mesmo que 3 ameixas. Quantas ameixas pesam o mesmo que 2 peras e 1 maçã?",
          7,
          "2 peras = 4 ameixas; mais 3 da maçã: 7.",
          {
            misreads: [
              { value: 5, feedback: "Contou 1 pera só; são 2 peras, que valem 4 ameixas." },
            ],
          },
        ),
        c(
          "trocar",
          "1 cubo pesa o mesmo que 4 bolinhas. 2 cubos equilibram quantas bolinhas?",
          "8",
          ["6", "4"],
          "2 × 4 = 8 bolinhas.",
          {
            feedback: [
              "6 somaria 2 com 4; cada cubo vale 4 bolinhas.",
              "4 bolinhas equilibram só 1 cubo.",
            ],
          },
        ),
        n(
          "trocar",
          "3 laranjas pesam o mesmo que 1 abacaxi. 2 abacaxis pesam o mesmo que 1 melão. Quantas laranjas pesam o mesmo que 1 melão?",
          6,
          "1 melão = 2 abacaxis = 6 laranjas.",
          {
            misreads: [
              { value: 5, feedback: "Somou 3 com 2; cada um dos 2 abacaxis vale 3 laranjas." },
            ],
          },
        ),
        c(
          "trocar",
          "Uma balança tem 1 pera e 1 ameixa de um lado e 3 ameixas do outro, em equilíbrio. Quantas ameixas pesa a pera?",
          "2",
          ["3", "4"],
          "Tirando 1 ameixa de cada lado, sobra a pera contra 2 ameixas.",
          {
            feedback: [
              "3 ameixas equilibram a pera junto com uma ameixa.",
              "4 seria somar em vez de tirar a ameixa que está junto com a pera.",
            ],
          },
        ),
        n(
          "trocar",
          "2 caixas iguais pesam o mesmo que 10 latas iguais. Quantas latas pesam o mesmo que 3 caixas?",
          15,
          "1 caixa = 5 latas; 3 caixas = 15 latas.",
          {
            misreads: [
              {
                value: 30,
                feedback: "30 usaria 10 latas por caixa, mas 10 latas são o peso de 2 caixas.",
              },
            ],
          },
        ),
        c(
          "trocar",
          "1 gato pesa o mesmo que 2 coelhos. 1 coelho pesa o mesmo que 4 hamsters. Um cachorro pesa o mesmo que 3 gatos. Quantos hamsters pesam o mesmo que o cachorro?",
          "24",
          ["12", "9"],
          "1 gato = 8 hamsters; 3 gatos = 24 hamsters.",
          {
            feedback: [
              "12 seria só 1 gato e meio.",
              "9 soma 2 + 4 + 3, mas as trocas se multiplicam.",
            ],
          },
        ),
        n(
          "trocar",
          "Na balança, 1 pacote grande equilibra 3 pacotes pequenos. Em outra balança, um prato tem 2 pacotes grandes e 1 pequeno. Quantos pacotes pequenos equilibram esse prato?",
          7,
          "2 grandes = 6 pequenos; mais 1: 7.",
          {
            misreads: [{ value: 6, feedback: "Esqueceu o pacote pequeno que já estava no prato." }],
          },
        ),
        c(
          "trocar",
          "Se 1 bola equilibra 3 dados e 1 dado equilibra 2 botões, então 1 bola equilibra:",
          "6 botões",
          ["5 botões", "3 botões"],
          "3 dados = 3 × 2 botões = 6 botões.",
          {
            feedback: [
              "5 soma 3 com 2; cada dado vale 2 botões.",
              "3 é o número de dados, não de botões.",
            ],
          },
        ),
      ],
    },
    {
      title: "Quem é mais pesado?",
      objective: "Ordenar objetos pelo peso a partir de comparações duas a duas.",
      introduction:
        "Com várias comparações de dois em dois, dá para colocar tudo em ordem. Se A é mais pesado que B, e B é mais pesado que C, então A é mais pesado que C, mesmo sem pesar A com C.",
      specs: [
        c(
          "ordenar",
          "O gato é mais pesado que o coelho. O coelho é mais pesado que o hamster. Qual é o mais leve dos três?",
          "O hamster",
          ["O coelho", "O gato"],
          "Gato > coelho > hamster.",
          {
            feedback: ["O coelho está no meio.", "O gato é o mais pesado."],
          },
        ),
        c(
          "ordenar",
          "A caixa azul é mais pesada que a vermelha. A caixa verde é mais leve que a vermelha. Coloque em ordem, da mais pesada para a mais leve.",
          "Azul, vermelha, verde",
          ["Vermelha, azul, verde", "Azul, verde, vermelha"],
          "Azul > vermelha e vermelha > verde.",
          {
            feedback: [
              "A azul é mais pesada que a vermelha.",
              "A verde é mais leve que a vermelha.",
            ],
          },
        ),
        n(
          "ordenar",
          "Quatro pacotes têm pesos diferentes. Com uma balança de dois pratos, quantas pesagens bastam para descobrir o mais pesado, comparando o vencedor de cada pesagem com o próximo pacote?",
          3,
          "Pesa 1 com 2, o mais pesado com 3, e esse com 4: 3 pesagens.",
          {
            misreads: [
              {
                value: 4,
                feedback: "4 é o número de pacotes; a primeira pesagem já compara dois deles.",
              },
            ],
          },
        ),
        c(
          "ordenar",
          "Numa balança, o urso é mais pesado que a boneca. Em outra, a boneca e o carrinho ficam equilibrados. Comparando o urso com o carrinho:",
          "O urso é mais pesado",
          ["O carrinho é mais pesado", "Ficam equilibrados"],
          "Boneca e carrinho pesam igual; o urso é mais pesado que os dois.",
          {
            feedback: [
              "O carrinho pesa o mesmo que a boneca, que é mais leve que o urso.",
              "Só a boneca e o carrinho se equilibram.",
            ],
          },
        ),
        c(
          "ordenar",
          "Três amigos se pesaram em duplas: Ana e Bia juntas pesam 60 quilos, Bia e Caio juntos pesam 70 quilos, Ana e Caio juntos pesam 66 quilos. Quem é o mais pesado?",
          "Caio",
          ["Ana", "Bia"],
          "Trocar Ana por Caio aumenta 10 quilos, então Caio pesa 10 a mais que Ana; trocar Ana por Bia (66 → 70) mostra que Bia pesa 4 a mais que Ana. Caio é o mais pesado.",
          {
            feedback: [
              "Ana é a mais leve: as duplas com ela pesam menos.",
              "Bia pesa 4 quilos a mais que Ana, mas Caio pesa 10 a mais.",
            ],
          },
        ),
        c(
          "ordenar",
          "Na balança, 2 caixas A equilibram 3 caixas B. Qual caixa é mais pesada?",
          "A caixa A",
          ["A caixa B", "Pesam igual"],
          "Se 2 A valem 3 B, cada A vale 1 B e meia: A é mais pesada.",
          {
            feedback: [
              "Precisou de mais caixas B para equilibrar menos caixas A: B é a mais leve.",
              "Se pesassem igual, 2 A equilibrariam 2 B, não 3.",
            ],
          },
        ),
        c(
          "ordenar",
          "Entre 3 pedras, uma é mais pesada que as outras duas, que pesam igual. Com uma balança de dois pratos, qual é o menor número de pesagens para achar a mais pesada?",
          "1: pese duas; se equilibrar, é a terceira; se não, é a que desceu",
          ["2 pesagens", "3 pesagens"],
          "Uma pesagem bem escolhida resolve.",
          {
            feedback: [
              "Uma pesagem já decide, porque o equilíbrio também dá informação.",
              "Não é preciso pesar cada pedra.",
            ],
          },
        ),
        c(
          "ordenar",
          "Duda diz: 'o livro é mais pesado que o caderno, e o caderno é mais pesado que o livro'. O que há de errado?",
          "As duas frases não podem ser verdadeiras ao mesmo tempo",
          ["Nada; depende da balança", "Está certo se os dois pesarem igual"],
          "Se A > B, então B não pode ser > A.",
          {
            feedback: [
              "A balança não muda quem é mais pesado.",
              "Se pesassem igual, nenhum seria mais pesado.",
            ],
          },
        ),
      ],
    },
    {
      title: "O peso escondido",
      objective: "Descobrir o peso de um objeto desconhecido usando equilíbrio e pesos conhecidos.",
      introduction:
        "Quando um objeto desconhecido aparece com pesos conhecidos, tire dos dois lados o que é igual até sobrar o objeto sozinho de um lado. O que ficar do outro lado é o peso dele.",
      specs: [
        n(
          "descobrir",
          "Uma balança equilibrada tem, de um lado, um saco e um peso de 300 gramas; do outro, pesos de 500 e 200 gramas. Quanto pesa o saco, em gramas?",
          400,
          "500 + 200 = 700; 700 − 300 = 400.",
          {
            misreads: [
              {
                value: 1000,
                feedback: "Somou tudo; o peso de 300 está do mesmo lado do saco e deve ser tirado.",
              },
            ],
          },
        ),
        c(
          "descobrir",
          "Dois potes iguais pesam juntos 900 gramas. Quanto pesa cada pote?",
          "450 gramas",
          ["900 gramas", "1.800 gramas"],
          "900 ÷ 2 = 450.",
          {
            feedback: ["900 é o peso dos dois.", "1.800 seria o peso de quatro potes."],
          },
        ),
        n(
          "descobrir",
          "Uma balança equilibrada: de um lado 3 caixas iguais; do outro, 1 caixa igual e um peso de 800 gramas. Quanto pesa uma caixa, em gramas?",
          400,
          "Tirando 1 caixa de cada lado, 2 caixas = 800; cada uma pesa 400.",
          {
            misreads: [
              {
                value: 800,
                feedback: "800 é o peso de 2 caixas, depois de tirar a caixa repetida.",
              },
            ],
          },
        ),
        c(
          "descobrir",
          "Um pacote e 2 pesos de 100 gramas equilibram 2 pacotes iguais ao primeiro. Quanto pesa um pacote?",
          "200 gramas",
          ["100 gramas", "400 gramas"],
          "Tirando 1 pacote de cada lado, 2 pesos de 100 equilibram 1 pacote: 200 gramas.",
          {
            feedback: ["100 gramas é só um dos pesos.", "400 seria o dobro."],
          },
        ),
        n(
          "descobrir",
          "Uma cesta com 6 laranjas iguais pesa 1.400 gramas. A cesta vazia pesa 200 gramas. Quanto pesa cada laranja, em gramas?",
          200,
          "1.400 − 200 = 1.200; 1.200 ÷ 6 = 200.",
          { misreads: [{ value: 233, feedback: "Dividiu sem tirar o peso da cesta." }] },
        ),
        c(
          "descobrir",
          "Uma balança de pratos está equilibrada com 1 abacaxi e 1 maçã de um lado e 1 abacaxi e 3 maçãs iguais do outro. O que isso mostra?",
          "Que a balança está errada ou que algo está diferente: com abacaxis iguais, 1 maçã não equilibra 3 maçãs",
          [
            "Que a maçã da esquerda pesa o mesmo que 3 maçãs",
            "Que os abacaxis pesam o mesmo que as maçãs",
          ],
          "Tirando um abacaxi de cada lado, 1 maçã contra 3 maçãs iguais não pode equilibrar.",
          {
            feedback: [
              "As maçãs são iguais, então 1 não pesa o mesmo que 3.",
              "Os abacaxis se cancelam e não dizem nada sobre as maçãs.",
            ],
          },
        ),
        n(
          "descobrir",
          "Dois lados de uma balança: 2 sacos iguais e um peso de 300 gramas de um lado; 1 saco igual e um peso de 900 gramas do outro. Equilibrada. Quanto pesa um saco, em gramas?",
          600,
          "Tirando 1 saco de cada lado: 1 saco + 300 = 900, então o saco pesa 600.",
          {
            misreads: [
              {
                value: 300,
                feedback: "300 é o peso que sobra ao tirar 600 de 900, não o do saco.",
              },
            ],
          },
        ),
        c(
          "descobrir",
          "Para descobrir o peso de uma coisa numa balança de dois pratos, o passo mais importante é:",
          "Tirar dos dois lados tudo o que é igual, até a coisa ficar sozinha de um lado",
          ["Colocar mais pesos no lado da coisa", "Adivinhar e conferir"],
          "Retirar o que é igual dos dois lados mantém o equilíbrio e isola o desconhecido.",
          {
            feedback: [
              "Pôr peso do lado da coisa afasta do objetivo.",
              "Adivinhar pode funcionar, mas o método garante.",
            ],
          },
        ),
      ],
    },
    {
      title: "Balanças com números",
      objective: "Usar a ideia de balança para resolver igualdades com um número escondido.",
      introduction:
        "Uma igualdade é como uma balança: os dois lados valem o mesmo. Um número escondido se descobre tirando ou dividindo igual dos dois lados, como se faz com os pesos.",
      estimatedMinutes: 18,
      specs: [
        n(
          "igualdade",
          "Na balança de números, um lado tem o número escondido mais 7 e o outro tem 15. Qual é o número escondido?",
          8,
          "15 − 7 = 8.",
          {
            misreads: [
              {
                value: 22,
                feedback: "Somou; para deixar o escondido sozinho, tire 7 dos dois lados.",
              },
            ],
          },
        ),
        c(
          "igualdade",
          "Três caixas iguais valem juntas 24. Quanto vale cada caixa?",
          "8",
          ["21", "72"],
          "24 ÷ 3 = 8.",
          {
            feedback: [
              "21 subtrai 3; três caixas iguais pedem divisão.",
              "72 multiplica; é o contrário.",
            ],
          },
        ),
        n("igualdade", "Um número escondido vezes 4 dá 36. Qual é o número?", 9, "36 ÷ 4 = 9.", {
          misreads: [{ value: 32, feedback: "Subtraiu 4; multiplicar se desfaz dividindo." }],
        }),
        c(
          "igualdade",
          "Dois lados iguais: 'caixa + caixa + 5' e 'caixa + 12'. Quanto vale a caixa?",
          "7",
          ["17", "6"],
          "Tirando 1 caixa de cada lado: caixa + 5 = 12, então caixa = 7.",
          {
            feedback: ["17 somou 5 com 12 em vez de tirar.", "6 seria se fosse caixa + 6 = 12."],
          },
        ),
        n(
          "igualdade",
          "Numa balança de números, 'estrela + estrela + estrela' equilibra 'estrela + 10'. Quanto vale a estrela?",
          5,
          "Tirando 1 estrela de cada lado: 2 estrelas = 10, então cada uma vale 5.",
          {
            misreads: [
              { value: 10, feedback: "10 é o valor de 2 estrelas, depois de tirar a repetida." },
            ],
          },
        ),
        c(
          "igualdade",
          "Se 'sol + 4 = 11' e 'lua = sol + 3', quanto vale a lua?",
          "10",
          ["7", "14"],
          "Sol = 7; lua = 7 + 3 = 10.",
          {
            feedback: [
              "7 é o valor do sol.",
              "14 soma 3 ao 11; o sol vale 7, e é ao 7 que se soma 3.",
            ],
          },
        ),
        n("igualdade", "Um número escondido menos 6 dá 9. Qual é o número?", 15, "9 + 6 = 15.", {
          misreads: [{ value: 3, feedback: "Subtraiu de novo; tirar 6 se desfaz somando 6." }],
        }),
        c(
          "igualdade",
          "Por que tirar o mesmo número dos dois lados de uma igualdade não muda a resposta?",
          "Porque os dois lados continuam valendo o mesmo, como uma balança da qual se tira o mesmo peso dos dois pratos",
          ["Porque números pequenos não importam", "Porque só o lado esquerdo conta"],
          "A igualdade se mantém quando a mesma mudança é feita dos dois lados.",
          {
            feedback: [
              "O tamanho do número não importa; importa fazer igual dos dois lados.",
              "Os dois lados contam igualmente.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Coloque em ordem os passos para descobrir um peso escondido numa balança equilibrada.",
    labels: [
      "Ver o que há em cada prato",
      "Tirar dos dois pratos o que é igual",
      "Ver o que sobrou do lado do objeto desconhecido",
      "Somar os pesos que sobraram do outro lado",
    ],
    explanation:
      "Retirar o igual mantém o equilíbrio; o que sobra do outro lado é o peso procurado.",
  },
  justification: {
    prompts: [
      "Explique por que tirar uma bala de cada pacote mantém a balança equilibrada.",
      "Se 1 pera vale 2 ameixas e 1 maçã vale 3 ameixas, explique quantas ameixas valem 2 peras e 1 maçã.",
      "Numa balança, 3 caixas iguais equilibram 1 caixa igual e um peso de 800 gramas. Explique como achar o peso de uma caixa.",
    ],
    samples: [
      "Os dois pacotes pesavam o mesmo. Se tiro uma bala de cada um, tiro o mesmo peso dos dois lados. O que era igual continua igual, então a balança fica equilibrada. Só desequilibraria se eu tirasse de um lado só.",
      "Troco cada pera por 2 ameixas: 2 peras viram 4 ameixas. Troco a maçã por 3 ameixas. Junto tudo: 4 + 3 = 7 ameixas. As trocas são justas porque cada uma tem o mesmo peso dos dois lados.",
      "Tiro 1 caixa de cada lado, e a balança continua equilibrada. Ficam 2 caixas de um lado e 800 gramas do outro. Então 2 caixas pesam 800 gramas e cada caixa pesa 400.",
    ],
    focus: "fazer o mesmo nos dois lados",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const caixas = 2 + (seed % 3);
      const pesoCaixa = 50 * (2 + (seed % 9));
      const pesoSolto = 50 * (1 + (seed % 7));
      const outroLado = caixas * pesoCaixa + pesoSolto;
      const todas = caixas * pesoCaixa;
      // Quem soma o peso solto em vez de tirar chega a este valor; quando ele não é
      // inteiro ou coincide com outra alternativa, a errada passa a ser 50 g a mais.
      const somado = (outroLado + pesoSolto) / caixas;
      const errada = Number.isInteger(somado) && somado !== todas ? somado : pesoCaixa + 50;
      return c(
        "peso-escondido",
        `Uma balança está equilibrada. De um lado há ${caixas} caixas iguais e um peso de ${pesoSolto} gramas; do outro, pesos que somam ${outroLado} gramas. Quanto pesa cada caixa?`,
        `${pesoCaixa} gramas`,
        [`${errada} gramas`, `${todas} gramas`],
        `${outroLado} − ${pesoSolto} = ${caixas * pesoCaixa}; ${caixas * pesoCaixa} ÷ ${caixas} = ${pesoCaixa}.`,
        {
          feedback: [
            "Não confere: o peso solto está do mesmo lado das caixas e deve ser tirado antes de dividir.",
            "Esse é o peso de todas as caixas juntas.",
          ],
        },
      );
    }
    if (variant === 1) {
      const a = 2 + (seed % 3);
      const b = 3 + (seed % 2);
      const grandes = 2 + (seed % 4);
      const total = grandes * a * b;
      return c(
        "trocas-encadeadas",
        `Na balança, 1 caixa grande equilibra ${a} caixas médias, e 1 caixa média equilibra ${b} caixas pequenas. Quantas caixas pequenas equilibram ${grandes} caixa${grandes > 1 ? "s" : ""} grande${grandes > 1 ? "s" : ""}?`,
        `${total}`,
        [`${grandes * (a + b)}`, `${grandes * a}`],
        `1 grande = ${a} médias = ${a * b} pequenas; ${grandes} grande${grandes > 1 ? "s" : ""} = ${total} pequenas.`,
        {
          feedback: [
            "Somou as trocas em vez de multiplicar: cada média vale várias pequenas.",
            "Esse é o número de caixas médias, não de pequenas.",
          ],
        },
      );
    }
    const valor = 3 + (seed % 9);
    const repetidas = 3 + (seed % 2);
    const soma = (repetidas - 1) * valor;
    return c(
      "igualdade-com-figura",
      `Numa balança de números, ${repetidas} estrelas iguais equilibram 1 estrela e o número ${soma}. Quanto vale cada estrela?`,
      `${valor}`,
      [`${soma}`, `${soma + valor}`],
      `Tirando 1 estrela de cada lado, ${repetidas - 1} estrelas valem ${soma}; cada estrela vale ${valor}.`,
      {
        feedback: [
          "Esse é o valor das estrelas que sobram juntas, não de uma só.",
          "Somou em vez de dividir depois de tirar a estrela repetida.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "balancas",
    title: "A balança de cabide",
    prompt:
      "Monte uma balança com um cabide e dois saquinhos iguais pendurados nas pontas. Use-a para comparar objetos da casa, descobrir trocas justas e ordenar cinco objetos do mais leve ao mais pesado.",
    lab: "bars",
    steps: [
      "Monte a balança e confira se fica equilibrada vazia.",
      "Descubra duas trocas justas (por exemplo, quantas moedas pesam o mesmo que uma borracha).",
      "Ordene cinco objetos usando só comparações de dois em dois e registre cada pesagem.",
    ],
    rubric: [
      "Balança montada e testada vazia (0–1)",
      "Duas trocas justas registradas com o resultado (0–3)",
      "Cinco objetos ordenados com as pesagens anotadas (0–3)",
      "Explicação de como uma comparação ajudou a evitar outra (0–1)",
    ],
  },
  homeSupport: [
    "Na cozinha, usem uma balança para descobrir quantas colheres de arroz pesam o mesmo que uma maçã e conversem sobre trocas justas.",
    "Perguntem: 'se tirarmos a mesma coisa dos dois lados, o que acontece?' e testem com objetos nas duas mãos.",
  ],
};
