import type { RecoveryBank } from "./types";

export const middleRecovery: RecoveryBank = {
  proporcao: [
    [
      "learn:taxa-unitaria",
      "Encontre a quantidade correspondente a uma unidade.",
      [
        "Divida o total pelo número de unidades antes de ampliar.",
        "Calcule a área coberta por litro e divida a área desejada por esse rendimento.",
      ],
      [
        "Uma impressora mantém ritmo constante e produz 84 páginas em 7 minutos. Quantas páginas produz em 11 minutos?",
        132,
        "84 ÷ 7 = 12 por minuto; 12 × 11 = 132.",
      ],
      [
        "Uma tinta cobre 27 m² com 3 litros, sempre no mesmo rendimento. Quantos litros cobrem 63 m²?",
        7,
        "Cada litro cobre 9 m²; 63 ÷ 9 = 7.",
      ],
    ],
    [
      "learn:proporcao-inversa",
      "Quando o trabalho total é fixo, mais trabalhadores reduzem o tempo.",
      "Conserve o produto entre quantidade de trabalhadores e tempo, com ritmos iguais.",
      [
        "Seis bombas iguais esvaziam um tanque em 14 horas. Nove bombas iguais, no mesmo ritmo e sem entrada de água, levariam quantas horas?",
        28 / 3,
        "O trabalho é 6 × 14 = 84 bomba-horas; 84 ÷ 9 = 28/3 horas.",
      ],
      [
        "Dez pessoas montam kits em 6 horas. Mantendo o trabalho e o ritmo individual, quantas pessoas fariam isso em 4 horas?",
        15,
        "São 60 pessoa-horas; 60 ÷ 4 = 15.",
      ],
    ],
    [
      "learn:partes-proporcionais",
      "Cada peso representa um número de partes iguais.",
      "Some os pesos para achar o valor de uma parte.",
      [
        "Divida R$ 156 entre duas equipes na razão 5:7. Quantos reais recebe a equipe de peso 5?",
        65,
        "12 partes somam 156; cada parte vale 13 e cinco valem 65.",
      ],
      [
        "Uma mistura de 45 litros mantém a razão água:concentrado de 4:1. Quantos litros de água usa?",
        36,
        "Há 5 partes de 9 litros; a água ocupa 4 partes: 36.",
      ],
    ],
  ],
  equacoes: [
    [
      "learn:incognita-nos-dois-lados",
      "Reúna as parcelas com incógnita de um lado.",
      "Faça a mesma operação nos dois membros para preservar a igualdade.",
      ["Um número x satisfaz 7x − 9 = 4x + 18. Qual é x?", 9, "3x = 27, então x = 9."],
      [
        "Duas máquinas devolvem 5x + 8 e 2x + 35. Para qual entrada x as saídas coincidem?",
        9,
        "5x + 8 = 2x + 35 leva a 3x = 27.",
      ],
    ],
    [
      "learn:sistema-em-contexto",
      "Escreva uma igualdade para cada informação independente.",
      "Substitua uma incógnita ou elimine-a por soma e subtração.",
      [
        "Uma caixa tem 18 peças, entre triângulos e quadrados separados. Ao todo há 62 lados. Quantos quadrados há?",
        8,
        "Se todas fossem triângulos, seriam 54 lados; cada quadrado acrescenta 1. Há 8 quadrados.",
      ],
      [
        "Foram vendidos 13 ingressos, de R$ 8 ou R$ 5, arrecadando R$ 86. Quantos eram de R$ 8?",
        7,
        "13 ingressos de 5 dariam 65; faltam 21, equivalentes a 7 diferenças de 3.",
      ],
    ],
    [
      "learn:equacao-com-fracao",
      "A divisão pode ser desfeita por multiplicação.",
      "Multiplique a igualdade pelo denominador e só depois isole x.",
      ["Uma medida x satisfaz (x + 5)/4 = 8. Qual é x?", 27, "x + 5 = 32; x = 27."],
      [
        "Depois de usar um terço de uma fita, sobraram 22 m. Qual era o comprimento inicial, em m?",
        33,
        "Dois terços de x valem 22; x = 22 × 3/2 = 33.",
      ],
    ],
  ],
  semelhanca: [
    [
      "learn:lado-correspondente",
      "Localize os lados que ocupam posições correspondentes.",
      "Use o mesmo fator de escala para todos os comprimentos.",
      [
        "Em dois triângulos semelhantes, um lado de 8 cm corresponde a 20 cm. A que comprimento corresponde um lado de 14 cm do menor? Responda em cm.",
        35,
        "O fator é 20/8 = 2,5; 14 × 2,5 = 35.",
      ],
      [
        "Uma foto de 15 por 21 cm é reduzida para que o lado de 21 cm fique com 14 cm. Qual será o outro lado em cm?",
        10,
        "O fator é 14/21 = 2/3; 15 × 2/3 = 10.",
      ],
    ],
    [
      "learn:area-e-quadrado-da-razao",
      "A escala de área envolve duas dimensões.",
      [
        "Eleve ao quadrado o fator de comprimento.",
        "Extraia a raiz de cada área para achar os lados e divida o maior pelo menor.",
      ],
      [
        "Uma figura de área 28 cm² é ampliada com fator 3 nos comprimentos. Qual é a nova área em cm²?",
        252,
        "A área multiplica por 3² = 9; 28 × 9 = 252.",
      ],
      [
        "As áreas de dois quadrados são 36 e 225 cm². Qual é a razão entre o lado maior e o menor?",
        2.5,
        "Os lados são 6 e 15; 15/6 = 2,5.",
      ],
    ],
    [
      "learn:sombras",
      "Com os mesmos raios de sol e solo plano, altura e sombra mantêm a razão.",
      "Compare altura/sombra nos dois objetos verticais.",
      [
        "No mesmo instante, uma haste vertical de 1,8 m faz sombra de 1,2 m em terreno plano. Uma árvore vertical faz sombra de 7 m. Qual é sua altura em m?",
        10.5,
        "Altura/sombra = 1,5; a árvore mede 1,5 × 7 = 10,5 m.",
      ],
      [
        "Um poste de 9 m faz sombra de 6 m. Nas mesmas condições, qual é a sombra de uma haste vertical de 2 m, em m?",
        4 / 3,
        "A sombra é 6/9 da altura: 2 × 2/3 = 4/3 m.",
      ],
    ],
  ],
  pitagoras: [
    [
      "learn:calcular-hipotenusa",
      "A hipotenusa fica oposta ao ângulo reto.",
      "Some os quadrados dos catetos e tire a raiz quadrada.",
      [
        "Um triângulo retângulo tem catetos de 9 cm e 40 cm. Qual é a hipotenusa em cm?",
        41,
        "9² + 40² = 1.681 = 41².",
      ],
      [
        "Uma placa retangular mede 12 cm por 35 cm. Qual é sua diagonal em cm?",
        37,
        "12² + 35² = 1.369 = 37².",
      ],
    ],
    [
      "learn:calcular-cateto",
      "O lado conhecido maior é a hipotenusa.",
      "Subtraia o quadrado do cateto conhecido do quadrado da hipotenusa.",
      [
        "Uma escada de 29 m apoia-se numa parede vertical; seu pé está a 20 m da parede, no chão horizontal. A que altura chega, em m?",
        21,
        "29² − 20² = 441; a altura é 21.",
      ],
      [
        "Uma diagonal de retângulo mede 25 cm e um lado mede 7 cm. Quanto mede o outro lado em cm?",
        24,
        "25² − 7² = 576 = 24².",
      ],
    ],
    [
      "learn:classificar-triangulo",
      "Compare o maior lado com os outros dois pela relação dos quadrados.",
      "Igualdade indica ângulo reto; soma maior que o quadrado maior indica triângulo acutângulo.",
      [
        "Um triângulo tem lados 10, 24 e 26 cm. Ele é retângulo, acutângulo ou obtusângulo?",
        "Retângulo",
        "10² + 24² = 676 = 26².",
        ["Acutângulo", "Obtusângulo"],
      ],
      [
        "Um triângulo tem lados 7, 8 e 9 cm. Ele é retângulo, acutângulo ou obtusângulo?",
        "Acutângulo",
        "7² + 8² = 113 > 81 = 9², logo todos os ângulos são agudos.",
        ["Retângulo", "Obtusângulo"],
      ],
    ],
  ],
  restos: [
    [
      "learn:quociente-e-resto",
      "Escreva o número como divisor vezes quociente mais resto.",
      "Confira que o resto é menor que o divisor.",
      ["Qual é o resto da divisão de 173 por 12?", 5, "173 = 12 × 14 + 5."],
      [
        "Na divisão por 13, o quociente é 8 e o resto é 9. Qual é o dividendo?",
        113,
        "13 × 8 + 9 = 113.",
      ],
    ],
    [
      "learn:resto-do-produto",
      "Para achar um resto, pode-se substituir cada fator por seu resto.",
      "Multiplique os restos e reduza novamente pelo divisor.",
      [
        "a deixa resto 4 e b deixa resto 5 ao dividir por 7. Qual é o resto de ab por 7?",
        6,
        "4 × 5 = 20, que deixa resto 6 por 7.",
      ],
      [
        "Qual é o resto de 38 × 47 na divisão por 9?",
        4,
        "38 e 47 deixam resto 2 por 9; o produto deixa resto 4.",
      ],
    ],
    [
      "learn:ciclos",
      "Liste alguns termos até o padrão recomeçar.",
      "Use o resto do expoente pelo tamanho do ciclo.",
      [
        "Qual é o algarismo das unidades de 7¹¹?",
        3,
        "As unidades repetem 7, 9, 3, 1. Onze deixa resto 3 por 4: unidade 3.",
      ],
      [
        "Qual é o resto de 2¹⁰ na divisão por 7?",
        2,
        "2, 4, 1 repetem-se; 10 deixa resto 1 por 3, então o resto é 2.",
      ],
    ],
  ],
  "contagem-casos": [
    [
      "learn:contagem-com-restricao",
      "A restrição muda as opções de algumas posições.",
      "Conte separadamente as opções de cada etapa depois de aplicar as restrições.",
      [
        "Com os algarismos 1, 2, 3, 4 e 5, quantos números de dois algarismos distintos são pares?",
        8,
        "A unidade pode ser 2 ou 4; para cada uma restam 4 dezenas: 8.",
      ],
      [
        "Cinco pessoas diferentes disputam presidente e vice. Ana não pode ser presidente. Quantas duplas com cargos são possíveis?",
        16,
        "Há 4 presidentes possíveis e, escolhido um, 4 vices: 16.",
      ],
    ],
    [
      "learn:casos-com-sobreposicao",
      "Somar grupos pode contar a interseção duas vezes.",
      "Subtraia uma vez o que está em ambos os grupos.",
      [
        "Dos estudantes, 18 leem quadrinhos, 15 leem poemas e 6 leem ambos. Quantos leem ao menos um desses tipos?",
        27,
        "18 + 15 − 6 = 27.",
      ],
      [
        "Entre 1 e 50, incluindo extremos, quantos inteiros são múltiplos de 4 ou de 6?",
        16,
        "Há 12 múltiplos de 4, 8 de 6 e 4 de 12: 12 + 8 − 4 = 16.",
      ],
    ],
    [
      "learn:anagramas",
      "Trocar letras iguais entre si não produz uma nova palavra.",
      "Divida as permutações pelo número de repetições internas de cada letra.",
      [
        "Quantos anagramas distintos tem a palavra ARARA, incluindo arranjos sem significado?",
        10,
        "5!/(3! × 2!) = 10.",
      ],
      [
        "Quantas filas diferentes podem ser feitas com três fichas azuis idênticas e duas fichas verdes idênticas?",
        10,
        "Escolhem-se as duas posições verdes entre cinco: 5 × 4/2 = 10.",
      ],
    ],
  ],
  invariantes: [
    [
      "learn:soma-invariante",
      "Compare a soma antes e depois de uma jogada.",
      "O que sai de uma caixa entra integralmente na outra.",
      [
        "Duas caixas começam com 17 e 26 fichas. Cada movimento transfere fichas de uma à outra sem perder nenhuma. Se uma termina com 30, quantas ficam na outra?",
        13,
        "A soma conserva-se em 43; 43 − 30 = 13.",
      ],
      [
        "Três montes têm 8, 12 e 19 pedras. Só se transferem pedras entre montes. É possível terminar com 13 em cada?",
        "Sim",
        "A soma é 39; transfira 5 do monte de 19 para o de 8 e mais 1 para o de 12.",
        ["Não, a soma seria diferente", "Não, a paridade impede"],
      ],
    ],
    [
      "learn:paridade-invariante",
      "Veja se cada movimento altera a quantidade em número par ou ímpar.",
      "Somar ou retirar dois preserva a paridade.",
      [
        "Um marcador começa em 14 e só pode somar ou subtrair 2. Pode chegar a 37?",
        "Não",
        "Parte de um par e mantém a paridade; 37 é ímpar.",
        ["Sim, em 12 passos", "Sim, em 23 passos"],
      ],
      [
        "Uma caixa tem 23 fichas. Cada retirada remove exatamente 2. Qual é o menor número de fichas que pode restar?",
        1,
        "Retirar pares de uma quantidade ímpar deixa pelo menos uma ficha.",
      ],
    ],
    [
      "learn:coloracao-xadrez",
      "Cada dominó em um tabuleiro xadrez cobre cores diferentes.",
      "Para uma cobertura completa, as duas cores precisam ter a mesma quantidade.",
      [
        "Um tabuleiro xadrez 6 × 6 perde dois cantos da mesma cor. É possível cobrir o restante com dominós 1 × 2 sem sobrepor?",
        "Não",
        "Havia 18 casas de cada cor; restam 16 de uma e 18 da outra. Cada dominó exige uma de cada.",
        ["Sim, pois restam 34 casas", "Sim, usando 18 dominós"],
      ],
      [
        "Uma região usa a coloração de um tabuleiro xadrez e tem 17 casas pretas e 15 brancas. Qual é o maior número de casas descobertas que apenas a diferença entre as cores garante numa cobertura parcial com dominós 1 × 2?",
        2,
        "Cada dominó consome uma de cada cor; no máximo 15 dominós cobrem 30 casas, sobrando pelo menos 2. A forma da região pode impor ainda mais sobras.",
      ],
    ],
  ],
  coordenadas: [
    [
      "learn:deslocamento",
      "Trate as coordenadas horizontal e vertical separadamente.",
      ["Direita aumenta x; esquerda diminui x.", "Para baixo diminui y; mantenha a coordenada x."],
      [
        "Um ponto começa em (−3, 4) e anda 11 unidades à direita. Qual é sua nova coordenada x?",
        8,
        "−3 + 11 = 8; y continua 4.",
      ],
      [
        "Um ponto sai de (6, −2) e anda 7 unidades para baixo. Qual é sua nova coordenada y?",
        -9,
        "−2 − 7 = −9.",
      ],
    ],
    [
      "learn:ponto-medio",
      "O ponto médio fica à mesma distância das extremidades.",
      "Calcule a média das coordenadas correspondentes.",
      [
        "A e B têm coordenadas (−7, 2) e (5, 8). Qual é a coordenada x do ponto médio?",
        -1,
        "(−7 + 5)/2 = −1.",
      ],
      [
        "O ponto médio entre (2, −4) e (8, y) tem coordenada vertical 3. Qual é y?",
        10,
        "(−4 + y)/2 = 3 leva a y = 10.",
      ],
    ],
    [
      "learn:area-na-malha",
      "Identifique base e altura na malha.",
      "Subtraia coordenadas para obter comprimentos.",
      [
        "Um retângulo tem vértices (−2, 1), (5, 1), (5, 6) e (−2, 6). Qual é sua área?",
        35,
        "Base 7 e altura 5 dão área 35.",
      ],
      [
        "Um triângulo tem vértices (1, 2), (9, 2) e (1, 7). Qual é sua área?",
        20,
        "Base 8, altura 5; área 8 × 5/2 = 20.",
      ],
    ],
  ],
  "logica-n2": [
    [
      "learn:encadear-implicacoes",
      "Use cada conclusão como possível condição da próxima regra.",
      "Não troque uma implicação pela sua inversa.",
      [
        "Todo medalhista treinou. Todo participante que treinou registrou um diário. Nilo é medalhista e participante. O que segue?",
        "Nilo registrou um diário",
        "Medalhista implica treinamento; sendo participante que treinou, Nilo registrou o diário.",
        ["Todo diário é de medalhista", "Nilo não registrou diário"],
      ],
      [
        "Se a chave está ativa, a porta abre. Se a porta abre, a luz acende. A luz não acendeu. O que se conclui?",
        "A chave não estava ativa",
        "Uma chave ativa levaria à luz acesa, contrário ao observado.",
        ["A chave estava ativa", "A porta abriu mesmo assim"],
      ],
    ],
    [
      "learn:quantificadores",
      "Distinga 'todos' de 'existe'.",
      [
        "Para negar uma existência, é preciso excluir todos os casos.",
        "Para negar 'todo', basta existir um livro que não tenha a propriedade.",
      ],
      [
        "Qual frase nega 'Algum aluno resolveu os dois problemas'?",
        "Nenhum aluno resolveu os dois",
        "Cada aluno deve ter deixado pelo menos um dos dois problemas sem resolver.",
        ["Todos resolveram os dois", "Algum aluno não resolveu os dois"],
      ],
      [
        "Qual frase nega 'Todo livro da estante tem capa azul'?",
        "Existe livro da estante sem capa azul",
        "Uma única exceção já nega a afirmação sobre todos.",
        ["Nenhum livro tem capa azul", "Existe livro com capa azul"],
      ],
    ],
    [
      "learn:contraexemplo",
      "Teste um caso que satisfaz a condição e falha na conclusão.",
      "Um caso que não satisfaz a condição não refuta a regra.",
      [
        "Qual número refuta 'Se n é ímpar, então n é primo'?",
        "21",
        "21 é ímpar, mas 21 = 3 × 7 não é primo.",
        ["13", "2"],
      ],
      [
        "Qual inteiro refuta 'Se n² é maior que 16, então n é maior que 4'?",
        "−5",
        "(−5)² = 25 > 16, mas −5 não é maior que 4.",
        ["5", "3"],
      ],
    ],
  ],
};
