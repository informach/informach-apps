# Lote 2 — editor, composição e saída saneada

Escopo: M03–M04, M07–M10 e N07–N09. Depende do gate do lote 1 (review 001 remediado).

## Arquivos e contratos

- `src/domain/document.ts`: ampliar union validada sem remover formatos legados; objetos têm ID, posição, propriedades, rotação/grupo e dados locais de imagem quando aplicável.
- `src/editor/canvas.js`: operações únicas de seleção múltipla, edição, duplicação, alinhamento, camadas, agrupamento, transformação, composição e exportação.
- `src/editor/editor.js`, `index.html`, `editor.css`: ferramentas adicionais, painel contextual, lista navegável de objetos, estilos persistentes e layout compacto/recentes recolhíveis.
- `src/main/main.cjs`/preload: imagem da área de transferência/importação como objeto, exportação configurável. Entradas de PNG continuam validadas no main; somente mídia final achatada é exportada.
- `tests/editor-features.cjs`: Chromium, imagens sintéticas, exportação decodificada e coordenadas reais, sem arquivo pessoal.

## Ciclo de execução

- [x] Escrever regressões para texto multilinha editável, elipse/linha/chamada, seleção/grupo/camada, duplicação/movimento por teclado, máscara opaca e tamanho/fundo de exportação.
- [x] Ampliar modelo e operações do canvas, preservando crop/undo e originais.
- [x] Entregar controles acessíveis, favoritos e composição sem importar código de outro app.
- [x] Verificar pixels exportados e que seleção/guias não aparecem na saída.
- [x] Rodar suites Node/renderer, tipos, Biome e build.
- [x] Review independente com remediação antes do lote 3.

## Entrega e limites — 18/10/2026

Texto multilinha editável, formas/chamadas, preenchimento/sombra/setas, seleção múltipla, grupos, alinhamento, camadas, duplicação e teclado; lista de objetos mantém foco. Inserção de imagens tem IDs/arquivos locais e orçamento por raster único. Rotação/espelho/escala/margem/borda conservam coordenadas e original. Lupa/spotlight/carimbos e cópia sem faixa interna completam composição; remover faixa cria cópia achatada explicitamente, conservando projeto editável anterior. PNG/JPEG/WebP têm dimensão, qualidade/fundo, estimativa e presets; destino é lembrado. Painel contextual, zoom/mão, compactação, estilos persistentes e cores de marca estão disponíveis.

Máscara opaca é aplicada por último à saída; ampliação também usa os pixels mascarados. Projetos editáveis mantêm original/assets e a ferramenta explica essa diferença. Detecção assistida de dados sensíveis (parte N07) depende do OCR do lote 6. A lista navegável e os controles por teclado não equivalem a auditoria completa de acessibilidade.

Review 002: três achados altos e dois médios, todos remediados e verificados independentemente. Cobrem orçamento duplicado de raster (decode e save), inserção assíncrona no documento errado, redimensionamento de linhas direcionadas/cardinais, foco/Space e escala produzindo bitmap zero. Registros em `.compozy/tasks/edicaptura-snagit/reviews-002/`. Regressões promovidas para `tests/editor-review-regressions.cjs` e `src/domain/assets.test.ts`.

## Evidência final

`pnpm --filter @informach/edicaptura test`: 51/51, código 0. `test:renderer`: três runners PASS, inclusive pixels opacos, dimensão exportada, raster persistente, foco/teclado e concorrência. `typecheck`, build e Biome filtrado para erros no escopo: código 0. Há warnings CSS anteriores e sugestões de estilo, sem erro de lint.

`pnpm edi:test:native edicaptura`: código 0 após o build final; inventário físico/ASAR, rejeição de adulteração, abertura GUI, manager e licença efêmera, expiração e bloqueio IPC. Sem instalação/publicação. Esse gate não comprova todas as funcionalidades de captura em hardware físico; lotes 4/5 e matriz final continuam necessários.

## Aceite

Editar texto existente e geometria sem recriar objetos; combinar imagens com objetos persistentes; multi-selecionar/agrupar/alinhar/reordenar; desfazer cada operação. Máscaras de proteção opacas cobrem os pixels na saída e exportação saneada não carrega originais/JSON. JPEG/WebP/PNG respeitam tamanho/fundo/qualidade; edição recuperável conserva originais locais e informa isso. O teclado permite selecionar, mover, excluir e editar objetos pela lista. Não declarar acessibilidade completa só pela existência da lista.
