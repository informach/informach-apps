import type { RecoveryBank } from "./types";

export const earlyRecovery: RecoveryBank = {
  "contagem-inicial": [
    [
      "learn:contar-em-grupos",
      "Conte um grupo e veja quantos grupos há.",
      "Multiplique o tamanho do grupo pela quantidade de grupos.",
      [
        "Há 7 bicicletas, cada uma com 2 rodas. Quantas rodas há?",
        14,
        "7 grupos de 2 rodas dão 14.",
      ],
      ["Uma bandeja tem 5 fileiras de 4 pães. Quantos pães há?", 20, "5 × 4 = 20 pães."],
    ],
    [
      "learn:repartir",
      "Todos devem receber a mesma quantidade.",
      "Divida o total pelo número de grupos.",
      [
        "Vinte e sete figurinhas são repartidas igualmente por 3 crianças. Quantas cada uma recebe?",
        9,
        "27 ÷ 3 = 9.",
      ],
      [
        "Quarenta botões enchem igualmente 8 saquinhos. Quantos botões vão em cada um?",
        5,
        "40 ÷ 8 = 5.",
      ],
    ],
    [
      "learn:combinar",
      "Cada opção da primeira lista combina com cada opção da segunda.",
      "Faça uma lista para cada primeira escolha.",
      [
        "Há 3 tipos de pão e 3 recheios. Quantos sanduíches diferentes usam um pão e um recheio?",
        9,
        "Para cada um dos 3 pães há 3 recheios: 9.",
      ],
      [
        "Um convite pode ter 4 cores de papel e 2 desenhos. Quantos modelos usam uma cor e um desenho?",
        8,
        "Quatro cores com dois desenhos dão 8 modelos.",
      ],
    ],
  ],
  "padroes-iniciais": [
    [
      "learn:continuar",
      "Observe quanto aumenta de um termo para o seguinte.",
      "Aplique novamente o mesmo aumento.",
      [
        "Começando em 8 e somando 4 de cada vez: 8, 12, 16, 20. Qual é o próximo número?",
        24,
        "20 + 4 = 24.",
      ],
      [
        "Uma escada de números começa em 3 e sobe de 7 em 7: 3, 10, 17. Qual é o próximo?",
        24,
        "17 + 7 = 24.",
      ],
    ],
    [
      "learn:ciclo",
      "Encontre o bloco completo que se repete.",
      "Conte blocos completos e depois as posições que sobram.",
      [
        "Repete-se flor, folha, folha, flor, folha, folha. Qual figura está na 10ª posição?",
        "Flor",
        "Cada bloco tem 3 figuras; depois de 9, o bloco recomeça com flor.",
        ["Folha", "As duas juntas"],
      ],
      [
        "Um colar repete azul, verde, amarelo, vermelho. Qual é a cor da 15ª conta?",
        "Amarelo",
        "Após 12 contas, vêm azul (13), verde (14), amarelo (15).",
        ["Azul", "Vermelho"],
      ],
    ],
    [
      "learn:tabela",
      "Descubra a regra que liga entrada e saída.",
      "Confira a mesma operação nos dois pares fornecidos.",
      [
        "Uma máquina triplica o número: 2 vira 6 e 5 vira 15. Quanto vira 7?",
        21,
        "Triplicar 7 é 7 × 3 = 21.",
      ],
      ["Uma máquina soma 9: 1 vira 10 e 4 vira 13. Qual entrada vira 20?", 11, "11 + 9 = 20."],
    ],
  ],
  "orientacao-espacial": [
    [
      "learn:malha",
      "Separe movimentos horizontais e verticais.",
      "Movimentos opostos se cancelam.",
      [
        "Um robô anda 8 casas à direita e 3 à esquerda. A quantas casas à direita do início ele fica?",
        5,
        "8 − 3 = 5.",
      ],
      [
        "De uma marca no chão, Lia anda 6 passos para a frente, 2 para trás e 3 para a frente. Quantos passos à frente da marca ela termina?",
        7,
        "6 − 2 + 3 = 7.",
      ],
    ],
    [
      "learn:giro",
      "Imagine as direções norte, leste, sul e oeste ao redor de você.",
      ["Um quarto de volta muda para a direção vizinha.", "Meia-volta leva à direção oposta."],
      [
        "Um robô olha para o sul e dá um quarto de volta para a esquerda. Para onde passa a olhar?",
        "Leste",
        "Olhando para o sul, sua esquerda aponta para o leste.",
        ["Oeste", "Norte"],
      ],
      [
        "Você olha para o oeste e dá meia-volta. Para onde passa a olhar?",
        "Leste",
        "Meia-volta leva à direção oposta ao oeste.",
        ["Sul", "Norte"],
      ],
    ],
    [
      "learn:vista",
      [
        "Conte apenas o que pode ser visto daquela direção.",
        "Conte todos os cubos, inclusive os que ficam debaixo dos outros.",
      ],
      [
        "Uma vista de cima mostra as posições ocupadas, não a altura de cada pilha.",
        "Multiplique a quantidade de pilhas pelo número de cubos de cada pilha.",
      ],
      [
        "Há três pilhas de cubos lado a lado, com alturas 1, 4 e 2. Vistas exatamente de cima, sem sobreposição, quantos quadrados aparecem?",
        3,
        "Cada pilha mostra um quadrado superior: 3.",
      ],
      [
        "Quatro pilhas lado a lado têm 2 cubos cada. Quantos cubos existem ao todo, contando também os de baixo?",
        8,
        "4 pilhas × 2 cubos = 8.",
      ],
    ],
  ],
  "composicao-de-figuras": [
    [
      "learn:montar",
      "Partes sem sobreposição podem ser somadas.",
      [
        "Conte as peças de cada parte uma só vez.",
        "Subtraia do total a parte conhecida para encontrar a outra.",
      ],
      [
        "Um desenho usa 6 quadradinhos numa parte e 9 em outra, sem sobreposição. Quantos quadradinhos usa?",
        15,
        "6 + 9 = 15.",
      ],
      [
        "Um retângulo feito de 18 quadradinhos é separado em duas partes. Uma tem 7. Quantos há na outra?",
        11,
        "18 − 7 = 11.",
      ],
    ],
    [
      "learn:contorno",
      "Lados colados no interior não fazem parte do contorno.",
      "Ao juntar dois quadrados por um lado, esse lado deixa de aparecer duas vezes.",
      [
        "Três quadrados de lado 1 cm são colados em uma fila reta. Qual é o contorno do retângulo formado, em cm?",
        8,
        "O retângulo mede 3 por 1; contorno 3 + 1 + 3 + 1 = 8.",
      ],
      [
        "Quatro quadrados de lado 1 cm formam um quadrado de 2 por 2. Qual é o contorno em cm?",
        8,
        "São quatro lados de 2 cm: 8 cm.",
      ],
    ],
    [
      "learn:cobrir",
      "Veja quantas peças cabem em uma fileira.",
      [
        "Multiplique a quantidade por fileira pelo número de fileiras.",
        "Calcule o total pelas fileiras e subtraia as casas já cobertas.",
      ],
      [
        "Uma placa de 4 por 7 quadradinhos é coberta sem buracos. Quantos quadradinhos são usados?",
        28,
        "4 × 7 = 28.",
      ],
      [
        "Um tabuleiro tem 6 fileiras de 6 casas. Nove casas já estão cobertas. Quantas faltam cobrir?",
        27,
        "Há 36 casas; 36 − 9 = 27.",
      ],
    ],
  ],
  "tempo-e-medidas": [
    [
      "learn:duracao",
      "Separe o tempo até a próxima hora e o restante.",
      "Uma hora equivale a 60 minutos.",
      [
        "Uma oficina começa às 14h35 e termina às 15h20 no mesmo dia. Quantos minutos dura?",
        45,
        "Até 15h são 25 minutos; mais 20, total 45.",
      ],
      [
        "Um filme de 85 minutos começa às 10h. Quantos minutos passam das 11h quando termina?",
        25,
        "Após os primeiros 60 minutos, restam 25; termina às 11h25.",
      ],
    ],
    [
      "learn:comprimento",
      "Use a mesma unidade antes de comparar.",
      "Um metro tem 100 centímetros.",
      [
        "Uma fita de 2 m perde um pedaço de 35 cm. Quantos centímetros restam?",
        165,
        "2 m = 200 cm; 200 − 35 = 165.",
      ],
      [
        "Um caminho mede 125 cm e outro 75 cm. Juntos, quantos metros medem?",
        2,
        "125 + 75 = 200 cm = 2 m.",
      ],
    ],
    [
      "learn:capacidade",
      "Compare a capacidade de um recipiente com o total.",
      "Um litro equivale a 1.000 mL.",
      [
        "Quantos copos de 200 mL são necessários para completar 2 litros, sem derramar?",
        10,
        "2.000 ÷ 200 = 10.",
      ],
      [
        "Uma garrafa tinha 1 litro. Foram servidos 3 copos de 150 mL. Quantos mL sobraram?",
        550,
        "1.000 − 3 × 150 = 550.",
      ],
    ],
  ],
  balancas: [
    [
      "learn:ler-balanca",
      "Os dois lados de uma balança equilibrada têm a mesma massa.",
      [
        "Retire a massa conhecida para descobrir a que falta.",
        "Divida a massa total igualmente entre as duas caixas.",
      ],
      [
        "Uma caixa e um peso de 3 kg equilibram um peso de 11 kg. Quantos kg tem a caixa?",
        8,
        "Caixa + 3 = 11; a caixa tem 8 kg.",
      ],
      [
        "Duas caixas iguais equilibram 18 kg. Quantos kg tem cada caixa?",
        9,
        "As duas dividem igualmente 18: cada uma tem 9 kg.",
      ],
    ],
    [
      "learn:trocar",
      "Troque um objeto por outros de mesma massa.",
      "Use a equivalência em cada uma das substituições.",
      [
        "Uma melancia equilibra 3 melões iguais. Cada melão equilibra 2 maçãs iguais. Uma melancia equivale a quantas maçãs?",
        6,
        "3 melões × 2 maçãs = 6 maçãs.",
      ],
      [
        "Uma caixa A tem a massa de 4 caixas B. Uma caixa B tem 5 kg. Quantos kg tem A?",
        20,
        "4 × 5 = 20 kg.",
      ],
    ],
    [
      "learn:ordenar",
      "Junte as comparações que têm um objeto em comum.",
      "Se A é mais pesado que B e B que C, A também é mais pesado que C.",
      [
        "O pacote verde é mais pesado que o azul. O azul é mais pesado que o amarelo. Qual é o mais leve?",
        "Amarelo",
        "Amarelo é mais leve que azul, que é mais leve que verde.",
        ["Azul", "Verde"],
      ],
      [
        "R é mais leve que S, e T é mais pesado que S. Qual é o mais pesado?",
        "T",
        "A ordem da menor para a maior massa é R, S, T.",
        ["R", "S"],
      ],
    ],
  ],
  caminhos: [
    [
      "learn:contar-caminhos",
      "Separe as escolhas de cada etapa da viagem.",
      "Se cada primeira escolha permite todas as seguintes, multiplique.",
      [
        "Há 2 ruas de casa à praça e 5 ruas da praça à escola. Indo pela praça, quantos caminhos usam uma rua de cada trecho?",
        10,
        "2 × 5 = 10 caminhos.",
      ],
      [
        "Para sair de um salão escolhe-se uma das 3 portas e depois uma das 3 escadas. Quantos percursos diferentes há?",
        9,
        "3 portas × 3 escadas = 9.",
      ],
    ],
    [
      "learn:mais-curto",
      "Conte os movimentos necessários em cada direção.",
      "Sem obstáculos, não é preciso voltar para alcançar o destino.",
      [
        "Em uma malha, o destino fica 5 casas à direita e 3 acima. Andando uma casa por vez, só na horizontal ou vertical, qual é o menor número de passos?",
        8,
        "São necessários 5 + 3 = 8 passos.",
      ],
      [
        "Para chegar ao ponto B, ande 7 casas à esquerda e 2 abaixo numa malha sem obstáculos. Qual é o menor total de passos horizontais ou verticais?",
        9,
        "7 + 2 = 9 passos.",
      ],
    ],
    [
      "learn:regras",
      "Descarte caminhos que desrespeitam alguma regra.",
      "Conte apenas os percursos permitidos.",
      [
        "De casa à praça há 4 ruas, mas uma está fechada. Da praça ao clube há 2 ruas abertas. Quantos caminhos pela praça estão disponíveis?",
        6,
        "Restam 3 ruas no primeiro trecho e 2 no segundo: 6.",
      ],
      [
        "Três caminhos para a escola passam pela ponte e dois não passam. A ponte foi fechada. Quantos desses cinco caminhos continuam possíveis?",
        2,
        "Os dois caminhos que evitam a ponte continuam possíveis.",
      ],
    ],
  ],
  tabelas: [
    [
      "learn:localizar",
      "Encontre a categoria pedida antes de fazer contas.",
      "Use o valor associado à categoria, sem misturar linhas.",
      [
        "Registro de empréstimos: segunda 13, terça 21, quarta 16. Quantos foram feitos na terça?",
        21,
        "O valor associado à terça é 21.",
      ],
      [
        "Uma lista mostra: suco 8 copos, água 14 copos, leite 6 copos. Quantos copos de água foram servidos?",
        14,
        "Na categoria água aparecem 14 copos.",
      ],
    ],
    [
      "learn:totais",
      "O total reúne todas as categorias pedidas.",
      "Some os valores sem contar uma categoria duas vezes.",
      [
        "Em uma votação, gato recebeu 12 votos, cão 17 e peixe 5. Cada pessoa votou uma vez. Quantas pessoas votaram?",
        34,
        "12 + 17 + 5 = 34.",
      ],
      [
        "A oficina usou 23 folhas na manhã e 18 na tarde. Quantas folhas usou no dia?",
        41,
        "23 + 18 = 41.",
      ],
    ],
    [
      "learn:completar",
      "Um valor desconhecido pode ser obtido pelo total.",
      "Retire do total os valores conhecidos.",
      [
        "Uma tabela de frutas registra 15 maçãs, algumas peras e 37 frutas ao todo. Quantas peras há?",
        22,
        "37 − 15 = 22.",
      ],
      [
        "No sábado venderam-se 26 ingressos. No fim de semana inteiro foram 60. Quantos foram vendidos no domingo?",
        34,
        "60 − 26 = 34.",
      ],
    ],
  ],
  "contar-e-comparar": [
    [
      "learn:dezenas",
      "Uma dezena reúne dez unidades.",
      [
        "Conte as dezenas e acrescente as unidades soltas.",
        "Subtraia do total as dezenas que já foram agrupadas.",
      ],
      [
        "Há 4 saquinhos com 10 sementes cada e mais 7 sementes soltas. Quantas sementes há?",
        47,
        "40 + 7 = 47.",
      ],
      [
        "Uma caixa tem 63 lápis. Separamos 6 grupos de 10. Quantos lápis ficam soltos?",
        3,
        "63 − 60 = 3.",
      ],
    ],
    [
      "learn:comparar",
      "Compare primeiro as dezenas.",
      "Para saber quanto falta, subtraia o menor do maior.",
      [
        "Bia tem 28 cartões e Rui tem 35. Quantos cartões faltam para Bia ter a mesma quantidade que Rui?",
        7,
        "35 − 28 = 7.",
      ],
      [
        "Uma cesta tem 42 maçãs e outra 29. Quantas maçãs a primeira tem a mais?",
        13,
        "42 − 29 = 13.",
      ],
    ],
    [
      "learn:juntar-separar",
      "Acompanhe o que entra e o que sai.",
      "Some quando chegam objetos e subtraia quando saem.",
      [
        "Havia 16 crianças no pátio. Chegaram 9 e depois saíram 4. Quantas ficaram?",
        21,
        "16 + 9 − 4 = 21.",
      ],
      [
        "De 31 peças, 8 foram guardadas. Depois mais 6 peças foram trazidas. Quantas peças ficaram fora da caixa?",
        29,
        "31 − 8 + 6 = 29.",
      ],
    ],
  ],
  "formas-e-posicoes": [
    [
      "learn:figuras",
      "Conte os lados retos da figura.",
      "Triângulos têm três lados e quadriláteros têm quatro.",
      [
        "Um desenho tem dois triângulos separados. Quantos lados eles têm juntos?",
        6,
        "Cada triângulo tem 3 lados: 3 + 3 = 6.",
      ],
      [
        "Um quadrado e um retângulo estão separados. Quantos lados têm juntos?",
        8,
        "São 4 lados em cada figura: 8 ao todo.",
      ],
    ],
    [
      "learn:posicao",
      "Use a mesma direção de leitura indicada na pergunta.",
      "Localize o vizinho imediato, sem pular objetos.",
      [
        "Da esquerda para a direita estão uma bola, um livro e um copo. O que está imediatamente à direita do livro?",
        "Copo",
        "Na ordem dada, o copo vem logo depois do livro.",
        ["Bola", "Livro"],
      ],
      [
        "Numa fila, da frente para trás, estão Eva, Ivo e Léo. Quem está entre Eva e Léo?",
        "Ivo",
        "Ivo ocupa a posição do meio.",
        ["Eva", "Léo"],
      ],
    ],
    [
      "learn:solidos",
      "Pense se a superfície é plana ou curva.",
      "Uma bola tem superfície curva; uma caixa tem faces planas.",
      [
        "Qual objeto tem forma mais parecida com uma esfera?",
        "Bola de futebol",
        "A bola tem superfície arredondada em todas as direções.",
        ["Caixa de sapatos", "Dado comum"],
      ],
      [
        "Um dado comum tem forma de cubo. Quantas faces planas ele tem?",
        6,
        "O cubo tem 6 faces quadradas.",
      ],
    ],
  ],
  "sequencias-iniciais": [
    [
      "learn:repeticao",
      "Descubra o grupo que aparece de novo.",
      "Continue na mesma ordem do grupo.",
      [
        "Repete-se círculo, quadrado, círculo, quadrado. Qual figura vem na 9ª posição?",
        "Círculo",
        "As posições ímpares são círculos; 9 é ímpar.",
        ["Quadrado", "Triângulo"],
      ],
      [
        "Repete-se palma, palma, estalo. Quantos estalos há nos primeiros 12 sons?",
        4,
        "São quatro grupos de 3 sons, cada um com um estalo.",
      ],
    ],
    [
      "learn:pulos",
      "Cada pulo acrescenta a mesma quantidade.",
      "Conte quantos pulos foram dados a partir do início.",
      [
        "Partindo do 5, um sapo dá 4 pulos de 2 números para a frente. Em que número chega?",
        13,
        "5 + 2 + 2 + 2 + 2 = 13.",
      ],
      [
        "Começando em 30, contamos de 5 em 5 para trás: 30, 25, 20. Qual vem depois?",
        15,
        "20 − 5 = 15.",
      ],
    ],
    [
      "learn:falta",
      "Compare os números dos dois lados do espaço.",
      "O mesmo passo precisa funcionar antes e depois do número que falta.",
      ["Somando sempre 3: 7, 10, __, 16. Que número falta?", 13, "10 + 3 = 13 e 13 + 3 = 16."],
      ["Contando de 10 em 10: 12, __, 32, 42. Que número falta?", 22, "12 + 10 = 22, depois 32."],
    ],
  ],
  "medir-e-comparar": [
    [
      "learn:comprimento",
      "Use as marcas da régua, mesmo quando o objeto não começa no zero.",
      [
        "Subtraia a marca inicial da final.",
        "Some o comprimento à marca inicial para encontrar a marca final.",
      ],
      [
        "Um lápis vai da marca de 3 cm até a de 14 cm numa régua. Qual é seu comprimento em cm?",
        11,
        "14 − 3 = 11 cm.",
      ],
      [
        "Uma fita começa na marca 5 cm e mede 9 cm. Em que marca da régua ela termina, em cm?",
        14,
        "5 + 9 = 14 cm.",
      ],
    ],
    [
      "learn:dinheiro",
      "Some moedas e notas pelo valor de cada uma.",
      [
        "O troco é o valor entregue menos o preço.",
        "Multiplique a quantidade pelo valor de cada moeda ou nota e some os valores.",
      ],
      [
        "Um brinquedo custa R$ 13 e é pago com R$ 20. Quantos reais de troco devem voltar?",
        7,
        "20 − 13 = 7.",
      ],
      [
        "Lia tem três moedas de R$ 1 e duas notas de R$ 5. Quantos reais tem ao todo?",
        13,
        "3 + 10 = 13.",
      ],
    ],
    [
      "learn:tempo",
      "Conte as horas que passam, não os números mostrados juntos.",
      [
        "A duração é a diferença entre fim e início no mesmo dia.",
        "Some a duração à hora inicial, mantendo o relógio de 24 horas.",
      ],
      [
        "Uma visita começa às 9h e termina às 12h no mesmo dia. Quantas horas dura?",
        3,
        "De 9h a 12h passam 3 horas.",
      ],
      [
        "Uma brincadeira começa às 14h e dura 2 horas. Em que hora termina? Responda usando o relógio de 24 horas.",
        16,
        "14 + 2 = 16: termina às 16h.",
      ],
    ],
  ],
  "problemas-com-desenho": [
    [
      "learn:desenhar",
      "Represente cada grupo com marcas ou bolinhas.",
      "Junte os grupos para responder ao total.",
      [
        "Há 3 ninhos com 4 ovos em cada. Faça um desenho para contar: quantos ovos há?",
        12,
        "Três grupos de quatro dão 12.",
      ],
      [
        "Numa fileira há 5 duplas de cadeiras. Quantas cadeiras você desenharia?",
        10,
        "Cada dupla tem 2 cadeiras: 5 × 2 = 10.",
      ],
    ],
    [
      "learn:repartir",
      "Desenhe os grupos e distribua uma peça de cada vez.",
      "Todos os grupos precisam ficar com a mesma quantidade.",
      [
        "Quinze biscoitos são divididos igualmente entre 5 pratos. Quantos vão em cada prato?",
        3,
        "15 ÷ 5 = 3.",
      ],
      [
        "Dezoito flores devem formar 3 buquês iguais. Quantas flores haverá em cada um?",
        6,
        "18 ÷ 3 = 6.",
      ],
    ],
    [
      "learn:ordenar",
      "Desenhe uma fila na direção pedida.",
      "A posição conta a própria pessoa; quem está depois não inclui essa pessoa.",
      [
        "Uma fila tem 9 crianças. Ana é a quarta a partir da frente. Quantas estão depois dela?",
        5,
        "As posições 5 a 9 ficam depois de Ana: 5 crianças.",
      ],
      [
        "Numa fila, Rui tem 3 pessoas à frente e 4 atrás. Quantas pessoas há na fila, incluindo Rui?",
        8,
        "3 + 1 + 4 = 8.",
      ],
    ],
  ],
};
