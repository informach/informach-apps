# Review intermediário — artboards e contexto de autoria

18/10/2026. Continuação do lote 2; não é encerramento dos lotes 2–6 nem o full review final.

## Entrega e contrato

Documento v5 armazena `artboards[{id,name,scene}]` e `defaultArtboardId`, sem uma segunda cena persistida da prancheta aberta. Projetos v1/v2/v3/v4 são migrados explicitamente; o salvamento nativo conserva backup exato do arquivo anterior. IDs dos objetos são únicos em todo o documento; os orçamentos de geometria/texto/objetos são compartilhados entre pranchetas. O limite de 8 MB permanece.

O painel React permite criar, renomear, dimensionar, duplicar com remapeamento de objetos/trilhas/chaves, definir a prancheta inicial e excluir com confirmação. Exclusão remove suas trilhas na mesma transação reversível; a última prancheta não pode ser excluída. UI e MCP usam os mesmos comandos e controle de revisão. `select_artboard` navega sem consumir Undo.

`edisvg-workspace` guarda somente contexto local validado, por projeto, separado de `edisvg-project`: prancheta/clip abertos, modo, painel, zoom/pan e playhead. Referências obsoletas têm fallback explícito; erro nessas preferências é informado e não invalida o documento.

HTML/SVG exportam a prancheta escolhida e somente suas trilhas no blueprint de execução; JSON mantém todas as pranchetas. A timeline mostra as trilhas da prancheta aberta, sem atribuir nomes de outras cenas aos objetos locais.

## Achados corrigidos

1. Trocar a cena dentro do documento para representar a seleção criaria edições falsas e risco de perder a outra prancheta. O workspace usa uma referência para a cena da prancheta selecionada; persistência recebe sempre a coleção canônica completa.
2. Excluir/duplicar sem atualizar referências produziria trilhas órfãs/IDs repetidos. A operação remapeia ou remove referências atomicamente.
3. Enviar ao runtime apenas o SVG atual junto com todas as trilhas do projeto falharia na validação de objetos. A compilação do export filtra os canais por prancheta, sem mutilar o JSON de autoria.
4. O E2E encontrou falta de recuperação do painel após recarga. Foi implementada persistência própria e validada do contexto, sem misturar essa seleção com conteúdo ou histórico.
5. O harness nativo ainda consultava `project.scene` após a migração. O teste foi atualizado para a coleção canônica; primeira execução falhou nesse acesso antigo, e a execução completa corrigida passou.
6. Ao acrescentar React, pnpm tentou re-resolver peers de autenticação fora desta frente. Os hunks externos foram preservados no estado original; o lockfile final altera apenas EdiSVG/edi-motion e seus snapshots necessários. Frozen install passou. React/DOM 19.3.1 e tipos 19.3.0 seguem os outros apps, sem manter as versões intermediárias incompatíveis.

## Gates

92 testes do editor, 8 do núcleo, typecheck do editor/tooling, build e 3 E2E passaram. A jornada Edge isolada cobre pranchetas, dimensões, navegação sem mutação, duplicar, cancelar/confirmar exclusão, undo/redo e recarga. A repetição nativa passou: inventário, abertura GUI/gerenciador, Save/Open, Save As cancelado, recuperação destacada, licença offline, expiração e recusa IPC. Nenhum instalador foi instalado ou publicado.

Ainda faltam componentes aninhados, os demais requisitos de seleção/timeline/vetores, interatividade, personagens, produção avançada e ecossistema. O renderer passou a incluir React e está maior (~997 kB de JS não comprimido no build local); não há alegação de ganho de desempenho. Medição e redução de custo devem entrar no review do conjunto.
