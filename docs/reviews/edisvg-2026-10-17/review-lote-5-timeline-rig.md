# Incremento 5.20 — timeline unificada de parâmetros

Estado: implementado e revisado localmente em 18/10/2026 no perfil abaixo. Não conclui o lote 5, o lote 6 ou o full review final. Projeto v21, Rig v3, blueprint v10, playback v3 e workspace v1 permanecem; nenhuma migração ou dependência foi acrescentada.

## Lacuna reproduzida antes do incremento

Timeline, seleção, gestures e edição de curvas trabalhavam apenas com trilhas motion/TRS; rig tinha autoria de canais separada apesar de compartilhar o relógio no avaliador. Inserir as trilhas de rig sem alterar referências/locks/retiming faria chaves controlarem canais errados. IDs de canal/chave podem coincidir entre motion e rigs de diferentes pranchetas; proibir retroativamente essas identidades quebraria documentos válidos.

## Contrato implementado

animationKeyReference distingue {kind:motion,trackId,keyId} e {kind:rig,artboardId,trackId,keyId}. IDs compostos JSON pertencem somente à seleção/DOM; nunca são IDs persistidos de objetos. IDs motion permanecem compatíveis. Os schemas de IDs persistidos não admitem pontuação JSON, impedindo colisões entre os namespaces.

animationTimeline projeta somente a prancheta/clip atuais, com owners/controladores reais, bounds, unidades e discretização. Chaves/easing de origem ficam readonly, sem cópias por render/frame; índice e WeakMaps são por snapshot de prancheta/clip e não persistem no projeto. Selecionar rig seleciona seus owners de cena, não o ID de constraint/trim/solo como se fosse node. Scrubbing continua usando o avaliador existente.

animation-keys entra na mesma transação UI/MCP para update/delete/move/copy. Toda referência é resolvida antes das edições; canais/pranchetas têm índices e cada canal referido constrói seu conjunto de IDs uma vez. Motion e rig podem ser misturados, inclusive entre pranchetas pelo comando completo. Locks herdados, referências ausentes/repetidas, colisões, bounds e limites recusam toda a transação. Remover a última chave retira o canal/clip vazio, não o controlador.

O núcleo compartilha keyRetimingSchema/retimeKeyframes com os comandos motion anteriores. Fórmula: âncora + (quadro − âncora) × escala + deslocamento. IDs são conservados ao mover e renovados ao copiar; chaves/easing retornados são próprios. Limites por canal de 10000, agregados de motion/rig de 100000 e payload agregado de 100000 referências são mantidos; payloads são contados antes do clone Zod. applyRig valida a escrita do draft e a publicação final valida o documento/limite serializado de 8 MB. Solo continua inteiro/hold; offset continua em graus e start/end/strength/progress/weight em 0–1. A API Zod foi conferida via Context7 na referência indexada v4.6.5; tipos/build usam a versão real 4.6.7 do lockfile.

## Interface e posse

Timeline virtual, seleção primária/múltipla, pointer preview/cancelamento, guard do app e exclusão usam referências completas. Mover/copiar mantém os valores de formulário move-keys/copy-keys existentes, traduzindo-os para as operações do novo comando.

Dialogs são React/TypeScript. useKeyCurve possui o draft e KeyCurveEditor apresenta campos/gráfico do avaliador real; KeyDialog/RetimeDialog apresentam os comandos. form-values centraliza leitura numérica/textual e conserva os imports antigos do painel de rig por reexport. Containers são desmontados antes da reconstrução do renderer legado.

Curvas inválidas retiram a prévia e impedem aplicar, sem mostrar o último resultado válido como se correspondesse ao draft atual. Handles são botões HTML nativos sobre SVG, com nomes, descrição dos dois eixos, campos numéricos, setas e Enter/Espaço para focar o campo. Não há slider unidimensional fictício. Range fica fixo durante captura; Escape/blur/resize/desmontagem cancelam draft/listeners. Clipboard tem ação explícita e alternativa manual quando recusado, com guarda de desmontagem para resultados assíncronos. Não se declara homologação por leitor de tela.

O diálogo respeita hidden, conserva heading/footer e rola apenas conteúdo quando necessário; viewport 980×680 não cria overflow horizontal e mantém a ação de aplicar visível. O painel usa explicitamente a timeline-body rolável, mede dimensões reais antes do primeiro render e captura scroll antes de root.unmount remover a superfície virtual. Editar uma chave fora da janela revela/foca a mesma identidade sem timers.

Agrupamento por distância mínima de 24 pixels respeita botões de 20×24, em vez de buckets de 8 pixels que deixavam controles se interceptarem. A prioridade da seleção pode avançar o representante sem aproximá-lo do anterior; contagens continuam somando todas as chaves. Zoom revela mais chaves, não remove dados do documento. A seleção continua efêmera; preferências de zoom/scroll continuam no workspace, e navegação não consome histórico de conteúdo.

## Achados e correções no review

- A primeira integração trocou desnecessariamente os valores das opções de retiming e quebrou uma jornada existente. Restaurados e os nove testes de editor/ciclo/trim passaram.
- Busca repetida por canal/chave foi substituída por índices. Teste com dois canais de 10000 chaves move 20000 referências, preserva a entrada e recusa cópia que excederia o limite por canal. Não é benchmark.
- CSS display:grid tornava campos hidden visíveis e esticava botões; composição específica do diálogo corrigida e conferida em screenshots.
- Após a primeira regressão de 75 E2E, um caso novo de edição com zoom revelou observação do host interno em vez da área rolável. Breakpoints condicionais no bundle real confirmaram offset 8844 no corpo e leitura de zero no elemento errado. Container explícito, medição inicial e captura antes da desmontagem corrigem a causa. A tentativa intermediária de antecipar o fechamento do modal foi removida; não há instrumentação permanente, retry ou atraso artificial.
- Caso com 64 canais/32000 chaves revelou interceptação entre botões de representantes próximos; agrupamento/áreas clicáveis corrigidos, com prova unitária de espaçamento e prova real de ambas as direções de virtualização.
- Os primeiros seletores de teste buscavam texto bruto de labels implícitos com selects; a árvore acessível real confirmou os nomes corretos. Testes usam papel/nome do combobox. Undo/redo é de sessão e testado antes da recarga, sem inventar persistência da pilha.
- O novo helper nativo importou TS fonte com resolução ESM do Node simples e falhou antes da jornada de rig. Passou a carregar o grafo pelo tsImport escopado existente do harness; a repetição completa passou. Não era externalização de package no aplicativo instalado.
- Documentação distinguia mal marcos antigos de estado vigente. O índice foi condensado e os registros preservados em [histórico](historico-de-execucao.md); README/guia do núcleo foram conciliados sem apagar evidências dos perfis anteriores.

## Evidências executadas

| Gate | Resultado |
| --- | --- |
| App | 218 testes passaram |
| Núcleo | 123 testes em 38 arquivos passaram |
| Tipos | App e núcleo passaram |
| Sintaxe/build | Passaram |
| Navegador | 76 E2E passaram na regressão final |
| React/Next | ZIP em host independente/StrictMode na regressão; Next 16.4.2 produção/Turbopack/SSR/hidratação passou |
| Electron/Windows | Jornada completa repetida e aprovada |
| Tooling | 43 testes passaram; typecheck continua bloqueado por 11 erros concorrentes do EdiPDF |
| Biome específico | 466 arquivos, zero erros, 14 warnings e 9 infos legados visíveis |
| Auditoria | Prod e dev passaram com zero vulnerabilidades conhecidas; muted vazio |
| Documentação/diff | Links locais conferidos e diff sem whitespace inválido |

Sete unidades de domínio cobrem namespaces iguais, rigs irmãos, propriedade/cache, move/copy/delete, solo inteiro/hold, locks tardios/rollback, colisões/órfãos, seleção densa, limites e revisão obsoleta. O teste de MCP HTTP real encaminha namespaces coincidentes e recusa rig sem artboardId antes do dispatcher; mutação/rollback são testados no domínio.

Três E2E novos exercitam seleção mista, cancelamento de pointer preview, move/copy/delete, curvas inválidas e teclado, solo, undo/redo/reload, revelação/foco após zoom e 64 canais/32000 chaves com menos de 20 linhas e 3000 glifos montados no viewport testado. A seleção conserva a prioridade do representante agrupado sem perder chaves. A regressão anterior cobre curvas TRS, skins/morph/trim, HTML/SVG/ZIP e demais features.

A nova jornada Electron seleciona TRS/rig com scroll virtual, reposiciona ambos, edita curva pelo teclado e confere getTotalLength no Testar ao mesmo instante do avaliador. Desfaz exatamente seus três edits e preserva a fixture do chamador. A jornada completa também comprovou ASAR/EXE/receipt, GUI/licença, Canvas/rig/fontes/PNG/áudio, Save/Open/Cancel/recuperação, ZIP binário, três perfis Lottie Save/Cancel e expiração/negação IPC. Screenshots timeline-rig-curve.png e edi-native-results/edisvg-timeline-rig.png foram inspecionados localmente.

## Limitações e sequência obrigatória

Typecheck transversal permanece com 11 erros em apps/edipdf/src/shared/pdf-annotations.ts, sem alteração dessa frente. Auditoria limpa não certifica compatibilidade do override major de image-size introduzido pelo EdiPDF. Warnings de module type e de preservação de use client em bundles não foram ocultados; Next produção foi validado separadamente. Fragilidade histórica de prazos dos fixtures comuns de launcher permanece para a revisão integral, sem aumento artificial de timeout neste incremento.

Sem instalador instalado/publicado, release, assinatura comercial, deploy, commit, merge ou push. Ainda obrigatórios: demais gráficos/tipografia/raster/joystick, formatos/exportações, semântica/scripting do lote 5; adapter React Native real/matriz de dispositivos, bibliotecas/compartilhamento/colaboração e migração de acervo do lote 6; full review final. Este perfil não certifica substituição integral do Rive, compatibilidade .riv ou desempenho superior.
