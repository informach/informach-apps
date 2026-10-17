# Cozya — operação e piloto

Preços aprovados e preservados: **R$ 14,90/mês ou R$ 149/ano**, 50 créditos de IA por mês. Este documento prepara a execução; não registra publicação, participantes recrutados ou pagamentos reais.

## Preparar o ambiente

1. Fazer backup e testar restauração do banco de homologação antes de aplicar migrations em produção. As migrations 0032/0033/0034 são aditivas: preservam receitas legadas, acrescentam metadados e tabelas da cozinha. A 0034 inclui porções persistidas e uma versão exclusiva do conteúdo culinário; sessões de preparo de desenvolvimento anteriores a ela podem reiniciar uma vez. Geradas pelo Drizzle, aplicadas e exercitadas localmente.
2. Rodar `pnpm db:migrate` (Drizzle e migrator Mastra, este necessário para a limpeza dos dados antigos). Rodar `pnpm db:seed` para conferir o catálogo idempotente de preço em créditos. Não editar SQL gerado, créditos existentes ou Price IDs para esta entrega.
3. Conferir os segredos do ambiente pelo gerenciador da hospedagem: banco, Redis, auth, cron, Stripe, OpenRouter e e-mail. Não copiar `.env.local` para produção. `CSP_ENFORCE=1`; `E2E_RELAX_AUTH_RATE_LIMITS` desativado em produção. Conferir entrega de OTP com o domínio transacional real.
4. Validar em Stripe **test mode**: mensal R$14,90, anual R$149, uma concessão de 50 créditos por mês (incluindo anual), compra de pacote, repetição do webhook, cancelamento, retorno ao Free e exclusão com assinatura. Os testes desta entrega exercitam contratos e ledger local; não substituem esses eventos externos completos.
5. Fazer um ensaio em homologação com uma conta sintética: capturar → revisar → salvar → planejar três refeições → gerar lista → marcar compras → preparar → recarregar → exportar → limpar. Verificar cancelamento da assinatura e confirmação por e-mail da exclusão global sem afetar outro app.

## Rotinas obrigatórias

Usar o agendador da hospedagem. Todas as rotas abaixo exigem `Authorization: Bearer CRON_SECRET`; guardar esse segredo no serviço, sem incluí-lo no histórico de comandos ou logs. As rotas foram implementadas, mas **o agendamento em produção não foi configurado nesta entrega**.

| Rotina | Método / rota | Frequência |
| --- | --- | --- |
| Retenção e recuperação Cozya | POST `/api/jobs/cozya-retention` | A cada hora |
| Reservas expiradas | POST `/api/jobs/billing-release-reservations` | A cada 5 minutos |
| Reconciliação de assinaturas | POST `/api/jobs/billing-reconcile` | Diária |
| Expiração de bônus mensais | POST `/api/jobs/billing-expire-bonus` | Diária |
| Créditos mensais do anual | POST `/api/jobs/billing-grant-monthly` | Diária, após expiração |
| Métricas da cozinha | GET `/api/jobs/cozya-metrics` | Leitura interna diária/semanal |

Manter também os jobs existentes de autenticação, e-mail e dunning, descritos em `packages/auth/PRODUCTION.md`, `packages/emails/PRODUCTION.md` e `packages/billing/PRODUCTION.md`.

A rotina Cozya bloqueia acesso às prévias após 24h e remove seu conteúdo no processamento horário; apaga eventos/runs/identificadores de operações após 90 dias e hashes de teste órfãos após 365 dias da ativação. Limpa trechos de transcrições registrados por versões antigas e conversas/traces do Cozya no Mastra. A migração legada processa até 100 usuários por chamada; repetir até esvaziar o lote, sem incluir conteúdo pessoal nos registros de execução.

Operações interrompidas há mais de 1h ou com erro terminal após débito recebem reconciliação. Reserva ativa é liberada; débito já confirmado recebe compensação única, válida por 30 dias. A recuperação por retry também pode iniciar essa reconciliação. Com o job horário em dia, a janela normal é de 1–2h. Monitorar falhas, duração e acúmulo de lotes: backlog ou indisponibilidade ampliam esse prazo. Uma prévia concluída continua recuperável sem nova cobrança por 24h em `/receitas/recuperar`.

A revisão posterior corrigiu a perda de pendências acima de 100 operações: o próximo lote preserva seus identificadores/estado até reconciliar, mesmo após 90 dias. A limpeza solicitada pela pessoa também reconcilia falhas antigas e aguarda operações pendentes antes de excluir os dados. O saldo passou a expirar somente o restante não usado de cada concessão; histórico financeiro e preços permanecem preservados. Detalhes e evidências no [review da implementação](review-da-implementacao.md).

Para repetir a integração, usar `pnpm --filter @informach/cozya test:integration`. O runner exige banco local e usuário PostgreSQL com permissão de criar banco, cria um `cozya_review_<uuid>` descartável, aplica as migrations e remove exatamente esse banco ao terminar, inclusive se um teste falhar. Não executar a suite de retenção diretamente sobre o banco de desenvolvimento/produção. Testes de navegador continuam usando apenas contas sintéticas no banco local configurado.

Confirmar pelo agendador pelo menos duas execuções sucessivas da retenção. Na homologação, criar dados sintéticos antigos e verificar remoção, compensação única, preservação de conteúdo recente e de outros apps. **A limpeza global não foi executada sobre dados de produção nesta entrega.** A exclusão individual de threads/mensagens legadas e a compensação foram testadas com dados sintéticos reais no PostgreSQL.

Se houver rollback do app, preservar as tabelas aditivas e a rotina de retenção; voltar uma versão do código é preferível a apagar as novas tabelas. Não reativar a memória implícita da versão antiga. Investigar e corrigir para a frente quando o rollback violar privacidade ou perder novos dados.

## Custo, qualidade e alertas

- O teste inicial tem 3 créditos, validade de 14 dias, limite de 6 novas tentativas/dia/usuário e 100/dia global. Todos os usuários têm limite de 60 solicitações/hora. Pedidos recusados podem gerar custo de provedor; não cobrar a pessoa não significa custo zero.
- `providerCosts` informa estágios, falhas, p95, custo USD reportado e cobertura. Somar tokens não mede busca nem transcrição. Não calcular margem a partir de totais incompletos. Conciliar com o relatório do gateway antes de aumentar aquisição.
- Configurar alertas de job sem sucesso por mais de 2h, operações abandonadas, falha de webhooks, erros de saldo e p95 elevado. Um limite de custo em reais deve ser definido no gateway com dados do piloto; não há previsão de margem validada.
- O teste adicional com o serviço real/Mastra e ledger local passou: captura válida debita uma vez; replay não chama o modelo novamente; conteúdo incompleto libera a reserva; não cria conversa. Ele revelou e permitiu corrigir a serialização JSON na liberação de reservas do pacote billing e a exposição de texto pelo logger debug do Mastra.
- Evidência paga de 11/09/2026: 22 casos passaram nos critérios críticos/schema, com 5 imagens sintéticas autorais. Das 2 consultas web, 1 entregou receita e 1 recusou por falta de fonte correspondente. A baseline não significa 100% de sucesso na busca. Casos de voz usam transcrições; não medem reconhecimento de áudio real.
- Antes de prometer qualidade de captura: obter autorização para fotos reais, receitas manuscritas e áudios dos participantes, transcrever a referência, conferir quantidade/unidade/preparo e acrescentar os casos ao dataset. Reprovar mudanças de medidas, fonte inventada ou adaptação de rendimento sem base.
- A coleção inicial tem quatro rascunhos autorais, identificados como ainda não testados em cozinha. Revisão e execução culinária humana continuam necessárias. A interface não promete indicação clínica, segurança contra alérgenos ou alarme em segundo plano.
- A política foi alinhada ao comportamento do código e retirou afirmações não comprovadas de descarte imediato, prazo fiscal fixo e transferência contratual genérica. A referência ao art. 33 foi conferida na [LGPD publicada pelo Planalto](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm). Contratos de fornecedores, backups e retenção de auditoria compartilhada ainda exigem conferência operacional; os testes não certificam conformidade jurídica.

## Piloto de utilidade, com preço fixo

Público: 20–30 casas de 2–4 pessoas, responsáveis por jantares dos dias úteis e marmitas. Recrutar apenas com autorização do responsável pelo negócio. Nenhum contato, mensagem ou campanha foi enviado nesta implementação.

Antes do piloto, realizar 12–15 entrevistas sobre a última semana real: como decidiram refeições, guardaram receitas, compraram e prepararam. Não substituir evidência de comportamento por respostas à pergunta “você pagaria?”. Registrar assistência prestada pelo time separadamente do uso independente.

| Momento | Tarefa observada | Critério exploratório |
| --- | --- | --- |
| Primeiros 7 dias | Salvar receita própria, planejar 3 refeições, gerar e usar compras | 18 de 30 casas chegam à ativação |
| Semanas 1–4 | Usar as receitas no preparo | Medir casas com 3 preparos declarados por semana |
| Semana 4 | Repetir o ciclo | Pelo menos 9 das 18 ativadas voltam |
| Após teste | Pagar R$14,90 mensal ou R$149 anual | Pelo menos 6 das 30 convidadas |
| Ciclo mensal seguinte | Renovar após tempo efetivamente transcorrido | Pelo menos 4 dos 6 primeiros pagantes mensais |
| Toda semana | Observar erros e custo por conta | Uso independente e contribuição positiva |

O endpoint de métricas entrega funil ordenado em 7 dias, casas que declararam 3 preparos, planejamento, repetição, visualização da oferta e eventos de cobrança. “Cozinhei” é autodeclaração; conta sintética não mede demanda. Eventos de pagamento não devem ser confundidos automaticamente com renovação: conciliar o ciclo e a assinatura no Stripe. As metas são hipóteses de decisão, não benchmarks nem resultados obtidos.

Manter uma planilha interna com identificador de participante, semana, tempo para planejar, tarefa concluída, intervenção do time, erro observado, pagamento e motivo de abandono. Não guardar conteúdo alimentar sensível para análise comercial. Se captura for alta e repetição baixa, investigar foco de acervo; se repetição for alta e pagamento baixo, investigar benefício exclusivo e alternativas gratuitas antes de mexer no preço.

## Próximas decisões condicionadas ao piloto

Importação por URL, compartilhamento público com “salvar no meu Cozya”, indicação e parcerias com criadores são extensões de entrada/aquisição, posteriores à prova do ciclo semanal. WhatsApp continua compartilhando texto com atribuição quando disponível. Colaboração familiar simultânea, despensa automática, integração universal com vídeos, marketplace, nutrição clínica, apps nativos e offline completo não foram incluídos neste ciclo.

## Estabilidade do E2E no CI — 17/10/2026

O [CI 39030699780](https://github.com/informach/informach-apps/actions/runs/39030699780), sobre `3106f6a`, falhou na jornada de cozinha por esgotar o timeout padrão de 5 segundos da asserção. O trace do retry registra `POST /semana` com HTTP 200 em 163 ms e `GET /compras` com HTTP 200 em 4.638,878 ms, além de Fast Refresh de 3.634 ms e 723 ms durante a navegação. A asserção `to.have.url` encerrou após 5 segundos. A primeira tentativa ainda mostrava a ação de ativação do teste pendente; no retry, essa etapa passou. Não foi observada falha HTTP nessa navegação.

A configuração do Cozya passou a declarar `expect.timeout` de 15 segundos em CI e 5 segundos localmente, alinhada ao orçamento da Agenda da Turma. Os testes continuam esperando as mesmas URLs, estados, conteúdo, acessibilidade e isolamento; não foram acrescentados sleeps nem retries, e os limites de ação/teste existentes foram preservados. O [guia E2E](../../../apps/cozya/e2e/README.md) descreve os serviços locais, os comandos reais e a execução contra um servidor isolado.

Verificação local com `CI=1`: `pnpm --filter @informach/cozya e2e --reporter=list` passou **8/8 em 1,6 minuto, sem retry**. Foram usados dois containers novos de PostgreSQL 16 e Redis 7, portas loopback efêmeras, migrations completas, e-mails sandbox e contextos Chromium do Playwright. O servidor `next dev` iniciou em porta exclusiva com cache de desenvolvimento renovado; `E2E_SKIP_WEBSERVER=1` permitiu fornecer a porta do Redis exclusivo sem alterar a configuração do produto. Servidor e containers foram encerrados/removidos ao final. A primeira execução havia falhado ao abrir os cenários de navegador porque o Chromium correspondente ao Playwright instalado estava ausente; `pnpm --filter @informach/cozya e2e:install` preparou o pré-requisito antes da nova execução completa.

Logs e metadados locais desta rodada ficam em `.cache/edi-production/cozya-ci-07b87eea0285443bb3c63a5ba504bf10/`, sem versionar dados de sessão ou e-mails. Biome do arquivo de configuração e `git diff --check` passaram. A verificação cobre o Windows local com parâmetros de CI; a confirmação do runner Linux continua dependendo da próxima execução remota. Não houve chamadas pagas de IA, envio pelo SendGrid, cobrança ou acesso ao banco de produção.
