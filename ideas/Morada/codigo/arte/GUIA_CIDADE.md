# Guia de produção da cidade do Morada

Você faz uma parte da biblioteca de cidade do Morada, um jogo de casa e cidade em 3D com visual "fofo": formas
limpas, arestas boleadas, cores chapadas e acabamento caprichado. O dono pediu tudo **muito bem feito e bem acabado**.
A imagem de referência é o norte: o mesmo tipo de peça, a mesma escala e o mesmo estilo. O desenho é nosso, e não uma
cópia peça por peça.

SP = `/tmp/claude-0/-home-user-informach-apps/4b0c5cb8-e6f3-54e3-8b85-cd31fc21bb7f/scratchpad`

## O que ler antes

- **`SP/morada-art/GUIA_MOVEIS.md`:** o guia da biblioteca de móveis, feita do mesmo jeito. Tudo o que ele diz vale
  aqui, salvo o que este guia muda: conferência, entrega, `MOVEIS_THREADS=1`, não alterar as bases.
- **`SP/morada-art/moveis_base.py`:** paleta, primitivas, Item, Catalogo, vitrine.
- **`SP/morada-art/cidade_base.py`:** a base da cidade. Leia inteira. Ela tem a grade, os perfis, `laje`, `quadrado`,
  `arco`, `meio_fio`, `faixa`, `faixa_pedestres`, `marcacoes_reta`, as peças prontas `rua_reta`, `rua_cruzamento`
  (X e T), `rua_curva` e `rua_fim`, `exporta` e `importa_cidade` (peças do pacote).
- **`SP/morada-art/cidade_teste.py`:** exemplos de uso. O resultado está em `SP/cidade_out/vit_teste.png`.
- **A referência:** `SP/cidade/refs/infraestrutura.webp`. Amplie os trechos com PIL em `python3 -I`.
- **O pacote gratuito Cartoon City:** FBX em `SP/ideias/Cartoon_City/Cartoon_City_Free_fbx/Separate_assets_fbx/`.

**Não altere `moveis_base.py` nem `cidade_base.py`.** Escreva o que faltar no seu script, e conte no relatório o que a
base poderia ter.

## Convenções da cidade (obrigatórias)

- **Grade de 15 m.** Origem no centro da peça, Z para cima. Peças de várias quadras (30 × 30 m, 45 × 15 m etc.) também
  ficam com a origem no centro e cobrem quadras inteiras.
- **Alturas:** calçada em z = 0, asfalto em z = −0,10, meio-fio boleado até +0,10, laje até z = −0,40.
- **Perfis de rua:** `cb.RUA` e `cb.AVENIDA`. Toda borda de peça por onde passa rua usa exatamente o perfil dela, na
  posição dele (centrado na borda). Assim, qualquer peça encaixa em qualquer outra, nossa ou do pacote. As faixas
  tracejadas seguem o período de 5 m da base, para continuar na quadra vizinha.
- **Cores:** só as da paleta, pelo nome: asfalto, asfalto_claro, calcada, concreto, concreto_escuro, grama,
  grama_escura, brita, dormente, trilho, agua_rio, agua_funda, neon_ciano, piso_rosado, terra_seca, branco, amarelo e
  todas as outras de `mb.CORES`.
  - Materiais à parte só para `agua` (lâmina d'água: um plano ou laje fina com `mat="agua"`), `neon` (as faixas de luz
    ciano das pontes futuristas), `vidro` e `luz`.
- **Escala real:**
  - faixa de rolamento de 3,0 a 3,6 m;
  - bitola de trem de 1,6 m, com trilhos sobre dormentes e brita;
  - plataforma de estação a 1,0 a 1,1 m do trilho;
  - guarda-corpo de 1,1 m;
  - pé-direito de garagem de 2,6 a 3,0 m;
  - viaduto com 6 a 7 m de vão livre.
- **Malha leve:** peça de chão (quadra) de até ~3.000 triângulos; peça grande (ponte, trevo, represa, garagem) de até
  ~20.000.
- **Colisão** (em coordenadas do Blender):
  - quadra plana: `cb.exporta` já põe a laje;
  - peças com volume (ponte, viaduto, garagem, represa, plataforma): de 2 a 10 caixas por `it.colisao([...])`,
    seguindo o tabuleiro e os pilares, para personagens e carros andarem por cima e passarem por baixo;
  - água: sem colisão no plano da água, só nas margens e no fundo.
- **Interativos, onde fizer sentido:** a cancela do cruzamento de trem levanta (`porta`, eixo `y` ou `x`), e o portão de
  garagem ou de túnel de serviço também, como porta.
- **Ids e rótulos:** ids em português, minúsculos, com `_`; rótulo curto em português; `grupo` = o desenho; `tags` úteis
  (`modular`, `rua`, `avenida`, `trilho`, `agua`, `ponte`...). As peças do pacote têm o id terminando em `_pacote` e
  `pacote=True`.
- **Miniatura:** as quadras planas usam `cb.DIR_TOPO` (vistas de bem de cima); peças altas usam o ângulo padrão.

## Como rodar

```bash
cd SP && MOVEIS_THREADS=1 CIDADE_PACOTE_FBX=SP/ideias/Cartoon_City/Cartoon_City_Free_fbx/Separate_assets_fbx CIDADE_PACOTE_TEX=SP/ideias/Cartoon_City/textures/textures/Textures1.png CIDADE_PACOTE_TEXTURAS=SP/ideias/Cartoon_City/textures/textures blender-venv/bin/python -I morada-art/cidade_<parte>.py -- SP/cidade_out [categoria|ids]
```

- O gerador fica em `SP/morada-art/cidade_<parte>.py` e grava em `SP/cidade_out/<categoria>/`. Não mexa nas pastas de
  outra parte.
- Vitrine: `blender-venv/bin/python -I tools/vitrine_cat.py -- SP/morada-art SP/cidade_out/<categoria> SP/cidade_out/<categoria>/vitrine.png`.
  A vitrine sobe sozinha as peças que descem abaixo de z = 0.
- Folha de miniaturas: `python3 -I tools/folha_minis.py SP/cidade_out/<categoria>/miniaturas SP/cidade_out/<categoria>/folha.png 160`.
- **Teste de encaixe (obrigatório):** monte, num script seu, uma vitrine de 3 × 3 ou 4 × 4 quadras com peças suas
  encostadas umas nas outras (e nas da base ou do pacote, quando fizer sentido). Confira se as calçadas, os meios-fios,
  as faixas, os trilhos e a água continuam sem degrau, sem fresta e sem sobreposição.

## Conferência (no mínimo duas rodadas)

Compare a vitrine com a referência, a folha de miniaturas e o teste de encaixe. Corrija o que estiver pobre, torto,
flutuando, com fresta, com faces pretas ou fora do perfil. Confira no catálogo as `dims` (múltiplos de 15 m nas peças de
quadra) e a colisão.

## Entrega

Não faça commit nem push. O relatório final, curto e em português, traz:

- quantas peças e quantos desenhos você fez;
- as peças do pacote que usou;
- o que ficou de fora;
- problemas da base;
- os caminhos do gerador, das vitrines, da folha e do teste de encaixe.
