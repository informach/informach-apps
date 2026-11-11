# @informach/edi-link

O vínculo entre as ferramentas Edi, como o Premiere vincula uma composição do After Effects: um
clipe de uma aula do EdiAula é uma animação do EdiSVG, "Editar no EdiSVG" abre aquela animação, e
salvar no EdiSVG atualiza o clipe na aula. Cada ferramenta continua inteira sozinha.

Tudo vai por arquivo, nunca por um processo chamando o outro:
- **Pedidos para uma ferramenta:**
  - ficam em `%APPDATA%\<ferramenta>\pedidos\<id>.json`, gravados inteiros;
  - a ferramenta lê ao abrir, vigia a pasta enquanto aberta e apaga cada pedido ao atendê-lo;
  - tipos para o EdiSVG: `create` (prancheta e animação novas no projeto da aula, do tamanho e
    da duração do trecho, com a aula para os pipelines), `link` (uma animação que já existe) e
    `open` (abrir para editar).
- **Renders das animações vinculadas:**
  - ficam na pasta `<projeto> · renders`, ao lado do `.edisvg`;
  - cada uma é um WebM com transparência, `<animação>-<hash>.webm`;
  - `vinculos.json` é gravado por último e lista cada animação vinculada, o render atual dela e,
    quando um pipeline a pôs nas palavras da aula, o segundo da aula em que começa.

Exports:
- `./contract`: os esquemas (zod), sem disco. Os dois apps validam com eles: `linkRequestSchema`,
  `rendersManifestSchema`, `assetLinkSchema` (o vínculo guardado no asset do EdiAula) e
  `edisvgSummarySchema` (as animações de um `.edisvg`, para escolher uma sem conhecer o formato).
- `./node`: onde ficam os pedidos e os renders, e a leitura e escrita deles:
  - `requestsDir`, `rendersDir` e `renderPath` (nunca fora da pasta);
  - `writeRequest`, `readRequests` e `removeRequest`;
  - `readManifest` e `writeManifest`.
- `./launch`: abrir outra ferramenta:
  - o executável instalado pelo Hub, ou, no desenvolvimento, `scripts/edi/hub-dev/abrir.ps1`, que
    roda `pnpm edi:work <ferramenta>` e sai na hora se ela já está aberta;
  - só a partir do perfil real (`canOpenTool`);
  - com o ambiente limpo (`launchEnvironment`).

Quem usa: EdiAula (`src/main/edisvgLink.ts`, `src/shared/linkedMedia.ts`,
`src/renderer/src/lib/edisvgLink.ts`) e EdiSVG (`src/main/linkRequests.ts`,
`src/main/linkRender.ts`, `src/renderer/src/links/renderLinks.ts`). Testes em `tests/link.test.ts`
(`pnpm --filter @informach/edi-link test`).
