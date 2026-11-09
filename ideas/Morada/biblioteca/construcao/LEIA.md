# Construção: chão, paredes e texturas

Primeira parte da biblioteca de móveis e ambientes. As peças e as texturas foram feitas aqui, tendo como norte as
imagens da vitrine de pisos, paredes e cômodos modulares (não são cópias). Também entram as texturas e os encaixes dos
pacotes gratuitos (marcados `pacote`: **uso interno, não distribuir**).

Página: `paginas/construcao/construcao.html`. É um visor 3D com dois cômodos de exemplo e as peças avulsas. Nele se
escolhe uma superfície (o chão ou cada lado das paredes) e a textura ou a cor dela.

## Medidas

| | |
|---|---|
| Grade | 0,5 m |
| Chão | placa de 4 × 4 m, 4 cm de espessura, topo em z = 0 |
| Parede | 3 m de altura, 15 cm de espessura, centrada na linha da grade |
| Mureta | 1 m de altura |
| Porta | 0,90 × 2,10 m; porta dupla 1,60 × 2,10 m; passagem 1,20 × 2,30 m |
| Arco | 1,20 m de vão e 2,40 m no alto; arco largo 2,40 × 2,60 m |
| Janela padrão | 1,20 × 1,10 m, peitoril a 0,90 m |
| Lambri | 0,85 m de altura, 2,5 cm de espessura |

## Peças (`pecas/<id>.glb` e `construcao.json`)

- **Chão** (1): `chao_4m`. O material `piso` aceita qualquer textura de piso.
- **Paredes** (20):
  - lisas: 4, 2 e 1 m;
  - insertos estreitos: 0,5 m e painel de ajuste de 0,25 m;
  - muretas: 2 e 1 m;
  - portas: porta 2 m, porta no canto 2 m, porta 1 m e porta dupla 2 m;
  - passagem: 2 m;
  - arcos: 2 m e arco largo 4 m;
  - janelas: 2 m, larga 2 m, em arco 2 m, quadrada 1 m e duas janelas em 4 m;
  - a cantoneira de canto (`pilar`).
- **Lambri** (4): 0,5, 1, 2 e 4 m. É o painel branco de ripas com rodapé e friso, que vai na parte de baixo da parede de
  dentro.
- **Encaixes dos pacotes** (4): porta em arco e janelas em arco, quadrada e redonda do pacote de Natal. Cada um vai no
  vão da peça indicada em `vao`, já escalado para o tamanho dele.

Cada parede tem três materiais:

- `face_a`: o lado de dentro (+y antes de girar);
- `face_b`: o lado de fora (−y);
- `borda`: o alto e o recorte dos vãos, em branco.

A origem é a ponta esquerda, no chão, no meio da espessura, e a peça vai de x = 0 a x = comprimento. O UV é em metros:
uma textura de parede cobre 3 × 3 m (a parede inteira, sem espelhar do lado de fora), e uma de piso cobre 2 × 2 m. Por
isso qualquer textura serve em qualquer peça.

As pontas de cada peça (onde ela encosta na vizinha) têm o material e o UV da face do mesmo lado. Assim, a fresta de um
pixel que sobra na emenda mostra a mesma cor da face. Antes aparecia uma linha clara pontilhada em cada emenda.

## Portas e janelas (`portas_janelas.json`, `codigo/arte/portas_janelas.py`)

Feitas aqui com as imagens da vitrine de portas e janelas como norte. Todas vêm em três cores, branca, preta e madeira.
O material `cor` aceita qualquer cor, e a página tem cor livre para ele. Os outros materiais são `vidro` (azul
brilhante), `metal` (maçanetas) e `friso` (os frisos escuros das portas modernas). A origem de cada peça é o meio do
vão, no chão, no plano do meio da parede. Cada uma diz em que vão encaixa (`vao`: a peça de parede e o índice do vão).

**Janelas (38):** 12 desenhos em 3 cores, mais o óculo redondo em branco e preto.

| desenho | vão | parede |
|---|---|---|
| larga inteira, grade 6 × 2, grade 3 × 2, com bandeira | 1,60 × 0,80 a 1,10 m | `janela_larga_2m` |
| em arco de duas folhas, inteira, 2 × 3, 2 × 5 | 0,80 × 1,20 a 1,00 m | `janela_arco_2m` |
| quadrada inteira, com bandeira, em cruz, de duas folhas | 1,20 × 1,10 a 0,90 m | `janela_2m` |
| óculo | 0,60 × 0,60 a 1,20 m | `janela_quadrada_1m` |

Cada janela é uma moldura funda (passa 3 cm de cada face da parede e 3,5 cm da borda do vão, cobrindo o recorte). Ela
tem um batente fino no meio, o vidro recuado e travessas com bisel. No arco, as travessas acompanham a curva.

**Portas e acabamentos (57):**

- **Portas (30):** 10 desenhos em 3 cores, numa folha de 0,86 × 2,07 m e 4,2 cm de espessura, com maçaneta de
  alavanca, roseta e espelho de chave dos dois lados:
  - clássicas: com 6 vidros e almofada, de 2, de 4 e de 5 almofadas (almofadas rebaixadas com o miolo chanfrado);
  - de vidro: vidro inteiro e 10 vidros;
  - modernas: lisa com frisos horizontais, com visores de vidro e lisa com faixa escura e frisos curtos;
  - em arco: vidro com grade em cima e almofadas embaixo, para o `arco_2m`.
- **Portas duplas (9):** com vidros, clássica e de vidro, em 3 cores, para a `porta_dupla_2m`.
- **Batentes (9):** simples, duplo e em arco, em 3 cores. O forro cobre a espessura da parede, e a guarnição de 7 cm
  com 1,5 cm de saliência emoldura o vão nas duas faces. Cada porta indica o batente que leva (`batente`).
- **Lambris coloridos (6):** 1 m e 0,5 m, em 3 cores.
- **Cantoneiras de lambri (3):** em 3 cores, para o canto de fora.

Também ficam disponíveis os encaixes do pacote de Natal: porta em arco e janelas em arco, quadrada e redonda.

Os cômodos de exemplo já usam as peças novas, e as portas levam o batente. `portas_janelas_cena.py` faz as folhas
`janelas.png` e `portas.png` (com `CLOSE=1`, também um close para conferir o acabamento).

## Miniaturas (`miniaturas/<id>.webp`)

Todo item da biblioteca tem miniatura, sem exceção. São 124 hoje: o chão, as paredes, os lambris, os encaixes, as
janelas, as portas, os batentes e as cantoneiras. Cada uma mostra a peça sozinha, de três quartos, em fundo
transparente, com 192 px. As paredes aparecem com o degradê azul e o chão com o pínus. A página mostra a miniatura em
cada botão da lista.

`codigo/ferramentas/miniaturas_construcao.py` renderiza todas. O empacotador para com erro se faltar a miniatura de
algum item.

## Texturas (`texturas/<id>.png`, 1024 px, sem emenda)

São 46 no total. As 18 de piso e as 24 de parede têm os mesmos grupos da vitrine:

- **Piso, madeira** (6): nogueira, rosada, pínus, acinzentada, mel e clara. Tábuas desencontradas, com um tom por tábua,
  veio, ponta mais escura e junta.
- **Piso, cerâmica** (12):
  - mosaicos: cinza, cinza e branco, grafite e pastilha de piscina;
  - xadrez: laranja, preto e branco, cinza, azul e verde;
  - octógonos: laranja e octógonos com ponto (grafite e branco).
- **Parede, degradê** (6): mostarda, gelo, vermelho, roxo, verde e azul. A cor escurece para baixo na altura da parede.
- **Parede, papel** (6): confete, nuvens, estrelas e as frutas melão, laranja e melancia. As frutas têm a faixa da casca
  embaixo, na altura da parede.
- **Parede, tijolo** (6): grafite, marrom, branco, terracota, vermelho e rústico.
- **Parede, listras** (6): laranja, azul fina, turquesa, cinza, celeste e verde.
- **Dos pacotes** (4): carpete (Cassino), piso de pedra (Cidade), tábuas escuras (Xadrez, a partir do veio da madeira
  dele) e biscoito (Natal).

Qualquer superfície também aceita uma cor lisa. As folhas `folha_piso.png` e `folha_parede.png` mostram cada textura
repetida 2 × 2, para conferir a emenda.

## Montar um cômodo (`codigo/arte/construcao_cena.py`)

A planta é uma lista de trechos. Cada trecho tem:

- o ponto inicial;
- a direção (L, N, O ou S);
- as peças em sequência, com um encaixe opcional em cada uma;
- a textura de dentro e a de fora;
- se leva lambri.

Percorrendo o contorno no sentido anti-horário (visto de cima), o lado de dentro fica à esquerda.

A cantoneira entra só nos cantos e nas pontas soltas. Onde a parede segue reta não entra cantoneira, mesmo quando uma
divisória chega nesse ponto.

O lambri:

- acompanha as peças sem porta;
- nas peças com porta, entra em pedaços de 0,5 m dos lados do vão, onde couber.

A página monta as mesmas plantas com a mesma regra (`plantas.json`).

## Gerar de novo

```bash
python3 -I codigo/arte/construcao_texturas.py <saida>/texturas
```

```bash
blender-venv/bin/python -I codigo/arte/construcao.py -- <saida>
```

```bash
blender-venv/bin/python -I codigo/arte/construcao_cena.py -- <saida> <saida>/render todos
```

```bash
blender-venv/bin/python -I codigo/ferramentas/miniaturas_construcao.py -- <saida> <saida>/mini_png
```

```bash
python3 -I codigo/ferramentas/construcao_pacote.py <SP>
```

Depois das peças, rode `blender-venv/bin/python -I codigo/arte/portas_janelas.py -- <saida>` para as portas e
janelas (`portas_janelas.blend` e `.json`).

A primeira gera as texturas, a segunda as peças, os GLB, o `construcao.blend` e o `construcao.json`, a terceira os
renders da vitrine (`comodos.png` e `pecas.png`), a quarta as miniaturas (PNG de 256 px, que viram `miniaturas/<id>.webp` de 192 px) e a quinta empacota para a página. A variável `AMOSTRAS=16` faz uma
prévia rápida dos renders.

## Casa inteira: telhados, segundo andar, fundação, cercas, quintal e lote (9 nov 2026)

264 peças novas (geradas por `codigo/arte/construcao_casa.py`; receitas de casas em `codigo/arte/construcao_casas.py`),
todas com miniatura e colisão; escadas, rampas e degraus têm malha de colisão. Interativos usam as mesmas chaves dos
móveis (`porta`, `correr`). A mais pesada tem cerca de 4,6 mil triângulos. Exemplos: `casas_encaixe.png` e `lote.png`.

- **Telhados (143):** duas águas, quatro águas, L, T, meia-água e mansarda, para vãos de 4, 6 e 8 m (meia-água 2, 4 e
  6 m) em 3 inclinações (i25, i50, i75): corpos de 1 m e 0,5 m, empenas, oitões, pontas, cantos, beirais (externo e
  interno), cumeeira, rufos e paredes de complemento. 7 telhas novas (cerâmica, cerâmica vermelha, ardósia, ardósia em
  escamas, metálica vermelha, azul e cinza) e o waffle do pacote de Natal.
- **Segundo andar (31):** lajes 4×4, 4×2 e 2×2, lajes com abertura para escada reta, L, U e caracol (`escada_em` diz
  onde fica a escada), cintas, escadas com corrimão e guarda-corpos de vidro, metal e madeira.
- **Fundação e acesso (44):** soco de 0,30, 0,45 e 0,60 m, degraus, rampa de 7,5 %, patamar, deck, colunas, vigas,
  sacadas, alpendres e luzes externas.
- **Cercas (27):** madeira, ripada, metal, mureta com grade e muro, com canto e fim; portões de pedestre, basculante e de
  correr; cerca de doce do pacote de Natal (`_pacote`).
- **Quintal (14):** piscina em células de 1 m (miolo, borda, borda com luz, canto, degraus, prainha), escadinha,
  trampolim, garagens abertas 3×6 e 6×6 e caminho de pedras.
- **Lote (3):** lotes de 15×15 e 30×15 (origem no meio, frente em −y, calçada de 2 m, gramado `recortavel` para a
  piscina) e caixa de correio.

**Regras de encaixe** (também em `construcao.json → casa`): piso do andar n em z = h + 3,2·n (h = fundação); telhados
com origem no topo das paredes (z = h + 3,2·n + 3); contorno anti-horário, canto convexo com a peça de canto girada
para o lado que sai e côncavo com o canto interno girado para o lado que chega; beiral 0,5 m para fora da grade; L e T
exigem o mesmo vão nas duas alas; piscina com fundo em −1,40, água em −0,10 e borda em +0,03; área construível do lote
de x = −X + 1,5 a X − 1,5 e y de −3,5 a 6,0.

**Medido:** cerca de 1 milhão de raios nas emendas de telhados, fachadas e piscina, com zero fresta e degrau máximo de
0,01 mm. **Limites:** L e T só com vãos iguais; sem piscina em L; mansarda só de duas águas; degraus de entrada com
1,5 m de largura.

Na página (`paginas/construcao/`), as peças e as miniaturas vão em pacotes (`pecas_pacotes/`,
`pacote_miniaturas.json`) para a página publicada caber no limite de arquivos; os GLB estão aqui em `pecas/`.
