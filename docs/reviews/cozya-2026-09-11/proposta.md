**Cozya — proposta de produto e negócio**

11 de setembro de 2026. Contexto confirmado: produto em desenvolvimento, sem usuários pagantes. Esta proposta combina inspeção do código, navegação na página pública e no app local, testes e pesquisa de concorrentes. Preços propostos, metas e estimativas são hipóteses para validação.

**Minha recomendação é transformar o Cozya em um organizador da alimentação da semana, começando por quem já cozinha em casa e tem dificuldade para decidir e preparar as refeições.**

O app já possui uma base aproveitável de captura e organização de receitas. A oportunidade comercial está em conectar esse acervo à rotina: escolher refeições, ajustar quantidades, montar compras e cozinhar. O benefício que queremos comprovar é menos esforço para decidir e executar a alimentação da casa.

Hoje, a proposta comercial depende muito de cadastrar receitas com IA. Minha hipótese é que esse benefício pode atrair curiosidade e uso ocasional, mas terá dificuldade para sustentar uma assinatura sozinho. Ainda não existem dados de retenção ou pagamentos que permitam confirmar essa hipótese.

O primeiro investimento deve produzir um ciclo completo de uso e evidência de pagamento. Não há justificativa, nesta fase, para uma grande reconstrução ou um catálogo extenso de funcionalidades.

**O que já existe merece ser preservado.**

| Área | Situação encontrada | Consequência |
| --- | --- | --- |
| Acervo pessoal | Cadastro, edição, exclusão, favoritos, busca por título e paginação | Base para organizar receitas conhecidas |
| Captura assistida | Texto, imagem, voz e pesquisa por descrição implementados | Pode reduzir o trabalho de montar o acervo; qualidade real ainda precisa de avaliação |
| Revisão antes de salvar | Campos editáveis depois da captura | Permite corrigir quantidades e interpretações |
| Compartilhamento | Texto formatado por link do WhatsApp | Útil, mas ainda sem página compartilhável com “salvar no meu Cozya” |
| Cobrança | Pro mensal/anual, créditos, pacotes, cancelamento e portal | Infraestrutura reutilizável |
| Fundação técnica | Separação de serviços, validação, isolamento por usuário, observabilidade e testes | Evolução incremental é viável |
| Interface | Identidade consistente, layout simples, experiência adaptada ao celular | Deve evoluir a partir da experiência atual |

O preço configurado hoje é R$ 14,90/mês ou R$ 149/ano, com 50 créditos mensais. O gratuito permite até 15 receitas simultaneamente e não libera IA. A redação “limite vitalício” não corresponde ao contador atual, que considera receitas existentes. Fonte: [configuração dos produtos](../../../packages/config/src/products.ts), [planos](../../../apps/cozya/src/features/billing/plans-content.ts) e [repositório](../../../apps/cozya/src/features/recipes/repository.ts).

Há correções necessárias antes de convidar pessoas a pagar: visualização desatualizada após editar receitas, comunicação incorreta dos créditos de voz, divergências de privacidade, recuperação de falhas e contraste. O [review técnico](review-tecnico.md) documenta os achados e seus limites.

**O mercado confirma que existem ofertas pagas, mas também eleva o mínimo que precisamos entregar.**

Preços abaixo consultados em páginas oficiais em 11/09/2026. Valores em dólar são referências internacionais, sem conversão ou suposição de preço na loja brasileira.

| Referência | Oferta observada | Implicação para o Cozya |
| --- | --- | --- |
| [Paprika](https://www.paprikaapp.com/) | Importação web, cardápio, compras que combinam ingredientes, ajuste de porções, temporizadores e tela ligada; versões vendidas separadamente | Organizar e executar receitas já é uma categoria madura |
| [Samsung Food](https://samsungfood.com/meal-planner/) e [Food+](https://samsungfood.com/food-plus/) | Planejamento e compras compartilhadas no gratuito; personalização e outros recursos no pago, anunciado a US$ 6,99/mês ou US$ 59,99/ano | Um cardápio básico, sozinho, enfrenta concorrência gratuita |
| [CookBook](https://cookbookmanager.com/pricing) | Gratuito com 20 receitas e 20 importações; pago com importações ilimitadas e recursos de IA, a US$ 6,99/mês ou US$ 39,99/ano | O usuário consegue experimentar a importação antes de pagar |
| [Plan to Eat](https://www.plantoeat.com/) | Organização, planejamento e lista automática; US$ 5,95/mês ou US$ 49/ano; teste de 14 dias sem cartão | O fluxo semanal pode ser a própria oferta comercial |
| [ReciMe](https://www.recime.app/) | Captura de receitas, organização, compras e planejamento; parte dos recursos permanece gratuita | Captura de receitas também precisa se conectar ao uso posterior |

Essas ofertas não provam que brasileiros pagarão pelo Cozya. Também não provam que precisamos copiar suas funcionalidades. Mostram que “tem IA”, “importa receita” e “tem lista de compras” são argumentos insuficientes para diferenciar o produto.

A alternativa mais difícil de vencer é continuar usando o método atual: mensagens para si mesmo, prints, papel e improviso. Nas entrevistas, precisamos observar o custo real desse método e quais partes as pessoas aceitariam mudar.

**Eu começaria com um público definido pelo comportamento.**

Público inicial proposto: pessoas responsáveis por decidir e preparar refeições para uma casa de duas a quatro pessoas, que cozinham pelo menos três vezes por semana, trabalham ou estudam e já guardam receitas em lugares diferentes.

Dentro desse grupo, testaria primeiro a situação “jantares dos dias úteis e marmitas para o dia seguinte”. Há uma sequência concreta para observar: planejar alguns pratos, comprar ingredientes, preparar e reaproveitar uma base.

| Oportunidade | Benefício possível | Custo e risco de atender | Decisão proposta |
| --- | --- | --- | --- |
| Refeições da semana em casa | Menos decisões, compras mais claras, menos retrabalho | Médio; aproveita a base existente | Foco inicial |
| Digitalizar caderno de família | Preservar receitas e compartilhar memórias | Baixo a médio; frequência de uso a validar | Boa porta de entrada; testar demanda por compra avulsa se não houver recorrência |
| Preparar marmitas para consumo próprio | Quantidades e sequência de preparo | Médio; depende de porções e planejamento | Caso de uso prioritário dentro do foco |
| Vender marmitas ou confeitaria | Ficha técnica, rendimento, custo e margem por produto | Alto; exige outra operação e outra proposta | Pesquisa separada, sem misturar ao primeiro produto |
| Dietas clínicas e alergias | Personalização com grande importância para o usuário | Alto; exige controles e validação especializada | Fora do posicionamento inicial |
| Conteúdo de criadores | Facilitar execução das receitas por seguidores | Médio; exige autorização e atribuição do conteúdo | Canal de aquisição após provar o uso semanal |

São avaliações estratégicas qualitativas, sem estimativa validada de tamanho de mercado ou disposição a pagar por segmento.

**A promessa proposta é: “Resolva as refeições da semana com as receitas que sua casa já gosta.”**

Complemento possível: “Escolha o que cozinhar, ajuste para sua casa e leve uma lista de compras pronta.”

O diferencial a testar combina cinco elementos: receitas familiares, medidas e ingredientes usados no Brasil, planejamento curto, reaproveitamento simples e aprendizado com o que a pessoa realmente cozinha. Português e preço em reais ajudam, mas não são proteção competitiva suficiente.

Com o uso, o produto pode acumular preferências explicitamente confirmadas, ajustes pessoais, semanas aprovadas e histórico do que funcionou. Esse conjunto torna a experiência mais conveniente. Exportação e acesso ao acervo devem continuar possíveis; retenção deve vir da utilidade.

Uma situação concreta: no domingo, a pessoa escolhe cinco jantares, informa que algumas refeições precisam render almoço no dia seguinte e recebe a lista consolidada. Na terça, encontra a receita e as porções já definidas. No fim da semana, marca o que funcionou e reaproveita parte do plano.

**A primeira versão comercial deve completar seis tarefas.**

| Tarefa | Entrega necessária | Evidência de que funcionou |
| --- | --- | --- |
| Colocar receitas no app | Importação de texto/foto existente, revisão clara e inclusão manual simples | A pessoa salva sua própria receita sem ajuda |
| Decidir a semana | Escolher de três a cinco refeições do acervo e atribuir dias; trocar e repetir refeições | Plano concluído sem assistência do fundador |
| Ajustar à casa | Rendimento e porções explícitos; quantidades editáveis | Lista e receita refletem as porções escolhidas |
| Saber o que comprar | Consolidar ingredientes compatíveis, separar por categoria e marcar “já tenho” | Lista utilizada numa compra real |
| Cozinhar | Página própria, etapas legíveis, progresso preservado e tela ligada quando suportado | Receita usada na cozinha, com confirmação posterior |
| Repetir o que deu certo | “Cozinhei”, “repetiria” e reaproveitamento do plano anterior | Pessoa volta espontaneamente na semana seguinte |

A IA deve ajudar em momentos específicos: extrair um texto, explicar uma ambiguidade ou sugerir uma substituição. Operações previsíveis, como multiplicar uma quantidade conhecida, não precisam de uma nova chamada paga.

A lista de compras exige cuidado: “2 ovos + 3 ovos” pode virar “5 ovos”; “1 xícara de farinha + 200 g de farinha” não deve ser somado sem uma conversão confiável e explícita. Manter o texto original e permitir correção é parte central do produto.

Para não exigir um acervo grande logo no início, oferecer uma pequena coleção inicial de receitas próprias ou autorizadas e revisadas. A pessoa deve conseguir fazer um primeiro plano com poucas receitas, refeições repetidas e campos livres.

**A entrada precisa demonstrar o benefício antes de pedir uma decisão de assinatura.**

Fluxo proposto:

1. Mostrar um exemplo concreto do resultado e oferecer “Organizar minha primeira receita”.
2. Fazer cadastro curto; não exigir escolher plano antes de experimentar.
3. Conceder três importações de demonstração, uma vez por conta verificada, com limites de custo e abuso.
4. Salvar uma receita própria e montar um plano curto; meta inicial: chegar ao primeiro resultado útil em até cinco minutos.
5. Demonstrar compras e preparo durante um teste de 14 dias, sem cartão.
6. Ao fim do teste, oferecer a assinatura para continuar o fluxo semanal completo.

Isso exige criar um direito de uso de demonstração separado no servidor. O código atual exige Pro para IA; a mudança deve ser implementada como regra explícita de produto, com reservas e limites, preservando as proteções de cobrança.

O gratuito pode manter o acervo manual limitado e a leitura das receitas existentes. Quem cancelar deve manter acesso e exportação do próprio acervo, com comportamento documentado. Não bloquear uma receita no meio do preparo porque o plano venceu.

O texto da página precisa acompanhar o que realmente está disponível. A demonstração atual promete rapidez, mas o caminho gratuito termina em digitação manual.

**Decisão aprovada: manter R$ 14,90/mês e R$ 149/ano.**

| Oferta | Proposta | Condição |
| --- | --- | --- |
| Demonstração | Três importações e 14 dias do fluxo semanal, sem cartão | Orçamento limitado; não é IA gratuita recorrente |
| Cozya Pro mensal | R$ 14,90/mês | Preço preservado por decisão do usuário; inclui planejamento, compras e preparo |
| Cozya Pro anual | R$ 149/ano | Preço preservado; 50 créditos liberados por mês |
| Validação | Medir adesão, uso e renovação com esses preços | Nenhum experimento de aumento de preço neste ciclo |
| Família | Compartilhamento com membros próprios, se a pesquisa mostrar necessidade | Não criar outro plano antes de implementar e validar colaboração |

Uma turma pequena não permite declarar um vencedor estatístico entre preços. Primeiro precisamos observar se as pessoas pagam e renovam por um benefício que já experimentaram.

O saldo técnico de IA pode continuar existindo. Na interface, a unidade precisa corresponder a algo compreensível, com custo mostrado antes da ação. Uma captura por voz deve ter preço total explícito; o usuário não deveria precisar entender transcrição e extração.

Eu manteria um limite claro de automações e revisaria os pacotes extras depois de medir uso. Não anunciaria uso ilimitado enquanto houver um teto efetivo. Planejamento manual, leitura, lista já criada e preparo devem continuar utilizáveis sem saldo de IA.

**A conta econômica precisa incluir mais que o modelo de IA.**

O código e a documentação mencionam margem de aproximadamente 93%, baseada sobretudo em receita menos custo estimado das chamadas. Isso não representa a margem completa: faltam processamento de pagamentos, Billing, infraestrutura, suporte, tributos, estornos, aquisição e trabalho humano.

A página geral da Stripe Brasil anuncia 3,99% + R$ 0,39 para cartões nacionais. O Billing anuncia 0,7% do volume, conforme modalidade contratada. Há divergência no componente fixo mostrado em outra página da própria Stripe; a tarifa da conta deve ser confirmada antes de fechar a projeção. A simulação abaixo usa R$ 0,39. Fontes: [Payments](https://stripe.com/br/pricing) e [Billing](https://stripe.com/br/billing/pricing).

| Simulação por cliente/mês | Pro mensal | Pro anual, mensalizado |
| --- | ---: | ---: |
| Receita | R$ 14,90 | R$ 12,42 |
| Cartão + Billing, premissas acima | R$ 1,09 | R$ 0,61 |
| Reserva ilustrativa de 6% para tributos | R$ 0,89 | R$ 0,75 |
| IA e buscas, hipótese | R$ 1,50 | R$ 1,50 |
| Operação variável e suporte, hipótese | R$ 1,50 | R$ 1,50 |
| Contribuição antes de custos fixos e aquisição | R$ 9,92 | R$ 8,06 |

Os 6% são apenas uma variável da simulação, sem afirmar alíquota aplicável à empresa. IA e suporte não foram medidos com usuários reais. No anual, a tarifa fixa é aplicada uma vez sobre R$ 149 e depois dividida por 12. A contribuição não é lucro líquido.

Se o custo de IA for R$ 5,00 por cliente, em vez de R$ 1,50, a contribuição mensal cai de aproximadamente R$ 9,92 para R$ 6,42. É necessário medir o custo completo por tarefa, incluindo pesquisa, transcrição, tentativas adicionais e processamento.

Exemplo de escala, sem caráter de previsão: 500 assinaturas mensais de R$ 14,90 representam R$ 7.450 de receita mensal e cerca de R$ 4.960 de contribuição sob essas premissas, antes de desenvolvimento, custos fixos e aquisição.

**A aquisição inicial deve trazer pessoas com o problema, com acompanhamento próximo.**

Começar com 20 a 30 casas recrutadas em comunidades acessíveis ao time, sem enviar mensagens ou publicar campanhas nesta revisão. Pedir participação de quem realmente decide e prepara refeições. Amigos podem ajudar na usabilidade, mas não devem ser a única origem dos clientes.

| Canal a testar | Oferta concreta | Como avaliar |
| --- | --- | --- |
| Demonstrações em vídeo | Do print à receita; de três receitas à lista | Cadastros que chegam ao primeiro plano e voltam |
| Criadores pequenos de cozinha cotidiana | Executar uma semana de receitas próprias ou autorizadas | Pagantes e retenção por criador |
| Compartilhamento de receita | Página com autoria, prévia e “salvar no meu Cozya” | Destinatários que salvam e posteriormente usam |
| Conteúdo de busca | Guias específicos para organizar refeições e marmitas | Pessoas que usam o fluxo, não apenas visitas |
| Indicação pessoal | Benefício limitado depois de uma indicação ativada | Custo por pagante e renovação |

Não usaria publicidade em escala antes de medir retenção. Com tíquete baixo, o custo de aquisição pode consumir rapidamente a contribuição.

Meta ilustrativa: retorno do custo de aquisição em até três meses de contribuição. Na simulação de R$ 9,92/mês com o preço preservado, isso sugere aproximadamente R$ 29,76 como teto inicial por cliente adquirido. Descontos, suporte de onboarding e cancelamentos antecipados reduzem esse teto. Ainda não há dados para estimar valor de vida do cliente.

**O piloto deve ter critérios de decisão definidos antes dos resultados.**

Entrevistar 12 a 15 pessoas do público, pedindo que mostrem a última semana: como escolheram refeições, onde estavam as receitas, como compraram e o que deixou de funcionar. Observar ações recentes é mais útil que perguntar apenas se “pagariam por um app”.

Depois, acompanhar uma turma de 30 casas por quatro semanas. Fazer uma conversa inicial e permitir uso independente; registrar intervenções do time para não confundir um serviço manual com um produto autônomo.

| Indicador | Definição | Meta exploratória |
| --- | --- | --- |
| Ativação | Salvou uma receita própria, planejou três refeições e gerou a lista em até sete dias | 18 de 30 casas |
| Retorno na quarta semana | Repetiu o ciclo semanal nessa semana | Pelo menos 9 das 18 ativadas |
| Uso real | Relatou ter preparado ao menos três refeições apoiadas pelo app na semana | Observar crescimento durante o piloto |
| Pagamento | Pagou o primeiro mês após experimentar | Pelo menos 6 de 30 convidadas |
| Renovação | Pagou novamente depois de um ciclo mensal completo | Pelo menos 4 dos 6 primeiros pagantes |
| Experiência | Completa as tarefas sem intervenção do time | Investigar individualmente toda falha recorrente |
| Economia | Custo variável medido deixa contribuição positiva | Revisar por cliente típico e por uso alto |

Esses números são critérios propostos para orientar o investimento, não médias de mercado. Mostrar também contagens e motivos individuais: amostras pequenas têm grande incerteza. A renovação só pode ser avaliada depois de transcorrido o período de pagamento.

Métrica principal: casas que prepararam pelo menos três refeições na semana com apoio do Cozya. Marcar “cozinhei” é um relato do usuário; abrir uma receita não prova que ela foi preparada. Medir também minutos gastos planejando e problemas evitados, sem anunciar economia financeira antes de medi-la.

Eventos mínimos: primeira receita salva, plano concluído, lista criada/utilizada, preparo iniciado, preparo confirmado, repetição do plano, oferta vista, checkout concluído e renovação. Eventos não precisam carregar o texto da receita nem informações alimentares pessoais.

Se houver muita captura e pouco retorno, considerar um produto de digitalização/acervo com cobrança avulsa. Se houver retorno e pouco pagamento, investigar valor exclusivo e substitutos gratuitos antes de baixar o preço. Se as pessoas pagarem só enquanto recebem acompanhamento intenso, ainda não validamos a assinatura do software.

**A execução pode ser dividida em entregas pequenas, condicionadas à evidência.**

Estimativa de planejamento: uma pessoa de desenvolvimento dedicada e participação do fundador em pesquisa e produto. Não é orçamento fechado; depende das descobertas do piloto e da profundidade das correções.

| Período sugerido | Entrega | Critério para seguir |
| --- | --- | --- |
| Semanas 1–2 | Entrevistas, correções de confiança, alinhamento de créditos e privacidade, definição de eventos e teste da proposta | Problema frequente demonstrado e participantes recrutados |
| Semanas 3–5 | Dados de porções e ingredientes, plano manual curto, lista consolidada, modo de preparo e demonstração limitada | Ciclo principal executável com os dados reais dos participantes |
| Semanas 6–9 | Piloto de quatro semanas e primeira cobrança; ajustes semanais de usabilidade | Uso independente, retorno e primeiros pagamentos |
| Semanas 10–12 | Observar renovações, medir custo, testar um canal e decidir próximo investimento | Evidência suficiente para manter, restringir ou mudar a hipótese |

Entrada por URL é uma extensão valiosa, mas deve ser priorizada conforme o material real recebido no piloto. Começar por páginas públicas de receita com extração previsível. Importar vídeos de todas as redes, colaboração em tempo real, despensa automática, informação nutricional clínica, marketplace, aplicativos nativos e grandes catálogos ficam para decisões posteriores.

O armazenamento atual em texto é a maior dependência para planejamento e compras. A evolução deve preservar as receitas existentes e adicionar estrutura de forma gradual. O acervo continua funcionando enquanto os novos campos são preenchidos ou revisados.

**A decisão que proponho agora é financiar um piloto de utilidade semanal.**

Preservar a base existente, corrigir os problemas de confiança e entregar o caminho receita → semana → compras → preparo → repetição. Manter R$ 14,90/mês e R$ 149/ano, conforme aprovado, e decidir a expansão pela combinação de uso, pagamento e renovação.

Não há garantia de que essa direção vai vender. Há um problema observável, uma base técnica útil e um experimento concreto para descobrir se o Cozya faz diferença suficiente na rotina para merecer uma assinatura.

O [review técnico e as verificações](review-tecnico.md) detalham o que foi observado. As telas examinadas estão em [landing mobile](evidence/landing-mobile.png) e [dashboard mobile](evidence/dashboard-mobile.png).
