# Minha conta: preparação operacional do Compasso

Estado em 10/11/2026: implementação local na branch `feat/compasso-migracao`. Ainda não há serviço/domínio/cron/webhook Compasso provisionado nem cobrança habilitada. Ver [implementação e evidências](../../docs/propostas/assinatura-web-2026-11-09/implementacao.md); este guia não comprova acesso ou configuração dos provedores.

## Composição e verificações locais

- `pnpm dev:conta`: porta 3011. `pnpm build:conta` e `pnpm start:conta`: standalone conforme scripts da raiz, respeitando `PORT`/interface de rede do ambiente.
- `pnpm compasso:test:integration --ui`: migrations, PostgreSQL descartável, família, cobrança, auth, conciliação Edi e navegador. `pnpm compasso:test:ui` repete só o navegador com banco igualmente descartável.
- `pnpm compasso:test:integration --migration-ui-only`: prévia/confirmacão de créditos antigos na central, com os controles comerciais habilitados somente no processo descartável, chaves de teste sem acesso e lotes promocionais. `--ui` inclui também essa jornada. Não reutiliza chaves locais de Stripe nem abre cobrança; o leitor Stripe é ensaiado separadamente na fronteira HTTP do SDK e no domínio com PostgreSQL real.
- `pnpm --filter @informach/conta setup:oauth`: provisiona clientes web no banco indicado e recusa configurações incompatíveis; só executar após conferir o ambiente. Os callbacks vêm do catálogo único. Não é uma rotina de startup. A matriz `--apps-only` executa a provisão somente no seu banco descartável.
- `/api/health` identifica o processo; `/api/ready` verifica migrations. Nenhuma das duas rotas prova Stripe, SendGrid, DNS ou a migração dos cinco apps.

- `pnpm compasso:test:integration --apps-only`: login/retorno/confirmação recente/saída nos cinco apps reais, desktop e celular. `COMPASSO_TEST_APP=<slug>` limita ao app registrado. PostgreSQL é descartável; chaves locais de provedores são sobrepostas por fixtures. Essa matriz aguarda o endpoint de sessão do consumidor, sem Redis: não é uma prova do readiness operacional completo e não modifica o portão de produção.
- `pnpm compasso:test:stripe-plans`: Test Clock real com `STRIPE_SECRET_KEY` explicitamente de teste. O script recusa modo live, cria seus próprios recursos e os limpa/arquiva. O ensaio de 09/11 passou (transição, descontos, replay e desistência); isso não provisiona o catálogo comercial.

## Variáveis

Usar [`.env.example`](.env.example) somente como modelo sem valores reais. Segredos ficam no Railway/arquivo local ignorado.

| Variável | Finalidade |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | Origem exata registrada: `http://localhost:3011` local ou `https://conta.informach.com.br` no serviço; configurar também no build |
| `DATABASE_URL` | PostgreSQL compartilhado, configurado no serviço e migrator apropriados |
| `BETTER_AUTH_SECRET` | Segredo próprio e estável do emissor web; não reutilizar segredo desktop/admin |
| `COMPASSO_TRIAL_HASH_SECRET` | HMAC durável dos recibos de elegibilidade de teste; não rotacionar sem migração |
| `SENDGRID_API_KEY`, `SENDGRID_FROM` | Autenticação/remetente aprovado para e-mails transacionais |
| `EMAIL_SANDBOX_MODE` | `live` em produção; testes isolados usam `memory` |
| `COMPASSO_BILLING_ENABLED` | Admissão de novos compromissos: `false` até provisão, testes Stripe e corte de dados/consumidores conferidos. Não interrompe obrigações existentes |
| `STRIPE_MODE` | `dev` para Stripe test, `prod` para Stripe live; ambiente local recusa live |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Segredos do modo confirmado e endpoint específico da central |
| `COMPASSO_MONTHLY_PRICE`, `COMPASSO_ANNUAL_PRICE` | IDs dos preços de assinatura no modo Stripe configurado |
| `COMPASSO_CREDITS_100_PRICE`, `COMPASSO_CREDITS_300_PRICE`, `COMPASSO_CREDITS_1000_PRICE` | IDs das três recargas no modo Stripe configurado |
| `STRIPE_PORTAL_CONFIGURATION_ID` | Configuração exclusiva do portal Compasso |
| `CRON_SECRET` | Pelo menos 32 caracteres, exclusivo para autenticação do job |

Produtos, valores e limites pertencem a `@informach/config/products`. A composição `src/lib/products.ts` acrescenta somente os cinco IDs de preço do modo Stripe configurado pelas variáveis acima, compartilhados entre a carteira e a cobrança; não define valores ou políticas paralelos. A origem de implantação, e não apenas `NODE_ENV`, distingue o emissor local do público. Um build otimizado local continua recusando Stripe live; o emissor público exige e-mail live. O catálogo só pode ser habilitado depois de conferido em Stripe: um produto Compasso, R$49,90/mês, R$499/ano, recargas de 100/R$14,90, 300/R$39,90 e 1.000/R$99,90. O portal permite atualizar pagamento e consultar comprovantes; cancelamento e alteração de assinatura ficam desabilitados nele. Todas as mudanças de assinatura passam pela central, que verifica participação e serializa a admissão comercial. O cancelamento normal na central ocorre ao fim do período, sem pró-rata. A troca de periodicidade pela central usa `subscription_schedule` nativo ao fim do período pago; migration 0093. Criar/configurar/desfazer são recuperáveis por recibos duráveis, eventos assinados e reconciliação. Não reutilizar o executor de cancelamento/recriação dos produtos antigos.

## Eventos e rotina financeira

Destino planejado: `POST https://conta.informach.com.br/api/webhooks/stripe`. O handler aceita eventos Checkout, subscription, invoice, payment intent, charge/dispute e subscription schedule; verificar assinatura do corpo original é obrigatório. Ele grava identificadores mínimos e solicita conciliação; 200 confirma trabalho persistido, não crédito concedido. Falha de persistência ou leitura necessária da origem retorna 503 para reentrega. Payload é limitado a 512 KiB inclusive em transferência por chunks.

Uma pausa nas vendas não desativa o webhook nem `/api/jobs/billing`, desde que suas credenciais estejam configuradas. Manter chave, segredo de webhook, catálogo e cron para conciliar contratos existentes. Cancelamentos e atualização da cobrança permanecem disponíveis; comprovantes dependem também da configuração do portal validada no provedor. Novas compras, continuação de checkout, restauração da renovação e troca de periodicidade seguem bloqueadas pela flag. Remover credenciais impede a manutenção: isso não equivale a uma pausa comercial. A validação de modo/origem das credenciais vale mesmo com vendas desligadas.

`POST /api/jobs/billing` requer `Authorization: Bearer <CRON_SECRET>`. Planejar cadência de um minuto e conferir capacidade/tempo do lote antes de habilitar. O lote padrão processa até 25 trabalhos, usa leases e preserva eventos concorrentes; falha parcial mantém repetição e retorna 503. Recibos aguardando pagamento voltam a ficar disponíveis em um minuto; sucesso financeiro periódico, em até seis horas, antecipado pela próxima franquia. A cadência e o volume determinam a latência real. `ops.job_runs` contém contagens e estado, sem payload financeiro pessoal; a fila registra revisão solicitada/processada, tentativas e próxima execução.

Estorno/contestação recebidos retêm novos usos até leitura financeira bem-sucedida. Se a recarga está identificada, a assinatura dos apps não é suspensa por esse evento. Origem ainda desconhecida também coloca a cobertura em conferência. Conciliar libera ou suspende o lote devido; repetição antiga não reaplica uma retenção já resolvida. Não apagar recibos/fila para desbloquear um caso; investigar o registro e o estado real do provedor, corrigir a causa e repetir a conciliação.

## Condições do corte ainda pendente

Não aplicar o backfill `0082` enquanto os escritores antigos continuarem criando perfis sem vínculo. A sequência final deve coordenar consumidores, jobs/aparelhos e congelamento de escritas, ensaiar captura do delta, verificar contagens/permissões e só então fechar fontes antigas. Reservas de IA precisam ser resolvidas antes de converter lotes. Cobranças antigas exigem reconciliação dos direitos e proteção contra uma segunda assinatura. Esses passos ainda não foram ensaiados no conjunto completo.

Railway usa o IaC único `.railway/railway.ts`: conferir acesso/serviços, preparar o diff e executar `railway config plan` antes de qualquer apply. Parar diante de destroy ou recurso fora desta frente. Não adicionar `railway.toml/json`, não remover readiness e não executar `db:push`. O migrator compartilhado roda separado do app. Provisionamento e homologação real só podem ser declarados depois de evidência observada, nunca a partir deste documento.


## Preflight de acesso — 09/11/2026, 20h03

Consulta somente de leitura pelo MCP Railway: projeto `informach-apps` e seu ambiente `production` acessíveis, 28 serviços existentes, nenhuma mudança staged. Os serviços consultados têm último deployment `SUCCESS`; isso não substitui `/api/ready`, conexão de banco ou verificação funcional. Central `@informach/conta`, cron Compasso e Dia de Estrela ainda não existem no inventário remoto. Postgres/Redis e seus volumes continuam existentes. Nenhuma configuração, variável, cobrança ou migration foi alterada nessa consulta.

Antes do corte, conferir novamente o inventário e executar o plano da IaC completa. Não remover serviços/crons antigos enquanto os contratos e filas legados ainda dependerem deles.


## Ensaio standalone com consumidores

No Windows com Docker Desktop disponível, defina `COMPASSO_TEST_APP=bora-treinar` conforme seu shell e execute `pnpm compasso:test:integration --apps-only --redis --optimized`. O runner usa sua própria instância PostgreSQL e cria/remove um container Redis autenticado em porta aleatória de loopback. Não usa os bancos/containers de desenvolvimento existentes nem provedores reais. Os builds de central/consumidor são sequenciais, isolados por execução, seguidos por servidores standalone e readiness completo. Em 09/11 às 22h15, central + Bora passaram as oito jornadas desktop/mobile; consultar o registro da migração para evidências/avisos. Os outros consumidores ainda precisam de suas jornadas de domínio.

`build-standalone.mjs` e `start.mjs` usam `.next` normalmente e o contrato validado `isolatedNextOptions` durante esse ensaio. A central declara esbuild para empacotar `setup-oauth.cjs`; não depender de resolução transitiva. Arquivos `.env.production*` também são neutralizados no processo de teste. Nenhuma dessas variáveis de isolamento pertence ao deploy real.


No CI Linux, o mesmo runner usa `CI=true` e o `DATABASE_URL` do serviço PostgreSQL em loopback apenas para criar uma base descartável; a origem não recebe migrations nem truncamentos. `postgres-fixture.test.mjs` verifica essa separação com dados reais. O workflow inclui o teste do fixture e a suíte compartilhada Compasso. A execução remota do workflow ainda não foi observada nesta branch.


## Retorno de autenticação e periodicidade

A central conserva a família e a periodicidade escolhidas antes da autenticação. O retorno local aceita somente a raiz com parâmetros tipados conhecidos (`familia`, `plano`, `pagamento`, `contratos`, `extrato`, `privacidade`) e âncoras `#compasso` ou `#privacidade`; origens externas, caminhos desconhecidos e parâmetros duplicados são recusados. Callbacks OAuth usam o catálogo e a origem de implantação, inclusive em builds locais otimizados. A oferta pode abrir com mensal/anual selecionado, mas não marca consentimento nem inicia Checkout automaticamente. Testes unitários cobrem retornos inválidos; as jornadas completas estão nos navegadores isolados da Agenda e da Conta.


A sequência de corte inclui os contratos destrutivos dos consumidores: na Agenda, 0129 retira nomes/titulares e tabelas familiares antigas depois dos backfills 0082/0118 e dos metadados de autorização. Parar writers antigos, conferir proveniência e restaurabilidade antes da sequência; versões antigas não podem voltar a servir sobre esse contrato. Convites pendentes antigos precisam ser reemitidos na Conta, nunca transformados em concessões sem aceite. Os testes históricos comprovam a transformação em bases sintéticas, não a completude dos dados reais.

## Créditos históricos e fronteira de rollback

Identidade: 0136 acrescenta unicidade de teste por adulto e conjunto, preservando o digest por e-mail; conferir duplicidades antes do corte, sem descartar linhas para satisfazer o índice. 0137 instala a invalidação atômica de sessões web, provas e convites pendentes quando o e-mail muda. Não habilitar a jornada em um banco anterior a essas migrations ou retirar o trigger em rollback. Aplicar a migration não altera e-mails nem encerra sessões existentes; o efeito ocorre na próxima mudança de endereço. Sessões independentes de Edi/Bastidores e seus contratos permanecem fora da seleção. Corpo de e-mail `auth.change-email-otp` usa o transporte transitório já existente e não é armazenado para retry posterior.

Responsabilidade pelo cadastro: 0138 cria a tabela de pedidos de transferência, com FKs, versão e resolução. É uma migration aditiva, sem backfill; os responsáveis existentes não mudam. A criação das FKs toma as travas de DDL normais das tabelas referenciadas, portanto aplicar pelo migrator antes de promover a central. Após um aceite real, não voltar a uma versão que autorize alterações de identidade sem a trava canônica da pessoa: ela serializa a transferência mesmo entre famílias diferentes. Conservar os pedidos/recibos em rollback e corrigir para a frente. Os campos não contêm OTP, tokens ou conteúdo dos apps.

0132 registra correspondências por lote; 0133 fecha reserva/consumo antigos no banco; 0134/0135 identificam pendências de webhook por escopo/customer sem modificar o payload assinado. Antes de habilitar `COMPASSO_BILLING_ENABLED`, conciliar as origens, resolver reservas e conferir os saldos/validades por família com recibos de aceite. As rotas/jobs antigos continuam necessários para faturas, estornos e disputas; não os remover no mesmo instante em que a carteira passa à família. Franquias sem fatura inequívoca e compras sem liquidação identificada impedem a transferência.

Uma versão antiga do app não reabre uma carteira convertida. Não apagar recibos/triggers para fazer rollback; conferir backup/restauração e uma correção para a frente, preservando eventos financeiros posteriores ao backup. A [referência financeira](../../docs/propostas/assinatura-web-2026-11-09/migracao-financeira.md) registra contratos e ensaios. A transição dos contratos atuais e a proteção completa contra cobrança dupla ainda precisam ser concluídas antes da ativação; a presença do botão de transferência no código não libera o corte.


## Avaliações de privacidade e manutenção

0140/0141 criam a fila de avaliações e seu índice de vencimento. A Conta reúne respostas dos cinco apps, inclusive Dia de Estrela ainda não publicado, em `/privacidade/encerramento`. A revisão vale 30 minutos; uma resposta ausente impede conclusão. Expiração, cancelamento e substituição invalidam recibos atrasados. Os resultados não autorizam exclusão.

`POST /api/jobs/account-maintenance` exige `CRON_SECRET` próprio com ao menos 32 caracteres; funciona com cobrança desligada. Processa etapas financeiras autorizadas, desvinculação familiar e finalização com todos os recibos; depois remove até 100 consultas técnicas por execução, 24 horas após vencerem. A limpeza das consultas preserva auditoria, conta, cobrança e conteúdo. Limpeza usa trava do pedido, `SKIP LOCKED` e transação. Uma falha retorna 503 e é registrada, sem payload pessoal, em `ops.job_runs`.

A IaC prepara Conta, cron financeiro a cada minuto, manutenção a cada cinco e cinco crons locais de avaliação/encerramento a cada cinco minutos. Os crons têm limite HTTP de 300 segundos e alerta operacional a partir de seis minutos. A posse de uma etapa dura 90 segundos; durante I/O externo, é renovada a cada 20 segundos, somente enquanto o token/estado continuam válidos e dentro de 150 segundos. Esse prazo impede confirmação tardia; não aborta uma chamada externa em andamento, que deve possuir seu próprio limite. Cada worker recebe somente o segredo do próprio app por referência e fixa o app na composição. `COMPASSO_LAUNCHED=false` mantém esses oito novos recursos fora do grafo; sua habilitação exige também Dia de Estrela e depende do corte integral, plano remoto revisado e configuração real dos segredos. Não reverter flags após provisionar. O Bastidores lista os jobs preparados como aguardando implantação enquanto não há registro; retirar essa anotação após conferir a execução de todos. O ensaio local preservou os 30 recursos atuais e acrescentou 11 no cenário futuro completo (Conta e jobs mais Dia de Estrela e seus dois crons). Em 11/11, com a retirada da cobrança própria do Dia de Estrela, a avaliação offline do grafo dá 28 recursos hoje e 38 no cenário futuro: Conta, Dia de Estrela, os dois crons da Conta, os cinco de encerramento e o dos alertas do Dia, sem remoções, sem aplicar configuração remota.


## Preços dos contratos anteriores

A central compõe `legacyWebProducts` com o mesmo `getConfiguredProducts` usado por Missão Saber, Bora Treinar e Dia de Estrela. O catálogo define os nomes das variáveis antigas `MISSAO_*_PRICE` e `BORA_*_PRICE` (o Dia de Estrela nunca vendeu e não tem produto próprio desde 11/11); a IaC gera referências aos serviços originais e recusa variável não declarada. Não copiar valores manualmente nem atualizar preços comerciais para fazer um contrato passar. Os IDs fixos de Cozya/Agenda continuam vindo do catálogo. Conferir modo e contrato no Stripe antes do aceite de cada migração; variáveis configuradas não comprovam pagamento. A prévia de contratos usa somente leitura e ainda precisa da jornada de consentimento/executor.

Preflight somente de leitura em 10/11: o inventário MCP confirmou novamente 28 serviços, dois volumes e nenhuma mudança staged; Conta e Dia de Estrela continuam ausentes. Nenhum recurso ou variável foi alterado nessa consulta. Esse inventário não comprova prontidão funcional nem pagamento.

### Ensaio dos serviços em conjunto

`pnpm compasso:test:closure` cria PostgreSQL/Redis descartáveis e executa, em série, as rotas reais de avaliação, preparação e execução dos cinco apps e da Conta. A mesma pessoa sintética aparece em quatro apps; outra família serve de controle de preservação. A configuração confere `/api/ready`, credenciais de cron, repetição, ordem dos recibos e preservação da identidade global. Não envia e-mail nem chama IA/Stripe. Os identificadores transitórios ficam no diretório próprio do runner; `COMPASSO_CLOSURE_STAGE` e `COMPASSO_CLOSURE_FIXTURE` são variáveis exclusivas desse ensaio, não variáveis de produção. Plano e evidências em [encerramento integrado](../../docs/propostas/assinatura-web-2026-11-09/encerramento-integrado.md). A execução de 10/11 passou as 22 etapas, com PostgreSQL e Redis descartáveis removidos. O ensaio não inclui cobrança Stripe nem restauração de backup.

## Ferramentas do corte (11/11/2026)

Todas ficam em `scripts/compasso/`. As de leitura não escrevem nada; as que escrevem pedem confirmação explícita por argumento.

| Comando | O que faz | Escreve? |
| --- | --- | --- |
| `STRIPE_SECRET_KEY=... pnpm exec tsx scripts/compasso/stripe-provision.mts --mode dev\|prod` | Confere o catálogo Compasso no Stripe (produto, mensal, anual, três recargas, portal só com pagamento e comprovantes) e diz o que faltaria criar | Não |
| o mesmo com `--apply [--webhook-url https://conta.informach.com.br/api/webhooks/stripe --secrets-output <arquivo fora do repositório>]` | Cria o que falta, de forma idempotente, e devolve os IDs públicos para `COMPASSO_*_PRICE` e `STRIPE_PORTAL_CONFIGURATION_ID`; o segredo do webhook vai só para o arquivo indicado | Sim, no Stripe do modo escolhido |
| `railway run --service Postgres --environment production -- pnpm exec tsx scripts/compasso/titular-reconciliation.mts --stripe-env <arquivo> --stripe-key <nome>` | Concilia, por titular pseudonimizado, cada contrato local com o Stripe (situação, fim do período, faturas pagas contra períodos locais, faturas abertas, estornos, contestações, pagamentos em liquidação, Checkouts abertos, agendas, eventos pendentes) e as carteiras; termina com código 2 e a lista `blocking` se houver divergência | Não (banco em transação read-only; Stripe só GET) |
| `railway run --service Postgres --environment production -- pnpm compasso:rehearse:restore [--keep]` | Dump real (PostgreSQL 18), restauração em container descartável com os mesmos papéis, comparação de contagens, donos e privilégios, sequência completa do migrator na cópia com tempo medido, conferência de usuários, contratos, extrato e clientes do Dia de Estrela, e segunda rodada para provar que nada duplica | Não na origem; apaga o dump ao final |

Em 11/11 o catálogo de teste foi criado com `--mode dev --apply` (produto `prod_VbuWNVAWXYBYLH`, portal `bpc_1UaghZCvOctqao30chCRlFJg`) e a repetição não propôs mudanças. O live continua sem catálogo e só deve ser criado pela titular, com o comando acima.

## Sequência do corte (revista em 11/11/2026)

1. Conciliação por titular sem bloqueios (`titular-reconciliation.mts`), restauração do backup real aprovada (`pnpm compasso:rehearse:restore`), CI verde e plano Railway só com adições.
2. Catálogo live criado pela titular (`stripe-provision.mts --mode prod --apply` com o webhook da Conta) e segredos gravados nos serviços novos.
3. `railway config apply` e merge na `main`, com aprovação da titular. O migrator aplica de 0080 a 0162 de uma vez; `/api/ready` segura cada app.
4. `setup:oauth` da Conta, conferência de `/api/ready` e `/api/health`, crons em `ops.job_runs`, Sentry.
5. Entrada compartilhada, família, perfis e aparelhos nos cinco apps, ainda com `COMPASSO_BILLING_ENABLED=false`.
6. Nova conciliação por titular, agora com o schema novo: a comparação de faturas pagas com períodos locais precisa fechar depois da primeira leitura do provedor de cada contrato.
7. `COMPASSO_BILLING_ENABLED=true`. É exigido pelo aceite dos contratos antigos e pela programação da continuidade, não só pela venda. Não há clientes externos; nas famílias com contrato antigo, a barreira impede assinatura nova sobreposta.
8. Os titulares formam a família e cada um aceita o próprio contrato; o pagante prepara a continuidade e, se o outro adulto trouxer período maior, decide o adiamento. Conferir no Stripe a renovação antiga encerrada e a primeira cobrança na maior data paga.
9. Compra pequena real pela titular para homologar Checkout, webhook, crédito e extrato.
