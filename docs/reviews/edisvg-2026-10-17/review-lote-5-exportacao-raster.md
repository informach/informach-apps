# Incremento 5.24 — sequência PNG, GIF, MP4 e WebM

Estado: implementado e revisado localmente em 20/10/2026, na branch `feat/edisvg-lote-5-restante`. Abre a execução do restante do lote 5, autorizada pelo titular na mesma data, com review por incremento e full review ao final. Não altera projeto (v22), Rig (v4) nem blueprint (v11): é uma saída nova do mesmo documento, sem campo persistido.

## Lacuna e perfil

O [review integral](full-review-2026-10-18.md) listava "exportadores PNG sequência/GIF/MP4/WebM" entre as pendências do lote 5. Até aqui, todas as saídas eram vetoriais ou de projeto (HTML, SVG, Lottie, React, JSON). O perfil 5.24 converte **uma animação por objeto** em imagens, no tamanho e FPS escolhidos:

| Formato | Arquivo | Transparência | Limites próprios |
| --- | --- | --- | --- |
| Sequência PNG | `.png.zip` com `quadro-00000.png…` e `sequence.json` (tempos, dimensões, ciclo, fundo) | Alpha por pixel | 1,5 bilhão de pixels renderizados |
| GIF | GIF89a, paleta local por quadro | Total ou nenhuma (alpha < 128 vira transparente) | Até 1920 px por lado e 50 FPS; 600 milhões de pixels |
| MP4 | H.264 High, nível mínimo que comporta tamanho e taxa de macroblocos; `moov` antes do `mdat` | Não (fundo obrigatório) | Dimensões pares; 4 bilhões de pixels |
| WebM | VP9 em Matroska com SeekHead, clusters por quadro-chave e Cues | Não (fundo obrigatório) | Dimensões pares; 4 bilhões de pixels |

Comuns: 16–3840 px por lado, 1–60 FPS, até 3600 quadros e 256 MB de arquivo. Loop omite o quadro final (igual ao primeiro); once conserva a pose final como último quadro; ping-pong cobre o período de ida e volta. FPS diferente do clip é reamostrado pelo mesmo `frameAtSeconds`, com aviso. Tempos de vídeo são inteiros em microssegundos derivados de `k/fps`, sem deriva; atrasos do GIF são arredondados sobre o relógio acumulado (30 FPS alterna 3/4/3 centésimos, total exato).

Consentimentos explícitos, todos no mesmo relatório (`inspectRasterExport`): conversão em imagens (vetores, texto selecionável, semântica, áudio e interação ficam de fora); somente timeline quando a composição é interativa (máquinas não entram, inputs/dados/componentes ficam nos valores iniciais e o layout é calculado só naquele tamanho); paleta do GIF (até 256 cores, sem pontilhado). O WebCodecs do Electron 44 recusa `alpha: "keep"` em VP8/VP9 ("Alpha encoding is not currently supported"), por isso vídeo transparente está fora do perfil e é recusado, não achatado em silêncio.

## Arquitetura

- `src/shared/raster/profile.ts`: schema estrito das opções, plano de quadros, relatório/gate único e cópia "somente timeline" (remove só as máquinas da prancheta exportada).
- `src/shared/raster/{gif,mp4,webm,sequence,bytes}.ts`: escritores puros, sem DOM, com `ByteWriter` limitado. GIF: median cut sobre histograma de 15 bits com médias reais dos pixels, LZW com reinício em 4096 códigos, recorte do retângulo alterado e descarte decidido com o quadro seguinte conhecido. MP4: tabela única de tempos (`fps × 1000`, 1000 unidades por amostra), `stss`, `stsz`, `stco`. WebM: tamanhos explícitos, SeekHead de tamanho fixo e Cues com posição exata de cada cluster.
- `src/renderer/src/raster/frameSource.ts`: monta `createVisualSvgPlayerAsync` fora da tela com `autoplay:false`, `respectReducedMotion:false` e `pauseOffscreen:false` (com "reduzir movimento" o player pintaria o quadro parado), avança o relógio do clip, serializa o SVG vivo com `@font-face` em `data:` e desenha num `OffscreenCanvas`. É o mesmo player do Testar, do HTML interativo e do React: recortes/máscaras, nine-slice, gradientes, rig, trim, componentes e layout entram sem uma segunda renderização.
- `src/renderer/src/raster/rasterExport.ts`: PNG via `convertToBlob`, GIF via `getImageData`, vídeo via `VideoEncoder` com `prefer-software` (sem quadros B), contrapressão que acorda em `dequeue`, erro ou cancelamento, e verificação de ordem de apresentação antes do mux.
- `raster-export-panel.tsx`: ilha React no diálogo legado, remontada por formato (consentimentos não atravessam formatos). Tamanho com proporção travada, FPS, fundo, qualidade de vídeo, verificação assíncrona do codificador e status `aria-live`.
- IPC: o renderer envia `{ extension, bytes, encoding: "binary" }`; `parseExportPayload` aceita só `png.zip`/`gif`/`mp4`/`webm`, 8 B–256 MB e a assinatura de cada formato (`PK\3\4`, `GIF89a`, `ftyp`, EBML). O destino continua vindo do diálogo nativo; o SDK já limita binários de IPC a 512 MB.

Não há ferramenta MCP de exportação (nenhum formato tem); o assistente não ganha acesso novo.

## Achados corrigidos durante a revisão

1. **GIF vazava o quadro anterior sob pixels transparentes.** O descarte de um quadro é gravado no próprio quadro, antes de o seguinte ser conhecido; um quadro transparente depois de um opaco com descarte 1 deixava o opaco aparecer. O codificador agora segura um quadro bruto e o escreve quando o próximo chega: descarte 2 quando ele ou o seguinte tem transparência.
2. **Recorte + descarte 2 limpava só o retângulo.** Com o item 1, um quadro recortado seguido de um transparente restauraria apenas a área recortada. O recorte passou a exigir quadro anterior mantido (descarte 1), quadro opaco e sucessor opaco.
3. **Median cut podia criar caixa vazia** quando um bin pesado concentrava o peso: vermelho e azul viravam a mesma cor (248,0,7). A divisão agora mantém ao menos um bin de cada lado.
4. **Espera de contrapressão podia travar** se o codificador falhasse (ele fecha e não emite mais `dequeue`). A espera acorda também em erro e cancelamento.
5. **`style` de 100% na raiz entraria no SVG serializado** e mudaria o tamanho da imagem. O tamanho fica só nos atributos em pixels; o CSS fica no contêiner fora da tela.

Medido antes de decidir: no Chromium e no Edge, `decode()` de um SVG-imagem só resolve depois de carregar a fonte `data:` incorporada (diferença zero entre desenhar na hora e 800 ms depois; 15.387 pixels de diferença para a fonte de fallback).

## Gates e evidências

- Unitários: 8 do núcleo raster (plano de quadros, relatório/consentimentos, cópia somente timeline, GIF exato até 256 cores e com reinícios LZW, MP4, WebM, sequência PNG) com leitores independentes em `tests/rasterDecoders.ts`, escritos a partir das especificações; 2 de nível H.264/configuração; 1 de IPC binário. App: 258 testes; núcleo `edi-motion`: 136; tipos do app limpos.
- E2E (renderer compilado, Chromium e Edge): quadros PNG comparados com captura de tela do mesmo player montado ao vivo no DOM — erro médio 0,14 por canal, 0,5% dos pixels acima de 24, residual constante em todos os quadros (antialiasing do texto de 10 px). GIF lido pelo `ImageDecoder` do navegador: 11 quadros de 100 ms. WebM e MP4 abertos pelo `<video>` do navegador: duração 1,1 s e quadros com erro médio 0,4–0,75 contra os PNGs. Diálogo: consentimentos bloqueiam o botão, downloads reais de ZIP/GIF/WebM, vídeo sem opção transparente, altura ímpar arredondada para par e projeto inalterado.
- Regressão completa: 84/84 E2E no Chromium do Playwright (82 anteriores + 2 novos), `pnpm build` e tipos do app.
- Desempenho medido (Edge, 1080×1080, fixture com fonte, máscara e nine-slice, 61 quadros): PNG 1,7 s, GIF 1,8 s, MP4 0,8 s, WebM 0,9 s — 13 a 28 ms por quadro.
- Electron: `apps/edisvg/scripts/native-raster-journey.mts` entra na jornada `pnpm edi:test:native edisvg`: cria um clip pela interface, exporta MP4 e GIF pelo diálogo nativo, decodifica o H.264 salvo com o `VideoDecoder` do próprio Electron a partir do `avcC` e das amostras, cancela sem alterar o arquivo e desfaz as edições. O helper de diálogo aceita só esses dois destinos exatos.

Limitação local registrada: nesta máquina o WMI está degradado (uma consulta `Get-CimInstance` do próprio processo levou 1min58s), e a etapa de instalação da jornada nativa estourou o tempo antes de chegar ao EdiSVG. A mesma jornada raster foi executada no Electron real com o harness e o diálogo de salvar respondido dentro do processo principal (técnica do teste visual do EdiAula): MP4 `avc1.640c0c` decodificado (10 quadros), GIF e cancelamento aprovados. No runner Windows do CI (`edi-native.yml`, PR #29), a jornada nativa completa passou nos commits `362f8891` e `e072ab6e` com a etapa `Verified native raster exports: MP4 avc1.640c0c decoded (10 frames), GIF and Cancel`. Uma rodada anterior, do commit `001df7aa`, parou na espera de layout de leitura do EdiPDF (`PDF reading layout did not settle`), a intermitência já registrada no full review de 18/10; não envolve o EdiSVG e não foi mascarada.

## Limites que permanecem

Sem áudio nos vídeos (os efeitos por evento do 5.3 não são mixados), sem vídeo transparente, sem APNG/WebP animado e sem pontilhado no GIF. O vídeo não repete sozinho: o ciclo depende do player (`loop` na web). Codificação depende do WebCodecs do computador; o painel verifica e recusa com motivo quando o codificador não aceita o perfil. O CI Linux pode não ter H.264, e o E2E então verifica só o WebM e a estrutura. Exportação roda no processo do renderer, com progresso e cancelamento, mas sem worker dedicado. Não é homologação de players de terceiros nem de hardware representativo.
