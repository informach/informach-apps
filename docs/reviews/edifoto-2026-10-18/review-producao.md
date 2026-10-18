# Review para publicação do EdiFoto — 18/10/2026

O titular autorizou novo full review, correções, commit e publicação em produção/main. O trabalho foi isolado em `fix/edifoto-full-review`, partindo de `88c1163`, para preservar as alterações em andamento de EdiSVG/EdiPDF. Este registro complementa e atualiza o [review anterior](review-final.md); suas evidências anteriores continuam históricas.

Estado final em 18/10/2026: escopo simplificado integrado à `main` e publicado na [suíte 0.1.4](https://github.com/informach/edi-releases/releases/tag/edi-v0.1.4), com manifesto assinado e download do EdiFoto verificados. IA pessoal e nomes genéricos preservados. Evidências no [registro estruturado](verificacao-producao.json).

## Correspondência com o diagnóstico

Os lotes cobriram correções e melhorias do diagnóstico, com o recorte de produto autorizado. Não representam implementação integral dos 58 itens da análise profissional original.

| Diagnóstico | Entrega no escopo simplificado |
| --- | --- |
| C01–C04, C15–C16 | Abertura protegida em todas as entradas, validação v1/v2, snapshot de pixels/modelo, savepoints, escrita ordenada e destino exato. |
| C05–C08, C11–C12 | Merge conservador, transformação afim, máscaras vinculadas, bloqueio, coleta/orçamentos e tratamento de GPU. |
| C09–C10, C18 | Transações síncronas, identidade de documento/sessão/run, cancelamento de ferramentas/processos e integração do job de IA com licença. Salvamento de recuperação conserva trabalho sob restrição. |
| C13–C14, C17 | Layout mínimo, harness/CI reparados, exemplos compatíveis com as ferramentas, recorte por cor explícito e intensidade identificada como multiplicador de opacidade. |
| M01–M02 | Espaço simples padrão, ferramentas adicionais acessíveis e mesclagem sob demanda; sem vários modos de trabalho. |
| M03–M04 | Expandir/recolher/suavizar seleção, máscara editável/vinculada e preservação do recorte existente; sem editor profissional de canais. |
| M05–M06 | Ferramentas existentes preservadas, com correções de geometria/segurança; motor de pincéis e curvas profissionais não foram ampliados. |
| M07–M10 | Autoajuste reutilizável, estilos/intensidade, quebra de texto, alinhamento e geometria fiel; sem runs tipográficos, warp ou snapping completo. |
| M11–M12 | Prévia/preferência de exportação e comparação com original preservado; sem exportação em pasta ou checkpoints nomeados. |
| M13–M14 | Assistente pessoal com contexto, progresso/cancelamento, undo e operações compartilhadas. Cobertura de alinhamento/estilos/seleção refinada; sem paridade universal do MCP com cada gesto manual. |
| M15–M16 | Orçamentos de memória/cache, recorte em worker, layout/foco/rótulos e documentação atualizada; sem benchmark universal nem novo sistema de onboarding. |
| N01, N06, N19, N21–N24 | Base de documento v2/recuperação, modelos/estilos e assistência local simplificados. A proposta de créditos/API da casa foi substituída pela exigência de assinatura pessoal. Demais sistemas especializados ficaram fora conforme o plano. |

O escopo vigente é o [plano simplificado](../../../apps/edifoto/PLANO-DE-IMPLEMENTACAO.md). Nomes da interface são genéricos. PSD/RAW, gestão profissional de cor, segmentação semântica, geração por API, tablet avançado e colaboração não são entregas deste ciclo.

## Achados adicionais corrigidos

| ID | Problema e causa | Correção e evidência |
| --- | --- | --- |
| R01 | Reabrir IDs persistidos reutilizava geração 1 de textura e podia mostrar pixels antigos. | Geração global monotônica; reabertura de arquivos com os mesmos IDs e pixels diferentes compara a saída GPU. |
| R02 | Troca limpava o registro antes de preparar todos os pixels e a imagem original. Falha podia deixar estado incompleto. | Registro preparado antes da troca, rollback em falha e original preparado antes de publicar o modelo; testes preservam modelo, histórico e registro. |
| R03 | Chunks não referenciados escapavam do orçamento de pixels; dimensões conflitantes/PNG só eram confrontadas após descompressão. | Rejeição de extras, validação de dimensões únicas, assinatura PNG/IHDR e dimensões esperadas antes da descompressão. Testes unitários e abertura inválida sem alterar workspace. |
| R04 | Pintura muda pixels antes do commit; outras operações/IA podiam intercalar e invalidar o undo. | Guarda central durante traço, incluindo troca/close/undo/redo/camada e IA; testes confirmam bloqueio e undo íntegro. |
| R05 | Gradientes recalculados nas novas dimensões mudavam aparência em corte/resize desigual. Giro de 180° fazia dois commits. | Referência afim persistida para gradientes e giro de 180° direto; testes de pixels para linear/radial, corte, resize, giro, flip e undo. |
| R06 | MCP continuava acumulando corpo após exceder limite; aceitava prefixos de rota. Chaves herdadas podiam ser tratadas como ferramentas. | Limite por bytes com descarte imediato, JSON/aborto tratados, rota exata e Object.hasOwn. Servidor HTTP real nos testes. |
| R07 | Timeout não avisava renderer; saída tardia de processo parado podia recriar sessão. | Timeout propaga cancelamento e processos parados deixam de alimentar sessões/eventos. |
| R08 | Exportação rápida podia usar outro documento após o diálogo. Confirmação de descarte podia ficar obsoleta. | Identidade de workspace conferida antes da saída e edição conferida após confirmação; teste de troca durante picker. |
| R09 | Falha de Blob.arrayBuffer não rejeitava encoder; falhas de recipe deixavam alocações órfãs. | Propagação de rejeição e coleta de bitmaps após falha. |
| R10 | Mensagem residual “Voc?”; controles de ícone/campo do assistente sem rótulos explícitos e foco pouco visível em campos. | Texto corrigido, rótulos/foco e respeito a movimento reduzido. Revisão baseada nas [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md). |
| R11 | Mudanças rápidas em campos distintos da configuração podiam sobrescrever a preferência anterior; inicialização/reconfiguração do MCP podiam concorrer. | Fila de atualização, gravação atômica e sincronização serial do servidor; jornada nativa verifica escolhas concorrentes via IPC real. |
| R12 | O helper atualizava texto nativo sem notificar corretamente o diálogo no runner; o aplicativo salvava com o nome padrão. | A operação de edição `EM_REPLACESEL` substitui a seleção e notifica o controle. Foram mantidos PID/destino exatos, controles visíveis, confirmação de gravação, diagnóstico e Pictures isolado. Jornada completa aprovada localmente e no [Windows remoto](https://github.com/informach/informach-apps/actions/runs/39128608403). |
| R13 | Um encoder de uma geração anterior podia substituir um checkpoint mais novo ou recriar uma cópia descartada. | Comparação do instante de captura na mesma transação IndexedDB, marca de descarte e encerramento do gravador em `pagehide`; três regressões entre gerações. |
| R14 | A espera nativa aceitava uma Promise como pronta e reabria antes da persistência do rascunho novo. | Sondagem assíncrona do projeto decodificado com conteúdo exato; confirmação em reprodução isolada, jornada local e Windows remoto. |

## Verificação deste checkout

- `pnpm install --frozen-lockfile`, Node 24.15.0/pnpm 9.15.0; sem atualização de dependências.
- `pnpm check`: sem erros; avisos existentes permanecem visíveis.
- `pnpm typecheck` e `pnpm test`: passaram no monorepo, incluindo tooling Edi.
- EdiFoto: **36 testes unitários e 177 verificações de navegador**, sem falhas/erros JavaScript. Verificações novas exercitam operações reais do editor/GPU; arquivos/provedores do harness são fixtures.
- `pnpm edi:test:native edifoto`: passou no checkout isolado; recompila o aplicativo e exercita diálogos Windows de salvar/abrir/cancelar, recuperação, exportação PNG, integridade/GUI/licença offline/expiração/IPC.
- `pnpm audit --prod --json`: zero vulnerabilidades reportadas.
- Portal de produção: `/api/ready` respondeu 200 com migrations esperadas/aplicadas iguais. Ambiente GitHub `edi-release`, nomes de secrets/variáveis e política para `main`/`edi-v*` conferidos sem expor valores.
- Inspeção visual: 1440×900 e 1100×680, dock e painéis dentro da área. Capturas/logs locais em `.cache/edifoto-tests` e `.cache/*review*`.

Uma tentativa nativa inicial falhou no fixture de instalação/limpeza, antes de iniciar a jornada editorial; o agregado não expunha suas causas. O runner passou a registrar cada causa agregada, e a execução seguinte completa passou. A falha inicial não foi contada como sucesso. O primeiro teste HTTP também revelou sintaxe TypeScript não suportada pelo strip-only do Node; a declaração foi corrigida e os testes passaram sem trocar o runner.

Sem chamada ao provedor pessoal, cobrança ou uso de conteúdo pessoal/produção nos testes. Quota/login/respostas reais dependem do cliente e da conta do usuário. Estes gates não comprovam facilidade para todo usuário nem qualidade em todos os fundos/GPU; a avaliação com usuários/hardware representativos continua como validação de produto.

## Publicação

O [PR #16](https://github.com/informach/informach-apps/pull/16) foi integrado em 18/10/2026, no commit `68f550c1d4576222ecf6d4e32a205bccaa56ab47`, após todos os gates do head revisado passarem. A árvore integrada é idêntica à revisada. A candidata desktop `edi-v0.1.2` foi iniciada pelo [workflow de publicação](https://github.com/informach/informach-apps/actions/runs/39129941307). O EdiFoto não é serviço Railway; seus instaladores são publicados pelo workflow da suíte no repositório público de distribuição. Os demais apps são reconstruídos a partir de main pelo catálogo existente, sem incluir as frentes locais não revisadas. Essa primeira tentativa foi interrompida antes da publicação; a sequência e o estado atual estão registrados abaixo.

## Gates remotos do PR

[CI completa](https://github.com/informach/informach-apps/actions/runs/39128608402), [nativo das seis aplicações](https://github.com/informach/informach-apps/actions/runs/39128608403), [integração de banco](https://github.com/informach/informach-apps/actions/runs/39128608405) e [mídia/instalação/atualização de todas as aplicações](https://github.com/informach/informach-apps/actions/runs/39128608446) passaram no head `26b3efffeb0f7a2377228c6fb7224b1eb68649fb`. A CI inclui check, typecheck, testes, migrations, integrações, avaliações de preflight, E2E de EdiFoto/Cozya/Agenda/Missão e build integral.

Tentativas anteriores do nativo remoto expuseram o problema de notificação do campo de nome; não foram consideradas aprovadas. A CI inicial também falhou ao compilar uma fonte Google na Agenda, antes do login de aquecimento. A falha não se repetiu nas execuções completas seguintes; nenhum teste foi desativado nem foram feitas alterações na Agenda. O status “success” do CodeRabbit corresponde a review automático ignorado pelo serviço, não a uma revisão independente realizada.

Uma pasta temporária inativa do primeiro teste local (`edi-native-thp8XQ`) permaneceu no Temp: a revisão automática bloqueou a remoção por política. A ação não foi repetida por outro mecanismo. Isso não afetou os gates seguintes nem a preparação dos instaladores.

Após o merge, passaram também a [CI da main](https://github.com/informach/informach-apps/actions/runs/39129926195), o [nativo da main](https://github.com/informach/informach-apps/actions/runs/39129926272) e a [integração de banco da main](https://github.com/informach/informach-apps/actions/runs/39129926323), todos sobre o commit integrado.

## Correção após o bloqueio da candidata 0.1.2

O [workflow da candidata 0.1.2](https://github.com/informach/informach-apps/actions/runs/39129941307) foi bloqueado no teste nativo de recuperação do EdiFoto antes de produzir/publicar o seu instalador. O texto recuperado era uma revisão anterior. A distribuição pública permaneceu na 0.1.1; a tag privada anterior foi preservada.

Foi reproduzido independentemente um encoder de uma geração antiga terminando depois de uma cópia nova, usando duas instâncias reais do módulo de recuperação e o mesmo IndexedDB. A fila em memória só ordenava uma geração. A gravação agora compara o instante de captura e atualiza o registro na mesma transação IndexedDB; descarte grava uma marca sem pixels, impedindo recriação tardia. `pagehide` cancela o agendamento e encerra o gravador daquela página. Não houve nova versão de banco ou biblioteca. A verificação nativa espera a condição de texto restaurado, além da presença do viewport.

Os três testes de regressão passaram junto das sete suítes (177 verificações, zero erros JavaScript); typecheck e 36 testes unitários passaram. A candidata seguinte foi `edi-v0.1.3`, posteriormente cancelada durante a investigação descrita abaixo. A preparação do cache de mídia da main encontrou um timeout de conexão em um mirror SourceForge; foi repetida com os mesmos inputs e verificação de integridade, sem trocar o fornecedor ou relaxar hashes.

O PR #17 passou em todos os gates e foi integrado como `66d9f718a1689e63c5fd155386bdf28fa6ab7406`. A repetição nativa da main voltou a recuperar o texto anterior; portanto, a candidata 0.1.3 foi cancelada antes da publicação. A investigação passa a registrar e validar o arquivo de recuperação antes/depois da navegação e depois da restauração, somente com conteúdo sintético do perfil descartável. O defeito de ordenação reproduzido foi corrigido, mas isso ainda não encerra a falha encontrada na jornada Windows.

O diagnóstico no [Windows remoto](https://github.com/informach/informach-apps/actions/runs/39136009594) mostrou o arquivo anterior já **antes** do reload, enquanto o campo exibia o texto novo. A espera nativa usava `waitForFunction` com callback assíncrono: a implementação instalada trata a Promise como truthy, para de sondar e resolve mesmo quando o resultado assíncrono é `false`. A navegação, então, cancelava corretamente o debounce ainda pendente. Isso explica a repetição sem atribuir falha ao parser/restaurador. A jornada agora usa `expect.poll` sobre o documento efetivamente decodificado e exige o conteúdo exato da camada antes de reabrir, com o mesmo prazo de 15 segundos. São mantidos os três snapshots de diagnóstico, a verificação do original preservado e todos os demais gates. A API foi conferida na [documentação oficial da versão](https://github.com/microsoft/playwright/blob/v1.59.0/docs/src/test-assertions-js.md) e no Playwright 1.59.1 instalado, sem dependência nova.

## Integração da correção final e candidata 0.1.4

O [PR #18](https://github.com/informach/informach-apps/pull/18) foi integrado em `a0f39563f636ee2516e3333a95998d8b1d85f8f3` às 14:57:49 UTC de 18/10/2026, após [CI completa](https://github.com/informach/informach-apps/actions/runs/39136330938), [nativo das seis aplicações](https://github.com/informach/informach-apps/actions/runs/39136330876), [banco](https://github.com/informach/informach-apps/actions/runs/39136330911) e [instalação/atualização Windows](https://github.com/informach/informach-apps/actions/runs/39136330954) passarem no head `25f0c0f`. A árvore integrada foi confrontada com a revisada, sem diferenças. Os snapshots remotos confirmam o mesmo texto novo nos três limites da recuperação. Uma reprodução isolada também confirmou a espera antiga resolvendo `false`, enquanto a sondagem correta aguardou três tentativas até a condição verdadeira.

A primeira rodada de upgrades desse head falhou no cleanup de desinstalação do Hub e no prazo do helper de mídia do EdiAula (176 testes passaram e um foi cancelado). Os logs foram examinados; o helper focado passou localmente em dois testes. Os jobs afetados foram repetidos em runners novos com os mesmos inputs, passando na segunda tentativa. Nenhum prazo ou verificação foi relaxado. As causas específicas dessas duas falhas do runner não foram reproduzidas localmente e não são apresentadas como defeitos de produto corrigidos.

A tag privada `edi-v0.1.4` aponta ao commit integrado e iniciou a [publicação](https://github.com/informach/informach-apps/actions/runs/39138334249). A publicação foi concluída e verificada conforme o registro final a seguir.

## Publicação confirmada e verificação pública

A [suíte 0.1.4](https://github.com/informach/edi-releases/releases/tag/edi-v0.1.4) foi publicada em 18/10/2026 às **15:28:48 UTC**, a partir de `a0f39563f636ee2516e3333a95998d8b1d85f8f3`. O [workflow](https://github.com/informach/informach-apps/actions/runs/39138334249) terminou com **18 jobs aprovados**: qualidade/auditoria, banco, mídia, upgrades dos seis apps, seis instaladores finais e publicação. O publicador confrontou os digests remotos de todos os instaladores com os bytes produzidos antes de liberar o conjunto de sete assets.

Passaram também os gates pós-merge desse commit: [CI completa](https://github.com/informach/informach-apps/actions/runs/39138322636), [Windows nativo](https://github.com/informach/informach-apps/actions/runs/39138322691) e [banco](https://github.com/informach/informach-apps/actions/runs/39138322741). A verificação pública independente em **15:29:17 UTC** usou `fetchPublicRelease` e as âncoras públicas do ambiente `edi-release`: assinatura válida, canal stable, versão 0.1.4, sourceCommit esperado e os seis IDs do catálogo. O instalador público do EdiFoto foi baixado por HTTPS: **116.564.363 bytes**, tamanho e **SHA-512 iguais ao manifesto assinado**. O arquivo foi conferido sem executá-lo na máquina do usuário.

O portal respondeu readiness 200 na conferência final e continua no commit backend `68f550c`; as correções posteriores tratam recuperação desktop e sua jornada nativa, sem mudança de servidor ou schema. Publicação desktop e deploy Railway permanecem estados separados. A verificação funcional se refere ao commit distribuído; o registro operacional posterior altera somente documentação.

Não há achado alto confirmado pendente no escopo entregue. Avaliação com usuários e hardware representativos continua como próximo passo de produto; paridade profissional ampla, segmentação semântica e geração por API permanecem fora deste ciclo. Os trabalhos locais paralelos do checkout original foram preservados.
