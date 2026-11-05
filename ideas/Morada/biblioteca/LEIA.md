# Biblioteca de animações do Morada (jogo, 30 fps)

Um arquivo `.glb` por esqueleto. Cada um tem só o esqueleto (44 ossos, nomes do Mixamo, mais `Root`) e uma
animação por ID, com o nome do ID (`resident.walk.normal`, `resident.sit.chair.idle`, …).

## Corpos que usam a biblioteca de outro (mesmo esqueleto)

| corpo        | usa              |
|--------------|------------------|
| adulta       | adulto           |
| idosa        | idoso            |
| adolescente_f| adolescente_m    |
| crianca_f    | crianca_m        |
| pequena_f    | pequeno_m        |
| bebe_f       | bebe_m           |
| recem_m, recem_f | sem animações (só expressões do rosto) |

## Convenções

- Frente do personagem: −Y no Blender (+Z no glTF). Quadril perto da origem no primeiro quadro.
- `.rm` no fim do nome: versão com deslocamento (root motion no quadril). Sem `.rm`: no lugar.
- O osso `Root` leva a rotação de raiz de cada clipe; o `Hips` leva a posição.

## info.json

- `apoios[corpo][id]`: o que a animação espera na cena, medido no próprio corpo, em metros. `assento` e `cama` usam
  x e y do Blender; os demais usam `frente` = distância para a frente do corpo (−Y do Blender) e `topo`/`altura` em z.
  - `assento` / `cama`: altura e posição do assento ou do colchão.
  - `escada`, `corda`, `parapeito`: onde ficam a escada, a corda ou a borda.
  - `bancada`, `pia`, `mesa`: altura do tampo e distância até a frente do corpo.
  - `entre_maos` (caixa, bebê, livro, tablet) e `cabo` (vassoura, rodo, aspirador): objeto preso às mãos.
- `correcoes[corpo][id]`: ajustes feitos sobre o clipe do Mixamo (telefone, mão no corpo, antebraço, chão, cabeça do
  engatinhar, mãos nos olhos, tronco menos curvado, `dedos`).
  - `dedos`: a pegada dos dedos de cada mão que segura algo (copo, telefone, cabo, corda, controle, caixa, caneta). A
    pose dos dedos é a mesma durante o clipe; o objeto do jogo vai preso à mão (osso `LeftHandProp` ou à mão direita).

## Mãos

- A mão segue o pulso e o antebraço: quando uma animação precisa virar a palma, quem gira é o antebraço (até uns 25°,
  porque o esqueleto não tem osso de torção), não o pulso.
- Com um objeto entre as mãos (livro, tablet, caixa, caixote), as duas mãos andam juntas nas correções. Afastar uma
  só soltaria o objeto.

## Cabelos

Os corpos (`corpos/*.glb`) trazem todos os penteados e barbas do catálogo, cada um como uma malha
`<corpo>_<item>`, com o material `Cabelo` (cor livre). Veja `LEIA_cabelos.md`.

## Animações feitas por nós

O Mixamo não tem 23 delas: estão em `rotulos.json`, campo `compostas`, com uma frase sobre como cada uma foi feita.

## Gravidez (adulta, plus_f, atletica)

- Barriga: formas (morph targets) `gravidez_1`, `gravidez_2`, `gravidez_3` no corpo; peso 0 a 1 (pode passar de um
  estágio para o outro aos poucos). O esqueleto não muda.
- No 1º trimestre ela usa a biblioteca normal. No 2º e no 3º, use `<corpo>_gravida.glb`: as mesmas animações com a
  postura de grávida (costas um pouco para trás, barriga para a frente) e mãos e antebraços corrigidos contra a barriga
  do 3º trimestre. Ficam de fora: flexão, abdominal, polichinelo, pular, correr, trotar, escalar, chutar bola, danças
  agitadas, sentar no chão de pernas cruzadas e segurar bebê.
- Animações só da grávida: `resident.gravida.belly_hold` (mão na barriga), `back_hold` (mão na lombar), `sit_slow` e
  `stand_slow` (sentar e levantar devagar), `lie_side` (deitada de lado), `resident.parto.contracao_pe` e
  `resident.parto.contracao_deitada` (trabalho de parto, sem nada explícito).
- Parto no jogo: contrações → tela escurece → ela volta à biblioteca normal (gravidez 0) segurando o recém-nascido
  (`resident.care.hold_idle` / `care.rock`: mão esquerda sob a cabecinha, direita sob o corpinho).

## Roupas

Os corpos (`corpos/*.glb`) trazem as 65 roupas e acessórios dos pacotes, cada um como uma malha `<corpo>_<id>` com o id
nos extras do nó (`roupa`, `slot`). Mostre uma peça por slot. Nas grávidas, as peças têm as formas `gravidez_1` a
`gravidez_3`: use o mesmo peso do corpo. Veja `LEIA_roupas.md`.

