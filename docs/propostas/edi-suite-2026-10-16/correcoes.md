# Correções do full review

**Atualização de 17/10/2026:** a frente `fix/edi-production` corrigiu a cadeia restante de R01 com substituição mantida do parser de front matter, compatibilidade verificada no consumidor Mastra e atualização da cadeia do downloader Electron. `pnpm audit --prod` passou sem vulnerabilidades conhecidas, sem ignores. O titular também autorizou corrigir e implantar o Edi; essa autorização mantém os gates comerciais e de distribuição. O [registro operacional atual](producao-operacao.md) e os registros [Stripe](producao-stripe.md), [trabalhos](producao-jobs.md) e [Windows](producao-windows.md) contêm as evidências posteriores. Os resultados abaixo preservam a rodada anterior e não representam o estado final da implantação.

## Histórico da rodada de 16/10

Rodada iniciada em 16/10/2026 na branch `feat/edi-suite`, HEAD de referência `54c8cee`. O diagnóstico original em [full-review.md](full-review.md) permanece histórico. Naquele momento ainda não havia commit, merge, push, publicação, deploy ou cobrança real desta rodada.

**Resultado registrado em 16/10: R02–R10 corrigidos; R01 ainda bloqueante para release e operação comercial.** O usuário confirmou expressamente que não aceitava exceção temporária para a dependência remanescente. Posteriormente, pediu commit de tudo, merge e push para `main`; naquele pedido, a autorização cobria a integração Git. A autorização operacional posterior e a correção de R01 estão registradas na atualização acima. As homologações externas do relatório original não foram dispensadas.

## Lote de segurança e contratos

| Achado | Correção | Evidência atual |
| --- | --- | --- |
| R02 | Schema runtime completo de projeto/spec; capabilities para entradas, destino e sidecars; staging, flush, backups separados e recuperação na substituição. Saves usam o helper compartilhado e validam o projeto. | 166 testes EdiAula; 32 SDK, incluindo rollback real de rename e serialização. FFmpeg real gerou MP4/SRT/VTT/JPG usando entradas autorizadas. Electron recusou exportação não autorizada sem alterar o sentinela. |
| R04 | Publicador consulta a release anterior com todas as chaves aprovadas, mantendo a correspondência do signer privado atual. | Teste com assinaturas Ed25519 reais antiga/ambas/nova e rejeição de chave removida; 21 testes de tooling passaram. |
| R05 | Hub e updater usam a mesma política e o mesmo vault/piso por canal, antes de expor/baixar artefatos. | Persistência entre consumidores, ferramenta ausente/reinstalada/antiga, replay e isolamento stable/beta testados no SDK. |
| R06 | Retomada explícita, reenvio, cooldown local e limites backend existentes; login não verificado retorna à confirmação. | Três testes de UI e integração PostgreSQL com OTP real expirado/inválido/reenvio/confirmação e bloqueio 429 após esgotar o limite passaram. |
| R07 | Agenda de tentativas separada de freshness, reserva de 10 min para interrupções e backoff exponencial de 30 s a 6 h; sucesso periódico a cada 6 h. Jobs órfãos são retirados sem abortar contas vivas. | PostgreSQL real: 31 contas, 25 falhas permanentes, visita das demais, repetição com backoff e nenhum freshness falso; teste de customer removido. Migration aditiva 0071 gerada e aplicada no banco descartável. |
| R08 | Pre-deploy verifica a política de client e resource, incluindo scopes, grants, consentimento, PKCE, TTLs e disabled; drift falha sem overwrite silencioso. | PostgreSQL real: idempotência e campos alterados individualmente; device grant/refresh/replay continuam passando. |
| R09 | `.nvmrc`, README, AGENTS, arquitetura e guias específicos de auth/billing/IA/e-mail alinhados ao runtime e manifests. Runbook registra migration 0071 e novos fluxos. | Node 24.15.0, Better Auth 1.7.10, regras pagas Edi, versões efetivas e pin Stripe conferidos. |
| R10 | Erros de entrada tipados (400/413), separados de transporte (503); limpeza preserva a classificação e libera o reader, inclusive em excesso declarado. | Cinco testes de streaming/UTF-8/cancelamento passaram; classificação HTTP incluída no smoke standalone. |

Migration 0071 cria somente `edi.billing_reconciliations`, FK e índice; não reescreve migrations aplicadas nem fatos financeiros. Aplicar pelo migrator existente antes do portal novo. Rollback de código mantém a tabela aditiva; eventual remoção requer migration explícita, nunca edição do histórico. Índices são criados sobre tabela nova vazia.

Revisão do lote: substituição de vários arquivos não é uma transação atômica contra queda de energia do sistema operacional. Em falha de recuperação, a pasta própria é preservada e informada; não apagar destinos nem esconder erros. Testes não acessam projetos reais. Autorização local não substitui a validação de licença.

Na revisão complementar, `cursor:cached` e `media:probe` passaram a conceder leitura dos resultados derivados no main, preservando o uso legítimo das capabilities. O ID de sprite aceita somente caracteres de cache key, inclusive decimais usados pelo gerador; rejeita separadores, drive e NUL. Isso impede que um ID do renderer escolha outra pasta. Jobs duplicados não substituem o processo anterior. Saves só limpam temporários efetivamente criados; falha na limpeza após commit informa que os destinos finais foram preservados.

## Lote de dependências de 16/10 — R01 então parcialmente remediado

Atualização compatível e lockfile regenerado, sem `audit --fix --force`, mudanças silenciosas da API comercial ou supressão de advisories:

| Família | Resolução adotada |
| --- | --- |
| Next.js | 16.4.2 em todos os consumidores |
| Vitest / Vite | 5.0.5 / 8.3.4; JSX de testes via Oxc automático |
| Biome | 2.5.15; configuração migrada para `preset: recommended` |
| React / types React | 19.3.1 / 19.3.0, sem duplicatas incompatíveis de `React.Ref` |
| Node / types Node | runtime 24.15.0; types na linha 24.19.2 |
| Mastra | core 1.78.0, pg 1.31.2, memory 1.38.0, loggers 1.3.8, observability 1.20.1 |
| AI SDK providers | OpenAI 3.0.130, Anthropic 3.0.133; mesma linha major |
| Sentry | 10.76.2, mesma linha major |
| React Email | components 1.0.12, render 2.1.1 |
| Stripe | **22.1.0 literal**, preservando API 2026-04-22.dahlia; mudança de revisão exige migração própria |

Overrides restritos às famílias afetadas corrigem esbuild, Hono, PostCSS, fast-uri e ip-address; Vitest 2/Vite 6 não são mais forçados. Anotações de mocks usam o `Mock` canônico do Vitest 5, sem casts que ocultem a nova sobrecarga construtível. Os 16 snapshots de e-mail foram revistos: 14 HTMLs mantêm texto normalizado e destinos `href/src`; dois plaintexts removem padding invisível de preheader. Os testes dos templates passaram. Isso não substitui uma homologação de entrega no provedor.

Auditoria de produção: **151 → 1 ocorrência moderada, zero alta/crítica**. Auditoria incluindo desenvolvimento: duas ocorrências moderadas do mesmo advisory, em versões distintas de `sprintf-js`. Não são duas vulnerabilidades diferentes. O [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) informa que não existe versão corrigida; a falha exige controle da string de formatação com precisão numérica fora dos limites do ECMAScript.

- Produção: Mastra → gray-matter 4.0.3 → js-yaml 3.15.2 → argparse 1.0.10 → sprintf-js 1.0.3. O caminho de YAML usa `safeLoad/safeDump`, não o CLI argparse. Um teste em processo limpo carrega o engine real e confirma ausência de argparse/sprintf no `require.cache`. É evidência de não carregamento nesse caminho, não prova universal de ausência de exposição.
- Desenvolvimento: electron-builder → app-builder-lib → @electron/get → global-agent → roarr → sprintf-js 1.1.3. Formatter chega ao tooling, não por uma dependência direta adicionada aos editores.
- Não substituir js-yaml 3 por 4 à força: gray-matter usa APIs removidas. Não renomear versões, ignorar advisory, aplicar monkey patch ou tratar uma alteração que continua lançando exceção como correção de DoS.
- **Decisão do usuário: manter R01 bloqueante até correção/substituição validada.** Sem exceção de segurança ou distribuição. O pedido posterior autoriza somente commit/merge/push do código com esse estado conhecido e documentado. Repetir auditoria e testes quando o upstream corrigir ou quando uma substituição tiver escopo aprovado; não presumir aprovação para reescrever a infraestrutura IA dos produtos existentes.

O workflow Edi de release executa `pnpm audit --prod` imediatamente após a instalação congelada, sem threshold reduzido, ignore list ou tolerância a falha. Portanto, a publicação automática também permanece bloqueada pelo advisory atual. Esse gate não foi imposto aos deploys operacionais dos outros produtos.

Há diagnósticos não bloqueantes de depreciação/peer nas dependências legadas (incluindo React Email e a linha Zod 3 de consumidores antigos). Não foram mascarados por `allowedVersions` ou metadados falsos. Esses diagnósticos e novos avisos de runtime/tooling precisam acompanhar a próxima rodada de atualização.

## Lote de qualidade e interface — R03 corrigido

`pnpm check` agora passa, sem erros. A configuração recomendada continua ativa. A classificação específica de `useProgram` vale somente para o método nativo WebGL no compositor EdiFoto; hooks React continuam sob a mesma regra. Apenas os SVGs de entrada da auditoria `apps/edisvg/audits/etapa-01/fixtures` foram excluídos do lint de produto: são dados de teste, não a interface distribuída. As fixtures não foram adulteradas para satisfazer uma regra de UI.

Efeitos e callbacks foram corrigidos por dependências reais, subscriptions e eventos de efeito, sem deps artificiais, desativação de regras ou loops de estado. IDs persistentes de paletas/gradientes sobrevivem a edição, reorder e round-trip. Fragments derivados usam identidades por conteúdo/ocorrência, não índices de listas editáveis.

Diálogos usam modalidade nativa, botões de cards ficam separados dos controles de remoção, escolhas/ranges usam controles nativos e o editor de texto PDF usa textarea. O review nativo detectou e corrigiu uma regressão real: refs de filhos focavam antes de `showModal`, impedindo o retorno ao disparador. O helper compartilhado agora coordena essa ordem sem timers, fecha o dialog no cleanup e deixa o navegador controlar modalidade. Testes reais de EdiAula/EdiFoto passaram para Tab, Shift+Tab, Escape e retorno de foco; screenshots foram inspecionadas.

Na revisão final, o shield de acesso também passou a ser um diálogo modal nativo: um `z-index` alto não cobre um diálogo já aberto na top layer. A expiração agora o sobrepõe, Escape não o descarta e a renovação preserva o diálogo de edição anterior. A restauração de acesso conserva os valores `inert` preexistentes em vez de habilitar indiscriminadamente os roots. Os seis apps passaram novamente; EdiAula/EdiFoto exercitaram expiração com diálogo aberto, bloqueio, retomada e preservação, incluindo um sentinela DOM previamente `inert`. IPC do main continua sendo a autoridade de licença. Após essa alteração, os seis instaladores foram recompilados e verificados novamente.

O preview EdiAula gera WebVTT a partir de texto efetivamente disponível, com recorte/velocidade e descarte das URLs Blob. Sem transcrição/texto, não inventa captions. EdiCaptura grava sem áudio e mantém essa característica explicitamente no preview. Isso não conclui as funcionalidades de transcrição ou a acessibilidade de toda mídia do usuário.

A versão nova do Biome aplica diagnósticos adicionais: resultado atual **0 erros, 463 warnings e 66 infos** em 2.077 arquivos. Os avisos permanecem visíveis, principalmente non-null assertions e especificidade CSS legadas. O aceite deste achado é restaurar o gate e revisar os fluxos alterados, não afirmar que todo warning ou todo recurso dos editores foi eliminado.

## Verificação consolidada e review final

| Verificação | Resultado nesta rodada |
| --- | --- |
| Instalação | `pnpm install --frozen-lockfile` passou, inclusive cópia pdf.js |
| Lint/formatação | `pnpm check` passou; `git diff --check` passou; 13 documentos/116 links locais conferidos |
| Auditoria | `pnpm audit --prod` retorna exit 1 pelo advisory remanescente, conforme o bloqueio aprovado; o workflow de release usa esse mesmo gate |
| Tipos | 21 tarefas sem cache e tooling passaram |
| Unitários/domínio | 19 tarefas sem cache e 21 testes de tooling passaram; EdiAula 166, SDK 32, auth 221, billing 199 e IA 72 |
| Builds | 12 tarefas sem cache passaram, com credenciais fictícias, banco inacessível de propósito e cobrança Edi desativada; portal repetido também em modo estrito de env do Turbo; não é deploy |
| PostgreSQL + HTTP | 17 testes reais passaram; histórico completo/migration 0071, pre-deploy duas vezes e standalone com 10 assets; repetição final confirmou UTF-8 inválido → 400 e excesso → 413 |
| Electron | Seis apps passaram com licença Ed25519 efêmera, gate, offline, expiração e bloqueio IPC; EdiAula preservou sentinela; diálogos testados |
| NSIS | Seis instaladores recompilados e verificados novamente após o ajuste final de licença, versão local efêmera 0.0.0-beta.37520; inventários/integridade passaram; nenhum instalado ou publicado |

Uma execução de testes simultânea ao full build teve quatro timeouts em testes reais de disco; a repetição sem builds concorrentes passou, sem aumentar timeout ou alterar as asserções. Os ajustes do ambiente de build local foram corrigidos no harness ignorado (URLs de desenvolvimento loopback, DSN fictícia válida e repositório de distribuição não vazio), mantendo as validações de produção intactas.

Artefatos NSIS finais de teste ficam em `.cache/edi-release/0.0.0-beta.37520`, com chaves efêmeras e portal `.invalid`; a primeira rodada 0.0.0-beta.15104 também passou. Nenhuma é destinada à distribuição comercial. Outputs ignorados em `apps/*/out` também são substituídos pelos runners: reconstruir com a configuração pretendida antes de usá-los fora desses testes. A verificação cobre layout, inventários, integridade e compilação, não instalação/upgrade A→B. Mensagens genéricas de `signtool` do empacotador não comprovam certificado Authenticode; o piloto permanece sem publicador certificado. O warning de dependências opcionais de outras arquiteturas do canvas no EdiPDF não inclui o Windows x64 que foi empacotado.

Review final: preservação de destinos, capability de entradas/sidecars/cache, lock/piso compartilhados, confiança de publicação, recuperação OTP, fairness e drift OAuth reexaminados contra o diagnóstico. Não houve afrouxamento de licença, habilitação de cobranças ou gravação de segredos. Segredos locais e remotos não foram impressos nem alterados. As mudanças materiais de interface seguem os critérios de controles nativos, ciclo de vida e regressão funcional, não apenas ajustes para satisfazer o linter.

A conferência final de Stripe manteve verificação sobre corpo recebido, idempotência/outbox, lock por titular, prazo pago independente de `active` e freshness somente após sucesso. O runbook passou a explicitar **snapshot + API do endpoint compatível com o pin**, pois eventos thin exigem outro adapter. Essa revisão de contrato não representa homologação contra o provedor; compra, renovação, reembolso e disputa reais em modo teste continuam pendentes.

## Bloqueios e limites remanescentes

R01 permanece bloqueante por decisão explícita. Também continuam sem homologação: instalador A→B/recuperação/perfis, Stripe ponta a ponta, Railway/DNS/e-mail/cron, restauração portátil de chaves e E2E completos dos outros produtos web. O ícone padrão Electron e os demais limites não numerados do relatório original não foram transformados em garantias entregues. A conclusão de funcionalidades faltantes nos editores continua fora do escopo.

Na rodada de remediação não houve commit, merge, push, publicação ou deploy. A integração Git posteriormente solicitada foi concluída no registro abaixo. A liberação comercial ainda depende de corrigir/substituir a dependência remanescente com regressão e fechar as homologações acordadas; não reabrir as nove correções apenas por repetir o diagnóstico histórico. Consultar este registro e o [estado do repositório](../../estado-do-repositorio.md) ao retomar.

## Integração Git autorizada após a remediação

- Commit de implementação: `abef0ab` (`feat/edi-suite`), com os 782 arquivos da entrega; merge explícito em `main`: `22098c8`. Push para `origin/main` concluído, seguido de fetch e confirmação de igualdade dos hashes local/remoto. O histórico Git registra separadamente a atualização documental deste resultado.
- Conferência pré-commit: `pnpm check` passou com os mesmos 463 warnings e 66 infos; `pnpm typecheck` passou nas 21 tarefas e no tooling (17 tarefas em cache); `pnpm test` passou nas 19 tarefas (17 em cache) e nos 21 testes de tooling. `git diff --cached --check` passou após remover apenas espaços finais e linhas vazias excedentes de dois relatórios textuais importados, preservando os dados e os snapshots originais.
- Varreduras direcionadas nos arquivos da entrega e nos snapshots compactados não encontraram padrões conhecidos de credenciais; não constituem auditoria completa de segredos. Caches, outputs, instaladores e arquivos locais de ambiente não entraram no commit.
- Auditoria repetida: `pnpm audit --prod` continua retornando exit 1, com uma ocorrência moderada e zero altas/críticas. O gate de release permanece intacto; não houve exceção, tag, publicação de instalador, habilitação de cobrança ou deploy manual. Push em `main` dispara CI e pode acionar os deploys automáticos já configurados dos produtos existentes; o estado desses serviços não foi homologado por esta operação Git.
