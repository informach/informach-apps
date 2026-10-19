# Review incremental 5.4 — imagem e nine-slice visual

18/10/2026. Continuidade do lote 5, sem encerrá-lo ou substituir o full review final.

## Contrato implementado

Projeto v16 aceita v1–v15 com a política existente de backup fiel. `imageSlice:{top,right,bottom,left}` é exclusivo de imagem, em pixels da origem; exige centro com extensão positiva e dimensões absolutas em px. O blueprint v4 leva origem/insets tipados; v1–v3 continuam aceitos sem essa extensão. Recursos continuam no catálogo raiz por hash, não nove cópias da imagem.

`imagePresentation` do núcleo gera uma descrição limitada a SVG/use, compartilhada por SVG/HTML, React e Testar. Referências são IDs internos validados; atributos livres de URL/eventos, números e transforms usam validação comum do núcleo. O inspetor permite editar dimensões/insets, com histórico e locks, e não oferece preenchimento/contorno/estilos vetoriais sem efeito em raster. Comandos de pintura incompatível falham atomicamente. Reparenting conserva somente a herança pertinente à imagem, incluindo visibilidade.

Nine-slice compõe nove viewports recortados sobre a mesma imagem, esticando centro/faixas e preservando os cantos quando possível. Se o alvo for menor que a soma das bordas, elas encolhem proporcionalmente. Células de área zero permanecem não renderizadas, com viewBox não degenerado. Interpolação de texels continua nativa do SVG: amostras no footprint bilinear junto a recortes podem misturar pixels vizinhos da origem. Não se declara sampler GPU com clamp independente por tile, nem se aplica pixelation global para disfarçar isso.

Layout responsivo recalcula as células, não escala o bitmap inteiro. O viewport autoral fornece as dimensões intrínsecas; saída de um reflow não realimenta a próxima medida. Atualizações são preparadas antes de publicar a geometria, e o descarte restaura os atributos/células/slots. Neste perfil, nine-slice com layout recusa rotação/skew/escala no espaço SVG/basis; TRS animável continua permitido. Sem layout, transforms normais do objeto continuam atuando sobre a imagem inteira. Expansão/preflight contam as 18 células/referências extras no orçamento de 2000 elementos.

## Review e gates

- 140 testes do editor e 64 do núcleo aprovados; tipos editor/núcleo/tooling, build e check focado sem erros.
- 35 E2E conjuntos e Next.js em produção/SSR/hidratação aprovados. Após centralizar validação, os três testes focados de nine-slice/autoria/consumidor React foram repetidos com sucesso.
- PNG real com nove regiões coloridas: amostras de pixels em tamanhos 100×60 e 200×100, retorno ao tamanho inicial, dimensões menores que as bordas e liberação de slots/atributos aprovados. Amostras ficam no interior dos tiles, fora do footprint de filtragem; larguras de cantos são verificadas separadamente.
- UI compilada comprova dimensões/insets, undo/redo e conteúdo v16 persistido. ZIP React independente comprova nine-slice, fonte e áudio em Testar/consumer, compilação TypeScript e ausência de rede/workspace.
- Jornada Electron ampliada aprovada: pixels PNG nine-slice, bordas responsivas, fonte/PCM, rig/Worker/Yoga sob file/CSP, integridade/GUI/gerenciador, Save/Open/Cancel/recuperação/ZIP e gates de licença/expiração/IPC. Projeto aberto preservado; nenhum instalador instalado/publicado.

Achados corrigidos: controles e comandos de pintura sem efeito em raster; herança vetorial indevida durante reparenting; getBBox incluindo pixels fora do recorte; realimentação de dimensão após reflow; render de imagem duplicado entre saídas; helpers públicos aceitando atributos sem validação compartilhada; orçamento não contabilizando as células adicionais.

## Continuidade

Próximo incremento: gradientes/recursos vetoriais e demais requisitos gráficos/tipográficos avançados. M03/M04/M05, malha raster/triangulação, joystick/timeline, formatos, semântica/scripting, lote 6 e full review continuam rastreados. Não declarar substituição integral do Rive, desempenho superior ou homologação RN.

Referência primária: [SVG 2 — viewports e bounding boxes](https://www.w3.org/TR/SVG2/coords.html), consultada para a distinção entre geometria referenciada e recorte visual.
