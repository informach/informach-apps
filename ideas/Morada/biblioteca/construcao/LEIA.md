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
python3 -I codigo/ferramentas/construcao_pacote.py <SP>
```

A primeira gera as texturas, a segunda as peças, os GLB, o `construcao.blend` e o `construcao.json`, a terceira os
renders da vitrine (`comodos.png` e `pecas.png`), e a quarta empacota para a página. A variável `AMOSTRAS=16` faz uma
prévia rápida dos renders.
