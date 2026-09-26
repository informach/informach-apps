import { c, n, type SkillPack } from "../skill-factory";

/**
 * Proporção: razões, taxas, escalas e proporcionalidade direta e inversa.
 * Base compartilhada das trilhas de 8º/9º (OBMEP N2 e Canguru C); por isso
 * as duas primeiras missões são gratuitas nessa faixa.
 */
export const proporcao: SkillPack = {
  id: "proporcao",
  name: "Razão e proporção",
  domain: "common",
  lab: "bars",
  missions: [
    {
      title: "Razões que comparam",
      objective: "Ler e simplificar razões, distinguindo parte com parte de parte com todo.",
      introduction:
        "Uma razão compara duas quantidades pela divisão. Antes de calcular, pergunte: o que está sendo comparado com o quê?",
      free: true,
      specs: [
        c(
          "razao-simplificada",
          "Em uma turma há 12 meninas e 18 meninos. Qual é a razão entre o número de meninas e o de meninos, na forma mais simples?",
          "2 : 3",
          ["12 : 30", "3 : 2"],
          "12 : 18 dividido por 6 nos dois termos dá 2 : 3.",
          {
            feedback: [
              "Compara as meninas com a turma inteira, e a pergunta compara meninas com meninos.",
              "Inverte a ordem: a razão pedida começa pelo número de meninas.",
            ],
          },
        ),
        n(
          "receita-proporcional",
          "Uma receita usa 3 xícaras de farinha para 2 de açúcar. Com 9 xícaras de farinha, quantas de açúcar mantêm a mesma proporção?",
          6,
          "9 é 3 vezes 3; então o açúcar também triplica: 3 × 2 = 6.",
          {
            misreads: [{ value: 8, feedback: "Somar 6 à farinha e ao açúcar não mantém a razão." }],
          },
        ),
        c(
          "parte-do-todo",
          "Em um saco há bolinhas azuis e vermelhas na razão 3 : 5. Se há 40 bolinhas, quantas são vermelhas?",
          25,
          [15, 24],
          "3 + 5 = 8 partes; 40 ÷ 8 = 5 bolinhas por parte; vermelhas: 5 × 5 = 25.",
          {
            feedback: [
              "15 é a quantidade de azuis, as 3 partes.",
              "24 vem de 3/5 de 40, e 3/5 compara azuis com vermelhas, não vermelhas com o total.",
            ],
          },
        ),
        n(
          "escala-e-mapa",
          "Em uma escala de 1 : 200, cada 1 cm do desenho vale 200 cm na realidade. Uma parede de 6 m fica com quantos centímetros no desenho?",
          3,
          "6 m = 600 cm; 600 ÷ 200 = 3 cm.",
          { misreads: [{ value: 30, feedback: "Usou 6 m como 6.000 cm; 1 m tem 100 cm." }] },
        ),
        c(
          "razao-equivalente",
          "Qual das razões é equivalente a 4 : 6?",
          "10 : 15",
          ["6 : 8", "8 : 10"],
          "4 : 6 simplifica para 2 : 3; multiplicando os dois termos por 5, 10 : 15.",
          {
            feedback: [
              "Somou 2 aos dois termos; uma razão não se mantém somando.",
              "Somou 4 aos dois termos; só multiplicar os dois termos pelo mesmo número preserva a razão.",
            ],
          },
        ),
        n(
          "taxa-unitaria",
          "Um carro percorre 180 km com 12 litros de combustível. Quantos quilômetros ele percorre com 1 litro?",
          15,
          "180 ÷ 12 = 15 km por litro.",
          {
            misreads: [
              { value: 168, feedback: "Subtraiu os litros dos quilômetros; a taxa é uma divisão." },
            ],
          },
        ),
        c(
          "parte-do-todo",
          "A razão entre a largura e o comprimento de uma bandeira é 2 : 3. Se o comprimento mede 90 cm, qual é a largura?",
          "60 cm",
          ["45 cm", "135 cm"],
          "Cada parte vale 90 ÷ 3 = 30 cm; a largura tem 2 partes: 60 cm.",
          {
            feedback: [
              "45 cm seria a metade do comprimento, como se a razão fosse 1 : 2.",
              "135 cm inverte a razão e deixa a largura maior que o comprimento.",
            ],
          },
        ),
        c(
          "razao-em-porcentagem",
          "Em uma pesquisa, 3 em cada 4 pessoas preferem suco. De 200 pessoas, quantas preferem suco?",
          150,
          [50, 175],
          "3/4 de 200 = 150.",
          {
            feedback: [
              "50 é 1/4 de 200, a parte que não prefere suco.",
              "175 corresponde a 7/8 de 200, não a 3/4.",
            ],
          },
        ),
      ],
    },
    {
      title: "Grandezas que caminham juntas",
      objective: "Reconhecer proporcionalidade direta e usar a taxa unitária.",
      introduction:
        "Duas grandezas são diretamente proporcionais quando dobrar uma dobra a outra. A taxa unitária, quanto vale uma unidade, resolve quase tudo.",
      free: true,
      specs: [
        n(
          "taxa-unitaria",
          "5 cadernos iguais custam R$ 40. Quanto custam 8 desses cadernos, em reais?",
          64,
          "Cada caderno custa 40 ÷ 5 = 8 reais; 8 × 8 = 64.",
          {
            misreads: [
              {
                value: 43,
                feedback: "Somou 3 reais por somar 3 cadernos; o preço cresce por multiplicação.",
              },
            ],
          },
        ),
        c(
          "proporcao-direta",
          "Uma torneira enche 30 litros em 6 minutos. Em 15 minutos, mantendo a vazão, ela enche quantos litros?",
          "75 litros",
          ["39 litros", "45 litros"],
          "30 ÷ 6 = 5 litros por minuto; 5 × 15 = 75 litros.",
          {
            feedback: [
              "Somou 9 litros pelos 9 minutos a mais, como se cada minuto enchesse 1 litro.",
              "45 é 30 + 15: somou minutos com litros.",
            ],
          },
        ),
        n(
          "taxa-unitaria",
          "Se 3 kg de laranja custam R$ 18, qual é o preço de 1 kg, em reais?",
          6,
          "18 ÷ 3 = 6 reais por quilo.",
          {
            misreads: [
              { value: 15, feedback: "Subtraiu 3 de 18; o preço por quilo é uma divisão." },
            ],
          },
        ),
        c(
          "constante-de-proporcionalidade",
          "Em uma tabela, y é diretamente proporcional a x, e y = 20 quando x = 4. Qual é o valor de y quando x = 7?",
          35,
          [23, 28],
          "A constante é 20 ÷ 4 = 5; y = 5 × 7 = 35.",
          {
            feedback: [
              "Somou 3 a y porque x aumentou 3; a proporção multiplica, não soma.",
              "28 é 4 × 7: usou o valor de x no lugar da constante.",
            ],
          },
        ),
        c(
          "reconhecer-tipo-de-proporcao",
          "Qual destas situações NÃO é de proporcionalidade direta?",
          "Idade de uma pessoa e sua altura",
          [
            "Quantidade de litros e preço da gasolina",
            "Número de páginas iguais e tempo de impressão",
          ],
          "Altura não cresce em razão constante com a idade: dobrar a idade não dobra a altura.",
          {
            feedback: [
              "Litros e preço crescem na mesma razão: é proporcionalidade direta.",
              "Páginas iguais e tempo crescem na mesma razão: é proporcionalidade direta.",
            ],
          },
        ),
        n(
          "proporcao-direta",
          "Uma impressora imprime 45 páginas em 3 minutos. Quantas páginas ela imprime em 8 minutos?",
          120,
          "45 ÷ 3 = 15 páginas por minuto; 15 × 8 = 120.",
          { misreads: [{ value: 50, feedback: "Somou 5 páginas pelos 5 minutos a mais." }] },
        ),
        c(
          "escala-e-mapa",
          "Um mapa usa 2 cm para cada 50 km. Duas cidades distam 7 cm nesse mapa. Qual é a distância real entre elas?",
          "175 km",
          ["350 km", "55 km"],
          "2 cm valem 50 km, então 1 cm vale 25 km; 7 × 25 = 175 km.",
          {
            feedback: [
              "350 km usa 50 km por centímetro, esquecendo que 50 km valem 2 cm.",
              "55 km soma 50 com 5, sem usar a razão.",
            ],
          },
        ),
        n(
          "proporcao-direta",
          "Para pintar 4 m² de parede gastam-se 600 mL de tinta. Quantos mL são necessários para 10 m²?",
          1500,
          "600 ÷ 4 = 150 mL por m²; 150 × 10 = 1.500 mL.",
          { misreads: [{ value: 606, feedback: "Somou 6 m² como se fossem mililitros." }] },
        ),
      ],
    },
    {
      title: "Escala, velocidade e densidade",
      objective: "Aplicar razões com unidades: escalas, velocidade média e densidade.",
      introduction:
        "Toda taxa tem duas unidades. Escreva a razão com as unidades certas e converta antes de dividir.",
      specs: [
        n(
          "velocidade-media",
          "Um ciclista percorre 36 km em 2 horas. Qual é a velocidade média dele, em km/h?",
          18,
          "36 ÷ 2 = 18 km/h.",
          {
            misreads: [
              {
                value: 72,
                feedback: "Multiplicou 36 por 2; velocidade é distância dividida pelo tempo.",
              },
            ],
          },
        ),
        c(
          "velocidade-media",
          "Na velocidade média de 18 km/h, quanto tempo um ciclista leva para percorrer 45 km?",
          "2 h 30 min",
          ["2 h 27 min", "3 h"],
          "45 ÷ 18 = 2,5 horas, e meia hora são 30 minutos.",
          {
            feedback: [
              "Tratou o 0,5 da divisão como 27 minutos; meia hora são 30 minutos.",
              "Arredondou 2,5 para 3, mas a proporção pede o valor exato.",
            ],
          },
        ),
        n(
          "escala-e-area",
          "Em uma planta na escala 1 : 100, um cômodo aparece com 4 cm por 5 cm. Qual é a área real do cômodo, em m²?",
          20,
          "4 cm viram 4 m e 5 cm viram 5 m; 4 × 5 = 20 m².",
          {
            misreads: [
              {
                value: 2000,
                feedback:
                  "Multiplicou a área do desenho por 100, mas cada dimensão é que vale 100 vezes mais.",
              },
            ],
          },
        ),
        c(
          "densidade",
          "Um bloco de 300 g ocupa 120 cm³. Qual é a densidade dele, em g/cm³?",
          "2,5",
          ["0,4", "180"],
          "300 ÷ 120 = 2,5 g/cm³.",
          {
            feedback: [
              "0,4 é 120 ÷ 300: dividiu ao contrário.",
              "180 é a diferença 300 menos 120; densidade é uma razão, não uma subtração.",
            ],
          },
        ),
        n(
          "velocidade-media",
          "Um trem viaja a 80 km/h durante 45 minutos. Quantos quilômetros ele percorre?",
          60,
          "45 min = 3/4 de hora; 80 × 3/4 = 60 km.",
          {
            misreads: [
              { value: 3600, feedback: "Multiplicou 80 por 45 sem converter minutos em horas." },
            ],
          },
        ),
        c(
          "escala-e-mapa",
          "Em uma maquete na escala 1 : 500, uma torre de 150 m fica com que altura?",
          "30 cm",
          ["3 cm", "300 cm"],
          "150 m = 15.000 cm; 15.000 ÷ 500 = 30 cm.",
          {
            feedback: [
              "3 cm viria de 150 ÷ 50: errou o fator da escala.",
              "300 cm usa 1 m = 1.000 cm; 1 m tem 100 cm.",
            ],
          },
        ),
        n(
          "velocidade-media",
          "Um atleta corre 400 m em 50 segundos. Mantendo o ritmo, quantos metros ele corre em 2 minutos?",
          960,
          "400 ÷ 50 = 8 m por segundo; 2 min = 120 s; 8 × 120 = 960 m.",
          { misreads: [{ value: 16, feedback: "Usou 2 minutos como se fossem 2 segundos." }] },
        ),
        c(
          "consumo-por-litro",
          "Um carro faz 12 km por litro. Para uma viagem de 300 km, quantos litros são necessários?",
          "25 litros",
          ["36 litros", "3.600 litros"],
          "300 ÷ 12 = 25 litros.",
          {
            feedback: [
              "36 não confere: 12 × 36 = 432, mais que os 300 km.",
              "3.600 multiplica 300 por 12 em vez de dividir.",
            ],
          },
        ),
      ],
    },
    {
      title: "Quando uma cresce e a outra diminui",
      objective: "Reconhecer proporcionalidade inversa e usar o produto constante.",
      introduction:
        "Na proporção inversa, dobrar uma grandeza reduz a outra à metade: o produto das duas não muda. Antes de calcular, decida o sentido.",
      specs: [
        c(
          "proporcao-inversa",
          "4 pedreiros levantam um muro em 12 dias. Com o mesmo ritmo, 6 pedreiros levariam quantos dias?",
          "8 dias",
          ["18 dias", "10 dias"],
          "4 × 12 = 48 dias de trabalho de um pedreiro; 48 ÷ 6 = 8 dias.",
          {
            feedback: [
              "18 dias trata como proporção direta: mais pedreiros dariam mais dias, o que não faz sentido.",
              "10 dias subtrai 2 dias por 2 pedreiros a mais; a relação é multiplicativa.",
            ],
          },
        ),
        n(
          "proporcao-inversa",
          "Um carro a 60 km/h faz um trajeto em 3 horas. A 90 km/h, em quantas horas faz o mesmo trajeto?",
          2,
          "A distância é 60 × 3 = 180 km; 180 ÷ 90 = 2 horas.",
          {
            misreads: [
              { value: 4.5, feedback: "Tratou como direta: mais velocidade daria mais tempo." },
            ],
          },
        ),
        c(
          "reconhecer-tipo-de-proporcao",
          "Qual destas situações é de proporcionalidade inversa?",
          "Número de operários iguais e tempo para concluir uma obra",
          [
            "Quantidade de pães iguais e valor pago",
            "Horas trabalhadas e salário com valor fixo por hora",
          ],
          "Mais operários, menos tempo: o produto operários × tempo se mantém.",
          {
            feedback: [
              "Pães e valor crescem juntos na mesma razão: é direta.",
              "Horas e salário crescem juntos: é direta.",
            ],
          },
        ),
        n(
          "proporcao-inversa",
          "Um tanque é esvaziado por 3 bombas iguais em 8 horas. Com 4 bombas, em quantas horas ele é esvaziado?",
          6,
          "3 × 8 = 24; 24 ÷ 4 = 6 horas.",
          {
            misreads: [
              {
                value: 7,
                feedback:
                  "Diminuiu 1 hora por bomba a mais; o produto bombas × horas é que se mantém.",
              },
            ],
          },
        ),
        c(
          "proporcao-inversa",
          "Com R$ 120, uma pessoa compra 8 lápis iguais. Se o preço de cada lápis dobrar, quantos lápis ela compra com o mesmo dinheiro?",
          4,
          [16, 6],
          "O preço dobra, então a quantidade cai à metade: 8 ÷ 2 = 4.",
          {
            feedback: [
              "16 dobrou a quantidade junto com o preço.",
              "6 tirou 2 lápis sem relação com o dobro do preço.",
            ],
          },
        ),
        n(
          "proporcao-inversa",
          "Uma roda pequena dá 15 voltas para percorrer certa distância. Uma roda com o dobro do raio percorre a mesma distância em quantas voltas?",
          7.5,
          "O dobro do raio dá o dobro do perímetro; então bastam metade das voltas: 15 ÷ 2 = 7,5.",
          {
            misreads: [
              {
                value: 30,
                feedback: "Dobrou as voltas, como se um raio maior exigisse mais voltas.",
              },
            ],
          },
        ),
        c(
          "proporcao-direta",
          "Se 10 máquinas produzem 500 peças em 5 horas, quantas peças essas 10 máquinas produzem em 8 horas?",
          800,
          ["312,5", 500],
          "500 ÷ 5 = 100 peças por hora; 100 × 8 = 800.",
          {
            feedback: [
              "312,5 divide 500 por 8 e multiplica por 5: inverteu a proporção, que aqui é direta no tempo.",
              "500 ignora que o tempo de produção mudou.",
            ],
          },
        ),
        c(
          "proporcao-inversa",
          "Uma viagem de 240 km é feita em 4 horas. Para fazer a mesma viagem em 3 horas, a velocidade média deve ser:",
          "80 km/h",
          ["60 km/h", "45 km/h"],
          "240 ÷ 3 = 80 km/h.",
          {
            feedback: [
              "60 km/h é a velocidade das 4 horas, não das 3.",
              "45 km/h reduz a velocidade, mas menos tempo exige mais velocidade.",
            ],
          },
        ),
      ],
    },
    {
      title: "Proporções encadeadas",
      objective: "Dividir em partes proporcionais e combinar mais de duas grandezas.",
      introduction:
        "Quando há três grandezas ou uma divisão em partes, reduza tudo a uma unidade (por pessoa, por dia, por parte) e só então recomponha.",
      estimatedMinutes: 18,
      specs: [
        c(
          "partes-proporcionais",
          "R$ 350 serão divididos entre duas pessoas na razão 2 : 5. Quanto recebe quem tem a parte maior?",
          "R$ 250",
          ["R$ 100", "R$ 175"],
          "São 7 partes; 350 ÷ 7 = 50; a parte maior tem 5 × 50 = 250.",
          {
            feedback: [
              "R$ 100 é a parte menor, as 2 partes.",
              "R$ 175 divide ao meio, ignorando a razão 2 : 5.",
            ],
          },
        ),
        n(
          "regra-de-tres-composta",
          "6 operários fazem 300 peças em 5 dias. Quantas peças fazem 9 operários em 4 dias, no mesmo ritmo?",
          360,
          "Por operário por dia: 300 ÷ (6 × 5) = 10 peças; 9 × 4 × 10 = 360.",
          {
            misreads: [
              {
                value: 450,
                feedback: "Ajustou só os operários e esqueceu que os dias diminuíram.",
              },
            ],
          },
        ),
        c(
          "mistura",
          "Um suco mistura água e polpa na razão 3 : 1. Para fazer 2 litros de suco, quantos mL de polpa são necessários?",
          "500 mL",
          ["667 mL", "1.500 mL"],
          "São 4 partes em 2.000 mL: 500 mL cada; a polpa é 1 parte.",
          {
            feedback: [
              "667 mL usa 1/3, comparando polpa com água em vez de com o total.",
              "1.500 mL é a água, as 3 partes.",
            ],
          },
        ),
        n(
          "escala-e-mapa",
          "Um mapa na escala 1 : 2.500.000 mostra duas cidades a 8 cm de distância. Qual é a distância real, em km?",
          200,
          "8 × 2.500.000 = 20.000.000 cm; como 1 km = 100.000 cm, são 200 km.",
          {
            misreads: [
              { value: 20, feedback: "Errou uma casa na conversão: 1 km tem 100.000 cm." },
            ],
          },
        ),
        c(
          "partes-proporcionais",
          "Três amigos investem R$ 200, R$ 300 e R$ 500 e dividem um lucro de R$ 150 na proporção do que investiram. Quanto recebe quem investiu R$ 300?",
          "R$ 45",
          ["R$ 50", "R$ 30"],
          "O total investido é 1.000; a parte de 300 é 3/10 de 150 = 45.",
          {
            feedback: [
              "R$ 50 divide o lucro em três partes iguais, ignorando os investimentos.",
              "R$ 30 corresponde a 2/10, a parte de quem investiu 200.",
            ],
          },
        ),
        n(
          "consumo-por-litro",
          "Um caminhão consome 20 litros a cada 100 km. Com 45 litros, quantos quilômetros ele percorre?",
          225,
          "100 ÷ 20 = 5 km por litro; 5 × 45 = 225 km.",
          { misreads: [{ value: 125, feedback: "Somou 25 km pelos 25 litros a mais." }] },
        ),
        c(
          "regra-de-tres-composta",
          "8 máquinas iguais produzem 960 peças em 6 dias. Quantos dias 12 dessas máquinas levam para produzir 1.440 peças?",
          "6 dias",
          ["4 dias", "9 dias"],
          "Por máquina por dia: 960 ÷ (8 × 6) = 20 peças; 1.440 ÷ (12 × 20) = 6 dias.",
          {
            feedback: [
              "4 dias considera só as máquinas a mais e esquece que a produção também aumentou.",
              "9 dias considera só a produção maior e esquece as máquinas a mais.",
            ],
          },
        ),
        c(
          "mistura",
          "Uma liga tem cobre e estanho na razão 9 : 1. Quantos gramas de estanho há em 2,5 kg dessa liga?",
          "250 g",
          ["2.250 g", "278 g"],
          "São 10 partes em 2.500 g: 250 g cada; o estanho é 1 parte.",
          {
            feedback: [
              "2.250 g é o cobre, as 9 partes.",
              "278 g usa 1/9 do total, comparando estanho com cobre em vez de com o todo.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Organize um método para resolver uma regra de três simples.",
    labels: [
      "Identificar as duas grandezas e como se relacionam",
      "Decidir se a proporção é direta ou inversa",
      "Montar a proporção e calcular o valor desconhecido",
      "Conferir se o resultado cresce ou diminui como esperado",
    ],
    explanation:
      "Primeiro entendemos as grandezas, depois o tipo de relação; só então calculamos e conferimos o sentido do resultado.",
  },
  justification: {
    prompts: [
      "Explique por que 4 : 6 e 6 : 9 representam a mesma razão, usando um exemplo com quantidades.",
      "Um colega diz que, se 3 pessoas fazem um trabalho em 6 dias, 6 pessoas fazem o mesmo trabalho em 12 dias. Explique o erro e dê a resposta correta.",
      "Mostre como decidir se duas grandezas são diretamente proporcionais, inversamente proporcionais ou nenhuma das duas, com um exemplo de cada caso.",
    ],
    samples: [
      "Em 4 : 6, cada 2 unidades da primeira correspondem a 3 da segunda; em 6 : 9 acontece o mesmo, porque 6 = 3 × 2 e 9 = 3 × 3. Como as duas simplificam para 2 : 3, representam a mesma relação: por exemplo, 4 meninas para 6 meninos e 6 meninas para 9 meninos.",
      "Mais pessoas trabalhando diminuem o tempo, então a relação é inversa: o produto pessoas × dias se mantém. 3 × 6 = 18; com 6 pessoas, 18 ÷ 6 = 3 dias, e não 12. O colega usou proporção direta.",
      "Direta: dobrar uma dobra a outra, como litros de gasolina e preço pago. Inversa: dobrar uma reduz a outra à metade, como velocidade e tempo de viagem. Nenhuma: idade e altura de uma pessoa, porque não há razão constante entre elas.",
    ],
    focus: "a razão constante entre as grandezas",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const a = 2 + (seed % 3);
      const b = a + 1 + (seed % 2);
      const unit = 2 * (3 + (seed % 11));
      const total = (a + b) * unit;
      const answer = b * unit;
      return c(
        "partes-proporcionais",
        `Uma quantia de R$ ${total} será repartida entre duas pessoas na razão ${a} : ${b}. Quanto recebe a pessoa com a parte maior?`,
        `R$ ${answer}`,
        [`R$ ${a * unit}`, `R$ ${total / 2}`],
        `São ${a + b} partes; ${total} ÷ ${a + b} = ${unit}; a parte maior tem ${b} × ${unit} = ${answer}.`,
        {
          feedback: [
            "Essa é a parte menor da divisão.",
            "Dividir ao meio ignora a razão entre as partes.",
          ],
        },
      );
    }
    if (variant === 1) {
      const kmPorCm = 1 + (seed % 3);
      const cm = 3 + (seed % 17);
      const answer = kmPorCm * cm;
      return c(
        "escala-de-mapa",
        `Em um mapa, 1 cm representa ${kmPorCm} km. Duas cidades aparecem a ${cm} cm uma da outra. Qual é a distância real entre elas?`,
        `${answer} km`,
        [`${answer * 10} km`, `${cm + kmPorCm} km`],
        `${cm} × ${kmPorCm} = ${answer} km.`,
        {
          feedback: [
            "Multiplicou por 10 a mais na conversão.",
            "Somou os números em vez de multiplicar pela escala.",
          ],
        },
      );
    }
    const machines = 4 + (seed % 3);
    const hours = 2 * (3 + (seed % 11));
    const answer = hours / 2;
    return c(
      "produto-constante",
      `${machines} máquinas iguais fazem um serviço em ${hours} horas. Em quanto tempo ${machines * 2} dessas máquinas fazem o mesmo serviço?`,
      `${answer} horas`,
      [`${hours * 2} horas`, `${answer + 1} horas`],
      `O dobro de máquinas faz o serviço na metade do tempo: ${hours} ÷ 2 = ${answer} horas.`,
      {
        feedback: [
          "Dobrou o tempo, tratando a relação como direta.",
          "O tempo cai exatamente à metade, sem sobrar uma hora.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "proporcao",
    title: "A receita que não cabe na panela",
    prompt:
      "Escolha uma receita da sua casa e refaça as quantidades para o dobro de pessoas e para uma pessoa e meia. Depois investigue: o tempo de forno também dobra?",
    lab: "bars",
    steps: [
      "Registre a receita original e as duas versões, mostrando a razão usada em cada ingrediente.",
      "Explique quais quantidades são proporcionais ao número de pessoas e quais não são.",
      "Procure uma grandeza da receita que não segue a proporção, como o tempo de forno, e diga por quê.",
    ],
    rubric: [
      "Quantidades recalculadas com a mesma razão em todos os ingredientes (0–3)",
      "Distinção clara entre o que é proporcional e o que não é (0–2)",
      "Exemplo de grandeza fora da proporção, com justificativa (0–2)",
      "Registro organizado, que outra pessoa consegue seguir (0–1)",
    ],
  },
  homeSupport: [
    "No mercado, peça para comparar o preço por quilo de duas embalagens diferentes do mesmo produto antes de decidir qual levar.",
    "Em uma viagem curta, pergunte quanto tempo levaria se a velocidade fosse a metade, e conversem sobre por que o tempo dobra.",
  ],
};
