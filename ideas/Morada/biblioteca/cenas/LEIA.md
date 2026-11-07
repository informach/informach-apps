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
| menina no colo | pequena_f | camiseta rosa, calça de moletom amarela, tênis rosa | maria-chiquinha | sentada no antebraço dele, abanando, a outra mão no peito dele |
| avô | idoso | camisa social de manga curta roxa, calça marrom, sapato, **guia retrátil** | branco, bigode de pontas | parado, um pouco inclinado; a mão direita na cabeça do cachorro |
| avó | idosa | moletom verde-água, cachecol rosa, jeans, tênis rosa | grisalho | parada; a mão direita pousada no ombro dele |
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
- **Blusas**: além dos pesos da pele, a parte de cima perde os pesos das pernas (vão para o quadril) e os últimos 14 cm
  misturam os pesos com a volta inteira: a barra segue o quadril, anda inteira e não abre em leque nem cai em aba atrás.
- **Saias e vestidos**: a parte de saia guarda os pesos de pano do encaixe (quadril e as duas coxas misturadas pela
  posição em volta do corpo); a transferência da pele não mexe neles. Em quem está sentado, ajoelhado ou deitado
  (a vovó), a saia segue a pele como o resto da peça: com a coxa levantada, o pano de meio a meio ficava para trás.
- **Folga**: depois dos pesos, as peças de cima, de baixo e inteiras ganham 2,5 mm a mais pela normal (4 mm as de por
  cima), para a pele não atravessar onde o corpo dobra.
- **Cabelo e chapéu**: do centro da cabeça, cada ponto do cabelo que passaria da copa volta para dentro dela (o raio até
  ele cruza o chapéu antes). Logo abaixo da borda, os pontos entram aos poucos (até 14° abaixo) e a volta em volta dos
  que entraram é alisada: o cabelo não vaza pelo alto nem por trás do boné, e a linha embaixo da borda sai lisa.
- **Pele coberta**: como na página, a pele embaixo da roupa não é desenhada (modificador de máscara). Em descanso, cada
  vértice procura uma peça pela normal (até 3,5 cm); a pele fica onde a peça está a menos de 2,5 cm da borda aberta
  dela (barra, cós, gola), senão o avesso aparece por cima.
- **Poses**: um quadro de uma animação da biblioteca (`biblioteca/corrigido_todos/<fonte>.blend`) congelado no esqueleto
  (parado, sentado, ajoelhado). O giro da palma é dividido: o antebraço gira em volta do próprio eixo 70% do que falta e
  a mão faz o resto (o punho sozinho torceria). Os gestos são IK de dois ossos no braço (mão no ombro, no peito, na cabeça do cachorro,
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

## Praça da cidade (`cidade.png`, `cidade.blend`)

Uma praça vista de cima com 29 pessoas fazendo coisas do dia a dia, com uma imagem de vitrine como norte. Gerada por
`codigo/arte/cena_cidade.py`, que reusa as funções da cena da família (`cena_familia.py`: peças, cor livre, pesos da
pele, pele coberta, cabelo dentro do chapéu, poses e IK).

- **Quem e o quê** (animação da biblioteca, um quadro): acenando, andando (normal, feliz, de idoso), apontando, ao
  telefone, mexendo no celular, selfie, café, sorvete, comemorando, deitado, sentado no chão, dois largados no banco,
  empurrando um carrinho de bebê, de bengala, puxando mala, com bolsa, pasta e sacola. Corpos: os do mestre, vários
  repetidos (a cena copia esqueleto, corpo, rostos, cabelos e pelos do corpo com o nome `<corpo>__<n>`). Peças só do
  catálogo, com cor livre, inclusive quepe de capitão, touca de gatinho, chapéu balde, fedora, palheta, chapéu de praia,
  camisas de caveira, oncinha e havaiana, colete social e acolchoado, suspensório e óculos.
- **Objetos de mão como na página**: a pose de segurar do catálogo (`pose` do item: alvo do braço em comprimentos de
  braço e eixos da mão) vale também no Blender (`segura`), por cima da animação; a selfie usa uma pose própria (braço
  para cima e para a frente, tela para o rosto). Objeto mais comprido que a altura da mão (bengala, mala de rodinhas)
  encolhe em volta da mão até encostar no chão (`ponta_no_chao`).
- **Feitos para a cena**: banco de praça (ripas de madeira e pés de ferro, assento a 45 cm; quem senta é posto pelo
  quadril, com o fundo das nádegas no assento) e carrinho de bebê (cesto rosa com borda verde-água, capota, armação e
  rodas), com a alça nas duas mãos de quem empurra (IK, andando).
- **Câmera e luz**: 47 mm, a uns 29° de cima e perto o bastante para a multidão encher o quadro (como na imagem-norte),
  três luzes de área, fundo e chão azul-noite (#1B1D2B / #1D1F2D).
- **Acabamento (segunda versão)**: as peças passaram pela revisão da biblioteca (barra reta, saias de pano, faixa,
  quepe e chapéu balde refeitos); quem olha o celular levanta um pouco a cabeça (`cabeca_sobe`, para o chapéu não
  esconder o rosto de cima); o deitado se apoia mais nos braços (58°); o capitão fica parado. Terceira versão: o capitão e o homem de terno levantam a cabeça (`cabeca_sobe`), a barba dele
  ficou castanha (a preta, de cima, escondia o rosto), a aba da fedora e a pala dos quepes encolheram, e as blusas têm o
  decote novo (sem ombro aberto).

```bash
blender-venv/bin/python -I codigo/arte/cena_cidade.py -- blend/corpos.blend cidade.png cidade.blend
```

Mesmas variáveis da cena da família (`RES`, `--rapido`, `CLOSE=selfie,carrinho`); `DIAG=1` lista onde ficou cada
objeto de mão. O `cidade.blend` guardado também passou por `limpa_cena.py`.

Limites: cada pessoa está num quadro só da animação (a cena não anda); quem anda tem o pé parado no meio do passo; a
mala e a bengala encolhem um pouco para caber na mão de quem segura.
