# Modelo de remoção de fundo da câmera (segmentação de pessoa)

`selfie_segmenter.tflite` é o modelo de segmentação de pessoa (Selfie Segmentation, versão
quadrada de 256 × 256) do Google MediaPipe. O EdiAula o usa em "Remover fundo com IA local", no
painel da câmera: o worker do editor (`src/renderer/src/lib/personKeyWorker.ts`) roda o modelo com
o `@mediapipe/tasks-vision` (Apache 2.0, versão exata no `package.json`), quadro a quadro, no
próprio computador.

- Origem:
  `https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite`,
  baixado em 18 de outubro de 2026, sem alteração.
- sha256: `191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b` (também em
  `SHA256SUMS`, conferido pelo teste `tests/personKey.test.ts`).
- Model card: "Model Card MediaPipe Selfie Segmentation"
  (`https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Selfie%20Segmentation.pdf`),
  de Tingbo Hou, Siargey Pisarchyk e Karthik Raveendran (Google), 6 de maio de 2021. Entrada de
  256 × 256 (ou 144 × 256), saída com a máscara da pessoa entre 0 e 1. Na seção "Licensed under":
  Apache License, Version 2.0.

## Licença

Apache License 2.0, texto completo em `LICENSE`, ao lado deste arquivo. O mesmo texto vale para o
`@mediapipe/tasks-vision`, que declara Apache-2.0 no `package.json` e não traz arquivo de licença
próprio.

Autoria do modelo: Google (segundo o model card).
