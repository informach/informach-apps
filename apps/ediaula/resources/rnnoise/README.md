# Modelo de redução de ruído (RNNoise)

`sh.rnnn` é o modelo `somnolent-hogwash-2018-09-01` do repositório
[GregorR/rnnoise-models](https://github.com/GregorR/rnnoise-models), lido pelo filtro `arnndn` do
FFmpeg no tratamento da voz (`src/shared/voiceChain.ts`).

- Origem: `somnolent-hogwash-2018-09-01/sh.rnnn`, commit `3eee541a283fd3b8f81b85b1748e3b9ccbefa04d`
  (2 de setembro de 2018), baixado sem alteração.
- sha256: `70bb6685eb0c2a1d18e2918dca3fbfbd39317010b1802eb1b6ea73a92f3fdec0` (também em
  `SHA256SUMS`, conferido pelo teste `tests/voiceChain.test.ts`).
- Escolha: na tabela do repositório, é o modelo para sinal de fala com ruído de gravação
  (ventilador, ar-condicionado, computador), que é o caso de quem grava aula em casa.

## Licença

O repositório não traz arquivo de licença. O README dele diz, nas palavras do autor: "With the
exception of the tools/ directory and this file, none of this work is creative and thus none of it
is subject to copyright." Ou seja, os modelos são declarados sem direito autoral; só as
ferramentas de treino (`tools/`, que não usamos) e o próprio README são obras do autor. O código
que executa o modelo é o RNNoise da Xiph.Org, BSD-3-Clause, compilado dentro do FFmpeg
distribuído com o app (licenças em `native-media/`).

Texto do README do repositório, como estava no commit acima:

> # rnnoise-models
>
> This repository contains the tools and information used to create the various
> neural network models in rnnoise-nu. With the exception of the tools/ directory
> and this file, none of this work is creative and thus none of it is subject to
> copyright.
>
> Note that the name of each model is not meaningful.
