# Operação e provisionamento Edi — 17/10/2026

Pedido vigente: corrigir os bloqueios e colocar o Hub em produção. Este registro separa configuração remota de implantação e testes efetivamente executados. A branch de implementação é `fix/edi-production`; ainda não houve publicação desktop nesta etapa.

## Infraestrutura provisionada

Projeto Railway `informach-apps` (`f4da4285-5b98-48b5-b03e-5be02f4e7c56`), ambiente `production` (`174b2cb0-e1cd-410c-8764-d913e3af18d3`).

| Recurso | Identidade | Estado nesta etapa |
| --- | --- | --- |
| Portal `@informach/edi` | `da22f05d-2044-445b-bcb2-8e2d0d0c73ce` | Criado; build/start/pre-deploy e variáveis configurados; deploy final pendente |
| `cron-edi-reconcile` | `71ccb512-eb51-470d-b6ef-e5adb3af4bad` | Criado, agenda `*/5 * * * *`, sem imagem ativa antes da validação da cobrança |
| PostgreSQL compartilhado | serviço `Postgres` existente | Conexão privada do Edi resolvida; leitura operacional confirmou migration `0068` e ausência das tabelas Edi antes do migrator |
| Migrator compartilhado | `82e23ee0-49ab-4046-90c3-6a0b6dd677e1` | Migrations `0069`–`0071` ainda precisam ser aplicadas |
| Sentry | projeto `edi`, organização Informach existente | Projeto/DSN e alerta padrão criados; instrumentação implementada e testada; ingestão real depende do deploy |

O Edi usa o mesmo PostgreSQL, com tabelas nos schemas de identidade/cobrança/Edi. Não exige Redis: rate limiting de autenticação persiste no PostgreSQL. O migrator escreve no banco, sem uma conexão direta portal→migrator. O cron usa `CRON_SECRET` por referência ao Edi e faz POST em `/api/jobs/reconcile`, com timeout de 60 segundos e falha HTTP não mascarada.

A configuração SendGrid foi inicialmente referenciada ao Cozya, depois copiada para uma variável independente do Edi para eliminar essa dependência entre serviços. A conta provedora é reutilizada. Consulta real confirmou `informach.com.br` validado no SendGrid e webhook de entrega compartilhado ativo em `cozya.informach.com.br`; seu handler verifica a assinatura antes de persistir os eventos no banco compartilhado. Ainda falta confirmar uma entrega OTP do Edi ao destinatário autorizado.

O domínio `edi.informach.com.br` foi adicionado com destino `6u2rq0z9.up.railway.app`. O titular criou CNAME/TXT na Cloudflare. A propriedade e o certificado TLS foram validados pelo Railway; o proxy Cloudflare foi identificado durante a propagação e foi solicitado ajuste para Somente DNS. Isso não comprova a prontidão HTTP do portal.

O primeiro deploy do código anterior (`f3bfbd3`) foi acionado durante a configuração e falhou no pre-deploy OAuth com `ZodError`, antes da configuração completa de segredos. Não houve promoção saudável. O próximo deploy deve usar o commit corrigido após o migrator.

A configuração passou para `.railway/railway.ts` após a API rejeitar o Config Path TOML. O plano foi revisado sem exclusões nem mudanças em outros serviços. A aplicação `iac-change-set/174b2cb0-e1cd-410c-8764-d913e3af18d3/5fd6a2efa00f19ac935024ab54d99f28` confirmou somente espera de checks do GitHub, reinício por falha e serviço sem suspensão automática. A configuração declara a parcial `edi`; a consulta de ownership ainda não listou propriedade persistida. Isso não equivale a um deploy saudável.

## Evidências locais e pendências

O commit `3c90cdc` foi publicado na branch `fix/edi-production` e abriu o [PR #6](https://github.com/informach/informach-apps/pull/6) em draft. A alteração pessoal em `.claude/settings.local.json` ficou fora do commit. Os workflows de CI, banco, Electron e mídia/upgrade Windows foram iniciados no GitHub; os resultados remotos ainda precisam ser conferidos antes do merge.

A primeira execução remota aprovou [banco/portal](https://github.com/informach/informach-apps/actions/runs/39025609082) e [Electron nos seis apps](https://github.com/informach/informach-apps/actions/runs/39025609077). O [CI geral](https://github.com/informach/informach-apps/actions/runs/39025609141) passou em lint/tipos e encontrou sete falhas de transição no FFmpeg Linux. A causa foi reproduzida em Docker e corrigida na ordem de extensão do último quadro; testes originais mantidos e cobertura acrescentada para velocidades 0,5×/2×. Depois da correção, os quatro gates locais gerais foram repetidos com exit 0: 21 tarefas de tipos, 19 de testes mais 31 testes do tooling e 12 builds; o lint manteve 462 warnings e 66 infos, sem erros. A suíte de mídia própria passou com 173 testes. Detalhes e limites em [producao-windows.md](producao-windows.md); o CI remoto do novo commit ainda precisa passar.

- `pnpm build:edi`: exit 0, standalone e pre-deploy empacotados.
- `pnpm edi:test:integration --portal`: exit 0; 3 testes auth, 12 licença/dispositivo e 7 cobrança/concorrência, migrations completas em PostgreSQL descartável; pre-deploy repetido e encerramento da conexão; readiness, página, 10 assets, sessão, conta, device flow e cobrança desabilitada por HTTP.
- Backup `age` recuperado em processo separado e corrupção rejeitada, conforme [distribuição](distribuicao-piloto.md).
- Rodada geral final antes do PR, após as correções Stripe e de exportação/empacotamento: `pnpm check` exit 0 (2.110 arquivos; 462 warnings e 66 infos, nenhum erro); `pnpm typecheck` exit 0 (21 tarefas e tooling); `pnpm test` exit 0 (19 tarefas e 31 testes do tooling); `pnpm build` exit 0 (12 tarefas, com variáveis fictícias de build equivalentes ao CI, sem credenciais reais); `pnpm audit --prod` sem vulnerabilidades conhecidas. Os avisos não foram ocultados nem convertidos em uma alegação de lint sem warnings. A [verificação Windows](producao-windows.md) registra separadamente a suíte com o bundle próprio e os layouts NSIS; o CI ainda precisa instalar e atualizar os seis apps.
- `pnpm edi:test:native`: exit 0 nos seis apps; gate, licença offline assinada, expiração e bloqueio de IPC com perfis e chaves efêmeros, sem instalação/publicação.
- Não há cobrança real de teste, instalação em perfis pessoais nem release público nesta etapa.
- O [guia de desenvolvimento](../../desenvolvimento-edi.md) solicitado pelo titular foi criado e ligado às referências permanentes. Revisão documental confirmou 14 links locais, 59 referências de comandos e 16 blocos PowerShell; o exemplo de geração Ed25519 foi executado em fixture e recusou sobrescrita sem alterar a identidade. Isso não é uma alegação de nova homologação funcional.

## Imagem Stripe

Arquivo final: `apps/edi/public/images/edi-suite-product.png` (PNG, 1.332.798 bytes), destinado à URL `https://edi.informach.com.br/images/edi-suite-product.png`. Gerado pelo tool incorporado `image_gen`, inspecionado visualmente e copiado para o projeto; o original permanece no diretório de imagens geradas do operador.

Prompt: imagem quadrada para o Checkout da suíte criativa Edi, fundo marfim `#f6f4ef`, tipografia carvão `#22242a` e detalhes ocre `#e1a433`; textos exatos “Edi” e “Suíte criativa”; cinco cartões esculturais representando vídeo, captura, foto, PDF e desenho vetorial; sombras suaves, margens generosas, legível em miniatura, sem preços, selos ou alegações funcionais. A associação nos produtos teste/produção deve ser confirmada pelo Stripe CLI após a imagem responder publicamente com HTTP 200.
