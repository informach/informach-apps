import { c, n, type SkillPack } from "../skill-factory";

/**
 * Tabelas simples: ler linhas e colunas, comparar valores, somar totais,
 * ler gráficos de barras descritos, completar tabelas com uma regra e
 * responder perguntas que exigem juntar informações. Trilha Mirim 2.
 */
export const tabelas: SkillPack = {
  id: "tabelas",
  name: "Ler tabelas",
  domain: "mirim",
  lab: null,
  missions: [
    {
      title: "Linhas e colunas",
      objective: "Localizar um valor numa tabela cruzando linha e coluna.",
      introduction:
        "Uma tabela organiza informações em linhas (deitadas) e colunas (em pé). Para achar um valor, encontre a linha certa e a coluna certa e veja onde elas se cruzam.",
      specs: [
        n(
          "localizar",
          "Tabela de frutas vendidas: segunda 12 maçãs e 8 peras; terça 15 maçãs e 10 peras; quarta 9 maçãs e 14 peras. Quantas peras foram vendidas na terça?",
          10,
          "Linha da terça, coluna das peras: 10.",
          {
            misreads: [
              { value: 15, feedback: "15 são as maçãs da terça; a coluna pedida é a das peras." },
            ],
          },
        ),
        c(
          "localizar",
          "Na mesma tabela (segunda 12 maçãs e 8 peras; terça 15 e 10; quarta 9 e 14), em que dia foram vendidas mais peras que maçãs?",
          "Quarta",
          ["Segunda", "Terça"],
          "Na quarta: 14 peras contra 9 maçãs.",
          {
            feedback: [
              "Na segunda, 8 peras e 12 maçãs: mais maçãs.",
              "Na terça, 10 peras e 15 maçãs: mais maçãs.",
            ],
          },
        ),
        n(
          "localizar",
          "Tabela de horários: o ônibus 1 sai às 7 h e chega às 8 h; o ônibus 2 sai às 9 h e chega às 10 h 30; o ônibus 3 sai às 13 h e chega às 14 h. Quantos minutos dura a viagem mais longa?",
          90,
          "O ônibus 2 leva 1 hora e 30 minutos: 90 minutos.",
          {
            misreads: [
              {
                value: 60,
                feedback:
                  "60 minutos são as viagens dos ônibus 1 e 3; a mais longa é a do ônibus 2.",
              },
            ],
          },
        ),
        c(
          "localizar",
          "Uma tabela mostra pontos de 3 times em 2 jogos: Azul 3 e 1; Verde 0 e 3; Amarelo 1 e 1. Qual time fez 3 pontos no segundo jogo?",
          "Verde",
          ["Azul", "Amarelo"],
          "Coluna do segundo jogo: Azul 1, Verde 3, Amarelo 1.",
          {
            feedback: ["O Azul fez 3 no primeiro jogo.", "O Amarelo fez 1 nos dois."],
          },
        ),
        n(
          "localizar",
          "Tabela de temperaturas: manhã 18, tarde 27, noite 21 graus. Qual é a diferença entre a temperatura mais alta e a mais baixa?",
          9,
          "27 − 18 = 9 graus.",
          {
            misreads: [
              {
                value: 6,
                feedback: "6 é a diferença entre tarde e noite; a mais baixa é a da manhã.",
              },
            ],
          },
        ),
        c(
          "localizar",
          "Uma tabela tem 4 linhas (turmas A, B, C, D) e 3 colunas (meninas, meninos, total). Onde fica o número de meninos da turma C?",
          "Na terceira linha, segunda coluna",
          ["Na segunda linha, terceira coluna", "Na terceira linha, terceira coluna"],
          "Turma C é a 3ª linha; meninos é a 2ª coluna.",
          {
            feedback: [
              "Segunda linha é a turma B, e terceira coluna é o total.",
              "A terceira coluna é o total, não os meninos.",
            ],
          },
        ),
        n(
          "localizar",
          "Cardápio: suco 4 reais, sanduíche 7 reais, bolo 5 reais. Quanto custa um sanduíche com um suco?",
          11,
          "7 + 4 = 11 reais.",
          { misreads: [{ value: 12, feedback: "12 seria sanduíche com bolo." }] },
        ),
        c(
          "localizar",
          "Para achar um valor numa tabela, o que se faz primeiro?",
          "Ler os títulos das linhas e das colunas",
          ["Somar todos os números da tabela", "Procurar o maior número da tabela"],
          "Os títulos dizem o que cada linha e cada coluna mostra. Sem entender os títulos, o número achado pode ser de outra coisa.",
          {
            feedback: [
              "Somar tudo só serve quando a pergunta pede o total.",
              "O maior número pode não ser o que a pergunta quer.",
            ],
          },
        ),
      ],
    },
    {
      title: "Totais e diferenças",
      objective: "Somar uma linha ou coluna, comparar totais e achar diferenças na tabela.",
      introduction:
        "Somar uma linha diz o total daquele item; somar uma coluna diz o total daquela categoria. Comparar totais responde 'quem teve mais' e a diferença diz 'quanto a mais'.",
      specs: [
        n(
          "totais",
          "Vendas de uma barraca: sexta 20 pipocas e 15 sucos; sábado 35 pipocas e 25 sucos; domingo 30 pipocas e 20 sucos. Quantas pipocas foram vendidas nos três dias?",
          85,
          "20 + 35 + 30 = 85.",
          { misreads: [{ value: 60, feedback: "60 é o total de sucos." }] },
        ),
        c(
          "totais",
          "Na mesma barraca (sexta 20 e 15; sábado 35 e 25; domingo 30 e 20), em que dia a soma de pipocas e sucos foi maior?",
          "Sábado, com 60",
          ["Domingo, com 50", "Sexta, com 35"],
          "Sexta 35, sábado 60, domingo 50.",
          {
            feedback: ["Domingo somou 50, menos que 60.", "Sexta somou 35, o menor total."],
          },
        ),
        n(
          "totais",
          "Pontos de um jogo em 3 rodadas: Ana 8, 6 e 9; Bia 7, 10 e 5. Quantos pontos Ana fez a mais que Bia no total?",
          1,
          "Ana: 23. Bia: 22. Diferença: 1.",
          {
            misreads: [
              { value: 23, feedback: "23 é o total de Ana; a pergunta pede a diferença para Bia." },
            ],
          },
        ),
        c(
          "totais",
          "Uma tabela de livros lidos: Caio 4 em março e 6 em abril; Duda 7 em março e 2 em abril. Quem leu mais nos dois meses?",
          "Caio, com 10 contra 9",
          ["Duda, porque leu 7 em março", "Empataram"],
          "Caio: 4 + 6 = 10. Duda: 7 + 2 = 9.",
          {
            feedback: ["Um mês bom não decide o total.", "10 e 9 são diferentes."],
          },
        ),
        n(
          "totais",
          "Animais de uma fazenda por cercado: cercado 1 tem 12 galinhas e 3 patos; cercado 2 tem 8 galinhas e 9 patos. Quantos animais há ao todo?",
          32,
          "12 + 3 + 8 + 9 = 32.",
          { misreads: [{ value: 20, feedback: "20 é só o total de galinhas." }] },
        ),
        c(
          "totais",
          "Na fazenda (cercado 1: 12 galinhas e 3 patos; cercado 2: 8 galinhas e 9 patos), a diferença entre o total de galinhas e o total de patos é:",
          "8",
          ["9", "12"],
          "Galinhas: 20. Patos: 12. Diferença: 8.",
          {
            feedback: [
              "9 é o número de patos do cercado 2.",
              "12 é o total de patos, não a diferença.",
            ],
          },
        ),
        n(
          "totais",
          "Uma tabela de chuva em milímetros: janeiro 120, fevereiro 90, março 60. Quantos milímetros a mais choveu em janeiro do que em março?",
          60,
          "120 − 60 = 60.",
          {
            misreads: [
              { value: 180, feedback: "180 soma janeiro com março; a pergunta pede a diferença." },
            ],
          },
        ),
        c(
          "totais",
          "Uma coluna de 'total' numa tabela deve mostrar:",
          "A soma dos valores daquela linha",
          ["O maior valor da linha", "A soma dos valores de cada coluna"],
          "Total é soma.",
          {
            feedback: [
              "O maior valor é outra informação, chamada máximo.",
              "Somar cada coluna é o trabalho de uma linha de total; a coluna de total soma cada linha.",
            ],
          },
        ),
      ],
    },
    {
      title: "Barras que contam",
      objective: "Ler gráficos de barras descritos em palavras e relacionar com a tabela.",
      introduction:
        "Um gráfico de barras mostra a tabela em desenho: cada barra é uma linha da tabela e a altura é o valor. Barras mais altas significam mais; a diferença de altura é a diferença de valor.",
      specs: [
        n(
          "barras",
          "Num gráfico de animais de estimação da turma, a barra dos cachorros chega a 9, a dos gatos a 6 e a dos peixes a 3. Quantos animais aparecem no gráfico ao todo?",
          18,
          "9 + 6 + 3 = 18.",
          { misreads: [{ value: 9, feedback: "9 é só a barra mais alta." }] },
        ),
        c(
          "barras",
          "No mesmo gráfico (cachorros 9, gatos 6, peixes 3), a barra dos cachorros é:",
          "3 vezes a altura da barra dos peixes",
          ["2 vezes a altura da barra dos peixes", "Igual à barra dos gatos"],
          "9 = 3 × 3.",
          {
            feedback: ["2 vezes 3 seria 6, a barra dos gatos.", "Gatos têm 6; cachorros, 9."],
          },
        ),
        n(
          "barras",
          "Um gráfico de barras mostra livros lidos por mês: março 4, abril 7, maio 5. Em quantos livros a barra de abril passa a de março?",
          3,
          "7 − 4 = 3.",
          {
            misreads: [
              { value: 11, feedback: "11 soma as duas barras; a pergunta é a diferença." },
            ],
          },
        ),
        c(
          "barras",
          "Num gráfico, cada quadradinho de altura vale 2 votos. A barra do sorvete de chocolate tem 5 quadradinhos. Quantos votos são?",
          "10",
          ["5", "7"],
          "5 × 2 = 10 votos.",
          {
            feedback: [
              "5 são os quadradinhos; cada um vale 2 votos.",
              "7 soma 5 com 2 em vez de multiplicar.",
            ],
          },
        ),
        n(
          "barras",
          "Num gráfico em que cada quadradinho vale 5 alunos, a barra do 4º ano tem 6 quadradinhos e a do 5º ano tem 4. Quantos alunos a mais tem o 4º ano?",
          10,
          "6 × 5 = 30; 4 × 5 = 20; 30 − 20 = 10.",
          {
            misreads: [
              { value: 2, feedback: "2 é a diferença em quadradinhos; cada um vale 5 alunos." },
            ],
          },
        ),
        c(
          "barras",
          "Duas barras têm a mesma altura. Isso significa que:",
          "Os dois valores são iguais",
          ["Uma é o dobro da outra", "Os dois valores são zero"],
          "Altura igual, valor igual.",
          {
            feedback: ["O dobro teria o dobro da altura.", "Zero seria uma barra sem altura."],
          },
        ),
        n(
          "barras",
          "Um gráfico de barras mostra as cores preferidas: azul 12, verde 8, vermelho 8, amarelo 4. Quantas crianças foram entrevistadas, se cada uma escolheu uma cor?",
          32,
          "12 + 8 + 8 + 4 = 32.",
          { misreads: [{ value: 12, feedback: "12 é só a barra do azul." }] },
        ),
        c(
          "barras",
          "Para transformar um gráfico de barras em tabela, o que fica em cada linha da tabela?",
          "O nome da barra e o valor da sua altura",
          ["Só o nome de cada barra do gráfico", "O nome da barra e a posição dela no gráfico"],
          "Cada barra vira uma linha com nome e valor.",
          {
            feedback: [
              "Sem o valor, a tabela não diz quanto.",
              "A posição da barra no gráfico não diz quanto ela vale; o que importa é a altura.",
            ],
          },
        ),
      ],
    },
    {
      title: "Completar a tabela",
      objective: "Descobrir valores que faltam numa tabela usando totais e regras.",
      introduction:
        "Quando falta um número na tabela, os totais ajudam: o que falta é o total menos o que já está lá. Uma tabela com regra (como preço por quantidade) se completa seguindo a regra.",
      specs: [
        n(
          "completar",
          "Tabela de uma turma: 14 meninas, meninos desconhecidos, total 27. Quantos meninos há?",
          13,
          "27 − 14 = 13.",
          { misreads: [{ value: 41, feedback: "Somou; o total já inclui as meninas." }] },
        ),
        c(
          "completar",
          "Tabela de preços de figurinhas: 1 pacote custa 3 reais, 2 pacotes custam 6, 3 pacotes custam 9. Quanto custam 5 pacotes?",
          "15 reais",
          ["12 reais", "13 reais"],
          "Cada pacote custa 3: 5 × 3 = 15.",
          {
            feedback: ["12 reais são 4 pacotes.", "13 não é múltiplo de 3."],
          },
        ),
        n(
          "completar",
          "Numa tabela de gols: 1º tempo 2 gols, 2º tempo desconhecido, total 5. Quantos gols houve no 2º tempo?",
          3,
          "5 − 2 = 3.",
          { misreads: [{ value: 7, feedback: "Somou; o total 5 já inclui os 2 do 1º tempo." }] },
        ),
        c(
          "completar",
          "Uma tabela de lanches: dia 1 vendeu 10, dia 2 vendeu 12, dia 3 falta, total dos três dias 35. Quanto vendeu no dia 3?",
          "13",
          ["22", "35"],
          "35 − 10 − 12 = 13.",
          {
            feedback: ["22 é a soma dos dias 1 e 2.", "35 é o total."],
          },
        ),
        n(
          "completar",
          "Tabela de bicicletas e rodas: 1 bicicleta 2 rodas, 2 bicicletas 4 rodas, 3 bicicletas 6 rodas. Quantas rodas têm 8 bicicletas?",
          16,
          "8 × 2 = 16.",
          { misreads: [{ value: 10, feedback: "Somou 8 com 2; cada bicicleta tem 2 rodas." }] },
        ),
        c(
          "completar",
          "Numa tabela, a linha 'meninas' tem 6 na turma A e falta na turma B; o total de meninas é 15. A coluna da turma B tem total 20 e 11 meninos. Quantas meninas há na turma B?",
          "9",
          ["14", "4"],
          "Pela linha: 15 − 6 = 9. Pela coluna: 20 − 11 = 9. As duas contas batem.",
          {
            feedback: [
              "14 seria 20 − 6, misturando linha e coluna.",
              "4 seria 15 − 11, misturando meninas e meninos.",
            ],
          },
        ),
        n(
          "completar",
          "Tabela de tempo de leitura: segunda 20 minutos, terça 25, quarta 15, quinta falta, total da semana de 4 dias 80. Quantos minutos na quinta?",
          20,
          "80 − 20 − 25 − 15 = 20.",
          { misreads: [{ value: 60, feedback: "60 é a soma dos três dias conhecidos." }] },
        ),
        c(
          "completar",
          "Ao completar uma tabela que tem totais de linha e de coluna, como conferir o valor descoberto?",
          "Calcular pela linha e pela coluna e ver se dá igual",
          ["Escolher o maior dos dois resultados", "Não precisa, se a conta foi bem feita"],
          "Dois caminhos independentes que batem dão confiança.",
          {
            feedback: [
              "Se derem diferentes, algo está errado; escolher não resolve.",
              "Mesmo com cuidado, erros de conta acontecem; conferir é o que pega esses erros.",
            ],
          },
        ),
      ],
    },
    {
      title: "Perguntas para a tabela",
      objective:
        "Responder perguntas que juntam mais de uma informação da tabela e julgar afirmações.",
      introduction:
        "Algumas perguntas precisam de mais de um número da tabela: comparar dois totais, achar quem cresceu mais, decidir se uma frase está certa. Ler a pergunta com calma diz quais números buscar.",
      estimatedMinutes: 18,
      specs: [
        c(
          "responder",
          "Tabela de altura em centímetros: Ana 128 no ano passado e 135 este ano; Beto 131 e 136. Quem cresceu mais?",
          "Ana, 7 centímetros contra 5",
          ["Beto, porque é o mais alto", "Empataram"],
          "Ana: 135 − 128 = 7. Beto: 136 − 131 = 5.",
          {
            feedback: ["Ser o mais alto não é ter crescido mais.", "7 e 5 são diferentes."],
          },
        ),
        n(
          "responder",
          "Tabela de vendas de uma sorveteria: manhã 40 sorvetes, tarde 95, noite 65. Quantos sorvetes foram vendidos depois do meio-dia?",
          160,
          "Tarde e noite: 95 + 65 = 160.",
          { misreads: [{ value: 200, feedback: "200 inclui a manhã, que é antes do meio-dia." }] },
        ),
        c(
          "responder",
          "Tabela de faltas: turma A teve 3 faltas em março e 9 em abril; turma B teve 6 e 6. A frase 'a turma B teve mais faltas que a A' está:",
          "Errada: as duas tiveram 12",
          ["Certa, porque em março a B teve mais", "Certa, porque a B teve 13 e a A teve 12"],
          "A: 3 + 9 = 12. B: 6 + 6 = 12.",
          {
            feedback: ["Um mês não decide o total.", "6 + 6 é 12, não 13; some com cuidado."],
          },
        ),
        n(
          "responder",
          "Tabela de uma gincana: equipe Sol fez 15, 20 e 10 pontos; equipe Lua fez 12, 18 e 21. Quantos pontos faltaram para a equipe Sol empatar com a Lua?",
          6,
          "Sol: 45. Lua: 51. Faltam 6.",
          { misreads: [{ value: 51, feedback: "51 é o total da Lua; a pergunta é a diferença." }] },
        ),
        c(
          "responder",
          "Tabela de preços: caderno 8 reais, lápis 2 reais, borracha 1 real. Com 20 reais, o que dá para comprar?",
          "2 cadernos e 2 lápis, gastando exatamente 20",
          ["3 cadernos", "2 cadernos, 3 lápis e 1 borracha"],
          "2 × 8 + 2 × 2 = 20.",
          {
            feedback: ["3 cadernos custam 24, mais que 20.", "16 + 6 + 1 = 23, mais que 20."],
          },
        ),
        n(
          "responder",
          "Tabela de idades: Ana 9, Bia 11, Caio 8, Duda 12. Daqui a 3 anos, qual será a soma das idades dos dois mais novos de hoje?",
          23,
          "Os mais novos são Caio (8) e Ana (9): daqui a 3 anos, 11 + 12 = 23.",
          {
            misreads: [
              { value: 17, feedback: "17 é a soma de hoje; faltou somar 3 anos para cada um." },
            ],
          },
        ),
        c(
          "responder",
          "Uma tabela mostra quantos alunos almoçam na escola: 2ª feira 80, 3ª 75, 4ª 90, 5ª 85, 6ª 60. Qual afirmação está certa?",
          "O dia com menos alunos foi a sexta, 25 a menos que a quinta",
          [
            "Todos os dias da semana tiveram mais de 70 alunos",
            "A quarta teve o dobro dos alunos da sexta",
          ],
          "Sexta teve 60, o menor valor, e 85 − 60 = 25. As outras frases falham: a sexta teve menos de 70, e o dobro de 60 é 120, não 90.",
          {
            feedback: ["A sexta teve 60, menos de 70.", "O dobro de 60 é 120, não 90."],
          },
        ),
        c(
          "responder",
          "Antes de responder uma pergunta sobre uma tabela, o que ajuda a não errar?",
          "Marcar os números que a pergunta pede antes da conta",
          ["Somar todos os números da tabela", "Responder com o primeiro número que aparecer"],
          "Selecionar os dados certos vem antes de calcular: primeiro marcar na tabela os números que a pergunta pede, depois fazer a conta.",
          {
            feedback: [
              "Somar tudo responde outra pergunta.",
              "O primeiro número raramente é o que a pergunta quer.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Coloque em ordem os passos para responder uma pergunta usando uma tabela.",
    labels: [
      "Ler a pergunta e os títulos das linhas e das colunas",
      "Achar a linha e a coluna de cada número pedido",
      "Anotar os números que a pergunta usa",
      "Fazer a conta e conferir se a resposta faz sentido",
    ],
    explanation:
      "Sem entender a tabela e a pergunta, os números escolhidos podem ser os errados; a conta vem por último.",
  },
  justification: {
    prompts: [
      "Numa tabela, a turma B tem total 20 e 11 meninos; a linha das meninas tem total 15 e 6 na turma A. Explique dois jeitos de achar as meninas da turma B.",
      "Ana cresceu de 128 para 135 e Beto de 131 para 136. Explique por que Ana cresceu mais mesmo sendo mais baixa.",
      "Explique por que somar todos os números de uma tabela nem sempre responde à pergunta.",
    ],
    samples: [
      "Pela coluna da turma B: o total é 20 e há 11 meninos, então 20 − 11 = 9 meninas. Pela linha das meninas: o total é 15 e a turma A tem 6, então 15 − 6 = 9. Os dois jeitos dão 9, e isso mostra que a conta está certa.",
      "Crescer é a diferença entre a altura de agora e a de antes. Ana: 135 − 128 = 7 centímetros. Beto: 136 − 131 = 5. Beto continua mais alto, mas Ana aumentou mais. Altura e crescimento são coisas diferentes.",
      "A tabela guarda várias informações separadas: por dia, por tipo, por pessoa. A pergunta costuma pedir só uma parte, como um dia ou uma comparação. Se eu somo tudo, misturo o que devia ficar separado e respondo outra coisa.",
    ],
    focus: "escolher os números certos da tabela",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const a = 10 + (seed % 15);
      const b = 8 + (seed % 11);
      const cVal = 12 + (seed % 9);
      const d = 5 + (seed % 13);
      const totalA = a + b;
      // Sem empate: quando os totais coincidem, o domingo da barraca 2 vende um a mais.
      const dFinal = cVal + d === totalA ? d + 1 : d;
      const totalB = cVal + dFinal;
      const maior = totalA > totalB ? "A barraca 1" : "A barraca 2";
      const menor = totalA > totalB ? "A barraca 2" : "A barraca 1";
      const diferenca = Math.abs(totalA - totalB);
      const resposta = `${maior}, com ${diferenca} a mais`;
      const erradaUm = `${menor}, com ${diferenca} a mais`;
      const erradaDois = `${maior}, com ${diferenca + 2} a mais`;
      return c(
        "comparar-totais-da-tabela",
        `Tabela de vendas de sábado e domingo: a barraca 1 vendeu ${a} e ${b} sanduíches; a barraca 2 vendeu ${cVal} e ${dFinal}. Qual barraca vendeu mais nos dois dias juntos, e quantos a mais?`,
        resposta,
        [erradaUm, erradaDois],
        `Barraca 1: ${a} + ${b} = ${totalA}. Barraca 2: ${cVal} + ${dFinal} = ${totalB}.`,
        {
          feedback: [
            "Trocou qual barraca vendeu mais; some os dois dias de cada uma.",
            "A diferença não confere; subtraia os dois totais.",
          ],
        },
      );
    }
    if (variant === 1) {
      const conhecidos = [4 + (seed % 7), 3 + (seed % 5)];
      const soma = (conhecidos[0] ?? 0) + (conhecidos[1] ?? 0);
      // Maio fica na mesma faixa dos outros meses; o total sai da soma dos três.
      const falta = 3 + (seed % 8);
      const total = soma + falta;
      return c(
        "valor-que-falta-na-tabela",
        `Tabela de livros lidos em três meses: março ${conhecidos[0]}, abril ${conhecidos[1]}, maio ainda não anotado. O total dos três meses é ${total}. Quantos livros foram lidos em maio?`,
        `${falta}`,
        [`${total - (conhecidos[0] ?? 0)}`, `${total + soma}`],
        `${total} − ${conhecidos[0]} − ${conhecidos[1]} = ${falta}.`,
        {
          feedback: [
            "Tirou só março; abril também já está no total.",
            "Somou tudo; o total já inclui março e abril.",
          ],
        },
      );
    }
    const valor = 2 + (seed % 4);
    const quadradinhosA = 4 + (seed % 5);
    const quadradinhosB = 1 + (seed % 3);
    const diferenca = (quadradinhosA - quadradinhosB) * valor;
    return c(
      "barras-com-escala",
      `Num gráfico de barras, cada quadradinho de altura vale ${valor} votos. A barra do futebol tem ${quadradinhosA} quadradinhos e a da queimada tem ${quadradinhosB}. Quantos votos o futebol tem a mais que a queimada?`,
      `${diferenca}`,
      [`${quadradinhosA - quadradinhosB}`, `${(quadradinhosA + quadradinhosB) * valor}`],
      `${quadradinhosA} × ${valor} = ${quadradinhosA * valor}; ${quadradinhosB} × ${valor} = ${quadradinhosB * valor}; diferença ${diferenca}.`,
      {
        feedback: [
          "Essa é a diferença em quadradinhos; cada um vale vários votos.",
          "Somou as barras em vez de subtrair.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "tabelas",
    title: "A tabela da semana",
    prompt:
      "Escolha algo para contar todos os dias durante uma semana (copos de água, páginas lidas, minutos de brincadeira). Monte a tabela, desenhe o gráfico de barras e escreva três perguntas que a tabela responde.",
    lab: null,
    steps: [
      "Monte a tabela com os 7 dias e anote o valor de cada dia.",
      "Desenhe o gráfico de barras com uma escala (quanto vale cada quadradinho).",
      "Escreva três perguntas e as respostas: um total, uma comparação e uma diferença.",
    ],
    rubric: [
      "Tabela com os 7 dias preenchida (0–2)",
      "Gráfico com escala explicada e barras corretas (0–3)",
      "Três perguntas respondidas corretamente com a tabela (0–3)",
      "Apresentação organizada (0–1)",
    ],
  },
  homeSupport: [
    "Ao ver uma tabela de campeonato, um cardápio ou uma conta, façam perguntas do tipo 'quem tem mais', 'quanto a mais' e 'qual o total'.",
    "Montem juntos a tabela de alguma rotina da casa e perguntem o que ela mostra e o que ela não mostra.",
  ],
};
