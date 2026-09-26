import { c, n, type SkillPack } from "../skill-factory";

/**
 * Problemas com desenho: representar a situação com bolinhas, tracinhos e
 * esquemas para resolver problemas de juntar, repartir, comparar, ordem e
 * tentativa. Trilha Mirim 1.
 */
export const problemasComDesenho: SkillPack = {
  id: "problemas-com-desenho",
  name: "Resolver com desenho",
  domain: "mirim",
  lab: null,
  missions: [
    {
      title: "Desenhar para entender",
      objective: "Representar um problema com bolinhas ou tracinhos antes de fazer a conta.",
      introduction:
        "Quando um problema parece difícil, desenhe: uma bolinha para cada coisa, um tracinho para cada pessoa. O desenho mostra o que está acontecendo, e a resposta fica mais fácil de ver.",
      specs: [
        n(
          "desenhar",
          "Numa mesa há 3 pratos e em cada prato há 4 pães de queijo. Quantos pães de queijo há na mesa?",
          12,
          "Desenhe 3 pratos com 4 bolinhas em cada: 4 + 4 + 4 = 12.",
          { misreads: [{ value: 7, feedback: "Somou 3 com 4; são 3 pratos com 4 pães em cada." }] },
        ),
        c(
          "desenhar",
          "Para resolver 'Ana deu 2 balas para cada um de seus 5 amigos', o melhor desenho é:",
          "5 tracinhos, com 2 bolinhas embaixo de cada um",
          ["2 tracinhos com 5 bolinhas no total", "Uma bolinha só"],
          "Um tracinho para cada amigo, 2 balas para cada.",
          {
            feedback: [
              "Assim os amigos viram 2, mas são 5.",
              "Uma bolinha não mostra os 5 amigos nem as balas.",
            ],
          },
        ),
        n(
          "desenhar",
          "Numa fila de carros, há 2 carros vermelhos, depois 3 azuis e depois 1 verde. Quantos carros há na fila?",
          6,
          "2 + 3 + 1 = 6.",
          {
            misreads: [
              { value: 3, feedback: "3 é o número de cores; a pergunta é quantos carros." },
            ],
          },
        ),
        c(
          "desenhar",
          "Numa cerca há 5 postes em linha, com um fio entre cada dois postes vizinhos. Quantos fios há?",
          "4",
          ["5", "6"],
          "Desenhe 5 tracinhos e ligue os vizinhos: aparecem 4 fios.",
          {
            feedback: [
              "Os fios ficam entre os postes: sempre um a menos.",
              "6 teria mais fios que postes.",
            ],
          },
        ),
        n(
          "desenhar",
          "Um aquário tem 2 peixes grandes e cada um tem 3 filhotes nadando junto. Quantos peixes há no aquário?",
          8,
          "2 grandes + 3 + 3 filhotes = 8.",
          { misreads: [{ value: 6, feedback: "6 são só os filhotes; faltam os 2 grandes." }] },
        ),
        c(
          "desenhar",
          "Para saber quantas rodas têm 4 carrinhos de brinquedo, o desenho mais útil é:",
          "4 carrinhos com 4 rodinhas em cada",
          ["1 carrinho com 4 rodinhas", "4 rodinhas soltas"],
          "4 grupos de 4: 16 rodas.",
          {
            feedback: [
              "Assim aparece só um carrinho.",
              "Faltam os carrinhos para saber quantos grupos há.",
            ],
          },
        ),
        n(
          "desenhar",
          "Uma lagarta sobe 2 degraus e desce 1, depois sobe 2 e desce 1 de novo. Em que degrau ela está, se começou no chão (degrau 0)?",
          2,
          "0 → 2 → 1 → 3 → 2.",
          {
            misreads: [{ value: 4, feedback: "4 conta só as subidas; ela também desceu 2 vezes." }],
          },
        ),
        c(
          "desenhar",
          "Por que desenhar ajuda a resolver um problema?",
          "Porque mostra a história e evita esquecer partes",
          ["Porque o desenho faz a conta sozinho", "Porque todo problema precisa de desenho"],
          "O desenho organiza as informações.",
          {
            feedback: [
              "O desenho ajuda a ver, mas a conta ainda é feita por você.",
              "Alguns problemas se resolvem sem desenho; ele é uma ajuda.",
            ],
          },
        ),
      ],
    },
    {
      title: "Repartir igualmente",
      objective: "Repartir coisas em grupos iguais desenhando e ver se sobra.",
      introduction:
        "Para repartir igualmente, distribua uma coisa para cada um, depois outra para cada um, até acabar. Se sobrar alguma que não dá para dar a todos, ela é a sobra.",
      specs: [
        n(
          "repartir",
          "12 figurinhas vão ser repartidas igualmente entre 3 crianças. Quantas figurinhas cada uma recebe?",
          4,
          "Dando uma para cada até acabar: 4 para cada.",
          {
            misreads: [
              { value: 9, feedback: "Tirou 3 de 12; repartir é dividir em 3 partes iguais." },
            ],
          },
        ),
        c(
          "repartir",
          "Vou repartir 10 balas igualmente entre 3 crianças. Quantas balas cada uma recebe, e quantas sobram?",
          "3 para cada, e sobra 1",
          ["4 para cada, e não sobra nenhuma", "3 para cada, e sobram 3"],
          "3 + 3 + 3 = 9; sobra 1.",
          {
            feedback: ["4 para cada seriam 12 balas.", "Se sobrassem 3, daria mais uma para cada."],
          },
        ),
        n(
          "repartir",
          "Vou colocar 15 ovos em caixas de 5. Quantas caixas eu uso?",
          3,
          "5, 10, 15: 3 caixas.",
          {
            misreads: [
              {
                value: 10,
                feedback: "10 é quanto sobra tirando uma caixa; a pergunta é quantas caixas.",
              },
            ],
          },
        ),
        c(
          "repartir",
          "Vou guardar 8 lápis em 2 estojos, com a mesma quantidade em cada um. Quantos lápis ficam em cada estojo?",
          "4 em cada estojo",
          ["6 em cada estojo", "2 em cada estojo"],
          "Metade de 8 é 4.",
          {
            feedback: ["6 e 6 seriam 12 lápis.", "2 e 2 seriam só 4 lápis."],
          },
        ),
        n(
          "repartir",
          "Uma professora tem 20 lápis e quer dar 4 para cada aluno. Para quantos alunos ela consegue dar?",
          5,
          "4, 8, 12, 16, 20: 5 alunos.",
          { misreads: [{ value: 16, feedback: "16 é o que sobra depois de dar para um aluno." }] },
        ),
        c(
          "repartir",
          "Se 9 bolinhas forem repartidas igualmente entre 4 crianças, quantas sobram?",
          "1",
          ["0", "5"],
          "2 para cada usam 8; sobra 1.",
          {
            feedback: [
              "9 não dá para repartir igualmente entre 4.",
              "Se sobrassem 5, daria mais uma para cada.",
            ],
          },
        ),
        n(
          "repartir",
          "Uma pizza foi cortada em 8 pedaços iguais para 4 pessoas. Quantos pedaços cada uma come, se todas comem igual?",
          2,
          "8 repartidos em 4: 2 para cada.",
          { misreads: [{ value: 4, feedback: "4 é o número de pessoas." }] },
        ),
        c(
          "repartir",
          "Ao repartir igualmente, a sobra:",
          "É sempre menor que o número de grupos",
          ["Pode ser qualquer número", "É sempre zero"],
          "Se a sobra desse para todos, ainda dava para repartir mais.",
          {
            feedback: [
              "Se a sobra fosse grande, daria para dar mais a cada um.",
              "Às vezes sobra alguma coisa.",
            ],
          },
        ),
      ],
    },
    {
      title: "Quem é maior? Quem vem antes?",
      objective:
        "Comparar e ordenar pessoas e coisas com pistas, desenhando uma fila ou uma escada.",
      introduction:
        "Quando o problema compara pessoas (mais alto, mais velho, chegou antes), desenhe uma fila e coloque cada um no lugar certo, uma pista de cada vez.",
      specs: [
        c(
          "ordenar",
          "Rui é mais alto que Bia. Bia é mais alta que Téo. Quem é o mais baixo?",
          "Téo",
          ["Rui", "Bia"],
          "Rui, depois Bia, depois Téo.",
          {
            feedback: ["Rui é o mais alto.", "Bia está no meio."],
          },
        ),
        n(
          "ordenar",
          "Numa corrida, Lia chegou em 2º lugar e Duda chegou logo depois dela. Em que lugar chegou Duda?",
          3,
          "Logo depois do 2º é o 3º.",
          { misreads: [{ value: 1, feedback: "1º é antes de Lia; Duda chegou depois." }] },
        ),
        c(
          "ordenar",
          "Ana é mais velha que Caio. Caio é mais velho que Nina. Qual frase é verdadeira?",
          "Ana é mais velha que Nina",
          ["Nina é mais velha que Ana", "Caio é o mais velho"],
          "Ana, depois Caio, depois Nina.",
          {
            feedback: ["Nina é a mais nova.", "Ana é mais velha que Caio."],
          },
        ),
        n(
          "ordenar",
          "Numa fila, há 3 crianças na frente do Beto e 2 atrás dele. Quantas crianças há na fila?",
          6,
          "3 + Beto + 2 = 6.",
          { misreads: [{ value: 5, feedback: "Esqueceu de contar o Beto." }] },
        ),
        c(
          "ordenar",
          "Três caixas: a azul é mais pesada que a verde, e a amarela é mais leve que a verde. Qual é a mais pesada?",
          "A azul",
          ["A verde", "A amarela"],
          "Azul, verde, amarela.",
          {
            feedback: ["A verde está no meio.", "A amarela é a mais leve."],
          },
        ),
        n(
          "ordenar",
          "Pedro tem 7 anos. A irmã dele tem 3 anos a mais. Quantos anos tem a irmã?",
          10,
          "7 + 3 = 10.",
          { misreads: [{ value: 4, feedback: "3 anos a mais é somar, não tirar." }] },
        ),
        c(
          "ordenar",
          "Numa estante, o livro de contos está à esquerda do de ciências, e o de ciências está à esquerda do de artes. Qual está no meio?",
          "O de ciências",
          ["O de contos", "O de artes"],
          "Contos, ciências, artes.",
          {
            feedback: ["O de contos está na ponta esquerda.", "O de artes está na ponta direita."],
          },
        ),
        n(
          "ordenar",
          "Num prédio, Beto mora no 3º andar. Ana mora 2 andares acima dele. Em que andar mora Ana?",
          5,
          "3 + 2 = 5.",
          { misreads: [{ value: 1, feedback: "Acima é subir; é conta de mais." }] },
        ),
      ],
    },
    {
      title: "Tentar e conferir",
      objective: "Resolver problemas testando possibilidades e conferindo cada tentativa.",
      introduction:
        "Alguns problemas se resolvem tentando: escolha um número, veja se funciona e, se não funcionar, tente outro. Anote as tentativas para não repetir.",
      specs: [
        n(
          "tentar",
          "Pensei num número. Somei 5 e deu 12. Em que número pensei?",
          7,
          "Tentando: 7 + 5 = 12.",
          { misreads: [{ value: 17, feedback: "Somou em vez de voltar: 12 − 5 = 7." }] },
        ),
        c(
          "tentar",
          "Dois irmãos têm juntos 10 anos. Um tem 2 anos a mais que o outro. Quantos anos tem o mais novo?",
          "4",
          ["5", "6"],
          "Tentando: 4 e 6 somam 10, e 6 é 2 a mais que 4.",
          {
            feedback: [
              "5 e 5 somam 10, mas um não tem 2 anos a mais que o outro.",
              "6 é o mais velho.",
            ],
          },
        ),
        n(
          "tentar",
          "Num quintal há galinhas e cachorros: 5 animais ao todo e 14 patas. Quantos cachorros há?",
          2,
          "Tentando: 2 cachorros (8 patas) e 3 galinhas (6 patas) dão 14.",
          {
            misreads: [
              { value: 3, feedback: "3 são as galinhas; com 3 cachorros seriam 16 patas." },
            ],
          },
        ),
        c(
          "tentar",
          "Dois números somados dão 9. O primeiro é o dobro do segundo. Quais são os números?",
          "6 e 3",
          ["5 e 4", "8 e 1"],
          "6 + 3 = 9 e 6 é o dobro de 3.",
          {
            feedback: ["5 não é o dobro de 4.", "8 não é o dobro de 1."],
          },
        ),
        n(
          "tentar",
          "Uma bala custa 2 reais e um pirulito custa 3 reais. Com 12 reais, comprando só pirulitos, quantos dá para levar?",
          4,
          "3, 6, 9, 12: 4 pirulitos.",
          { misreads: [{ value: 6, feedback: "6 seria comprando balas de 2 reais." }] },
        ),
        c(
          "tentar",
          "Com notas de 2 e de 5 reais, qual destes valores NÃO dá para pagar certinho?",
          "3 reais",
          ["4 reais", "7 reais"],
          "4 = 2 + 2 e 7 = 5 + 2; 3 não dá.",
          {
            feedback: ["4 é 2 + 2.", "7 é 5 + 2."],
          },
        ),
        n(
          "tentar",
          "Pensei num número. Tirei 4 e deu 9. Em que número pensei?",
          13,
          "Tentando: 13 − 4 = 9.",
          { misreads: [{ value: 5, feedback: "Tirou de novo; para voltar é somar: 9 + 4 = 13." }] },
        ),
        c(
          "tentar",
          "Ao resolver tentando, por que é bom anotar cada tentativa?",
          "Para não repetir e ver se está chegando perto",
          ["Para achar a resposta sem pensar", "Para a primeira tentativa já dar certo"],
          "As anotações mostram o caminho.",
          {
            feedback: [
              "Anotar organiza as tentativas; o raciocínio continua sendo seu.",
              "Anotar não muda a primeira tentativa; ajuda nas seguintes.",
            ],
          },
        ),
      ],
    },
    {
      title: "Explicar a resposta",
      objective:
        "Resolver problemas de mais de um passo e explicar com desenho ou frase como chegou à resposta.",
      introduction:
        "Alguns problemas têm dois passos: primeiro descobrir uma coisa, depois outra. Desenhe cada passo e, no final, explique com uma frase o que você fez.",
      estimatedMinutes: 15,
      specs: [
        n(
          "explicar",
          "Lia tinha 10 reais. Ganhou 5 da avó e gastou 8 num lanche. Com quanto ficou?",
          7,
          "10 + 5 = 15; 15 − 8 = 7.",
          { misreads: [{ value: 15, feedback: "15 é antes do lanche; ela gastou 8." }] },
        ),
        c(
          "explicar",
          "Num ônibus havia 12 pessoas. No ponto, desceram 4 e subiram 6. Quantas pessoas há agora?",
          "14",
          ["10", "22"],
          "12 − 4 = 8; 8 + 6 = 14.",
          {
            feedback: [
              "10 trocou quem desceu com quem subiu: 12 + 4 − 6.",
              "22 soma tudo, mas 4 pessoas desceram.",
            ],
          },
        ),
        n(
          "explicar",
          "Um pacote tem 6 biscoitos. Comprei 2 pacotes e comi 5 biscoitos. Quantos sobraram?",
          7,
          "6 + 6 = 12; 12 − 5 = 7.",
          {
            misreads: [
              { value: 1, feedback: "1 é o que sobra de um pacote só; comprei 2 pacotes." },
            ],
          },
        ),
        c(
          "explicar",
          "Qual frase explica bem a conta 3 × 4 = 12 num problema de mesas e cadeiras?",
          "São 3 mesas com 4 cadeiras em cada, então há 12 cadeiras",
          ["São 3 cadeiras e 4 mesas, então há 7", "São 12 mesas"],
          "3 grupos de 4.",
          {
            feedback: [
              "Somar dá 7 e troca mesas com cadeiras.",
              "12 é o número de cadeiras, não de mesas.",
            ],
          },
        ),
        n(
          "explicar",
          "Numa sala há 4 fileiras com 5 carteiras, uma para cada aluno da turma. Hoje 3 carteiras ficaram vazias. Quantos alunos vieram?",
          17,
          "4 × 5 = 20 carteiras; 20 − 3 = 17.",
          { misreads: [{ value: 20, feedback: "20 é o total de carteiras; 3 ficaram vazias." }] },
        ),
        c(
          "explicar",
          "Duda tem 8 anos e o irmão tem o dobro da idade dela. Daqui a 2 anos, quantos anos terá o irmão?",
          "18",
          ["16", "10"],
          "O irmão tem 16; daqui a 2 anos, 18.",
          {
            feedback: ["16 é a idade de hoje.", "10 é a idade da Duda daqui a 2 anos."],
          },
        ),
        n(
          "explicar",
          "Uma caixa tem 3 fileiras de 4 bombons. Joana comeu uma fileira inteira. Quantos bombons sobraram?",
          8,
          "12 bombons; uma fileira tem 4; 12 − 4 = 8.",
          { misreads: [{ value: 9, feedback: "Uma fileira tem 4 bombons, não 3." }] },
        ),
        c(
          "explicar",
          "Depois de resolver um problema de dois passos, o que ajuda a conferir?",
          "Refazer cada passo e ver se combina com a história",
          ["Refazer só o último passo", "Ver se a resposta é um número redondo"],
          "Conferir cada passo pega erros no caminho.",
          {
            feedback: [
              "O erro pode estar no primeiro passo.",
              "A resposta certa nem sempre é um número redondo.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Coloque em ordem os passos para resolver um problema com desenho.",
    labels: [
      "Ler o problema e entender a história",
      "Desenhar as coisas e as pessoas do problema",
      "Contar ou fazer a conta olhando o desenho",
      "Explicar a resposta com uma frase",
    ],
    explanation: "Entender vem antes de desenhar; o desenho guia a conta; a frase fecha.",
  },
  justification: {
    prompts: [
      "Explique como descobrir quantas crianças há numa fila com 3 na frente do Beto e 2 atrás.",
      "Dois irmãos têm juntos 12 anos, e um tem 4 anos a mais que o outro. Explique como descobrir as idades tentando.",
      "Explique como você resolveu: 'Lia tinha 10 reais, ganhou 5 e gastou 8'.",
    ],
    samples: [
      "Desenho 3 bolinhas, depois o Beto, depois 2 bolinhas. Conto tudo: 3 + 1 + 2 = 6. Não posso esquecer do Beto, porque ele também está na fila.",
      "Tentei 6 e 6: somam 12, mas um não é mais velho. Tentei 5 e 7: a diferença é só 2. Tentei 4 e 8: somam 12 e a diferença é 4. As idades são 4 e 8 anos.",
      "Primeiro ela ganhou 5, então ficou com 10 + 5 = 15. Depois gastou 8, então ficou com 15 − 8 = 7. A resposta é 7 reais.",
    ],
    focus: "o desenho e a explicação",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const grupos = 2 + (seed % 4);
      const porGrupo = 3 + (Math.floor(seed / 4) % 4);
      return c(
        "grupos-desenhados",
        `Numa mesa há ${grupos} pratos e em cada prato há ${porGrupo} biscoitos. Quantos biscoitos há na mesa?`,
        `${grupos * porGrupo}`,
        [`${grupos + porGrupo}`, `${grupos * porGrupo + porGrupo}`],
        `${grupos} pratos com ${porGrupo} em cada: ${grupos * porGrupo}.`,
        {
          feedback: [
            "Somou pratos com biscoitos; cada prato tem vários biscoitos.",
            "Contou um prato a mais.",
          ],
        },
      );
    }
    if (variant === 1) {
      const pessoas = 3 + (seed % 3);
      const cada = 3 + (Math.floor(seed / 3) % 4);
      // Sobra de 2 em diante, sempre menor que o número de crianças.
      const sobra = 2 + (seed % (pessoas - 2));
      const total = pessoas * cada + sobra;
      return c(
        "repartir-com-sobra",
        `${total} balas foram repartidas igualmente entre ${pessoas} crianças. Quantas balas cada criança recebeu, sem partir nenhuma?`,
        `${cada}`,
        [`${cada + 1}`, `${total - pessoas}`],
        `${pessoas} × ${cada} = ${pessoas * cada}; sobram ${sobra}, que não dão para todas.`,
        {
          feedback: [
            "Com uma a mais para cada, faltariam balas.",
            "Tirou o número de crianças do total, em vez de repartir.",
          ],
        },
      );
    }
    const frente = 2 + (seed % 5);
    const atras = 1 + (Math.floor(seed / 5) % 5);
    return c(
      "fila-desenhada",
      `Numa fila, há ${frente} crianças na frente da Nina e ${atras} atrás dela. Quantas crianças há na fila?`,
      `${frente + atras + 1}`,
      [`${frente + atras}`, `${frente + atras + 2}`],
      `${frente} + Nina + ${atras} = ${frente + atras + 1}.`,
      {
        feedback: ["Esqueceu de contar a Nina.", "Contou uma criança a mais."],
      },
    );
  },
  deepChallenge: {
    skillId: "problemas-com-desenho",
    title: "Meu problema desenhado",
    prompt:
      "Invente um problema com uma situação da sua casa (pratos na mesa, brinquedos na caixa, pessoas no carro). Resolva desenhando, escreva a conta e explique para alguém da família.",
    lab: null,
    steps: [
      "Escreva ou conte o problema que você inventou.",
      "Desenhe a situação e faça a conta olhando o desenho.",
      "Explique a resposta com uma frase para alguém da família.",
    ],
    rubric: [
      "Problema inventado com uma pergunta clara (0–2)",
      "Desenho que mostra a situação (0–3)",
      "Conta e resposta corretas (0–2)",
      "Explicação para outra pessoa (0–1)",
    ],
  },
  homeSupport: [
    "Quando a criança travar num problema, peçam para ela desenhar a história com bolinhas antes de fazer a conta.",
    "Inventem juntos problemas com coisas da casa e deixem a criança resolver desenhando.",
  ],
};
