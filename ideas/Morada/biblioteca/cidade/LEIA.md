# Cidade: infraestrutura

Primeira parte da biblioteca de cidade. São **85 peças em 7 categorias**, todas com miniatura. Foram feitas aqui tendo
como norte a imagem da vitrine de infraestrutura (não são cópias). Entram também 12 peças do pacote gratuito Cartoon
City (ruas e calçadas, com o selo `pacote`: **uso interno, não distribuir**).

Página: `paginas/cidade/cidade.html`. Tem o catálogo por categoria, o visor 3D, a troca de cores, as cancelas e
comportas que abrem e as vitrines. Os "testes de encaixe" são trechos de cidade montados com as peças encostadas.

## Categorias

| Categoria | Peças | O que tem |
|---|---:|---|
| `ruas` | 27 | <ul><li>rua de 2 faixas: reta, faixa de pedestres, cruzamentos em X e T (lisos e com faixas), curva, fim de rua, lombada, baia de ônibus, transição para avenida;</li><li>avenida de 4 faixas: reta, faixa de pedestres, X, T, curva, canteiro central, início de canteiro, cruzamento com rua;</li><li>rotatória de 3 × 3 quadras;</li><li>7 ruas do pacote.</li></ul> |
| `pisos` | 11 | calçada lisa, ladrilho rosado, praça, grama, terra, grama com caminho e 5 calçadas do pacote |
| `estacionamentos` | 5 | grande (2 × 1), de quadra, vagas na rua, vagas inclinadas e edifício-garagem de 4 andares com cancelas |
| `ferrovia` | 12 | <ul><li>trilho reto, curva (2 × 2), desvio em Y (2 × 2) e fim de linha;</li><li>passagem de nível com cancelas;</li><li>bonde na rua, na grama e no piso rosado;</li><li>plataforma de estação;</li><li>trem em tubo de vidro, tabuleiro aberto e pilar.</li></ul> |
| `pontes` | 7 | estaiada de pilone em agulha, de pilones em V, ponte em laço, passarela, ponte de arco em tijolo e tabuleiro de 15 m (rua e avenida) |
| `agua` | 10 | represa com comportas, canal reto e curva, rio reto e curva, lago, orla, cais, comporta de canal e água aberta |
| `estruturas` | 13 | viaduto de rua, de avenida e com vão livre, rampa de 30 m (rua e avenida), pilares, trevo (3 × 3), entrada de túnel, plataforma elevada, entrada de metrô, subestação e caixa de equipamentos |

## Convenções (as mesmas do pacote Cartoon City, para encaixar nas peças dele)

- **Grade de 15 m.** Origem no centro, Z para cima. As peças maiores cobrem quadras inteiras (30 × 30, 45 × 45, 15 ×
  75 etc.).
- **Alturas:**
  - calçada em z = 0, asfalto em −0,10, meio-fio boleado até +0,10 e laje até −0,40;
  - água a 1 m ou mais abaixo da calçada;
  - rua elevada (pontes, tabuleiros, viadutos, rampas e trevo) com a calçada em **z = 7,50** (`cidade_base.Z_ELEVADO`)
    e vão livre de 6,2 m. Essas peças trazem `z_elevado` no catálogo.
- **Perfis de rua:**
  - rua de 2 faixas: asfalto de 7,30 m, meio-fio em ±3,75 e calçadas até ±7,50;
  - avenida de 4 faixas: asfalto de 12,30 m, meio-fio em ±6,25.

  Toda borda por onde passa rua usa o perfil dela, então qualquer peça encaixa em qualquer outra, nossa ou do pacote.
- **Faixas pintadas:** são geometria fina 4 mm acima do asfalto. O tracejado tem período de 5 m e continua de uma quadra
  para a outra. Mão brasileira: a linha de retenção fica na pista de quem chega.
- **Cores:** a paleta é a mesma da biblioteca de móveis, com as cores de cidade acrescentadas no fim (asfalto, calçada,
  concreto, grama, brita, trilho, água e outras). Os materiais à parte são `agua`, `neon` (as faixas de luz ciano das
  pontes), `vidro` e `luz`. As peças do pacote mantêm a textura de faixas e de ladrilho dele, reduzida para 1024 px.
- **Colisão:** as quadras planas têm a laje. As peças com volume têm de 3 a 10 caixas: tabuleiro, pilares, lajes de cada
  andar, margens e fundo da água. Postes, árvores e placas não colidem.
- **Interativos:**
  - cancelas da passagem de nível e do edifício-garagem;
  - comportas da represa e do canal;
  - portão da subestação e portas da caixa de equipamentos.

## Conferência

Cada parte passou por duas rodadas de comparação com a referência e por testes de encaixe. Os testes de encaixe são
trechos de 3 × 3 e 4 × 4 quadras, com as peças encostadas umas nas outras e nas da base e do pacote. As emendas foram
medidas, sem degrau, fresta ou sobreposição. A auditoria (`codigo/ferramentas/audita_moveis.py`) não acusou nenhum erro
de interativo nem id repetido.

## Gerar de novo

- **Base:** `codigo/arte/cidade_base.py`, por cima da `moveis_base.py`. O guia dos geradores é
  `codigo/arte/GUIA_CIDADE.md`.
- **Geradores:** `cidade_ruas.py` (ruas, pisos e estacionamentos), `cidade_ferrovia_pontes.py` e
  `cidade_agua_estruturas.py`, cada um com o seu script `_encaixe.py`.

```bash
MOVEIS_THREADS=2 CIDADE_PACOTE_FBX=<Cartoon_City>/Separate_assets_fbx CIDADE_PACOTE_TEX=<textures>/Textures1.png CIDADE_PACOTE_TEXTURAS=<textures> blender-venv/bin/python -I codigo/arte/cidade_ruas.py -- <saida> [categoria|ids]
```

Para empacotar para a página:

```bash
python3 -I codigo/ferramentas/cidade_pacote.py <SP>
```
