# Cenas de exemplo

## Família reunida (`familia.png`, `familia.blend`)

Uma foto de família montada só com o que a biblioteca tem, com uma imagem de vitrine como norte: doze pessoas e o
labrador, num fundo azul-noite sem horizonte. Gerada por `codigo/arte/cena_familia.py`.

| quem | corpo | roupa (catálogo, com cor livre) | cabelo e pelos | pose |
|---|---|---|---|---|
| pai magro | alto_magro | touca, regata justa, bermuda, chinelo laranja | bigode | parado; a mão esquerda no ombro da moça |
| moça | adolescente_f | camiseta justa roxa, calça jeans, tênis cinza | liso no meio (comprido) | parado; a mão direita na mão dele |
| barbudo | plus_m | camisa polo laranja, calça social preta, sapato | curto, barba cheia | parado |
| rapaz | adolescente_m | boné vermelho, jaqueta de agasalho, jeans, tênis | topete loiro (para chapéu) | parado |
| mãe | adulta | vestido justo verde, corrente, tênis | franja de lado (comprido) | parado |
| pai | adulto (pele morena) | boné cinza, camisa social clara, calça social preta, tênis | curto, barba cheia | parado; a menina no braço esquerdo |
| menina no colo | pequena_f | camiseta rosa, calça de moletom amarela, tênis rosa | maria-chiquinha | sentada no antebraço dele, abanando, a outra mão no ombro dele |
| avô | idoso | camisa social de manga curta roxa, calça marrom, sapato, **guia retrátil** | branco, bigode de pontas | parado, um pouco inclinado; a mão direita na cabeça do cachorro |
| avó | idosa | moletom verde-água, cachecol rosa, jeans, tênis rosa | grisalho | parada; de braço dado com o avô, a mão no ombro dele |
| menino | crianca_m | **boné com hélice**, jaqueta de agasalho listrada verde, calça de moletom, tênis roxo | curto (para chapéu) | parado; a mão no peito |
| vovó | plus_f | vestido de gola branca verde-água, legging, tênis verde | coque branco | ajoelhada (pedido); segura a menina |
| menina | crianca_f | camisa polo azul-clara, short amarelo, tênis | chanel de lado | sentada no joelho da vovó |
| cachorro | labrador (bichos) | coleira azul | — | parado; a guia vai da guia retrátil até a coleira |

Expressão "confiante" nos adultos (olhos abertos e sorriso) e "feliz" em duas crianças.

### Como a cena é montada

- **Corpos e peças**: o arquivo-mestre (`blend/corpos.blend`) abre; ficam só os corpos da foto. Cada peça é encaixada
  com `roupas.veste` e os cabelos com `cabelos.encaixa` (os do pacote já estão no mestre), como no `veste.py`. A cor livre
  usa as máscaras de `roupas_mascaras/` (a mesma conta da página); cabelo, barba e bigode ganham uma cor lisa.
- **Pesos da pele**: cada peça passa a usar os pesos da pele logo embaixo dela (transferência de pesos, face mais perto,
  em descanso). Com os pesos que vêm da malha do pacote, o cós descola e abre em funil quando a coluna dobra.
- **Pele coberta**: como na página, a pele embaixo da roupa não é desenhada (modificador de máscara). Em descanso, cada
  vértice procura uma peça pela normal (até 3,5 cm); a pele fica onde a peça está a menos de 7 cm da borda aberta dela
  (barra, cós, gola), senão o avesso aparece por cima.
- **Poses**: um quadro de uma animação da biblioteca (`biblioteca/corrigido_todos/<fonte>.blend`) congelado no esqueleto
  (parado, sentado, ajoelhado). Os gestos são IK de dois ossos no braço (mão no ombro, no peito, na cabeça do cachorro,
  criança no braço), mais o giro da mão (dedos e palma) e os dedos dobrados. A menina do colo e a do joelho são postas
  pelo quadril no antebraço do pai e na coxa levantada da vovó.
- **Cachorro e guia**: o labrador vem do `bichos.blend` (gerado por `bichos.py`), parado num quadro de "parado". A guia é
  uma curva da saída da caixa da guia retrátil até a coleira, um pouco caída.
- **Fundo e luz**: chão que sobe em curva atrás (ciclorama), três luzes de área, câmera de 58 mm à altura do peito.

### Gerar de novo

```bash
blender-venv/bin/python -I codigo/arte/cena_familia.py -- blend/corpos.blend familia.png familia.blend
```

O `familia.blend` guardado aqui passou por `codigo/ferramentas/limpa_cena.py` (as poses ficam congeladas nos ossos, as
animações e as malhas escondidas saem: 9 MB em vez de 400 MB). As texturas dos pacotes ficam fora do repositório (em
`ideias/`, nos zips): ao abrir em outra máquina, aponte as imagens para lá (Arquivo → Dados externos → Procurar arquivos
faltando).

Variáveis: `RES=1600x900` muda o tamanho, `--rapido` faz uma prévia (16 amostras), `CLOSE=pai,menino` grava closes de
meio corpo para revisão, `SEMPOSE=1` deixa todos em descanso (para comparar o encaixe das peças).

### Limites

- As pessoas não se encostam de verdade: as mãos chegam ao lugar por IK, sem colisão (a mão pode afundar um pouco no
  ombro ou no braço do outro).
- A menina do colo e a do joelho usam a pose de sentada na cadeira; as pernas não abraçam o braço nem a coxa.
- A guia é uma curva fixa (não é física).
