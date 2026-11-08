# Guia dos bichos do Morada (biblioteca de personagens)

SP = `/tmp/claude-0/-home-user-informach-apps/4b0c5cb8-e6f3-54e3-8b85-cd31fc21bb7f/scratchpad`

## O que já existe (aproveite)

- **Os 13 bichos de estimação:** `SP/morada-art/bichos.py` gera 13 bichos a partir do Doberman do pacote grátis Apocalypse
  (`SP/ideias/Apocalypse/.../Characters/Doberman.fbx`, textura `Color2.png`), com as 11 animações dele. Leia com calma o
  `/home/user/informach-apps/ideas/Morada/biblioteca/bichos/LEIA.md`: ele explica como as proporções mudam por osso
  sem estragar as animações, as classes de cor, o focinho, o pelo fofo e as peças trocadas (orelhas, caudas e coleira).
  Use as mesmas técnicas e importe funções do `bichos.py` em vez de copiá-las.
- **O pacote grátis Animals:** `SP/ideias/Animals/Animals_Free_fbx/Separate_assets_fbx/` tem 6 bichos com esqueleto e
  animações, todos com a textura de paleta `Texture_1.png`:

  | Bicho | Ossos | Animações |
  |---|---:|---|
  | `Pinguin_001` | 20 | parado, correr, andar |
  | `Dog_001` | 34 | parado, correr, andar |
  | `Tiger_001` | 33 | parado, parado raro, correr, andar |
  | `Deer_001` | 33 | parado, correr, andar |
  | `Kitty_001` | 32 | parado, correr, andar |
  | `Chicken_001` | 32 | parado, correr, andar |

  Esses esqueletos servem de base para bichos com o mesmo plano de corpo:
  - galinha: pombo, pato, gaivota;
  - cervo: girafa, zebra;
  - tigre: leão, urso;
  - gatinho: gatos de verdade, esquilo, coelho, rato;
  - pinguim: o próprio pinguim.

  Todo bicho feito a partir de pacote leva o selo de uso interno, não distribuir.
- **Referência:** `SP/cidade/refs/animais.webp`, a vitrine do pacote pago com girafa, bisão, hipopótamo, elefante,
  urso, canguru, crocodilo, tigre, pinguim, pombos, gatos (preto, laranja, frajola e um fofo rosa) e cachorros. Ela tem
  "mais de 100 animações" em três grupos: estimação, zoológico e fauna urbana. É só norte: formas e cores são feitas
  aqui, sem copiar.

## Padrões (os mesmos dos 13 bichos de hoje)

- **Arquivo e cores:**
  - um GLB por bicho, com malha, esqueleto e todas as animações como clipes separados;
  - 24 quadros por segundo, uma chave a cada 2 quadros;
  - cores por vértice (canto de face, faces chapadas), sem textura: converta a paleta do pacote em classes de cor como
    o `bichos.py` faz.
- **Escala real e orientação:** escala real em metros, com as patas no chão em z = 0 no quadro de descanso, frente para
  −Y no Blender (+Z no glTF), igual aos de hoje. As curvas do próprio objeto do esqueleto saem, para o bicho poder ser
  posto em qualquer lugar.
- **Animações:**
  - nomes em português, sem acento no id (`parado`, `andar`, `correr`, `comer`, `beber`, `deitar`, `dormir`, `sentar`,
    `voar`, `bicar`, `nadar`...) e rótulo com acento;
  - em laço quando fizer sentido;
  - cada bicho tem pelo menos 8.
- **Animações novas:** componha girando ossos em chaves (como em `SP/morada-art/clipes.py`, se ajudar).
  - Comece pelas poses-chave (de 3 a 6) e interpole com suavidade.
  - Respeite o peso do bicho: o elefante é lento, o pombo é nervoso.
  - Os pés não podem deslizar no chão quando o bicho está parado, e nada pode atravessar o chão.
  - Confira cada animação em 4 a 6 quadros renderizados lado a lado.
- **Peças novas** (tromba, presas, chifres, juba, bico, asas, carapaça, crista, cauda longa de crocodilo): presas a um
  osso, ou com ossos próprios quando precisam dobrar (a tromba e a cauda do crocodilo dobram: faça uma cadeia de 3 a 5
  ossos com pesos suaves).
- **Malha:** de 1 a 6 mil triângulos (de 1 a 3 mil os pequenos), sombreamento chapado como os de hoje e cores vivas da
  paleta do Morada.
- **Miniatura:** `<id>.webp` parado, de três quartos, fundo transparente, no padrão de
  `/home/user/informach-apps/ideas/Morada/codigo/ferramentas/miniaturas_bichos.py`.
- **Catálogo:** um JSON por grupo (`<grupo>.json`). Cada bicho tem `id`, `nome`, `especie`, `grupo` (`estimacao`,
  `zoologico` ou `urbano`), `escala`, `pacote` (true/false), `base` (o bicho do pacote de origem) e `animacoes`
  (`[{"id", "rotulo", "laco": true/false, "segundos"}]`).
- **Folha de conferência:** todos lado a lado, parados, mais uma folha por animação nova (4 a 6 quadros). Compare com a
  referência em duas rodadas e corrija o que destoar: proporção, silhueta, cor e movimento.

## Regras

- **Recursos:** `MOVEIS_THREADS=1` sempre (há outros agentes renderizando). Rode o Blender como
  `blender-venv/bin/python -I <script> -- ...`. Arquivo de pacote (FBX/PNG) só com Python `-I`.
- **Arquivos:** grave só na sua pasta de saída `SP/pets/<grupo>/` (com `glb/`, as miniaturas e `<grupo>.json`) e nos
  seus scripts `SP/morada-art/bichos_<grupo>*.py`.
  - Não altere o `bichos.py`, a página nem o repositório. A exceção é o agente do grupo `estimacao`, dono do
    `bichos.py`.
  - `rm` só em caminhos literais dentro da sua pasta.
- Sem commit nem push.
- **Relatório final em português**, curto:
  - os bichos, com a base de cada um;
  - as animações de cada um;
  - o que ficou de fora;
  - os caminhos dos arquivos.
