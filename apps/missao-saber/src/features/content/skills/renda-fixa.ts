import { c, n, type SkillPack } from "../skill-factory";

/**
 * Renda fixa: remuneração prefixada, pós-fixada e atrelada à inflação,
 * prazo e liquidez, impostos e taxas, garantias e risco de crédito.
 * Trilha OLITEF N3. Todos os produtos e taxas são hipotéticos.
 */
export const rendaFixa: SkillPack = {
  id: "renda-fixa",
  name: "Renda fixa",
  domain: "olitef",
  lab: "bars",
  missions: [
    {
      title: "Como a renda fixa remunera",
      objective: "Distinguir remuneração prefixada, pós-fixada e atrelada à inflação.",
      introduction:
        "Na renda fixa, as regras da remuneração são conhecidas na aplicação. Prefixada: a taxa é definida no início (por exemplo, 11% ao ano). Pós-fixada: acompanha um indicador de juros ao longo do tempo. Atrelada à inflação: paga a inflação do período mais uma taxa. Renda fixa não quer dizer rendimento garantido nem risco zero.",
      specs: [
        n(
          "remuneracao",
          "Uma aplicação prefixada rende 10% ao ano. Quanto valem R$ 3.000 depois de 1 ano, antes de impostos, em reais?",
          3300,
          "3.000 × 1,1 = 3.300.",
          {
            misreads: [
              { value: 300, feedback: "300 é o rendimento; o valor final soma o capital." },
            ],
          },
        ),
        c(
          "remuneracao",
          "Numa aplicação pós-fixada, o rendimento:",
          "Acompanha um indicador de juros ao longo do período",
          ["É definido no início e não muda até o vencimento", "Depende só do valor aplicado"],
          "A regra é conhecida; o valor depende do indicador.",
          {
            feedback: [
              "Isso descreve a prefixada.",
              "O valor aplicado não define a taxa; o indicador, sim.",
            ],
          },
        ),
        n(
          "remuneracao",
          "Um título paga a inflação mais 5% ao ano. Num ano com inflação de 4%, qual é o rendimento total aproximado, somando as duas partes, em porcentagem?",
          9,
          "Aproximadamente 4% + 5% = 9% (o cálculo exato multiplica os fatores: 1,04 × 1,05 = 1,092).",
          {
            misreads: [
              { value: 5, feedback: "5% é só a parte além da inflação." },
              {
                value: 9.2,
                feedback: "9,2% é o cálculo exato; aqui o enunciado pede a soma aproximada.",
              },
            ],
          },
        ),
        c(
          "remuneracao",
          "No item anterior, o cálculo exato do rendimento total é:",
          "9,2%, porque 1,04 × 1,05 = 1,092",
          ["9%, porque 4% + 5% = 9%", "109,2%, que é o fator acumulado"],
          "Os fatores se multiplicam: 1,092 significa 9,2% a mais.",
          {
            feedback: [
              "9% é a aproximação por soma; o cálculo exato multiplica os fatores.",
              "109,2% é o fator em porcentagem; a taxa é só o que passa de 100%.",
            ],
          },
        ),
        n(
          "remuneracao",
          "Uma aplicação pós-fixada rende 100% de um indicador que ficou em 12% no ano. Quanto rendem R$ 5.000 no ano, antes de impostos, em reais?",
          600,
          "12% de 5.000 = 600.",
          { misreads: [{ value: 5600, feedback: "5.600 é o valor final, não o rendimento." }] },
        ),
        c(
          "remuneracao",
          "Uma aplicação paga 90% de um indicador. Se o indicador for 10% no ano, ela rende:",
          "9% no ano",
          ["10% no ano", "90% no ano"],
          "90% de 10% = 9%.",
          {
            feedback: [
              "Ela paga só 90% do indicador.",
              "90% é a fração do indicador, não o rendimento.",
            ],
          },
        ),
        n(
          "remuneracao",
          "Um título prefixado, com juros compostos, promete pagar R$ 1.210 daqui a 2 anos a quem aplicar R$ 1.000 hoje. Qual é a taxa anual, em porcentagem?",
          10,
          "1.210/1.000 = 1,21 = 1,1².",
          {
            misreads: [
              {
                value: 10.5,
                feedback:
                  "10,5% divide o rendimento de 21% por 2; com juros compostos a taxa é 10%.",
              },
            ],
          },
        ),
        c(
          "remuneracao",
          "Por que 'renda fixa' não significa 'rendimento garantido'?",
          "Porque o emissor pode não pagar e vender antes do prazo pode dar prejuízo",
          [
            "Porque o banco pode mudar a taxa combinada a qualquer momento",
            "Porque o imposto pode consumir todo o rendimento",
          ],
          "O nome se refere à regra de remuneração, não à ausência de risco.",
          {
            feedback: [
              "A regra de remuneração é definida na aplicação; o banco não muda a taxa combinada.",
              "O imposto reduz o rendimento, mas incide só sobre o ganho e não o elimina.",
            ],
          },
        ),
      ],
    },
    {
      title: "Prazo e liquidez",
      objective:
        "Relacionar prazo, carência e liquidez com a escolha de uma aplicação para um objetivo.",
      introduction:
        "Liquidez é a facilidade de transformar a aplicação em dinheiro sem perda. Algumas aplicações têm carência (não podem ser resgatadas antes de certo prazo) ou pagam menos se resgatadas antes. O prazo da aplicação deve combinar com o prazo do objetivo.",
      specs: [
        c(
          "liquidez",
          "Para uma reserva de emergência, a característica mais importante é:",
          "Liquidez alta e baixo risco, mesmo rendendo menos",
          [
            "O maior rendimento possível, para crescer rápido",
            "Rendimento acima da inflação, mesmo com carência",
          ],
          "A emergência pode acontecer a qualquer momento, então o dinheiro precisa estar disponível e sem risco de queda.",
          {
            feedback: [
              "Rendimento alto costuma vir com prazo ou risco maior, e a emergência não espera.",
              "Carência impede o resgate na hora da emergência, mesmo que o rendimento supere a inflação.",
            ],
          },
        ),
        n(
          "liquidez",
          "Uma aplicação rende 12% ao ano se mantida por 2 anos, mas só 4% ao ano se resgatada antes. Quem aplica R$ 10.000 e resgata depois de 1 ano recebe quanto, antes de impostos, em reais?",
          10400,
          "10.000 × 1,04 = 10.400.",
          { misreads: [{ value: 11200, feedback: "11.200 usa a taxa de quem cumpre o prazo." }] },
        ),
        c(
          "liquidez",
          "Uma estudante vai pagar a matrícula da faculdade daqui a 8 meses. Uma aplicação com carência de 2 anos (sem resgate antes) e taxa alta:",
          "Não combina, porque o dinheiro ficaria preso até depois da matrícula",
          [
            "Combina, porque a taxa alta compensa a espera",
            "Combina, desde que ela resgate na data da matrícula",
          ],
          "Prazo da aplicação maior que o do objetivo.",
          {
            feedback: [
              "A taxa não adianta se o dinheiro não estiver disponível na data.",
              "Com carência de 2 anos, não há resgate antes.",
            ],
          },
        ),
        n(
          "liquidez",
          "Uma pessoa gasta R$ 2.500 por mês com o essencial e quer uma reserva de 6 meses. Quanto precisa guardar, em reais?",
          15000,
          "2.500 × 6 = 15.000.",
          { misreads: [{ value: 2500, feedback: "2.500 é um mês de gastos." }] },
        ),
        c(
          "liquidez",
          "Entre duas aplicações de mesmo risco, uma com resgate diário e outra com carência de 1 ano, é esperado que:",
          "A de carência pague mais, pela falta de liquidez",
          [
            "A de resgate diário pague mais, por ser mais procurada",
            "As duas paguem o mesmo, já que o risco é igual",
          ],
          "Abrir mão da liquidez costuma ser remunerado com uma taxa maior.",
          {
            feedback: [
              "Liquidez tem valor: quem oferece resgate diário costuma pagar menos, não mais.",
              "Risco igual não basta: abrir mão da liquidez também costuma aparecer na taxa.",
            ],
          },
        ),
        n(
          "liquidez",
          "Um título prefixado de R$ 1.000 vence em 1 ano e paga 10%. Se as taxas do mercado subirem para 15% logo depois da compra, por quanto, aproximadamente, alguém aceitaria comprá-lo hoje, em reais? Arredonde para o inteiro.",
          957,
          "O título pagará 1.100 daqui a 1 ano; a 15%, isso vale hoje 1.100/1,15 ≈ 956,52.",
          {
            misreads: [
              {
                value: 1000,
                feedback:
                  "Com taxas mais altas no mercado, o título antigo vale menos que o valor aplicado.",
              },
            ],
          },
        ),
        c(
          "liquidez",
          "O item anterior mostra que um título prefixado vendido antes do vencimento:",
          "Pode dar prejuízo se as taxas do mercado subirem",
          ["Sempre devolve o valor aplicado", "Sempre dá lucro, pois a taxa já está travada"],
          "O preço de venda depende das taxas do momento.",
          {
            feedback: [
              "Só no vencimento o valor combinado é pago.",
              "A taxa travada só é garantida no vencimento; antes dele, se as taxas subirem, a venda pode dar prejuízo, como no item anterior.",
            ],
          },
        ),
        c(
          "liquidez",
          "Para um objetivo de longo prazo, como a aposentadoria, uma aplicação com carência longa:",
          "Pode ser adequada, desde que exista uma reserva separada para imprevistos",
          ["Nunca é adequada", "Deve concentrar todo o dinheiro, inclusive a reserva"],
          "Separar objetivos por prazo organiza as escolhas.",
          {
            feedback: [
              "Para prazos longos, a carência pode não atrapalhar.",
              "A reserva de emergência precisa de liquidez.",
            ],
          },
        ),
      ],
    },
    {
      title: "Impostos e taxas",
      objective: "Calcular o rendimento líquido depois de imposto e taxa de administração.",
      introduction:
        "O que importa é o rendimento líquido: o que sobra depois dos custos. Um imposto sobre o rendimento (em alguns casos decrescente com o prazo) e taxas de administração podem mudar qual aplicação rende mais.",
      specs: [
        n(
          "liquido",
          "Uma aplicação rende R$ 800 no ano e paga 15% de imposto sobre o rendimento. Qual é o rendimento líquido, em reais?",
          680,
          "800 − 120 = 680.",
          { misreads: [{ value: 120, feedback: "120 é o imposto." }] },
        ),
        c(
          "liquido",
          "A aplicação A rende 10% ao ano com 20% de imposto sobre o rendimento; B rende 8,5% isenta. Qual rende mais líquido?",
          "B, com 8,5% contra 8% de A",
          ["A, porque 10% é maior", "Empatam"],
          "A líquida: 10% × 0,8 = 8%.",
          {
            feedback: ["O imposto reduz o rendimento de A para 8%.", "8% e 8,5% são diferentes."],
          },
        ),
        n(
          "liquido",
          "Um fundo rende 11% ao ano bruto, antes da taxa de administração de 2% ao ano. Qual é o rendimento aproximado antes de impostos, em porcentagem?",
          9,
          "11% − 2% = 9%.",
          { misreads: [{ value: 13, feedback: "A taxa se desconta, não se soma." }] },
        ),
        c(
          "liquido",
          "Um imposto regressivo cobra 22,5% até 6 meses e 15% acima de 2 anos, sobre o rendimento. Para quem pode esperar, manter mais tempo:",
          "Reduz a alíquota sobre o rendimento",
          [
            "Aumenta a alíquota, porque o rendimento é maior",
            "Mantém a alíquota do início da aplicação",
          ],
          "Regressivo: quanto mais tempo, menor a alíquota.",
          {
            feedback: [
              "Um rendimento maior pode gerar mais imposto em reais, mas a alíquota regressiva cai com o prazo.",
              "A alíquota depende do tempo que o dinheiro ficou aplicado: com mais prazo, ela cai.",
            ],
          },
        ),
        n(
          "liquido",
          "R$ 10.000 rendem 10% no ano e pagam 20% de imposto sobre o rendimento. Qual é o valor líquido final, em reais?",
          10800,
          "Rendimento 1.000; imposto 200; líquido 800; final 10.800.",
          {
            misreads: [
              { value: 11000, feedback: "11.000 esquece o imposto de 200." },
              {
                value: 8800,
                feedback: "Aplicou o imposto sobre o total; ele incide só sobre o rendimento.",
              },
              { value: 800, feedback: "800 é só o rendimento líquido; falta somar o capital." },
            ],
          },
        ),
        c(
          "liquido",
          "O imposto de renda sobre uma aplicação incide sobre:",
          "Apenas o rendimento obtido",
          ["O valor total resgatado", "O valor aplicado no início"],
          "Só o ganho é tributado, não o valor aplicado.",
          {
            feedback: [
              "O capital devolvido não é ganho; só a parte que rendeu é tributada.",
              "O valor aplicado não é renda: é o próprio dinheiro de quem aplicou.",
            ],
          },
        ),
        n(
          "liquido",
          "Um fundo com taxa de administração de 1,5% ao ano sobre R$ 20.000 cobra quantos reais por ano?",
          300,
          "1,5% de 20.000 = 300.",
          { misreads: [{ value: 30, feedback: "30 seria 0,15%." }] },
        ),
        c(
          "liquido",
          "Duas aplicações têm o mesmo rendimento bruto. Uma cobra taxa de administração e outra não. Com o mesmo risco e prazo:",
          "A sem taxa rende mais líquido",
          ["A com taxa rende mais, porque é mais profissional", "Rendem igual"],
          "A taxa reduz o rendimento de quem aplica.",
          {
            feedback: ["A taxa sai do rendimento de quem aplica.", "A taxa faz diferença."],
          },
        ),
      ],
    },
    {
      title: "Quem deve e quem garante",
      objective: "Entender risco de crédito, garantias e a relação entre risco e taxa.",
      introduction:
        "Quem aplica em renda fixa empresta dinheiro a alguém: o governo, um banco, uma empresa. Se o devedor não pagar, há perda. Emissores mais arriscados costumam pagar taxas maiores. Alguns produtos têm garantia de um fundo até certo limite.",
      specs: [
        c(
          "credito",
          "Um título de uma empresa pequena paga 18% ao ano; um título do governo, 11%. A diferença existe principalmente porque:",
          "O risco de a empresa não pagar é maior",
          [
            "A empresa precisa do dinheiro com mais urgência, só isso",
            "O título do governo paga mais imposto",
          ],
          "Maior risco de crédito, maior taxa exigida.",
          {
            feedback: [
              "Urgência pode existir, mas a taxa reflete sobretudo o risco de não pagar.",
              "O imposto costuma ser o mesmo para os dois; a diferença vem do risco.",
            ],
          },
        ),
        n(
          "credito",
          "Um fundo garante até R$ 250.000 por pessoa em cada banco. Alguém com R$ 400.000 num único banco que quebrou tem quanto garantido, em reais?",
          250000,
          "A garantia vai até o limite.",
          { misreads: [{ value: 400000, feedback: "A garantia tem limite de 250.000." }] },
        ),
        c(
          "credito",
          "No item anterior, uma forma de ficar todo o valor dentro da garantia seria:",
          "Dividir o dinheiro entre bancos de grupos financeiros diferentes",
          ["Aplicar tudo num banco maior", "Dividir entre duas contas no mesmo banco"],
          "Nesta regra hipotética o limite vale por pessoa e por grupo financeiro; a regra real tem outros detalhes, como um teto global.",
          {
            feedback: [
              "O limite vale em qualquer banco, grande ou pequeno.",
              "O limite é por pessoa na instituição; duas contas no mesmo banco somam.",
            ],
          },
        ),
        n(
          "credito",
          "Uma carteira tem R$ 8.000 num título que rendeu 10% e R$ 2.000 num título de uma empresa que não pagou (perda total). Qual foi o prejuízo total da carteira, em reais? Responda o valor positivo.",
          1200,
          "Ganho 800; perda 2.000; prejuízo 1.200.",
          {
            misreads: [
              {
                value: 800,
                feedback: "800 é só o ganho do primeiro título; faltou a perda de 2.000.",
              },
              {
                value: 2000,
                feedback: "2.000 é a perda do segundo título; o primeiro rendeu 800.",
              },
            ],
          },
        ),
        c(
          "credito",
          "O que é 'calote' no contexto de renda fixa?",
          "Quando o emissor não paga o que prometeu, total ou parcialmente",
          ["Quando o investidor resgata antes do prazo", "Quando a taxa cai"],
          "É o risco de crédito se materializando.",
          {
            feedback: [
              "Resgate antecipado é decisão do investidor.",
              "Queda de taxa é risco de mercado, não calote.",
            ],
          },
        ),
        n(
          "credito",
          "Um título promete 20% ao ano e tem 10% de chance de não pagar nada. Com 90% de chance paga R$ 1.200 por R$ 1.000 aplicados. Qual é o valor esperado a receber, em reais?",
          1080,
          "0,9 × 1.200 + 0,1 × 0 = 1.080.",
          { misreads: [{ value: 1200, feedback: "1.200 ignora a chance de não receber." }] },
        ),
        c(
          "credito",
          "No item anterior, comparado com um título de risco muito baixo que paga 10% (suponha que pague os R$ 1.100), o título arriscado:",
          "É pior: vale 1.080 em média e pode perder tudo",
          [
            "É melhor, porque promete R$ 1.200 ao final",
            "É equivalente, pois a taxa maior paga o risco",
          ],
          "Promessa alta com risco pode render menos em média: o valor esperado é 1.080, menor que 1.100, e ainda há a chance de perder tudo.",
          {
            feedback: [
              "R$ 1.200 é a promessa; com a chance de calote, o valor esperado é 1.080, menor que 1.100.",
              "Aqui a taxa maior não compensa o risco: 1.080 fica abaixo de 1.100.",
            ],
          },
        ),
        c(
          "credito",
          "Uma propaganda oferece 'renda fixa de 5% ao mês, sem risco'. A leitura mais sensata é:",
          "Desconfiar, pois taxa tão alta sem risco não existe",
          [
            "Aceitar, porque renda fixa não tem risco",
            "Aceitar, se a empresa tiver um site profissional",
          ],
          "5% ao mês passa de 79% ao ano. Taxas muito acima das comuns não vêm sem risco e podem indicar golpe.",
          {
            feedback: [
              "Renda fixa tem riscos, como o calote; o nome não os elimina.",
              "Golpes costumam ter aparência profissional; o sinal de alerta é a taxa alta prometida sem risco.",
            ],
          },
        ),
      ],
    },
    {
      title: "Escolher renda fixa",
      objective:
        "Comparar alternativas de renda fixa considerando objetivo, prazo, liquidez, custos e risco.",
      introduction:
        "Escolher bem é combinar a aplicação com o objetivo: quando o dinheiro será usado, quanto risco se aceita, qual o rendimento líquido. Uma boa análise compara números e declara o que se supôs sobre taxas e prazos.",
      estimatedMinutes: 18,
      specs: [
        c(
          "escolher",
          "Para guardar a entrada de um apartamento que será comprado em 3 anos, uma escolha coerente é:",
          "Uma aplicação de baixo risco com prazo próximo de 3 anos e bom rendimento líquido",
          [
            "Uma aplicação de resgate diário que rende muito pouco, só por liquidez",
            "Um título de empresa arriscada pela taxa alta",
          ],
          "O prazo é conhecido; a liquidez diária não é necessária e o risco alto não combina.",
          {
            feedback: [
              "Com data conhecida, abrir mão de rendimento só pela liquidez diária não compensa.",
              "Perder parte da entrada seria grave.",
            ],
          },
        ),
        n(
          "escolher",
          "A aplicação A rende 11% ao ano com 15% de imposto sobre o rendimento; B rende 9,5% isenta. Qual é o rendimento líquido de A, em porcentagem, com duas casas decimais?",
          9.35,
          "11% × 0,85 = 9,35%.",
          { misreads: [{ value: 9.5, feedback: "9,5% é o rendimento de B." }] },
        ),
        c(
          "escolher",
          "No item anterior, qual aplicação rende mais líquido?",
          "B, com 9,5% contra 9,35%",
          ["A, porque 11% é maior", "Empatam"],
          "A diferença é pequena, mas B vence.",
          {
            feedback: ["Depois do imposto, A rende 9,35%.", "9,35% e 9,5% são diferentes."],
          },
        ),
        n(
          "escolher",
          "Uma pessoa tem R$ 20.000: separa 6 meses de gastos de R$ 2.000 para emergência e aplica o resto por prazo mais longo. Quanto vai para o prazo mais longo, em reais?",
          8000,
          "Reserva 12.000; resto 8.000.",
          { misreads: [{ value: 12000, feedback: "12.000 é a reserva, que fica com liquidez." }] },
        ),
        c(
          "escolher",
          "Uma pessoa acredita que os juros vão cair no próximo ano. Entre uma prefixada e uma pós-fixada de mesmo risco, ela tende a preferir:",
          "A prefixada, que trava a taxa atual",
          ["A pós-fixada, que acompanharia a queda", "Tanto faz"],
          "Se os juros caírem, a pós-fixada renderá menos.",
          {
            feedback: [
              "Acompanhar a queda é justamente o que ela quer evitar.",
              "A expectativa muda a preferência.",
            ],
          },
        ),
        n(
          "escolher",
          "Um título atrelado à inflação paga inflação + 6% ao ano. Com inflação de 5%, quanto valem R$ 10.000 depois de 1 ano, antes de impostos, em reais?",
          11130,
          "10.000 × 1,05 × 1,06 = 11.130.",
          {
            misreads: [
              { value: 11100, feedback: "11.100 soma as taxas; o cálculo multiplica os fatores." },
            ],
          },
        ),
        c(
          "escolher",
          "Qual é a vantagem principal de um título atrelado à inflação para objetivos de longo prazo?",
          "Proteger o poder de compra ao longo do tempo",
          ["Render sempre mais que qualquer prefixado", "Não ter risco algum, mesmo vendido antes"],
          "Ele paga a inflação do período mais uma taxa. O ganho real é conhecido antes de impostos, se o título for mantido até o vencimento e o emissor pagar.",
          {
            feedback: [
              "Em alguns períodos um prefixado pode render mais, por exemplo se a inflação ficar baixa.",
              "Também tem riscos: vendido antes do prazo pode render menos, e o emissor pode não pagar.",
            ],
          },
        ),
        c(
          "escolher",
          "Uma análise responsável de aplicações de renda fixa deve terminar com:",
          "Uma comparação dos rendimentos líquidos, com as premissas de taxa e prazo",
          [
            "A indicação de um produto específico como o melhor para todos",
            "A promessa de um valor final garantido",
          ],
          "Cada pessoa tem objetivo, prazo e tolerância diferentes.",
          {
            feedback: [
              "O melhor depende de cada pessoa e objetivo.",
              "Taxas pós-fixadas e riscos impedem garantir o valor.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Organize os passos para comparar duas aplicações de renda fixa para um objetivo.",
    labels: [
      "Definir o objetivo e em quanto tempo o dinheiro será usado",
      "Separar as opções compatíveis com esse prazo e com o risco aceitável",
      "Calcular o rendimento líquido de cada opção",
      "Escolher e declarar as premissas usadas",
    ],
    explanation:
      "Prazo e risco filtram as opções; só entre as compatíveis vale comparar rendimento líquido.",
  },
  justification: {
    prompts: [
      "Explique por que 'renda fixa' não significa rendimento garantido, citando dois riscos.",
      "Explique por que uma aplicação que rende 10% com 20% de imposto pode render menos que outra de 8,5% isenta.",
      "Explique por que um título prefixado vendido antes do vencimento pode dar prejuízo quando as taxas sobem.",
    ],
    samples: [
      "Renda fixa quer dizer que a regra de remuneração é conhecida na aplicação, não que o resultado é garantido. O emissor pode não pagar (risco de crédito), e vender antes do vencimento pode render menos que o combinado se as taxas do mercado tiverem subido. Por isso é preciso avaliar quem deve e em que prazo.",
      "O imposto incide sobre o rendimento: 20% de 10% são 2 pontos, e sobram 8%. A outra aplicação, isenta, rende 8,5% inteiros. O que chega ao bolso é o rendimento líquido, então a de 8,5% isenta rende mais, mesmo com número bruto menor.",
      "O título promete pagar um valor fixo no vencimento, como R$ 1.100 daqui a um ano. Se as taxas do mercado sobem para 15%, quem compra esse título hoje pode aplicar em outro lugar a 15%. Para aceitar o título antigo, só paga o valor presente de R$ 1.100 a 15%, cerca de R$ 957. Quem comprou por R$ 1.000 a 10% e vende logo depois da alta recebe menos do que aplicou.",
    ],
    focus: "rendimento líquido e risco",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const bruto = 8 + (seed % 7);
      const aliquota = [15, 20][seed % 2] ?? 15;
      const isenta = bruto - 1 - (Math.floor(seed / 2) % 2);
      const liquida = (bruto * (100 - aliquota)) / 100;
      const texto = (v: number) =>
        Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, "").replace(".", ",");
      const melhor = liquida > isenta ? "A" : liquida < isenta ? "B" : "Empatam";
      const resposta =
        melhor === "Empatam"
          ? `Empatam, com ${texto(liquida)}% cada`
          : `${melhor}, com ${texto(Math.max(liquida, isenta))}% contra ${texto(Math.min(liquida, isenta))}%`;
      return c(
        "liquido-contra-isento",
        `A aplicação A rende ${bruto}% ao ano e paga ${aliquota}% de imposto sobre o rendimento. A aplicação B rende ${isenta}% ao ano, isenta. Qual rende mais depois do imposto?`,
        resposta,
        [
          melhor === "A" ? `B, porque é isenta` : `A, porque ${bruto}% é maior`,
          melhor === "Empatam" ? `B, porque é isenta` : `Empatam`,
        ],
        `A líquida: ${bruto}% × ${(1 - aliquota / 100).toString().replace(".", ",")} = ${texto(liquida)}%. B: ${isenta}%.`,
        {
          feedback: [
            "Compare os rendimentos depois do imposto, não o bruto nem só a isenção.",
            melhor === "Empatam"
              ? `A isenção sozinha não decide: depois do imposto, A também rende ${texto(liquida)}%.`
              : "Os rendimentos líquidos não são iguais; confira a conta.",
          ],
        },
      );
    }
    if (variant === 1) {
      const capital = 1000 * (5 + (seed % 16));
      // 10.000 a 10% com 20% de imposto já é uma missão.
      const taxa = capital === 10000 && 8 + (seed % 5) === 10 ? 11 : 8 + (seed % 5);
      const aliquota = [15, 20][Math.floor(seed / 5) % 2] ?? 15;
      const rendimento = (capital * taxa) / 100;
      const imposto = (rendimento * aliquota) / 100;
      const real = (v: number) => v.toLocaleString("pt-BR");
      return c(
        "valor-final-liquido",
        `R$ ${real(capital)} rendem ${taxa}% em um ano, e o imposto é de ${aliquota}% sobre o rendimento. Qual é o valor líquido no final do ano?`,
        `R$ ${real(capital + rendimento - imposto)}`,
        [
          `R$ ${real(capital + rendimento)}`,
          `R$ ${real((capital + rendimento) * (1 - aliquota / 100))}`,
        ],
        `Rendimento ${real(rendimento)}; imposto ${real(imposto)}; final ${real(capital + rendimento - imposto)}.`,
        {
          feedback: [
            "Esse é o valor antes do imposto.",
            "Aplicou o imposto sobre o total, mas ele incide só sobre o rendimento.",
          ],
        },
      );
    }
    const inflacao = 3 + (seed % 5);
    // Inflação de 5% com 6% já é uma missão.
    const real =
      inflacao === 5 && 4 + (Math.floor(seed / 5) % 4) === 6 ? 7 : 4 + (Math.floor(seed / 5) % 4);
    const capital = 10000;
    const final = capital * (1 + inflacao / 100) * (1 + real / 100);
    const soma = capital * (1 + (inflacao + real) / 100);
    const fmt = (v: number) =>
      v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    return c(
      "inflacao-mais-taxa",
      `Um título paga a inflação mais ${real}% ao ano. Com inflação de ${inflacao}% no ano, quanto valem R$ 10.000 aplicados, depois de 1 ano, antes de impostos?`,
      `R$ ${fmt(final)}`,
      [`R$ ${fmt(soma)}`, `R$ ${fmt(capital * (1 + real / 100))}`],
      `10.000 × ${(1 + inflacao / 100).toString().replace(".", ",")} × ${(1 + real / 100).toString().replace(".", ",")} = ${fmt(final)}.`,
      {
        feedback: [
          "Somou as taxas; o cálculo multiplica os fatores da inflação e da taxa.",
          "Esqueceu a parte da inflação.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "renda-fixa",
    title: "Três aplicações, um objetivo",
    prompt:
      "Escolha um objetivo com prazo (uma viagem em 1 ano, um curso em 2 anos) e pesquise três tipos de aplicação de renda fixa com dados públicos. Compare prazo, liquidez, risco e rendimento líquido e escreva uma análise sem indicar produto específico.",
    lab: "bars",
    steps: [
      "Defina o objetivo, o valor e o prazo.",
      "Registre, para cada tipo de aplicação, a regra de remuneração, a liquidez, o risco e os custos, com a fonte.",
      "Calcule o rendimento líquido estimado e escreva a análise com premissas declaradas.",
    ],
    rubric: [
      "Objetivo com valor e prazo (0–1)",
      "Três tipos descritos com remuneração, liquidez, risco e custos, com fontes (0–3)",
      "Rendimento líquido calculado corretamente (0–3)",
      "Análise com premissas e sem recomendação de produto (0–3)",
    ],
  },
  homeSupport: [
    "Conversem sobre a diferença entre 'rende pouco mas posso sacar amanhã' e 'rende mais mas fico sem acesso por dois anos', com um objetivo da família.",
    "Ao ver um anúncio de investimento, procurem juntos quem é o devedor por trás e o que acontece se ele não pagar.",
  ],
};
