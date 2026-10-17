# Implementação da suíte Edi

Branch atual: `fix/edi-production`, derivada de `main` após a integração de `feat/edi-suite`. A implementação preserva as interfaces e exclui a conclusão de funcionalidades ainda ausentes dos editores.

Atualização da remediação: [correcoes.md](correcoes.md) registra R02–R10 corrigidos, gates locais repetidos e R01 ainda bloqueante para release e operação comercial por decisão expressa do usuário. Na rodada de remediação não houve commit/merge/push, publicação ou deploy. Em pedido posterior, o usuário autorizou explicitamente commit de tudo, merge e push para `main`, sem liberar publicação ou cobrança. A dependência indireta restante precisa de correção/substituição validada; não aceitar exceção temporária.

## Entrada em produção — trabalho autorizado em 17/10/2026

Após a consulta abaixo, o titular solicitou corrigir os bloqueios, colocar o Edi Hub em produção e provisionar o Stripe completo em teste/produção, com imagem, preços, Portal e webhook. Essa autorização inclui integração Git e publicação necessárias após os gates; não autoriza cobrar clientes de teste em produção nem omitir falhas. A alteração local pessoal em `.claude/settings.local.json` continua fora da entrega.

- Compatibilidade Zod dos resolvers web corrigida sem trocar schemas; cadeias transitivas vulneráveis substituídas por dependências mantidas. `pnpm audit --prod` retornou exit 0, sem vulnerabilidades conhecidas, nesta frente. O bloqueio R01 não usa exceção de segurança; a regressão transversal ainda está sendo concluída.
- Versão mínima assinada e validada no servidor/desktop, bloqueio uniforme de novos jobs e preservação de gravações/projetos implementados. Evidências em [preservação de trabalhos](producao-jobs.md).
- Stripe real de teste homologado com banco descartável e entrega HTTP pelo CLI; catálogo de produção provisionado com cobrança desabilitada. Oferta atual aprovada em 17/10: R$ 49,90/mês ou R$ 499/ano. Recursos e verificações em [produção Stripe](producao-stripe.md).
- Portal, cron, domínio, chaves e Sentry provisionados. Configuração Railway usa IaC parcial limitada ao Edi. Migrations e deploy saudável ainda pendentes; detalhes em [operação](producao-operacao.md).
- Backup portátil cifrado recuperado e corrupção rejeitada. Ícones, inventário de dependências, compilação própria de mídia e workflow de upgrade Windows em homologação; ver [Windows](producao-windows.md) e [distribuição](distribuicao-piloto.md).
- Ainda não houve publicação desktop, cobrança real nem declaração de homologação final. Próximos gates: regressão e build geral, integração CI/upgrade, migrator/portal, entrega de e-mail, imagem Stripe pública, cron monitorado e release assinado.

## Lotes e revisões anteriores à entrada em produção

| Lote | Escopo | Estado | Revisão |
| --- | --- | --- | --- |
| 1 | Snapshots, importação, catálogo e baseline das ferramentas | Importação e correção dos erros de lint concluídas; dependência residual bloqueante | Lint passou; regressão documentada em correcoes.md |
| 2 | Contratos, licença e persistência comercial | Implementado; homologação comercial pendente | Migrations e 13 testes de integração reais passaram, incluindo OAuth, dispositivos, emissão e concorrência de cobrança |
| 3 | Portal Edi, conta, cobrança e autenticação desktop | Implementado localmente; deploy Railway e Stripe real pendentes | Build standalone e smoke HTTP passaram; domínio de destino definido; fluxos comerciais ainda exigem homologação |
| 4 | SDK desktop, segurança, licença nas ferramentas e Edi Hub | Integrado aos seis apps; verificação nativa aprovada no escopo testado | 32 testes SDK e seis apps nativos passaram; rollback, capabilities, piso e foco testados; recuperação completa ainda pendente |
| 5 | Instaladores, assinatura própria, release e atualização automáticos | Piloto recompilado; publicação bloqueada | Seis NSIS recompilados/verificados com chaves efêmeras; 21 testes de tooling passaram; auditoria agora bloqueia release; instalação e upgrade ponta a ponta pendentes |
| 6 | Verificação transversal e revisão completa | Remediação revisada; R01 e homologações mantêm entrega bloqueada | Tipos/testes/builds/lint passaram; nove achados corrigidos, evidências no registro de correções |
| 7 | Commit, merge e push para main | Concluído por pedido explícito posterior | Implementação `abef0ab`, merge `22098c8` e push em `origin/main` confirmados; bloqueio de release mantido |

## Consulta de prontidão em 17/10/2026

Diagnóstico solicitado para identificar o que falta para operar o Edi Hub em produção. Checkout em `main`, HEAD `f3bfbd3`; alteração local preexistente em `.claude/settings.local.json` preservada. A consulta aos provedores foi somente de leitura; não houve correção de código, instalação, aprovação de deployment, deploy, publicação ou cobrança.

| Verificação atual | Evidência | Implicação |
| --- | --- | --- |
| CI principal | [Run 38991582306](https://github.com/informach/informach-apps/actions/runs/38991582306): instalação congelada e lint passaram; `pnpm typecheck` falhou com oito TS2345 no Cozya, em formulários de login, cadastro e receita, por schemas Zod 3 incompatíveis com o tipo esperado pelo resolver | Corrigir a resolução/compatibilidade e repetir os gates; testes, integrações web, E2E e build posteriores foram pulados nesse run. O resultado remoto não confirma os gates locais históricos |
| Integração Edi | [Banco](https://github.com/informach/informach-apps/actions/runs/38991582327) e [verificação nativa](https://github.com/informach/informach-apps/actions/runs/38991582310) concluídos com sucesso no mesmo HEAD | Evidência remota dos escopos desses workflows; não comprova Stripe, instalação ou upgrade A→B |
| Auditoria | `pnpm audit --prod` executado nesta consulta retornou exit 1, com uma vulnerabilidade moderada em `sprintf-js`; o lockfile também mantém essa dependência | R01 e o gate de release continuam abertos; o [advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) ainda informa ausência de versão corrigida |
| Railway | Autenticação e listagem do projeto `informach-apps` confirmadas; nenhum serviço Edi na lista. Deployment `443c5b9a-bd22-44a9-ac46-2e0ca0c1568d` do migrator, commit `22098c8`, está em `NEEDS_APPROVAL`; o deployment documental posterior foi `SKIPPED` | A falta de conexão registrada na sessão anterior deixou de ser o impedimento nesta sessão. Serviço e backend Edi ainda precisam de implantação; não se confirmou a aplicação das migrations em produção |
| DNS e HTTP | `Resolve-DnsName edi.informach.com.br -Type A` retornou nome inexistente; `curl.exe -I --max-time 15 https://edi.informach.com.br/api/ready` retornou exit 6, sem resolver o host | Portal e readiness não estão acessíveis nesse domínio |
| Distribuição | `gh release list --repo informach/edi-releases --limit 10 --json tagName,isDraft,isPrerelease,publishedAt` retornou `[]`; nomes dos secrets/variables esperados do ambiente privado confirmados | Ainda não há release para download. Presença de secret não comprova permissão de publicação; a cópia desnecessária de `EDI_DISTRIBUTION_TOKEN` ainda existe nos secrets do repositório público, sem leitura do valor |

Ordem de fechamento: corrigir CI/R01 e validar consumidores; preparar ambiente isolado para homologar Stripe, login, licença e entrega de e-mail; conferir migrations e implantar o portal no Railway com DNS/HTTPS, chaves e reconciliação monitorada; homologar instalação/upgrade e preservação de projetos/perfis; testar restauração portátil das chaves e o canal de distribuição; realizar o aceite final antes da publicação e da habilitação comercial.

Continuam pendentes os cenários de upgrade A→B, interrupção/retomada, app aberto e recuperação com projetos representativos. A política mínima de versão do cliente e o tratamento uniforme de jobs já iniciados na expiração da licença permanecem lacunas do review, a implementar ou delimitar explicitamente no escopo aprovado. Ícones/apresentação e conteúdo final dos instaladores também exigem revisão. Não reutilizar os artefatos de teste com chaves efêmeras/portal `.invalid` como distribuição comercial.

Esta consulta não repetiu builds, testes funcionais ou homologação comercial e não inspecionou a conta Stripe, o estado interno do banco de produção ou a saúde de todos os serviços existentes. Os resultados históricos de remediação permanecem em [correcoes.md](correcoes.md); esta seção atualiza apenas as evidências acima.

## Configuração comercial

O titular **aprovou R$ 49,90/mês ou R$ 499/ano em 17/10/2026**, substituindo os valores iniciais de R$ 29,90/R$ 299 após reavaliar o posicionamento da suíte. Consumo pago de IA permanece separado e a comercialização por **pessoa jurídica (CNPJ)**. A aprovação dos valores não dispensa homologação. O catálogo central registra a oferta vigente; os IDs Stripe de teste e produção são configurados no ambiente do Edi e registrados na [homologação Stripe](producao-stripe.md).

O piloto aprovado usa GitHub e assinaturas próprias Ed25519, sem contratar Authenticode ou storage/CDN. A assinatura Stripe permanece; a mudança afeta somente a distribuição dos programas. O Windows não reconhecerá um publicador certificado e poderá avisar ou bloquear a instalação. A [decisão e o manual do piloto](distribuicao-piloto.md) são a referência vigente.

## Evidências anteriores à remediação e pendências operacionais

Os três primeiros itens abaixo preservam o diagnóstico anterior, não o comportamento atual corrigido. Resultados posteriores e a decisão de bloqueio R01 estão em [correcoes.md](correcoes.md).

- Full review global diagnóstico executado em 16/10/2026, **não aprovado para entrega**. O [relatório completo](full-review.md) registra achados por prioridade, limites da inspeção e critérios de fechamento. Código de produção não foi corrigido naquela rodada diagnóstica; a remediação autorizada posterior é um registro separado.
- Nesta revisão, 21 tarefas de tipos e 19 de testes passaram novamente **sem cache**, além dos gates de tooling; 13 testes PostgreSQL e o smoke standalone passaram; o ciclo nativo dos seis apps foi repetido e passou. Lint segue reprovado. A auditoria atual encontrou 151 advisories no grafo de produção, incluindo dívida anterior; exposição e atualizações exigem triagem.
- Um probe Electron isolado reproduziu a aceitação de destino não selecionado em `export:start` do EdiAula e a exclusão de um arquivo sentinela preexistente após falha. Nenhum projeto real foi acessado; os perfis descartáveis foram removidos. Esse achado bloqueia a entrega. Também foram identificadas lacunas de rotação de chave, antirollback no caminho do Hub, retomada de OTP, fairness da reconciliação, validação de drift OAuth e coerência dos guias.
- Repositório público `informach/edi-releases` criado, Actions nele desabilitadas e releases imutáveis habilitadas. Código permanece em `informach/informach-apps`, privado.
- Ambiente `edi-release` criado no repositório privado, restrito a `main` e tags `edi-v*`. Chave própria de atualização salva como secret; chaves públicas e cliente desktop configurados como variables. Chave de licença separada, ainda não implantada no backend.
- Backup das duas chaves protegido por DPAPI no perfil Windows atual. Não é um backup portátil nem substitui um procedimento de restauração testado.
- `EDI_DISTRIBUTION_TOKEN` confirmado no ambiente correto do repositório privado em 16/10/2026, às 21:21 UTC, consultando somente metadados. Sua permissão efetiva de publicação ainda depende de validação pelo workflow; o valor não foi lido. A cópia inicialmente salva no repositório público não foi removida.
- Destino do portal definido pelo titular: Railway, seguindo os apps existentes, em `https://edi.informach.com.br`. `EDI_PORTAL_URL` configurada no GitHub. A integração Railway ainda não está instalada/conectada nesta sessão; serviço, DNS, secrets e deploy não foram efetuados. O [runbook do portal](../../../apps/edi/PRODUCAO.md) registra a configuração e a ordem de implantação.
- O pipeline carrega variables do ambiente nos steps, valida configuração pública e presença dos secrets antes da matriz Windows, e expõe chaves privadas somente aos steps de assinatura/publicação.
- Os seis layouts Electron e os seis instaladores NSIS foram compilados e tiveram inventários e integridade verificados com chaves efêmeras em `pnpm edi:test:package --installer`, versão local de teste `0.0.0-beta.28180`. Nenhum instalador foi instalado ou publicado nesta validação. Os builds ainda usam o ícone padrão Electron; identidade visual dos instaladores permanece no review.
- Os seis apps passaram pelo runner nativo `pnpm edi:test:native`: acesso inicial restrito, entrada com licença assinada efêmera, fallback offline em HTTP 503, expiração real e bloqueio IPC. Nas ferramentas, navegação por teclado e acionamento de Verificar acesso no bloqueio também passaram. O gate fecha somente após a criação da janela do editor.
- O EdiSVG confirmou cancelamento de fechamento preservando seu rascunho local e, depois, descarte explícito apenas do rascunho isolado de teste para encerramento normal. Nenhum processo foi morto à força e nenhum projeto real foi alterado. O runner removeu seus próprios perfis temporários; capturas ficam em `.cache/edi-native-results`.
- Corrigidas duas regressões encontradas nessa revisão: `fs:exists` mantém o retorno em lista exigido pelo EdiAula, sem revelar arquivos não selecionados; a verificação final aceita somente o instalador atualmente aprovado, não qualquer versão anteriormente aceita no processo. Os 22 testes SDK passaram após os ajustes.
- Respostas HTTP da licença e do catálogo têm limites reais de bytes e validação UTF-8/JSON. HTML em 503 preserva somente a licença offline ainda válida; 401 ou payload de sucesso inválido não herdam esse acesso. Escritas atômicas limpam temporários em falha e preservam o conteúdo anterior. Passaram 26 testes SDK, 13 de contratos e cinco de catálogo público.
- Concorrência de cobrança corrigida: reconciliação adquire a mesma trava por titular usada pelos webhooks antes de ler o provedor. Quatro testes reais cobrem suspensão concorrente, ordem de leitura, limite do pool de locks e rollback de snapshot de outro cliente. O teste também revelou uma interpolação SQL de Date sem encoder; a consulta agora usa a comparação tipada do Drizzle.
- Portal preparado para Railway com Railpack, porta dinâmica, assets standalone e pre-deploy OAuth empacotado. O smoke HTTP com PostgreSQL real passou em readiness, página inicial, 12 assets, sessão, proteção da conta, device flow e cobrança desabilitada. O comando de pre-deploy foi executado duas vezes, idempotente e com encerramento do pool próprio. Passaram 11 testes unitários do portal.
- Typecheck estrito do tooling passou; 20 testes cobrem configuração, identidades separadas, retomada de draft, integridade remota, publicação completa e readiness do portal. O release bloqueia um portal indisponível ou mal configurado. CI de integração PostgreSQL e verificação nativa agora têm workflows próprios, ainda não executados remotamente.
- Verificação transversal repetida após os ajustes: `pnpm typecheck` passou nas 21 tarefas e no tooling; `pnpm test` passou nas 19 tarefas e nos 20 testes de tooling. A varredura direcionada das ferramentas importadas e dos snapshots não detectou padrões conhecidos de credenciais; não equivale a uma auditoria completa de segredos. O lint integral segue pendente, separado desses resultados.
- A normalização corrigiu tipos explícitos de botões preservando submits de formulários, expressões com efeitos, mocks de Promise, nomes que sombreavam globais, fallthrough e uma asserção opcional insegura. `pnpm check --reporter=summary` ainda falha com 223 erros e 373 warnings, principalmente hooks e acessibilidade. Não houve desligamento permanente de regras nem remoção desses gates do CI.
- A dívida de lint dos editores, recuperação de projetos representativos, upgrade entre versões e revisão dos handlers/documentos continuam no review. O ciclo nativo básico de licença foi repetido nos seis apps após os ajustes e passou, mas não há declaração de full review aprovado.
- Não houve commit, merge, push, deploy de backend, cobrança real ou publicação de instalador. Esses passos não serão confundidos com preparação de código/configuração.

## Registros históricos dos lotes

As seções seguintes preservam os resultados de cada etapa anterior. Frases como “ainda falta implementar” descrevem aquele momento; a tabela e as evidências acima representam o estado corrente.

## Estado inicial

- `main` e `origin/main` estavam sincronizados no início da implementação.
- As alterações de documentação da proposta anterior foram preservadas na branch de trabalho.
- Node disponível: 24.15.0; pnpm 9.15.0 instalado no perfil do usuário. Não havia instalação de dependências na raiz no início.
- Não foi encontrada configuração local `.env` na raiz; somente `.env.example`.

Resultados de testes, achados corrigidos e limitações de cada lote serão registrados antes de avançar ao próximo.

## Revisão do lote 1 — importação e baseline

- Importados e conferidos por SHA-256: EdiAula (225 arquivos), EdiCaptura (44), EdiFoto (100), EdiPDF (59) e EdiSVG (64). Originais intactos; manifest e snapshots compactados em `docs/migrations/edi/origins`.
- Excluídos dependências, builds, perfis temporários, links e arquivos de ambiente. O importador recusa sobrescrever destinos existentes e detecta mudanças concorrentes na origem.
- Catálogo tipado e nomes de workspace uniformes; Electron 44.8.0 nas cinco ferramentas. Perfis de usuário mantêm os nomes anteriores, independentemente do novo nome npm.
- Dependências Vite/esbuild corrigidas por escopo para não forçar versões incompatíveis nas ferramentas recentes. React/React DOM alinhados em 19.3.1.
- Baseline web: estilo existente passou; 19 tarefas de typecheck/test passaram. Um timeout observado ao executar muitas suítes simultâneas não reproduziu isoladamente. A concorrência Turbo foi limitada a 2; não houve aumento de timeout ou exclusão de teste.
- Builds das quatro ferramentas com build pré-existente, typechecks das três TS e testes das cinco ferramentas passaram. EdiCaptura e EdiSVG ainda precisam de gates uniformes de build/typecheck; isso não foi tratado como aprovação de release.
- Dois testes VM do EdiCaptura precisaram completar o contrato mock de Electron (`getPath`/`setPath`) após preservar explicitamente o perfil. Nenhum comportamento de produção foi adicionado exclusivamente para testes.
- A revisão estática identificou 729 erros e 383 warnings herdados inicialmente, principalmente acessibilidade, hooks e expressões com efeitos. O lote de normalização precisa corrigi-los, sem desligar regras. O script de auditoria usa SARIF porque o reporter JSON do Biome 2.4.13 produz caminhos Windows sem escape válido.
- Não foram executados instaladores, smoke visual ou testes comerciais E2E nesta etapa. Nenhuma cobrança, deploy ou publicação foi efetuada.

## Revisão parcial do lote 2 — contratos e persistência

- Criados contratos estritos de licença, ativação e manifest de release. Licenças Ed25519 vinculam emissor, ambiente, conta, dispositivo, chave, ativação, revisão e ferramentas; prazo máximo de 72 h sem ultrapassar o período pago.
- Política comercial testada: status `active` isoladamente não concede acesso; inadimplência, disputa e reembolso integral bloqueiam; cancelamento mantém somente o período já pago; períodos futuros não atravessam lacunas não pagas.
- Criado schema Edi (dispositivos, ativações, sessões, projeção de entitlement, releases, artefatos, canais e outbox) e fatos de períodos pagos no schema billing. Ainda falta ligar essas tabelas aos handlers Stripe e ao portal; schema preparado não equivale a funcionalidade entregue.
- A migration foi gerada por Drizzle, revisada e aplicada com todo o histórico em PostgreSQL 18.4 descartável. Uma conversão incorreta entre tipos foi detectada no primeiro teste; somente as migrations novas, não publicadas, foram removidas pelo `drizzle-kit drop` e regeneradas como uma migration aditiva correta. Histórico anterior intacto.
- Três testes de integração reais passaram: limite de dois dispositivos sob concorrência, retries idempotentes/proibição de troca de conta ou chave, revogação de sessões com outbox transacional e reativação com nova identidade.
- O runner Windows cria cluster UTF-8, credenciais aleatórias e porta loopback; usa `pg_ctl` para start/stop com confirmação de prontidão e shutdown limpo. Não usa banco existente, Docker, credenciais de produção ou sleeps de sincronização.
- Uma execução intermediária foi interrompida ao corrigir herança de pipes de processos Windows. Seu diretório descartável `C:\Users\julio\AppData\Local\Temp\edi-integration-NnQFKg` ficou preservado após a política bloquear uma tentativa adicional de limpeza. Os processos próprios da execução foram encerrados; não se deve confundir essa execução interrompida com o teste final que passou e removeu seu próprio diretório.
- Better Auth/passkey/Redis storage alinhados em 1.7.10 para preparar o fluxo OAuth oficial. Adapter secundário do Missão Saber passou a usar operações atômicas do adapter oficial; prefixo preservado. Os 19 gates de tipos/testes dos consumidores web passaram após a mudança. OAuth desktop ainda não está habilitado.
- Restam: entrada autenticada/OAuth, comprovação de posse da chave, prevenção de replay, consumo/reconciliação de fatos Stripe, emissão pela API, outbox worker e E2E. Não há bypass comercial ou licença permissiva provisória.

## Normalização e verificação adicional

- Migrações mecânicas via AST TypeScript adicionaram `type="button"` a 352 botões JSX fora de formulários e sem spread de props. Botões em formulários e HTML nativo permanecem sujeitos a revisão específica.
- 120 callbacks `void`/`forEach` foram convertidos em blocos preservando a ordem das expressões. Não foram aplicadas correções inseguras gerais do linter.
- Após essas alterações, 16 tarefas de build/typecheck/test das ferramentas e dos novos packages passaram. A auditoria ainda registra 333 erros de lint e 383 warnings herdados; a normalização **não está concluída**.
- Catálogo comercial atualizado com a aprovação do titular: mensal R$ 29,90, anual R$ 299, sem bônus de créditos de IA. Três testes de catálogo passaram, inclusive rejeição de preço vazio/placeholder na resolução por ID Stripe.
- Nenhum serviço pago foi contratado, nenhuma identidade empresarial foi validada e nenhum preço Stripe foi criado. Portal, Edi Hub, gates comerciais nas ferramentas e pipeline de instaladores ainda precisam de implementação e homologação. Não houve commit, merge ou push; esses passos permanecem condicionados à revisão final real.
- Verificação conjunta após a aprovação comercial: **32 tarefas de typecheck/test passaram** no monorepo (21 em cache), sem excluir consumidores. Isso não substitui o lint integral, smoke de interface, build dos portais, testes Stripe/OAuth nem o review final ainda pendentes.
