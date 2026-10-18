# Review para publicação do EdiFoto — 18/10/2026

O titular autorizou novo full review, correções, commit e publicação em produção/main. O trabalho foi isolado em `fix/edifoto-full-review`, partindo de `88c1163`, para preservar as alterações em andamento de EdiSVG/EdiPDF. Este registro complementa e atualiza o [review anterior](review-final.md); suas evidências anteriores continuam históricas.

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

O [PR #16](https://github.com/informach/informach-apps/pull/16) foi integrado em 18/10/2026, no commit `68f550c1d4576222ecf6d4e32a205bccaa56ab47`, após todos os gates do head revisado passarem. A árvore integrada é idêntica à revisada. A release desktop `edi-v0.1.2` está no [workflow de publicação](https://github.com/informach/informach-apps/actions/runs/39129941307). O EdiFoto não é serviço Railway; seus instaladores são publicados pelo workflow da suíte no repositório público de distribuição. Os demais apps são reconstruídos a partir de main pelo catálogo existente, sem incluir as frentes locais não revisadas. O resultado remoto será registrado após confirmação.

## Gates remotos do PR

[CI completa](https://github.com/informach/informach-apps/actions/runs/39128608402), [nativo das seis aplicações](https://github.com/informach/informach-apps/actions/runs/39128608403), [integração de banco](https://github.com/informach/informach-apps/actions/runs/39128608405) e [mídia/instalação/atualização de todas as aplicações](https://github.com/informach/informach-apps/actions/runs/39128608446) passaram no head `26b3efffeb0f7a2377228c6fb7224b1eb68649fb`. A CI inclui check, typecheck, testes, migrations, integrações, avaliações de preflight, E2E de EdiFoto/Cozya/Agenda/Missão e build integral.

Tentativas anteriores do nativo remoto expuseram o problema de notificação do campo de nome; não foram consideradas aprovadas. A CI inicial também falhou ao compilar uma fonte Google na Agenda, antes do login de aquecimento. A falha não se repetiu nas execuções completas seguintes; nenhum teste foi desativado nem foram feitas alterações na Agenda. O status “success” do CodeRabbit corresponde a review automático ignorado pelo serviço, não a uma revisão independente realizada.

Uma pasta temporária inativa do primeiro teste local (`edi-native-thp8XQ`) permaneceu no Temp: a revisão automática bloqueou a remoção por política. A ação não foi repetida por outro mecanismo. Isso não afetou os gates seguintes nem a preparação dos instaladores.

Após o merge, passaram também a [CI da main](https://github.com/informach/informach-apps/actions/runs/39129926195), o [nativo da main](https://github.com/informach/informach-apps/actions/runs/39129926272) e a [integração de banco da main](https://github.com/informach/informach-apps/actions/runs/39129926323), todos sobre o commit integrado.

## Correção após o bloqueio da candidata 0.1.2

O [workflow da candidata 0.1.2](https://github.com/informach/informach-apps/actions/runs/39129941307) foi bloqueado no teste nativo de recuperação do EdiFoto antes de produzir/publicar o seu instalador. O texto recuperado era uma revisão anterior. A distribuição pública permaneceu na 0.1.1; a tag privada anterior foi preservada.

Foi reproduzido independentemente um encoder de uma geração antiga terminando depois de uma cópia nova, usando duas instâncias reais do módulo de recuperação e o mesmo IndexedDB. A fila em memória só ordenava uma geração. A gravação agora compara o instante de captura e atualiza o registro na mesma transação IndexedDB; descarte grava uma marca sem pixels, impedindo recriação tardia. `pagehide` cancela o agendamento e encerra o gravador daquela página. Não houve nova versão de banco ou biblioteca. A verificação nativa espera a condição de texto restaurado, além da presença do viewport.

Os três testes de regressão passaram junto das sete suítes (177 verificações, zero erros JavaScript); typecheck e 36 testes unitários passaram. A nova candidata é `edi-v0.1.3`, com a verificação nativa/remota e publicação ainda em andamento. A preparação do cache de mídia da main encontrou um timeout de conexão em um mirror SourceForge; foi repetida com os mesmos inputs e verificação de integridade, sem trocar o fornecedor ou relaxar hashes.

O PR #17 passou em todos os gates e foi integrado como `66d9f718a1689e63c5fd155386bdf28fa6ab7406`. A repetição nativa da main voltou a recuperar o texto anterior; portanto, a candidata 0.1.3 foi cancelada antes da publicação. A investigação passa a registrar e validar o arquivo de recuperação antes/depois da navegação e depois da restauração, somente com conteúdo sintético do perfil descartável. O defeito de ordenação reproduzido foi corrigido, mas isso ainda não encerra a falha encontrada na jornada Windows.
