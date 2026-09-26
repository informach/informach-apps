import { c, n, type SkillPack } from "../skill-factory";

/**
 * Argumentação matemática: implicação e recíproca, contraexemplos, prova
 * por casos e por absurdo, princípio das gavetas e invariantes, e leitura
 * crítica de soluções. Trilha OBMEP N3.
 */
export const argumentacaoEm: SkillPack = {
  id: "argumentacao-em",
  name: "Argumentar e provar",
  domain: "obmep",
  lab: "groups",
  missions: [
    {
      title: "Se, então",
      objective: "Distinguir implicação, recíproca e contrapositiva, e usar contraexemplos.",
      introduction:
        "'Se A, então B' não é o mesmo que 'se B, então A' (a recíproca). Mas é o mesmo que 'se não B, então não A' (a contrapositiva). Para derrubar um 'se A, então B' basta um caso com A verdadeiro e B falso.",
      specs: [
        c(
          "implicacao",
          "A recíproca de 'se um número é múltiplo de 4, então é par' é:",
          "Se um número é par, então é múltiplo de 4",
          [
            "Se um número não é par, então não é múltiplo de 4",
            "Se um número não é múltiplo de 4, então não é par",
          ],
          "A recíproca troca hipótese e conclusão.",
          {
            feedback: [
              "Essa é a contrapositiva, equivalente à original.",
              "Essa é a inversa: nega hipótese e conclusão sem trocá-las. Equivale à recíproca, mas não é ela.",
            ],
          },
        ),
        c(
          "implicacao",
          "A afirmação 'se um número é par, então é múltiplo de 4' é:",
          "Falsa: 6 é par e não é múltiplo de 4",
          ["Verdadeira", "Falsa: 8 é contraexemplo"],
          "Um único par que não é múltiplo de 4 basta.",
          {
            feedback: ["6 mostra que é falsa.", "8 é par e múltiplo de 4; não contradiz a frase."],
          },
        ),
        n(
          "implicacao",
          "Quantos inteiros de 1 a 20 são contraexemplos para 'se n é ímpar, então n é primo'?",
          3,
          "Ímpares não primos de 1 a 20: 1, 9, 15.",
          { misreads: [{ value: 2, feedback: "Esqueceu que 1 é ímpar e não é primo." }] },
        ),
        c(
          "implicacao",
          "'Se chove, a rua fica molhada.' A rua está molhada. O que se pode concluir?",
          "Nada com certeza; pode ter chovido ou ter outra causa",
          ["Choveu", "Não choveu"],
          "Afirmar a conclusão não permite afirmar a hipótese.",
          {
            feedback: [
              "Isso é a recíproca, que não decorre da frase.",
              "Também não se pode concluir que não choveu.",
            ],
          },
        ),
        c(
          "implicacao",
          "'Se chove, a rua fica molhada.' A rua está seca. O que se pode concluir?",
          "Não choveu",
          ["Choveu", "Nada"],
          "Contrapositiva: se não molhada, então não choveu.",
          {
            feedback: [
              "Se tivesse chovido, a rua estaria molhada.",
              "A contrapositiva permite concluir com certeza.",
            ],
          },
        ),
        n(
          "implicacao",
          "A afirmação 'todo inteiro n satisfaz n² ≥ n' é verdadeira. Quantos inteiros entre −3 e 3, inclusive, atingem a igualdade n² = n?",
          2,
          "n² = n só em n = 0 e n = 1; nos demais vale a desigualdade estrita.",
          { misreads: [{ value: 1, feedback: "Há dois: 0 e 1." }] },
        ),
        c(
          "implicacao",
          "'Todo quadrado é um retângulo.' Logo:",
          "Se uma figura não é retângulo, então não é quadrado",
          ["Todo retângulo é um quadrado", "Se uma figura não é quadrado, então não é retângulo"],
          "Contrapositiva de 'quadrado ⇒ retângulo'.",
          {
            feedback: ["Essa é a recíproca, falsa.", "Essa nega a hipótese, o que não é válido."],
          },
        ),
        c(
          "implicacao",
          "Para mostrar que uma afirmação do tipo 'para todo n' é falsa, basta:",
          "Exibir um n em que ela falha",
          ["Mostrar que falha para infinitos n", "Mostrar que falha para todo n"],
          "Um contraexemplo basta.",
          {
            feedback: [
              "Um caso já basta; infinitos não são necessários.",
              "Falhar sempre é muito mais do que o necessário.",
            ],
          },
        ),
      ],
    },
    {
      title: "Casos e absurdo",
      objective: "Provar por divisão em casos exaustivos e por redução ao absurdo.",
      introduction:
        "Prova por casos: divide-se o universo em casos que cobrem tudo e prova-se cada um. Prova por absurdo: supõe-se o contrário do que se quer e chega-se a uma contradição.",
      specs: [
        c(
          "casos-absurdo",
          "Para provar que n² + n é par para todo inteiro n, a divisão em casos adequada é:",
          "n par ou n ímpar",
          ["n positivo ou n negativo", "n primo ou n composto"],
          "n(n + 1) é o produto de consecutivos; em cada caso de paridade um fator é par.",
          {
            feedback: [
              "O sinal não decide a paridade, e o zero fica de fora.",
              "1 e 0 não são primos nem compostos; os casos não cobrem tudo.",
            ],
          },
        ),
        c(
          "casos-absurdo",
          "A prova clássica de que √2 é irracional começa supondo:",
          "Que √2 = p/q com p e q inteiros sem fator comum",
          ["Que √2 é irracional", "Que √2 é inteiro"],
          "Supõe-se o contrário e deriva-se que p e q seriam ambos pares, contradição.",
          {
            feedback: [
              "Supor o que se quer provar não leva a lugar nenhum.",
              "Supor inteiro é um caso particular; a suposição precisa ser 'racional'.",
            ],
          },
        ),
        n(
          "casos-absurdo",
          "Na prova de que √2 é irracional, supõe-se √2 = p/q irredutível e chega-se a p² = 2q². Que número se conclui que divide p e q ao mesmo tempo, gerando a contradição?",
          2,
          "p² par ⇒ p par ⇒ p = 2k ⇒ 4k² = 2q² ⇒ q² par ⇒ q par.",
          {
            misreads: [
              {
                value: 4,
                feedback: "4 divide p², mas a contradição usa o fator comum 2 em p e q.",
              },
            ],
          },
        ),
        c(
          "casos-absurdo",
          "Para provar que existem infinitos primos, supõe-se que são finitos, p₁, ..., pₙ, e considera-se N = p₁·p₂·...·pₙ + 1. A contradição vem de:",
          "N não é divisível por nenhum dos pᵢ, então tem um fator primo fora da lista",
          ["N é sempre primo", "N é par"],
          "N deixa resto 1 por cada pᵢ.",
          {
            feedback: [
              "N nem sempre é primo; basta ter um fator primo novo.",
              "N é ímpar, pois é múltiplo de 2 mais 1.",
            ],
          },
        ),
        n(
          "casos-absurdo",
          "Para provar que o resto de n² na divisão por 4 é 0 ou 1, dividimos em casos pelo resto de n por 4. Quantos casos há?",
          4,
          "Restos 0, 1, 2, 3; os quadrados dão 0, 1, 0, 1.",
          {
            misreads: [
              {
                value: 2,
                feedback:
                  "2 casos (par e ímpar) também bastam aqui, mas a divisão pelo resto por 4 tem 4 casos.",
              },
            ],
          },
        ),
        c(
          "casos-absurdo",
          "Uma prova por casos está completa quando:",
          "Os casos cobrem todas as possibilidades e cada um foi provado",
          ["Há pelo menos três casos", "Cada caso foi testado com um exemplo"],
          "Exaustividade e prova em cada caso.",
          {
            feedback: [
              "O número de casos não importa; a cobertura importa.",
              "Um exemplo por caso não prova o caso.",
            ],
          },
        ),
        c(
          "casos-absurdo",
          "Numa prova por absurdo de 'não existe maior inteiro', supõe-se que M é o maior inteiro. A contradição é:",
          "M + 1 é inteiro e maior que M",
          ["M é negativo", "M não é primo"],
          "A suposição gera um inteiro maior que o suposto maior.",
          {
            feedback: ["O sinal de M não gera contradição.", "Ser primo ou não é irrelevante."],
          },
        ),
        c(
          "casos-absurdo",
          "Qual é a diferença entre provar por absurdo e provar a contrapositiva?",
          "A contrapositiva prova 'não B ⇒ não A' diretamente; o absurdo supõe A e não B e deriva qualquer contradição",
          ["São exatamente a mesma coisa", "O absurdo só serve para números"],
          "Ambas são válidas; a estrutura é diferente.",
          {
            feedback: [
              "Parecidas, mas a contrapositiva é uma prova direta de outra frase equivalente.",
              "O absurdo serve em qualquer área.",
            ],
          },
        ),
      ],
    },
    {
      title: "Gavetas e invariantes",
      objective: "Aplicar o princípio das gavetas e reconhecer invariantes em processos.",
      introduction:
        "Se há mais objetos que gavetas, alguma gaveta recebe dois. Um invariante é algo que não muda a cada passo de um processo: se o estado final teria de mudá-lo, o processo não chega lá.",
      specs: [
        n(
          "gavetas",
          "Quantas pessoas são necessárias, no mínimo, para garantir que duas façam aniversário no mesmo mês?",
          13,
          "12 gavetas (meses); 13 pessoas garantem repetição.",
          { misreads: [{ value: 12, feedback: "12 pessoas podem cair uma em cada mês." }] },
        ),
        c(
          "gavetas",
          "Numa gaveta há meias pretas, brancas e cinzas misturadas. Quantas é preciso tirar no escuro, no mínimo, para garantir um par da mesma cor?",
          "4",
          ["3", "6"],
          "3 cores: com 4 meias, duas têm a mesma cor.",
          {
            feedback: [
              "3 meias podem ser uma de cada cor.",
              "6 garante, mas não é o mínimo: com 4 já há par.",
            ],
          },
        ),
        n(
          "gavetas",
          "Escolhem-se 51 números distintos de 1 a 100. Quantas duplas de números escolhidos com soma 101 estão garantidas, no mínimo?",
          1,
          "Há 50 pares {1, 100}, {2, 99}, ...; com 51 números, algum par vem completo.",
          {
            misreads: [{ value: 0, feedback: "Com 50 números daria para evitar, mas com 51 não." }],
          },
        ),
        c(
          "gavetas",
          "Num tabuleiro 8 × 8 removem-se dois cantos opostos. É possível cobrir o resto com dominós 2 × 1?",
          "Não: os cantos opostos têm a mesma cor, sobram 32 casas de uma cor e 30 da outra, e cada dominó cobre uma de cada",
          ["Sim, porque 62 é par", "Sim, com 31 dominós"],
          "A cor é o invariante.",
          {
            feedback: [
              "62 par é necessário, mas não suficiente.",
              "31 dominós cobririam 31 casas de cada cor, e não há.",
            ],
          },
        ),
        n(
          "gavetas",
          "Numa lousa estão os números de 1 a 10. Repetidamente apagam-se dois números a e b e escreve-se a + b. Que número fica ao final?",
          55,
          "A soma dos números na lousa é invariante: 1 + 2 + ... + 10 = 55.",
          {
            misreads: [
              { value: 10, feedback: "10 é quantos números havia; a soma é o que se conserva." },
            ],
          },
        ),
        c(
          "gavetas",
          "Numa lousa estão os números de 1 a 10. Apagam-se dois, a e b, e escreve-se |a − b|. O número final é:",
          "Sempre ímpar",
          ["Sempre par", "Sempre zero"],
          "A paridade da soma não muda (a + b e |a − b| têm a mesma paridade); a soma inicial é 55, ímpar.",
          {
            feedback: [
              "A paridade da soma é ímpar e se conserva.",
              "Zero é par; não pode ocorrer.",
            ],
          },
        ),
        n(
          "gavetas",
          "Num grupo de 10 pessoas, em que a amizade é sempre recíproca, quantos valores diferentes o número de amigos de cada pessoa pode assumir ao mesmo tempo, no máximo?",
          9,
          "Os valores vão de 0 a 9, mas 0 e 9 não aparecem juntos: quem tem 9 amigos é amigo de todos. São no máximo 9 valores para 10 pessoas, então duas repetem.",
          {
            misreads: [
              {
                value: 10,
                feedback:
                  "0 e 9 não aparecem juntos: se alguém é amigo de todos, ninguém tem 0 amigos.",
              },
            ],
          },
        ),
        c(
          "gavetas",
          "Um sapo pula num eixo, sempre 3 unidades para a direita ou 5 para a esquerda, começando em 0. Ele pode chegar a 1?",
          "Sim: por exemplo 3 + 3 − 5 = 1",
          ["Não, porque 1 não é múltiplo de 3 nem de 5", "Não, porque só anda em múltiplos de 15"],
          "Combinações inteiras de 3 e 5 dão qualquer inteiro, pois mdc = 1.",
          {
            feedback: [
              "Não precisa ser múltiplo; somas e diferenças de 3 e 5 geram 1.",
              "O invariante seria múltiplo do mdc, que é 1.",
            ],
          },
        ),
      ],
    },
    {
      title: "Ler uma solução",
      objective:
        "Avaliar soluções escritas: identificar passos não justificados, casos faltantes e conclusões indevidas.",
      introduction:
        "Ler uma solução é conferir cada passo: de onde veio, o que usa, se cobre tudo. Erros comuns: dividir por algo que pode ser zero, esquecer um caso, usar a recíproca, concluir de exemplos.",
      specs: [
        c(
          "ler-solucao",
          "Uma solução resolve x² = 5x dividindo os dois lados por x e conclui x = 5. O erro é:",
          "Dividir por x, que pode ser zero; a solução x = 0 foi perdida",
          ["Não há erro", "x = 5 não é solução"],
          "x² − 5x = x(x − 5) = 0 dá x = 0 ou x = 5.",
          {
            feedback: ["Falta a solução x = 0.", "x = 5 é solução; o problema é a que faltou."],
          },
        ),
        c(
          "ler-solucao",
          "Uma solução afirma: 'testei n = 1 até 6 e n² + n + 41 deu primo; logo é primo para todo n'. O erro é:",
          "Concluir uma afirmação geral a partir de exemplos",
          ["Os testes estão errados", "41 não é primo"],
          "n = 40 dá 41², que não é primo.",
          {
            feedback: ["Os testes estão certos; a conclusão é que não segue.", "41 é primo."],
          },
        ),
        c(
          "ler-solucao",
          "Uma prova de que 'se x² > 4 então x > 2' está errada porque:",
          "x = −3 tem x² = 9 > 4 e x < 2",
          ["x² > 4 nunca acontece", "A conclusão deveria ser x > 4"],
          "Esqueceu o caso negativo.",
          {
            feedback: ["Acontece para muitos x.", "A conclusão correta é |x| > 2."],
          },
        ),
        n(
          "ler-solucao",
          "Uma solução conclui que uma equação do 2º grau tem 3 raízes reais distintas. Sem ler o resto, quantas raízes reais distintas ela pode ter no máximo?",
          2,
          "Uma equação do 2º grau tem no máximo 2 raízes.",
          { misreads: [{ value: 3, feedback: "3 raízes distintas é impossível para grau 2." }] },
        ),
        c(
          "ler-solucao",
          "Uma solução escreve: 'como a soma dos ângulos é 180°, e o triângulo é isósceles, os ângulos são 60°, 60°, 60°'. O que falta?",
          "Isósceles não garante equilátero; faltou uma hipótese ou um passo",
          ["Nada; isósceles implica equilátero", "A soma deveria ser 360°"],
          "Isósceles tem pelo menos dois ângulos iguais, não necessariamente três.",
          {
            feedback: [
              "Isósceles é mais geral que equilátero.",
              "A soma dos ângulos de um triângulo é 180°.",
            ],
          },
        ),
        c(
          "ler-solucao",
          "Uma solução usa 'se a > b então a² > b²' para números reais quaisquer. Isso é:",
          "Falso em geral: −1 > −2, mas 1 < 4",
          ["Verdadeiro sempre", "Verdadeiro só para inteiros"],
          "Vale para não negativos.",
          {
            feedback: [
              "Números negativos quebram a implicação.",
              "Os inteiros negativos também quebram.",
            ],
          },
        ),
        c(
          "ler-solucao",
          "Uma solução termina com 'portanto o valor é 12' sem verificar as condições do problema. Qual é o risco?",
          "O valor encontrado pode não satisfazer uma condição usada só no final, como ser positivo ou inteiro",
          ["Nenhum, contas certas garantem a resposta", "Só o risco de erro de cálculo"],
          "Soluções algébricas podem gerar valores estranhos ao problema.",
          {
            feedback: [
              "Contas certas podem produzir raízes que o contexto exclui.",
              "O erro é de lógica, não de conta.",
            ],
          },
        ),
        c(
          "ler-solucao",
          "Numa prova por casos, um leitor percebe que o caso 'n = 0' não está em nenhum dos casos listados. A prova:",
          "Está incompleta até esse caso ser tratado",
          ["Está correta, porque n = 0 é trivial", "Está errada em todos os casos"],
          "Exaustividade é requisito.",
          {
            feedback: [
              "Mesmo trivial, precisa ser dito.",
              "Os outros casos podem estar certos; falta um.",
            ],
          },
        ),
      ],
    },
    {
      title: "Escrever uma prova",
      objective:
        "Estruturar uma prova curta: hipótese, passos justificados, conclusão, e escolher o método.",
      introduction:
        "Uma prova escrita diz o que se assume, o que se quer, e cada passo com sua razão. Escolher o método (direto, casos, absurdo, contrapositiva, invariante) é a primeira decisão. Clareza vale mais que extensão.",
      estimatedMinutes: 18,
      specs: [
        c(
          "escrever",
          "Para provar 'se n² é par então n é par', o método mais direto é:",
          "Contrapositiva: se n é ímpar então n² é ímpar",
          ["Testar n = 2, 4, 6", "Supor n par e mostrar n² par"],
          "Provar a contrapositiva é fácil: (2k + 1)² = 4k² + 4k + 1.",
          {
            feedback: ["Exemplos não provam.", "Isso prova a recíproca, não a afirmação."],
          },
        ),
        c(
          "escrever",
          "Para provar que a soma de dois ímpares é par, a prova correta começa:",
          "Sejam a = 2m + 1 e b = 2n + 1, com m e n inteiros",
          ["Seja a = 2m + 1 e b = 2m + 1", "3 + 5 = 8, que é par"],
          "Usar a mesma letra forçaria a = b.",
          {
            feedback: [
              "Com a mesma variável só se prova para números iguais.",
              "Um exemplo não é prova.",
            ],
          },
        ),
        n(
          "escrever",
          "Na prova de que a soma de dois ímpares é par, com a = 2m + 1 e b = 2n + 1, a soma é 2(m + n + 1). Qual fator torna a soma par?",
          2,
          "A soma é 2 vezes um inteiro.",
          {
            misreads: [
              {
                value: 1,
                feedback:
                  "O 1 está dentro do parêntese; o que torna a soma par é o fator 2 multiplicando um inteiro.",
              },
            ],
          },
        ),
        c(
          "escrever",
          "Uma prova bem escrita de 'entre 5 inteiros quaisquer há dois com a mesma paridade' usa:",
          "Gavetas: só há 2 paridades para 5 números",
          ["Listagem de todos os casos", "Indução sobre 5"],
          "5 objetos em 2 gavetas.",
          {
            feedback: [
              "Há infinitos quintetos; listar é impossível.",
              "Não há o que induzir; é um argumento direto.",
            ],
          },
        ),
        c(
          "escrever",
          "Ao provar por absurdo, a conclusão deve ser escrita como:",
          "'Contradição; logo a suposição é falsa e a afirmação vale'",
          ["'Logo a suposição é verdadeira'", "'Logo não se pode saber'"],
          "A contradição refuta a suposição.",
          {
            feedback: [
              "A contradição derruba a suposição.",
              "O absurdo decide, não deixa em aberto.",
            ],
          },
        ),
        c(
          "escrever",
          "Qual destas frases é uma hipótese mal escrita para uma prova sobre triângulos retângulos?",
          "'Seja um triângulo com um ângulo de 90° e lados 3, 4 e 5'",
          [
            "'Seja um triângulo com um ângulo de 90°'",
            "'Seja um triângulo retângulo de catetos a e b e hipotenusa c'",
          ],
          "Fixar 3, 4, 5 restringe a um caso particular.",
          {
            feedback: ["Essa é geral e adequada.", "Essa também é geral, com variáveis."],
          },
        ),
        n(
          "escrever",
          "Uma prova por casos sobre o resto de n por 3 precisa de quantos casos para ser exaustiva?",
          3,
          "Restos 0, 1 e 2.",
          {
            misreads: [
              { value: 2, feedback: "Par e ímpar não é a divisão por 3; faltaria um caso." },
            ],
          },
        ),
        c(
          "escrever",
          "A frase 'é óbvio que' numa prova deve ser:",
          "Evitada ou substituída pela razão do passo, porque o leitor precisa poder conferir",
          ["Usada para encurtar", "Usada só no fim"],
          "O que é óbvio para quem escreve pode ser o passo falho.",
          {
            feedback: [
              "Encurtar assim esconde onde o argumento pode falhar.",
              "Em qualquer lugar, o passo precisa de razão.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Organize os passos para escrever uma prova por absurdo.",
    labels: [
      "Escrever claramente o que se quer provar",
      "Supor que a afirmação é falsa",
      "Deduzir consequências até chegar a uma contradição",
      "Concluir que a suposição era falsa e a afirmação é verdadeira",
    ],
    explanation: "Sem a afirmação clara não se sabe o que negar; a contradição fecha o argumento.",
  },
  justification: {
    prompts: [
      "Explique por que 'se n² é par então n é par' é mais fácil de provar pela contrapositiva, e escreva a prova.",
      "Explique por que retirar dois cantos opostos de um tabuleiro 8 × 8 impede a cobertura por dominós.",
      "Explique por que testar muitos casos não prova uma afirmação sobre todos os inteiros, com um exemplo em que os testes enganam.",
    ],
    samples: [
      "A contrapositiva é 'se n é ímpar então n² é ímpar'. Se n é ímpar, n = 2k + 1 para algum inteiro k. Então n² = 4k² + 4k + 1 = 2(2k² + 2k) + 1, que é ímpar. Como a contrapositiva é equivalente à afirmação original, ela está provada. Tentar direto exigiria tirar raiz quadrada e pensar em fatoração, o que é mais trabalhoso.",
      "Pinte o tabuleiro como um tabuleiro de xadrez. Dois cantos opostos têm a mesma cor, digamos preta. Ficam 30 casas pretas e 32 brancas. Cada dominó cobre exatamente uma preta e uma branca, então 31 dominós cobririam 31 de cada cor. Como não há 31 pretas, a cobertura é impossível.",
      "Uma afirmação sobre todos os inteiros precisa valer em infinitos casos; testes só cobrem alguns. A expressão n² + n + 41 dá primos para n de 0 a 39, quarenta testes seguidos, mas em n = 40 dá 41 × 41, que não é primo. Os testes sugerem, mas só um argumento geral prova.",
    ],
    focus: "a estrutura lógica do argumento",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const gavetas = 3 + (seed % 10);
      // Três cores com garantia de 2 já é a missão das meias.
      const garantia = gavetas === 3 && 2 + (seed % 3) === 2 ? 3 : 2 + (seed % 3);
      const minimo = gavetas * (garantia - 1) + 1;
      return c(
        "gavetas-com-garantia",
        `Uma caixa tem bolas de ${gavetas} cores diferentes, em grande quantidade. Quantas bolas é preciso tirar, no mínimo, sem olhar, para garantir ${garantia} bolas da mesma cor?`,
        `${minimo}`,
        [`${gavetas * garantia}`, `${gavetas + garantia}`],
        `No pior caso ${garantia - 1 === 1 ? "tira-se 1" : `tiram-se ${garantia - 1}`} de cada cor (${gavetas * (garantia - 1)} bolas) sem ter ${garantia} da mesma cor; a próxima garante: ${minimo}.`,
        {
          feedback: [
            "Não confere: o pior caso tem uma bola a menos que a garantia em cada cor, mais uma.",
            "Somar cores e garantia não descreve o pior caso.",
          ],
        },
      );
    }
    if (variant === 1) {
      // De 1 a 10 já é uma missão.
      const n = 6 + (seed % 15) === 10 ? 21 : 6 + (seed % 15);
      const soma = (n * (n + 1)) / 2;
      const paridade = soma % 2 === 0 ? "par" : "ímpar";
      const contraria = paridade === "par" ? "ímpar" : "par";
      return c(
        "invariante-da-lousa",
        `Na lousa estão os números de 1 a ${n}. Repetidamente apagam-se dois deles, a e b, e escreve-se a + b. Que número fica sozinho ao final?`,
        `${soma}`,
        [`${n}`, `${soma + 1}`],
        `A soma dos números na lousa nunca muda: 1 + 2 + ... + ${n} = ${soma}, um número ${paridade}; a resposta não poderia ser ${contraria}.`,
        {
          feedback: [
            "Esse é quantos números havia; o que se conserva é a soma.",
            "Não confere: a soma inicial é o invariante.",
          ],
        },
      );
    }
    // De 1 a 20 já é uma missão.
    const limite = [10, 15, 25, 30, 35][seed % 5] ?? 10;
    const impares = Math.floor((limite + 1) / 2);
    const primosImpares = [3, 5, 7, 11, 13, 17, 19, 23, 29, 31].filter((p) => p <= limite).length;
    const contra = impares - primosImpares;
    return c(
      "contraexemplos-para-implicacao",
      `Quantos inteiros de 1 a ${limite} são contraexemplos para a afirmação 'se n é ímpar, então n é primo'?`,
      `${contra}`,
      [`${impares}`, `${contra - 1}`],
      `Ímpares de 1 a ${limite}: ${impares}; ímpares primos: ${primosImpares}; contraexemplos (ímpares não primos, incluindo o 1): ${contra}.`,
      {
        feedback: [
          "Esse é o total de ímpares; só os que não são primos contradizem a frase.",
          "Esqueceu que 1 é ímpar e não é primo.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "argumentacao-em",
    title: "Uma prova de duas páginas para uma frase de uma linha",
    prompt:
      "Escolha uma afirmação simples que você acredita ser verdadeira (por exemplo, sobre paridade, divisibilidade ou uma figura) e escreva uma prova completa. Depois peça a alguém para tentar encontrar um furo e reescreva.",
    lab: "groups",
    steps: [
      "Enuncie a afirmação com hipótese e conclusão claras e escolha o método.",
      "Escreva a prova com cada passo justificado.",
      "Registre a crítica recebida e a versão revisada, explicando o que mudou.",
    ],
    rubric: [
      "Enunciado claro e método adequado (0–2)",
      "Passos corretos e justificados, sem lacunas (0–4)",
      "Revisão após crítica com melhoria real (0–3)",
      "Escrita clara e econômica (0–1)",
    ],
  },
  homeSupport: [
    "Quando alguém disser 'sempre acontece', perguntem se conhecem um caso em que não aconteça e conversem sobre contraexemplos.",
    "Discutam a diferença entre 'se chove, a rua molha' e 'se a rua está molhada, choveu' com situações do dia a dia.",
  ],
};
