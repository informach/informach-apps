# Cidade: infraestrutura e prédios

A biblioteca de cidade tem **271 peças em 14 categorias**, todas com miniatura:

- **infraestrutura:** 88 peças em 7 categorias;
- **prédios:** 183 peças em 7 categorias (6 estilos e os arranha-céus), todos com janelas que acendem à noite.

As peças foram feitas aqui tendo como norte as imagens de referência, sem copiá-las. Entram também 12 peças do pacote
gratuito Cartoon City (ruas e calçadas, com o selo `pacote`: **uso interno, não distribuir**).

Página: `paginas/cidade/cidade.html`. Tem o catálogo por categoria, o visor 3D, a troca de cores, o botão **Noite**,
as cancelas e comportas que abrem e as vitrines. Os "testes de encaixe" e os "quarteirões" são trechos de cidade
montados com as peças encostadas.

## Infraestrutura

| Categoria | Peças | O que tem |
|---|---:|---|
| `ruas` | 27 | <ul><li>rua de 2 faixas: reta, faixa de pedestres, cruzamentos em X e T (lisos e com faixas), curva, fim de rua, lombada, baia de ônibus, transição para avenida;</li><li>avenida de 4 faixas: reta, faixa de pedestres, X, T, curva, canteiro central, início de canteiro, cruzamento com rua;</li><li>rotatória de 3 × 3 quadras;</li><li>7 ruas do pacote.</li></ul> |
| `pisos` | 11 | calçada lisa, ladrilho rosado, praça, grama, terra, grama com caminho e 5 calçadas do pacote |
| `estacionamentos` | 5 | grande (2 × 1), de quadra, vagas na rua, vagas inclinadas e edifício-garagem de 4 andares com cancelas |
| `ferrovia` | 15 | <ul><li>trilho reto, curva (2 × 2), desvio em Y (2 × 2) e fim de linha;</li><li>passagem de nível com cancelas;</li><li>bonde na rua, na grama e no piso rosado, e curvas de bonde na rua e na grama (2 × 2);</li><li>plataforma de estação;</li><li>trem em tubo de vidro (reto e curva), tabuleiro aberto e pilar.</li></ul> |
| `pontes` | 7 | estaiada de pilone em agulha, de pilones em V, ponte em laço, passarela, ponte de arco em tijolo e tabuleiro de 15 m (rua e avenida) |
| `agua` | 10 | represa com comportas, canal reto e curva, rio reto e curva, lago, orla, cais, comporta de canal e água aberta |
| `estruturas` | 13 | viaduto de rua, de avenida e com vão livre, rampa de 30 m (rua e avenida), pilares, trevo (5 × 5), entrada de túnel, plataforma elevada, entrada de metrô, subestação e caixa de equipamentos |

## Prédios

| Categoria | Peças | Desenhos | O que tem |
|---|---:|---:|---|
| `predios_regulares` | 30 | 26 | sobrados e prédios de tijolo, bege e azul, de 2 a 15 andares; lojas de esquina (padaria, café, farmácia, sorveteria), mercadinho, cinema, hotel, boliche e salão de música com letreiros; escritórios e duas torres |
| `predios_ecologicos` | 28 | 24 | casas e prédios brancos, verdes e de madeira, com tetos-jardim, hortas, painéis solares, jardim vertical, cascata e turbina eólica; café, quitanda, academia e pavilhão |
| `predios_chinatown` | 30 | 19 | pagodes (pequeno, hexagonal, de 5 e de 9 andares), templo, portal, casa de chá, restaurantes, lojas e mercado de beirais, e prédios de vidro com coroa de pagode, em vermelho, jade, dourado e telhas azuis |
| `predios_futuristas` | 31 | 20 | boate, discoteca com globo, fliperama, clube de realidade virtual, cyber-lojas com telas, cápsulas em ovo, casas modulares e torres com anéis de neon, em branco, azul, lilás e neon |
| `predios_tropicais` | 24 | 18 | hotéis e pousadas art déco, torres de varandas onduladas, cinema, boate, bares de praia, quiosque, sorveteria e loja de surfe, em tons pastel com coral e turquesa |
| `predios_magicos` | 24 | 17 | 4 marcos (cristais, castelo de areia, castelo rosa de 2 × 2 quadras e casa na árvore) e 20 casas fofas (cubo mágico, casas tortas, casa de doce, cogumelo, abóbora e outras), em cores de bala |
| `arranha_ceus` | 16 | 16 | torres de 71 a 154 m (gema, S, torcida com heliponto, cilindro, coroa, cintura fina, escalonada, lança de costelas, prisma, ovo, blocos, par de arcos, espiral, trevo e art déco) |

Variações de cor do mesmo desenho têm o mesmo `grupo` e aparecem em "Outras cores" na página.

**Convenções dos prédios:**

- **Lote:** quadra de 15 × 15 m, com a projeção de até 13 × 13 m. Os grandes ocupam 2 × 1 ou 2 × 2 quadras. A origem
  fica no centro da projeção, a base em z = 0 (a calçada) e a frente para −Y. O catálogo grava `lote`, `andares` e
  `estilo`.
- **Altura:** andar de 3,2 m, térreo comercial de 4,2 m, arranha-céus de 60 a 160 m.
- **Dia e noite:** todo prédio tem vidros com três materiais misturados, `janela` (acende quente), `janela_fria`
  (acende branco-azulado) e `janela_apagada` (fica escura), com cerca de 40 % apagadas. De dia os três são o mesmo vidro
  azulado. O GLB traz a emissão da noite; a página (e o motor) zeram as janelas de dia e diminuem `neon`, `luz` e os
  letreiros com estampa luminosa (`estampa_*` com emissão).
- **Letreiros:** palavras genéricas em português (HOTEL, BAR, CAFÉ, CINEMA, DANÇA, SUSHI, DOCES...), sem nomes de
  marca.
- **Malha:** de 3 a 16 mil triângulos, conforme o porte. Nos prédios altos os andares viram faixas de vidro contínuas.
- **Colisão:** de 1 a 6 caixas que contornam o corpo. Beirais, toldos, antenas e enfeites ficam de fora de propósito.
- **Quarteirões:** cada estilo tem um teste de quarteirão de dia e de noite, com as ruas e calçadas da biblioteca.

## Convenções da infraestrutura (as mesmas do pacote Cartoon City, para encaixar nas peças dele)

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
- **Malha de colisão:** onde caixas formariam degraus (rampas, trevo, passagem de nível e curva do trem em tubo), a peça
  traz também uma malha simplificada como filho, oculta, com o extra `{"colisao": 1}` e `colisao_malha` no catálogo. A
  página e as miniaturas não a mostram; o motor usa como colisor.
- **Interativos:**
  - cancelas da passagem de nível e do edifício-garagem;
  - comportas da represa e do canal;
  - portão da subestação e portas da caixa de equipamentos.

## Correções desta leva

- **Asfalto do pacote:** a textura das ruas do pacote foi clareada para casar com o nosso asfalto nas emendas
  (`cidade_ruas_textura.py`).
- **Trevo:** passou de 3 × 3 para 5 × 5 quadras (75 m). A alça tem 80 m, com rampa média de 9,4 % e máxima de 10,2 %
  (antes, cerca de 30 %).
- **Curvas:** curva de bonde na rua e na grama e curva do trem em tubo de vidro, todas de 2 × 2 quadras.
- **Rampas:** a colisão das rampas e do trevo segue a inclinação com malha de colisão, em vez de caixas em degraus.

## Conferência

Cada parte passou por duas rodadas de comparação com a referência e por testes de encaixe. Os testes de encaixe são
trechos de 3 × 3 e 4 × 4 quadras, com as peças encostadas umas nas outras e nas da base e do pacote. As emendas foram
medidas, sem degrau, fresta ou sobreposição. A auditoria (`codigo/ferramentas/audita_moveis.py`) não acusou id repetido,
material fora do padrão nem prédio fora do chão. Ela só avisa da colisão aproximada (beirais, toldos e antenas fora das
caixas, e calçadas planas em que só a laje colide).

Cada estilo de prédio passou por duas rodadas de comparação com as referências de dia e de noite, por vitrines por grupo
e pelo teste de quarteirão.

## Gerar de novo

- **Base:** `codigo/arte/cidade_base.py`, por cima da `moveis_base.py`. O guia dos geradores é
  `codigo/arte/GUIA_CIDADE.md`.
- **Geradores:** `cidade_ruas.py` (ruas, pisos e estacionamentos), `cidade_ferrovia_pontes.py` e
  `cidade_agua_estruturas.py`, cada um com o seu script `_encaixe.py`.
- **Prédios:** o guia é `codigo/arte/GUIA_PREDIOS.md`. Cada estilo tem `predios_<estilo>.py` (e `predios_arranha_ceus.py`),
  com `_estampas.py` (letreiros em PIL), `_vitrines.py` e `_quarteirao.py`. Rodam com
  `MOVEIS_THREADS=1 blender-venv/bin/python -I codigo/arte/predios_<estilo>.py -- <saida> [ids]`.

```bash
MOVEIS_THREADS=2 CIDADE_PACOTE_FBX=<Cartoon_City>/Separate_assets_fbx CIDADE_PACOTE_TEX=<textures>/Textures1.png CIDADE_PACOTE_TEXTURAS=<textures> blender-venv/bin/python -I codigo/arte/cidade_ruas.py -- <saida> [categoria|ids]
```

Para empacotar para a página:

```bash
python3 -I codigo/ferramentas/cidade_pacote.py <SP>
```
