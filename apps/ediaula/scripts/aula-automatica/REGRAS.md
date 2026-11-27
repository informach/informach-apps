# Regras de edição automática: aulas de programação em blocos

Sistema Zero, crianças de 9 a 14 anos. Revisão de 17/11/2026. Onde estas regras e as de 16/11 (no [README](README.md)) falam do mesmo ponto, valem estas.

**Materiais:**
- gravação de tela de um editor de blocos;
- narração da professora;
- avatar da professora (HeyGen, fundo removido);
- animações de conceito;
- personagens (Debinha, Dedé);
- peças gráficas prontas em `.edisvg`.

**Coordenadas:** frações do quadro. `x` e `y` são o centro do clipe; escala 1 = quadro inteiro. Os números vêm de uma aula aprovada e são o padrão.

Cada regra diz onde é aplicada: `montar.py` e `pecas.py` montam os comandos; `aplicar.mjs`, `acabamento.mjs` e `revisao-final.mjs` agem na aula aberta.

## 1. Faixas, de baixo para cima

1. Áudios: som da página, música (2 faixas alternadas, marcadas como música) e narração.
2. Gravação da tela e animações de conceito, na mesma faixa.
3. **Zoom**: uma faixa só, logo acima da gravação. Nenhum zoom em outra faixa, inclusive os do fim da aula.
4. Capa (faixas da abertura).
5. **Marcações** (destaques, caixas, balões): uma faixa só, acima do zoom. Nunca duas ao mesmo tempo: se sobreporem, a anterior termina exatamente quando a seguinte começa.
6. Apresentadora (avatar).
7. Personagens (Debinha e Dedé), no topo.

As marcações ficam acima do zoom, por isso não crescem com ele. Cada uma é posicionada já na tela ampliada, com (s, cx, cy) do zoom ativo:
- x' = (x − cx)·s + 0,5;
- y' = (y − cy)·s + 0,5;
- escala' = escala·s.

**Onde:**
- `aplicar.mjs` cria as faixas "Zoom" e "Marcações". As ferramentas `add_zoom` e `add_annotation` recebem `track_id`.
- `montar.py` recalcula as posições e corta as sobreposições.
- `acabamento.mjs` ordena as faixas.

## 2. Zoom

- Zoom nos cliques, nas escolhas de menu e nos arrastos de bloco. Nunca enquanto a professora explica a tela inteira (alvo com mais de 45% do quadro).
- Zooms seguidos no mesmo lugar viram um só.
- Campo de texto (escrever um aviso, um número): o zoom abre no clique do campo e fica enquanto a mão escreve. Campos seguidos no mesmo lugar ficam no mesmo zoom; um campo achado depois de arrastar a área abre outro.
- Nada passa do fim da aula: zoom e balão do último clique acabam com ela.
- Nenhum zoom curto e isolado que não ajude a ler: menos de 4 s sem ação sai.
- O zoom leva 0,6 s para abrir ou fechar. Nenhuma marcação entra antes de o zoom terminar de abrir, nem fica depois de ele começar a fechar.
- **Balões (Helena, 22/11/2026):**
  - **Fonte:** Nunito, tamanho 28, sem crescer com o zoom.
  - **Lugar:** o balão vai do lado em que cabe (acima de um botão de baixo, abaixo de um de cima, puxado para o meio da tela) e fora da apresentadora só quando ela está de fato à vista (a lista final, depois dos conflitos).
  - **Ponta:** aponta para o botão ou a área mostrada. Ela é escolhida depois de o balão caber na tela: em cima ou embaixo, à direita ou à esquerda, ou só de lado quando o botão está na altura do balão.
  - **Paleta:** a paleta "Sistema Zero" com as fontes do tema troca os balões para Baloo 2, e o acabamento os devolve para Nunito.
  - **Verificação do EdiAula:** ela acusa "letra pequena" (28 px é 2,6% da altura; o mínimo dela é 3,3%). É a escolha da Helena.

**Onde:** `montar.py` (fonte, lugar e ponta) e `acoes/acabamento.mjs` (Nunito de volta depois da paleta).

## 3. Peças `.edisvg`

As peças gráficas da aula chegam prontas em `.edisvg`, na pasta `<parte>/pecas/`: capa, cartões de seção, caixas, balões, destaques, animações de conceito e encerramento.

- **Use o `.edisvg` recebido, não recrie.** Se a peça existe, ela vai para a timeline no lugar da anotação do EdiAula. Só é gerado pelo EdiAula o que não veio em `.edisvg`.
- **Mantenha o vínculo.** Nada de exportar como imagem ou vídeo achatado. O clipe abre no EdiSVG com 2 cliques e se atualiza quando o arquivo é salvo.
- **Conteúdo se ajusta no EdiSVG** (texto, cor, número do badge, forma), nunca com outra anotação por cima. No EdiAula só se ajustam tempo, posição, escala, entrada e saída, e camada.
- **O nome diz o papel e a ordem:** `caixa-01-programacao.edisvg`, `destaque-03-bloco-se.edisvg`, `conceito-2-a-pergunta-certa.edisvg`. A N-ésima peça de um papel vai no lugar da N-ésima marcação desse papel na aula. O resto do nome é conferido com a fala do lugar: se não bater, entra no relatório.
- **As demais regras valem para as peças:** faixa única das marcações, sem sobreposição no tempo, posição recalculada para a tela ampliada, escurecimento só em bloco inteiro, caixa numerada 1 → 2 no menu lateral.
- **Animações de conceito** vão na faixa da gravação, no lugar do trecho (como cutaway), com a apresentadora por cima durante toda a animação.
- **Animações seguidas** nunca deixam entre elas um pedaço de tela com menos de 1,5 s. A de antes cobre até a próxima: primeiro com o próprio material, depois com o último quadro parado e, só em último caso, até 5% mais lenta. Cada troca tem uma transição só, a de entrada da animação seguinte. O `place_cutaway` já faz isso, e a verificação antes de exportar aponta o que sobrou.
- **A apresentadora** não é cortada em pedaços de menos de 1 s. Animações seguidas contam como um trecho só para o plano dela.
- **Peça faltando:** o EdiAula cria no mesmo padrão e o relatório final lista como "criada sem .edisvg".

**Onde:**
- `pecas.py` casa as peças e as faltas.
- `aplicar.mjs` vincula, por Arquivo › Importar animação do EdiSVG….
- `acabamento.mjs` põe o conceito no lugar da tela.
- `revisao-final.mjs` confere os vínculos.

**Decisões provisórias** (a revisão marcou "[confirmar]"):
- **Papéis aceitos:** `capa`, `secao`, `caixa`, `balao`, `destaque`, `conceito` e `encerramento`.
- **Seção e encerramento:** não têm tempo definido nos dados da gravação. Entram à mão, e o relatório lembra.
- **Peça desenhada no quadro inteiro** (prancheta 16:9): acompanha o zoom como a gravação.
- **Peça do próprio tamanho:** vai no centro da anotação que substitui, no tamanho desenhado vezes o zoom. A caixa encosta a ponta na paleta.

## 4. Caixa das categorias (navegação no menu lateral)

Use a caixa `.edisvg` recebida. Sem ela, o EdiAula cria a caixa no padrão:

- **Quando:** a professora navega no menu de categorias do editor.
- **Visual:** etiqueta amarela (#FFC02E, amarelo XP) com texto escuro e número no canto: 1 = categoria, 2 = item dentro dela. Exemplos: "Programação" (1) → "Lógica & Se" (2).
- **Posição:** encostada no item do menu clicado, sem cobrir o próximo item.
- **Tempo:** entra no clique. A caixa 1 termina exatamente quando a caixa 2 entra, nunca as duas juntas. A caixa 2 fica 1,5 s, e o zoom das categorias fica aberto até ela sair.
- **Texto:** o nome exato do item na tela, no glossário do curso.

**Onde:**
- `montar.py`;
- `aplicar.mjs` encosta a ponta na paleta com a largura de verdade.

## 5. Destaques (contorno nos blocos)

Use o destaque `.edisvg` da peça. Sem ele: contorno amarelo no que está sendo falado, de 1,5 a 3 s, entrando nas palavras ditas.

- **Com escurecimento do resto da tela:** quando o destaque apresenta um bloco inteiro ou um conjunto de blocos pela primeira vez. Exemplos: o evento "Quando acontecer", "Quando o sprite … começar a encostar…", a estrutura "Se / então / senão" completa. Esse destaque é fixo e só entra depois de o zoom terminar de abrir.
- **Sem escurecimento:** campos pequenos dentro do bloco, como menus de escolha ("inimigo"), valores, textos ("Olá") e variáveis ("temChave").
- **Destaque azul:** no encaixe vazio onde o bloco vai ser solto, antes do arrasto.
- **Sem repetição:** o mesmo bloco não ganha outro destaque em menos de 2 s; o anterior é estendido.
- **Nunca cubra** a apresentadora, o personagem, os botões, o jogo rodando ou os resultados. Quando o destaque cobre a apresentadora, ela sai nesse trecho. Quando cobre o personagem, o caso vai para o relatório.

**Onde:** `montar.py`. `add_annotation` recebe `dim`.

## 6. Planos da apresentadora (avatar)

Recorte do avatar: esquerda 2%, direita 2%, topo 2%, base 45%. Entrada e saída com dissolve.

| Situação | Plano |
| --- | --- |
| Abertura (capa, primeiros 1,5 s) | à direita da capa: x 0,81, y 1,08, escala 1,96 |
| Sobre a gravação da tela (demonstração) | canto inferior direito, só busto, baixa para não cobrir os blocos: x 0,86, y 1,34, escala 1,58 |
| Sobre animação de conceito ou recapitulação | maior, à direita: x 0,80, y 1,13, escala 1,97; começa e termina com a animação |
| Cartão de seção ou troca de parte (fundo de cor cheio) | plano fechado, rosto centralizado: x 0,53, y 1,67, escala 3,36 |

- Na demonstração, a apresentadora só aparece quando fala com a câmera ou comenta. Nunca fica sobre a área onde os blocos estão sendo montados: se cobrir, ela sai.
- O vídeo do avatar acompanha a narração: cada trecho usa o mesmo segundo da narração.
- Toda animação de conceito tem a apresentadora por cima, do início ao fim. Se não tiver, o relatório avisa.

**Onde:**
- `montar.py` decide os intervalos;
- `acabamento.mjs` aplica o recorte, os trechos, os cortes nas trocas de plano e os planos.

## 7. Personagens (Debinha, Dedé)

- **Posição:** do lado oposto ao da professora, à esquerda, grande e cortada na cintura: x 0,24, y 0,83, escala 1,18. Entrada e saída com dissolve.
- **Voz:** a regra "personagem silencia a professora" fica ligada. Enquanto o personagem fala, a voz da professora some e o avatar dela sai com fade. Nunca duas vozes juntas.
- **Tempo:** o personagem entra, fala e sai antes da resposta da professora e do próximo gesto na tela.
- **Duas personagens:** cada fala usa o seu clipe, e as duas nunca aparecem ao mesmo tempo. Se aparecerem, o relatório avisa.

**Onde:** `acabamento.mjs`.

## 8. Limpeza final (antes de exportar)

- Apague os pedaços com menos de 3 quadros (sobras de corte, como um avatar com 0 s).
- Troque o "Quadro estendido" pela gravação estendida quando houver gravação no trecho.
- Confira os vínculos `.edisvg`:
  - todo arquivo referenciado existe no disco;
  - todo clipe de peça tem o vínculo e o render, e abre no EdiSVG com 2 cliques;
  - nenhuma peça ficou como imagem ou vídeo solto, sem vínculo.
- Confira na imagem final (`get_frame`) cada marcação durante o zoom: ela tem que cair em cima do bloco certo. As fotos ficam em `edicao/conferir/`.
- Rode a verificação antes da exportação e resolva:
  - duas vozes juntas;
  - letras pequenas;
  - marcações sobrepostas;
  - faixas vazias, que são removidas.
- No relatório final, liste as peças "criadas sem .edisvg" e os ajustes que precisam de revisão humana.

**Onde:** `revisao-final.mjs`, que escreve `edicao/relatorio.md`.

## 9. Direção de arte das animações (Helena, 27/11/2026)

Quem escreve uma cena age como **diretor de arte e designer**, não como quem só põe as peças na tela. A animação precisa ficar bonita, organizada e profissional. Nada de fazer de qualquer jeito.

**Composição:**
- **Um ponto de atenção por vez.** O que a fala diz agora é o maior e o mais forte da tela. O resto fica menor, mais claro ou sai.
- **Grade e alinhamento.** Cartões, caixas e figuras se alinham entre si e com o título: mesma margem esquerda (140 px), mesmos espaços entre os itens e linhas de base iguais. Nada solto "mais ou menos ali".
- **Equilíbrio na área livre.** O conteúdo ocupa a área à esquerda da apresentadora (x < 1320), centrado nela e na altura útil (entre o subtítulo e a base). Sem um canto vazio enquanto o outro está cheio.
- **Respiro.** Pelo menos 40 px entre peças vizinhas e entre peça e borda. Texto nunca encosta na borda do cartão, e nenhuma peça passa por cima de outra sem querer.
- **Tamanho que se lê.** Figura do jogo grande o bastante para reconhecer de longe (moeda, baú, personagem com 150 px ou mais), texto de apoio com 30 px ou mais e números do placar bem grandes.

**Hierarquia e estilo:**
- O style guide "Zero Kids · Kit de slides" vale para tudo: Azul jogo no fundo, título na pílula branca, subtítulo em Nunito branco, caixa branca para termo e verde com texto amarelo para reação, e no máximo três caixas na tela.
- Use as artes de verdade do jogo do curso (os renders 3D, os sprites 2D e os blocos recortados da gravação), na mesma escala entre si.
- Cores só da paleta. O vermelho fica para o errado, e o verde para o certo e para a reação.

**Movimento:**
- Tudo que entra tem um motivo e entra **na palavra** que o anuncia: o pop do item, o personagem andando, a moeda sumindo e o baú abrindo.
- Entradas em sequência com um pequeno intervalo, de 0,3 a 0,5 s, nunca tudo de uma vez nem tudo parado. Uma cena longa ganha uma mudança a cada frase.
- Saídas limpas: o que não vale mais para a fala sai com fade, sem acumular peças na tela.

**Conferir antes de vincular:** gere a prévia da cena (`edicao/previa_cena.py <cena.edisvg> <folha.jpg>`) e olhe os quadros como um diretor de arte. Procure figura pequena, texto passando da borda, peça desalinhada, área vazia e duas coisas disputando atenção. Acerte e gere de novo. Só vincule a cena na aula quando ela estiver bonita.

**Onde:** os scripts de cenas (`edicao/exemplos/<curso>-conceitos.py`) e as peças (`edisvg_cena.py` e `<curso>_cena.py`).

## 10. Didática para criança (Helena, 27/11/2026)

O público é criança. A edição existe para a criança entender, então tudo tem que ser o mais didático, ilustrado, animado e sinalizado possível. Uma cena que um adulto entende "porque já sabe" não serve. O padrão que saiu no Moedas de 27/11 (título, rótulos e figuras paradas, com cara de slide) ficou "medíocre", nas palavras dela.

**A cena mostra acontecendo, não escreve:**
- Criança não lê. Rótulo de texto é apoio curto, nunca a explicação. "Condição", "o bloco Se" e "maior ou igual" escritos numa caixa não ensinam nada.
- Cada ideia vira uma pequena história com causa e efeito: o personagem do curso anda, pega a moeda, a moeda voa até o contador e o número pula. O baú tenta abrir, treme e fica fechado, ou abre com brilho.
- O bloco de verdade da plataforma aparece, grande, e se encaixa na hora em que a fala o nomeia. Uma seta ou um círculo liga o bloco ao que ele faz no jogo.
- Comparações lado a lado, animadas uma de cada vez (4 moedas: fecha; 5: abre; 6: abre), com o personagem reagindo.
- A cena ocupa a área livre com figuras grandes. Um quadro com três caixinhas no meio do azul está vazio.

**Na tela gravada, tudo sinalizado:**
- Antes de cada clique ou arraste, a criança vê **onde**: zoom no lugar, contorno ou círculo pulsando no botão ou bloco, e o resto escurecido quando ajuda.
- Arraste com seta mostrando de onde sai e para onde vai. Ao soltar, um destaque curto no bloco encaixado.
- Número que se digita ou campo que muda fica em destaque até a fala seguinte.
- O resultado no jogo (moeda somando, placar, baú abrindo) aparece com zoom e com tempo para ver.

**Conferir como criança:** antes de vincular, olhe os quadros da prévia e pergunte, em cada frase da fala: uma criança de 8 anos, sem ler nada, entende o que está acontecendo e onde está cada coisa? Se a resposta depende de ler um rótulo, refaça a cena.

**Toda coisa da interface nomeada na fala é mostrada (Cadê A1P4, 27/11/2026):**
- Quando a fala diz o nome de um botão, aviso ou número da tela ("Salvo", "Objetivo cumprido!", Expandir, Reduzir, Verificar projeto, Enviar, Concluir aula, Achados), o cursor vai até ele na palavra (`[apontar "Salvo"]` no Na tela) e a edição põe uma anotação curta apontando para ele.
- O Estúdio começa pequeno na aula. Antes de pedir qualquer coisa no jogo ou nos blocos, a gravação aponta o Expandir, a edição anota "Expandir" e o clique acontece na frente da criança. No fim, o mesmo com o Reduzir. Nunca expandir escondido antes da primeira fala.
- Desenhos caprichados: mão de desenho com o indicador apontando e os outros dedos dobrados, nunca um dedo comprido sozinho (parece o dedo do meio).

**Vídeo ilustrando, com as sinalizações por cima (Helena, 27/11/2026):** quando a ilustração não fica boa, sobretudo nas analogias do Cadê, a cena usa um vídeo e põe por cima, no EdiSVG ou nas anotações do EdiAula, o que a fala ensina: a seta e o rótulo "ação" no gesto, "reação" na resposta, o "+1" no placar. Os vídeos ficam em `edicao/artes/videos/`:
- `cocegas-acao-e-reacao.mp4` (8 s, 1280x720): a mãe faz cócegas e a menina ri. Vai na analogia das cócegas do Cadê A1P3 ("A cócega é a ação, e a risada é a reação"): "ação" nas mãos fazendo cócegas, "reação" no rosto rindo, uma seta da ação até a reação.
- `placar-de-futebol.mp4` (8 s, 1280x720): o menino chuta, o placar vai de 0 a 1 e depois a 2, a família comemora. Vai no placar de futebol do Cadê A2P2 ("Quando sai outro gol, o número aumenta em um"): "placar" no telão e "+1" a cada gol, na palavra.
- Quando o vídeo é mais curto que a fala ou o momento não cai na palavra, congele o quadro do gesto (cócega, gol) para pôr o rótulo; nunca corte a voz.

**Regras de interface valem para as cenas (Helena, 27/11/2026):** texto de rótulo, caixa e anotação começa com letra maiúscula ("Coleta", "Invisível", "Ação"), nunca "coleta" solto em minúscula. Rótulos de um mesmo grupo têm o mesmo tamanho, a mesma altura e se alinham pela mesma linha ou pela mesma coluna. Fonte sempre a do kit (Baloo 2 nos títulos, Nunito no apoio); letra serifada num quadro quer dizer fonte que não carregou, e a cena volta. Um mesmo jeito de fazer seta, rótulo, anotação e cartão de bloco em todas as cenas: as peças comuns ficam no kit `edicao/kit_cena.py` (e a mão do toque em `edisvg_cena.mao_toque`), não redesenhadas em cada curso. O `validar_svg.py` confere essas regras sozinho e barra a peça.

**Pedaço de tela é recorte de verdade (Helena, 27/11/2026):** quando a animação mostra parte da interface (um bloco, um botão do Estúdio, o Expandir, o "Salvo", a paleta), o desenho é o recorte da própria gravação, exatamente como a tela é, nunca um desenho parecido. Bloco é o bloco recortado; um pedaço do Estúdio é o pedaço recortado do Estúdio (`edicao/recortar.sh`). A moldura de um espaço vazio do bloco cobre o espaço inteiro, desde o lado da palavra.

**Mais cor e os personagens do curso (Helena, 27/11/2026):** o kit aprovado fica (rótulos, setas, anel, moldura, mão); o que vem agora soma a ele.
- **Abertura de cada parte:** no lugar do fundo liso com o título, um fundo ilustrado e colorido feito a partir da capa do curso, com o título da parte e um personagem (a Debinha, o Dedé ou o Zappy); a apresentadora continua do lado. Referência de clima: telas de abertura de apps infantis bem ilustrados (colorido, cheio de vida), nunca copiar o desenho de outro app.
- **Zappy nas cenas:** o mascote animado do Sistema Zero (feito no EdiSVG) entra nas animações. Em vez de um texto solto, o Zappy aparece com um balão de fala apontando para ele.

**Balão de fala é o do EdiAula (Helena, 27/11/2026):** o balão do Zappy (e de qualquer personagem) usa o desenho já validado no EdiAula (`apps/ediaula/src/shared/annotation.ts`, `balloonPath`): corpo e ponta num traçado só, cantos de 30 px, sem contorno, sombra suave, texto em Nunito 800. A ponta é curta e larga e sai reta de baixo; o balão é que se posiciona para a ponta cair no personagem (na cabeça, sem cobrir a antena). Como é uma peça só, aparece e some inteira; nunca uma ponta desenhada à parte, que fica desalinhada e para no lugar quando o balão anima.

**Fundo, textos e balão no jeito novo (Helena, 27/11/2026, a partir do guia do app Eureka, sem copiar o desenho):**
- **Fundo com detalhes:** o Azul jogo nunca é chapado. Degradê leve, onda clara em cima e escura embaixo, nuvens, brilhos e raminhos só nas bordas, centro livre (`edicao/artes/fundo-cena.svg`, gerado por `edicao/artes/fundo_cena.py`; um curso pode trocar os raminhos pelo motivo dele).
- **Título solto:** grande (Baloo 2, 92 px), branco com degrau de sombra, a palavra-chave em amarelo; sai a pílula branca.
- **Texto em cartão:** cartão branco bem redondo com degrau, etiqueta colorida levemente inclinada em cima e o personagem saindo da moldura.
- **Destaque:** raios amarelos em volta do que acabou de acontecer; a etiqueta inclinada diz o quê.
- **Sequência:** cada passo num quadradinho colorido com o desenho, ligados por uma trilha de pontinhos.
- **Ponta do balão:** nasce do corpo com os lados curvos e se inclina para o personagem; nunca um triângulo reto saindo para fora.
