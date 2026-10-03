**Proposta de expansão do laboratório do Missão Saber**

Pesquisa em 3 de outubro de 2026. Catálogo local de referência: commit `718f3e4`. Este documento preserva o diagnóstico e a proposta originais. A execução, as correções e os limites da validação estão no [relatório de implementação](./implementacao-e-verificacao.md).

**A recomendação é transformar o laboratório em um conjunto de experiências ligado ao currículo do aluno.** Cada competência deve ter representações que permitam agir sobre a ideia matemática, observar consequências e construir uma explicação. A página deve selecionar essas experiências pela faixa escolar, pela trilha e pelo momento de aprendizagem. O aluno verá poucas opções relevantes de cada vez.

Proponho **19 famílias de ferramentas reutilizáveis**, com modos e roteiros próprios para os diferentes objetivos. A cobertura planejada está detalhada em [58 competências](./cobertura-competencias.csv), [291 missões](./cobertura-missoes.csv) e [116 retomadas](./cobertura-retomadas.csv). Esses arquivos registram destinos propostos, não certificam cobertura pedagógica já implementada. A aprovação de cada roteiro continua dependendo de revisão matemática, teste de interação e avaliação com alunos.

O objetivo final é que o aluno consiga passar de “vi acontecer” para “consigo representar, prever, explicar e aplicar em outra situação”. O laboratório terá exploração livre, investigação guiada e desafios de transferência, todos conectados ao percurso de aprendizagem.

**O diagnóstico do produto atual mostra uma lacuna de cobertura e de conexão com as perguntas.**

Extraí o catálogo executando seus módulos locais, sem consultar contas ou registros de alunos. O inventário contém 14 trilhas, 58 competências, 291 missões principais, 116 missões de retomada e 28 bancos de avaliação. São 3.308 itens: 2.972 de ensino/retomada e 336 reservados às avaliações.

| Situação observada no código | Consequência para o laboratório |
| --- | --- |
| A página monta as mesmas três ferramentas para todos os perfis. | O ano escolar modifica um aviso e a apresentação do desafio, mas não seleciona as ferramentas. |
| 121 das 291 missões têm `lab: null`. | Uma parte grande do percurso não oferece ferramenta de apoio. |
| 23 das 58 competências não têm laboratório em nenhuma de suas missões. | Inclui contagem inicial, balanças, medidas e tempo, funções, recorrências, trigonometria e geometria espacial. |
| As demais 35 competências apontam para barras, malha ou grupos. | A existência de uma referência não comprova adequação: proporção usa o simulador de descontos; geometria analítica usa a malha de área; várias finanças usam as mesmas barras. |
| Apenas um dos 3.308 itens declara `exploration` diretamente. | Quase toda a conexão é feita no nível da missão, e a ferramenta de apoio aparece depois de pedir uma pista. |
| Esse único item é de frações e aponta para barras de descontos. | A ação disponível não corresponde bem à representação de metade de uma unidade. |
| Há um desafio profundo por competência; 24 deles não indicam ferramenta. | Existe intenção pedagógica autoral que pode orientar a expansão, mas falta o material manipulável correspondente. |
| A montagem salva é única por perfil e tipo de ferramenta. | Experimentos diferentes com a mesma ferramenta disputariam o mesmo espaço. |
| O salvamento é manual; o laboratório dentro da pergunta é temporário. | Sair da questão ou esquecer de salvar interrompe a investigação. |
| “Guardar minha investigação” abre o caderno sem transportar a montagem. | O aluno precisa reconstruir o contexto do que acabou de descobrir. |

Os pontos acima vêm de `content/catalog.ts`, `content/types.ts`, `content/skill-factory.ts`, `app/(app)/laboratorio/page.tsx`, `learning/components/player.tsx`, `labs/components/labs.tsx`, `labs/repository.ts` e da tabela `experiments` em `packages/db/src/schema/missao-saber.ts`. A extração foi conferida contra o inventário versionado.

**O estudo do Brilliant indica padrões úteis de interação.**

Acessei a área autenticada com os cookies fornecidos, examinei o catálogo e a organização de 16 cursos e naveguei em nove lições. Testei respostas, repetição e recomeço em frações, resposta com seleção em funções e rotação de sólidos. Nas outras lições examinei as telas e a sequência inicial. É uma análise por amostragem dos mecanismos de aprendizagem; não é uma auditoria de todas as lições do Brilliant. Os cookies e dados pessoais da conta não fazem parte desta proposta.

| Exemplo examinado | O que observei | Aplicação proposta no Missão Saber |
| --- | --- | --- |
| [Fractions — Combining Parts](https://brilliant.org/courses/math-fundamentals/mt-fractions-intro/combining-parts/) | A resposta é construída colorindo regiões. A figura contém partes de tamanhos diferentes; contar regiões sem comparar áreas não resolve. Há conferência, nova tentativa, recomeço e explicação opcional após o acerto. | Frações com inteiro explícito, partições equivalentes e validação da área representada. Preservar a tentativa e permitir comparar com o objetivo. |
| [Solving Equations — Equations with Unknowns](https://brilliant.org/courses/pre-algebra/variables/using-variables-2-ss-exp/) | Objetos de peso desconhecido são ligados a uma expressão com variável. A imagem sustenta a passagem para a notação. | Começar com objetos e pesos nos anos iniciais; introduzir incógnitas, equivalência e operações nos dois lados quando forem pertinentes à trilha. |
| [Proportional Reasoning — Scaling Up](https://brilliant.org/courses/proportional-relationships/setting-up-ratios/scale-up-color/) | Uma mistura relaciona quantidades e resultado visual. A tarefa pede mudar a quantidade mantendo a proporção. | Receitas e misturas com razão parte–parte e parte–todo explícitas; mostrar por que somar o mesmo valor às duas partes pode mudar a razão. |
| [Visual Algebra — Building Patterns](https://brilliant.org/courses/systems-of-equations/patterns/patterns-intro/) | O aluno observa construções em etapas e escolhe a próxima configuração. O padrão aparece antes da expressão. | Construção com peças, tabela posição–quantidade e formulação de regra; depois testar a regra em uma posição ainda não mostrada. |
| [Geometry and Measurement — Surface Area](https://brilliant.org/courses/geometry-fundamentals/surface-area/surface-area-2/) | É possível girar sólidos para inspecionar faces antes de avançar. | Vistas, partes ocultas e planificações com controles explícitos de rotação e alternativa por vistas fixas. |
| [Probability and Chance — Comparing Likelihoods](https://brilliant.org/courses/winning-with-probability/introduction/comparing-likelihood/) | Cartas tornam visíveis os resultados possíveis e os atributos de cada resultado. | Construir o espaço amostral antes de simular; distinguir quantidade de resultados de equiprobabilidade. |
| [Introduction to Functions — Finding the Rule](https://brilliant.org/courses/introduction-to-functions/introducing-functions/finding-the-rule/) | Entradas e saídas aparecem alinhadas; a escolha de uma regra é conferida sobre a relação exibida. | Máquina de funções com exemplos, novos testes, domínio e ligação com tabela e gráfico. |
| [Trigonometric Functions — Periodic Phenomena](https://brilliant.org/courses/trigonometric-functions/periodic-functions/periodic-phenomena/) | A introdução pede localizar picos em um gráfico de comportamento periódico. | Usar gráficos para investigar regularidade onde isso estiver no currículo. A trigonometria atual do Missão Saber prioriza triângulos, leis dos senos/cossenos, áreas e distâncias; esses objetivos vêm primeiro. |
| [Logic — Order Logic](https://brilliant.org/courses/logic-deduction/enter-the-code/order-ch-1/) | Pistas de ordem são representadas por personagens em posições manipuláveis. | Fila de objetos nos anos iniciais, tabela de eliminação nas faixas seguintes e argumentos formais no ensino médio. |

O padrão mais útil é a continuidade entre representação, ação e pergunta. Uma boa experiência muda o que o aluno consegue observar. Na adaptação, cada controle precisa ter uma finalidade matemática; o texto deve nomear o que mudou e pedir uma conclusão verificável.

O Brilliant também tem caminhos de cursos, prática e verificações ao longo do percurso. A proposta aproveita a sequência de aprendizagem e a retirada gradual de apoio, ajustando a organização ao catálogo brasileiro já existente. [Referência oficial sobre Learning Paths](https://brilliant.org/help/features/what-are-learning-paths/).

A plataforma atual apresenta o tutor Koji e inclui apoio por voz e texto. Já o artigo de 2025 sobre produção de jogos descreve autoria de objetivos, progressão, variantes e revisão humana. São referências de momentos e funções diferentes. Para esta expansão, recomendo primeiro experiências e devolutivas autorais verificáveis; uma camada de tutoria contextual pode ser considerada posteriormente. [Produto atual](https://brilliant.org/), [processo de autoria descrito pela equipe](https://blog.brilliant.org/hand-crafted-machine-made/).

Há cuidados que a adaptação deve resolver explicitamente: em várias telas examinadas, elementos visuais aparecem no retrato de acessibilidade como imagens ou artigos sem o nome da ação. Isso não constitui uma auditoria completa de acessibilidade do Brilliant, mas reforça a necessidade de testar controles por teclado e leitor de tela no Missão Saber. O próprio suporte do Brilliant documenta dificuldades com gestos de arrastar e edição de frações. [Guia dos elementos interativos](https://brilliant.org/help/features/how-do-i-use-interactives-on-brilliant/).

Para os anos iniciais, complementei a referência com o guia do IES sobre representações concretas/visuais e reta numérica. Para área e perímetro, o PhET mostra uma combinação especialmente útil: construção livre e desafios com restrições, acompanhados de comparação entre o que foi construído e o que foi pedido. Essas referências orientam o desenho; não demonstram, por si só, a eficácia do produto que será construído. [IES/WWC](https://ies.ed.gov/ncee/WWC/PracticeGuide/26), [guia do Area Builder](https://phet.colorado.edu/files/teachers-guide/area-builder-html-guide.pdf).

**O laboratório deve selecionar experiências pela faixa exata e pelo contexto da trilha.**

A faixa escolar deve influenciar vocabulário, quantidade de controles, números, símbolos, representações e tipo de resposta. Habilidade demonstrada pode ajustar o apoio dentro dessa experiência. Um acerto não deve liberar automaticamente conteúdo de outra faixa.

| Faixa de apresentação | Forma de trabalhar | Exemplos de experiências |
| --- | --- | --- |
| 2º–3º EF | Instruções curtas, leitura em voz alta, objetos contáveis, ações por toque, previsão por escolha ou desenho. | Agrupar dezenas, repartir objetos, completar padrões, comparar comprimentos, moedas, trajetos e formas. |
| 4º–5º EF | Representar e comparar estratégias; introduzir tabelas e medidas mantendo os objetos visíveis. | Contagem organizada, composição de figuras, tempo, massa/capacidade, caminhos e leitura de dados. Frações entram onde a trilha já as prevê. |
| 6º–7º EF | Conectar figura, número e explicação; variar uma condição e comparar casos. | Frações, porcentagens, preços, orçamento, área/perímetro, simetria, contagem, probabilidade, paridade e lógica. |
| 8º–9º EF | Relacionar representações, modelar, testar limites e justificar relações. | Proporcionalidade, equações, semelhança, Pitágoras, coordenadas, invariantes, juros e inflação. |
| Ensino médio | Explicitar hipóteses, domínios e limitações; construir e revisar argumentos. | Funções, recorrências, polinômios, combinatória, probabilidade condicional, indução, modelos financeiros, trigonometria e espaço. |

Esses agrupamentos são uma decisão de apresentação. A autorização deve usar os anos exatos do catálogo. Por exemplo: Canguru P atende 3º–4º, Mirim 2 atende 4º–5º, Canguru E atende 5º–6º e Canguru B atende 7º–8º. As sobreposições devem ser preservadas, sem transformar uma faixa visual em permissão para toda uma trilha.

| Trilha atual | Anos elegíveis |
| --- | --- |
| OBMEP Mirim 1 | 2º e 3º EF |
| Canguru P | 3º e 4º EF |
| OBMEP Mirim 2 | 4º e 5º EF |
| Canguru E | 5º e 6º EF |
| OLITEF N1; OBMEP N1 | 6º e 7º EF |
| Canguru B | 7º e 8º EF |
| OLITEF N2; OBMEP N2 | 8º e 9º EF |
| Canguru C | 9º EF |
| Canguru J | 1ª e 2ª EM |
| Canguru S | 3ª EM |
| OLITEF N3; OBMEP N3 | 1ª, 2ª e 3ª EM |

A entrada principal deve mostrar **Continue sua investigação**, **Experimente para a missão de hoje** e **Explore assuntos da sua trilha**. A primeira tela pode oferecer uma recomendação principal e até três alternativas. Uma biblioteca permite explorar os demais assuntos elegíveis, com filtros simples. A sugestão deve explicar sua relação com o percurso: “Esta experiência ajuda na missão sobre frações”.

Para uma dificuldade de pré-requisito, o aluno pode receber uma experiência de retomada adaptada à sua faixa. Isso exige uma relação curricular explícita e linguagem apropriada; não deve abrir indiscriminadamente o catálogo de alunos mais novos. A elegibilidade precisa ser conferida ao abrir, carregar e salvar, inclusive por link direto.

**As 19 famílias propostas cobrem ações matemáticas diferentes.**

Uma família é um conjunto de modos com a mesma base de interação. Por exemplo, a ferramenta de frações compartilha divisão de segmentos e áreas, mas cada roteiro determina o inteiro, as partes, os valores permitidos e o objetivo. Os identificadores abaixo servem à matriz de planejamento; não precisam aparecer ao aluno.

| Família | Ações e modos previstos | Exemplo de investigação e critério de êxito |
| --- | --- | --- |
| **L01 — Contar, agrupar e desenhar** | Fichas, agrupamentos de dez, juntar/tirar, partilhas, comparação e saltos em reta numérica. | Repartir uma quantidade em grupos iguais, conservar o total e explicar a sobra. Nos menores, a explicação pode ser feita com a própria montagem. |
| **L02 — Frações e inteiro de referência** | Dividir segmentos e regiões, pintar partes, recompor o inteiro, comparar referências, reta numérica, fração/decimal e operações por representação. | Construir metade de 1 m e reconhecer `1/2`, `0,5` e `0.5`; depois distinguir metade de inteiros diferentes. Conferir a quantidade representada, não o número bruto de regiões pintadas. |
| **L03 — Razões e porcentagens** | Misturas, barras proporcionais, dupla reta, taxa unitária, relações diretas/inversas, aumentos/descontos e base desconhecida. | Dobrar as quantidades de uma receita mantendo a razão; comparar isso com somar uma quantidade fixa a cada ingrediente. Em porcentagem, identificar a base de cada etapa. |
| **L04 — Medidas e tempo** | Régua móvel, unidades convencionais e não convencionais, relógio, linha do tempo, calendário, massa, capacidade e conversões. | Medir a mesma distância com unidades diferentes e explicar por que muda o número. Calcular duração atravessando a hora, com uma linha do tempo que sustente o raciocínio. |
| **L05 — Construção de figuras e áreas** | Compor peças, cobrir regiões, recortar/reorganizar, contorno, lados compartilhados, áreas compostas e coloração. | Construir duas figuras de mesma área e perímetros diferentes; conferir que nenhum quadradinho foi criado ou perdido na reorganização. |
| **L06 — Transformações e semelhança** | Espelho, eixo, giros, deslocamentos, composições, dobrar/cortar/abrir, correspondência de lados, fator de escala e Tales. | Duplicar os lados de uma figura e investigar o efeito na área. Em reflexão, justificar a distância ao eixo e distinguir o espelho de um giro. |
| **L07 — Caminhos e coordenadas** | Mapas com comandos, labirintos, caminhos com restrições, quadrantes, deslocamentos, ponto médio, distâncias e escolha de eixos. | Comparar um trajeto na malha com a distância direta; registrar uma rota que respeite as condições e justificar a escolha. |
| **L08 — Balanças e álgebra** | Pesos e trocas, igualdade, incógnitas, operações equivalentes, parênteses, sistemas, peças algébricas, fatoração, divisão de polinômios, inequações e conferência de domínio. | Descobrir uma incógnita mantendo a igualdade. Nas faixas avançadas, mostrar por que uma transformação pode introduzir solução estranha. Os modos simbólicos não devem sugerir “peso físico negativo”. |
| **L09 — Padrões e sequências** | Repetições, figuras crescentes, tabelas por posição, PA/PG, somas, recorrências e máquinas de instruções. | Formular uma regra e prever um termo ainda oculto; comparar duas regras que coincidem nos primeiros casos. Encaminhar a justificativa geral para L15. |
| **L10 — Números, divisores e restos** | Pares, agrupamentos, ciclos em relógio modular, árvores de fatores, divisores, MDC/MMC, bases e propriedades invariantes. | Alterar os passos de um ciclo e prever quando ele retorna ao início; explicar a relação com múltiplos e divisores. |
| **L11 — Funções e gráficos** | Máquina entrada–saída, tabela e gráfico sincronizados, parâmetros, domínio/imagem, afins, quadráticas, composição/inversa, interseções, círculos e intervalos de sinal. | Ajustar uma reta a duas condições e testar um terceiro ponto; relacionar cada alteração de parâmetro à expressão e ao gráfico. |
| **L12 — Casos, combinações e gavetas** | Listas, árvores, tabelas, filas, escolhas com/sem ordem, repetições, complementar, sobreposição, distribuição e pior caso. | Construir todos os casos de uma escolha pequena, identificar duplicatas e justificar a contagem; investigar a primeira repetição garantida em caixas. |
| **L13 — Probabilidade e simulação** | Urnas, dados, cartas, árvores, reposição, eventos, amostragem repetida, condicional e valor esperado. | Comparar previsão teórica e frequência observada, alterando o tamanho da amostra. Exibir quais hipóteses tornam os resultados equiprováveis. |
| **L14 — Tabelas e dados** | Cruzar linha/coluna, totais, completar lacunas, gráficos vinculados, escalas e leitura crítica de percentuais. | Alterar a tabela e prever a mudança no gráfico; encontrar uma afirmação que a tabela não permite concluir. |
| **L15 — Lógica, argumentos e provas** | Ordenação por pistas, tabela de eliminação, conectivos, quantificadores, contraexemplos, casos, extremos, prova por absurdo e indução. | Testar um contraexemplo ou reparar uma prova com uma etapa ausente. Nas produções abertas, usar rubrica e revisão; a enumeração de poucos exemplos não deve ser tratada como prova universal. |
| **L16 — Compras e orçamento** | Moedas/troco, comparação unitária, frete, sobras, pacotes, entradas/saídas, categorias, metas, prioridades e imprevistos. | Escolher a compra que atende à quantidade necessária e ao orçamento; mostrar o custo total e a sobra, explicando o critério usado. |
| **L17 — Dinheiro no tempo e cenários** | Juros simples/compostos, parcelas, aportes, valor presente, taxas equivalentes, inflação, rendimento líquido, liquidez, risco, carteiras e sensibilidade. | Comparar alternativas na mesma data e sob premissas declaradas; mudar uma hipótese e explicar quando a conclusão se altera. Valores didáticos e cenários explícitos. |
| **L18 — Triângulos e trigonometria** | Ângulos/paralelas, quadrados nos lados, Pitágoras, alturas/diagonais, círculos/tangentes, razões trigonométricas, ângulos notáveis e leis dos senos/cossenos. | Mover um vértice mantendo uma condição e prever uma medida. Destacar quando a relação depende de ângulo reto ou de outra hipótese. |
| **L19 — Sólidos, vistas e planificações** | Sólidos básicos, cubinhos, partes ocultas, faces/arestas/vértices, planificações, superfície, volume, cortes e coordenadas espaciais. | Relacionar uma vista e uma planificação ao sólido, contar faces ocultas e distinguir volume de área de superfície. |

As famílias L08, L11, L15, L17, L18 e L19 têm maior complexidade e exigem modos bem delimitados. O nome de uma família não deve esconder a necessidade de implementar essas capacidades. A matriz de missões registra os modos necessários para evitar declarar uma competência “coberta” por uma ferramenta apenas parecida.

**Uma experiência deve ter começo, investigação e fechamento.**

O fluxo recomendado é:

1. **Situação e objetivo:** apresentar uma pergunta concreta, com dados e unidade claros.
2. **Previsão:** escolher, marcar, desenhar ou escrever o que se espera que aconteça. Nos menores, a escrita é opcional.
3. **Manipulação:** começar com poucos controles e variar uma condição de cada vez. Oferecer desfazer, reiniciar e comparação entre duas montagens.
4. **Observação:** mostrar medidas e consequências relacionadas ao objetivo. Em um desafio, revelar medições no momento adequado, evitando resolver a própria resposta antes da tentativa.
5. **Explicação:** pedir que o aluno relacione o que fez ao resultado. Pode ser uma frase, organização de cartões, desenho anotado ou texto, conforme a faixa.
6. **Transferência:** propor uma nova situação com números, orientação ou contexto diferentes e apoio reduzido.

A exploração livre pode entrar diretamente na manipulação. A investigação guiada usa o ciclo completo. O aluno deve saber em qual modo está e conseguir voltar à missão preservando sua resposta anterior.

Uma tentativa incorreta deve produzir uma devolutiva específica, como “Os dois lados da sua balança deixaram de representar a mesma quantidade” ou “Você contou as peças; agora compare o tamanho de cada parte”. O sistema deve permitir revisar a montagem. As mensagens e condições de acerto devem ser escritas e verificadas junto com o roteiro.

**Cinco experiências exemplificam a proposta de ponta a ponta.**

| Público e vínculo | Roteiro proposto | Evidência esperada |
| --- | --- | --- |
| Mirim 1, `contar-e-comparar-4` | Oferecer 12 fichas e duas bandejas. Pedir uma previsão sobre repartir igualmente; deixar distribuir; depois trocar para 14 fichas. | Grupos iguais que conservam o total; o aluno reconhece e constrói metade em um novo caso. |
| Canguru E/OLITEF N1 e outras trilhas elegíveis, `fracoes-formatos` | Mostrar um segmento de 1 m; dividir em partes iguais; representar metade; relacionar `1/2` e `0,5`. Depois perguntar sobre metade de um segmento de 2 m. | Distinguir a fração da medida resultante e identificar o inteiro. O campo “valor em m” aceita o valor sem exigir repetir a unidade. |
| Canguru P, `balancas-5`; variante de OBMEP N2, `equacoes-2` | No primeiro caso, equilibrar objetos e descobrir um número escondido. Na variante mais avançada, representar `2x + 3 = 11`, escolher operações equivalentes e verificar `x = 4`. | Preservar a igualdade e explicar a ação. A versão avançada acrescenta símbolos e operações sem aparecer para a criança da faixa inicial. |
| OBMEP N2, `semelhanca-4` | Comparar retângulos de 3 × 2 e 6 × 4; prever lados, perímetro e área; mover o fator de escala; testar outro fator. | Explicar que comprimentos e áreas variam de maneiras diferentes, apoiado na decomposição da figura. |
| OLITEF N3, `equivalencia-temporal-2` | Comparar pagamento à vista com parcelas em datas explícitas. Alterar a taxa didática e observar valores trazidos à mesma data. Pedir a condição que faz uma alternativa mudar de posição. | Comparação temporal coerente e conclusão condicionada às premissas; sem transformar uma simulação em recomendação financeira pessoal. |

**A conexão com progresso precisa distinguir exploração de autonomia.**

Proponho registrar “explorou”, “concluiu a investigação” e “resolveu a transferência” como eventos distintos. Manipular controles, assistir a uma animação ou salvar um experimento não demonstra domínio da competência.

O motor atual exige evidências independentes em pelo menos três famílias e dois dias, considerando a primeira tentativa e o uso de ajuda. Essa regra deve ser preservada inicialmente. A transferência pode usar um item novo pelo mesmo motor. Se a ferramenta ou a devolutiva já expôs a solução daquele item, ele não serve como nova evidência independente.

Uma representação interativa que constitui a própria pergunta pode fazer parte de uma avaliação. Já uma ferramenta que calcula ou revela a resposta funciona como apoio. Essa diferença precisa estar no contrato de conteúdo. Para a primeira entrega, recomendo manter os 336 itens reservados fora do fluxo guiado e usar cenários autorais separados no laboratório.

O relatório para a família deve mostrar descobertas concretas, uso de apoio e próximo passo: “Comparou duas figuras com a mesma área e percebeu a mudança no contorno”. Tempo de tela e quantidade de cliques são sinais de uso, não conclusões sobre aprendizagem.

**O caderno deve receber a investigação com seu contexto.**

Ao guardar uma descoberta, levar título, competência, pergunta, previsão, montagem, observação e explicação. A montagem precisa poder ser reaberta como versão daquele experimento. O aluno pode criar uma nova tentativa sem destruir a anterior.

Recomendo salvamento automático com indicação de estado, botão explícito para guardar uma descoberta e recuperação de rascunho se a conexão falhar. Conflitos entre aparelhos devem ser apresentados sem sobrescrever silenciosamente a versão anterior. Trocar de perfil deve trocar também o rascunho, o histórico e as sugestões.

**Os controles e a matemática precisam ser igualmente confiáveis.**

Todo roteiro deve declarar: representações disponíveis, objetivo, estados válidos, formas equivalentes de resposta, limites numéricos, unidades, critérios de acerto, erros conceituais esperados, pistas e variante de transferência. O que o enunciado promete precisa ser possível com os controles oferecidos.

As entradas devem aceitar vírgula decimal, frações digitadas e formas equivalentes previstas. Quando a unidade já estiver fixa no campo, ela será implícita; quando escolher a unidade fizer parte da competência, isso deve ser uma ação separada e clara. Símbolos mais avançados só aparecem nas faixas e modos que os usam.

Frações devem preservar equivalência exata. Geometria precisa usar medidas coerentes com o desenho; zoom e perspectiva não podem alterar o resultado matemático. Probabilidade deve separar simulação, frequência e modelo teórico. Finanças deve explicitar período, capitalização, aportes, custos, impostos e arredondamento conforme o cenário. Gráficos precisam respeitar domínio, descontinuidades e escalas.

No celular, cada gesto terá alternativa por toque e controles nomeados. Arrastar peças será uma possibilidade; também deve ser possível selecionar a peça e escolher o destino. Teclado, leitor de tela, contraste, símbolos além da cor e movimento reduzido devem ser critérios de aprovação. Leitura em voz alta e respostas por seleção/desenho ajudam a manter o foco matemático nos anos iniciais.

**A entrega deve ocorrer por blocos completos de experiência.**

| Etapa | Escopo proposto | Critério para avançar |
| --- | --- | --- |
| 1. Fundação e pilotos | Catálogo de experiências, seleção por perfil/trilha, vínculo com missão, persistência por experimento, caderno e três pilotos: contagem, frações e balanças. | O fluxo inteiro funciona, inclusive trocar de perfil, retomar em outro aparelho, usar teclado e voltar à missão. Roteiros revisados e experimentados com alunos das faixas correspondentes. |
| 2. Anos iniciais | Completar os modos de Mirim 1, Canguru P e Mirim 2: contagem, formas, padrões, localização, medidas/tempo, balanças, caminhos, tabelas e sólidos básicos. | Todas as competências e objetivos dessas trilhas têm experiência adequada; crianças conseguem executar a tarefa sem explicação dos controles por um adulto. |
| 3. Fundamental intermediário | Frações, porcentagens, preços, orçamento, área/perímetro, transformações, contagem, gavetas, probabilidade, paridade e lógica. | Cobertura das trilhas correspondentes, devolutivas específicas e transferência validada; migrar os experimentos antigos de barras, malha e grupos. |
| 4. 8º–9º EF | Proporção, equações, semelhança, Pitágoras, coordenadas, invariantes, lógica e finanças N2. | Modos avançados respeitam hipóteses, restrições e diferentes representações; nenhuma associação genérica substitui a ferramenta necessária. |
| 5. Ensino médio | Funções, sequências, estruturas numéricas, polinômios, provas/indução, trigonometria, espaço, combinatória/probabilidade e finanças N3. | Cobertura dos objetivos avançados, revisão matemática especializada dos casos limites e evidências de transferência em problemas novos. |

A ordem prioriza a lacuna dos menores e permite reutilizar componentes nas faixas seguintes. Conteúdos que atravessam faixas serão publicados por modo e por trilha. Uma família ainda parcial não libera automaticamente seus modos avançados.

Os pilotos permitem estimar o custo real de autoria, interação e revisão. Antes deles, um prazo fechado para as 19 famílias seria pouco confiável. Há trabalho de software e um volume substancial de roteiros: os 291 objetivos de missão são a referência de cobertura, com reutilização de modos e variantes nas 116 retomadas. Não proponho construir 291 aplicativos independentes.

**A definição de pronto deve tornar a cobertura verificável.**

- Todas as 58 competências e todos os objetivos das 291 missões possuem modos e roteiros aprovados. As 116 retomadas apontam para experiências ligadas ao erro trabalhado.
- Cada família de perguntas de ensino tem vínculo explícito com o conceito e a representação adequados. Uma referência apenas no nível da competência não encerra essa revisão.
- As 14 trilhas são verificadas em seus anos elegíveis exatos. Conteúdo inadequado não aparece por recomendação, biblioteca, link direto ou histórico.
- O enunciado, a figura, os controles e o corretor concordam; são aceitas todas as construções matematicamente válidas previstas, inclusive soluções diferentes do exemplo do autor.
- Exercícios com resposta única realmente a têm. Investigações abertas apresentam critérios, sem fingir que existe uma única montagem correta.
- Rascunhos, múltiplos experimentos, versões antigas, falha de conexão e edição concorrente têm comportamento verificado.
- Os fluxos funcionam em celular, teclado e leitor de tela, incluindo erro, recomeço, retorno à missão e salvamento no caderno.
- A evidência de autonomia continua separada do uso de apoio e de respostas já reveladas.
- Alunos de cada faixa conseguem interpretar a tarefa, manipular a representação, explicar uma relação e tentar uma situação nova. Os resultados do piloto orientam revisão antes de ampliar a oferta.

Para avaliar impacto, acompanhar a capacidade de completar uma transferência inédita, a frequência de pedidos de ajuda, os tipos de erro que persistem e a retenção em retomadas posteriores. Acompanhar também falhas de salvamento, abandono nos controles e desempenho em dispositivos modestos. Metas numéricas de aprendizagem devem ser definidas após uma linha de base, sem prometer ganhos ainda não medidos.

O primeiro incremento recomendado é o fluxo completo com **contagem, frações e balanças**, incluindo seleção por faixa, integração com a pergunta e caderno. Esses três casos testam os fundamentos da proposta e resolvem problemas concretos de representação já presentes no catálogo. A expansão prossegue até os modos e objetivos mapeados estarem efetivamente atendidos.

Os detalhes de arquitetura e migração estão em [notas técnicas](./notas-tecnicas.md). O [catálogo proposto em JSON](./catalogo-proposto.json) e as três matrizes permitem revisar a cobertura sem depender de descrições genéricas.
