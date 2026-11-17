# Conversão dos perfis consumidores

Registro de execução da migração Compasso, 09/11/2026. O núcleo e o backfill existem; os caminhos de domínio abaixo ainda estão sendo convertidos. Este documento não é evidência de corte ou publicação.

## Contratos a preservar

- A identidade vem de `family.people` (nome da conta vinculada vem de `core.users`); o histórico continua na tabela do app com o ID original. Nome igual não liga pessoas.
- A ativação `family.app_profiles` identifica pessoa, grupo e app. Uma leitura de conteúdo inclui `profileAccessCondition` sobre a coluna de ativação persistida no domínio. A permissão não vem do grupo informado pelo navegador.
- Escritas travam o grupo antes de reler a ativação/permissão e antes de travar o perfil do domínio. Revogação e associação usam a mesma trava. Listas de IDs obtidas numa página anterior não autorizam uma escrita posterior.
- Nova ativação escolhe uma pessoa existente e cria seus dados locais no callback transacional de `activateProfile`. A criação/edição da identidade compartilhada fica na central. Preferências de treino, série escolar, rotinas e outras configurações específicas ficam no app.
- Grupo e pagante são distintos. Mais de um grupo requer seleção explícita de contexto; cada ação valida a participação. A troca de contexto limpa a seleção local de perfil e não transfere dados, contrato ou saldo.
- Arquivar participação, retirar concessão ou desativar perfil bloqueia o próximo acesso autoritativo. Sessões/aparelhos infantis precisam conferir a ativação e a autoridade do responsável emissor, além de suas concessões locais. Restaurar identidade não deve reativar aparelhos revogados.
- Remover dados de um app não apaga a identidade nem o histórico dos demais apps. Exclusão global e troca de responsável precisam de coordenação central, antes de retirar cascatas antigas ligadas ao titular.
- Os recursos gratuitos existentes permanecem conforme a proposta aprovada. Limites gratuitos são do app; capacidade de pessoas é do grupo. A assinatura Compasso oferece dois adultos e quatro dependentes. Importados excedentes não são apagados nem unidos automaticamente.

## Ordem de conversão

1. **Bora Treinar:** leitura/ativação/edição do perfil, primeiro acesso, progresso, gravação individual/em grupo, desafios, lembretes e exportação. O app não usa IA; é o primeiro consumidor para provar pessoa e permissão sem misturar migração de crédito.
2. **Missão Saber:** perfis, séries/objetivos, estudo, contexto infantil, competição, laboratório e exportação, incluindo escritas que hoje recebem uma lista de perfis previamente autorizados.
3. **Dia de Estrela:** crianças, rotinas/recompensas, responsáveis, PIN, códigos/aparelhos e suas concessões, cron/avisos, arquivos e exportação.
4. **Agenda da Turma:** crianças, convites/permissões existentes, rotina/recados/anexos, calendários, notificações e exportação.
5. **Cozya:** conteúdo continua individual; contexto familiar autoriza o Compasso e a carteira, sem revelar receitas/preferências de outro adulto.

## Fontes de transição

`family.migration_sources` conserva o vínculo do proprietário antigo com grupo/app para atribuição dos contratos e saldos antigos. Isso não concede conteúdo ao pagante. `family.app_profiles.source_key` conserva a origem do perfil importado. Não usar `user_id` antigo como atalho permanente de autorização nem removê-lo antes de adaptar os consumidores, jobs e exportações.

No Bora, `bora_treinar.families` também contém preferências de e-mail/fuso do adulto: elas não devem ser confundidas com a identidade compartilhada da família. Nome/cor dos perfis e o proprietário como autorização são substituídos; preferências pessoais de envio continuam pertencendo à conta correspondente. Treinos personalizados e desafios precisam preservar seu escopo explícito; entrar numa família não pode expor conteúdo privado sem concessão.

Após converter todos os leitores/escritores, gerar migrations para retirar campos de identidade duplicados e tornar obrigatórias as referências canônicas. A migration 0082 só pode ser aplicada durante o corte dos writers antigos. Verificar o conjunto com fixtures anteriores à migração, depois repetir o processamento para provar que concessões revogadas não reaparecem.

## Gates por consumidor

Tipos, testes de domínio e navegador devem cobrir: adulto autorizado/sem concessão, outra família, revogação durante escrita, perfil arquivado, associação explícita, pessoa já ativada, capacidade concorrente, seleção de contexto e histórico preservado. Aparelhos precisam de casos próprios de revogação e entrega adulto/criança. Testes antigos que criam usuários pelos emissores locais devem passar a autenticar pela central ou usar fixtures autoritativas isoladas quando o login não é o comportamento testado.


## Execução do Bora iniciada — 09/11, 20h27

Implementados os predicados de acesso ao perfil nativo e travas de autorização, integrados em leituras de progresso/sessões/séries/conquistas e escritas de treino/avanço. O ator é parâmetro explícito das consultas; o user_id histórico da sessão não concede acesso. Há ensaio real específico pelo runner `--bora-only`. A permissão comercial recebida antes da transação ainda deve ser substituída pelo contexto de assinatura durante a conversão do billing. Próximo passo obrigatório: ativar pessoas canônicas na interface e substituir a criação/edição/lista antiga, depois desafios/lembretes/exportação completa e cascatas. Não publicar essa etapa isolada: a criação antiga não produz o vínculo exigido pelas novas consultas.


## Bora — avanço de 09/11, 21h05

Ativação canônica e edição só de preferências, exclusão transacional por concessão, limite global da família, desafios canônicos e e-mails com revalidação foram implementados. Migrations 0094–0098 fazem a expansão de identidade, contexto dos desafios/backfill/contrato e remoção das cascatas do titular sobre históricos. A venda local e o novo teste de sete dias foram retirados; portal e leitura de contratos antigos ainda são compatibilidade de transição. Trinta e um testes PostgreSQL atuais passaram às 21h04. Falta: fila offline por conta/contexto com recuperação segura do formato antigo, revisão do pareamento, ensaio de navegador em execução, gates de build e retirada final dos campos legados com teste de migração em etapas. A migração financeira/global continua separadamente obrigatória.


## Bora — avanço de 09/11, 21h46

Fila v4 e reenvio usam o adulto/família capturados; itens v1–v3 exigem origem comprovada antes de serem reclamados. A capacidade de treino em grupo segue os seis participantes possíveis do Compasso, com escrita concedida para todos. O pareamento agora é uma concessão dependente da sessão SSO original, geração do canal e perfis do treino; há revalidação no ingresso, HTTP, SSE e batimentos. Tipos e 36 testes PostgreSQL passaram. Os seis cenários de navegador anteriores passaram com artefatos exclusivos; a matriz de oito com pareamento está em execução. Não confundir transporte local em memória com homologação Redis.

Próximo passo: tornar o ensaio de backfill realmente escalonado (base anterior → 0082 → contrato atual) e remover nome/cor e a nulabilidade do vínculo no Bora, ajustando também os fixtures do Bastidores. Depois concluir a migração dos contratos antigos, a autorização comercial dentro da transação e a verificação otimizada/Redis. Missão Saber é o próximo consumidor de domínio.


## Bora — identidade contratada e transporte real, 09/11, 22h10

0099 remove nome/cor locais e exige ativação canônica; ensaio histórico em banco anterior verifica a cadeia real e repetição do journal. Após a reorganização dos E2Es no próprio Bora, 8 jornadas e 37 testes de banco passaram. O Redis real passou 3 casos adicionais de concorrência/lifecycle, com 32 ouvintes por socket. Build/standalone está em verificação; autorização comercial transacional e migração financeira seguem pendentes.

## Inventário para a conversão do Missão Saber

A leitura confirmou que `learning/repository.ts` concentra perfis, missões, respostas, pistas, caderno, relatos, relatórios e exportação. `study-access/server.ts` transforma o aparelho em apenas `userId` antes das chamadas de domínio; isso deve ser substituído por uma autoridade explícita que conserve `deviceId`, família e concessões e as revalide na transação, inclusive em revogação concorrente. A sessão infantil tem duração própria e não deve depender da permanência da sessão web do adulto; depende da autoridade atual do emissor, concessões do aparelho e do perfil. Competição, laboratórios e peças têm repositórios adicionais que também precisam do contexto, sem ampliar a visibilidade do pódio/conteúdo por mera participação familiar. O desafio compartilhado precisa de `family_group_id`; consentimento e preferências de e-mail continuam atribuídos ao adulto. Ainda não foram alterados esses caminhos de domínio nesta etapa.


## Próximo incremento: autoridade dos aparelhos de estudo

O inventário do Missão mostra que a credencial infantil deve chegar até o repositório, em vez de virar apenas o userId do emissor na action. Cada operação terá ator, grupo e, quando infantil, aparelho; a concessão específica do aparelho se soma à autorização atual do emissor/perfil. Bloquear em uma página anterior não basta para uma resposta que aguardou uma trava.

Antes de converter o consumidor, preparar uma identidade persistente por concessão de `family.access_grants` e uma geração de delegação da ativação `family.app_profiles`. A retirada/recriação da concessão produz identidade diferente; arquivar/retirar participação muda a geração das ativações afetadas; reassociar um perfil muda somente sua geração. Assim, restaurar uma pessoa ou conceder novamente acesso não ressuscita uma credencial antiga. Preferências/nome podem mudar sem invalidar aparelhos. Esses identificadores são contratos internos, sem novo campo solicitado ao usuário.

O aparelho registra a família, as concessões de leitura/escrita que permitiram sua emissão, a geração da ativação. Leitura valida token, prazo, revogação, emissor, contexto, concessões e geração; escrita adquire trava do grupo → aparelho → perfil e revalida. Revogação usa a mesma ordem. Concessão de responsável nunca transforma o aparelho em administrador nem em outra criança. A sessão da criança tem prazo próprio; sair do navegador adulto não equivale a revogar um tablet de estudo autorizado.

A migração deve manter IDs/tokens/prazos e dados pedagógicos dos aparelhos atualmente autorizados, com backfill explícito das novas referências a partir de 0082. Ausência/ambiguidade de origem ativa interrompe a migração para tratamento; não autoriza conceder acesso pelo nome. A expansão compartilhada desses identificadores está sendo implementada; os consumidores de aparelhos ainda precisam capturá-los e validá-los. O mesmo contrato deverá atender os aparelhos do Dia de Estrela, preservando suas regras de PIN e responsáveis.


## Missão — aparelhos migrados em código, domínio em conversão

0100 fornece identidade de concessão/geração; 0101–0104 adicionam família e snapshots aos aparelhos e vinculam o emissor à conta central. Emissão/leitura/resgate estão convertidos e passaram 18 casos PostgreSQL, com dois ensaios históricos adicionais. O estado corrente da credencial deve ser levado até a transação do estudo através de `LearningAuthority`, discriminada em adulto e criança. `scope.ts` já valida família → aparelho → perfil e o contrato bloqueia restauração involuntária. A navegação da sessão foi movida ao repositório, mas isso não substitui as guardas de cada gravação.

Próxima alteração obrigatória: integrar `readStudents`/`enabledStudentIds`, o seletor de família e `learningAccessInTransaction` em perfis/learning; ativação escolhe uma pessoa central, sem nome/avatar locais novos. Converter os métodos restantes de laboratórios, peças, competição, desafio, exportação e e-mail, além dos callers (actions, páginas, jobs) e fixtures. Os nomes/avatares locais ainda existem e os repositórios de domínio ainda contêm ownership antigo; não publicar esta etapa como migração pronta. A autorização comercial transacional do Bora, a migração financeira e os demais consumidores também continuam obrigatórios.


## Missão — conversão de domínio em validação, 09/11, 23h18

Learning, laboratórios, peças, desafio, competição, exportação e e-mail agora recebem o contexto canônico. Ativação escolhe pessoa central, identidade é lida da central e a edição local trata apenas escola/trilha. Competição exige acesso a todos os participantes; exclusão do estudo conserva pessoas, assinatura e outros apps. Migrations 0105–0111 preservam contexto e autoria sem cascata de família antiga. O contrato final de identidade ainda não retirou as colunas locais, e o gate completo está em execução. Evidências/falhas da primeira repetição e tarefas imediatas estão no registro de implementação; não tratar esta etapa como pronta para publicação.


### Continuidade Missão (09/11, 23h39)

Contrato 0113 retira nome/avatar nativos e exige ativação central; as cópias em competidores são snapshots históricos deliberados. Remoção de ativação arquivada confere gestão atual sem reabrir uso do conteúdo; excluir o app inteiro exige administrador e gestão de todos os perfis. Contexto familiar, botões por permissão, contribuição individual no desafio e catálogo Compasso foram ajustados. 90 testes compartilhados passaram antes dessa última revisão; tipos de Missão passaram com 0113. Repetição compartilhada e completa do app em execução. Falta concluir navegador/SSO com o onboarding central, rever cobrança legada e seguir Dia → Agenda → Cozya.


### Corte do Dia de Estrela — contrato de implementação seguinte

O levantamento do consumidor confirma que `estrelaFamilies` contém ajustes da casa (fuso, conversão de estrelas, avisos, modo calmo, PIN), não preferências pessoais do pagante. Essa linha passará a ser identificada pela família canônica, preservando seus valores pela origem registrada em `familyMigrationSources`. Loja/recompensas e canais de atualização também devem usar esse contexto. `user_id` fica apenas como autoria histórica quando necessário; não pode continuar sendo chave de autorização ou cascata sobre o histórico infantil.

A autoridade deve discriminar adulto autenticado, aparelho infantil com criança selecionada e desbloqueio temporário por PIN. O PIN conserva exatamente as operações atuais de rotina/cofrinho e nunca vira sessão adulta, gestão de identidade ou poder de cobrança. A autoridade do aparelho/PIN permanece limitada aos perfis delegados, IDs de concessão e geração da ativação; retirada/recriação de concessão, arquivo/restauração e troca da pessoa exigem nova delegação. O PIN e a conexão têm prazos próprios, conferidos no repositório após a espera pelas travas. Ordem de bloqueio: família → aparelho quando houver → crianças ordenadas → linhas de domínio.

As tarefas, passos, conclusões, estrelas, pedidos, metas, fotos e vozes conservam seus IDs e FKs de criança. O vínculo central fica obrigatório depois da conversão dos writers e ensaio de backfill; nome/cor locais são retirados. Administrador da família ou pagante não recebe acesso automático ao conteúdo de uma criança. Operações coletivas de configuração precisam distinguir a configuração da casa da autorização sobre os dados de cada criança; o PIN não pode alterar a configuração da conta.

SSE, arquivos de voz/foto, lembretes, push, exportação e exclusão precisam consultar a mesma autoridade. Convites aceitos mantêm apenas as permissões comprovadas na origem; não reabrir uma associação antiga ou transformar uma entrada no grupo em concessão automática a todos os perfis. O fluxo antigo de segundo responsável e seus limites de uma única família serão substituídos pela gestão central, sem adapter permanente que transforme um convidado em titular.

Essa seção descreve o desenho a implementar. O domínio do Dia ainda não foi convertido e estes contratos não são evidência de funcionamento.


### Dia convertido em código e ensaiado (10/11, 01h30)

A seção anterior registra o desenho de partida. A conversão do Dia foi implementada: migrações 0114–0116, autoridade adulta/infantil/PIN, delegações estáveis, configuração por grupo, identidade central, writers sob trava, arquivos/exportação e alertas/SSE conferindo concessões. Os ensaios históricos e os gates de banco/unidade/navegador passaram no perfil registrado em `implementacao.md`. Isso não encerra a migração comercial/operacional nem constitui deploy. Bora recebeu revisão da cobertura transacional e aguarda os novos gates; Agenda e Cozya continuam a converter.


### Contrato da Agenda — levantamento para conversão (10/11)

- A família escolhida deve viajar explicitamente até tarefas, recados, importações/IA, fila e feed. Conta pagante ou criador histórico nunca substitui o adulto autenticado. Nome passa à pessoa central; nascimento opcional permanece dado escolar do app, assim como matrícula, matérias e planos de estudo.
- Tarefas/conclusões/revisões/arquivos conservam IDs. O recado ganha grupo canônico e perde cascata do pagante. A fonte original confirmada exige leitura de todo o escopo revisado; criador/pagante não contorna a retirada de concessão. A revisão e a gravação exigem write sobre todas as crianças envolvidas sob travas ordenadas.
- Turmas continuam espaços de colaboração entre famílias, com código e dono da sala próprios. Gerenciar perfil escolar é distinto de acessar código da sala. Matrícula deve registrar o adulto que a criou; não inferir novos administradores de turma por pertencimento familiar. Aplicações/revisões de uma atividade compartilhada não devem depender da conta pagante.
- Limite gratuito de pendências e permissões comerciais são calculados sobre o grupo inteiro e novamente dentro da transação. Receber atividade de outra família continua fora dessa contagem. Novas concessões de IA usam a carteira central; testes/importações promocionais locais precisam ser aposentados com o fechamento dos saldos.
- Feed privado requer snapshot read-only de cada ativação escolhida, com ID de concessão e geração, sem exigir write. Não deve passar a expor filhos adicionados depois nem voltar a funcionar por revogar/reconceder a mesma permissão. Agenda já usa a primitiva e passou pelo ensaio isolado de concessão somente de leitura, revogação/reconcessão e novos perfis. A interface de validade/renovação e o ensaio histórico completo ainda estão pendentes.
- A fila offline conserva adulto/família/atividade, sem transformar recibo antigo em acesso ao conteúdo atual. Notificações/retries, download original, exportação e exclusão reavaliam a mesma autoridade no repositório. O modo infantil da Agenda continua sendo a interface de entrega do telefone de um adulto, não uma sessão/autenticação infantil: o gesto de devolução não é tranca de segurança.

Este é o contrato de implementação, não declaração de conversão concluída. As migrations de expansão 0117 e backfill 0118 foram geradas depois dos ensaios anteriores. Contração do schema, ensaio histórico e readiness final continuam pendentes.


## Agenda — contrato final de identidade local (10/11, 06h15)

A migration gerada `0129_compasso_agenda_identity_contract` exige `student_profiles.family_profile_id` e `notices.family_group_id`, remove `student_profiles.user_id/name`, `notices.owner_user_id` e as tabelas `agenda.family_members/family_profile_access/family_invitations`. Não modifica IDs escolares, nomes canônicos, datas, textos, vínculos de turma ou concessões já aceitas. Convites ainda pendentes são encerrados sem conceder acesso; um responsável deve emitir novo convite na Conta. O ensaio histórico verifica pessoas homônimas separadas, concessões e preferências de e-mail, audiência dos originais, ausência dos campos/tabelas e recusa de perfil sem ativação. A suite compartilhada passou até 0129; isso não autoriza aplicar com writers antigos ativos nem conclui a migração financeira.
