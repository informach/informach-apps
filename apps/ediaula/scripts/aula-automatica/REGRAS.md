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

**Onde:** `montar.py`.

## 3. Peças `.edisvg`

As peças gráficas da aula chegam prontas em `.edisvg`, na pasta `<parte>/pecas/`: capa, cartões de seção, caixas, balões, destaques, animações de conceito e encerramento.

- **Use o `.edisvg` recebido, não recrie.** Se a peça existe, ela vai para a timeline no lugar da anotação do EdiAula. Só é gerado pelo EdiAula o que não veio em `.edisvg`.
- **Mantenha o vínculo.** Nada de exportar como imagem ou vídeo achatado. O clipe abre no EdiSVG com 2 cliques e se atualiza quando o arquivo é salvo.
- **Conteúdo se ajusta no EdiSVG** (texto, cor, número do badge, forma), nunca com outra anotação por cima. No EdiAula só se ajustam tempo, posição, escala, entrada e saída, e camada.
- **O nome diz o papel e a ordem:** `caixa-01-programacao.edisvg`, `destaque-03-bloco-se.edisvg`, `conceito-2-a-pergunta-certa.edisvg`. A N-ésima peça de um papel vai no lugar da N-ésima marcação desse papel na aula. O resto do nome é conferido com a fala do lugar: se não bater, entra no relatório.
- **As demais regras valem para as peças:** faixa única das marcações, sem sobreposição no tempo, posição recalculada para a tela ampliada, escurecimento só em bloco inteiro, caixa numerada 1 → 2 no menu lateral.
- **Animações de conceito** vão na faixa da gravação, no lugar do trecho (como cutaway), com a apresentadora por cima durante toda a animação.
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
