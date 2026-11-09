# Guia do parque da cidade do Morada (vale junto com o GUIA_CIDADE.md)

Leia antes `SP/morada-art/GUIA_CIDADE.md` inteiro (e o que ele manda ler) e `SP/morada-art/GUIA_PREDIOS.md`. Tudo o que
eles dizem vale aqui.

SP = `/tmp/claude-0/-home-user-informach-apps/4b0c5cb8-e6f3-54e3-8b85-cd31fc21bb7f/scratchpad`

## Referências (abra e amplie com PIL em `python3 -I`)

- `SP/cidade/refs/parque_pecas.webp`, a vitrine do parque:
  - montanha-russa do dragão: um dragão bebê gigante sentado, com o trilho entrando e saindo pela boca, e um vulcão
    com lava descendo, sobre terra e lava numa área de 2 × 3 quadras;
  - área do zoológico: recintos com pedras, lagos e árvores, ligados por caminhos;
  - roda-gigante colorida;
  - parque aquático com torre, toboáguas em espiral e piscinas;
  - montanha-russa azul com loopings;
  - palco de festival com cobertura de estrelas e caixas de som;
  - estátua gigante de menina de vestido azul (decoração do brinquedo do castelo);
  - quiosques e bilheterias;
  - peças do castelo do parque: casinha-portão, torres e muretas;
  - lago com caminho em volta;
  - pista de skate (bowl);
  - placas de caminho de parque sobre grama: reta, curva, cruz, T, rotatória, fim, dupla e diagonal.
- `SP/cidade/refs/parque_aereo.webp`: o parque montado.
  - Repare em como os caminhos cor de tijolo-rosado cortam a grama e no conjunto de tendas de circo, carrosséis,
    castelo rosa e casa na árvore.
  - Postes de praça com várias lâmpadas, árvores e bancos completam a cena.
- `SP/cidade/refs/parque_praca.webp`: a praça de perto, com tendas listradas, a árvore enorme da casa na árvore e um
  obelisco. Tem também arco de treliça branco, bancos de madeira, poste de 4 lanternas, lixeiras de reciclagem de 4
  cores, arbustos redondos e floreiras.
- `SP/cidade/refs/parque_dragao.webp`: o carrinho da montanha-russa de perto. É laranja com faixa azul, assentos roxos
  e as rodas embaixo, num trilho vinho.

São só o norte. Os desenhos são originais e o que estiver escrito vai em português, sem marcas (o palco diz FESTIVAL ou
SHOW, não o texto da imagem).

## O que já existe (aproveite, não refaça)

- **Pisos e infraestrutura:**
  - `SP/cidade_out/pisos/`: piso de praça, grama, grama com caminho, terra e o ladrilho rosado;
  - `SP/cidade_out/agua/`: lago, orla, água aberta e cais;
  - `SP/cidade_out/ruas/`: as ruas.

  Os caminhos do parque precisam casar com essas peças (alturas: calçada em z = 0, grama no mesmo nível; veja
  `SP/morada-art/cidade_ruas.py`).
- **Peças prontas que entram na cena:**
  - `SP/cidade_out/predios_magicos/`: castelo rosa, casa na árvore e casa-cogumelo;
  - os bichos da biblioteca de personagens (`SP/pets/`, sendo feitos agora) vão morar no zoológico.
- **Pacote gratuito** (`SP/ideias/Cartoon_City/Cartoon_City_Free_fbx/Separate_assets_fbx`): `Bush_06/07/10`,
  `Palm_03`, `Fountain_03`, `Trash_02..06`, `Trash_Can_04..08`, `Spotlight_01/02`, `Bus_Stop_02` e
  `traffic_light_001..003`, com a textura `Textures1.png`.
  - Veja como `SP/morada-art/cidade_ruas.py` importa o pacote (`cb.importa_cidade`, variáveis
    CIDADE_PACOTE_FBX/CIDADE_PACOTE_TEX).
  - Essas peças entram com `pacote=True` (uso interno, não distribuir) e ganham luz noturna onde fizer sentido.

## Convenções

- **Grade e escala:** quadra de 15 m. As áreas grandes ocupam 2 × 2 ou 2 × 3 quadras (30 × 30 e 30 × 45 m). A origem
  fica no centro, com o chão em z = 0 e a frente para −Y. Escala real:
  - roda-gigante de 25–35 m;
  - montanha-russa de até 25 m;
  - toboágua de até 12 m;
  - poste de praça de 4–5 m;
  - banco de 1,8 m.
- **Animações:** um objeto filho com a origem no pivô e extras glTF. A página já toca:
  - `{"anima": "girar", "eixo": "y"|"x"|"z", "velocidade": graus/s}`: a roda-gigante, o carrossel, as xícaras;
  - `{"anima": "balancar", "angulo", "periodo", "eixo"}`: o barco viking, os balanços;
  - `{"anima": "piscar", "periodo"}`: lâmpadas do palco e da roda;
  - `{"anima": "rolar"}` e `{"anima": "trocar"}` para telas;
  - `{"anima": "percurso", "pontos": [[x, y, z], ...], "velocidade": m/s, "atraso": m, "fechado": true}`: os carrinhos da
    montanha-russa andando no trilho.
    - Os pontos ficam nos eixos do glTF (Y para cima), no espaço do objeto pai, a cada 0,5–1 m ao longo do trilho.
    - A frente do carrinho (−Y no Blender, que é +Z no glTF) aponta na direção do caminho.
    - Um trem de 3 a 5 carrinhos é feito com vários nós e o mesmo `pontos`, cada um com `atraso` igual ao comprimento do
      carrinho vezes a posição dele no trem.

  As cabines da roda-gigante são filhas da roda e giram com velocidade contrária (`"velocidade": -v`) para ficarem em
  pé. Grave tudo no catálogo em `extra={"animacoes": [{"nome", ...}]}`.
- **Assentos:** um slot por lugar (`assento_1`, ...) nos carrinhos, cabines, carrossel e bancos, com
  `tamanho` = (0,5 × 0,5 × 0,9). Nos brinquedos grandes, até 12 slots.
- **Dia e noite:**
  - lâmpadas dos postes e das luminárias com `luz`;
  - contornos de brinquedos com `neon`, `neon_rosa` e `neon_roxo`;
  - lava do vulcão com um material que brilhe (`luz_vermelha` ou `neon_rosa`, mais forte à noite);
  - janelas com a mistura `janela`/`janela_fria`/`janela_apagada`;
  - letreiros com `mb.material_estampa(..., emissao=...)`;
  - água com `agua`.
- **Trilhos:** tubos leves de 6 a 8 lados, com pilares finos e trilho duplo com dormentes.
- **Malha:**
  - peça pequena de 300 a 3 mil triângulos;
  - quiosque de 2 a 5 mil;
  - brinquedo grande ou área de 8 a 25 mil (diga no relatório se passar).
- **Colisão:** de 1 a 8 caixas no que se encosta (base, pilares, paredes). As placas de caminho só têm a laje.
- **Vitrines:** de dia e de noite, com `tools/vitrine_cat.py -- SP/morada-art <pasta> <pasta>/vitrine.png [noite]` e
  vitrines por grupo (`mb.vitrine(..., ids=[...], noite=True)`).
- **Teste de cena:** um parque montado com as suas peças, as peças existentes e as ruas, de dia e de noite
  (`teste_cena_dia.png`, `teste_cena_noite.png` na sua pasta).

## Regras

- `MOVEIS_THREADS=1` sempre.
- Não altere `moveis_base.py`, `cidade_base.py`, as páginas nem as categorias dos outros. O que faltar, escreva no seu
  script e diga no relatório.
- Arquivo de pacote só com Python `-I`.
- `rm` só em caminhos literais na sua pasta.
- Sem commit nem push.
- **Conferência:** duas rodadas contra as referências (proporção, acabamento, cor e escala).
- **Relatório final em português**, curto:
  - o que fez;
  - as animações e os slots;
  - o que ficou de fora;
  - os problemas da base;
  - os caminhos dos arquivos.
