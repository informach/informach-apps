# @informach/edi-ocr

OCR local da suíte Edi, com Tesseract (`tesseract.js` e `tesseract.js-core` 7.0.0) e modelos `tessdata_fast` em português, inglês e espanhol. Extraído do EdiPDF na etapa E3 da [base comum](../../docs/propostas/edi-suite-2026-10-16/edicaptura-lotes/base-comum.md). Nada é baixado nem enviado durante o reconhecimento: worker, núcleos WebAssembly e modelos vão dentro do instalador de cada app.

Consumido como TypeScript, sem build. Consumidores: EdiPDF. O EdiCaptura entra na etapa E4.

## Subpaths

| Export | Onde roda | Conteúdo |
| --- | --- | --- |
| `.` | qualquer lugar (sem DOM, sem Node) | schema do resultado, limites, estados, `ocrScore`, `ocrInclination`, `ocrPoint` e o tiling puro (`planOcrTiles`, `mergeOcrTiles`, `recognizeOcrTiles`) |
| `./worker` | module worker do renderer | `serveOcrWorker(options)`: recebe uma imagem, roda o Tesseract e devolve o resultado |
| `./canvas` | renderer (DOM) | `recognizeImage`, `prepareOcrImage`, `canvasPng`, `recognizeOcrCanvas` (quatro orientações e inclinação) e `recognizeTiledCanvas` (imagens grandes) |
| `./search` | qualquer lugar | `findTextMatches` sobre unidades `{ text, box }`, `plainText` e `ocrTextUnits` (palavras OCR como unidades pesquisáveis) |
| `./sensitive` | qualquer lugar | `findSensitiveData`: detecção assistida de e-mail, telefone, CPF, CNPJ e credenciais |
| `./assets` | Node, no build | `copyOcrAssets`, `verifyOcrAssets`, `verifiedOcrModels`, `ocrLicenseFiles` |

O root é neutro de propósito: o main do EdiPDF valida tarefas com `ocrResultSchema`. Por isso o app inclui o package em `ediBuildOptions({ bundledPackages: ["@informach/edi-ocr"] })`.

## Resultado

`OcrResult` tem `width`, `height`, `confidence` (0–100), `inclination` opcional (graus) e `words`. Cada palavra tem `text`, `confidence`, caixa `x0/y0/x1/y1` em pixels da imagem reconhecida (x1/y1 exclusivos) e `line`. A confiança é a que o Tesseract informa; o package não inventa outra.

`ocrResultSchema` usa os limites de uma chamada. `createOcrResultSchema(limites)` cria o schema para resultados maiores, como o de uma imagem dividida em blocos.

Estados: `ocrOutcome(result)` devolve `text` ou `empty` (o motor rodou e não achou texto). Falhas de disponibilidade viram `OcrUnavailableError` com `reason`: `language`, `assets` (worker, núcleo ou modelo não carregou), `engine` (o worker não iniciou) ou `limits`. `ocrUnavailableOutcome(error)` converte esse erro em `{ status: "unavailable" }` e relança qualquer outro, inclusive o cancelamento (`AbortError`). Assim "indisponível" nunca se confunde com "sem texto".

## Limites

| Limite | Valor | Onde |
| --- | --- | --- |
| Lado por chamada | 8192 px | `OCR_LIMITS.maxSide` |
| Área por chamada | 24 MP | `OCR_LIMITS.maxPixels` |
| Imagem codificada | 96 MB | `OCR_LIMITS.maxImageBytes` |
| Palavras por resultado | 100 000 | `OCR_LIMITS.maxWords` |
| Idiomas por chamada | 3 | `OCR_LIMITS.maxLanguages` |
| Inclinação | ±10° | `OCR_LIMITS.maxInclination` |
| Origem com blocos | 32 767 px por lado, 268 MP | `OCR_TILED_LIMITS` (limites do canvas do Chromium) |
| Blocos por imagem | 256 | `OCR_MAX_TILES` |

Os limites entram por parâmetro: `serveOcrWorker({ limits })` no worker e `OcrHost.limits` no renderer. Os dois lados precisam usar os mesmos valores.

## Imagens grandes (blocos)

Capturas com rolagem chegam a 30 000 px. `planOcrTiles(largura, altura)` divide a imagem em blocos que cabem no limite por chamada, com sobreposição (256 px por padrão). Prefere faixas na largura inteira e passa a blocos quadrados quando as faixas ficariam baixas demais. Cada bloco tem um `core`: os cores dividem a imagem exatamente, cortando cada sobreposição ao meio.

`recognizeTiledCanvas` roda um bloco por vez, com cancelamento entre blocos e um único motor ativo. `mergeOcrTiles` leva as caixas para coordenadas da imagem original, mantém cada palavra só no bloco cujo core contém o centro dela e, se duas palavras de blocos diferentes ainda se cobrirem (60% da menor), fica com a mais confiável. Uma palavra cortada na borda de um bloco aparece inteira no vizinho, desde que caiba na sobreposição.

Limitações: não há busca de orientação nem correção de inclinação por blocos (use `recognizeOcrCanvas` para páginas digitalizadas que caibam em uma chamada). Uma linha cortada por uma divisão vertical vira duas linhas.

O mapeamento das caixas até o raster final (recorte, escala e rotação da cena, pixels da máscara) é do app.

## Busca

`findTextMatches(unidades, consulta, opções)` normaliza acentos, caixa e espaços e devolve, para cada ocorrência, as caixas das unidades tocadas. Serve para glifos de PDF (`{ text, box: { x, y, w, h } }`) e para palavras OCR via `ocrTextUnits(words)`, que intercala espaços e quebras de linha sem caixa.

## Dados sensíveis

`findSensitiveData(words, { kinds })` procura, linha a linha:

- e-mail;
- telefone brasileiro: DDD válido, celular com 9 na frente ou fixo de 2 a 5, com `+55` opcional. Sem DDD, só com hífen e confiança média;
- CPF e CNPJ com dígitos verificadores, incluindo o CNPJ alfanumérico;
- credenciais: valores depois de `senha:`, `password=`, `token:`, `api key:` e parecidos, formatos conhecidos de chaves (`sk-`, `ghp_`, `AKIA`, `AIza`, `xox?-`, JWT) e sequências longas e aleatórias com maiúsculas, minúsculas e dígitos.

Cada resultado traz `kind`, `text`, `line`, índices e caixas das palavras, `bounds`, `confidence` (`high` quando dígito verificador ou formato confirma) e `reason`. Quando o valor é só parte de uma palavra, a caixa é a palavra inteira. É heurística: pode errar para os dois lados. Não aplica nada sozinha; o app mostra as sugestões para revisão.

## Como um app inclui o OCR

1. Dependência `"@informach/edi-ocr": "workspace:*"`.
2. No build (postinstall ou script de cópia), `copyOcrAssets(<renderer>/public/ocr)` copia `worker.min.js`, `core/`, os modelos conferidos por SHA-256, `licenses/` e `sources.json`. O diretório é gerado; fica fora do Git e do lint. O EdiPDF faz isso em `apps/edipdf/scripts/copy-pdfjs.mjs`.
3. Um arquivo de worker do próprio app: `serveOcrWorker()`. No renderer, um `OcrHost` com `createWorker: () => new Worker(new URL("./ocr-worker.ts", import.meta.url), { type: "module" })`. O Vite do app emite o worker.
4. CSP do renderer com `wasm-unsafe-eval` e `worker-src` para o worker e o núcleo.
5. Catálogo: `ocr: true` na ferramenta em `packages/config/src/edi-tools.ts`. Com isso `hasOcr(id)` faz o instalador conferir `out/renderer/ocr` com `verifyOcrAssets` antes de empacotar e os avisos de terceiros incluírem as licenças do núcleo e dos modelos.

Para levar menos idiomas, `copyOcrAssets(destino, { languages: ["por"] })`. Novo idioma exige o modelo em `resources/models`, a entrada com SHA-256 em `resources/sources.json` e o idioma em `OCR_LANGUAGES`.

## Recursos e licenças

- `resources/models/{por,eng,spa}.traineddata`: `tessdata_fast` no commit `87416418…`, sem alteração. Origem e SHA-256 em `resources/sources.json`. Licença Apache 2.0 (`Tessdata-Fast-Apache-2.0.txt`).
- `resources/licenses/`: Tesseract, tesseract.js, tesseract.js-core e as bibliotecas compiladas no WebAssembly (Leptonica, libjpeg, libpng, libtiff, libwebp, giflib, zlib, openlibm). As origens dos textos estão em `resources/third-party-sources.json`.
- `TR46-MIT.txt`: `tr46@0.0.3` (via tesseract.js → node-fetch → whatwg-url) declara MIT sem distribuir o texto. O autor forneceu o aviso na issue #4 do repositório; `scripts/edi/third-party-notices.mts` usa este arquivo só para essa versão e licença, nos apps com `ocr`.

## Testes

`pnpm --filter @informach/edi-ocr test` (Vitest): geometria e schema, planejamento e deduplicação de blocos, busca, dados sensíveis (incluindo dígitos inválidos), cópia e verificação dos recursos e OCR real offline dos três modelos sobre `tests/fixtures/{por,eng,spa}.png`. Essas imagens são uma linha de texto em Noto Sans 56 px sobre fundo branco, geradas uma vez com `@napi-rs/canvas`.

Os testes de composição ficam nos apps: camada de texto do PDF em `apps/edipdf/tests/ocr.test.ts` e a jornada nativa em `pnpm edi:test:native edipdf`.
