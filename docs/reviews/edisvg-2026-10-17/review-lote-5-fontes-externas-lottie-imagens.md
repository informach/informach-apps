# Incremento 5.36 — fontes externas e imagens na Lottie

Estado: implementado e revisado localmente em 20/10/2026 (branch `feat/edisvg-lote-5-restante`). Último item do lote 5 no [review integral](full-review-2026-10-18.md): "assets/fontes externos e perfis Lottie hoje recusados". Não muda o formato do projeto, porque as fontes importadas continuam gravadas como TTF/OTF e a Lottie é uma saída.

## Escopo escolhido

- **Fontes externas**: os contêineres comuns que antes exigiam conversão manual. WOFF 1.0 e uma face de coleção TTC/OTC entram, convertidos sem perda para uma fonte avulsa. WOFF2 continua recusado: exige Brotli e as transformações de tabela do formato, nenhum dos dois disponível no núcleo sem uma dependência nova, e a recusa explica como converter.
- **Perfis Lottie recusados**: imagens PNG. Texto, recortes/máscaras, filtros, padrões e componentes seguem recusados, cada um com o motivo já documentado.
- **Assets remotos** (fontes ou imagens por URL) ficam fora de propósito: o player exportado é offline e sem rede por contrato.

## Contrato

- **Contêineres** (`fontContainer`, `extractFontFace` em `/assets`): o WOFF 1.0 descompacta cada tabela (zlib, com tamanho declarado conferido, tabela crua quando a compressão não ajudaria e limites de 4 MB e 128 tabelas). A coleção extrai a face escolhida, copiando as tabelas que as faces compartilham. Nos dois casos, os bytes das tabelas são preservados; só o diretório, o alinhamento e os checksums (incluindo `head.checkSumAdjustment`) são refeitos. Depois disso, a mesma inspeção de sempre (estrutura, direitos de incorporação, cmap, GSUB/GPOS do 5.31) roda sobre o resultado.
- **Importação**: o painel de recursos e o diálogo nativo aceitam `.woff`, `.ttc` e `.otc`. A confirmação explica a conversão; numa coleção, um seletor mostra família, peso e estilo de cada face e prepara de novo a escolhida, sempre antes da confirmação de direitos.
- **Lottie com imagem**: uma imagem sem nine-slice e sem malha vira uma camada de imagem (`ty: 2`) com o PNG incorporado como data URI. A cena passa a ser dividida, na ordem de desenho, em sequências de camadas de forma e camadas de imagem. Cada imagem tem uma cadeia de pais: transformação global → nulo com posição, rotação e escala amostradas (fatoração da matriz completa) → camada de imagem com a rotação interna e o encaixe da caixa (`preserveAspectRatio` none ou meet com qualquer alinhamento; slice, que recorta, é recusado). A opacidade da camada é o produto da cadeia de ancestrais e da global, porque a Lottie não passa opacidade do pai para o filho. Projetos sem imagens geram exatamente a mesma saída de antes.

## Achados durante a revisão

1. A primeira prova geométrica comparava cantos via `getScreenCTM`, mas o `lottie-web` posiciona as camadas de modo que não aparece nessa matriz, e o viewport SVG aninhado omite o próprio x/y. A prova passou a ser feita por pixels em duas variantes: sem rotação (translação, escala não uniforme e opacidade encadeada, praticamente idêntica) e com rotação (diferenças esparsas só nas bordas e costuras de reamostragem).
2. O helper de WOFF do teste guardava tabelas comprimidas maiores que o original. A especificação proíbe isso e o conversor recusou corretamente; o helper foi corrigido, não o conversor.
3. A mudança do tipo das camadas Lottie para uma união quebrou acessos diretos a `layers[0].shapes` em testes e na jornada nativa. Esses pontos passaram a usar `shapeLayers`, que filtra as camadas de forma.

Depois, o [full review do lote 5](full-review-2026-10-20.md) (D2) achou que a conversão WOFF/TTC não conferia os checksums das tabelas e descompactava sem limitar a saída. Os checksums agora são conferidos contra o WOFF e o diretório da coleção, e a descompressão em streaming para assim que excede o tamanho declarado, exigindo o tamanho exato.

## Gates e evidências

- Núcleo: 171 testes (3 novos): WOFF de uma Noto Sans real com tabelas idênticas byte a byte (exceto o ajuste de checksum do `head`) e mesma inspeção; coleção com Noto Sans e Noto Sans Arabic extraindo cada face, inclusive com o GSUB árabe; recusas de WOFF2 e de tamanho inconsistente.
- App: importação de WOFF e das duas faces da coleção como TTF avulsos, recusa de WOFF2; a Lottie aceita PNG simples (com aviso de reamostragem) e recusa slice e malha. Os 42 testes Lottie anteriores passam sem alteração na saída vetorial.
- E2E (`tests/e2e/lottie-image.test.ts`): retângulo azul abaixo, PNG animado (deslocamento e opacidade, dentro de um grupo com opacidade 0,8) e retângulo vermelho acima. As camadas saem como forma, imagem, nulo, forma e global, com um asset incorporado. Comparado com o player compartilhado no `lottie-web` light: sem rotação, no máximo 4 amostras diferentes em três quadros; com rotação de 0 a 30°, diferenças apenas esparsas (até 200 em três quadros, nas bordas e costuras da imagem reamostrada).
- Regressão: app 284/284, E2E completo 116/116, consumidor Next 1/1, tipos de app e núcleo, Biome sem erros (avisos legados).

## Limites que permanecem

WOFF2 recusado. Coleções acima de 4 MB não entram, porque o limite de importação vale para o arquivo de origem. A Lottie com imagem reamostra os pixels no consumidor e não promete identidade de bordas sob rotação. Nine-slice, malha raster, texto, efeitos e filtros continuam fora da Lottie. Não há assets remotos.
