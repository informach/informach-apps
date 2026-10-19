# Padrão de desenvolvimento das ferramentas desktop

Este é o padrão de arquitetura e desenvolvimento para novas ferramentas desktop do monorepo e para a integração dos aplicativos existentes à suíte Edi. Complementa a [arquitetura do monorepo](arquitetura-monorepo.md), a [arquitetura dos packages](arquitetura-packages.md) e a [política de auditoria](audit-payload-policy.md).

Para executar o Hub e os editores, preparar o ambiente local, desenvolver funcionalidades, adicionar uma ferramenta e escolher os testes, siga o [guia prático de desenvolvimento Edi](desenvolvimento-edi.md). Este documento define as fronteiras e regras; o guia apresenta os comandos e o fluxo diário.

As regras deste documento orientam novos desenvolvimentos desde sua criação. A migração do código existente e a automação de CI descritas na proposta Edi serão implementadas por etapas; a existência deste padrão não significa que os aplicativos já foram migrados ou que a publicação automática já está ativa.

## 1 Escopo e princípios

As interfaces e os fluxos existentes serão preservados. A identidade visual da suíte segue a direção "bancada e marca-texto", aprovada em 17/10/2026: cores, glifos e ícones de cada ferramenta vêm de `@informach/config/edi-brand`, e os ícones do Windows são gerados por `scripts/edi/make-icons.ps1` com o mesmo desenho. A integração à suíte deve uniformizar arquitetura, contratos, segurança, dependências compartilhadas, instalação, licença e atualização. Funcionalidades ainda em construção pertencem ao backlog de cada ferramenta e não serão concluídas como requisito indireto da integração.

Novas ferramentas usarão a base aprovada neste documento. Nas existentes, mudanças estruturais serão feitas por fronteiras verificáveis, preservando documentos e recursos já funcionais. Uma migração de renderer só será realizada quando necessária para um requisito técnico comprovado; ela deverá conservar a interface e ter testes de regressão.

Decisões seguirão esta ordem: segurança e suporte ativo, compatibilidade comprovada, manutenção e confiabilidade, depois a versão estável mais recente que satisfaz esses requisitos. Dependências alpha, beta, nightly ou release candidate não serão a base de produção. A aplicação de uma versão nova exige homologação; número de versão não comprova ausência de vulnerabilidades.

## 2 Base tecnológica

Novas interfaces usarão React e TypeScript; o desktop usará Electron, electron-vite e Vite. O portal continuará em Next.js. Biome será o padrão de lint e formatação, Zod o padrão de validação em runtime, Vitest o padrão de testes unitários e de integração e Playwright o padrão de testes de interface e Electron.

Diálogos usam `<dialog>` modal e o ciclo de vida compartilhado `showModalOnMount`; `focusOnMount` só em controles abertos por ação do usuário. Testar Tab, Shift+Tab, Escape e retorno ao disparador. Não duplicar traps de foco ou remover os controles nativos para passar lint. Ações de cards e remoção são botões separados, nunca controles interativos aninhados. Sliders, escolhas e edição de texto usam controles nativos sempre que o contrato permitir.

O shield de licença também usa modalidade nativa para ficar acima de diálogos já abertos. A expiração não pode ser descartada com Escape; a retomada restaura o diálogo e o estado `inert` anteriores. Testar essa transição, não apenas a abertura inicial sem outros modais. O bloqueio IPC no main continua obrigatório, independentemente do estado da interface.

Entidades editáveis têm IDs persistentes no modelo, inclusive cores de paleta e stops de gradiente. Normalizar formatos anteriores ao carregar/salvar, preservar IDs ao editar e não gerar UUIDs durante render. `withRenderKeys` serve somente para fragmentos derivados sem estado. Legendas usam texto real disponível e URLs Blob com descarte; mídia ainda não transcrita não deve ganhar legendas fictícias nem ser declarada acessível automaticamente.

Saídas de arquivos passam por capabilities e helpers de escrita compartilhados. Exports com sidecars usam staging/backups e revalidam os destinos antes de substituir. Caches produzidos no main podem conceder leitura do resultado validado; um cache key vindo do renderer nunca pode escolher um diretório. Estado que o próprio main guarda entre sessões pode voltar a liberar só o que ele conferiu ao gravar: a fila de exportação do EdiAula guarda apenas itens cujo destino e mídias estavam liberados (`desktopFiles.canWrite`/`canRead`) e os libera de novo ao ser lida (`grantWrite`/`grantRead`). Múltiplos arquivos não constituem uma transação contra queda de energia; preservar e comunicar a pasta de recuperação quando o rollback não puder terminar.

O EdiPDF amplia os formatos documentais de saída do SDK para CSV/TSV/TXT, Office, OpenDocument, RTF, TIFF, ZIP e BIN. `supportsOutputExtension` consulta a política usada na gravação; apps não mantêm outra lista, e uma extensão aceita não concede acesso ao destino nem comprova um conversor homologado. Executáveis e scripts continuam recusados, e a recuperação de licença não autoriza novas exportações. Anexos de extensão não permitida são oferecidos como `.bin`, sem execução automática. `file:write-copy` passa pela mesma capability e proteção de recuperação de `file:write`. O app revalida identidade/cópia para preservar originais e publica lotes em diretório exclusivo. O corpus e os limites ficam no [full review do EdiPDF](reviews/edipdf-2026-10-18/full-review-entrega.md).

O cofre de sessão compartilhado aceita um encerramento explícito que recusa novas operações e aguarda todas as operações já aceitas, inclusive a liberação do lock. O SDK inicia essa etapa em `will-quit`, depois de os editores aceitarem fechar e da verificação do instalador pendente; cancelar um salvamento não encerra o cofre. Uma validação remota ainda em curso recebe cancelamento em `will-quit` para liberar sua operação do cofre sem aguardar o timeout de rede. O lock de execução só é liberado após essa drenagem. Não apagar locks para contornar um encerramento incompleto.

A matriz abaixo registra candidatos estáveis consultados em 16/10/2026 nos registros oficiais. É uma referência para homologação, não uma declaração de versões já instaladas ou verificadas contra todos os consumidores do monorepo.

| Componente | Versão candidata | Aplicação |
| --- | --- | --- |
| Node.js | [24.22.0 LTS](https://nodejs.org/dist/index.json) | Ambiente de desenvolvimento, CI e backend, após validar todos os consumidores |
| pnpm | [12.14.0](https://registry.npmjs.org/pnpm/latest) | Gerenciador único e lockfile da raiz |
| TypeScript | [7.0.2](https://registry.npmjs.org/typescript/latest) | Código novo, configuração estrita e migração controlada do existente |
| Electron | [44.8.0](https://registry.npmjs.org/electron/latest) | Hub e cinco ferramentas na mesma versão homologada |
| electron-vite | [6.0.0](https://registry.npmjs.org/electron-vite/latest) | Build dos processos Electron |
| Vite e plugin React | [8.3.4](https://registry.npmjs.org/vite/latest) e [6.1.2](https://registry.npmjs.org/@vitejs%2Fplugin-react/latest) | Renderer e cadeia de build desktop |
| React e React DOM | [19.3.1](https://registry.npmjs.org/react/latest) | Novos renderers e consumidores React existentes |
| Tailwind CSS | [4.3.3](https://registry.npmjs.org/tailwindcss/latest) | Estilos de novos componentes e tokens comuns |
| Zod | [4.6.7](https://registry.npmjs.org/zod/latest) | Contratos IPC, documentos, APIs e configuração |
| Zustand | [5.0.15](https://registry.npmjs.org/zustand/latest) | Estado compartilhado de interface quando necessário |
| Biome | [2.5.15](https://registry.npmjs.org/@biomejs%2Fbiome/latest) | Lint e formatação |
| Vitest e Playwright | [5.0.5](https://registry.npmjs.org/vitest/latest) e [1.64.1](https://registry.npmjs.org/@playwright%2Ftest/latest) | Verificação automatizada |
| electron-builder e electron-updater | [26.15.3](https://registry.npmjs.org/electron-builder/latest) e [6.8.9](https://registry.npmjs.org/electron-updater/latest) | Instaladores NSIS, assinatura e atualização |
| Next.js | [16.4.2](https://registry.npmjs.org/next/latest) | Portal e APIs web |
| Better Auth e plugins oficiais | [1.7.10](https://registry.npmjs.org/better-auth/latest) | Conta, OAuth desktop e plugins da mesma linha compatível |
| Drizzle ORM e Kit | [0.45.4](https://registry.npmjs.org/drizzle-orm/latest) e [0.31.11](https://registry.npmjs.org/drizzle-kit/latest) | Schema, queries e migrations |
| Stripe SDK | [23.0.0](https://registry.npmjs.org/stripe/latest) | Backend, com revisão explícita da versão de API e dos webhooks |

O Node externo não substitui o Node embutido no Electron. Código do processo principal deverá usar apenas APIs disponíveis no runtime do Electron homologado. A versão de API Stripe também não será alterada implicitamente por uma atualização de SDK.

No EdiPDF, PptxGenJS 4.0.1 usa `node:https`; o override restrito remove o pacote npm vazio `https` declarado pelo fornecedor. A licença MIT omitida pelo tarball de `tr46@0.0.3`, transitivo do OCR, acompanha os avisos a partir do texto fornecido pelo próprio autor na issue #4, guardado em `packages/edi-ocr/resources/licenses` e aplicado aos apps com `ocr` no catálogo. A exceção exige nome, versão e licença exatos; outros componentes sem aviso continuam bloqueando o instalador. Origem, checksum e validação no [full review](reviews/edipdf-2026-10-18/full-review-entrega.md).

A matriz final deverá ser fixada nas configurações compartilhadas e no lockfile, sem versões divergentes por ferramenta. A migração de Zod 3 para 4, de Node, pnpm, TypeScript e dos packages compartilhados será validada também em Agenda da Turma, Cozya, Missão Saber e demais consumidores afetados. Dependência que ainda exija uma linha diferente terá fronteira documentada e tipos próprios, sem conversão forçada de schemas.

Estado após correções locais: cinco ferramentas importadas com Electron 44.8.0; React/React DOM 19.3.1 e Better Auth/plugins 1.7.10 alinhados. Novos contratos Edi usam Zod 4.6.7; consumidores web legados ainda usam Zod 3 e aguardam migração específica. Node local é 24.15.0, pnpm 9.15.0, TypeScript compartilhado 5.9.3 e Vitest 5.0.5 com Vite 8.3.4; versões candidatas não substituem esses valores automaticamente. Há warning de peer `better-call`/Zod nos consumidores web, registrado como pendência de homologação, não suprimido. O PostgreSQL 18.4 dos testes usa binários portáteis somente no runner Windows, não é dependência de runtime dos apps. A cadeia residual de dependências do [review anterior](propostas/edi-suite-2026-10-16/correcoes.md) foi corrigida na frente de produção de 17/10; `pnpm audit --prod` passou sem vulnerabilidades conhecidas. Os demais gates operacionais e de distribuição permanecem separados, conforme o [registro atual](propostas/edi-suite-2026-10-16/producao-operacao.md).

Electron deverá permanecer em uma linha suportada e receber atualizações de segurança. A política oficial mantém as três últimas linhas estáveis, com a versão minor atual de cada linha. [Política de suporte do Electron](https://www.electronjs.org/docs/latest/tutorial/electron-timelines).

Novos builds usarão a matriz homologada e `pnpm install --frozen-lockfile`. Atualizações de dependências entrarão em PRs verificáveis, com changelog e evidências; o build de release não consultará `latest` nem atualizará o lockfile. Atualizar uma dependência e atualizar o aplicativo do assinante são processos distintos.

## 3 Estrutura e fronteiras

```text
apps/<ferramenta>/
  package.json
  electron.vite.config.ts
  electron-builder.yml
  tsconfig.json
  src/
    main/
      index.ts
      features/<dominio>/
    preload/
      index.ts
    renderer/
      src/features/<dominio>/
    shared/
      document.ts
      ipc-contracts.ts
  resources/
  tests/e2e/
  README.md
```

`main/index.ts` inicializará os serviços e as janelas. Regras de negócio, processamento e persistência serão agrupados por domínio. Testes unitários ficarão próximos do código; E2E e fixtures representativas terão diretórios próprios. Não criar pastas vazias para cumprir o desenho.

O processo principal possui privilégios de sistema. O preload expõe uma API pequena, tipada e validada. O renderer cuida da interação e do estado visual. `shared` contém modelos e contratos puros, sem acesso a sistema operacional, segredos, banco ou framework de servidor.

Apps não importam apps. Packages não importam apps. Reutilização entre ferramentas será feita por packages com responsabilidade definida. `@informach/edi-contracts` terá contratos públicos puros; `@informach/edi-desktop` conterá integração desktop; `@informach/edi-licensing` será exclusivo do servidor. O desktop não importará `@informach/db`, segredos ou módulos server-only.

`@informach/edi-ocr` concentra o OCR local da suíte, fora do SDK main-only porque roda no renderer e num worker com WebAssembly. O root é neutro (schema, limites, estados, geometria e plano de blocos) e pode entrar no main pelo `bundledPackages`; `/worker` e `/canvas` rodam no renderer; `/assets` roda no build e copia worker, núcleos, modelos conferidos por SHA-256 e licenças para o `public/ocr` de cada app. Cada instalador leva sua cópia; nenhum app lê os recursos de outro. A capability `ocr` do catálogo faz o instalador conferir `out/renderer/ocr` e incluir as licenças do núcleo e dos modelos nos avisos. O EdiPDF mantém a camada de texto, a fila e a revisão; o EdiCaptura vai manter recortes, máscaras e o mapeamento até o raster final. [Contratos e limites](../packages/edi-ocr/README.md).

O subpath main-only `@informach/edi-desktop/windows-capture` concentra consultas Win32 fixas de janela/foreground/filhos HWND/cursor e ações fechadas de foco/roda. O app mantém autorização explícita de janela/eixo/região, tokens efêmeros, licença, IPC e ciclo de cancelamento; a ponte não concede essas permissões. Foco ocorre somente no início autorizado; cada roda revalida identidade/bounds/foreground/ponto e é dirigida ao HWND elegível, sem entrada global nem comandos fornecidos pelo renderer. [Contrato, limites e fixtures Windows](../packages/edi-desktop/README.md) distinguem coordenadas físicas/DIP, limitações das mensagens de roda e ausência de detecção semântica. EdiCaptura já integra os modos/precisão/presets de 4b; geometria/composição permanecem no domínio do app. A rolagem de 4c usa worker dedicado com buffers transferíveis, orçamento agregado, tokens de sessão/solicitação e originais retidos para recuperação; implementação e evidências estão no [lote 04](propostas/edi-suite-2026-10-16/edicaptura-lotes/lote-04.md), sem substituir revisão independente ou homologação física.

Os processos `main` e `preload` terão entry points separados dos módulos React. Bibliotecas desktop devem poder ser consumidas pelos renderers existentes sem depender de React ou Next.js. O build poderá gerar preload CommonJS compatível com sandbox, mantendo o código fonte novo em TypeScript.

## 4 Código e contratos

Usar TypeScript estrito, nomes claros e contratos explícitos. Dados externos serão tratados como desconhecidos e validados na entrada; depois da validação, o domínio trabalhará com tipos verdadeiros. Não contornar erros com `as any`, supressões de lint, catches vazios ou temporizações arbitrárias.

Resultados de negócio esperados terão códigos estáveis e mensagens apropriadas. Falhas de infraestrutura serão registradas com correlação e retornadas de forma controlada. O usuário deverá distinguir cancelamento, falta de permissão, ausência de licença, arquivo inválido e falha de gravação.

JavaScript legado que permanecer durante a integração terá verificação de tipos compatível, contratos compartilhados e testes de regressão. Código novo de domínio, IPC, sessão, licença e atualização será TypeScript. CommonJS poderá continuar como formato de saída do bundler, sem exigir que novos serviços sejam escritos nesse formato.

Variáveis de ambiente serão validadas na composição do app. Packages receberão configuração por injeção. Endpoint comercial, publicador e chaves públicas não poderão ser substituídos por opções arbitrárias no instalador de produção.

## 5 Segurança Electron e operações locais

Janelas comerciais deverão usar `contextIsolation: true`, `sandbox: true` e `nodeIntegration: false`, com CSP restritiva, navegação controlada e permissões mínimas. Exceções técnicas exigem evidência, decisão arquitetural e correção planejada; não poderão reduzir a proteção da suíte para acomodar um preload inadequado.

Cada chamada IPC deverá validar janela, frame, origem, canal, schema, autorização e limites de payload. O preload não exporá objetos Electron, acesso genérico a shell nem uma API irrestrita de filesystem. Diálogos e ações explícitas concederão capacidades de acesso a arquivos específicos; validar apenas a extensão não será suficiente.

Servidores MCP locais deverão autenticar seus clientes e aplicar as mesmas operações autorizadas da interface. Loopback e bloqueio de Origin são proteções adicionais, não autenticação. Segredos MCP ficarão no processo principal, fora de logs e documentos exportados.

No EdiCaptura, a IA remota opcional foi limitada pelo titular em 18/10/2026 à assinatura do usuário no Claude Code ou Codex. A referência é a integração já existente no EdiAula com clientes oficiais e MCP local; o lote 8 deverá extrair infraestrutura reutilizável para packages, preservando o EdiAula, sem imports entre apps. Não adicionar API paga ou créditos Edi a esse fluxo. Credenciais continuam nos clientes oficiais, e operações do assistente exigem revisão do conteúdo disponibilizado, autorização e proteção contra resultados de documentos antigos. A [decisão da frente](propostas/edi-suite-2026-10-16/edicaptura-lotes/decisao-ia-assinatura.md) registra contratos, fontes oficiais e o estado ainda pendente da implementação no EdiCaptura.

Cada token MCP é uma concessão de `@informach/edi-desktop/access`: guarda só o hash, o cliente, os escopos (`read`, `propose`, `write`), a criação, o último uso e a validade. As concessões duráveis ficam num arquivo protegido de cada ferramenta (`grants.ts`, `<app>.mcp-grants.v1.bin`, ao lado de `session.v1.bin` e selado do mesmo jeito), nunca no cofre compartilhado: ferramentas mais antigas leem o cofre com o esquema que conhecem, e o cofre agora tolera e preserva campos que não conhece. `authorizeLocalMcp` devolve a concessão (ou `null`), e o servidor da ferramenta decide por ela; quem não aplica escopos continua aceitando qualquer concessão válida. O **Conectar** (`mcp-config.ts`) grava no cliente um token próprio com `read` e `propose`, mantém o token de um cliente já conectado (só `rotate`, o Reconectar, troca) e revoga os anteriores do mesmo cliente; `mintRunToken` cria tokens só em memória, com validade renovável enquanto a execução roda, para execuções da própria ferramenta; `localMcpHeaders` devolve um token do processo, que não é gravado. O token permanente de versões anteriores (`mcpTokens`) vira, na primeira abertura, uma concessão `read` e `propose` válida por 30 dias, revogada no primeiro Conectar da ferramenta. Sair da conta neste computador (aqui ou em outra ferramenta) apaga os arquivos de concessões de todas as ferramentas, encerra os tokens de execução em memória e chama `onSignedOut` da ferramenta, que para as execuções de IA em andamento.

Subprocessos usarão executáveis permitidos e argumentos estruturados, sem montar comandos de shell com dados do usuário. Arquivos temporários, downloads, extração de arquivos compactados e binários auxiliares terão limites, validação de caminhos e verificação de integridade. Downloads interrompidos não serão executados.

Trabalho pesado ficará em workers ou processos apropriados. Operações longas terão identificação, progresso, cancelamento e descarte seguro de resultados antigos. O processamento não poderá bloquear a interface ou continuar escrevendo em um documento que já foi substituído.

## 6 Documentos e arquivos do usuário

Formatos de projeto terão versão, validação, limites e política explícita de compatibilidade. Gravações usarão temporário no diretório adequado e substituição atômica, preservando o original em caso de falha. Migração de formato criará cópia de segurança e não sobrescreverá irreversivelmente o único exemplar.

Histórico, estado pendente, autosave e recuperação deverão usar o mesmo modelo de documento. Abrir, fechar, atualizar ou trocar de conta respeitará alterações não salvas. Arquivos de usuário ficarão fora do diretório de instalação; uninstall e atualização não os removerão.

Testes usarão perfis e cópias isolados. Não registrar tokens, prompts, documentos, áudio, imagens ou caminhos pessoais na telemetria. Conteúdo só será enviado a um provedor externo quando o fluxo informar e autorizar esse envio.

## 7 Interface e estado

Reutilizar tokens, tipografia, ícones e componentes de `@informach/ui` quando compatíveis. As telas de conta, licença, progresso e atualização terão comportamento comum. A disposição dos editores existentes será preservada; uniformização não será uma revisão visual geral. Ícones, Hub e telas de conta seguem a identidade da suíte.

Componentes React usarão estado local por padrão; Zustand será usado onde houver estado compartilhado de interface. O documento e seu histórico ficarão em operações de domínio testáveis, reutilizáveis pela interface e pelo MCP. Evitar regras diferentes para cliques, atalhos e agentes.

Funcionalidades pendentes serão identificadas ou desabilitadas. Um botão não poderá informar sucesso quando a operação correspondente não existir. A condição de beta e as limitações conhecidas serão documentadas sem exigir a conclusão desses recursos para integrar a suíte.

## 8 Sessão e licença

A conta web e o acesso desktop usarão identidade compartilhada, com credenciais desktop limitadas às APIs Edi. O desktop não terá client secret OAuth embutido nem credenciais Stripe ou de banco. O armazenamento de sessão será protegido pelo sistema operacional, com escrita atômica e coordenação entre processos.

A licença será validada em cada ferramenta, inclusive aberta por associação de arquivo, IPC, atalho ou MCP. O processo principal verificará operações privilegiadas; comandos locais do editor também respeitarão o estado de autorização. A autorização offline será assinada pelo servidor e limitada ao período comercial confirmado.

O status desktop traz `cause`, código estável definido pelo controlador para cada estado restrito: sem sessão, sem internet, validação vencida, sessão a validar, armazenamento indisponível, conexão não concluída e cada recusa de licença. Telas escolhem texto e próxima ação por ele, nunca por `reason` ou pela presença de `userId`; `userId` existe só enquanto a sessão está guardada no cofre. Revogação explícita invalida o cache; falha de comunicação preserva apenas o prazo já autorizado. Logout compartilhado deverá alcançar ferramentas abertas e revogar as credenciais pertinentes no servidor. Conta, atualização, suporte e recuperação do trabalho continuarão disponíveis em modo restrito.

Operações longas já autorizadas usam `@informach/edi-desktop/jobs`. O main registra cada operação antes de iniciá-la, encerra o registro ao concluir e verifica o permit antes de novas etapas e do commit de saída. O primeiro bloqueio fixa uma janela máxima de 30 minutos, conferida por timer e relógios monotônico/de parede; eventos repetidos, troca de status e retorno da suspensão não renovam a janela. O permit não é persistido nem exposto ao renderer. Novas operações continuam exigindo licença. EdiAula interrompe gravação e automação guiada imediatamente e preserva MP4; exportação, proxy, chroma e transcrição podem finalizar dentro da janela. Durante uma gravação do EdiAula, proxy, chroma e transcrição novos esperam o fim dela antes de registrar a operação (`apps/ediaula/src/main/scheduler.ts`), então a espera não consome a janela, e os trechos, as medições e a montagem de uma exportação em andamento esperam nas mesmas vagas (as sessões do codificador da placa são divididas entre proxies e trechos); cada fonte grava em partes de MP4 fragmentado com um diário da sessão (`sessao.jsonl`), e uma pasta deixada por uma queda é recuperada e finalizada na abertura seguinte. EdiCaptura encerra vídeo e rolagem imediatamente, mantendo os bytes/trechos para recuperação se o salvamento falhar. Evidências e limites em [preservação de jobs](propostas/edi-suite-2026-10-16/producao-jobs.md).

As regras comerciais e os prazos estão na [proposta Edi](propostas/edi-suite-2026-10-16/proposta.md). Não duplicar números ou listas de status nos aplicativos.

## 9 Scripts e verificação

Cada nova ferramenta deverá oferecer estes scripts, com implementações reais:

| Script | Contrato |
| --- | --- |
| `dev` | Executa o Electron com o build de desenvolvimento |
| `build` | Gera os processos e assets de produção |
| `typecheck` | Verifica main, preload, renderer e código compartilhado |
| `test` | Executa testes unitários e de integração relevantes |
| `test:e2e` | Exercita os fluxos nativos em perfil isolado |
| `package` | Gera instalador sem publicar |
| `package:release` | Gera e assina o artefato comercial na CI confiável |

Lint e formatação continuarão centralizados em `pnpm check`. Tarefas serão registradas no Turborepo com outputs, inputs e variáveis que influenciam o resultado; caches de builds não poderão misturar ambientes ou material assinado com chaves diferentes. Assinatura e publicação não serão reutilizadas indiscriminadamente do cache.

Testes deverão verificar comportamento e riscos: integridade de documento, concorrência, autorização, cancelamento e recuperação. Evitar testes que apenas reproduzam a implementação ou confirmem mocks. A CI terá verificações transversais para packages compartilhados e smoke Windows dos seis aplicativos.

Mudanças em GPU, captura, impressão, atalhos globais e integração com monitores terão validação apropriada em hardware representativo antes de criar a versão. Publicações rotineiras executarão os checks automatizados sem depender de uma nova aprovação manual depois do gatilho GitHub.

## 10 Release automático

Todas as ferramentas usam `electron-builder`, NSIS e `electron-updater`, com identidade estável e instaladores por usuário Windows. No piloto aprovado, a distribuição usa GitHub Releases público, sem certificado Authenticode contratado. Manifestos e inventários de instalação são assinados com Ed25519; o cliente verifica as chaves públicas incorporadas, os hashes e os tamanhos antes de executar uma atualização. Essa assinatura não identifica um publicador confiável para o Windows, que pode avisar ou bloquear o executável. Não desabilitar proteções do sistema. A [decisão de distribuição do piloto](propostas/edi-suite-2026-10-16/distribuicao-piloto.md) rege essa etapa.

A verificação do inventário usa um contrato explícito de filesystem. Na composição Electron, startup e Hub fornecem `original-fs` por `electronInstallationFileSystem` para conferir os bytes físicos de `app.asar`; no tooling Node, o verificador usa o filesystem Node. A regressão nativa exercita um ASAR válido e adulterações no Electron real. Não desabilitar globalmente a virtualização ASAR para contornar a leitura do pacote.

Dependências nativas distribuídas precisam de origem fixada, teste dos executáveis e licenças/fontes correspondentes dentro do artefato. Nos consumidores marcados `nativeMedia` no catálogo canônico (EdiAula e EdiCaptura), `edi:media:build` compila FFmpeg/FFprobe a partir de `scripts/edi/media/sources.lock.json`, com NVENC, AMF e Media Foundation (só cabeçalhos; os runtimes vêm do driver ou do Windows); `edi:media:test` verifica capacidades e regressões no Windows. O build empacotado usa somente `resources/native-media/bin`, incluído no inventário assinado, e acompanha `Corresponding-Source.tar.xz`. O export main-only `@informach/edi-desktop/native-media` compartilha resolução/executor/probe/quadro/encoder sem dependência de Electron ou apps. O EdiAula reutiliza a resolução e mantém seu executor, probe e seleção de encoders especializados para a fila de exportação, prioridades e novos formatos; o EdiCaptura usa a fachada NativeMedia. Cada instalador inclui seus próprios binários e não depende de outra ferramenta instalada. Desenvolvimento prioriza o bundle do workspace; wrappers npm são fallback explícito do EdiAula. O release deve consumir o artefato verificado do mesmo workflow, sem buscar uma versão nativa flutuante no computador do cliente. A [homologação Windows](propostas/edi-suite-2026-10-16/producao-windows.md) registra o estado executado.

Os recursos nativos do próprio EdiAula ficam num executável nosso, `resources/native/ediaula-helper.exe`, compilado no build do app a partir de `apps/ediaula/native/helper` com o compilador C# do .NET Framework do Windows: cursor, teclas, listagem de telas e janelas, entrada do modo guiado na tela e o áudio do PC por process loopback do WASAPI, que exclui a árvore de processos do próprio app (`loopback --exclude-pid`), sem PowerShell nem `Add-Type`. O modo guiado na janela da aula não usa o auxiliar: a página é dirigida pelo Chrome DevTools Protocol (`webContents.debugger`) e capturada numa janela fora da tela, sem mover o mouse real (`apps/ediaula/src/main/guidedCdp.ts` e `guidedCapture.ts`). Ele vai fora do ASAR, entra no inventário assinado como os demais arquivos, e o `beforePack` recusa um executável ausente ou de outra versão. Sem certificado Authenticode, AppLocker e antivírus ainda podem barrá-lo; a assinatura de código continua sendo a decisão de distribuição registrada acima.

A suíte terá uma versão comercial por release, derivada de tag SemVer `edi-vX.Y.Z` ou `edi-vX.Y.Z-beta.N`. Cada artefato declarará a ferramenta, versão, commit, plataforma, arquitetura e contratos suportados. Uma versão comercial não poderá ser reutilizada para bytes diferentes depois de publicada.

O workflow `.github/workflows/edi-release.yml` aceita push da tag, publicação de GitHub Release correspondente ou execução manual com uma tag existente. Exige que o commit pertença ao histórico de `main`, usa concorrência única de publicação e descobre a matriz no catálogo tipado. Os jobs de revisão, build, teste, assinatura, upload e publicação pertencem ao mesmo fluxo; não dependem de outro workflow disparado indiretamente por `GITHUB_TOKEN`.

A homologação de upgrade em `.github/workflows/edi-upgrade.yml` deriva dois grupos desse catálogo: os quatro apps sem bundle nativo começam após a descoberta, com até dois jobs simultâneos; EdiAula e EdiCaptura aguardam também o build e a verificação de mídia. Ambos chamam o mesmo `.github/workflows/edi-upgrade-app.yml`, preservando o checkout de `source_ref`, o runner Windows, o teste de duas versões assinadas e os artefatos de evidência por app/tentativa. A separação antecipa o diagnóstico dos instaladores independentes; o workflow completo e a publicação continuam exigindo sucesso dos seis apps e de toda a verificação de mídia. O encadeamento usa [matriz com workflow reutilizável](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows#using-a-matrix-strategy-with-a-reusable-workflow) e dependências `needs`, sem tolerância a falhas.

Artefatos ficam em caminhos imutáveis por versão. Um manifesto assinado contém os seis instaladores e determina o catálogo de cada canal. O provider oficial customizado do updater seleciona somente o artefato da própria ferramenta; não há `latest.yml` compartilhado nem credencial GitHub nos clientes. O workflow prepara um rascunho, confirma os sete arquivos e seus digests no GitHub e só então publica a release imutável. Falha antes da publicação mantém a versão anterior disponível. Esse desenho substitui, no piloto, o feed em storage e o endpoint de ativação previstos inicialmente.

As ferramentas verificam atualizações no início e a cada 15 minutos enquanto estão ativas. Checagem e download são automáticos e independem de assinatura comercial ativa. A instalação é agendada para o fechamento seguro, com nova verificação do arquivo antes da saída e sem encerramento forçado. O Hub instala ou atualiza ferramentas fechadas com o mesmo manifesto e um lock compartilhado por ferramenta; não abre um editor em modo de manutenção. A homologação nativa precisa comprovar instalação, atualização e preservação de dados antes do primeiro release público.

Com Hub e ferramentas fechados, a atualização ocorrerá na próxima execução. Não haverá promessa de instalar em um computador desligado ou sem um processo da suíte em execução. Reinício forçado durante trabalho não será o mecanismo de atualização.

A configuração, as limitações e os procedimentos do piloto estão no [manual de distribuição](propostas/edi-suite-2026-10-16/distribuicao-piloto.md). A seção de distribuição da proposta conserva o desenho inicial e deve ser lida com essa decisão posterior.

## 11 Cadastro de novas ferramentas

Uma nova ferramenta deverá ser criada a partir da estrutura homologada, com nome `@informach/<slug>` e diretório correspondente em `apps/`. O catálogo tipado `packages/config/src/edi-tools.ts` é a origem dos IDs, identidades Windows e participação na suíte. Manifestos e matriz de build são derivados desse cadastro. Atualizar também os contratos estritos, testes de completude e inventário de publicação ao ampliar a suíte.

O cadastro deverá incluir slug único, identidade do aplicativo, extensões e formatos, capacidades licenciadas, estado de disponibilidade e requisitos de sistema. Pipelines usarão esse registro para descobrir os aplicativos, evitando listas independentes que precisam ser lembradas em várias configurações.

Não criar um Checkout, uma assinatura Stripe ou uma cópia do mecanismo de licença para cada nova ferramenta. O catálogo comercial continuará representando a assinatura da suíte; a nova ferramenta passará a integrar as permissões e o manifesto de release conforme sua disponibilidade.

## 12 Critério de conclusão

Uma ferramenta está integrada à suíte quando seus recursos já implementados preservam o comportamento aprovado, os documentos existentes continuam válidos, os contratos e dependências estão homologados, a licença funciona em todos os pontos de entrada e a CI consegue gerar, assinar, publicar, instalar e atualizar o aplicativo.

Para nova funcionalidade posterior, exigir comportamento implementado, testes proporcionais ao risco, interface acessível, documentação das limitações e compatibilidade de dados. Nenhuma alteração poderá ser marcada como concluída apenas porque a tela existe.

Exceções deverão identificar motivo, impacto, responsável, prazo e verificação em uma decisão arquitetural. Compatibilidade transitória documentada não autoriza ignorar erro de tipo, contornar licença ou desabilitar segurança.
