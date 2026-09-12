# Agenda da Turma — revisão do aplicativo

**Data:** 11/09/2026. **Escopo:** produto, aquisição, primeiro uso, interface móvel, acessibilidade por teclado, modelo de dados, autorização, IA, cobrança e verificações locais. Leia também a [proposta de evolução e venda](PROPOSTA.md).

O app tem uma base aproveitável, mas ainda não demonstrou disposição de pagar nem retenção. A prioridade é tornar confiável e simples a transformação de recados escolares em ações da família. Os achados abaixo não representam uma auditoria de segurança exaustiva nem certificação de produção.

## Método e limites

- Leitura do app e dos pacotes compartilhados diretamente envolvidos, incluindo autenticação, banco, IA, configuração de produtos e billing.
- Navegação na página pública de produção, sem criar conta ou efetuar compra em produção.
- Navegação autenticada local com conta, criança, escola, turma e atividade fictícias, exclusivamente para esta revisão. Cadastro, OTP por e-mail em sandbox, escolha Free, criação de criança, calendário, edição e conclusão foram exercitados.
- Execução dos testes unitários do app e do billing, typecheck do app e Biome sobre o código-fonte do app.
- Sonda transacional no banco local para verificar a restrição de exclusão de conta; a sonda foi revertida.
- Pesquisa em páginas oficiais dos fornecedores e documentação técnica; nenhum conector autenticado de Teams/Batista foi testado.

Não foram executados build completo, suíte E2E completa, medição de Core Web Vitals, teste de carga, compra real Stripe ou avaliação de precisão com recados reais das escolas. O código local pode divergir da versão publicada; os achados de código são da cópia examinada. As [evidências](evidence/README.md) distinguem observação, reprodução e inferência.

## O que já existe e deve ser aproveitado

| Área | Base encontrada | Avaliação |
| --- | --- | --- |
| Organização escolar | Filhos, escola/turma, disciplinas, atividades, calendário, filtros e estados de conclusão. | Reutilizar; reduzir cadastros obrigatórios antes do primeiro valor. |
| Rotina | Dias de aula, alternância de horários e atividades extracurriculares, inclusive pausas e fins de semana. | Já existe parte relevante da rotina; a proposta deve integrá-la ao resumo diário. |
| IA | Entrada por voz, foto e PDF; extração estruturada, normalização e confirmação em lote. | Bom ponto de partida; origem, incerteza e avaliação de precisão precisam melhorar. |
| Cobrança | Assinaturas, checkout, portal, créditos, reserva/consumo/liberação, webhooks e rotinas de billing. | Evitar reescrever. Validar comportamento de negócio e pós-cancelamento. |
| Engenharia | Validações de entrada, verificações de posse/vínculo em serviços, constraints, transações, paginação, logs e testes. | Há cuidado técnico real. Testes atuais não substituem avaliação dos fluxos de produto. |

O domínio atual vincula perfis de crianças a um usuário adulto. Não foi encontrada uma estrutura funcional de família com dois adultos autorizados sobre os mesmos perfis. Documentação genérica de organizações no monorepo não deve ser confundida com essa funcionalidade implementada no Agenda.

## Achados prioritários

**P0:** resolver ou conter antes de expor o fluxo afetado a famílias reais. **P1:** necessário para a oferta paga proposta ou para confiança e retenção. **P2:** melhoria subsequente de consistência e operação. A prioridade combina impacto no usuário e no negócio; não é uma classificação formal de vulnerabilidade.

### R01 — P0: datas inferidas parecem datas informadas

**Evidência de código.** O enriquecimento propaga uma data única para atividades sem prazo, usa o próximo dia de aula e, por fim, preenche o próximo dia útil. O prompt de PDF instrui o modelo a usar amanhã quando não houver data. Esses caminhos inclusive têm regras diferentes para fins de semana. O schema e o formulário não identificam claramente a procedência do prazo.

**Impacto:** a família pode aceitar uma data plausível que não foi estabelecida pela escola. A confirmação manual atual permite edição, mas não chama atenção para a inferência. Um erro dessa natureza compromete a principal promessa comercial.

**Proposta:** preservar prazo ausente; mostrar origem e incerteza; separar sugestão de planejamento de prazo oficial; basear expressões relativas na data/contexto do recado. Não transformar data da postagem em prazo automaticamente.

**Aceite:** um recado sem prazo permanece como “não informado”; duas ações com prazos diferentes não recebem uma data comum indevidamente; datas inferidas exigem confirmação explícita; casos de sexta-feira e publicação antiga entram na avaliação.

Fontes: [enrich.ts, linhas 182 e 268](../../../apps/agenda-da-turma/src/ai/activities-parser/enrich.ts#L182), [prompt PDF, linha 68](../../../apps/agenda-da-turma/src/features/ai/parse-activities-pdf-service.ts#L68), [schema](../../../apps/agenda-da-turma/src/ai/activities-parser/schema.ts), [confirmação, linha 581](../../../apps/agenda-da-turma/src/features/activities/components/activities-batch-confirm-dialog.tsx#L581).

### R02 — P0: conhecer os dados públicos de uma turma permite ingresso

**Evidência de código.** O fluxo criar/entrar busca a turma pelo conjunto escola, série, ano e letra e adiciona o perfil à turma existente. Esse caminho não exige o código de convite nem aprovação de um responsável pelo grupo.

**Impacto:** o vínculo interno existe, mas não comprova vínculo real com a escola/turma. Uma pessoa pode ganhar acesso ao contexto compartilhado apenas conhecendo dados públicos. Não foi demonstrado acesso a perfis privados de crianças de outras contas; o problema confirmado é a fronteira de ingresso no grupo.

**Proposta:** separar localização de escola e grupo privado; ingresso por convite revogável ou aprovação; definir administração e permissões sobre conteúdo coletivo. Incluir turno na identificação quando necessário: hoje ele não participa da chave, o que pode misturar turmas com a mesma série/letra em turnos diferentes.

**Aceite:** uma conta não convidada não ingressa em grupo privado ao repetir os dados escolares; revogação corta o acesso correspondente; conhecer o cadastro público da escola não concede permissão ao grupo.

Fontes: [service.ts, linhas 44–63](../../../apps/agenda-da-turma/src/features/turmas/service.ts#L44), [repository.ts, linha 35](../../../apps/agenda-da-turma/src/features/turmas/repository.ts#L35), [chave de turma, linha 107](../../../packages/db/src/schema/agenda.ts#L107).

### R03 — P1: exclusão de conta de criador de turma é bloqueada

**Reproduzido no banco local.** Uma exclusão de usuário que criou turma falha com código PostgreSQL `23503`, constraint `turmas_created_by_user_id_users_id_fk`. A sonda usou dados sintéticos e rollback. O schema também mantém referências de criador em outras entidades. O hook de exclusão do app cuida de billing, sem uma política de tratamento desses vínculos da agenda.

**Impacto:** a opção de excluir conta pode falhar conforme o histórico do usuário. Tampouco foi encontrado um caminho visível para exclusão nas telas navegadas.

**Proposta:** definir exclusão de dados privados e anonimização/transferência de autoria de conteúdo coletivo, conforme sua finalidade e retenção. Não aplicar cascade indiscriminado que apague compromissos de outras famílias. Disponibilizar o fluxo na conta.

**Risco adicional de código, não reproduzido com Stripe:** falhas parciais de cancelamento de assinatura são registradas sem interromper o hook; o pacote de autenticação tolera erros de limpeza salvo configuração explícita. Projetar estado recuperável e reconciliação para não excluir a conta deixando cobrança ativa inadvertidamente.

**Aceite:** exclusão de criador com conteúdo compartilhado termina de forma previsível; dados privados são tratados; compartilhamentos de terceiros não somem; falha de billing tem recuperação verificável e informação clara para a pessoa.

Fontes: [schema, linha 100](../../../packages/db/src/schema/agenda.ts#L100), [auth do app, linha 115](../../../apps/agenda-da-turma/src/lib/auth.ts#L115), [tratamento do hook, linha 608](../../../packages/auth/src/index.ts#L608), [resultado da sonda](evidence/README.md).

### R04 — P1: perder o Pro oculta atividades já aceitas

**Evidência de código.** Calendário, dashboard e listagem filtram atividades de outros criadores quando a conta deixa de ser Pro. Os registros podem continuar no banco, mas deixam de aparecer nessas consultas.

**Impacto:** após cancelamento ou perda de elegibilidade, uma família pode perder visibilidade de um compromisso já incorporado à rotina. “Não perder dados” deve considerar acesso, não somente retenção física.

**Proposta:** preservar consulta e acompanhamento de atividades próprias e compartilhadas já aceitas. Aplicar limites a novas automações ou novas criações conforme a oferta, com comportamento de downgrade documentado.

**Aceite:** uma prova aceita aparece antes e depois do encerramento do plano; mudanças de plano não alteram silenciosamente a agenda útil.

Fontes: [calendar/repository.ts, linha 34](../../../apps/agenda-da-turma/src/features/calendar/repository.ts#L34), [dashboard/repository.ts, linha 51](../../../apps/agenda-da-turma/src/features/dashboard/repository.ts#L51), [activities/service.ts, linha 303](../../../apps/agenda-da-turma/src/features/activities/service.ts#L303).

### R05 — P1: atividade compartilhada não pode ser corrigida após aceite

**Evidência de código.** Edição e exclusão retornam `HAS_ACCEPTANCES` quando há aceite de outro usuário.

**Impacto:** uma prova remarcada ou erro de digitação fica sem correção pelo fluxo normal. Recriar a atividade produz duplicatas e pode manter um prazo antigo em circulação.

**Proposta:** versão e aviso de alteração, com atualização dos dados comuns e preservação do estado privado de cada família. Diferenciar cancelamento de evento, retirada de compartilhamento e exclusão privada.

**Aceite:** alteração de prazo chega aos participantes autorizados, mostra o antes/depois, atualiza lembretes e não apaga observações ou conclusão individuais.

Fonte: [activities/service.ts, linhas 204 e 242](../../../apps/agenda-da-turma/src/features/activities/service.ts#L204).

### R06 — P1: a experiência gratuita esconde o principal diferencial

**Evidência de código e interface.** IA e gravação em lote exigem assinatura. Free tem um filho e limite de 20 atividades criadas, contando concluídas; apagar libera espaço, concluir não. Tanto publicar para a turma quanto aceitar uma atividade compartilhada exigem Pro.

**Impacto comercial inferido:** a família precisa comprar antes de testar a economia de trabalho, enquanto o compartilhamento exige conversão dos dois lados. Não há dados de funil para quantificar a perda.

**Proposta:** pequena experiência gratuita da importação, recebimento gratuito de compartilhamentos e limite sobre pendências próprias em lugar do histórico. Implementar o direito de teste no servidor e na gravação, com limite de custo.

Fontes: [guard de IA](../../../apps/agenda-da-turma/src/features/ai/_shared.ts), [batch e aceite, linhas 142 e 268](../../../apps/agenda-da-turma/src/features/activities/service.ts#L142), [limite atual](../../../apps/agenda-da-turma/src/features/activities/limits.ts), [filhos por plano](../../../apps/agenda-da-turma/src/features/students/limits.ts).

### R07 — P1: cadastro incompleto de um filho bloqueia o dashboard todo

**Evidência de código; primeiro uso exercitado.** A sequência passa por conta, verificação, plano, criança com data de nascimento, turma e matérias. O gate considera qualquer perfil sem turma e qualquer turma sem matérias como impeditivo do dashboard completo.

**Impacto:** adicionar um segundo filho incompleto pode esconder a rotina já pronta do primeiro. Uma família com atividade extracurricular ou recado administrativo precisa cumprir etapas escolares antes de acessar a experiência principal.

**Proposta:** primeiro importar um recado ou criar uma ação; pedir apenas o contexto necessário. Mostrar pendências de configuração por filho, mantendo o restante útil. Avaliar se nome/apelido e faixa escolar bastam inicialmente, em vez de exigir nascimento completo sem finalidade imediata.

**Aceite:** um perfil incompleto não bloqueia outro pronto; um lembrete administrativo pode existir sem matéria; medir o tempo até primeira ação confirmada.

Fonte: [dashboard/gate.ts, linha 25](../../../apps/agenda-da-turma/src/features/dashboard/gate.ts#L25).

### R08 — P1: faltam o ciclo de lembrete e a coordenação entre adultos

**Lacuna de produto na implementação examinada.** Não foi encontrado um sistema de lembretes de atividades/resumo familiar ou estrutura de dois adultos sobre os mesmos filhos. Há e-mails de autenticação e rotinas de billing, que não são lembretes escolares.

**Impacto:** armazenar a atividade não garante que alguém seja avisado ou saiba quem cuida. Essa lacuna limita a utilidade recorrente que justificaria a assinatura.

**Proposta:** família com acesso por criança, responsável por providência, resumo diário configurável, antecedência por tipo de ação e notificações idempotentes. Implementar autorização no backend, convites revogáveis e tratamento de mudanças de prazo.

Fontes: [modelo de perfis e atividades](../../../packages/db/src/schema/agenda.ts), busca nos fluxos e rotas do app. Ausência nesta revisão não equivale a afirmar que não exista uma automação externa não fornecida.

### R09 — P1: modelo de atividade não representa bem os recados

**Evidência de schema.** Atividades escolares exigem turma, matéria e `dueAt` do tipo data. Não há campos próprios para origem, anexo, horário/local de evento, prazo de resposta, responsável adulto ou revisão do comunicado. Existem atividades extracurriculares em estrutura própria, mas isso não resolve os recados administrativos.

**Impacto:** passeio, material e autorização podem ser encaixados artificialmente em uma disciplina e uma única data. Sem fonte, a família tem dificuldade de conferir a extração.

**Proposta:** separar recado de origem, ações derivadas e estado de cada família/criança. Uma origem pode produzir várias ações; horário do evento, prazo de resposta e preparação precisam de semânticas diferentes. Não há necessidade demonstrada de reescrever a stack.

Fonte: [agenda.ts, linha 240](../../../packages/db/src/schema/agenda.ts#L240).

### R10 — P1: teclado abre criação ao ativar uma atividade existente

**Reproduzido no navegador local.** Com foco no botão de uma atividade do calendário, pressionar Enter abriu “Nova atividade”. Clicar com o mouse no mesmo item abriu o detalhe corretamente.

**Causa observada:** o evento de teclado do botão interno chega ao handler da célula do dia, que interpreta Enter/espaço como criação. O item interrompe propagação de clique, mas a interação de teclado não recebe a mesma separação.

**Proposta:** separar semanticamente as ações da célula e do item, evitando controles interativos aninhados com efeitos conflitantes; garantir navegação e ativação por teclado.

**Aceite:** Enter/espaço sobre atividade abre o detalhe; criação ocorre somente no alvo apropriado; testar também “mais atividades” e retorno de foco ao fechar o diálogo.

Fontes: [day-cell.tsx, linha 40](../../../apps/agenda-da-turma/src/features/calendar/components/day-cell.tsx#L40), [activity-blip.tsx, linha 65](../../../apps/agenda-da-turma/src/features/calendar/components/activity-blip.tsx#L65), [captura da reprodução](evidence/calendario-enter-incorreto.png).

### R11 — P1: a oferta contém afirmações e unidades inconsistentes

**Evidência de código e interface.** Escolha de plano mostra “-20%” no anual; R$ 199 comparados a 12 × R$ 19,90 representam aproximadamente 16,67% de economia. Há selos “Mais popular” e “Mais escolhido”, embora o fundador tenha informado ausência de pagantes. A landing associa 70 créditos a 70 atividades por foto/PDF, mas uma importação pode gerar várias atividades e o consumo se relaciona ao processamento, não ao número salvo.

**Impacto:** expectativa comercial imprecisa e possível frustração com franquia. O texto de cadastro em 30 segundos/primeira prova em um minuto também precisa de medição real.

**Proposta:** centralizar preço, desconto e unidade de consumo; explicar limites de forma acessível; substituir preferência supostamente observada por descrição objetiva do plano. Medir antes de divulgar promessa de tempo.

**Acessibilidade:** recursos excluídos do Free usam o mesmo ícone de check, com diferença sobretudo de cor; indicar textualmente “não incluído” e expor a informação à tecnologia assistiva.

Fontes: [configuração de preços, linha 130](../../../packages/config/src/products.ts#L130), [plan-cards.tsx, linhas 124 e 169](../../../apps/agenda-da-turma/src/features/billing/components/plan-cards.tsx#L124), [pricing.tsx, linhas 98 e 110](../../../apps/agenda-da-turma/src/components/marketing/sections/pricing.tsx#L98), [final-cta.tsx, linha 45](../../../apps/agenda-da-turma/src/components/marketing/sections/final-cta.tsx#L45).

### R12 — P2: calendário móvel ocupa muito espaço antes da próxima ação

**Observado em viewport 390 × 844.** Grade mensal de sete colunas, células altas e controles de IA indisponíveis para Free consomem grande parte da tela. O cabeçalho móvel também concentra marca, upgrade, tema e usuário. A informação prática fica espalhada.

**Proposta:** lista/semanal como entrada no celular, destaque à próxima providência e importação principal; configurações e aparência em posição secundária. Manter a visão mensal acessível. Os resultados de performance ainda precisam ser medidos em build de produção e aparelho representativo.

Evidências: [calendário](evidence/calendario-mobile.png), [dashboard](evidence/dashboard-mobile.png), [landing publicada](evidence/landing-mobile.png).

### R13 — P2: limites de PDF e cobertura de IA precisam ser comunicados

**Evidência de código.** PDF tem teto de 5 MB e três páginas; o lote de extração comporta até 20 atividades. São limites razoáveis para controle inicial de custo, mas restringem documentos escolares extensos.

**Proposta:** informar os limites antes do envio, permitir seleção de páginas ou divisão orientada e medir a demanda antes de ampliar. Incluir imagem incorporada, recado sem ação, publicação corrigida, anexos divergentes e documentos longos na avaliação. Não alegar precisão com base apenas nos testes unitários existentes.

Fontes: [pdf-utils.ts, linhas 13 e 18](../../../apps/agenda-da-turma/src/features/ai/pdf-utils.ts#L13), [schema do lote](../../../apps/agenda-da-turma/src/ai/activities-parser/schema.ts).

### R14 — P2: a contagem do plano Free varia conforme a origem

**Evidência de código, sem reprodução de carga.** A criação de atividade extracurricular soma atividades escolares e extras. A criação escolar conta somente linhas escolares. Ambos usam a mesma chave de lock, mas a regra de contagem é diferente.

**Impacto:** a ordem das criações pode levar a limites distintos e ultrapassar o total combinado descrito nos comentários. O lock evita certas corridas, mas não corrige a diferença da regra.

**Proposta:** uma função de contagem e uma regra comercial comuns; testar as duas ordens de criação e concorrência relevante. Decidir antes se o limite deve contar pendências, conforme a proposta comercial.

Fontes: [activities/repository.ts, linhas 184 e 243](../../../apps/agenda-da-turma/src/features/activities/repository.ts#L184), [profile-subject-activities/repository.ts, linha 145](../../../apps/agenda-da-turma/src/features/profile-subject-activities/repository.ts#L145).

### R15 — P2: operação e medição ainda não sustentam decisões de crescimento

**Evidência da revisão.** Há observabilidade técnica, mas não foi identificado um funil de ativação, ação útil semanal, pagamento e renovação no app. A landing publicada gerou avisos CSP em modo report-only durante a navegação. O Biome encontrou um erro de formatação em teste existente.

**Proposta:** instrumentação de produto sem conteúdo pessoal, inspeção dos avisos CSP e alinhamento de nonce/política antes de endurecer enforcement; manter verificação de formatação consistente. Não interpretar os avisos report-only como prova de bloqueio efetivo da página.

**Aceite:** conseguir responder quantas famílias atingem primeiro valor, retornam, compram e renovam; release com checks do projeto e teste de fluxo crítico; política CSP coerente com os scripts necessários.

## Privacidade e limites de compartilhamento

Como o domínio envolve crianças, minimizar dados e separar grupos escolares de acesso familiar faz parte da funcionalidade. Revisar coleta obrigatória de nascimento completo, acesso por criança, revogação de cuidadores, retenção de anexos, exclusão e registros de alterações. Avaliar os papéis dos fornecedores que processam recados e a finalidade de cada dado.

A ANPD destaca o melhor interesse de crianças e adolescentes e admite diferentes bases legais aplicáveis; a definição para este produto exige análise concreta. Esta revisão não certifica conformidade jurídica. [Orientação da ANPD](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-divulga-enunciado-sobre-o-tratamento-de-dados-pessoais-de-criancas-e-adolescentes)

Não foi identificado acesso autenticado de crianças como objetivo do piloto proposto. Se esse escopo mudar, revisar as obrigações aplicáveis também à luz do ECA Digital e do desenho do serviço. [ANPD: ECA Digital](https://www.gov.br/anpd/pt-br/assuntos/eca-digital)

## Verificação e conclusão técnica

As execuções desta revisão registraram **461 testes do app e 185 testes do billing aprovados**, além de typecheck do app com saída zero. O Biome **falhou com um erro de formatação** em `src/features/activities/service.test.ts`. A reprodução local confirmou o conflito de teclado e a constraint de exclusão, sem corrigi-los. Consulte o [relatório de verificação](evidence/README.md) para comandos, saídas e limitações.

O investimento recomendado é evoluir a base existente em etapas: primeiro confiança e acesso, depois captura com contexto e lembretes, em seguida colaboração familiar e integrações condicionadas. A aprovação dos testes atuais não constitui aprovação para lançamento comercial; os achados e os critérios de aceite acima permanecem trabalho proposto.
