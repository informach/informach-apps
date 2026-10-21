# Incremento 5.33 — malha e deformação raster

Estado: implementado e revisado localmente em 20/10/2026 (branch `feat/edisvg-lote-5-restante`). Cobre o item "malha/triangulação e deformação raster" do [review integral](full-review-2026-10-18.md). Entra no projeto v23 e no blueprint v12, ainda não publicados.

## Lacuna

O rig deformava só caminhos vetoriais (skin por ossos e morph). Imagens raster podiam apenas mover, girar, escalar e mudar opacidade: não havia como dobrar um braço desenhado em PNG, por exemplo.

## Contrato

- **Modelo** (`imageMeshSchema` em `/visual`): uma imagem pode ter `imageMesh: {columns, rows}` (1–16 cada). É uma grade regular triangulada: (colunas+1)×(linhas+1) vértices, dois triângulos por célula. Exige x/y/largura/altura absolutos e `preserveAspectRatio="none"`, para que a grade de repouso seja a própria caixa da imagem sem recorte de aspecto. É exclusiva com nine-slice.
- **Rig**: a grade de repouso é a geometria do objeto (um contorno aberto de vértices sem alças, em ordem de linhas), no mesmo espaço local da geometria de caminhos. Skin (`bind-skin`, pesos de até quatro ossos) e morph aceitam imagens com malha (`deformable`). Trim continua só em caminhos. O documento de playback aceita geometria de imagem somente nesse formato.
- **Desenho**: o renderer compartilhado gera um grupo `data-edi-mesh="CxR"` com uma cópia da imagem por triângulo: `<g transform="matrix(afim)" clip-path><use href="#edi-asset"/></g>`. A afim leva os pixels da imagem ao triângulo deformado. Os recortes ficam em pixels da imagem e são estáticos; cada um cresce 0,5 px além do triângulo, para que vizinhos se sobreponham em vez de deixar frestas antialiasadas. Um quadro atualiza só as transformações dos triângulos que mudaram.
- **Players**: o player interativo/visual (HTML, React, Testar, vídeo) e o player de timeline (HTML do clip) usam `createImageMeshBinding`. Este lê a grade declarada na marcação, confere com a tipada e com a contagem de vértices, e aplica a geometria avaliada pelo rig. A prévia do editor no modo Animar também.
- **Orçamento**: cada triângulo custa 4 células SVG (grupo, `use`, recorte e polígono) no orçamento agregado de 2000.
- **Exportação**: SVG animado recusa malha deformada por skin ou morph, porque o SMIL não anima as afins por triângulo neste perfil. Lottie já recusa imagens. SVG estático desenha a malha em repouso.
- **Interface**: o painel da imagem ganha *Malha raster* (colunas, linhas, criar/atualizar/remover). Ao criar, a caixa fica absoluta e sem aspecto. O editor de pesos aceita imagem com malha, e a sobreposição mostra as linhas e colunas da grade. Comando `scene image-mesh` com `{columns, rows}` ou `null` (UI e MCP). Mudar a grade de uma imagem com skin/morph é recusado pela validação do rig, sem remapeamento silencioso.

## Achados durante a revisão

1. Composições sem rig nem efeitos geravam playback v2, sem geometria espacial, e a validação portátil da malha (grade de repouso = geometria) falhava. Imagens com malha passaram a exigir os metadados espaciais completos.
2. O layout responsivo restaura o `d` de objetos com geometria durante a medição; agora ignora imagens com malha, que não têm `d`.
3. A asserção da E2E de repouso falhou de início porque uma única chave de rotação no quadro 10 também vale no quadro 0 (a primeira chave segura antes dela). O fixture ganhou a chave inicial; o código estava certo.
4. O painel usava uma asserção de tipo em `SubmitEvent` para distinguir "remover" de "aplicar". Foi trocada por um botão de remoção com ação própria.

## Gates e evidências

- Núcleo: 161 testes (4 novos): grade de repouso e afins exatas (pixels da imagem → caixa), deformação de um vértice afetando exatamente os triângulos que o usam, recortes crescidos, saída do renderer e skin/morph aceitando a grade.
- App: comando, recusa de aspecto, `bind-skin` em imagem com 10 pesos, recusa de mudar a grade com skin, gate v23, deformação avaliada pelo rig (a ponta oposta ao cotovelo segue o osso), compilação interativa, render estático e recusa no SVG animado.
- E2E (`tests/e2e/image-mesh.test.ts`): em repouso, a imagem com malha 8×1 desenha os mesmos pixels da imagem simples (no máximo 1% de diferenças de reamostragem nas linhas de corte). No player, girar o osso de baixo em 60° leva a ponta da imagem de (195, 0) para perto de (150, 80), com o meio pintado o tempo todo. O painel cria uma malha 3×2 salva no projeto, com 12 triângulos na prévia.
- Regressão: app 280/280, E2E completo 110/110, consumidor Next 1/1, tipos de app e núcleo, Biome sem erros (avisos legados).

## Limites que permanecem

A grade é regular (não há triangulação livre nem vértices extras adicionados à mão). A deformação é afim por triângulo, sem interpolação perspectiva dentro de cada um. Nas sobreposições de 0,5 px, pixels translúcidos da imagem podem aparecer levemente mais densos ao longo das linhas de corte. O morph de imagem é editado por comando/MCP (geometria da mesma grade); o editor de morph da UI segue para caminhos. SVG animado e Lottie não exportam malha deformada.
