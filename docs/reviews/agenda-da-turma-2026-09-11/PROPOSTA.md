# Agenda da Turma — proposta de produto e comercialização

**Data:** 11/09/2026. **Decisão recomendada:** validar uma assinatura familiar que transforme recados escolares em providências claras, com lembretes e divisão de responsabilidades. Concentrar o próximo ciclo em um piloto pago; investir em aquisição em escala depois de observar renovação.

Esta proposta combina revisão do código, navegação no produto, verificações locais e pesquisa de fontes oficiais. O detalhamento dos problemas está na [revisão do aplicativo](REVISAO.md), com [fontes de mercado e integração](FONTES.md) e [evidências de verificação](evidence/README.md). Nenhuma melhoria descrita aqui foi implementada nesta revisão.

## 1. O diagnóstico comercial

O app tem uma base funcional aproveitável: perfis de filhos, turmas, matérias, rotina semanal, atividades extracurriculares, calendário, conclusão de atividades, importação por foto/PDF/voz e assinatura. O principal problema comercial é que essa coleção de recursos ainda exige bastante organização manual e depende de a pessoa voltar ao aplicativo para acompanhar a rotina.

O cliente informado ainda não tem usuários pagantes. Portanto, preço, retenção e público comprador são hipóteses, não resultados comprovados. A quantidade e o comportamento de usuários gratuitos não foram informados.

O caso concreto trazido pelo fundador é especialmente útil: os recados chegam pelo **Teams e Batista ID**, principalmente como **mensagens e publicações com anexos**. Isso aponta para um trabalho recorrente: abrir canais diferentes, interpretar o texto e o documento, separar os filhos, descobrir o que exige uma ação, lembrar na antecedência certa e combinar quem fará cada coisa.

**Proposta de valor:** “Transforme os recados da escola em um plano claro para a família: o que fazer, até quando e quem cuida.”

A promessa deve ser demonstrável em poucos minutos. “70 créditos de IA” pode explicar uma franquia no plano, mas dificilmente será o principal motivo da compra. O resultado que merece o pagamento é menos trabalho para organizar a semana e mais confiança de que as providências foram identificadas.

## 2. Mercado: com quem disputamos tempo e dinheiro

| Alternativa | O que a família já consegue | Implicação para a Agenda da Turma |
| --- | --- | --- |
| Batista ID | A escola divulga comunicados, calendário, acompanhamento de filhos e respostas a avisos; o serviço é apresentado como gratuito para os responsáveis. [Fonte](https://colegiobatistamineiro.com.br/batista-id/) | Repetir o mural e o calendário oferece pouco valor adicional. Agregar fontes e organizar as providências em casa é uma hipótese mais forte. |
| ClassApp e Agenda Edu | Produtos de comunicação e operação escolar, comercializados para instituições; as páginas consultadas não deram um preço público comparável a uma assinatura familiar. [ClassApp](https://www.classapp.com.br/), [Agenda Edu](https://www.agendaedu.com/) | Vender primeiro para escolas exigiria outro comprador, implantação e negociação. Começar pelas famílias reduz essa dependência. |
| Cozi e TimeTree | Calendários familiares compartilhados; há funções gratuitas e planos pagos. O TimeTree anuncia Premium a US$ 4,49/mês ou US$ 44,99/ano, sujeito à região. [Cozi](https://www.cozi.com/compare-plans/), [TimeTree](https://timetreeapp.com/intl/en/premium) | Calendário e compartilhamento isolados são uma diferenciação fraca. A entrada de informações precisa ser muito mais fácil. |
| Ohai e Jam | Organização familiar com interpretação de documentos, imagens ou mensagens e coordenação da rotina. O Ohai anuncia plano pago a partir de US$ 9,99/mês. [Ohai](https://www.ohai.ai/), [Jam](https://www.jamfamilycalendar.com/jaime) | Há ofertas comerciais próximas da tese proposta. Isso comprova a existência da categoria; não comprova disposição de pagar no Brasil. |
| ClassDojo Plus | A comunicação central com professores permanece gratuita; o plano pago adiciona benefícios para a família. [Fonte](https://www.classdojo.com/en-us/plus/) | Receber uma colaboração gratuitamente pode ajudar a distribuição. Cobrar de ambos os lados antes de demonstrar valor dificulta o crescimento. |
| Google Calendar e organização manual | Calendário compartilhado de família. [Fonte](https://support.google.com/calendar/answer/7157782?hl=en-GB) | O teste decisivo é se importar, revisar e acompanhar no Agenda dá menos trabalho do que o processo atual. |

Os preços estrangeiros são referências de oferta, sem conversão cambial e sem inferência automática de preço brasileiro. As características acima são divulgadas pelos próprios fornecedores; não medimos a qualidade desses concorrentes.

O Inep informou 46 milhões de matrículas na educação básica e 25,8 milhões no ensino fundamental no Censo Escolar 2025. Esse número contextualiza o setor, mas **matrículas não equivalem a famílias compradoras**, muito menos a receita potencial alcançável. Para este estágio, encontrar 30 famílias com dor recorrente é mais útil que produzir um grande TAM por multiplicação. [Inep, publicado em 11/08/2026](https://www.gov.br/inep/pt-br/centrais-de-conteudo/noticias/censo-escolar/conheca-o-perfil-dos-46-milhoes-de-estudantes-da-educacao-basica-no-dia-do-estudante)

## 3. Público e comprador iniciais

Priorizar responsáveis por crianças do ensino fundamental, começando pelo 1º ao 7º ano, que recebam pelo menos três recados acionáveis por semana em mais de uma fonte. O recorte é uma hipótese de recrutamento, não um limite definitivo de mercado.

O comprador é o adulto que hoje concentra a organização. O benefício precisa funcionar com um único filho; múltiplos filhos e cuidadores aumentam a utilidade, mas não podem ser a única justificativa da assinatura. Incluir famílias com rotinas e arranjos de cuidado diferentes, com permissão de acesso por criança.

Primeiro canal: recrutamento pelo fundador e indicação consentida entre responsáveis. Representantes de turma podem apresentar o produto e compartilhar atividades, sem se tornarem responsáveis por alimentar diariamente um sistema coletivo. Conversas com escolas e com a Layers são uma segunda frente, condicionada a evidência de uso e pagamento.

## 4. O produto que vale construir

### 4.1. Entrada única para recado e anexo

Criar a ação principal **“Organizar um recado”**, aceitando texto colado, imagem ou PDF. Permitir que a pessoa junte a publicação e seu anexo no mesmo envio: a data pode estar na mensagem e as instruções no arquivo. Reaproveitar os parsers existentes, acrescentando contexto de origem e revisão.

O fluxo deve identificar ações distintas: entregar trabalho, levar material, estudar para prova, participar de evento e responder autorização. Matéria e turma podem ser opcionais para recados administrativos; criança, contexto e ação não precisam depender de um cadastro completo de disciplinas.

**Exemplo fictício:** uma publicação diz que o passeio será na sexta às 7h, a autorização precisa ser respondida até quarta e o PDF orienta levar garrafa e lanche. O resultado deve separar:

- Responder à autorização até quarta, com acesso ao comunicado oficial.
- Preparar garrafa e lanche na quinta à noite.
- Passeio na sexta às 7h, com local e criança envolvidos.

A pessoa revisa antes de salvar. Se o prazo não estiver no conteúdo, mostrar **“Prazo não informado”** e permitir uma sugestão explícita de planejamento. Diferenciar data informada pela escola, data interpretada de uma expressão relativa e data escolhida pela família. Uma publicação de terça-feira não significa automaticamente entrega na terça-feira.

Guardar referência à fonte, trecho que fundamenta a ação e histórico de alterações. A preservação de arquivos completos exige acesso privado, política de retenção e exclusão; coletar somente o necessário. Links privados do Teams ou Batista podem exigir login e não dão, por si só, acesso ao conteúdo para a importação.

### 4.2. Uma tela que organiza o próximo dia

Trocar o protagonismo do calendário mensal por uma lista móvel orientada à rotina:

- **Precisa de atenção:** prazo sem confirmação, alteração da escola ou autorização próxima de vencer.
- **Preparar para amanhã:** materiais, mochila, atividades e compromissos de todos os filhos autorizados.
- **Próximos sete dias:** provas, entregas e eventos com preparação antecipada.
- **Quem vai cuidar:** responsável, pendência e conclusão compartilhada.

Manter calendário mensal, filtros por criança e as rotinas extracurriculares já existentes. O resumo deve condensar as ações e permitir abrir o original; não basta reproduzir o mural inteiro.

### 4.3. Lembretes e coordenação familiar

Entregar um resumo configurável no fim do dia e lembretes ligados ao tipo de ação. Um evento às 7h pode demandar preparo na véspera; uma autorização tem prazo diferente da data do passeio. Incluir horários silenciosos, cancelamento de lembretes após conclusão e proteção contra envios repetidos.

Começar por e-mail e adicionar push com a experiência de ativação adequada. No iOS/iPadOS, Web Push depende de condições como app adicionado à tela inicial e autorização do usuário; a instalação precisa fazer parte do fluxo, e não ser presumida. [WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)

Introduzir uma família com dois adultos usando **logins próprios**, convite revogável e acesso definido por criança. Hoje o app usa perfis de crianças subordinados a uma conta de adulto, o que não resolve essa colaboração. Atribuir uma providência deve ficar visível para os adultos autorizados; um simples “visto” não deve significar “feito”.

Marcar “feito em casa” não equivale a entregar trabalho no Teams ou enviar autorização à escola. Essas ações oficiais continuam explícitas e acessíveis pela fonte. Não prometer envio oficial ou acompanhamento de alterações em importações manuais.

### 4.4. Confiabilidade como parte do benefício pago

Detectar reimportações e apresentar possíveis duplicatas antes de criar outra atividade. Uma correção deve exibir “o prazo mudou de X para Y”, preservar a versão anterior e atualizar lembretes. No compartilhamento entre famílias, alterações não podem apagar a conclusão ou observação privada de cada uma.

Criar uma coleção de avaliação com recados autorizados e anonimizados: textos, capturas, PDFs, mensagens com anexos, documentos repetidos e retificações. Avaliar se extraiu todas as ações relevantes, para a criança correta e com datas fundamentadas. Testes de schema não medem esses resultados.

O diferencial defensável pode surgir da combinação de adaptação ao contexto escolar brasileiro, tratamento confiável de fontes, distribuição entre famílias e aprendizado sobre exceções. O uso de um modelo de IA, isoladamente, é facilmente replicável. Essa vantagem ainda precisa ser construída e validada.

## 5. Teams e Batista ID: plano realista de integração

| Caminho | O que fazer | Condição para avançar |
| --- | --- | --- |
| Importação manual assistida | Colar a publicação e anexar seu arquivo ou captura; registrar origem e link; revisar ações. | Pode começar sem acordo institucional. Medir se o esforço é suficientemente baixo para gerar uso recorrente. |
| Teams: publicações em canais | Fazer prova técnica de leitura de mensagens, respostas, imagens incorporadas, anexos e alterações; tratar paginação e reconciliação. | Conta com acesso legítimo, permissões e política da instituição. A API de canais não aceita conta pessoal Microsoft nesse fluxo; avaliar consentimento restrito ao recurso quando aplicável. |
| Teams: mensagens em chats | Identificar no piloto quanto conteúdo chega em chat e avaliar o fluxo específico. | Não assumir que um conector de canais cobre chats privados. |
| Batista ID / Layers | Validar com o programa oficial da Layers quais dados e comunicados do Batista podem ser acessados por um app autorizado, por responsável e por criança. | Acesso técnico/comercial, escopos de leitura, anexos, alterações e homologação confirmados. SSO sozinho não comprova acesso aos recados. |
| Calendário pessoal | Oferecer posteriormente assinatura de calendário por link privado revogável. | Explicar direção única e possível atraso de atualização. Sincronização bidirecional é outro projeto. |

A documentação do Graph distingue publicações e respostas e prevê permissões específicas para leitura. Portanto, uma integração centrada em **Atribuições** não atende ao caso informado pelo usuário. [Microsoft: mensagens de canal](https://learn.microsoft.com/en-us/graph/api/channel-list-messages?view=graph-rest-1.0), [consentimento por recurso](https://learn.microsoft.com/en-us/microsoftteams/platform/graph-api/rsc/resource-specific-consent)

A listagem do Batista ID 2.0 associa o suporte à Layers, que possui um programa oficial de integração para startups. Isso justifica investigar uma parceria, mas ainda **não valida uma API disponível para ler os comunicados particulares dessa escola**. [Batista ID 2.0](https://apps.apple.com/br/app/batista-id-2-0/id6467039057), [programa da Layers](https://developers.layers.education/content/quickstart/layers.html)

WhatsApp pode ser avaliado depois como canal de entrega de resumos se os usuários pedirem. No caso informado, Teams e Batista são as fontes prioritárias. Um canal comercial de mensagens também traz custo variável; não oferecer disparos ilimitados sem medir esse custo. [WhatsApp Business](https://whatsappbusiness.com/products/platform-pricing/)

## 6. Oferta e preço para testar

**Manter inicialmente R$ 19,90/mês e R$ 199/ano**, valores configurados hoje no código. O teste deve melhorar o benefício e a experiência antes de atribuir a falta de vendas ao preço. O preço anunciado em produção e a cobrança efetiva precisam permanecer coerentes; não fizemos compra real nesta revisão.

| Elemento | Gratuito proposto | Família proposto |
| --- | --- | --- |
| Organização | Um filho; até 20 atividades próprias pendentes; histórico preservado. | Até três filhos; atividades sem esse limite. |
| Experiência inicial | Cinco importações de texto/foto/PDF por conta verificada, sem cartão, para testar o resultado. | Franquia mensal inicialmente baseada na economia atual de 70 créditos; apresentar estimativa compreensível de uso. |
| Colaboração | Receber e revisar atividades compartilhadas da turma sem assinatura. | Dois adultos da família com logins próprios, responsabilidades e coordenação. |
| Acompanhamento | Consulta da agenda e informações já salvas. | Resumos, lembretes configuráveis, preparação da semana e, em etapa posterior, calendário pessoal. |

O limite de cinco importações é hipótese para o piloto. Estabelecer teto de custo e proteção contra abuso no servidor; a liberação exige mudar os bloqueios de assinatura tanto no parser quanto na gravação em lote. Mostrar claramente o consumo de voz, que hoje custa mais, se ela entrar na experiência gratuita.

O limite gratuito de atividades pendentes substitui a lógica atual de contar registros criados, inclusive concluídos. Isso permite que o app continue útil sem exigir apagar o histórico. Depois de cancelar, informações próprias e compartilhamentos já aceitos devem continuar consultáveis; limitar novas automações é mais compreensível que fazer compromissos sumirem da tela.

Cobrar por família aumenta o benefício sem multiplicar a mensalidade para cada responsável. Se o piloto mostrar que a participação do segundo adulto é essencial à ativação, testar também acesso básico gratuito desse adulto antes de fixar a regra comercial.

Após observar renovação, testar R$ 29,90 em uma nova oferta/coorte com o benefício completo, deixando preço e condições claros. Com dez compradores, comparar entrevistas, uso e compras reais; não apresentar o resultado como teste estatisticamente conclusivo. Não usar a contratação anual para mascarar ausência de retenção mensal.

**Economia unitária — cenário ilustrativo, não previsão:** R$ 19,90 de receita mensal e custo variável total de 25% deixam aproximadamente R$ 14,93 por mês antes de custos fixos. Um limite de aquisição equivalente a três meses dessa contribuição seria cerca de R$ 44,78. O percentual de 25% é uma meta hipotética que precisa incluir IA, meios de pagamento, tributos variáveis, mensagens, suporte variável e estornos; ele não foi medido.

A assinatura anual de R$ 199 corresponde a R$ 16,58 de receita mensal equivalente, antes desses custos. Medir por família o custo mediano e dos usuários de maior consumo, principalmente PDFs, tentativas e atendimento. Definir franquias a partir dessas medições. Não comprar tráfego em escala antes de conhecer contribuição, cancelamento e renovação.

## 7. Plano de execução e critérios de decisão

Estimativa de sequência para um desenvolvedor experiente com apoio parcial do fundador em produto, entrevistas e suporte. As faixas são de planejamento; os itens precisam de decomposição e estimativa técnica antes de virar compromisso de entrega. Autorização de plataformas externas pode ampliar bastante o prazo.

| Fase | Entrega prioritária | Resultado para decidir o próximo passo |
| --- | --- | --- |
| Semana 1 | Dez entrevistas com demonstração do processo atual; selecionar amostras; fechar recorte; corrigir ou conter os riscos de confiança mais graves descritos na revisão. | Confirmar frequência da dor e identificar dois ou três tipos de ação dominantes. |
| Semanas 2–4 | Fluxo recado + anexo, origem, revisão de datas, pequena experiência gratuita, lista de próximos passos e primeiro resumo por e-mail. Configuração progressiva por filho. | Pelo menos 20 de 30 famílias recrutadas chegam a um primeiro resultado útil. Se o esforço de importação impedir uso, resolver entrada antes de ampliar recursos. |
| Semanas 5–8 | Consolidar uso recorrente, dois adultos, lembretes confiáveis, correção/duplicatas e cobrança do piloto. Ajustar a oferta pelos dados. | Observar pagamento e primeira renovação de uma coorte mensal. |
| Semanas 9–12, condicionado | Escolher um próximo investimento: prova técnica de conector prioritário ou ampliação do canal de aquisição que funcionou. Calendário pessoal entra conforme demanda. | Escalar somente com sinal de utilidade recorrente e custos sustentáveis. |

Antes de convidar famílias reais, corrigir a data inferida sem identificação e o limite de ingresso em turmas; se a correção coletiva demorar, manter compartilhamento fora do piloto até ter controle de acesso adequado. Antes de cobrar, garantir cancelamento, acesso ao histórico, exclusão de conta e clareza da oferta. Lembretes, tratamento de falhas e confiabilidade da importação são requisitos de produto, não acabamento opcional.

Não colocar neste primeiro ciclo: ERP escolar, boletim, cobrança escolar, marketplace, tutor que resolve deveres, rede social, gamificação ampla, aplicativo nativo reescrito e sincronização bidirecional com várias plataformas ao mesmo tempo. Manter voz e extras existentes quando úteis; priorizar mensagens com anexos conforme o caso observado.

## 8. Piloto que testa compra e permanência

Recrutar **30 famílias qualificadas**, incluindo algumas fora do círculo próximo do fundador. A família do fundador ajuda a descobrir problemas, mas não deve contar como prova independente de demanda. Pelo menos parte da amostra deve usar Teams e/ou Batista; outras fontes permitem testar se a necessidade se repete.

Metas propostas para decidir, **sem tratá-las como benchmarks de mercado**:

- **Ativação:** 20 das 30 famílias importam um recado real, confirmam pelo menos duas ações corretas e configuram um lembrete. Buscar menos de três minutos a partir do conteúdo disponível; medir o tempo real.
- **Recorrência:** pelo menos metade das ativadas realiza ações úteis em duas semanas consecutivas, chegando à quarta semana. Contar importação confirmada, providência organizada e conclusão, não apenas abertura de página.
- **Pagamento:** dez famílias contratam de fato a oferta mensal após experimentar. Elogios, intenção de compra e lista de espera não substituem pagamento.
- **Renovação:** pelo menos seis dessas dez renovam uma vez e explicam uma utilidade concreta recorrente. É um sinal inicial, ainda insuficiente para estimar retenção de longo prazo.
- **Confiança:** nenhuma data sem fundamento é apresentada como confirmada. Revisar erros de prazo e criança individualmente; acompanhar precisão e cobertura das ações em amostras anotadas.
- **Economia:** custo por família e tempo de suporte cabem na contribuição planejada, inclusive nos casos de maior consumo.

Se a importação funciona, mas não há retorno semanal, investigar utilidade de lembretes e frequência real da dor. Se há uso frequente sem compra, testar benefício pago e preço. Se só funciona quando o fundador organiza manualmente tudo, medir esse esforço e ajustar a experiência; eventual operação assistida deve ser explicada aos participantes.

Instrumentar um funil simples: visita qualificada → cadastro → importação iniciada → importação revisada e salva → lembrete configurado → convite aceito → ação útil semanal → pagamento → renovação/cancelamento. Registrar metadados de produto, sem texto dos recados nem nomes de crianças nos eventos analíticos.

Perguntas de entrevista: “Mostre os últimos recados que exigiram algo de você”; “Como decidiu o que fazer e quando?”; “O que ficou para trás?”; “Quem mais precisa acompanhar?”; “O que você deixaria de usar se adotasse este produto?”. Depois da experiência, apresentar uma oferta concreta e observar a decisão de compra.

## 9. Como apresentar para vender

**Título proposto:** “Os recados da escola, organizados para sua família.”

**Explicação:** “Envie a mensagem e o anexo. Revise os prazos e veja o que preparar para os próximos dias.”

**Demonstração:** mostrar um recado fictício com três providências virando uma lista por criança, com prazo, origem e responsável. Usar o mesmo exemplo no vídeo curto e no primeiro uso. A chamada inicial pode ser “Organizar meu primeiro recado”, com preço e limites de teste visíveis.

Após implementar e verificar lembretes, acrescentar essa entrega à promessa. Exibir prova social somente quando houver relatos autorizados de usuários reais. Remover agora “Mais escolhido” e “Mais popular”, que sugerem preferência observada apesar de ainda não haver pagantes, e corrigir o selo de desconto anual.

Conteúdo de aquisição pode mostrar situações concretas: preparar material, organizar semana de provas, responder passeio e dividir tarefas entre adultos. Testar indicação após o primeiro resultado útil. Parcerias institucionais ficam mais convincentes com exemplos reais de ativação, renovação e economia operacional — sem alegar parceria com Teams, Batista ou Layers antes de existir.

## 10. O que ainda precisamos aprender

Continuam em aberto: quantidade e retenção de usuários gratuitos; volume e formatos reais dos recados; disponibilidade de responsáveis para fornecer amostras autorizadas; frequência de edição das publicações; acesso permitido pela escola ao Teams; escopos efetivos da Layers; custo da IA em uso real; capacidade da equipe; disposição de pagar e renovar.

A revisão identifica uma direção plausível e os principais obstáculos para testá-la. A decisão de investimento recomendada é construir e medir o ciclo completo de **recado → providência → lembrete → conclusão**, com fontes rastreáveis, antes de expandir a lista de funcionalidades.
