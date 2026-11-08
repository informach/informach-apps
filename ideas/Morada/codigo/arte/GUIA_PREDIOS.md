# Guia dos prédios da cidade do Morada (vale junto com o GUIA_CIDADE.md)

Leia antes o `SP/morada-art/GUIA_CIDADE.md` inteiro (e o que ele manda ler). Tudo o que ele diz vale aqui. Este guia
só acrescenta o que é próprio dos prédios.

SP = `/tmp/claude-0/-home-user-informach-apps/4b0c5cb8-e6f3-54e3-8b85-cd31fc21bb7f/scratchpad`

## Referências (abra e amplie)

- `SP/cidade/refs/predios_todos.webp`: os mais de 180 prédios. Na fileira de cima ficam os arranha-céus; à esquerda,
  os ecológicos e os futuristas; no meio, Chinatown e mágicos; à direita, os regulares e os tropicais.
- `SP/cidade/refs/predios_estilos.webp`: os 6 estilos separados (Ecological, China-Town, Regular, Futuristic, Magical,
  Tropical).
- `SP/cidade/refs/cidade_dia.webp` e `SP/cidade/refs/cidade_noite.webp`: a cidade de dia e de noite. Repare como as
  janelas acendem em quadradinhos de cores diferentes, com parte apagada, e como os neons e letreiros brilham.
- `SP/cidade/refs/cidade_planta.webp`: os bairros. Os prédios ficam nas quadras ao lado das ruas.

## Convenções dos prédios

- **Lote:**
  - o prédio cabe numa quadra de 15 × 15 m, com a projeção de até 13 × 13 m (sobra calçada em volta);
  - os grandes ocupam 2 × 1 ou 2 × 2 quadras (até 28 × 13 ou 28 × 28 m);
  - origem no centro da projeção, base em z = 0 (o nível da calçada), frente para −Y;
  - grave no catálogo `extra={"lote": [quadras_x, quadras_y], "andares": n, "estilo": "<estilo>"}`.
- **Altura:**
  - andar de 3,2 m (`cb.ANDAR`), térreo comercial de 4,2 m;
  - casas de 1 a 2 andares; prédios de 3 a 15;
  - arranha-céus de 60 a 160 m.
  Escala real, mas com o charme "fofo": molduras gordas, cantos boleados, telhados e marquises generosos.
- **Janelas (dia e noite, obrigatório):** todo prédio tem janelas com os materiais `janela` (acende quente à noite),
  `janela_fria` (acende branco-azulado) e `janela_apagada` (fica escura), misturados (≈ 35–45 % apagadas).
  - de dia todos são o mesmo vidro azul (`mb.VIDRO_JANELA`);
  - não pinte janelas coloridas à mão: na exportação (`Catalogo.exporta` com `lote` no extra), a base troca parte das
    janelas acesas por `janela_laranja`, `janela_rosa`, `janela_lilas`, `janela_ciano` e `janela_verde`, por ilha de
    vidro e conforme o estilo (`mb.JANELAS_ESTILO`). Nos futuristas, tropicais e arranha-céus, parte do `neon` vira
    `neon_rosa` ou `neon_roxo` (`mb.NEON_ESTILO`);
  - use `cb.janelas`, `cb.janelas_caixa` ou escreva a sua função para fachadas curvas, torcidas ou em degraus. O
    importante é cada vidro ser uma face própria com um desses materiais.
- **Neon e letreiros:**
  - os prédios com neon, letreiro ou faixa luminosa usam o material `neon` (ciano) ou `luz` (quente). Exemplos:
    futuristas, tropicais, boates, hotéis, Chinatown com lanternas;
  - o letreiro pode ter texto curto com uma estampa sua (`mb.material_estampa`, PNG desenhado com PIL em `python3 -I`)
    com palavras genéricas em português: HOTEL, BAR, ACADEMIA, CAFÉ, CINEMA, DANÇA, SUSHI. Nada de nomes de marca, e
    nada copiado da imagem;
  - `cb.letreiro_neon` faz uma placa simples.
- **Térreo:** porta de entrada (vidro com moldura); nas lojas, vitrine de vidro, toldo ou marquise.
- **Telhado:** caixa d'água, casa de máquinas, antenas, jardim (ecológicos), heliponto nos arranha-céus.
- **Malha:** casa ou prédio pequeno de 2 a 5 mil triângulos, médio de 5 a 10 mil, arranha-céu de 8 a 16 mil. Janelas em
  excesso pesam: em prédio alto, agrupe andares em faixas de vidro contínuas (uma face por faixa e por material) em vez
  de uma moldura por janela.
- **Colisão:** de 1 a 6 caixas que contornem o volume. Na exportação, a base acrescenta até 6 caixas para o que fica na
  altura de quem anda (de 0,4 a 2,2 m) e escapou das suas caixas por mais de 45 cm: varandas térreas, decks, floreiras,
  torres de canto. Essas caixas sobem até o alto do que está em cima delas e levam `"terreo": 1` no catálogo. Beirais,
  toldos e marquises (acima de 2,2 m), degraus baixos e postes ficam de fora de propósito.
- **Brilho noturno colorido:** `brilho_roxo` tem cor própria de dia e brilha só à noite (cristais, gemas). `neon`,
  `neon_rosa` e `neon_roxo` brilham sempre, fracos de dia.
- **Cores:** as da paleta, vivas como na referência. Cada estilo tem a sua família de cores:
  - ecológicos: branco, verde e madeira;
  - Chinatown: vermelho, verde-jade, dourado e telhas azuis;
  - regulares: tijolo, bege e azul;
  - futuristas: branco, azul, lilás e neon;
  - mágicos: candy colors;
  - tropicais: pastéis com coral e turquesa.

  Faça variações de cor do mesmo desenho, com o mesmo `grupo`, só para completar a meta: prefira desenhos diferentes.
- **Vitrines:** sempre duas, de dia e de noite:
  - `tools/vitrine_cat.py -- SP/morada-art <pasta> <pasta>/vitrine.png`;
  - `tools/vitrine_cat.py -- SP/morada-art <pasta> <pasta>/vitrine_noite.png noite`.

  Em categoria grande, faça vitrines por grupo (`mb.vitrine(..., ids=[...], noite=True)`). Compare a de noite com
  `cidade_noite.webp`.
- **Teste de quarteirão (obrigatório):** monte num script seu uma quadra de cidade (2 × 2 ou 3 × 3 quadras) com ruas e
  calçadas das categorias `ruas` e `pisos` (os GLB em `SP/cidade_out/ruas/glb` e `SP/cidade_out/pisos/glb`) e os seus
  prédios nos lotes. Renderize de dia e de noite, para conferir a escala em relação à rua e o encaixe nos lotes.

## Rodar

Como no GUIA_CIDADE: `blender-venv/bin/python -I morada-art/predios_<estilo>.py -- SP/cidade_out [ids]`, com
`MOVEIS_THREADS=1`. Cada estilo grava na própria pasta `SP/cidade_out/predios_<estilo>/`.
