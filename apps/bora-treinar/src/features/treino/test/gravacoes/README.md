# Gravações de gente de verdade

Os testes de `../counter.test.ts` provam que a contagem acompanha o instrutor 3D, que se move sempre igual. Esta pasta guarda gravações de pessoas reais diante da câmera, para a contagem não regredir com o corpo, a câmera e o ruído de verdade.

`gravacoes.test.ts` lê todo `*.json` desta pasta, passa os quadros pelo `RepCounter` montado como no player (com `minRepMsFor` da cadência do exercício) e confere o número de repetições e parciais. Sem nenhum arquivo, o teste passa.

## Formato

```json
{
  "exerciseId": "agachamento",
  "fps": 30,
  "nota": "celular na diagonal, sala com luz de janela, 8 boas e 2 rasas",
  "frames": [
    { "t": 0, "world": [{ "x": 0.01, "y": -0.52, "z": -0.1, "visibility": 0.98 }] }
  ],
  "expected": { "reps": 8, "partials": 2 }
}
```

- `exerciseId`: id de `catalog/catalog.ts`, só exercícios de repetição.
- `fps`: taxa aproximada da gravação (informativa).
- `frames[].t`: instante do quadro em milissegundos, crescente.
- `frames[].world`: os 33 `worldLandmarks` do MediaPipe Pose, como o detector entrega: metros, centro no quadril, `y` para baixo, com `visibility`. Lista vazia é um quadro sem pessoa.
- `expected`: o que uma pessoa contou assistindo ao vídeo. Repetição que não chegou ao fundo é parcial.
- `nota` (opcional): quem, câmera, luz e o que a gravação testa.

## Cuidados

- Só pontos do corpo; nunca o vídeo nem imagem. Mesmo assim, grave só quem autorizou e não ponha nome na nota.
- Arquivos de 30 s a 30 fps passam de 1 MB: arredonde as coordenadas para 3 casas antes de salvar.
- Se uma gravação passar a falhar depois de uma mudança na contagem, a regra piorou para gente de verdade, mesmo com os testes do instrutor passando. Não ajuste `expected` para fazer o teste passar.
