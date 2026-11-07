# Guia de produção dos móveis do Morada

Você faz uma categoria da biblioteca de móveis do Morada, um jogo de casa com visual "fofo": peças arredondadas, cores
vivas e chapadas, arestas boleadas e acabamento caprichado. O dono pediu tudo **muito bem feito, com capricho e ótimo
acabamento**. As imagens de referência são o norte: o mesmo tipo de peça, as mesmas proporções, o mesmo estilo e a
mesma variedade. Mas o desenho é nosso: não copie peça por peça de um produto pago, e sim faça peças originais no
mesmo espírito.

SP = `/tmp/claude-0/-home-user-informach-apps/4b0c5cb8-e6f3-54e3-8b85-cd31fc21bb7f/scratchpad`

## O que ler antes

- `SP/morada-art/moveis_base.py`: a base comum. Leia inteira. Ela tem a paleta (atlas), as primitivas (`caixa`,
  `cilindro`, `esfera`, `torno`, `extrudado`, `tubo`, `superelipsoide`, `almofada`, `ret_arredondado`, `circulo`,
  `poligono`, `transforma`, `copia`, `espelha_x`, `junta`, `pinta`, `pinta_onde`), a marcenaria (`carcaca`, `frente`,
  `puxador`, `pe`, `quatro_pes`), o `Item` (com `add`, `porta`, `gaveta`, `correr`, `slot`, `colisao`), o `Catalogo`
  (exporta o GLB, renderiza a miniatura e grava o catálogo), a `vitrine` e o `importa_pacote`.
- `SP/morada-art/moveis_teste.py`: exemplos (criado-mudo com gaveta e porta, pia com cuba e torneira, sofá com
  almofadas, abajur, armário do pacote). `SP/moveis_out/vit_teste.png` e `SP/moveis_out/folha_teste.png` mostram o
  resultado: é esse o padrão mínimo de acabamento.
- As suas imagens de referência em `SP/moveis/refs/` (abra com a ferramenta Read e amplie os trechos recortando com
  PIL em `python3 -I` para ver detalhes). `ref_01.webp` é o mosaico geral do pacote.
- O pacote gratuito (mesmo estilo, uso interno, não distribuir): FBX em
  `SP/moveis/fbx/Cute_Furniture_Free_fbx/Separate_Assets_fbx/<Nome>.fbx` e ícones em `SP/ideias/Cute_Furniture/Icons/`
  (folha com todos: `SP/moveis/icons_folha.png`).

**Não altere `moveis_base.py`.** Se faltar alguma coisa, escreva a função no seu próprio script. Se achar um erro na
base, contorne no seu script e conte no relatório final.

## Como rodar

```bash
cd SP && MOVEIS_THREADS=1 MOVEIS_PACOTE_FBX=SP/moveis/fbx/Cute_Furniture_Free_fbx/Separate_Assets_fbx MOVEIS_PACOTE_TEX=SP/ideias/Cute_Furniture/textures/textures/Textures_4.png blender-venv/bin/python -I morada-art/moveis_<categoria>.py -- SP/moveis_out
```

- Seu gerador é `SP/morada-art/moveis_<categoria>.py` e grava em `SP/moveis_out/<categoria>/` (glb/, miniaturas/ e
  catalogo.json). Não mexa na pasta de outra categoria.
- Use `MOVEIS_THREADS=1`: há outros agentes renderizando ao mesmo tempo numa máquina de 4 núcleos. Para conferir uma
  peça só, aceite um argumento opcional com uma lista de ids, para não refazer a categoria inteira a cada ajuste.
- Chame `mb.limpa()` antes de cada peça, numa única sessão do Blender para a categoria toda.
- Para a vitrine: `blender-venv/bin/python -I tools/vitrine_cat.py -- SP/morada-art SP/moveis_out/<categoria> SP/moveis_out/<categoria>/vitrine.png`
  (acrescente `abertos` no fim para portas e gavetas abertas pela metade: `vitrine_abertos.png`). Em categorias grandes,
  faça vitrines por grupo, com até ~40 peças cada, usando `mb.vitrine(..., ids=[...])` num script seu.
- Para a folha de miniaturas: `python3 -I tools/folha_minis.py SP/moveis_out/<categoria>/miniaturas SP/moveis_out/<categoria>/folha.png 160`.
- Rode Python que lê imagens ou arquivos baixados sempre com `-I`.

## Convenções (obrigatórias)

- **Escala real, em metros.** Z para cima. A frente olha para **−Y**. Cadeira de 0,45 m de assento, mesa de jantar de
  0,75 m, bancada de cozinha de 0,90 m, cama de casal de 1,40 × 1,90 m, porta de armário com folga de 2 a 4 mm entre as
  folhas. Pense no tamanho de verdade de cada coisa.
- **Origem:**
  - `fixacao="chao"`: no chão, no meio da peça;
  - `fixacao="parede"`: no meio da largura, no plano da parede (o corpo fica de y = −profundidade até y = 0) e na base
    da peça. Passe `altura_instalacao` (a altura da base em relação ao chão);
  - `fixacao="apoio"`: objetos pequenos que vão em cima de outra coisa, com a origem na base, no centro;
  - `fixacao="teto"`: lustre e pendente, com a origem no ponto de fixação (a peça fica para baixo de z = 0).
- **Cores:** só as da paleta `mb.CORES`, pelo nome. Os materiais à parte são só `vidro`, `espelho`, `luz` e as
  estampas (`mb.material_estampa`, uma textura PNG sua, para quadros, tapetes, capas e telas desenhadas). Não crie
  outros materiais.
- **Acabamento:**
  - toda aresta é boleada (o `bisel` das primitivas): nada de quina viva;
  - peças macias (almofada, colchão, estofado, pufe, brinquedo) usam `superelipsoide` ou `almofada`;
  - frentes de porta e gaveta usam `frente(...)` com o estilo que a imagem pede (lisa, moldura, almofada, vidro,
    trelica, ripas, recorte);
  - nada de faces sobrepostas no mesmo plano (dá serrilhado): desencoste 1 a 2 mm ou faça uma peça entrar na outra;
  - nada de buraco ou fresta aparecendo onde não deve, e nada flutuando: os pés tocam o chão e as peças se encostam;
  - malha leve: objeto pequeno até ~1.500 triângulos, móvel até ~6.000, peça grande e complexa até ~12.000.
- **Interativos (essencial):** toda porta, gaveta, tampa ou porta de eletrodoméstico que a referência mostra (ou que a
  peça teria de verdade) é interativa:
  - porta: `Item.porta`, com a dobradiça no lugar certo e o lado certo;
  - porta de forno, de lava-louças e de máquina de lavar de abrir para baixo: `eixo="x", lado="baixo"`;
  - basculante de armário alto: `eixo="x", lado="cima"`;
  - gaveta: `Item.gaveta`, uma caixa de verdade com slot dentro;
  - porta de correr e box de banheiro: `Item.correr`.
  Atrás da porta o móvel é oco (`carcaca`), com prateleiras, e cada espaço útil ganha um `slot` (prateleira, nicho,
  geladeira por dentro, forno por dentro, cesto). O objetivo é poder abrir e pôr coisas dentro.
- **Colisão:** a caixa automática serve para peças compactas. Para peças com vão (mesa, cadeira, cama alta, estante
  aberta, sofá em L), passe `it.colisao([...])` com 1 a 6 caixas simples que contornem a forma.
- **Ids e rótulos:** os ids são em português, minúsculos, com `_`, e começam pelo tipo, por exemplo
  `cama_casal_cabeceira_arco_coral` ou `armario_cozinha_pia_grafite`. O rótulo é em português curto, como "Cama de
  casal com cabeceira em arco (coral)".
  - `grupo`: o desenho. As variações de cor do mesmo desenho têm o mesmo grupo, e a página mostra as cores como chips.
  - `tags`: palavras úteis, como `["infantil", "gavetas"]`.
- **Pacote gratuito:** as peças do Cute Furniture da sua categoria entram com `mb.importa_pacote("<Nome>")` e
  `pacote=True`. Elas contam no total. As portas e gavetas do pacote viram `porta`/`gaveta` (confira o pivô e o lado; o
  importador já põe a frente em −Y e troca as cores pela paleta). Confira se a gaveta do pacote é uma caixa ou só uma
  frente: se for só uma frente, a gaveta interativa precisa de corpo, então faça a caixa atrás. Os ids das peças do
  pacote terminam em `_pacote`.
- **Variedade e quantidade:** a meta de cada categoria é o número pedido.
  1. Primeiro, faça o inventário da referência: cada peça diferente que aparece vira um desenho.
  2. Depois, complete o total com variações de cor (2 a 3 por desenho, com cores que combinem, como nas imagens) e com
     variações de tamanho que façam sentido (por exemplo, solteiro, casal e infantil).
  3. Prefira mais desenhos diferentes a muitas cores do mesmo desenho.

## Conferência (obrigatória, no mínimo duas rodadas)

1. Renderize a vitrine da categoria (e a de abertos, se houver interativos). Abra a vitrine e a referência lado a lado
   e compare peça por peça: proporção, quantidade de detalhes, cores, boleado, pés e puxadores.
2. Abra a folha de miniaturas e veja se cada miniatura mostra a peça inteira e bonita.
3. Corrija o que estiver pobre, torto, flutuando, com fresta ou com a malha estragada (sombras pretas, faces
   invertidas). Repita.
4. Confira o catálogo: cada item com `dims` plausíveis, os interativos com pivô no lugar certo e os slots dentro do
   corpo.

## Entrega

Não faça commit nem push: quem junta tudo é o coordenador. No relatório final, curto e em português, diga:

- quantas peças e quantos desenhos fez;
- quais peças do pacote usou;
- o que ficou de fora ou ficou devendo;
- algum problema da base;
- os caminhos do gerador, da vitrine e da folha.
