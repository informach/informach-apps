# Roupas e acessórios

Todas as peças de roupa e os acessórios dos pacotes gratuitos (65 peças), as variações feitas a partir delas e as peças
geradas aqui (317 no total: roupas, acessórios, chapéus, óculos e objetos de mão) servem em todos os corpos, menos no recém-nascido, que usa a manta. Isso vale para a criança, o bebê, o plus e o idoso. Na grávida, a peça acompanha os
três estágios de barriga.

## Onde fica cada coisa

- `codigo/morada-art/roupas.json`: o catálogo, a única lista de peças. É lido pela ferramenta que veste os corpos e
  pela página. Cada peça tem:
  - `id`;
  - `slot`: a parte do corpo. Só uma peça por slot. `inteira` (fantasia) ocupa cima e baixo;
  - `rotulo`: o nome que aparece na página;
  - `arquivo`, `corpo_origem` e `pecas`: o FBX e as malhas de origem;
  - `tipo`: `pele`, `cabeca` ou `rosto` (veja abaixo).
- `codigo/morada-art/roupas.py`: o encaixe.
  - **`pele`**: cada ponto da peça fica preso ao triângulo mais perto da pele do personagem de origem, com a posição
    dentro dele e a distância até a pele. Depois é recolocado no mesmo lugar da pele do nosso corpo, à mesma distância
    (proporcional à altura).
    - Corpo de origem e destino com a mesma malha (família masculina, feminina ou plus do pacote): o triângulo é o
      mesmo.
    - Malhas diferentes: cada ponto da pele de origem vai para o lugar correspondente do corpo de destino (um raio pela
      normal), e a peça inteira se move junto, pela média dos deslocamentos da pele mais perto. Assim ela incha ou
      encolhe com o corpo sem rasgar.
    - Barriga de gravidez: cada forma do corpo gera a mesma forma na peça.
    - Pesos do esqueleto: são os da pele embaixo, suavizados ao longo da peça.
    - Nenhum ponto nem meio de aresta fica a menos de 5 mm da pele. Peças de poucos polígonos são subdivididas antes, e as
      largas guardam o deslocamento inteiro no referencial do triângulo (não só a distância).
  - **`cabeca` e `rosto`** (chapéus, óculos, fones, nariz): presos ao osso da cabeça pela caixa da cabeça, como os
    cabelos. Os de `rosto` ainda andam para a frente se afundarem no rosto.
- `codigo/ferramentas/veste.py`: veste os corpos prontos do arquivo-mestre com as peças do catálogo.

## Variações (cópias modificadas das peças)

No catálogo, uma variação tem `"base"` (a peça de onde vem) e `"variacao"`. Ela herda arquivo, peças, tipo e slot da base.

- `cortes`: corta a peça num marco do corpo de origem e faz bainha na borda nova.
  - Marcos: ombro, meio do braço, cotovelo, cintura, meio da coxa, joelho, meio da canela e tornozelo.
  - Exemplos: calça vira bermuda, short ou capri; camiseta vira regata, cropped ou top; paletó e jaqueta viram colete;
    mangas compridas ficam curtas; bota vira botina (`"acima": true` tira o que fica acima do marco).
- `forma` (chapéus): `aba` (raio da aba), `copa` (altura) e `aba_frente` (boné: aba só na frente).
- `cor`: a cor inicial na página.

Peças feitas aqui:
- **Saias** (`"gerar"`): anéis em volta do corpo de origem, da cintura até o marco pedido, abrindo até a `abertura`
  na barra. A cor é lisa, no mesmo lugar da paleta da peça de referência.
- **Vestidos** (`"compoe"`): uma blusa e uma saia, encaixadas e juntadas numa malha só, de uma cor.

## Peças geradas (`"gerar"`)

Feitas aqui, tendo as imagens da vitrine do pacote (personagens de profissões e casuais) como norte. A lista fica em
`codigo/morada-art/novas_pecas.py`, que reescreve os itens `nov_` e os conjuntos do catálogo:
```bash
python3 novas_pecas.py
```
O gerador está em `codigo/morada-art/geradores.py`:
- **`camada`**: roupa feita sobre a própria pele da malha-base da família do corpo.
  - A região sai dos ossos: tronco, pernas, pés, mãos, cabeça ou corpo.
  - A camada fica afastada da pele pela `folga` e é cortada nos marcos, com bainha.
  - Recortes opcionais:
    - `frente`: só a metade da frente;
    - `faixa_x`: gravata e alças;
    - `faixas_x` (pelos marcos do braço): cotoveleira e boia;
    - `faixas_z` (pelos marcos de altura): cinto, joelheira e cachecol;
    - `abre_frente`: casaco aberto;
    - `tras`: só a metade de trás (gola de marinheiro);
    - `ombro_unico` (1 ou -1): vestido de um ombro, o outro lado vira tomara que caia;
    - `furos`: rasgados na frente das pernas, em marcos (a pele aparece pelo buraco).
  - `gola`: a borda do pescoço sobe e, com `dobra`, vira para fora (polo, camisa, jaleco). `cor` deixa a gola de outra
    cor (jaqueta de aviador, vestido de gola branca).
  - `lapela`: com `abre_frente`, a borda da abertura dobra para fora, larga em cima (paletó). `cor` faz a lapela de cetim
    (smoking).
  - `faixas_cor`: punhos, barra e gola de outra cor (jaqueta colegial, agasalho).
  - `inflar`: gomos estufados entre costuras (colete salva-vidas).
  - `boca_sino`: a calça abre do joelho para baixo.
  - A barra da parte de cima não desce abaixo do gancho. Para uma peça mais comprida, use uma parte `saia` (paletó,
    casaco).
  - Nas partes de baixo, o cós fica rente na cintura, para a parte de cima passar por fora (`sem_cos` desliga).
  - `partes`: várias camadas numa malha só, como a jardineira (calça + peitilho + alças). Uma parte `saia` faz uma saia
    com a mesma textura: jaleco e casaco longo (`abre_frente`, `folga`), vestido de uniforme, avental (`so_frente`).
    Outras partes possíveis:
    - `capuz_caido`: o capuz abaixado atrás do pescoço (moletom, capa de chuva) ou a almofada do salva-vidas;
    - `fivela`: fivela de cinto ou de alça.
    - Uma parte com `cor` fica numa cor fixa (alças, fivelas).
  - `uv_repete` com `padrao: "arrastao"`: trama de arrastão.
    - A textura é um losango com alfa (o furo é transparente) e se repete, com o UV multiplicado.
    - Na página: `alphaTest`, as duas faces e a peça desenhada um pouco atrás (`polygonOffset`), para a roupa de cima
      ganhar onde as duas se encostam.
    - A máscara da cor livre é a própria linha da trama.
    - A peça tem `"transparente": true` no catálogo, e a página não esconde a pele embaixo dela.
    - Por baixo de outra peça, a trama some onde a de cima encosta nela: um raio pela normal da trama, para fora e para
      dentro, acerta a peça de cima a até 2 cm, em 2 dos 3 vértices do triângulo. Logo abaixo da barra não há peça
      perto, e a trama vai até a borda.
  - A volta em torno do braço (o u do UV nas mangas) é medida a partir do eixo do braço.
  - Cores fixas: o material `Roupa_Gen_detalhe` (o mesmo atlas de cores) nunca recebe a cor livre (botões, fivelas,
    lentes, golas de outra cor).
  - Saias geradas: a seção é um pouco quadrada, para cobrir os cantos do quadril. O alto fica rente, sem degrau na
    cintura do vestido. Os pontos da saia ficam a pelo menos 13 mm da pele, para a meia-calça passar por dentro.
  - `padrao`: textura própria, com UV pelo corpo (`biblioteca/roupas_gen/Roupa_Gen_<padrão>.png`). Padrões: liso,
    listras, listras largas, refletivo, refletivo de bombeiro, faixa lateral, xadrez, poá, floral, acolchoado, botões
    duplos, faixa no peito, listras verticais, listras de marinheiro, duas cores na lateral, ziguezague, caveiras,
    folhas, oncinha, lantejoula, jeans e bolso canguru.
    - Nos padrões com detalhes brancos, o fundo é cinza: a cor livre pinta o fundo e o branco continua branco.
- Acabamento das peças geradas por camada (`geradores.camada`):
  - parte de cima: a barra fica 2 cm acima da junta do quadril (longe do gancho) e cai reta (`_barra_reta`): abaixo da
    parte mais larga do quadril, cada ponto vai para fora até o contorno dessa altura, em vez de seguir a pele para
    dentro da virilha (antes, de frente, a barra fazia um V, como um body);
  - parte de baixo e peça inteira: o lado de dentro da perna (virado para a outra) fica quase rente (3 mm, proporcional
    à altura); com a folga toda, as duas coxas da bermuda folgada se cruzavam no gancho e faziam dobras.
- **`chapeu`**: feito sobre a cabeça do corpo.
  - A copa segue a forma da cabeça medida por raios. Cada meridiano para exatamente onde cruza a altura do corte (antes,
    os pontos abaixo subiam com o raio que tinham e, onde o raio não achava a cabeça, a borda virava um disco).
  - A viseira afina até quase nada nas pontas (expoente 1,15) e os bonés abrem 58°: de frente, o boné não vira chapéu. Opções da copa: `alt`, `inclina`, `teto` (boina), `ponta`
    (chapéu pontudo) e `capuz`.
  - Partes que podem ser somadas: `aba` (com `sobe_lados` para o caubói), `viseira` (`atras` para o boné virado),
    `banda` (com `pontas` para a coroa), `topo`, `puff`, `faixa`, `enrolado`, `pompom`, `orelhas`, `olhos`,
    `protetores` e `arco` (tiara, com `babado`).
  - Copa e partes ganharam mais opções:
    - na copa: `vinco` (fedora);
    - na aba: `sobe_tras` (fedora) e `ondas` (chapéu de praia);
    - `orelhas_redondas` (touca de urso);
    - no `arco`: `orelhas_longas` (orelhas de coelho);
    - na copa: `gomos` (lista de cores fixas em volta, "branco" é a cor livre) e `helice` (haste e duas pás
      cruzadas no alto, `pas` com as duas cores): o boné com hélice.
  - Formas próprias:
    - `boina`: faixa justa, corpo estufado mais largo que a cabeça, alto caído para um lado e um pininho;
    - `capuz`: envolve a cabeça, faz uma pontinha atrás, cai sobre os ombros, com a abertura do rosto oval e borda
      dobrada.
  - As cores lisas ficam num atlas (`Roupa_Gen_atlas`). A cor livre pinta a parte de maior área.
- **`oculos`**: feitos no rosto.
  - Partes: duas lentes (`forma`: redondo, quadrado, gatinho ou aviador) ou uma `viseira` esportiva, a ponte e as
    hastes até as orelhas.
  - A armação recebe a cor livre. As lentes têm cor fixa (`lente`: uma cor ou `[esquerda, direita]`, como nos óculos 3D;
    sem `lente`, só a armação).
- **`objeto`** (`tipo: "mao"`, slots `mao_dir` e `mao_esq`): objetos de mão.
  - São 58 objetos, feitos com a vitrine de props do pacote como norte (formas próprias, não cópias):
    - comida e bebida: copo de café, sorvete, picolé, garrafa d'água;
    - na frente do corpo: celular, microfone, câmera, livro, caderno, jornal, tablet, buquê, cartaz, rádio, lanterna;
    - bolsas e malas: bolsa, bolsa de alça, tote, bolsa de fecho, bolsa de pérolas, bolsa de academia, pasta de couro,
      pasta de notebook, maleta, maleta de cantos, maleta rígida, mala de rodinhas, mala de frisos, sacolas, sacola de
      loja, sacola de papel (com pão, leite, banana, verduras e cenoura), kit de primeiros socorros, caixa de ferramentas,
      estojo de violão, extintor;
    - cozinha e serviço: frigideira, espátula, bandeja com tampa;
    - bolas: futebol (gomos pintados), basquete, vôlei, praia (seis gomos), tênis;
    - outros: pincel, paleta de pintor, caixas de presente, rolo de papel, cassetete, ancinho, tesoura de poda, chave
      inglesa, bengala, guarda-chuva fechado, aberto (liso, colorido e listrado), pau de selfie;
    - guia retrátil de cachorro (cabo na mão e a caixa do carretel à frente; a cena de exemplo desenha o fio).
  - As caixas (`_bm_prim` "caixa") têm as quinas chanfradas (2 segmentos, 16% do lado menor); "caixa_reta" fica reta.
  - Alças (`_alca`, `_curva_alca`, `_tubo`): um tubo no plano da face do objeto, com as duas pontas entrando no alto
    dele (nunca soltas) e o meio reto, com cantos arredondados, passando por dentro da mão fechada. A mão fechada foi
    medida na página: a falange de baixo dobra quase 90° para a palma, e o vão da alça fica em x ≈ −0,03, z ≈ 0,22
    (`MAO_X`, `MAO_Z`). A alça tem pelo menos 0,72 de meia largura (`MAO_LARG`), para as pernas dela descerem por fora
    dos dedos nas duas mãos (o mesmo arquivo serve nas duas, espelhado). Sacolas com duas alças (uma em cada face)
    juntam as duas na mão (`dz`, `y_mao`). As pérolas da bolsa de pérolas seguem a mesma curva, a partir da superfície
    do corpo da bolsa; a mangueira do extintor sai da válvula.
  - São feitos no referencial da mão, em unidades do tamanho da mão `s` (do punho até a base do dedo médio):
    - origem na base do dedo médio;
    - X ao longo dos dedos (para baixo com o braço solto);
    - Z para o lado da palma: direita `Z = (Indicador1 − Mínimo1) × X`, esquerda `Z = X × (Indicador1 − Mínimo1)`;
    - Y = Z × X.
  - No corpo: ponto = base do dedo médio + s·(x·X + y·Y + z·Z), preso só ao osso da mão (`geradores.referencial_mao`,
    `referencialMao` na página). O objeto acompanha o tamanho da mão: na criança fica menor.
  - Com um objeto na mão, a página fecha os dedos em volta dele a cada quadro (`fechaDedos`): cada falange gira de X
    para a palma, mais no mínimo e menos no polegar. O jogo deve fazer o mesmo.
  - Gestos (`maosOcupadas`, `atualizaMaos`): cada animação é tocada uma vez numa cópia do esqueleto, em 12 instantes.
    - A mão está ocupada quando sobe acima de 70% da altura entre o quadril e o pescoço em pelo menos 2 deles (acenar,
      apontar, telefone).
    - As duas estão ocupadas quando ficam juntas na frente do peito (palmas) ou quando a cena põe um objeto nas mãos
      (vassoura, caixa).
    - O objeto de uma mão ocupada passa para a outra, se ela estiver livre: o mesmo arquivo, montado no referencial da
      outra mão. Se não estiver, some enquanto durar a animação e volta depois.
  - Pose de segurar (`"pose"` no catálogo; `poseSegurar` na página): todos os objetos de mão têm a sua.
    - A cada quadro, depois da animação, o braço daquele lado vai até `alvo` (frente, cima e para fora do ombro, em
      comprimentos de braço), por IK de dois ossos, com o cotovelo para baixo e para fora.
    - Depois a mão gira:
      - `aponta` leva o eixo Y da mão (o do objeto em pé no punho) para essa direção, com os dedos para a frente:
        café, sorvete, picolé, microfone, buquê, guarda-chuva aberto, pau de selfie;
      - `eixos` dá direto X (os dedos) e Z (a palma): celular com a tela para o rosto, livro na frente do peito, câmera
        na altura dos olhos, bolsas, maleta, sacolas, mala de rodinhas, bengala e guarda-chuva fechado ao lado do corpo;
        as bolas e as caixas de presente na palma virada para cima (`NA_PALMA`), o tablet, o jornal e a paleta como um
        painel na frente do peito;
      - `eixos` com `y` e `z` (sem `x`) dá o eixo Y do objeto e a palma: frigideira e lanterna apontando para a frente,
        com o cabo na mão.
    - Num gesto com aquela mão, o objeto passa para a outra junto com a pose.
    - `balanco` (0 a 1): quanto do vaivém da mão na animação (para a frente e para trás do ombro) entra na pose; do
      vaivém para o lado entra 40% disso, sem nunca puxar a mão mais de 3 cm para dentro. A altura continua a da pose,
      para os gestos não levantarem o objeto. Bolsas: 0,85; bengala e
      guarda-chuva fechado: 0,6; mala: 0,5; o que vai na frente do corpo: 0,1 a 0,25.
    - `pendurado` (bolsa, maleta, sacolas): a direção dos dedos é a gravidade mais um desvio de um pêndulo amortecido,
      que reage à aceleração da mão. A bolsa fica para trás quando a mão acelera e vai e volta até parar.
    - A bolsa pendurada não atravessa o corpo (`penduloMao`, `afastaDoCorpo`, `capsulasCorpo`):
      - o corpo vira cápsulas pelos ossos: coxas e canelas das duas pernas e o tronco (Hips→Spine→Spine1→Neck). O
        raio muda com a direção em volta do osso: 16 setores no referencial do osso, cada um com o percentil 90 da
        distância da pele presa a ele (peso ≥ 0,5), com a forma da gravidez aplicada. Medido uma vez por corpo e
        estágio de gravidez;
      - o objeto é testado em pontos reais da superfície dele (`medidasObjeto`): o vértice mais longe do centro em cada
        uma das 98 direções da casca de uma grade 5×5×5 da caixa que o envolve, mais uns 220 vértices espalhados (a
        alça inclusive), no referencial exato da mão (dedos e palma da pose);
      - antes do braço ser montado, se a mão ou o alto da bolsa entraria numa perna ou no tronco, o alvo da mão vai
        para fora na horizontal (ao andar, a mão passa rente à coxa; ao correr, na frente da outra coxa);
      - depois, a cada passo (até 16), o ponto que entra mais fundo gira a bolsa em volta da mão o quanto falta, com
        1,5 cm de folga; o pêndulo continua dali e perde 40% da velocidade. Se a bolsa ficar presa entre as duas pernas,
        fica onde estava no quadro anterior quando lá entra menos;
      - só as cápsulas perto do objeto (esfera que o envolve) são testadas, e os ossos são lidos uma vez por passo:
        cerca de 1 ms por quadro.
  - Postura da animação (`maosOcupadas`, nas mesmas 12 amostras):
    - deitado, quando o tronco fica longe da vertical (eixo quadril–pescoço com y médio < 0,55): os objetos de mão
      saem de cena;
    - sentado, quando o quadril fica abaixo de 42% da altura: o que tem `pousa` (bolsas, mala, bengala, guarda-chuva
      fechado) vai para o chão, ao lado do quadril. Fica em pé, como pendurado, ou deitado no chão, se for comprido.
      O lugar no chão é fixo no mundo (`posaNoChao`): fica parado enquanto a pessoa se mexe pouco (folga de 12 cm,
      proporcional à altura). Se ela se desloca sentada, o objeto vem junto, arrastado, sem passar da folga, e só vira
      para o lado dela quando ela já virou mais de 20°. Fica sempre fora da cadeira e da mesa da cena;
    - sentado, a mão que se mexe bastante em volta do quadril (comer, digitar, dirigir) está ocupada: o objeto dela
      passa para a outra mão ou some;
    - de pé: só a mão que sobe (gesto) está ocupada.
    - O resto do corpo segue a animação (andar, parado...). O jogo deve fazer igual.

Slots novos:
- `sobre`: casaco ou colete por cima da parte de cima (jaleco, casaco longo, cardigã, salva-vidas, paletó, capa de
  chuva);
- `mao_dir` e `mao_esq`: objetos de mão;
- `cotovelos`, `joelhos`, `cintura`, `alcas`, `avental`, `pescoco_peca` e `rosto_peca`.

Uma peça `inteira` esconde a parte de cima e a de baixo. Com `"cobre": ["baixo"]`, esconde só a de baixo, e a blusa
continua à mostra (jardineira).

## Acabamento (revisão peça por peça)

`tools/revisao_itens.py -- <corpos.blend> <saída> [ids | slots | todos]` veste cada peça num adulto (ou adulta) parado,
com o acabamento das cenas, e renderiza de frente e de costas; `tools/folha_revisao.py <saída>` monta as folhas por slot.
O que a revisão de todas as 317 peças corrigiu:
- **Barra das blusas:** a lateral do quadril (que tem peso da coxa) ficava fora da região do tronco e a barra subia nos
  lados, serrilhada (no corpo de mulher, com o quadril mais largo, aparecia como um degrau atrás). Agora a camada de
  cima com barra no quadril inclui essa lateral até a barra, que sai reta.
- **Pesos herdados:** a camada nasce da malha-base e trazia os pesos dela (com índices de grupos que a peça não tem);
  o encaixe agora limpa esses pesos antes de pôr os da pele.
- **Faixa branca na barra:** a máscara de cor livre só valia onde a malha antiga tinha UV. Nos padrões gerados
  (`Roupa_Gen_*`) a máscara agora vale na imagem toda, pela cor.
- **Saias e vestidos:** pesos de pano (veja "Pesos próprios"). Os vestidos `gen_vestido_*` viraram uma peça só (corpo
  e saia na mesma malha e textura); antes eram a camiseta de um pacote por cima da saia, com a barra azul aparecendo.
- **Faixa, viseira e coroa** (`copa.alt = 0`): a copa achatava até um ponto e a peça virava uma linha ou sumia. Agora
  é um anel justo na cabeça na altura do corte (`folga` na testa, `folga_tras` atrás e nos lados, para passar por cima
  do cabelo); a faixa tem espessura e acompanha a cabeça ao subir; a coroa tem aro e uma bolinha em cada ponta.
- **Capuz:** a abertura do rosto era recortada em degraus; agora é uma oval lisa (a borda desliza até ela).
- **Tiara, arco e orelhas:** o arco tem espessura, passa por cima do cabelo no alto e fica rente nos lados; o babado
  da tiara tem ondas regulares.
- **Máscara cirúrgica:** ficava pendurada no queixo; agora vai do queixo à base do nariz (marcos `queixo` e `nariz`).
- **Touca de aviador, viseira, chapéu de praia e de abas largas:** cobriam os olhos; subiram e as abas encolheram.
- **Paletó:** a barra do corpo não abre quando a peça tem saia, e a saia começa por dentro do paletó e sai por baixo
  da barra (antes ficava um anel saliente no quadril).
- **Quepes:** a pala é mais curta e menos caída (de cima, escondia o rosto).
- **Cabelo sob o chapéu (cenas no Blender):** logo abaixo da borda, os pontos do cabelo entram aos poucos (o raio um
  pouco mais para cima acerta o chapéu: todo a 0°, nada a 14°) e a volta de vértices em volta dos que entraram fica
  na média dos vizinhos. A linha do cabelo sai lisa embaixo da borda, sem serrilhado.
- **Pele embaixo da saia (página):** peças com saia trazem `solta` no cabeçalho; nos vértices das pernas, a pele
  some se a saia estiver a até 16 cm (nas outras peças, 5 cm). Assim a coxa da frente não aparece pelo vestido no
  passo. A conta da pele coberta passou a ser feita na pose de descanso (antes, na pose do quadro em que a peça foi
  escolhida: escolhida no meio do passo, a perna já atravessava e a pele não sumia).

### Segunda revisão (na página, homem e mulher)

`tools/revisao_pagina.js <saída> [slots] [sexos]` veste cada peça sozinha na própria página e fotografa de frente e de
costas; `tools/folha_pagina.py` monta as folhas. O que ela e as conversas acharam, e foi corrigido:
- **Gola aberta / ombro aberto:** o decote era um plano horizontal na base do pescoço, e o alto do ombro (que sobe para
  o pescoço) saía junto. Agora o decote é um corte em volta do pescoço (`roupas._decote`: sai só o que está acima da
  altura do decote e perto do eixo do pescoço, no raio dele mais uma folga; o decote fundo abre mais na frente), com a
  borda lisa, feito nas arestas.
- **Faixas de cor em degraus** (punhos, barra, faixa lateral do agasalho): a malha é cortada na borda de cada faixa
  antes de pintar, e o eixo do braço do UV é uma curva contínua (antes, uma faixa de 2 cm por polígono).
- **Calça com "nó" entre as pernas:** a calça copiava o vinco da virilha. No gerador, o fundilho é alisado (ponte lisa
  de uma perna à outra); na página, o empurrão de folga se espalha entre os vizinhos e pontos dobrados vão para a média
  deles (`posicoesPeca`).
- **Short aparecendo pela blusa:** a página esconde a peça de baixo onde a de cima a cobre (camadas: baixo < cima e
  inteira < por cima; `camadaCoberta`, na pose de descanso).
- **Pele pela saia:** em saias fechadas (`saia_fechada` no cabeçalho), toda pele de perna e quadril entre a barra e o
  cós some; sentado, ajoelhado, agachado ou deitado (`POSE_DOBRADA`) a saia troca para os pesos da pele (a coxa sobe e
  o pano vai junto); em pé, volta aos de pano.
- **Vestidos:** a saia nasce um pouco por fora da barra do corpo (fechou a fresta da cintura), o UV da saia é um tubo
  só (o xadrez não se embaralha mais atrás) e as laterais largas da saia não são mais tomadas por braço.
- **Listradas** (blusa, presídio): a cor inicial é a da listra escura (a que a cor livre pinta).
- **Biquíni:** a calcinha cresce 4,5 cm para cima (embaixo igual); o top tem faixa fechada em volta (região `torso`, só
  os ossos do tronco) e alcinhas por dentro, presas na faixa na frente e atrás.

## Cor livre

Toda peça tem uma máscara (`roupas_mascaras/<id>__<material>.png`, cinza, 512 px) da parte da paleta com a cor
principal dela. `mascaras.json` guarda também a luminância dessa cor (linear). Para pintar:

```
cor_final = mistura(textura, cor_escolhida × (luminância do pixel ÷ luminância da cor principal), máscara)
```

O sombreado e os detalhes de outras cores ficam como estão. É o que a página faz no shader, e o jogo deve fazer igual.
Por isso não existem cópias de peças só para mudar a cor: qualquer cor serve.

## Conjuntos

`conjuntos` no catálogo: 70 profissões e estilos prontos. Exemplos: médico, cirurgião, enfermeiro, cientista, chef,
garçom, policial, bombeiro, socorrista, gari, operário, eletricista, mecânico, jardineiro, fazendeiro, caubói, professor,
carteiro, piloto, capitão, salva-vidas, ciclista, skatista, tenista, detento, paciente, camareira, detetive, mágico,
rei, bruxo e Papai Noel, mais os casuais (praia, inverno, chuva, academia, social, piquenique...). Cada um diz a peça e
a cor de cada slot. Ficam em `novas_pecas.py`, que confere se cada peça existe e está no slot certo.

## Pele embaixo da roupa

Onde o corpo não deixa espaço (as coxas do plus se encostam) ou em movimento, a pele pode atravessar a roupa. A página
esconde os triângulos do corpo cobertos por uma peça visível. Um vértice do corpo está coberto quando um raio na
direção da normal dele acerta a peça a até 5 cm (proporcional à altura). Só se esconde o triângulo com os três vértices
cobertos. O cálculo usa as posições pelo esqueleto. O jogo deve fazer o mesmo.

## Nos arquivos

- No arquivo-mestre e no GLB de cada corpo, cada peça é uma malha `<corpo>_<id>`. O id também vai nos extras do nó
  (`roupa` e `slot`).
- A textura é a paleta do pacote de origem, num material `Roupa_<pacote>_<textura>`.
  - O GLB não leva a imagem. A página carrega cada paleta uma vez, de `roupas/<material>.png`.
  - Os GLB dos corpos são comprimidos com Meshopt (`tools/comprime_corpos.sh`; o three.js lê com o MeshoptDecoder).
  - No jogo, o material com esse nome usa a paleta dele.
- Na grávida, as peças têm as formas `gravidez_1`, `gravidez_2` e `gravidez_3`, com o mesmo peso usado no corpo.

## Para acrescentar uma peça

1. Acrescente um item em `roupas.json`.
2. Vista os corpos só com ela:
   ```bash
   python veste.py -- corpos.blend <id>
   ```
   Para refazer uma peça que já existe, use `REFAZ=1`.
3. Exporte o item (`exporta_itens.py -- <saida> <id>`) e rode `biblioteca_pacote.py`. Os corpos não mudam.
   Peça gerada: acrescente em `novas_pecas.py` (não direto no `roupas.json`) e rode `python3 novas_pecas.py` antes.

Qualquer FBX serve, desde que traga o corpo do personagem de origem com a roupa vestida, na mesma pose da malha.

## Limites conhecidos

- **Textura na barriga:** na barriga de grávida a textura da frente estica junto com a peça. Na camiseta fica natural.
  Em paletó aberto e cinto de fivela, a parte da frente aumenta.
- **Chapéus e cabelo:**
  - Na página, com chapéu, o cabelo acima da linha da aba não é desenhado, e o penteado usa a versão "para chapéu". O
    que fica abaixo da aba aparece. Tiara, arco, faixa, coroa e orelhas ficam por cima do cabelo (`"achata": false`).
  - No arquivo-mestre, cada cabelo tem a forma `sob_chapeu`: o que fica acima da aba (58% da cabeça na frente, 12% mais
    baixo na nuca) entra na cabeça. A forma é ligada (driver) à propriedade `com_chapeu` do esqueleto: com 1, o cabelo
    não atravessa o chapéu.
    - `veste.py` e `adiciona_cabelo.py` fazem isso nos corpos em que mexem, e `tools/cabelo_chapeu.py` em todos.
    - Os scripts de render ligam `com_chapeu` sozinhos quando um chapéu aparece.
- **Peças largas:** a parte de saia (saias, vestidos, casaco comprido, jaleco, paletó) segue o quadril e as duas coxas
  misturadas (veja "Pesos próprios"); em passos muito largos a coxa da frente ainda pode encostar no pano (a página
  esconde a pele dela). Sentado, ajoelhado ou deitado, a saia passa a seguir a pele (Blender e página). Fantasias do
  pacote seguem a perna mais perto.

## Peças em arquivos separados (a página já usa; recomendado para o jogo)

Os corpos não carregam mais as peças: cada peça e cada cabelo é um arquivo próprio, carregado quando alguém escolhe, e
montado no corpo na hora. Uma peça nova entra sem regerar os corpos.

- `tools/exporta_itens.py -- <saida> todos`: encaixa cada item uma vez em cada malha-base (famílias m, f e p) e grava
  `itens/<id>.txt`. Grava também `familias.txt`, com os triângulos e as áreas de cada família e a caixa da cabeça.
  - Formato do item: gzip + base64 de `"MIT1"`, u32 com o tamanho do cabeçalho, cabeçalho JSON e blocos binários.
  - Peças `pele`, por ponto e por família: triângulo da malha-base (`<fam>_tri`, u16), baricêntricas (`<fam>_bar`, u16
    ÷ 65535) e deslocamento no referencial do triângulo (`<fam>_off`, i16 × 0,05 mm).
  - Peças `cabeca`: posição na caixa da cabeça (`<fam>_pos`, de 0 a 1).
  - UV (`uv`) e triângulos (`idx`) entram uma vez. Quando a geometria sai em outra ordem numa família, essa família
    ganha os próprios (`proprios`).
- `tools/peles.py -- <corpos.blend> <pasta dos GLB> <saida peles.txt>`: diz, para cada corpo, a família, a ordem dos
  vértices do GLB, a transformação para o espaço do GLB e a caixa da cabeça.
- `tools/corpo_exporta.py` com `SEM_ITENS=1`: os corpos sem as peças dos catálogos. Ficam o cabelo do corpo e o
  raspado.
- Montagem no corpo, peça `pele`, para cada ponto:
  ```
  ponto = p + s·(e1·o₀ + e2·o₁ + n·o₂)
  ```
  - p e n são interpolados no triângulo do corpo. As normais dos vértices são somadas pelas áreas.
  - e1 é a aresta 0→1 tirada a parte na direção de n; e2 = n × e1.
  - s = √(área no corpo ÷ área na malha-base).
  - Pesos: os dos três vértices da pele, pelas baricêntricas (os quatro maiores), a não ser que a peça traga pesos
    próprios (abaixo).
  - Grávida: a mesma conta com as formas `gravidez_1..3` aplicadas no corpo dá as formas da peça.
  - Folga contra a pele em volta: para cada ponto (com o₂ > 0), cada vértice q do triângulo e dos vizinhos dele, com
    h = (q − ponto)·n e distância lateral até 2,5·√(área), empurra o ponto pela normal até h ficar ≤ −c. Aqui
    c = mín(4 mm·s, 0,85·o₂). Assim a pele que estica e sobe entre os pontos da peça (umbigo, parte de baixo da barriga)
    não atravessa a roupa justa. No arquivo-mestre, a peça é afastada da pele de verdade (o ponto, o meio das arestas e
    o centro das faces) em cada forma.
- Montagem no corpo, peça `cabeca`: a posição volta da caixa da cabeça da família para a caixa da cabeça do corpo, presa
  só ao osso Head.
- Objetos de mão (`tipo: "mao"`): um bloco `loc` (f32) com os pontos no referencial da mão, igual em todas as famílias.
  O cabeçalho diz `mao` (dir ou esq).
- **Pesos próprios** (peças com parte de saia e partes de cima/por cima): por família, `<fam>_osso` (u8, 4 por ponto,
  índice na lista `ossos` do cabeçalho) e `<fam>_peso` (u8, 4 por ponto, ÷ 255). Quando existem, a página usa estes em
  vez dos da pele. Saem do encaixe no Blender:
  - parte de saia: logo abaixo do quadril o ponto passa a seguir o quadril e as duas coxas, pela posição em volta do
    corpo (o lado esquerdo mais a coxa esquerda; frente e costas, metade de cada). A parte das coxas vai de 35% a 60%
    até o joelho. Antes, cada ponto seguia a perna mais perto e a saia se partia e embolava entre as pernas;
  - partes de cima e por cima: a barra não segue as coxas (`sem_pernas`), e os últimos 14 cm da peça misturam os pesos
    com os vizinhos e, perto da borda, com a volta inteira (`alisa_pesos_barra`). Assim a barra anda inteira, sem cair
    em aba atrás.

## Miniaturas

Cada item tem uma imagem (192 px, fundo transparente), e a página escolhe as peças, os cabelos e as barbas por ela,
com o nome embaixo.
- Feita por `tools/miniaturas_itens.py -- <saida> todos`:
  - o item é encaixado na malha-base feminina, na cor inicial do catálogo;
  - cabelos, barbas e bigodes aparecem numa cabeça lisa;
  - objetos de mão aparecem em pé.
- Ficam em `biblioteca/miniaturas_itens/<id>.webp`. Para a página, `biblioteca_pacote.py` junta todas em
  `miniaturas_itens.json`. As máscaras de cor também vão num arquivo só (`roupas/mascaras_png.json`).

No jogo, faça igual: a mesma conta, os mesmos arquivos. A página (`corpos.html`, funções `montarItem`, `prepararPele`
e `posicoesPeca`) é a referência.
