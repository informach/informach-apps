# Recreio e Morada: operação do alfa fechado

Atualizado em 15/11/2026, 21h01 UTC. **Portal e Morada no alfa fechado com editor e coleção inicial D2**, fonte `7c81a68f`. Portal `59c3b020-8a77-4185-98f8-cb6d5db7c605` e Morada `c69f1531-85a3-4b89-9c3c-8feb0aae54f6`: deployments aprovados, fonte conferida e saúde/prontidão públicas 200. Seis gates `43753775951` e repetição na main `43754919539` aprovados. Chave das ações conservada; upload dos mapas confirmado no Sentry, segredos preservados na IaC e import do wrapper atualizado. `RECREIO-4` corrigido na release `8559f4ab`, com detecção de regressões. No marco `36606409`, a execução privada `43745943221` aprovou 48 prévias/criação personalizada e cinco jornadas gerais com arte; o titular confirmou salvar/reabrir conservando as escolhas. As duas contas piloto têm cortesia até 15/12; jogo conjunto humano ainda sem prova. O núcleo Mundo V3/editor de móveis segue apenas em candidata, sem implantação.

Manutenção implantada; três execuções consecutivas aprovadas conferidas em `ops.job_runs` às 10:35/10:40/10:45 UTC. Bastidores com ambas as sondagens internas `up` na consulta de 10:45. Entrega sanitizada ao Sentry e recebimento humano dos avisos de teste confirmados. Sondagens Sentry de 60 s continuam **desativadas por orçamento**, sem ampliação nem alteração de monitores alheios. A [sonda GitHub](../../docs/recreio/monitoramento-externo.md) funciona manualmente, mas não apresentou disparo agendado na janela observada. [Cron Cloudflare](../../docs/recreio/sonda-cloudflare.md) com duas execuções automáticas aprovadas às 14h25/14h30 UTC, ingestão conferida e flag de prova desligada. Regra específica Sentry 6349336 para falhas externas, e-mail e intervalo de 30 min, independente da prioridade automática; ainda sem falha real provocada em produção.

Arte D2 em `/data/arte/d2-4198478735b6`, commit privado `4f301210`, manifesto V3 SHA-256 `4198478735b643e07d4ce0821db82654c42847bbf996d1d07a99a5890b21672f`: 56 personagens/48 opções iniciais. Os 240 arquivos incluem Brotli; o servidor validou 120 originais, 24.723.634 bytes. Código compatível implantado antes da troca da pasta. Manifesto sem sessão responde 401 e CORS restringe a origem. Pacote recuperável no rascunho privado 446270559 do `artes-3d`, ZIP e 240 arquivos reconferidos após download; [evidência](../../docs/recreio/evidencias/editor-familia-2026-11-15.json). D1 preservado, mas mundo V2 com receitas novas exige fonte compatível e a coleção V3; fonte antiga/D1 não é rollback desse mundo. Arte e capturas permanecem privadas; sem prova de FPS/diversão. Casa e orçamento continuam fixos neste perfil.

As três flags IaC estão em `true` e não são mecanismo de rollback. A ativação foi sequencial e restrita aos recursos Recreio/monitoração. [Registro de execução](../../docs/recreio/execucao-2026-11-15.md); [IDs e DNS](../../docs/recreio/railway-2026-11-13.md). O [backup lógico real foi restaurado em destino isolado](../../docs/recreio/ensaio-backup-producao.md), com conteúdo/estrutura comparados e limpeza confirmada. X4 continua aberto: restauração de backup agendado, carga e custo por mundo. Backups Postgres diários/semanais/mensais existem; PITR desligado. Não restaurar sobre o banco compartilhado como ensaio.

Stripe continua sem configuração; os preços `price_TODO_recreio_*` não permitem cobrança. Pendências no [roteiro de cobrança](../../docs/recreio/stripe-pendente.md). D2–D8, proteção familiar completa e condições jurídicas continuam abertas.

Primeira [medição de custo](../../docs/recreio/custo-alfa-2026-11-15.md): US$ 0,01013593 de uso atribuído pelo Railway aos dois serviços às 12:25 UTC, em amostra praticamente ociosa. Banco/Redis/monitoração compartilhados ainda sem rateio; não comprova custo por jogador ou hora de mundo.

Evolução D3 fora da produção: editor e pintura `472b3c2e` passaram nos seis
gates `43771703601`. A prova privada dos oito móveis preservou a arte original
sem diferença de pixels; a prova pelo portal completo e o corte de protocolo
continuam em execução. Não trocar a fonte/pasta de arte por esses candidatos
antes da homologação e da sequência compatível. [Plano e limites do D3](../../docs/recreio/d3-construcao-compras.md).

## Serviços implantados e arte preparada

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

O arquivo IaC define as origens pretendidas, acesso fechado, jogo de teste desligado, e-mail em modo real, conexão aos serviços compartilhados, portas e builds. O portal está vinculado a `recreio.informach.com.br:3009`, e o servidor a `morada-server.informach.com.br:3010`. Os vínculos/DNS/TLS estão validados. A consulta Railway do CNAME ainda pode apontar divergência porque a Cloudflare responde IPs de proxy; confirmar propriedade/certificado e a rota HTTP além dessa consulta. Seguir o [runbook](../../docs/deploy-runbook.md).

Segredos e referências foram preparados com `skipDeploys=true`. Em 15/11 foram criados projetos próprios Sentry para Recreio/Morada e configurados os DSNs nos serviços; os monitores HTTP 10959593/10959594 permanecem desativados até a publicação. A associação VCS do repositório no Sentry está pendente. Morada tem prazo Railway de drenagem de 35 s (processo: 25 s) e tetos de rede preparados: 1024 conexões, 32 pedidos simultâneos, 400 quadros/s. A configuração ainda precisa passar no gate e ser aplicada pelo deploy; a presença de variáveis não comprova conectividade, alerta ou capacidade.

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
3. Concluir Sentry e validar DNS/certificados. Os segredos e vínculos já foram configurados; manter `RECREIO_PROVISIONED=true` e `RECREIO_DOMAINS_CONFIGURED=true`. Só então mudar `RECREIO_LAUNCHED` para `true` e executar `railway config plan --verbose`. Revisar o plano concreto antes de aplicar. Qualquer destruição ou alteração fora desses quatro recursos interrompe o fluxo. O plano global ainda precisa preservar os serviços Conta/Dia de Estrela já existentes e o bloqueio operacional do Compasso; não aplicar o arquivo inteiro para concluir apenas esta frente.
4. Após autorização do plano, aplicar pelo fluxo do runbook. Conferir `/api/ready` dos dois serviços, origem do WebSocket, JWKS, registro da instância e manutenção.
5. Criar duas contas de teste e conceder acesso auditado com `pnpm --filter @informach/recreio-app conceder --email <conta> --tier individual --dias 30 --motivo teste_equipe`. O script exige `DATABASE_URL` autorizado e não gera assinatura Stripe.
6. Repetir duas contas no mesmo mundo, convite de uso único, queda de uma pessoa, morte da instância, recuperação do estado, revogação do acesso e saída da conta.
7. Configurar `ADMIN_RECREIO_ENABLED=1` no Bastidores depois de os dois serviços estarem prontos. O painel passa a sondar ambos; a manutenção deixa de aparecer como aguardando lançamento quando registrar a primeira execução. Incluir essa variável no bloco IaC do Bastidores ao ativá-la.

Os recursos já existem: desligar `RECREIO_PROVISIONED` enquanto `RECREIO_LAUNCHED=false` os removeria do próximo plano. Depois da ativação, não usar essas constantes para rollback; mudar `RECREIO_LAUNCHED` para `false` retiraria as fontes de implantação e desligar a constante de domínios retiraria o vínculo público. Rollback é reimplantar o commit/arte anterior mantendo recursos, segredos, chaves e dados.

## Medição e limites

No X4, medir 1, 2, 4 e 8 jogadores por mundo com processo compilado, rede e armazenamento reais. Registrar duração, mundos, jogadores, CPU, memória, bytes enviados, bytes de diário/fotografias, custo do Postgres/Redis/volume e critério de rateio. As métricas de bancada não comprovam custo em produção. Acesso à rota de métricas é por Bearer e nunca aparece em URL ou log.

A exclusão automática de contas com perfil Recreio está temporariamente bloqueada em todos os produtos: o suporte precisa tratar os pedidos até existir sucessão/saída de mundos. Não apagar contas diretamente como procedimento de suporte sem um plano de preservação dos mundos compartilhados.

Lançamento público continua dependendo das condições jurídicas e de licença do registro da frente. A arte da casa atual do D1 está implementada na frente correspondente; a meta de FPS em vídeo integrado ainda precisa de homologação. Criar família, construção/compras, expansão das interações, som e teste de diversão continuam nos lotes D2–D8; esta preparação de implantação não os declara concluídos.
