# Full review da implementação Edi e da documentação

Data: 16/10/2026. Branch inspecionada: `feat/edi-suite`; HEAD de referência: `54c8cee`. A implementação continua na árvore de trabalho, ainda sem commit, merge ou push. Este relatório revisa a implementação, não apenas a proposta histórica em `review.md`.

## Resultado

> Diagnóstico histórico. A remediação autorizada posteriormente está em [correcoes.md](correcoes.md), com evidências por achado. Correções parciais não representam aprovação integral.

Estado atualizado em 17/10/2026: R02–R10 foram corrigidos na remediação anterior. A frente `fix/edi-production` resolveu a cadeia remanescente de R01 e verificou `pnpm audit --prod` sem vulnerabilidades conhecidas, além dos gates locais de qualidade, tipos, testes e build. O titular autorizou corrigir e colocar o Edi em produção; isso inclui a integração Git e a publicação necessárias depois das verificações. O [PR #6](https://github.com/informach/informach-apps/pull/6) está aberto, fora de draft, e executa CI e instalação/upgrade Windows. Os complementos autorizados da sessão de design foram integrados com novas verificações. Deploy saudável e distribuição comercial ainda dependem das etapas registradas em [producao-operacao.md](producao-operacao.md). Consultar esse registro e [correcoes.md](correcoes.md) antes de interpretar as reproduções abaixo como bugs ainda presentes.

**Resultado histórico de 16/10: não aprovado para entrega, merge em main ou primeira distribuição comercial.** Naquele checkout havia uma falha de preservação de arquivos reproduzida no EdiAula, alertas de dependências e reprovação do gate de lint. Os testes daquela rodada não anulavam esses achados.

A revisão foi global e orientada por risco: diff compartilhado, importação das cinco ferramentas, quatro packages Edi, portal, Hub, contratos, OAuth, licenciamento, cobrança, migrations, publicação, atualizações, testes e documentação. A inspeção manual aprofundou os fluxos críticos; não representa leitura linha a linha de todo o código legado nem homologação de todas as funcionalidades dos editores. Recursos ainda não implementados nos editores continuam fora do escopo.

Nenhum código de produção foi corrigido nesta rodada diagnóstica. Foram executadas verificações locais e consultas remotas somente de leitura; foram criados probes ignorados em `.cache/edi-review` e este relatório. Não houve acesso a projetos reais, cobrança, publicação, alteração de secrets ou deploy.

## Achados por prioridade

P1: resolver antes de integrar/distribuir. P2: corrigir ou fechar explicitamente antes de considerar a frente robusta e homologada. P3: correção de contrato/manutenibilidade, sem evidência de concessão indevida de licença neste caso.

### R01 — P1 — Dependências resolvidas ainda têm alertas de segurança

**Evidência:** `pnpm audit --prod --json` retornou 151 advisories: 7 críticos, 51 altos, 79 moderados e 14 baixos. O conjunto resolvido inclui `next@16.2.6`, `vitest@2.1.9` e dependências transitivas dos aplicativos. A auditoria inclui o que o grafo classifica como produção, inclusive ferramentas que chegam transitivamente; não significa que todos os 151 alertas sejam exploráveis em cada app.

Há, entretanto, um caso compatível com o portal: Next 16.2.6, App Router e Server Actions se enquadram no aviso de negação de serviço GHSA-m99w-x7hq-7vfj. O mantenedor indica correção em 16.2.11 para esse aviso específico; isso **não** significa que essa versão resolva os demais advisories mais recentes. [Aviso oficial do Next.js](https://github.com/vercel/next.js/security/advisories/GHSA-m99w-x7hq-7vfj).

Parte da dívida já existia no HEAD anterior: `next@16.2.6`, `hono@4.12.18` e `vitest@2.1.9` também estão no lockfile daquele commit. Não atribuir todos os alertas à importação. Ainda assim, acrescentar um portal e distribuir ferramentas com esse grafo não satisfaz a uniformização segura pedida.

**Referências:** [overrides e tooling](../../../package.json), [lockfile](../../../pnpm-lock.yaml), [Server Actions Edi](../../../apps/edi/src/features/account/actions.ts).

**Correção e aceite:** fazer triagem por caminho e exposição real, atualizar versões compatíveis e overrides na origem, verificar consumidores web/desktop, reinstalar pelo lockfile e repetir auditoria/testes/builds. Não usar `audit --fix --force`, ocultar alertas ou declarar RCE em produção apenas porque o pacote aparece na auditoria.

### R02 — P1 — Exportação do EdiAula contorna autorização de destino e apaga arquivo anterior em falha

**Reprodução confirmada:** com Electron real, perfil descartável, licença Ed25519 efêmera e um arquivo sentinela recém-criado, a chamada pública do preload `api.startExport` aceitou um destino que nunca passou pelo diálogo de salvamento. A exportação para esse destino falhou e o arquivo sentinela preexistente foi apagado.

O handler `export:start` recebe `Project`/`ExportSpec` como tipos TypeScript, sem validar integralmente o contrato em runtime. O filtro comum de arquivos não cobre esse canal. Além disso, `outputStarted` é marcado antes de executar FFmpeg; o catch apaga `spec.outPath` se ele existir, sem distinguir um arquivo anterior de um artefato criado pela operação. Portanto, uma exportação legítima que falhe ou seja cancelada também pode destruir uma saída anterior selecionada para substituição.

**Referências:** [handler de exportação](../../../apps/ediaula/src/main/index.ts#L519), [exclusão na falha](../../../apps/ediaula/src/main/index.ts#L586), [capabilities por canal](../../../packages/edi-desktop/src/main.ts#L202), [API do preload](../../../apps/ediaula/src/preload/index.ts#L84).

**Correção e aceite:** validar projeto/spec, autorizar todas as entradas e saídas reais, renderizar em temporário próprio ao lado do destino e substituir somente após sucesso. A limpeza deve alcançar apenas artefatos comprovadamente criados pela operação. Cobrir falha antes/depois da criação, cancelamento, arquivo anterior existente, sidecars e destino não autorizado. Corrigir a fronteira e o ciclo de vida da escrita, não apenas remover o `unlink`.

O probe está em `.cache/edi-review/export-probe.mts`; ele usou apenas um sentinela e perfis próprios, removidos após encerramento normal. Uma tentativa inicial do harness foi interrompida; seu perfil foi identificado e removido separadamente. Nenhum processo foi morto à força e nenhum arquivo de usuário foi removido.

### R03 — P1 — O gate comum de qualidade e o release continuam bloqueados

**Evidência:** `pnpm check --reporter=summary` verificou 2.052 arquivos e falhou com 223 erros, 373 warnings e 74 infos. Os erros estão nas ferramentas importadas: principalmente dependências de hooks, interação/acessibilidade e keys de listas. Há também cinco detecções de `useProgram` do WebGL que precisam ser distinguidas de hooks React reais.

O workflow de release executa `pnpm check` antes da matriz de instaladores. Assim, o fluxo automático não chegará à publicação no estado atual, independentemente de token, domínio ou compilação bem-sucedida.

**Referências:** [gate de release](../../../.github/workflows/edi-release.yml#L58), [configuração Biome](../../../biome.json).

**Correção e aceite:** normalização sem supressões e revisão funcional dos efeitos/eventos afetados. Classificar falsos positivos pela API efetivamente usada, preservando o gate. Reexecutar lint integral, tipos, testes e regressão de interface depois das correções.

### R04 — P2 — A rotação de chave documentada bloqueia a publicação seguinte

**Evidência:** o publicador recebe o mapa `EDI_UPDATE_PUBLIC_KEYS`, mas consulta a release atual confiando somente na chave privada selecionada para a nova assinatura: `{ [keyId]: expectedPublic }`. Quando a release atual está assinada pela chave antiga e o novo signer é a chave nova, a consulta rejeita a release anterior, mesmo com ambas as chaves aprovadas no mapa de confiança.

Um probe com criptografia real confirmou: o manifesto assinado pela chave anterior falha com apenas a nova chave e passa com o conjunto antiga+nova. A sequência de transição descrita no runbook chega justamente a esse estado.

**Referências:** [consulta no publicador](../../../scripts/edi/release.mts#L192), [procedimento de rotação](distribuicao-piloto.md#chaves-e-recuperação).

**Correção e aceite:** validar a release existente pelo conjunto de confiança aprovado, sem reduzir esse conjunto ao signer atual. Manter a verificação da correspondência privada/pública da nova assinatura. Testar publicação durante a transição antiga → ambas → nova e rejeição de chave não confiável, sem alterar releases imutáveis.

### R05 — P2 — Instalação de ferramentas pelo Hub não aplica o piso de versão já aceito

**Evidência estática:** o updater próprio do app registra e verifica `updateFloors` no vault. O installation manager do Hub busca o mesmo catálogo, mas compara apenas com a versão da ferramenta instalada. Em ferramenta ausente, ou instalada em versão inferior, um catálogo antigo ainda validamente assinado pode ser aceito apesar de o computador já ter observado uma versão superior da suíte.

Não foi simulada uma alteração real de catálogo no GitHub. O achado é a ausência da comparação no caminho de instalação, em contraste com o outro consumidor e com a promessa do manual. Assinatura válida prova autoria, não atualidade.

**Referências:** [piso no updater](../../../packages/edi-desktop/src/main.ts#L485), [instalação pelo Hub](../../../packages/edi-desktop/src/installations.ts#L80), [vault](../../../packages/edi-desktop/src/vault.ts#L30).

**Correção e aceite:** usar a mesma política de aceitação e o mesmo piso protegido por canal nos dois consumidores. Testar ferramenta ausente, reinstalação, versão local antiga e replay de manifesto antigo após catálogo superior, preservando a separação stable/beta.

### R06 — P2 — Cadastro sem confirmação perde o caminho de verificação ao recarregar

**Evidência estática:** `AuthForm` começa sempre em `login`; a única entrada no modo `verify` ocorre após sucesso de um novo signup. Não há ação de retomar confirmação ou reenviar OTP. Uma conta que ficou não verificada após recarregar a página ou após expirar o código não consegue concluir esse fluxo pela UI. O wrapper exige e-mail verificado, e o hook compartilhado recusa signup duplicado; tentar cadastrar novamente não resolve.

A implementação instalada do Better Auth só envia confirmação no login quando `sendOnSignIn` está habilitado; o wrapper atual não habilita essa opção. Mesmo que um envio fosse acrescentado, ainda seria necessário permitir digitar o código na interface.

**Referências:** [estado e transições do formulário](../../../apps/edi/src/features/auth/auth-form.tsx#L7), [configuração compartilhada de verificação](../../../packages/auth/src/index.ts#L687).

**Correção e aceite:** oferecer retomada e reenvio com limites, mensagens consistentes e tratamento explícito de conta não verificada. Testar reload, OTP expirado, reenvio, código inválido e confirmação, sem enfraquecer a verificação de e-mail.

### R07 — P2 — Falhas permanentes podem monopolizar a reconciliação periódica

**Evidência estática:** `reconcileCustomers()` seleciona sempre os 25 customers de menor `updatedAt`. Esse timestamp só avança quando `saveCustomerSnapshots` tem sucesso. O backoff da falha atua nos jobs da outbox, não nos candidatos periódicos. Se os 25 mais antigos falharem persistentemente, customers posteriores sem webhook pendente deixam de ser visitados pela varredura periódica.

Depois de 24 horas sem reconciliação, `accountAccess(..., requireFresh: true)` recusa renovar licenças dessas contas. Uma licença previamente emitida ainda obedece ao seu próprio vencimento; não se trata de bloqueio instantâneo de todos os clientes.

**Referências:** [seleção e retentativas](../../../apps/edi/src/features/billing/repository.ts#L87), [loop](../../../apps/edi/src/features/billing/reconciliation.ts), [exigência de freshness](../../../packages/edi-licensing/src/service.ts#L86).

**Correção e aceite:** separar última tentativa de última reconciliação bem-sucedida, com paginação/fairness e backoff também para candidatos periódicos. Testar mais de 25 contas e falhas permanentes no primeiro lote, sem marcar dados financeiros não conferidos como atuais.

### R08 — P2 — Pre-deploy OAuth aceita drift de parte da política

**Evidência estática:** o provisionamento usa `onConflictDoNothing` para client e resource existentes. Confere secret, método de autenticação, tipo native e disabled do client, mas não verifica integralmente grants, scopes, consentimento, PKCE, TTLs e estado/política do resource. Uma execução idempotente pode terminar com sucesso deixando configurações divergentes que quebram o login, a renovação ou as garantias documentadas.

**Referência:** [provisionamento OAuth](../../../packages/auth/src/desktop-oauth.ts#L153).

**Correção e aceite:** conferir o contrato completo após conflito e falhar com diagnóstico seguro quando houver incompatibilidade; mudanças de política devem ser explícitas. Testar campos alterados individualmente e o resource desabilitado, não apenas repetir o setup sobre dados corretos.

### R09 — P2 — Documentação e seletor de runtime ainda divergem do estado implementado

**Evidência:** o guia local de auth ainda fixa Better Auth/passkey em 1.6.9 e orienta consultar essa versão, enquanto o manifest está em 1.7.10 com OAuth novo. O guia de billing apresenta `hasProSubscription` como regra universal, sem registrar claramente a exceção de fatos pagos/licenças Edi nem o novo subpath `payment-facts`. O guia central está mais atual, mas os guias específicos também precisam acompanhar a mudança.

Além disso, `.nvmrc` continua em 22.13.0; raiz e CI exigem/usam 24.15.0. A divergência está documentada, mas permanece no mecanismo que seleciona o runtime local.

**Referências:** [guia auth](../../../packages/auth/CLAUDE.md#L448), [manifest auth](../../../packages/auth/package.json), [guia billing](../../../packages/billing/CLAUDE.md#L634), [.nvmrc](../../../.nvmrc), [guia central](../../../AGENTS.md).

**Correção e aceite:** atualizar os contratos locais e alinhar o seletor de runtime após a decisão técnica já refletida no manifest/CI. Conferir que um novo checkout encontra as mesmas instruções, versões e comandos, sem depender de memória ou interpretação de resumos conflitantes.

### R10 — P3 — UTF-8 inválido na requisição é classificado como indisponibilidade

**Reprodução confirmada:** `readRequestBody` lança `TypeError` ao decodificar bytes UTF-8 inválidos. O handler desktop mapeia Zod/SyntaxError para 400, mas esse TypeError cai no catch genérico de 503. Limite excedido cujo `reader.cancel()` falhe também pode perder a classificação específica de payload.

**Referências:** [decodificação](../../../apps/edi/src/lib/request-body.ts#L30), [mapeamento HTTP](../../../apps/edi/src/features/desktop/handler.ts).

**Correção e aceite:** erro de entrada explícito, separado de falhas de transporte/servidor; preservar a causa e liberar o reader mesmo em falhas de limpeza. Cobrir UTF-8 inválido, JSON inválido, chunked excessivo e cancelamento. Este teste não demonstrou liberação de acesso indevido; a falha é a classificação de protocolo.

## Verificações executadas nesta rodada

| Verificação | Resultado | Limite da evidência |
| --- | --- | --- |
| `pnpm typecheck` e repetição Turbo com `--force` | 21 tarefas passaram; tooling passou | A repetição foi sem cache |
| `pnpm test` e repetição Turbo com `--force` | 19 tarefas passaram; 20 testes de tooling passaram | Testes de domínio não substituem aceite de todos os editores |
| `pnpm check --reporter=summary` | Reprovado: 223 erros, 373 warnings, 74 infos | Sem fixes ou desligamento de regras |
| `pnpm audit --prod --json` | 151 advisories | Triagem de exposição necessária; dívida anterior e integração se misturam |
| `pnpm edi:test:integration --portal` | Histórico de migrations, 13 testes PostgreSQL e smoke HTTP passaram | Banco descartável; sem Stripe/e-mail real |
| `pnpm edi:test:native` | Seis apps passaram | Gate, licença real efêmera, offline, expiração, IPC e controles testados; não é upgrade de instaladores |
| `pnpm edi:compare-sources` | Nenhum conflito ou atualização de código na origem; três `.pen` novos somente nas origens | `ediaula.pen`, `edicaptura.pen`, `edisvg.pen` precisam de decisão de preservação/importação; não foram sobrescritos |
| Scanner direcionado de credenciais | Sem padrões conhecidos nas ferramentas/snapshots | Não equivale a auditoria completa de segredos |
| Probes adicionais | Exportação destrutiva, transição de confiança e erro UTF-8 confirmados | Scripts em cache ignorado, sem chaves persistentes ou dados reais |
| GitHub, somente metadados | Secrets/variables esperados presentes; releases imutáveis habilitadas; nenhuma release publicada | A presença do PAT não comprova sua permissão efetiva |
| Documentação e `git diff --check` | Passaram após o relatório; oito documentos e 92 links locais verificados | Não representa aprovação funcional |

O smoke HTTP usou o standalone previamente gerado, executou duas vezes o pre-deploy OAuth empacotado e verificou prontidão, página inicial, 12 assets, sessão anônima, proteção da conta, device code e cobrança desabilitada. O teste nativo recompilou as ferramentas para as suas configurações efêmeras; o probe de exportação recompilou EdiAula novamente. Esses outputs de teste são ignorados e **não** são artefatos comerciais para publicação.

## Cobertura e homologações ainda ausentes

- **Instalação e upgrade:** os seis NSIS tinham sido compilados na etapa anterior; não foram recompilados nem instalados nesta rodada. O workflow contém smoke de instalação inicial e gate anônimo, mas não instala A para depois atualizar a B. Faltam upgrade real, passagem updater → NSIS, app aberto, recuperação, interrupção/retry e preservação de projetos/perfis. Isso é lacuna de cobertura, não um teste executado com resultado negativo.
- **Cobrança ponta a ponta:** testes PostgreSQL usam snapshots/reader controlados. Não validam o leitor novo contra todos os payloads reais Stripe, nem compra, mudança de plano, renovação, inadimplência, reembolso/disputa, replay e eventos fora de ordem no ambiente de testes do provedor. A [documentação oficial Stripe](https://docs.stripe.com/billing/subscriptions/webhooks) confirma a necessidade de cobrir ciclo assíncrono e eventos de risco. Cobrança real deve permanecer desabilitada.
- **Railway e operação:** nenhum serviço Edi, DNS, secret de backend, cron ou deploy foi alterado nesta revisão. Nenhuma ferramenta Railway autenticada apareceu disponível na sessão. O destino continua `edi.informach.com.br`, seguindo os apps existentes. E-mail efetivamente entregue, webhook de entrega, alertas e cron precisam de homologação.
- **Chaves e credenciais:** backup portátil cifrado e restauração ainda não foram testados. O PAT correto está no ambiente privado, mas permanece uma cópia desnecessária no repositório público; seu conteúdo não foi lido e ela não foi removida durante este review. A presença como secret não significa exposição pública do valor.
- **Persistência dos editores:** o EdiAula ainda mantém helper próprio de save com temporário fixo, sem flush e sem limpeza completa em falha, além de leitura de projeto por cast/validação parcial. A existência do helper seguro no SDK não comprova que todos os fluxos legados já o usam. Faltam fixtures representativas e testes de round-trip/erro/recuperação nos cinco produtos.
- **Política para trabalhos em andamento:** os comandos novos são bloqueados quando a licença expira, mas não está implementado um limite uniforme para todos os jobs já iniciados. O contrato tem `update_required`, porém a requisição de licença não informa a versão do cliente nem implementa política mínima de versão. São requisitos da proposta que precisam de implementação ou ajuste explícito de escopo, não garantias já entregues.
- **Artefatos e apresentação:** ainda há ícones padrão Electron e falta revisão do conteúdo final distribuído, dependências nativas/notices e experiência em Windows real. Não foi refeito um full build web de todos os apps ou seus E2E de navegador nesta rodada; tipos/testes compartilhados passaram, mas a alteração de Better Auth/React exige essa regressão antes do merge.

## Base que foi confirmada

A separação entre fonte privada e distribuição pública está coerente; as chaves de licença/atualização são distintas; os contratos assinados vinculam conta, dispositivo e período; provas de posse e nonces são usados; migrations novas são aditivas e passaram no histórico completo descartável; as travas de reconciliação/webhook e o limite de dispositivos têm testes PostgreSQL reais. Os testes nativos confirmam bloqueio na abertura direta e na expiração, sem encerrar trabalhos à força.

Esses resultados devem ser preservados nas correções. Não é necessário contratar Authenticode ou CDN para resolver os bugs apontados; as limitações de confiança da primeira instalação sem certificado continuam sendo as do piloto aprovado.

## Ordem recomendada para fechar a frente

1. Corrigir R02 com regressão da reprodução, revisar os outros canais de arquivo e fechar preservação de dados.
2. Tratar R01 e R03, repetindo gates dos consumidores afetados, sem esconder avisos ou usar fixes destrutivos.
3. Fechar R04–R10 e adicionar cobertura específica para os cenários identificados.
4. Homologar instalação/upgrade, projetos representativos, Stripe e operação Railway/e-mail/cron, mantendo os serviços existentes intactos.
5. Atualizar evidências, executar nova revisão e só então realizar commit, merge e push conforme a autorização original. Este relatório não libera essa etapa.
