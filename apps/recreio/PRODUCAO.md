# Recreio e Morada: operação do alfa fechado

Preparação em 13/11/2026. **Recursos provisionados, aplicativos ainda não implantados.** Os dois serviços, o cron e o volume já existem no Railway, com builds, rede interna e variáveis não secretas configurados. A configuração em `.railway/railway.ts` usa `RECREIO_PROVISIONED=true`, `RECREIO_DOMAINS_CONFIGURED=false` e `RECREIO_LAUNCHED=false`: preserva os recursos, sem domínios públicos ou fontes de código/imagem. Estado conferido, IDs e bloqueios no [registro operacional](../../docs/recreio/railway-2026-11-13.md).

A implantação fechada e a medição de custo continuam no lote X4. O Stripe não foi acessado nem configurado; os passos restantes estão no [roteiro de cobrança](../../docs/recreio/stripe-pendente.md). Os preços `price_TODO_recreio_*` não permitem cobrança.

## Serviços preparados

| Recurso | Execução | Prontidão |
| --- | --- | --- |
| `@informach/recreio-app` | Next standalone; porta 3009 | `/api/ready`: schema compatível e Redis disponível |
| `@informach/morada-server` | `pnpm start:morada-server` → Node `dist/main.mjs`; porta 3010 | `/api/ready`: instância registrada e fora de drenagem |
| `morada-arte` | Volume privado de 1 GB em `/data` do servidor | Pacote conferido ao iniciar o servidor quando configurado |
| `cron-recreio-manutencao` | `POST /api/jobs/manutencao`, a cada 5 minutos | Execução em `ops.job_runs`, somente contagens |

Postgres, Redis, região e migrator são os existentes no projeto. Morada não recebe `DATABASE_URL`; usa exclusivamente a API das instâncias. Uma réplica até existir endereço público por instância. O portal usa `recreio:auth:` e `recreio:rl:` no Redis.

## Configuração antes do lançamento

O `preserve()` do Railway mantém uma variável existente; não cria um segredo ausente. Preparar os valores no provedor, sem colá-los em chat, Git, artefatos de revisão ou logs:

| Serviço | Variáveis | Contrato |
| --- | --- | --- |
| Recreio | `BETTER_AUTH_SECRET`, `CRON_SECRET` | Valores próprios, aleatórios, 32+ caracteres |
| Recreio | `RECREIO_TOKEN_PRIVATE_KEY`, `RECREIO_TOKEN_KEY_ID` | Ed25519 PKCS8 e identificador, gerados com `pnpm --filter @informach/recreio-app gerar-chave` em terminal privado |
| Recreio | `RECREIO_TOKEN_PREVIOUS_PUBLIC_KEYS` | `{}` inicialmente; conservar chaves públicas antigas durante rotação |
| Recreio | `RECREIO_HOST_SECRETS` | JSON `{"morada":"<segredo próprio de 32+ caracteres>"}` |
| Morada | `RECREIO_HOST_SECRET` | Mesmo segredo do campo `morada` acima |
| Morada | `MORADA_METRICAS_TOKEN` | Segredo próprio de 24+ caracteres para `/api/metricas`; rota ausente se omitido |
| Recreio | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Obrigatórios em produção, com o mesmo DSN do projeto Recreio; o validador recusa ausência ou divergência |
| Morada | `SENTRY_DSN` | Opcional; se configurado, usar projeto próprio e conferir entrega sanitizada |

O arquivo IaC define as origens pretendidas, acesso fechado, jogo de teste desligado, e-mail em modo real, conexão aos serviços compartilhados, portas e builds. O domínio previsto do portal é `recreio.informach.com.br`, e o WebSocket é `wss://morada-server.informach.com.br`. O vínculo desses domínios foi recusado pela revisão automática do plugin e aguarda aprovação explícita; DNS e certificado ainda não foram configurados. Registrar os domínios/DNS pelo fluxo do [runbook](../../docs/deploy-runbook.md).

As tentativas de gravar os novos segredos também foram recusadas pela revisão automática. As variáveis sensíveis continuam pendentes; `preserve()` não supre essa ausência. Referências a Postgres/e-mail, os segredos novos e o cron precisam ser concluídos conforme o registro operacional. O OAuth do plugin permite conferir nomes de variáveis, mas não revela seus valores: isso não comprova conectividade ou prontidão.

O Morada alcança `http://informachrecreio.railway.internal:3009`; esse HTTP só é aceito para um hostname privado exato do Railway. `RECREIO_EMISSOR=https://recreio.informach.com.br` continua sendo o emissor dos tokens. Rede interna, origem de navegador e emissor são valores separados. O servidor ouve em `::` para atender a rede privada IPv6 e o tráfego público IPv4.

## Arte licenciada

O código é público. O clone `informach/artes-3d` e a saída do empacotador ficam fora deste repositório e de qualquer artefato público de CI. Consulte a [nota de passagem](../../docs/recreio/passagem.md) para o commit e os caminhos de empacotamento já utilizados.

1. Empacotar num ambiente privado com `ARTES_3D_DIR=<clone privado> pnpm --filter @informach/morada-arte empacotar -- --saida <pasta privada> --casa packages/morada-sim/src/conteudo/imoveis/casa-prova.v1.json`.
2. Transferir a saída completa (`manifest.json`, GLBs, PNGs e cópias `.br`) por um canal privado autorizado para `/data/arte/<versao>` no volume do Morada. Este trabalho não configura um upload nem um bucket novo.
3. Definir `MORADA_ARTE_DIR=/data/arte/<versao>` no provedor somente depois da transferência. Reiniciar o processo para conferir/carregar o pacote. Não sobrescrever arquivos de uma versão em uso; preservar a versão anterior para rollback.
4. Acrescentar `assets: "https://morada-server.informach.com.br"` ao mapa `RECREIO_GAME_ORIGINS.morada` na IaC e reconstruir o portal, pois essa origem também participa da CSP do documento.
5. Conferir `/jogar/morada` com a arte: CORS, CSP, corpo real, sentar/deitar, gravidez e bebê no colo. A rota `/arte/` exige sessão de jogo válida e só entrega os nomes do manifesto.

Sem `MORADA_ARTE_DIR` e sem `assets` o jogo usa formas procedurais. Pacote declarado ausente ou inválido impede a subida; isso não deve ser contornado na prontidão.

## Sequência de implantação fechada

1. Validar gates do [review](../../docs/recreio/review-2026-11-13.md), aprovar a revisão de termos/privacidade do alfa e conferir que testadores são adultos da equipe.
2. Conferir acesso ao Railway, backups, estado do migrator e segredos. Não rodar migrations automaticamente no start dos apps. `/api/ready` deve continuar bloqueando banco incompatível.
3. Concluir segredos, Sentry e domínios; registrar `RECREIO_DOMAINS_CONFIGURED=true` após conferir o vínculo. Manter `RECREIO_PROVISIONED=true`. Só então mudar `RECREIO_LAUNCHED` para `true` e executar `railway config plan --verbose`. Revisar o plano concreto antes de aplicar. Qualquer destruição ou alteração fora desses quatro recursos interrompe o fluxo. O plano global ainda precisa preservar os serviços Conta/Dia de Estrela já existentes e o bloqueio operacional do Compasso; não aplicar o arquivo inteiro para concluir apenas esta frente.
4. Após autorização do plano, aplicar pelo fluxo do runbook. Conferir `/api/ready` dos dois serviços, origem do WebSocket, JWKS, registro da instância e manutenção.
5. Criar duas contas de teste e conceder acesso auditado com `pnpm --filter @informach/recreio-app conceder --email <conta> --tier individual --dias 30 --motivo teste_equipe`. O script exige `DATABASE_URL` autorizado e não gera assinatura Stripe.
6. Repetir duas contas no mesmo mundo, convite de uso único, queda de uma pessoa, morte da instância, recuperação do estado, revogação do acesso e saída da conta.
7. Configurar `ADMIN_RECREIO_ENABLED=1` no Bastidores depois de os dois serviços estarem prontos. O painel passa a sondar ambos; a manutenção deixa de aparecer como aguardando lançamento quando registrar a primeira execução. Incluir essa variável no bloco IaC do Bastidores ao ativá-la.

Os recursos já existem: desligar `RECREIO_PROVISIONED` enquanto `RECREIO_LAUNCHED=false` os removeria do próximo plano. Depois da ativação, não usar essas constantes para rollback; mudar `RECREIO_LAUNCHED` para `false` retiraria as fontes de implantação e desligar a constante de domínios retiraria o vínculo público. Rollback é reimplantar o commit/arte anterior mantendo recursos, segredos, chaves e dados.

## Medição e limites

No X4, medir 1, 2, 4 e 8 jogadores por mundo com processo compilado, rede e armazenamento reais. Registrar duração, mundos, jogadores, CPU, memória, bytes enviados, bytes de diário/fotografias, custo do Postgres/Redis/volume e critério de rateio. As métricas de bancada não comprovam custo em produção. Acesso à rota de métricas é por Bearer e nunca aparece em URL ou log.

A exclusão automática de contas com perfil Recreio está temporariamente bloqueada em todos os produtos: o suporte precisa tratar os pedidos até existir sucessão/saída de mundos. Não apagar contas diretamente como procedimento de suporte sem um plano de preservação dos mundos compartilhados.

Lançamento público continua dependendo das condições jurídicas e de licença do registro da frente. A arte da casa atual do D1 está implementada na frente correspondente; a meta de FPS em vídeo integrado ainda precisa de homologação. Criar família, construção/compras, expansão das interações, som e teste de diversão continuam nos lotes D2–D8; esta preparação de implantação não os declara concluídos.
