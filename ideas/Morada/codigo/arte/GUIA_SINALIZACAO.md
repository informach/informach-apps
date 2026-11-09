# Guia da sinalização e dos grafites da cidade do Morada (vale junto com o GUIA_CIDADE.md)

Leia antes `SP/morada-art/GUIA_CIDADE.md` inteiro (e o que ele manda ler) e `SP/morada-art/GUIA_PREDIOS.md`. Tudo o que
eles dizem vale aqui. Este guia só acrescenta o que é próprio dos outdoors, letreiros e grafites.

SP = `/tmp/claude-0/-home-user-informach-apps/4b0c5cb8-e6f3-54e3-8b85-cd31fc21bb7f/scratchpad`

## A referência (descrita, não há arquivo)

A imagem de referência é uma vitrine de "revitalização do ambiente urbano" num fundo azul-marinho escuro, com dois
grupos de peças.

**Outdoors e sinalização (cerca de 60 peças), estáticos e animados.** As telas são ilustrações coloridas e vivas,
estilo cartum, com texto grande e moldura escura grossa:

- **Outdoors grandes de rua sobre um poste:**
  - painel largo (cerca de 3:1) num poste cilíndrico cinza grosso, com passarela e guarda-corpo embaixo da tela e
    refletores no alto. Um mostra a silhueta de cidade azul com um personagem;
  - painel num pé inclinado em diagonal (um braço grosso em L, de concreto escuro), com tela de carro elétrico verde
    numa estrada e folhinha;
  - painel com moldura e duas luminárias penduradas em cima, tela de óculos de realidade virtual e controles.
- **Faixas e placas horizontais finas, de parede ou de fachada (proporção 5:1 a 8:1):**
  - texto em letra de pixel ou em itálico grosso com contorno, por exemplo "O FUTURO É...", "SINTA A ENERGIA",
    "SONHE ALTO, VOE", "ENERGIA LIMPA";
  - fundos preto, azul-marinho, branco ou turquesa, com uma faixa de cor na ponta. Algumas são letreiros de LED em que o
    texto corre (animado);
  - há também uma faixa curvada, de bandeira ao vento, com letras em pixel amarelas.
- **Painéis de fachada horizontais (cerca de 16:9) com moldura grossa:**
  - parque verde com lago e árvores;
  - jovem estudando com fones e livros;
  - carro elétrico;
  - fábrica de energia com sol poente;
  - lanche fresco com frutas.

  Alguns ficam em pares, encostados formando um canto (dobram a esquina do prédio).
- **Painéis verticais em retrato (cerca de 1:2), de chão (com dois pés) ou de parede:**
  - foguete e "VOE";
  - banco com prédio verde;
  - remédio, "sua saúde";
  - celular e "fique conectado";
  - show de drones no céu à noite;
  - planeta com o símbolo de reciclagem e "lixo zero".
- **Painéis altos e estreitos (totens ou banners de fachada de prédio, cerca de 1:2,5 a 1:3, bem grandes):**
  - universidade com prédio clássico e ícones de ciência;
  - laboratório com cérebro e pessoa de olhos fechados;
  - latas de refrigerante explodindo em cores, rosa e amarelo vibrantes;
  - carro voador branco.
- **Placa quadrada luminosa** de energia com uma gota de fogo colorida, fundo escuro.
- **Painel horizontal sobre dois pés finos** (cavalete) com "desfile neon, sexta" em letras de neon rosa, ciano e
  amarelo, fundo roxo escuro.
- **Pequenos:**
  - pilha vertical de 5 telinhas de parede (avisos);
  - bandeirola vertical roxa pendurada num braço, com setas em V;
  - placa redonda vermelha de wi-fi, em braço de parede;
  - totem estreito de calçada com mapa;
  - placa vertical em braço de poste;
  - tela de fliperama ou de corrida;
  - painel de máquina de lanche.
- **Letreiros de letras soltas** no telhado ou na fachada: a palavra num bloco branco ou preto com contorno amarelo,
  como os de "Move" e "SHINE" da referência. Faça os seus com palavras em português.

**Grafites (9 decalques).** São discos de amostra sobre tijolo terracota, cada um com uma palavra em letra de grafite
bem colorida, com contorno, sombra e degradê:

- palavras como "PEACE", "COOL", "LOVE", "STAR", "TRUST" e "STEP";
- um tag de seta;
- dois abstratos (um amarelo-verde, um laranja).

Os grafites são decalques transparentes para colar em qualquer parede, não discos.

## O que fazer

**Duas categorias novas.** As duas gravam em `SP/cidade_out/<categoria>/` com `catalogo.json`, `glb/` e `miniaturas/`.

### `sinalizacao`: de 45 a 55 peças, com os desenhos todos diferentes

- **Mistura:** cubra todos os tipos da lista acima:
  - outdoors de poste (de 3 a 4 jeitos de estrutura);
  - faixas e LED;
  - painéis de fachada (incluindo os de esquina);
  - painéis verticais de chão e de parede;
  - totens altos de fachada;
  - letreiros de letras soltas;
  - os pequenos.
- **Estampas:** cada uma é um PNG desenhado com PIL em `python3 -I`, num script `sinalizacao_estampas.py`.
  - São ilustrações cartum com formas simples, degradês, céu, prédios, natureza e objetos, e texto grande em
    português.
  - Use só palavras genéricas, **sem nomes de marca nem marcas inventadas que pareçam reais**, e nada copiado da
    referência. Por exemplo: PARQUE VERDE, ENERGIA LIMPA, CARRO ELÉTRICO, SONHE ALTO, O FUTURO É AGORA, SHOW DE DRONES,
    LIXO ZERO, DESFILE NEON SEXTA, UNIVERSIDADE, SUCO FRESCO, FIQUE CONECTADO, SUA SAÚDE, VOE MAIS LONGE, LANCHE,
    CINEMA, PROMOÇÃO, ABERTO.
  - Fontes: veja as que existem em `/usr/share/fonts` (`fc-list`). Prefira as grossas e arredondadas e as de pixel, se
    houver; se não houver, desenhe a letra de pixel com retângulos.
- **Escala real:**
  - outdoor de rua com tela de cerca de 9 × 3 m, a 5–7 m do chão;
  - faixa de fachada de 3 a 6 m;
  - painel de chão de cerca de 1,2 × 2,2 m;
  - totem de fachada de 3 × 8 m;
  - placa de parede de 0,6 a 1 m.
- **Fixação:**
  - peças de chão, com `fixacao="chao"`;
  - peças de parede, com `fixacao="parede"`: as costas no plano y = 0 do Blender, frente para −Y, como os quadros da
    biblioteca de móveis;
  - `altura_instalacao` sugerida no catálogo.
- **Dia e noite:**
  - a tela usa `mb.material_estampa(nome, png, emissao=...)` com emissão (a estampa brilha à noite e fica fraca de dia,
    a página já cuida disso). As bordas de neon usam `neon`, `neon_rosa` ou `neon_roxo`, e os refletores usam `luz`;
  - os materiais `neon_rosa`, `neon_roxo` e `brilho_roxo` estão chegando na `moveis_base.py`. Se ainda não existirem
    quando você começar, use `neon` e troque no fim.
- **Animadas (pelo menos 8 peças):**
  - LED com texto correndo, letreiro que pisca, faixa ao vento, placa que gira e tela que troca de imagem;
  - marque o objeto filho que anima com extras glTF, como os interativos da biblioteca de móveis (`Item.correr` mostra
    como pôr extras num filho). Use `{"anima": "rolar", "velocidade": 0.15}` (a textura corre em U, com o PNG feito
    para emendar), `{"anima": "piscar", "periodo": 1.2}`, `{"anima": "girar", "eixo": "y", "velocidade": 30}` (graus
    por segundo, eixo do glTF), `{"anima": "trocar", "quadros": 3, "periodo": 3}` (a textura tem os quadros lado a lado
    em U) ou `{"anima": "balancar", "angulo": 6, "periodo": 2.5}` (bandeira ou faixa);
  - grave a lista no catálogo em `extra={"animacoes": [{"nome": <objeto>, ...}]}`;
  - eu faço a página tocar essas animações: descreva no relatório exatamente o formato que usou.
- **Malha:** leve, de 100 a 3 mil triângulos (outdoor grande até 5 mil). **Colisão:** postes, pés e caixas das placas de
  chão; as placas de parede não colidem (lista vazia ou uma caixa fina).

### `grafites`: de 12 a 16 decalques transparentes, mais 3 a 4 muros grafitados

- **Decalque:**
  - plano fino (2 mm) com PNG de fundo transparente, palavra em letra de grafite (bolhas, contorno grosso, sombra,
    degradê, brilhos e respingos);
  - palavras em português: PAZ, AMOR, LEGAL, ARTE, SONHO, VAI, OI, LUZ, FÉ, CORES, RUA, VIDA, mais um tag de seta, uma
    estrela e dois abstratos;
  - tamanhos de 1,5 a 4 m de largura, `fixacao="parede"`.
  - **Transparência:** a `material_estampa` da base não liga o alfa. Crie no seu script uma função `material_decalque`
    que faça o mesmo que ela, mas ligando o alfa da textura (`Alpha`) e o método de mistura, com o nome
    `estampa_grafite_<palavra>`, sem mexer na base. Confira se o GLB sai com `alphaMode` BLEND ou MASK (prefira MASK
    com corte 0,5, que não briga com a ordem de desenho).
- **Muros:** de tijolo ou de concreto, de 6 a 12 m × 2,5–3 m, com 2 ou 3 grafites e um mural. Têm colisão.
- **Vitrine dos grafites:** os decalques aplicados num muro de tijolo terracota, como na referência.

## Regras

- **Não altere** `moveis_base.py`, `cidade_base.py` nem as páginas: eu estou mexendo nelas ao mesmo tempo. O que faltar,
  escreva no seu script. Se achar que a base precisa de algo, diga no relatório.
- **Arquivos:**
  - geradores `SP/morada-art/cidade_sinalizacao.py` e `SP/morada-art/cidade_grafites.py`;
  - estampas em `sinalizacao_estampas.py` e `grafites_estampas.py`;
  - rodam como `blender-venv/bin/python -I morada-art/cidade_sinalizacao.py -- SP/cidade_out [ids]`.
- **Recursos:** use `MOVEIS_THREADS=1` sempre, porque estou renderizando em paralelo.
- **Vitrines de dia e de noite:** `tools/vitrine_cat.py -- SP/morada-art <pasta> <pasta>/vitrine.png` e `... noite`.
  Em categoria grande, faça vitrines por grupo (`mb.vitrine(..., ids=[...], noite=True)`).
- **Teste de rua:** monte uma esquina (2 × 2 quadras) com ruas e calçadas (`SP/cidade_out/ruas/glb`,
  `SP/cidade_out/pisos/glb`) e uns 3 prédios de `SP/cidade_out/predios_regulares/glb` e `predios_futuristas/glb`.
  Ponha um outdoor de poste na calçada, painéis e faixas nas fachadas, um totem alto e grafites num muro. Renderize de
  dia e de noite (`teste_rua_dia.png`, `teste_rua_noite.png` na pasta da categoria) para conferir escala e encaixe.
- **Conferência:** duas rodadas, comparando as vitrines com a descrição acima. As placas têm de ser vivas e legíveis. A
  miniatura de cada peça precisa mostrar a tela de frente (use `miniatura_dir` de frente nas placas de parede).
- Nada de commit nem push.
- **Relatório final em português**, curto:
  - o que fez;
  - o formato exato das animações;
  - os problemas da base;
  - os caminhos dos arquivos.
