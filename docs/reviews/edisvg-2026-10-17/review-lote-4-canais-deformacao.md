# Review incremental 4.2 — canais, caminho, morph e solo

Marco posterior: [review integrado 4.3](review-lote-4-integrado.md), com skin/pesos, bindings e jornada Electron. Este documento conserva o estado/evidências do incremento anterior.

Execução contínua autorizada. Base `88c1163`, branch `feat/edisvg-evolution`. Este registro não encerra o lote 4 nem substitui o full review final. Projeto v14 (aceita v1–v13 com backup existente), Rig v2; Rig v1 continua aceito sem recursos novos. Nenhum commit, publicação ou deploy.

## Contrato e implementação

- Canais tipados de força, progresso, peso de morph e índice solo, ligados a animações existentes por identidade. Compartilham interpolação numérica e fases dos drivers com TRS, inclusive componentes aninhados/ping-pong. Valores/frames/IDs/refs/curvas e duração são validados; índice solo exige inteiro e `hold`.
- Máquinas compõem poses com transformações **e parâmetros**: blend 1D, transições, congelamento da pose realmente interrompida, pesos/máscaras e aditivo base-relativo. Uma máscara precisa cobrir todos os donos de um parâmetro. Não existe relógio paralelo para o rig. Camadas aditivas não aceitam solo discreto; a validação antecipada desse conflito ainda será conferida no review conjunto.
- Interface de chaves limitada a 20 entradas por página, gravação/edição/exclusão, curvas e foco de canal preservado no workspace entre transações. Não monta milhares de inputs. UI/MCP compartilham `rig replace`; `get_rig`/`get_rig_value` incluem clips de parâmetros, morphs e solos.
- Geometria canônica absoluta com âncoras/alças e contornos. Morphs aplicam deltas ponderados da base; topologia/fechamento/alças precisam corresponder. A interface captura uma pose de outro caminho na mesma convenção **local**, preservando a arte original. Topologia incompatível é recusada atomicamente.
- Seguir caminho usa comprimento em coordenadas mundiais, subdivisão adaptativa de Bézier e orçamento explícito de erro/trabalho. Progresso, orientação, rotação adicional e deslocamento normal respeitam pais afins/pivôs. Contornos múltiplos são selecionados por índice; caminhos degenerados não geram uma posição fictícia.
- Solo atua sobre filhos diretos na ordem autoral. −1 oculta todos. Visibilidade autoral e bindings continuam sendo respeitados. Busca reversa restaura a expressão anterior, sem retenção do último frame.
- Editor, runtime, HTML e SVG amostrado usam o mesmo frame completo. SVG incorpora `d` e visibilidade discreta, sem JS. Exportação de geometria tem orçamento próprio antes de construir as amostras. Rig estático e movimento reduzido também conservam a geometria.

## Revisão e evidências executadas

- Núcleo: **49 testes** passaram, incluindo interpolação/overshoot, interrupção de transição, máscaras/aditivo/blend1D, fases aninhadas, curvas com retorno colinear, limites de subdivisão, caminho sob pais não uniformes, morph de alças e solos reversíveis.
- Editor: testes focados de persistência/roundtrip/duplicação, inspeção exata, topologia, referências e locks passaram. A rodada integral ampliada ainda será repetida.
- Jornadas reais passaram: chaves de força com Undo/Redo/reload/Testar; captura morph e solo pela UI com foco de canal preservado; equivalência interativo/HTML/SVG incluindo buscas para trás. Fonte do projeto comparada antes/depois do teste.
- A comparação de IK com força animada e o teste de viewport zero/restauração passaram. A medição usava fallback de tamanho autoral para dimensão zero; corrigido na origem. Mudança de dimensões invalida o token de layout mesmo quando as matrizes dos slots coincidem.
- Tipos do editor/núcleo e build passaram nas rodadas deste incremento. Não declarar nova jornada Electron, homologação RN ou full review realizados.

## Achados corrigidos

Registro parcial de assinantes agora tem rollback; ferramenta indisponível não altera navegação; edição de restrições mantém prioridade autoral e reordenação tem controles explícitos; onion skin reutiliza contexto; retorno de solo restaura `display` original; canais discretos não leem um select desativado pelo FormData; foco de canal fica fora do documento.

## Continuidade

Integrar malha/pesos, bindings de parâmetros, budgets agregados de geometria em todas as fronteiras, revisão dos perfis/falhas e gates conjuntos/Electron. Não afirmar que malha raster, render avançado, formatos adicionais, React Native ou equivalência com Rive estejam prontos: pertencem à continuidade dos lotes 4–6. EdiFoto/EdiPDF têm alterações concorrentes de outra frente; não foram modificadas para fazer passar gates do EdiSVG.
