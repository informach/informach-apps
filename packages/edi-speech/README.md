# @informach/edi-speech

Transcrição local (whisper.cpp) e alinhamento de roteiro em português das ferramentas Edi. Saiu do
EdiAula em 08/11/2026 para o EdiSVG também usar (pipelines de motion). O EdiAula reexporta tudo
pelos caminhos antigos (`src/main/whisper.ts`, `src/shared/scriptAlign.ts` e afins), sem mudança de
comportamento.

- `./node/whisper`: `createWhisper(host)` instala e confere o motor e os modelos, escolhe o modelo
  e transcreve uma mídia em palavras com tempo. O app informa a pasta, o FFmpeg, o executor do
  FFmpeg, a pasta de cache por arquivo, se há GPU NVIDIA e o agendador de processos.
- `./node/download`, `./node/installCheck`, `./node/whisperAssets`, `./node/whisperManifest`:
  downloads conferidos por SHA-256 e a troca segura de pastas instaladas.
- `./whisperArgs`, `./whisperParse`: os argumentos do `whisper-cli` e a leitura do resultado
  (detecção de voz, filtro de alucinação, buracos ouvidos de novo).
- `./ptSpeech`, `./glossary`, `./lexicon`, `./script`, `./scriptAlign`, `./words`: o português
  falado, o glossário, o roteiro em Markdown e o alinhamento de um trecho do roteiro com as
  palavras ditas.

Os arquivos movidos receberam só asserções `!` para compilar com `noUncheckedIndexedAccess` (a
configuração base do monorepo, usada pelo EdiSVG); o JavaScript gerado é o mesmo. Os testes
continuam no EdiAula (`apps/ediaula/tests`). Os scripts `build-pt-lexicon.mjs` e
`build-whisper-manifest.mjs` do EdiAula escrevem aqui.
