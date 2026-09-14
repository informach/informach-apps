// Each pair corresponds to the two authored distractors in that activity.
// Feedback addresses the selected reasoning error before showing the solution.
export const errorFeedback: Record<string, string[][]> = {
  "fracoes-1": [
    [
      "6 é a quantidade de partes, não a medida de cada uma.",
      "Subtrair a quantidade de partes não divide a fita igualmente.",
    ],
    [
      "3 é a quantidade já colorida; a pergunta pede o que falta.",
      "8 inclui as faixas que já foram coloridas.",
    ],
    [
      "4 é o número de grupos; cada grupo pode ter outra quantidade de pedras.",
      "Retirar quatro pedras não encontra um quarto da coleção.",
    ],
    [
      "6 km correspondem a um terço, e foram percorridos dois terços.",
      "Subtrair o numerador do total não calcula uma fração.",
    ],
    [
      "100 mL seriam um terço da capacidade, não metade.",
      "300 mL é a capacidade total; parte dela já está ocupada.",
    ],
    [
      "7 m é a medida de apenas um pedaço.",
      "A medida precisa ser múltipla da medida de um dos quatro pedaços iguais.",
    ],
  ],
  "fracoes-2": [
    [
      "10 é um quarto de 40, mas as frações usam inteiros diferentes.",
      "40 é o primeiro inteiro, não sua metade.",
    ],
    [
      "6 é a diferença entre os inteiros, não entre as partes pintadas.",
      "9 é a quantidade pintada na segunda barra, antes de comparar.",
    ],
    [
      "Um inteiro de 24 faria cada quinto valer 4,8, e três quintos não seriam 18.",
      "Um inteiro de 60 faria cada quinto valer 12 e três quintos valerem 36, não 18.",
    ],
    [
      "Um quarto é cada retirada; foram feitas duas retiradas.",
      "Três quartos restariam depois de apenas uma retirada.",
    ],
    [
      "Um numerador maior não garante uma fração maior quando os denominadores mudam.",
      "As frações diferem quando representadas em quinze partes iguais.",
    ],
    [
      "36 é três quartos de 48; porém 48 já representa três quartos.",
      "O inteiro precisa ter quatro partes iguais à terça parte de 48.",
    ],
  ],
  "porcentagem-1": [
    [
      "25 é a porcentagem, não o desconto em reais.",
      "120 reais é o preço depois do desconto, não o desconto pedido.",
    ],
    [
      "30 é a quantidade de ingressos, não a porcentagem do total.",
      "40% de 120 não corresponde aos 30 ingressos vendidos.",
    ],
    [
      "7 reais é apenas o aumento; ainda existe o preço inicial.",
      "Somar 10 reais confunde uma taxa percentual com um valor fixo.",
    ],
    [
      "15 é a taxa em cada cem; a turma tem apenas quarenta estudantes.",
      "Subtrair a porcentagem do total mistura unidades diferentes.",
    ],
    [
      "Dividir 45 por dois reduziria novamente um preço já reduzido.",
      "Somar cinquenta reais trata 50% como uma quantia fixa.",
    ],
    [
      "25% é a parte que escolheu xadrez, não outra atividade.",
      "60 é a quantidade de participantes restantes; ainda falta expressá-la em porcentagem.",
    ],
  ],
  "porcentagem-2": [
    [
      "160 resultaria de descontar 20% do preço original. O segundo desconto tem outra base.",
      "180 é o preço intermediário, antes do segundo desconto.",
    ],
    [
      "Aumentar e reduzir a mesma porcentagem não se anulam quando a base muda.",
      "40 seria reduzir 20% do valor inicial, ignorando o crescimento.",
    ],
    [
      "Na primeira loja o desconto percentual vale menos que vinte reais.",
      "20% de noventa não equivale a vinte reais.",
    ],
    [
      "15 é a diferença em reais; uma taxa compara essa diferença ao preço inicial.",
      "20% usa o preço final como base. O aumento se mede em relação ao inicial.",
    ],
    [
      "Somar 20% a 96 não desfaz um desconto de 20% sobre outra base.",
      "Acrescentar vinte reais confunde percentual com valor fixo.",
    ],
    [
      "92 viria de aplicar 15% sobre o preço inicial, somando taxas de bases diferentes.",
      "O desconto final deve incidir sobre o valor aumentado, que já é cem.",
    ],
  ],
  "precos-1": [
    [
      "4 conta os cadernos; não indica o preço de cada um.",
      "Subtrair quatro do preço não o reparte entre as unidades.",
    ],
    [
      "A custa menos por caixa, mas contém menos lápis.",
      "Os preços por lápis são diferentes após dividir cada preço pela quantidade.",
    ],
    [
      "Somar dois reais por dois sucos adicionais não mantém o preço unitário.",
      "36 corresponde a seis sucos pelo mesmo preço unitário.",
    ],
    [
      "Um pacote de seis pilhas não atende à necessidade de oito.",
      "Uma embalagem de cada atende, mas não é a opção de menor gasto.",
    ],
    [
      "5 compara apenas os preços dos produtos e ignora o frete.",
      "8 é o frete, mas os preços dos produtos também diferem.",
    ],
    [
      "6 compra apenas meio litro na embalagem menor.",
      "20 compra dois litros na embalagem maior; a comparação pede um litro.",
    ],
  ],
  "precos-2": [
    [
      "3 é a quantidade de canetas, não a economia.",
      "4 é o preço de uma caneta avulsa, não a diferença entre as ofertas.",
    ],
    [
      "6 é o custo médio por unidade recebida, não o total das três.",
      "27 seria o preço de três unidades sem promoção.",
    ],
    [
      "Dois pacotes fornecem apenas dez folhas.",
      "22,40 pressupõe comprar uma fração de pacote, o que não foi permitido.",
    ],
    [
      "O pacote inclui capacidade para quatro, mas só três pessoas irão.",
      "Os totais são diferentes quando calculados para três pessoas.",
    ],
    [
      "7 é o preço de uma caixa, não a economia ao comprar duas.",
      "8 compara uma caixa com o saco, que tem o dobro da quantidade.",
    ],
    [
      "58 aplica o desconto à cesta antiga, que ainda não atinge o mínimo.",
      "O item adicional custa quinze reais e precisa entrar no novo total.",
    ],
  ],
  "orcamento-1": [
    [
      "Confira a subtração com empréstimo entre dezenas e unidades.",
      "405 soma a arrecadação ao gasto; uma saída diminui o saldo.",
    ],
    [
      "90 inclui dinheiro que já tem destino no transporte.",
      "Somar a reserva aumenta artificialmente o dinheiro disponível.",
    ],
    [
      "Duas semanas arrecadam setenta reais, menos do que falta.",
      "Quatro semanas bastam, mas a meta já é atingida antes.",
    ],
    [
      "14 soma meses e reais, duas unidades diferentes.",
      "96 corresponde a doze cobranças; a pergunta pede seis.",
    ],
    [
      "38 considera somente os materiais e esquece o transporte.",
      "25 é uma despesa já definida, não a quantia restante.",
    ],
    [
      "135 não corresponde à diferença entre a entrada e o conserto.",
      "185 soma o conserto como se ele fosse uma entrada.",
    ],
  ],
  "orcamento-2": [
    [
      "18 é a mensalidade; a economia exige comparar doze pagamentos com o anual.",
      "Confira a diferença depois de obter o custo das doze mensalidades.",
    ],
    [
      "40 é uma parcela, não o acréscimo total do parcelamento.",
      "110 compara o preço à vista com apenas uma parcela.",
    ],
    [
      "6 multiplica a taxa pelos meses, mas ainda não calcula o rendimento em reais.",
      "212 é o saldo final, com o capital inicial incluído.",
    ],
    [
      "20 soma reais e semanas, em vez de repetir o depósito.",
      "84 corresponde a sete depósitos, e foram previstos oito.",
    ],
    [
      "Sobrar dinheiro não basta: ele precisa atingir os cento e oitenta reais mínimos.",
      "A insuficiência deve ser comparada ao mínimo, não a outra parte da reserva.",
    ],
    [
      "200 conta as entradas e esquece as saídas.",
      "140 é o total gasto; a pergunta pede o saldo que permanece.",
    ],
  ],
  "medidas-1": [
    [
      "20 é o contorno do retângulo, medido em cm, não a área.",
      "10 soma dois lados, sem contar a superfície coberta.",
    ],
    ["24 é a área; o perímetro percorre a borda.", "10 soma apenas dois dos quatro lados."],
    [
      "12 conta os lados internos compartilhados como se fossem externos.",
      "6 conta somente os dois lados compridos e esquece as pontas.",
    ],
    [
      "14 reparte o perímetro em apenas dois lados, mas o quadrado tem quatro.",
      "4 é a quantidade de lados, não a medida de cada um.",
    ],
    [
      "24 é o contorno em lados de ladrilhos, não a quantidade que cobre o piso.",
      "12 soma fileiras e colunas em vez de contar todas as posições.",
    ],
    [
      "16 soma dois contornos completos e inclui o lado compartilhado duas vezes.",
      "8 é o perímetro de um quadrado sozinho; a figura formada é maior.",
    ],
  ],
  "medidas-2": [
    [
      "16 era a área antes de retirar a peça.",
      "12 não corresponde à retirada de um único quadradinho.",
    ],
    [
      "14 retira os lados que somem sem acrescentar os novos expostos.",
      "18 seria o caso de um recorte na borda fora do canto.",
    ],
    [
      "16 é o perímetro anterior; o recorte expõe mais lados do que retira.",
      "14 supõe que retirar uma peça sempre diminui o contorno.",
    ],
    [
      "O retângulo mais comprido tem contorno maior neste caso.",
      "A igualdade das áreas não garante igualdade de perímetros.",
    ],
    [
      "Dobrar só uma dimensão dobraria a área; aqui ambas dobram.",
      "3 é a medida inicial do lado, não o fator de crescimento da área.",
    ],
    [
      "20 é o contorno externo, não a área da moldura.",
      "25 inclui os quadradinhos do vazio central.",
    ],
  ],
  "simetria-1": [
    [
      "6 é a distância entre ponto e imagem, não de cada um até o eixo.",
      "A reflexão só deixa parado um ponto que já esteja no eixo.",
    ],
    [
      "3 cobre apenas a distância de um dos pontos até o eixo.",
      "Não há três trechos de três entre o ponto e sua imagem.",
    ],
    [
      "2 esquece os eixos pelas diagonais.",
      "Contar cada eixo em dois sentidos duplica a mesma linha.",
    ],
    [
      "4 incluiria as diagonais, que não são eixos deste retângulo não quadrado.",
      "As duas linhas pelas metades dos lados ainda produzem sobreposição.",
    ],
    [
      "Direita corresponde a um quarto de volta no sentido horário, não meia-volta.",
      "Apontar para cima exigiria uma volta inteira ou nenhuma rotação.",
    ],
    [
      "Espelhar uma figura não duplica sua área; a pergunta é sobre a imagem.",
      "A reflexão não retira quadradinhos da peça.",
    ],
  ],
  "simetria-2": [
    [
      "3 é a diferença entre cinco e dois, mas o movimento é para a direita.",
      "Multiplicar posição pelo deslocamento não representa uma translação.",
    ],
    [
      "Cima seria um quarto de volta no sentido anti-horário.",
      "Esquerda exige meia-volta a partir da direita.",
    ],
    [
      "Qualquer deslocamento afastaria o ponto do eixo onde ele já está.",
      "Duas vezes a distância ao eixo continua zero quando o ponto está no eixo.",
    ],
    [
      "Meia-volta soma apenas dois quartos.",
      "Um quarto representa uma das quatro rotações, não o total.",
    ],
    [
      "Os pontos não se afastam em sentidos opostos; ambos recebem o mesmo deslocamento.",
      "A translação não funde dois pontos distintos.",
    ],
    [
      "A posição à esquerda é apenas o resultado da primeira reflexão.",
      "Refletir não transporta o ponto para o eixo; preserva sua distância.",
    ],
  ],
  "contagem-1": [
    [
      "Somar cores e fechos não forma as combinações de uma escolha de cada tipo.",
      "Não há três fechos para cada cor; existem apenas dois.",
    ],
    [
      "Multiplicar corresponderia a escolher uma bebida de cada tipo, mas é só uma bebida.",
      "4 conta os sucos e deixa de fora os chás.",
    ],
    [
      "Somar caminhos não combina a primeira etapa com a segunda.",
      "4 conta apenas a última etapa, sem distinguir o caminho inicial.",
    ],
    [
      "9 permite repetir o algarismo, contrariando a regra.",
      "3 conta apenas a primeira posição e esquece as opções para a segunda.",
    ],
    [
      "12 conta o mesmo cumprimento nos dois sentidos.",
      "4 conta pessoas; cumprimentos correspondem a pares de pessoas.",
    ],
    [
      "5 soma as opções, mas cada senha combina uma letra e um algarismo.",
      "Existem três algarismos permitidos, não quatro.",
    ],
  ],
  "contagem-2": [
    [
      "9 inclui os três códigos com letras iguais, que são proibidos aqui.",
      "3 conta os códigos com repetição; a pergunta pede os diferentes.",
    ],
    [
      "20 distingue as duas ordens de uma mesma dupla, mas a ordem não importa.",
      "25 permite repetir sabor e também conta as ordens separadamente.",
    ],
    [
      "3 decide apenas qual livro vem primeiro, sem ordenar os dois restantes.",
      "9 não retira da escolha os livros que já foram colocados.",
    ],
    [
      "14 conta duas vezes os números divisíveis por dois e por cinco.",
      "10 conta só os múltiplos de dois; ainda existem múltiplos ímpares de cinco.",
    ],
    [
      "6 trata os dois passos para a direita como se fossem diferentes.",
      "2 não contempla todas as posições possíveis do passo para cima.",
    ],
    [
      "12 permite começar por zero, o que não forma um número de dois algarismos.",
      "6 exclui o zero também da unidade, onde ele é permitido.",
    ],
  ],
  "gavetas-1": [
    [
      "Pode haver caixas vazias; a regra não exige distribuir uma peça em cada caixa.",
      "Juntar as cinco em uma caixa é possível, mas não obrigatório.",
    ],
    [
      "Doze pessoas podem nascer em doze meses distintos, sem repetir.",
      "Vinte e quatro bastam, mas não são o menor número que garante a repetição.",
    ],
    [
      "Nove peças podem ser distribuídas três de cada cor, sem chegar a quatro.",
      "Doze bastam, mas é possível garantir quatro de uma cor com menos peças.",
    ],
    [
      "Duas são garantidas, mas o total força um limite mínimo mais forte.",
      "Quatro não são garantidas: a distribuição 3, 2, 2 é possível.",
    ],
    [
      "As duas primeiras meias podem ter cores diferentes.",
      "Quatro bastam, mas uma retirada a menos já garante a dupla.",
    ],
    [
      "Somar caixas e capacidade não calcula a capacidade total.",
      "Dezesseis exigiriam quatro em cada caixa, acima do limite.",
    ],
  ],
  "gavetas-2": [
    [
      "Quatro escolhas podem pegar um cartão de cada par sem completar nenhum.",
      "Oito bastam, mas o problema pede o menor número suficiente.",
    ],
    [
      "Três números podem ocupar os três restos distintos.",
      "Seis bastam, mas o menor número suficiente é menor.",
    ],
    [
      "Esse conjunto contém um e dez, que somam onze.",
      "Esse conjunto contém dois e nove, que somam onze.",
    ],
    [
      "Quatro são garantidos, mas nove números em dois grupos forçam uma garantia mais forte.",
      "Todos podem ter a mesma paridade, mas isso não é obrigatório.",
    ],
    [
      "Dez livros podem ficar dois em cada prateleira.",
      "Quinze bastam, mas não são o menor número suficiente.",
    ],
    [
      "Cinco ainda permitem acrescentar um cartão de um par não escolhido.",
      "Sete cartões em seis pares necessariamente completam um par.",
    ],
  ],
  "probabilidade-1": [
    [
      "O denominador precisa contar todas as fichas, não apenas as amarelas.",
      "2/5 é a chance de amarela, não de verde.",
    ],
    [
      "Há três faces pares entre seis; não apenas duas faces favoráveis.",
      "2/3 exigiria quatro faces favoráveis, e existem três.",
    ],
    [
      "1/6 seria a chance de uma face existente; não há face maior que seis.",
      "1 significa certeza, mas o evento descrito é impossível.",
    ],
    [
      "Zero indicaria impossibilidade, e todas as bolas são azuis.",
      "Metade exigiria bolas de outra cor, ausentes nesta caixa.",
    ],
    [
      "1/4 é a chance de ganhar; a pergunta pede o evento contrário.",
      "Metade dos setores seriam quatro; seis não dão prêmio.",
    ],
    [
      "B tem mais fichas vermelhas, mas uma proporção menor delas.",
      "As frações diferem quando escritas com denominador oito.",
    ],
  ],
  "probabilidade-2": [
    [
      "2 são os resultados de um lançamento; dois lançamentos formam sequências.",
      "3 reúne cara-coroa e coroa-cara como se a ordem não importasse.",
    ],
    [
      "1/2 é a chance de uma cara em um lançamento, não duas em dois.",
      "3/4 é a chance de pelo menos uma cara, não de duas.",
    ],
    [
      "1/4 é a chance de nenhuma cara ou de duas caras, eventos diferentes do pedido.",
      "1/2 conta as sequências com exatamente uma cara e esquece duas caras.",
    ],
    [
      "1/3 mantém o total antigo, ignorando que uma ficha não voltou.",
      "2/3 usa a quantidade antiga de azuis e responde sobre outra cor.",
    ],
    ["1/2 seria o caso sem reposição da ficha azul.", "2/3 é a chance de azul, não de vermelha."],
    [
      "Resultados anteriores não aumentam a chance de uma face em jogadas independentes.",
      "O seis continua possível; o dado não evita repetições para compensar.",
    ],
  ],
  "paridade-1": [
    [
      "As duas sobras dos ímpares formam um novo par.",
      "A paridade da soma é determinada pelas paridades das parcelas, mesmo sem conhecer seus valores.",
    ],
    [
      "Dezesseis duplas exigiriam trinta e duas peças, uma a mais que o disponível.",
      "Quatorze duplas ainda deixam peças suficientes para formar outra.",
    ],
    [
      "O fator par garante um fator dois no produto.",
      "Nem um fator ímpar elimina o fator dois já presente.",
    ],
    [
      "Dois ímpares somam um par, mas ainda falta acrescentar o terceiro ímpar.",
      "A paridade é determinada pela quantidade de parcelas ímpares.",
    ],
    [
      "Oito contaria zero ou dezesseis, ambos fora do intervalo dado.",
      "Quinze conta todos os números, incluindo os ímpares.",
    ],
    [
      "Seis saltos levam de quatro a dezesseis, que não é dezessete.",
      "Sete saltos levam de quatro a dezoito, saltando por cima de dezessete.",
    ],
  ],
  "paridade-2": [
    ["Cinco retiradas deixam duas fichas, não uma.", "Seis retiradas deixam zero fichas, não uma."],
    [
      "Confira a diferença entre trinta e oito e o múltiplo de cinco anterior.",
      "Sete é o quociente inteiro; o resto é o que não entra nos grupos.",
    ],
    [
      "As duas sobras de um não completam um grupo de três.",
      "Somar os números também soma as duas sobras, não apenas uma.",
    ],
    [
      "Vinte e um deixa resto zero, diferente do resto da sequência.",
      "Vinte e dois deixa resto um, diferente do resto da sequência.",
    ],
    [
      "Três parcelas ímpares deixam uma sobra ímpar no total.",
      "Conhecemos todas as parcelas e também suas paridades.",
    ],
    [
      "Sete peças cobrem quatorze quadradinhos e deixam um vazio.",
      "Oito peças cobrem dezesseis, mais do que a área disponível sem sobreposição.",
    ],
  ],
  "padroes-1": [
    [
      "Dezenove é o sexto termo; do primeiro ao quinto há só quatro aumentos.",
      "Multiplicar cinco por três ignora o valor inicial da sequência.",
    ],
    [
      "Somar dois não é o mesmo que dobrar.",
      "Multiplicar treze por ele mesmo calcula o quadrado, não o dobro.",
    ],
    [
      "Azul ocupa a primeira posição de cada ciclo; oito deixa resto dois.",
      "Amarelo ocupa posições múltiplas de três.",
    ],
    [
      "Vinte trata os cinco quadrados como separados, sem lados compartilhados.",
      "Quinze usa três palitos desde o primeiro, que precisa de quatro.",
    ],
    [
      "Oito é o terceiro termo; ainda falta uma duplicação.",
      "Trinta e dois é o quinto termo; houve uma duplicação a mais.",
    ],
    [
      "Somar cinco de novo não desfaz a operação da máquina.",
      "Multiplicar por cinco não desfaz uma soma de cinco.",
    ],
  ],
  "padroes-2": [
    [
      "Vinte calcula apenas duas vezes a posição, sem acrescentar um.",
      "Vinte e três corresponde à posição onze, não dez.",
    ],
    [
      "Onze produziria trinta e quatro palitos pela regra dada.",
      "Nove produziria vinte e oito palitos, abaixo da quantidade dada.",
    ],
    [
      "Nove aparece nas posições pares; cento e um é ímpar.",
      "Cento e um é a posição, não o valor do termo.",
    ],
    [
      "Oitenta multiplica a posição por quatro e ignora o início em três.",
      "Oitenta e três conta vinte aumentos após a figura inicial, um a mais.",
    ],
    [
      "Cinquenta supõe que cada par soma dez, mas os extremos somam onze.",
      "Cento e dez conta cada par duas vezes; a fórmula divide por dois.",
    ],
    [
      "Um é o aumento da posição, não o aumento dos quadrados.",
      "Cinco é a posição final, não a diferença entre os termos.",
    ],
  ],
  "logica-1": [
    [
      "Inverter a regra não é válido: outras formas também podem ser azuis.",
      "A regra não informa quantas peças azuis existem.",
    ],
    [
      "Nilo chegou depois de Lia, então não pode ter sido o primeiro dos três.",
      "Omar chegou depois de Nilo e, portanto, depois de Lia.",
    ],
    [
      "Quinze é múltiplo de três, mas não é menor que quinze.",
      "Nove é múltiplo de três, mas não é maior que dez.",
    ],
    [
      "O enunciado define estados exclusivos; o botão não pode ocupar os dois.",
      "Com apenas dois estados possíveis, excluir um determina o outro.",
    ],
    [
      "Um cartão vermelho teria de ser par, contradizendo a informação dada.",
      "O tamanho do número não muda a regra que exige paridade.",
    ],
    [
      "Quatro é a quantidade de círculos, não de triângulos.",
      "Treze soma uma parte ao total, contando círculos novamente.",
    ],
  ],
  "logica-2": [
    [
      "Três é ímpar e primo, então confirma um caso em vez de refutar a frase.",
      "Cinco também é ímpar e primo; não funciona como contraexemplo.",
    ],
    [
      "Três testes cobrem só três casos, não todos os inteiros.",
      "Números grandes também são casos particulares; seu tamanho não torna o teste uma prova.",
    ],
    [
      "Quatro e oito mostram dois casos; não justificam todos os múltiplos.",
      "Dez exemplos ainda deixam infinitos múltiplos sem justificativa.",
    ],
    [
      "As duas fechadas contradiriam a exigência de exatamente uma aberta.",
      "A já foi informada como fechada; não é uma possibilidade em aberto.",
    ],
    [
      "Chuva obrigaria a quadra a estar fechada, contrariando o observado.",
      "A regra não relaciona a quadra à temperatura.",
    ],
    [
      "Esse par apenas gira o mesmo retângulo e mantém também seu perímetro.",
      "Trocar a ordem dos lados não produz perímetros diferentes.",
    ],
  ],
};
