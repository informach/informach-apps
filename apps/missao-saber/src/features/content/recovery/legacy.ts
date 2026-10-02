import type { RecoveryBank } from "./types";

export const legacyRecovery: RecoveryBank = {
  fracoes: [
    [
      "fracao-conjunto",
      "Identifique o conjunto inteiro.",
      "Divida pelo denominador e multiplique pelo numerador.",
      [
        "Dos 42 livros do carrinho, 2/7 são de poesia. Quantos são de poesia?",
        12,
        "Cada sétimo tem 6 livros; dois sétimos têm 12.",
      ],
      [
        "Uma equipe examinou 5/8 de 64 sementes. Quantas sementes examinou?",
        40,
        "64 ÷ 8 × 5 = 40 sementes.",
      ],
    ],
    [
      "complemento",
      "O que foi usado e o que sobrou recompõem o inteiro.",
      "Subtraia a parte usada de uma unidade.",
      [
        "Uma jarra estava cheia. Depois de servir 3/10 de sua capacidade, que fração da capacidade continua ocupada?",
        0.7,
        "1 − 3/10 = 7/10, ou 0,7.",
      ],
      [
        "Uma bateria estava completamente carregada e perdeu 5/12 da carga completa. Que fração da carga completa restou?",
        7 / 12,
        "12/12 − 5/12 = 7/12.",
      ],
    ],
    [
      "learn:equivalencia",
      "A fração mantém o valor quando as duas partes mudam pelo mesmo fator.",
      "Compare os denominadores antes de mudar o numerador.",
      [
        "Em um painel, 7/9 da área está pintada. Se o painel for dividido em 27 partes iguais, quantas estarão pintadas?",
        21,
        "27 é 3 × 9; 7 × 3 = 21 partes.",
      ],
      [
        "Uma receita usa 6/15 de litro. Ao simplificar para uma fração com denominador 5, qual será o numerador?",
        2,
        "Dividir numerador e denominador por 3 dá 2/5.",
      ],
    ],
  ],
  porcentagem: [
    [
      "learn:parte-percentual",
      "Porcentagem compara uma parte com cem partes do total.",
      "Multiplique o total pela taxa dividida por 100.",
      [
        "Uma biblioteca recebeu 360 livros; 15% são ilustrados. Quantos livros ilustrados chegaram?",
        54,
        "10% são 36 e 5% são 18: total 54.",
      ],
      [
        "De 250 árvores plantadas, 8% precisam de nova estaca. Quantas árvores precisam?",
        20,
        "250 × 8/100 = 20.",
      ],
    ],
    [
      "learn:base-desconhecida",
      [
        "O valor final corresponde à porcentagem que restou.",
        "No aumento, o valor final corresponde a mais de 100% do inicial.",
      ],
      [
        "Transforme a taxa restante em fator e divida o valor final por ele.",
        "Divida o valor final por 1 mais a taxa de crescimento em forma decimal.",
      ],
      [
        "Após desconto de 25%, uma mochila custa R$ 81. Qual era seu preço, em reais?",
        108,
        "81 corresponde a 75%: 81 ÷ 0,75 = 108.",
      ],
      [
        "Uma população de mudas cresceu 20% e chegou a 144. Quantas mudas havia antes?",
        120,
        "144 ÷ 1,2 = 120.",
      ],
    ],
    [
      "learn:aumento-percentual",
      "A taxa usa o valor inicial como referência.",
      "Divida a mudança pelo valor inicial e multiplique por 100.",
      [
        "Uma entrada passou de R$ 32 para R$ 40. Qual foi o aumento percentual? Responda apenas a taxa em %.",
        25,
        "O aumento foi 8 sobre 32: 8/32 × 100 = 25%.",
      ],
      [
        "Uma turma reduziu o desperdício de 45 para 36 folhas por dia. Qual foi a redução percentual?",
        20,
        "Foram 9 folhas a menos sobre 45: 9/45 = 20%.",
      ],
    ],
  ],
  precos: [
    [
      "learn:preco-unitario",
      "Compare quantidades iguais.",
      "Divida o preço pela quantidade comprada.",
      [
        "Sete pastas idênticas custam R$ 31,50. Quanto custa uma pasta, em reais?",
        4.5,
        "31,50 ÷ 7 = 4,50.",
      ],
      [
        "Um pacote de 1,5 kg custa R$ 18,60. Qual é o preço por kg, em reais?",
        12.4,
        "18,60 ÷ 1,5 = 12,40 por kg.",
      ],
    ],
    [
      "learn:frete-no-total",
      "O total inclui valores fixos e valores por unidade.",
      [
        "Calcule os produtos e só depois acrescente a taxa fixa.",
        "Some preço e taxa por ingresso antes de multiplicar pela quantidade de ingressos.",
      ],
      [
        "Cinco cadernos de R$ 7,20 mais um frete único de R$ 9 custam quantos reais?",
        45,
        "5 × 7,20 + 9 = 45.",
      ],
      [
        "Um ingresso custa R$ 28 e a taxa é de R$ 3 por ingresso. Quanto custam quatro ingressos, em reais?",
        124,
        "4 × (28 + 3) = 124; a taxa se repete para cada ingresso.",
      ],
    ],
    [
      "learn:economia-total",
      "Compare o custo final para a mesma compra.",
      "Inclua descontos e entrega antes de subtrair.",
      [
        "O mesmo jogo custa R$ 75 com entrega grátis na loja A; na B custa R$ 68 mais R$ 12 de entrega. Quantos reais se economiza escolhendo A?",
        5,
        "B custa 80; 80 − 75 = 5.",
      ],
      [
        "Um kit custa R$ 90 com desconto de R$ 14 em A, ou R$ 72 com taxa de R$ 2 em B. Quantos reais B custa a menos?",
        2,
        "A: 76; B: 74; diferença 2.",
      ],
    ],
  ],
  orcamento: [
    [
      "learn:saldo",
      "Separe entradas e saídas.",
      "Some entradas, some saídas e calcule a diferença.",
      [
        "Um projeto recebeu R$ 275 e R$ 125. Gastou R$ 168 e R$ 97. Quantos reais sobraram?",
        135,
        "Entradas 400, saídas 265; saldo 135.",
      ],
      [
        "Havia R$ 86 no caixa. Entraram R$ 49 e saíram R$ 112. Qual é o saldo em reais?",
        23,
        "86 + 49 − 112 = 23.",
      ],
    ],
    [
      "learn:meta-e-prazo",
      "Descubra quanto ainda falta para a meta.",
      [
        "Divida a falta pelo valor poupado a cada período.",
        "Divida o valor que falta pelo número de meses para achar quanto juntar por mês.",
      ],
      [
        "Uma meta é de R$ 345 e já há R$ 105. Guardando R$ 30 por semana, quantas semanas completas faltam?",
        8,
        "Faltam 240; 240 ÷ 30 = 8.",
      ],
      [
        "Uma turma precisa de R$ 560 e já tem R$ 200. Em seis meses iguais, quantos reais deve juntar por mês?",
        60,
        "(560 − 200) ÷ 6 = 60.",
      ],
    ],
    [
      "learn:limite-por-categoria",
      "O limite vale para a compra inteira.",
      "Desconte a despesa fixa e veja quantas unidades inteiras cabem.",
      [
        "Com R$ 100, pagam-se R$ 19 de entrega e caixas de R$ 12 cada. Qual é o máximo de caixas que cabe no orçamento?",
        6,
        "Sobram 81; seis caixas custam 72 e sete custam 84.",
      ],
      [
        "Um passeio tem verba de R$ 170. O transporte custa R$ 62 e cada lanche R$ 9. Quantos lanches podem ser comprados no máximo?",
        12,
        "Restam 108; 108 ÷ 9 = 12.",
      ],
    ],
  ],
  medidas: [
    [
      "learn:area-retangulo",
      "Área mede a superfície coberta.",
      [
        "Multiplique as duas dimensões perpendiculares.",
        "Divida a área pela largura para encontrar o comprimento.",
      ],
      [
        "Uma faixa retangular de tecido mede 9 m por 2,5 m. Qual é sua área em m²?",
        22.5,
        "9 × 2,5 = 22,5 m².",
      ],
      [
        "Um canteiro retangular tem área 84 m² e largura 7 m. Qual é seu comprimento em m?",
        12,
        "84 ÷ 7 = 12 m.",
      ],
    ],
    [
      "learn:perimetro-retangulo",
      "Perímetro percorre todos os lados externos.",
      [
        "No retângulo, há dois comprimentos e duas larguras.",
        "No quadrado, divida o perímetro pelos quatro lados iguais.",
      ],
      [
        "Um cartaz retangular tem lados de 17 cm e 23 cm. Quantos centímetros de fita são necessários para dar uma volta completa?",
        80,
        "2 × (17 + 23) = 80 cm.",
      ],
      [
        "Uma moldura quadrada usa 148 cm de fita em uma volta. Quanto mede cada lado em cm?",
        37,
        "148 ÷ 4 = 37 cm.",
      ],
    ],
    [
      "learn:area-composta",
      "Separe a figura em áreas que você sabe calcular.",
      [
        "Desconte os recortes; não conte uma região duas vezes.",
        "Some as áreas das partes, pois não há sobreposição.",
      ],
      [
        "De uma placa retangular de 13 cm por 8 cm retira-se um quadrado de lado 3 cm. Qual área resta, em cm²?",
        95,
        "13 × 8 − 3 × 3 = 104 − 9 = 95.",
      ],
      [
        "Dois retângulos de áreas 26 e 35 cm² são unidos sem sobreposição. Qual é a área da união em cm²?",
        61,
        "Sem sobreposição, as áreas se somam: 26 + 35 = 61.",
      ],
    ],
  ],
  simetria: [
    [
      "learn:reflexao-em-malha",
      "Uma reflexão coloca o ponto à mesma distância do outro lado do espelho.",
      [
        "Em um eixo vertical, mantenha a altura e inverta a distância horizontal.",
        "A coordenada do espelho é a média das coordenadas horizontais do ponto e do reflexo.",
      ],
      [
        "Um ponto tem x = 7. Seu reflexo em relação à reta vertical x = 2 tem qual coordenada x?",
        -3,
        "O ponto está 5 à direita de 2; o reflexo fica em 2 − 5 = −3.",
      ],
      [
        "Um ponto e seu reflexo em um espelho vertical têm coordenadas x iguais a −4 e 10. Em qual x está o espelho?",
        3,
        "O espelho fica no ponto médio: (−4 + 10)/2 = 3.",
      ],
    ],
    [
      "learn:rotacao",
      "Uma volta completa tem 360 graus.",
      [
        "Divida a volta pelo número de posições igualmente espaçadas.",
        "Divida 360 graus em quatro partes e tome três delas.",
      ],
      [
        "Uma roda com 9 raios igualmente espaçados gira até o próximo raio ocupar a posição do anterior. Quantos graus girou?",
        40,
        "360 ÷ 9 = 40 graus.",
      ],
      ["Uma peça dá três quartos de volta. Quantos graus ela gira?", 270, "3 × 90 = 270 graus."],
    ],
    [
      "learn:translacao",
      "Uma translação soma o mesmo deslocamento a cada ponto.",
      "Movimento para a esquerda subtrai da coordenada horizontal.",
      [
        "Um desenho move-se 8 unidades para a direita. Um ponto que tinha x = −5 passa a ter qual x?",
        3,
        "−5 + 8 = 3.",
      ],
      [
        "Um ponto sai de x = 12 e chega a x = 5 por translação horizontal. Quantas unidades se moveu para a esquerda?",
        7,
        "12 − 5 = 7 unidades.",
      ],
    ],
  ],
  contagem: [
    [
      "learn:principio-multiplicativo",
      "Cada escolha pode ser combinada com todas as escolhas da outra etapa.",
      "Multiplique as quantidades de opções independentes.",
      [
        "Um marcador pode ter 7 estampas e 3 formatos. Quantos modelos de uma estampa e um formato são possíveis?",
        21,
        "7 × 3 = 21 modelos.",
      ],
      [
        "Uma senha tem uma letra entre A, B, C, D e um símbolo entre !, ?, #, @, %. Quantas senhas são possíveis?",
        20,
        "4 letras × 5 símbolos = 20.",
      ],
    ],
    [
      "learn:pares-sem-ordem",
      "Um par não muda quando trocamos a ordem dos integrantes.",
      "Conte os pares ordenados e divida por dois.",
      [
        "Nove clubes jogam uma vez contra cada adversário. Quantas partidas acontecem?",
        36,
        "9 × 8 ÷ 2 = 36 partidas.",
      ],
      [
        "Sete sabores podem ser escolhidos dois a dois, sem repetir sabor e sem importar a ordem. Quantas duplas há?",
        21,
        "7 × 6 ÷ 2 = 21 duplas.",
      ],
    ],
    [
      "learn:contagem-por-complemento",
      "Pode ser mais fácil contar todos e retirar os proibidos.",
      "Não retire duas vezes o mesmo caso.",
      [
        "Há 4 capas e 6 ilustrações para um caderno. Uma combinação específica foi proibida. Quantas combinações restam?",
        23,
        "4 × 6 − 1 = 23.",
      ],
      [
        "Uma senha usa dois algarismos de 0 a 9, podendo começar por zero. Quantas senhas têm algarismos diferentes?",
        90,
        "São 100 pares; retirando os 10 pares iguais, restam 90.",
      ],
    ],
  ],
  gavetas: [
    [
      "learn:garantia-simples",
      "Pense no maior total ainda sem atingir a quantidade desejada em nenhuma caixa.",
      "Depois desse pior caso, um objeto extra força a repetição.",
      [
        "Cartões recebem uma de 7 cores. Qual é o menor número de cartões que garante pelo menos dois da mesma cor?",
        8,
        "Sete podem ter cores diferentes; o oitavo repete uma cor.",
      ],
      [
        "Há 5 tipos de adesivo. Qual é o menor número de adesivos que garante pelo menos três do mesmo tipo?",
        11,
        "É possível ter 2 de cada tipo, total 10. O 11º força um terceiro.",
      ],
    ],
    [
      "learn:teto-da-media",
      "Se todas as caixas tivessem pouco, qual seria o total máximo?",
      "Divida o total pelo número de caixas e arredonde para cima.",
      [
        "Distribuem-se 38 livros por 6 prateleiras. Alguma prateleira terá pelo menos quantos livros, na melhor garantia possível?",
        7,
        "Se todas tivessem no máximo 6, caberiam só 36; alguma tem ao menos 7.",
      ],
      [
        "Dezessete pessoas entram em 4 salas. Qual é o maior número k para o qual se pode garantir pelo menos k pessoas em alguma sala?",
        5,
        "4 por sala somariam 16; uma sala tem pelo menos 5.",
      ],
    ],
    [
      "learn:classes-de-resto",
      "Os restos possíveis funcionam como caixas.",
      [
        "Ao dividir por d, há d restos: de zero até d − 1.",
        "Use somente as três classes de resto permitidas pela lista.",
      ],
      [
        "Qual é o menor número de inteiros escolhidos que garante dois com o mesmo resto na divisão por 8?",
        9,
        "Há 8 restos possíveis; 9 inteiros forçam coincidência.",
      ],
      [
        "Os números de uma lista deixam apenas os restos 0, 2 ou 4 ao dividir por 6. Qual é o menor número de elementos da lista que garante dois com o mesmo resto?",
        4,
        "Só três classes são permitidas; quatro números forçam uma repetição.",
      ],
    ],
  ],
  probabilidade: [
    [
      "learn:casos-equiprovaveis",
      "Conte resultados favoráveis entre resultados igualmente prováveis.",
      "A probabilidade é favoráveis divididos pelo total.",
      [
        "Um sorteio usa 16 cartões iguais, dos quais 6 têm uma estrela. Qual é a probabilidade de tirar uma estrela?",
        0.375,
        "6/16 = 3/8 = 0,375.",
      ],
      [
        "Uma roleta tem 10 setores iguais numerados de 1 a 10. Qual é a probabilidade de sair um múltiplo de 3?",
        0.3,
        "Os favoráveis são 3, 6 e 9: 3/10.",
      ],
    ],
    [
      "learn:complemento",
      "O evento e seu contrário cobrem todas as possibilidades.",
      "Subtraia de 1 a probabilidade do evento contrário.",
      [
        "A chance de uma peça sorteada ser defeituosa é 0,08. Qual é a chance de ela não ser defeituosa?",
        0.92,
        "1 − 0,08 = 0,92.",
      ],
      [
        "Em uma caixa há 7 bolas amarelas e 13 verdes, equiprováveis no sorteio. Qual é a chance de não tirar amarela?",
        0.65,
        "13/20 = 0,65; também 1 − 7/20.",
      ],
    ],
    [
      "learn:duas-etapas",
      "Em escolhas independentes, um resultado não muda as chances do outro.",
      "Multiplique as probabilidades das duas condições.",
      [
        "Uma moeda justa e uma roleta de 5 setores iguais são acionadas independentemente. Qual é a chance de cara e do setor 1?",
        0.1,
        "1/2 × 1/5 = 1/10.",
      ],
      [
        "Uma caixa tem 3 bolas azuis e 2 brancas. Em dois sorteios independentes, com reposição e chances iguais para cada bola, qual é a chance de duas brancas?",
        0.16,
        "Com reposição, (2/5) × (2/5) = 4/25 = 0,16.",
      ],
    ],
  ],
  paridade: [
    [
      "learn:soma-e-paridade",
      "Some pares e ímpares separadamente.",
      "Cada par de parcelas ímpares produz uma soma par.",
      [
        "Somam-se 7 números ímpares e 4 números pares. A soma é par ou ímpar?",
        "Ímpar",
        "Os sete ímpares deixam um ímpar sem par; os pares não mudam a paridade.",
        ["Par", "Depende dos valores"],
      ],
      [
        "Uma soma de 12 números ímpares é dividida por 2. Qual é o resto?",
        0,
        "Doze ímpares formam seis pares; a soma é par, com resto zero.",
      ],
    ],
    [
      "learn:resto",
      "Retire grupos completos do divisor.",
      "O resto precisa ser não negativo e menor que o divisor.",
      [
        "Noventa e quatro peças são guardadas em caixas de 8. Quantas ficam fora das caixas completas?",
        6,
        "94 = 11 × 8 + 6.",
      ],
      [
        "Um número deixa resto 5 ao dividir por 9. Qual é o resto da divisão por 9 desse número somado a 7?",
        3,
        "5 + 7 = 12; 12 deixa resto 3 por 9.",
      ],
    ],
    [
      "learn:ciclo-de-restos",
      "A sequência retorna ao início depois de um ciclo completo.",
      "Use o resto da posição pelo tamanho do ciclo.",
      [
        "As letras A, B, C, D repetem-se nessa ordem. Qual letra ocupa a posição 23, contando A como a primeira?",
        "C",
        "23 = 5 × 4 + 3; a terceira letra é C.",
        ["A", "D"],
      ],
      [
        "Uma luz alterna vermelho, verde e azul, começando em vermelho. Qual é a cor do 17º sinal?",
        "Verde",
        "17 deixa resto 2 por 3: é a segunda cor.",
        ["Vermelho", "Azul"],
      ],
    ],
  ],
  padroes: [
    [
      "learn:sequencia-aritmetica",
      "Compare termos vizinhos.",
      "Uma diferença constante se repete a cada passo.",
      [
        "Uma sequência começa em 11 e aumenta 6 a cada passo. Qual é o 8º termo?",
        53,
        "Do primeiro ao oitavo há 7 aumentos: 11 + 7 × 6 = 53.",
      ],
      [
        "Um reservatório tem 14 litros e recebe 9 litros por minuto. Quantos litros terá após 5 minutos, sem perdas?",
        59,
        "14 + 5 × 9 = 59.",
      ],
    ],
    [
      "learn:regra-por-posicao",
      "A posição e a quantidade não são a mesma coisa.",
      [
        "Substitua a posição na regra dada.",
        "Iguale a regra à saída informada e desfaça as operações para achar a entrada.",
      ],
      [
        "O número de peças da figura n é 4n + 3. Quantas peças há na figura 12?",
        51,
        "4 × 12 + 3 = 51.",
      ],
      [
        "Uma máquina transforma a entrada n em 3n − 2. Que entrada produz 25?",
        9,
        "3n − 2 = 25: 3n = 27, n = 9.",
      ],
    ],
    [
      "learn:ciclo",
      "Localize o bloco que se repete.",
      "Retire blocos completos para encontrar a posição dentro do bloco.",
      [
        "Repete-se o bloco estrela, lua, lua, sol, sol. Quantas luas aparecem nos primeiros 35 símbolos?",
        14,
        "São 7 blocos de 5, cada um com 2 luas: 14.",
      ],
      [
        "Repete-se A, A, B. Quantas letras A há nas primeiras 20 posições?",
        14,
        "Seis blocos completos dão 12 letras A; as posições 19 e 20 acrescentam duas.",
      ],
    ],
  ],
  logica: [
    [
      "learn:implicacao",
      "Uma regra de mão única não pode ser invertida sem justificativa.",
      "Use apenas o sentido declarado pela regra.",
      [
        "Todo robô azul tem antena. Lume é um robô azul. O que se conclui?",
        "Lume tem antena",
        "Lume satisfaz a condição da regra, então recebe sua conclusão.",
        ["Lume não tem antena", "Nada se pode saber sobre a antena"],
      ],
      [
        "Todo ingresso dourado dá acesso ao jardim. Lia entrou no jardim. Isso garante que seu ingresso era dourado?",
        "Não",
        "A regra garante acesso para dourados, mas não exclui outros acessos.",
        ["Sim", "Garante que era prateado"],
      ],
    ],
    [
      "learn:negacao",
      [
        "Negar 'todos' pede pelo menos uma exceção.",
        "Negar 'existe' exige que nenhum caso satisfaça a propriedade.",
      ],
      [
        "Não confunda uma exceção com a afirmação de que nenhum serve.",
        "Para não existir porta aberta, nenhuma pode estar aberta.",
      ],
      [
        "Qual frase nega 'Todas as caixas estão vazias'?",
        "Alguma caixa não está vazia",
        "Basta existir uma caixa não vazia para a frase universal ser falsa.",
        ["Nenhuma caixa está vazia", "Alguma caixa está vazia"],
      ],
      [
        "Qual frase nega 'Existe uma porta aberta'?",
        "Nenhuma porta está aberta",
        "A existência só é falsa se não houver porta aberta.",
        ["Todas as portas estão abertas", "Alguma porta está fechada"],
      ],
    ],
    [
      "learn:contraexemplo",
      "Uma afirmação sobre todos os casos cai com um caso que falha.",
      "Teste o exemplo na regra completa.",
      [
        "Qual número refuta 'Todo múltiplo de 3 é ímpar'?",
        "12",
        "12 é múltiplo de 3 e é par.",
        ["9", "15"],
      ],
      [
        "Qual par refuta 'A soma de dois primos é sempre par'?",
        "2 e 7",
        "2 e 7 são primos e somam 9, que é ímpar.",
        ["3 e 5", "5 e 11"],
      ],
    ],
  ],
};
