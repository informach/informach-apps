# Operação do portal da suíte Edi

Destino definido: `https://edi.informach.com.br`, no Railway, seguindo o projeto e o padrão dos aplicativos Informach existentes. A configuração e o build estão preparados no repositório; o serviço, o domínio e o backend ainda precisam ser configurados e verificados na conta Railway. A assinatura comercial permanece desabilitada até a homologação.

## Serviço Railway

Usar um serviço separado para `@informach/edi`, no projeto `informach-apps` e ambiente `production`, ligado a `informach/informach-apps`, branch `main`. Manter a raiz do serviço em `/` e selecionar `/apps/edi/railway.toml` como arquivo de configuração. Não criar outro PostgreSQL nem substituir serviços existentes.

O build usa Railpack e `pnpm build:edi`. Ele gera o servidor standalone, copia os arquivos estáticos e empacota `setup-oauth.cjs`. O pre-deploy executa esse comando Node para provisionar idempotentemente o cliente OAuth público, sem criar client secret. A conexão exclusiva do comando é encerrada antes de sair; o runtime não depende de `tsx` ou de dependências de desenvolvimento.

O start executa o servidor standalone com `HOSTNAME=0.0.0.0` e respeita o `PORT` do Railway. O healthcheck `/api/ready` exige configuração de produção válida e todas as migrations do build aplicadas. `/api/health` identifica o app e o commit, sem consultar o banco.

## Configuração do backend

| Variável | Configuração |
| --- | --- |
| `NODE_ENV` | `production` |
| `NEXT_PUBLIC_APP_URL` e `BETTER_AUTH_URL` | `https://edi.informach.com.br`, sem barra final |
| `DATABASE_URL` | Referência ao PostgreSQL compartilhado do projeto |
| `BETTER_AUTH_SECRET` | Segredo forte configurado no serviço; seguir a política de identidade dos apps existentes |
| `CRON_SECRET` | Segredo forte usado pelo agendamento autenticado do Edi |
| `EMAIL_SANDBOX_MODE` | `live`; não usar sandbox em produção |
| `SENDGRID_API_KEY` e `SENDGRID_FROM` | Serviço de e-mail existente e remetente efetivamente verificado |
| `EDI_DESKTOP_CLIENT_ID` | `edi-desktop`, igual ao build desktop |
| `EDI_LICENSE_KEY_ID` | `edi-license-2026-10`, identidade já gerada |
| `EDI_LICENSE_PRIVATE_KEY` | Chave privada de licença recuperada do backup protegido, somente no backend |
| `EDI_DISTRIBUTION_REPOSITORY` | `informach/edi-releases` |
| `EDI_UPDATE_PUBLIC_KEYS` | Mapa público de atualização igual ao ambiente `edi-release` do GitHub |
| `EDI_BILLING_ENABLED` | `false` até a homologação comercial |
| `STRIPE_MODE` | `prod` em produção; testes comerciais em ambiente isolado |

Não colocar token GitHub ou chave privada de atualização no servidor. Não gerar uma nova chave de licença durante cada deploy: os instaladores confiam na chave pública correspondente à identidade já preparada. O backup DPAPI atual depende do perfil Windows; a recuperação portátil precisa ser providenciada antes de distribuição ampla.

## Ordem de publicação

1. Concluir os gates de qualidade e o review, depois integrar e enviar o commit para `main`.
2. Conferir que o migrator compartilhado aplicou as migrations aditivas `0069`, `0070` e `0071` desse commit. A última cria a agenda de retentativas, sem alterar fatos financeiros existentes. Não executar `db:push` nem aplicar migrations separadamente em cada app.
3. Executar o deploy do Edi. Se o pre-deploy ocorrer antes do migrator, ele falhará; repetir o deploy do mesmo commit após a confirmação da migração. Não contornar essa barreira.
4. Adicionar o domínio customizado no serviço e usar exatamente o destino DNS fornecido pelo Railway. Preservar a configuração dos demais subdomínios e as proteções TLS.
5. Verificar HTTPS, `/api/health`, `/api/ready`, arquivos estáticos, login, confirmação de e-mail e autorização de um desktop em ambiente de homologação.
6. Conferir que a chave de licença do backend corresponde à chave pública incorporada nos instaladores. Somente depois executar o primeiro release e a homologação de instalação/upgrade.

O ambiente GitHub `edi-release` já contém `EDI_PORTAL_URL=https://edi.informach.com.br`. O workflow exige readiness HTTP 200 com `ok: true`, sem redirecionamentos, antes de gerar os instaladores comerciais. Uma variável configurada não comprova que o portal foi publicado.

## Assinatura Stripe e manutenção

Reutilizar a conta Stripe existente, com um produto da suíte e dois preços próprios: R$ 29,90/mês e R$ 299/ano, sem consumo pago de IA incluído. Configurar os IDs nos campos `EDI_MONTHLY_PRICE_*` e `EDI_ANNUAL_PRICE_*`, a chave adequada ao modo, o webhook exclusivo `/api/webhooks/stripe` e um Portal restrito a esses dois preços. Não reaproveitar os preços ou o webhook de outro aplicativo. O Checkout verifica o catálogo no provedor antes de iniciar uma compra.

O handler atual consome **eventos snapshot**, com API do endpoint alinhada a `2026-04-22.dahlia`, e verifica a assinatura com o SDK sobre o corpo recebido antes de aplicar efeitos. Não selecionar eventos thin sem implementar e testar um adapter específico: eles têm outro contrato de payload. Configurar o segredo de assinatura exclusivo desse endpoint e separar teste/produção. A [documentação oficial de webhooks](https://docs.stripe.com/webhooks) distingue esses formatos e a configuração de versão para snapshots. A preferência atual do provedor por thin não autoriza alterar silenciosamente a integração existente.

A homologação deve cobrir compra, abandono, renovação, inadimplência, cancelamento, reembolso integral, disputa, replay e eventos fora de ordem. Produção rejeita cobrança habilitada em modo teste, preços ausentes/duplicados e chave incompatível com o modo. A aprovação dos valores não autoriza habilitar cobranças antes dessa verificação.

Agendar `POST /api/jobs/reconcile` com `Authorization: Bearer <CRON_SECRET>`, inicialmente a cada cinco minutos. O cron e sua monitoração ainda precisam ser configurados no Railway. Não adicionar o Edi indiscriminadamente a todos os crons antigos: as rotas de manutenção dos outros apps não são automaticamente contratos do Edi. Com cobrança desabilitada, o endpoint responde 503 `billing_disabled`, intencionalmente.

A reconciliação e os webhooks usam a mesma trava PostgreSQL por titular, inclusive durante a consulta ao Stripe, para não reativar acesso com uma leitura anterior a uma suspensão concorrente. Retentativas da outbox e da varredura periódica têm agendas separadas. `edi.billing_reconciliations` reserva tentativas por 10 minutos, aplica backoff exponencial de 30 segundos a 6 horas em falhas e agenda novo sucesso periódico em 6 horas. A próxima tentativa não substitui `reconciledAt`: freshness só avança após conferência financeira bem-sucedida. Jobs órfãos de contas removidas são encerrados sem consultar Stripe; falhas de outras contas não impedem a visita das seguintes. Indisponibilidade do provedor não autoriza estender o prazo offline já emitido.

O cadastro pendente pode ser retomado em `/entrar` sem refazer signup. Reenvio de OTP tem cooldown local de 60 segundos e limite persistente de 5 solicitações por 60 segundos no backend. Códigos inválidos/expirados não liberam login. O pre-deploy OAuth compara a política completa existente e falha em drift, sem sobrescrever configurações silenciosamente; mudanças deliberadas exigem migração de política.

O e-mail usa a fila compartilhada. Confirmar que o webhook assinado de entrega já operado pelos outros apps processa também as mensagens Edi e que o remetente tem entrega efetiva. Não tratar aceitação pelo provedor como confirmação de entrega.

## Verificação local e limites atuais

`pnpm build:edi` prepara o artefato real de produção. `pnpm edi:test:integration --portal` cria PostgreSQL descartável, aplica o histórico completo, executa os testes de OAuth, licença, dispositivos e concorrência de cobrança, roda o pre-deploy empacotado duas vezes e testa o servidor standalone por HTTP. O smoke verifica readiness, página inicial, assets efetivamente referenciados, sessão anônima, proteção da conta, device flow, entrada UTF-8 inválida/tamanho excessivo e cobrança desabilitada. Não envia e-mail, não compra, não publica e não usa o banco de produção.

O [registro de implementação](../../docs/propostas/edi-suite-2026-10-16/implementacao.md) identifica os gates ainda abertos. A publicação dos instaladores segue o [manual do piloto](../../docs/propostas/edi-suite-2026-10-16/distribuicao-piloto.md). Não há full review aprovado nem primeiro release público nesta etapa.
