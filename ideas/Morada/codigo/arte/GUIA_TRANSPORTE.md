# Guia dos transportes e aeronaves da cidade do Morada (vale junto com o GUIA_CIDADE.md)

Leia antes `SP/morada-art/GUIA_CIDADE.md` inteiro (e o que ele manda ler) e `SP/morada-art/GUIA_PREDIOS.md`. Tudo o que
eles dizem vale aqui. Este guia só acrescenta o que é próprio dos veículos.

SP = `/tmp/claude-0/-home-user-informach-apps/4b0c5cb8-e6f3-54e3-8b85-cd31fc21bb7f/scratchpad`

## Referências (abra e amplie com PIL em `python3 -I`)

- `SP/cidade/refs/transporte_todos.webp`: a vitrine dos transportes. Imite as proporções fofas: cabine e rodas grandes,
  cantos boleados, vidros azuis lisos e cores vivas. Em ordem:
  - **barcos:** 2 veleiros de casco branco e laranja (vela branca; vela vermelha), 2 iates de cabine azul e branca,
    2 veleiros de madeira de casco verde e laranja (velas marrons), 2 barcos de passeio com toldo (azul e laranja) e
    2 lanchas pequenas (verde-limão e vermelho com laranja);
  - **utilitários:** caminhão de bombeiros com escada, ônibus azul de turismo com peixes, ônibus rosa e creme, kombi
    de viagem com malas no teto, kombi rosa, furgão cinza, food truck de sorvete com casquinha gigante no teto,
    ambulância, caminhão-baú, caminhão de som com caixas de alto-falante, caminhão de lixo verde, carro retrô rosa
    "rabo de peixe", carro antigo laranja e carro antigo preto;
  - **carros:** sedã de luxo preto e branco, compacto amarelo, compacto cinza, SUV roxo, jipe verde com bagageiro,
    esportivos com aerofólio (laranja e vermelho), cupês (verde-água e verde-limão), carro de corrida magenta, carro
    antigo listrado azul, carrinho redondo laranja e cinza listrado, minivan roxa de 6 rodas, picapes (vermelha e verde
    com motor exposto), sedã azul, táxi amarelo, viatura de polícia, kart com antena, 3 carros futuristas brancos,
    bugue laranja, scooter, moto vermelha, bicicleta, carrinho de bebê e skate.
- `SP/cidade/refs/aeronaves.webp`: 2 dirigíveis coloridos em gomos, 2 aviões de passageiros (branco e azul; branco e
  magenta), 2 helicópteros (vermelho e verde), 2 balões (amarelo e azul; vermelho e branco) e 3 balões temáticos (polvo
  com chapéu de pirata, lua com estrelas, dragão roxo com chifres e asas).
- `SP/cidade/refs/marina.webp`: os barcos ancorados num cais de madeira (escala em relação ao cais).
- `SP/cidade/refs/transito.webp`: o trânsito num viaduto. Repare na escala do carro em relação à rua e no casal sentado
  no conversível.
- `SP/cidade/refs/cruzeiro.webp`: o navio de cruzeiro branco com listras, piscinas, deque e cabines, perto do cais.

Os desenhos são originais: proporções e espírito da referência, sem copiar marcas, logotipos nem textos dela. Escreva
em português o que for escrito: AMBULÂNCIA, BOMBEIROS, POLÍCIA, TÁXI, SORVETE, ESCOLAR, TURISMO.

## Convenções dos veículos

- **Escala real.** Carro de cerca de 4,2 × 1,8 × 1,5 m, ônibus de 11–12 m, caminhão de 7–9 m, bicicleta de 1,7 m,
  veleiro de 8–12 m, navio de cruzeiro de 60–90 m, avião de 30–40 m, helicóptero de 10–12 m, balão de 15–20 m de altura.
  As faixas de rua têm 3,65 m (o carro precisa caber com folga).
- **Eixos e origem.** Frente para −Y (como prédios e móveis). Origem no centro, embaixo:
  - veículos de chão: as rodas tocam z = 0;
  - barcos: z = 0 é a linha d'água (o casco desce abaixo), com `extra={"linha_dagua": 0}`;
  - aeronaves: z = 0 no pé do trem de pouso, na cesta do balão ou embaixo da gôndola do dirigível. Elas levam
    `extra={"voa": true}`.
- **Rodas e hélices animadas.** Cada roda, hélice ou rotor é um objeto filho com a origem no eixo de giro. Ele leva
  extras glTF no formato que a página já toca:
  - roda: `{"anima": "girar", "eixo": "x", "velocidade": 240, "roda": 1, "raio": r}` (eixos do glTF, graus por
    segundo);
  - hélice ou rotor: `{"anima": "girar", "eixo": <eixo>, "velocidade": 720, "helice": 1}`.

  Grave a lista também no catálogo: `"animacoes": [{"nome": <objeto>, ...}]`. Para pôr extras num filho, veja como
  `Item.correr`/`Item.porta` fazem na `moveis_base.py`. Faça a sua própria função no seu script; não altere a base.
- **Portas que abrem (interativos).** Use `Item.porta` (como nos armários): portas do motorista e do passageiro nos
  carros, tampa do porta-malas ou caçamba, porta traseira das vans e da ambulância, e a do ônibus (`Item.correr` ou
  porta). Nos aviões, a porta da cabine. Nos barcos, a escotilha ou a porta da cabine quando houver.
- **Assentos (espaços para personagens).** Um `Item.slot` por lugar, chamado `assento_motorista`, `assento_1`... Ele
  fica no assento, com `tamanho` (0,5 × 0,5 × 0,9 m), para o jogo sentar personagens. Nos ônibus e no navio, use poucos
  slots representativos (até 8).
- **Dia e noite:**
  - faróis com `luz`, lanternas traseiras com `luz_vermelha`;
  - sirenes: `luz_azul` e `luz_vermelha` num filho com `{"anima": "piscar", "periodo": 0,8}`;
  - vidros de carro com `janela_apagada` (vidro azul liso que não acende);
  - janelas de ônibus, trem, bonde, navio, avião e cabines com a mistura `janela`/`janela_fria`/`janela_apagada`, que
    acendem à noite;
  - letreiros e neons como nos prédios (`mb.material_estampa(..., emissao=...)`, `neon`, `neon_rosa`, `neon_roxo`).
- **Malha:**
  - carro: de 2 a 5 mil triângulos;
  - ônibus e caminhão: de 4 a 8 mil;
  - moto e bicicleta: até 3 mil;
  - barco: de 3 a 8 mil;
  - navio de cruzeiro: até 16 mil;
  - avião, dirigível e balão: de 3 a 9 mil.
- **Colisão:** de 1 a 4 caixas, contornando o corpo (com as rodas). Rotores, velas e antenas não colidem.
- **Cores:** as da paleta (`moveis_base.CORES`), vivas como na referência. Faça variações de cor do mesmo desenho, com o
  mesmo `grupo`, só para completar a meta; prefira desenhos diferentes.
- **Miniatura:** três quartos pela frente (o padrão). Nas aeronaves, um pouco mais de cima.
- **Vitrines:** sempre duas, de dia e de noite:
  - `tools/vitrine_cat.py -- SP/morada-art <pasta> <pasta>/vitrine.png`;
  - `... vitrine_noite.png noite`;
  - vitrines por grupo com `mb.vitrine(..., ids=[...], noite=True)`.

  Compare com as referências.

## Pacote gratuito

`SP/ideias/Cartoon_City/Cartoon_City_Free_fbx/Separate_assets_fbx` tem `Car_06.fbx`, `Car_13.fbx`, `Car_16.fbx`,
`Car_19.fbx`, `Futuristic_Car_1.fbx` e `Van.fbx`. A textura é `Textures1.png`, na mesma pasta (veja
`cb.importa_cidade` em `SP/morada-art/cidade_base.py`, `mb.importa_pacote` e como `SP/morada-art/cidade_ruas.py` importa
o pacote, com as variáveis de ambiente CIDADE_PACOTE_FBX/CIDADE_PACOTE_TEX).

- Entram como peças com `pacote=True` (uso interno, não distribuir), na escala e nos eixos acima.
- Se as rodas vierem como malhas separadas, faça delas filhos animados; se não, separe-as por ilha de malha (as quatro
  ilhas mais baixas e redondas).
- Ganham faróis `luz`, lanternas `luz_vermelha`, slots de assento e colisão.

## Rodar

- `MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/<gerador>.py -- SP/cidade_out [ids]`, com `MOVEIS_THREADS=1`
  sempre (há outros agentes renderizando).
- Cada agente grava só na sua categoria.
- **Não altere** `moveis_base.py`, `cidade_base.py`, as páginas nem as categorias dos outros. O que faltar, escreva no
  seu script e diga no relatório.

## Teste de cena (obrigatório)

Monte uma cena com as peças da biblioteca e renderize de dia e de noite, para conferir escala e encaixe:
- veículos de chão: num cruzamento de 2 × 2 quadras (`SP/cidade_out/ruas/glb`, `SP/cidade_out/pisos/glb`), com uns
  prédios de `SP/cidade_out/predios_regulares/glb`;
- barcos: no cais de `SP/cidade_out/agua/glb` (cais, orla, água aberta);
- aeronaves: sobre um quarteirão (no ar, a 30–80 m) e no chão.

Grave `teste_cena_dia.png` e `teste_cena_noite.png` na pasta da categoria.

## Conferência e relatório

Faça duas rodadas de conferência das vitrines contra as referências (proporção, acabamento, cor e escala), corrigindo o
que destoar.

Sem commit nem push. Relatório final em português, curto:
- o que fez, peça por peça em resumo;
- o formato das animações e dos interativos;
- o que ficou de fora;
- os problemas da base;
- os caminhos dos arquivos.
