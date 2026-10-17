# EdiAula

Editor de vídeo para aulas: a simplicidade do Camtasia com a timeline do Premiere.

**Modelo de edição em Markdown:** peça ao assistente “Gere um arquivo MD com o modelo de edição desta aula para replicar em outro projeto”. Ele usa `export_editing_template` e abre a janela para salvar um `.md` com faixas, mídias de referência, estilos, balões, movimentos, áudio, legendas e falas de referência quando houver transcrição. No projeto seguinte, peça “Leia meu modelo de edição e proponha a adaptação para esta aula”; `read_editing_template` permite escolher o arquivo. O modelo não inclui mídias nem caminhos locais e seus tempos precisam ser adaptados à nova aula.

**Fila de exportação:** em Exportar, escolha o destino e clique em **Adicionar à fila**. Cada item guarda uma cópia do projeto e das configurações, incluindo o caminho editado do cursor. Clique em **Continuar editando** para abrir outra aula enquanto a fila processa um arquivo por vez. Acompanhe, cancele ou tente novamente pelo botão **Exportações** ou pelo menu **Arquivo → Fila de exportação**. A fila desta versão é da sessão: mantenha o EdiAula aberto ou minimizado; o fechamento normal é bloqueado enquanto há itens pendentes. Os arquivos originais precisam continuar disponíveis.

Na timeline, **Shift + arrasto da linha verde** desloca juntos os clipes que começam naquele ponto ou à direita, em todas as faixas destravadas. As distâncias entre eles são preservadas; clipes que atravessam o ponto ficam no lugar. Ao arrastar para a esquerda, o deslocamento para antes de sobrepor os clipes anteriores. **Esc** cancela o arrasto e **Ctrl + Z** desfaz o movimento aplicado.
O design de referência está em `ediaula.pen`.

## Rodar

```bash
npm install
npm run dev        # abre o app em modo de desenvolvimento
```

**Sem terminal:** `npm run shortcut` compila o app e cria o atalho **EdiAula** na Área de Trabalho e no Menu Iniciar
(ícone em `resources/`, gerado para a suíte inteira por `scripts/edi/make-icons.ps1` na raiz). O atalho abre a versão compilada em `out/`;
depois de mudar o código, rode `npm run build` (ou `npm run shortcut` de novo) para o atalho pegar a versão nova.

Outros comandos:

| Comando | O que faz |
|---|---|
| `npm test` | Testes da timeline, do plano de exportação e uma exportação real com FFmpeg |
| `npm run typecheck` | Verificação de tipos |
| `npm run build` | Build de produção em `out/` |

Se o `npm run dev` reclamar de "Electron uninstall", rode `node node_modules/electron/install.js`.

## Etapa 1 (pronta)

- Tela inicial com projetos recentes, cursos e "continuar editando"
- Projetos `.ediaula` em `Documentos/EdiAula/Projetos`, com salvamento automático
- Importar vídeo, áudio e imagem (botão, Ctrl+I ou arrastar do Explorer)
- Miniaturas, formas de onda e proxy 720p automático para vídeos 4K
- Timeline com faixas de vídeo e áudio: mover, aparar, cortar (C), dividir (S), ímã, excluir com ripple, fechar lacunas, travar/ocultar/silenciar faixas
- Preview sincronizado com J/K/L, quadro a quadro e tela cheia
- Desfazer/refazer de tudo
- Exportação MP4 H.264 pela GPU (NVENC) ou CPU, com normalização −14 LUFS

## Etapa 2 (pronta)

- Transcrição local com whisper.cpp (instalado pelo próprio app na primeira vez: GPU NVIDIA ou CPU)
- Modelo `large-v3-turbo` (recomendado) ou qualquer `ggml-*.bin` em `C:\whisper-cpp`
- Tempos por palavra com DTW + silêncios medidos pelo FFmpeg
- Painel de transcrição: clique numa palavra para ir até ela, selecione palavras e aperte Delete para cortar
- Limpeza automática: vícios de fala ("né", "tipo,", "ahn"…), frases repetidas e silêncios longos, com contagem e tempo economizado
- Cortes aplicados em todas as faixas de vídeo e de fala ao mesmo tempo (ficam sincronizadas); trilha de música é preservada e acompanha o novo final; faixas travadas nunca são tocadas
- Legenda `.srt` gerada da transcrição editada, salva junto do MP4

O motor e os modelos ficam em `%APPDATA%\ediaula\whisper`.

## Inteligência artificial

Duas formas, configuradas em **Configurações › Inteligência artificial** (ícone de engrenagem):

1. **Com a sua assinatura (igual ao pen):** o EdiAula abre um servidor MCP local em `http://127.0.0.1:47321/mcp`.
   O botão **Conectar** registra o EdiAula no Claude Code ou no Codex. Depois é só pedir lá
   ("limpe a aula aberta no EdiAula", "gere os capítulos") e acompanhar as edições ao vivo.
   Claude Desktop: copie o trecho de configuração mostrado na mesma tela.
2. **Assistente dentro do app:** aba **Assistente**, com chave da API da Anthropic (cobrada por uso,
   guardada criptografada). Modelo padrão: Claude Opus 5.

As duas usam as mesmas ferramentas (`src/shared/aiTools.ts`): visão geral, ler transcrição, sugestões e
limpeza automática, cortar frases ou trechos, desfazer, mover o cursor, salvar título/descrição/capítulos/resumo,
transcrever, importar mídia e abrir/criar projetos. Toda edição entra no histórico (Ctrl+Z).

O servidor só aceita conexões deste computador e recusa pedidos vindos de páginas web.

**Chat do app com a sua assinatura:** em Configurações, escolha o motor do Assistente:
Claude Code (assinatura do Claude), Codex (assinatura do ChatGPT) ou API da Anthropic (chave).
Com Claude Code/Codex o EdiAula roda o programa oficial já logado no computador, sem ver credenciais,
e ele só enxerga as ferramentas do editor (o Claude Code roda sem nenhuma ferramenta interna).

**Regras de edição com IA**
- Um comando do Assistente = um Ctrl+Z.
- Edições amplas viram **propostas**: aparecem destacadas na timeline e você aplica ou descarta.
- **Trechos protegidos** (selecione palavras na Transcrição › Proteger) nunca são cortados por limpeza ou IA.
- Cortes por tempo exigem a **revisão** atual do projeto; se você mexeu depois, a IA relê antes.
- **Glossário por curso** (nomes, personagens, blocos) melhora a transcrição e orienta a IA.

**Outros:** vídeos com taxa de quadros variável ganham cópia de trabalho com taxa fixa; cópias de
segurança automáticas em `Projetos/.backups`; tempo de edição medido por aula; exportação com
.srt, .vtt e miniatura .jpg.

## Avatar (HeyGen) e composição

- **Remover fundo automático:** ao importar, a EdiAula detecta fundo azul ou verde liso nas bordas e já remove.
  O recorte (`src/shared/chroma.ts`) mede o quanto o azul passa do vermelho, então roupa azul-marinho não fura;
  nas bordas, calcula a mistura exata com a cor de dentro do objeto e tira o reflexo azul do cabelo e da pele.
- O resultado vira um vídeo com transparência (VP9 com alfa, em cache), que a **prévia e a exportação usam igual**.
  Um vídeo de 78 s em 4K fica pronto em cerca de 50 s, em segundo plano.
- Propriedades › **Remover fundo**: cor (conta-gotas/detectar), Proteger roupa, Suavidade, Tirar reflexo, Afinar contorno,
  e **Ajustar com prévia…**, que mostra um quadro real sobre xadrez, claro ou escuro, com zoom no rosto.
- **Posição e tamanho** por clipe (`src/shared/compose.ts`, mesmo modelo na prévia e na exportação):
  Direita, Esquerda, Busto à direita, Canto, Centro; arraste no vídeo para mover e puxe o canto para redimensionar
  (ímã no centro e nas bordas; Alt desliga). Cortar bordas, opacidade, aparecer/sumir (dissolve).
- Avatar em pé num projeto horizontal entra na faixa de cima, à direita, com dissolve de 0,3 s.

## Roteiro

- Aba **Roteiro**: cole o roteiro em Markdown (formato dos roteiros do Sistema Zero).
- Separa narração (falas citadas de Professora, Debinha…) das notas **Na tela**, das falas do **Zappy (não gravar)**
  e das conferências de produção. Inserções como `F1P1-D01` ficam ligadas à fala do avatar.
- Escolhe sozinho a seção que corresponde à gravação, compara com a **duração alvo** e mostra cada fala com o tempo
  na timeline (clique para ir até ela) e se foi gravada inteira.
- **Fora do roteiro:** o que foi falado e não está no roteiro (tropeços, regravações) vira proposta de corte;
  quando um trecho foi gravado duas vezes, fica a última tomada.
- **Encaixar** (ou peça à IA "aplique a inserção F1P4-D01"): acha a fala do avatar no vídeo do HeyGen transcrito,
  coloca logo depois da fala anterior, numa faixa acima de tudo e no lado livre; se a pausa gravada for curta,
  abre espaço na timeline segurando a tela num quadro parado. A música de fundo não é cortada.
- A IA ganhou `get_script`, `place_insert`, `propose_off_script`, `set_clip_layout` e `set_background_removal`.

## Gravação de tela, cursor e zoom

- **Gravar tela** (Início, barra superior ou barra lateral): camada transparente sobre o monitor com região
  ajustável, câmera (com prévia), microfone (com medidor) e **teleprompter** com as falas do roteiro do projeto.
  Nada disso aparece na gravação (proteção de conteúdo do Windows).
- Atalhos: **F9** inicia/pausa, **F10** para, **Ctrl+M** marcador, **Ctrl+R** refazer o último trecho
  (vira proposta de corte, da pausa antes do trecho errado até a pausa depois da marca).
- A tela é gravada pela GPU (Desktop Duplication + NVENC) **sem o ponteiro**; um auxiliar
  (`resources/cursor-hook.ps1`) registra movimentos, formato do cursor e cliques no mesmo relógio do vídeo.
  Arquivos em `Documentos/EdiAula/Gravações/<data>/` (`tela.mp4`, `camera.mp4`, `cursor.json`).
- **Cursor** (Propriedades): tamanho, suavizar, onda nos cliques, halo amarelo, esconder quando parado.
- **Editar caminho do cursor…** (botão direito no clipe): mostra apenas o intervalo daquele clipe,
  com tempo de zero até sua duração, respeitando a velocidade. O caminho e os pontos ficam no mesmo
  intervalo; aplicar ou restaurar preserva as edições fora dele. Escolha o tempo, clique para adicionar pontos e
  arraste-os para ajustar a posição. Cada ponto também tem tempo e coordenadas numéricas. O movimento
  usa curvas Bézier: selecione um ponto para mostrar as alças azuis de entrada e saída e arraste-as
  para curvar o trajeto. As alças acompanham o ponto; “Redefinir alças” restaura os controles padrão.
  O movimento
  entre os pontos é suave; fora do intervalo editado, permanece o movimento gravado. Remova pontos ou
  restaure o caminho original. Aplicar salva em um único Ctrl+Z, para esse intervalo da gravação e suas cópias.
  Prévia, quadro estendido e exportação usam o caminho editado, inclusive a posição das ondas de clique.
  Zooms automáticos existentes podem ser gerados novamente para seguir as novas posições.
- **Zoom automático nos cliques**: um zoom por sequência de cliques, passeando entre eles e acompanhando
  arrastos (blocos do Blockly); zoom manual "aqui"; faixas âmbar na timeline. O zoom fica no tempo da
  gravação, então acompanha cortes.
- Prévia e exportação usam os mesmos cálculos (`shared/cursor.ts`, `shared/zoom.ts`): o cursor é
  pré-desenhado num vídeo transparente pequeno que o FFmpeg move quadro a quadro; o zoom usa o filtro
  `perspective` com a mesma curva (testado ponto a ponto).
- IA: `auto_zoom` e `set_cursor`.

## Anotações, memes e animações

- **Anotações** (barra lateral › Anotações): seta, balão de fala, nota, rótulo, título, destaque e número de
  passo. Entram no ponto do cursor, numa faixa livre acima da aula; arraste no vídeo para posicionar.
  Propriedades: texto, cor (paleta do curso), direção da seta, rabinho do balão, largura, tamanho da letra. No balão a cor é o preenchimento (o texto fica claro em fundos escuros); a moldura fica como está, e só muda se você quiser, na seção Contorno.
  Cada anotação é desenhada como imagem transparente (`lib/annotations.ts`), a mesma na prévia e na exportação.
- **Meme**: imagem que entra com pop por 2,5 s no canto, sem cobrir o centro da tela.
- **Entrada e saída** de qualquer clipe: dissolver, pop, aproximar, deslizar (4 direções), com duração.
  As curvas (`animAt` em `shared/compose.ts`) viram expressões do FFmpeg na exportação, testadas ponto a ponto.
- IA: `add_annotation` e `add_image` (com `near_text`: entra quando a frase é falada) e `set_motion`.

## Acabamento e formatos

- **Transições** entre cenas na mesma faixa (Propriedades › Transição da cena anterior): dissolver
  (a cena anterior continua além do corte, só imagem, sumindo sobre a próxima; sem imagem sobrando no original
  vira "passar pelo preto") ou passar pelo preto. `shared/transitions.ts`, mesmo modelo na prévia e na exportação.
- **Forma e borda** de qualquer camada: retângulo, arredondado ou círculo, com borda colorida. A câmera das
  gravações entra em círculo com borda verde-limão.
- **Cartelas** de abertura (a aula anda para frente) e encerramento, preenchidas com curso e título do roteiro.
- **Exportar** para Reels/Shorts 9:16 (aula inteira sobre fundo desfocado, ou cortada no centro) e
  **só áudio** em MP3 (podcast).
- IA: `set_transition`, `add_card`.

## Legenda gravada, movimento, áudio do PC, teclas e modelos

- **Legenda no vídeo** (Propriedades do projeto, com nada selecionado, ou na exportação): da transcrição editada,
  estilos "Palavra acende" (karaokê verde-limão), contorno ou caixa escura; embaixo, no meio ou em cima. A prévia
  mostra igual; a exportação desenha com libass (`shared/captions.ts`). No vertical, linhas mais curtas e mais altas.
- **Movimento por keyframes** (Propriedades › Movimento): marque posições em momentos diferentes; o clipe desliza
  entre elas. Com keyframes, arrastar no vídeo ajusta a posição daquele momento (`shared/keyframes.ts`).
- **Áudio do PC** na gravação (loopback do Windows pelo Chromium), numa faixa própria já alinhada.
- **Teclas na tela**: atalhos (Ctrl/Alt/Win+…) e setas/Enter/Tab/Esc/Espaço aparecem num balão no canto.
  A digitação comum **nunca** é gravada.
- **Modelos**: cartela centralizada, faixa de nome (lower third).
- IA: `set_captions`, `move_clip`.

## Etapa 3: templates, barra de ferramentas completa e áudio

- **Templates** (barra lateral › Templates): abertura animada, começo de seção, pergunta com alternativas,
  desafio, recapitulando e encerramento animado. Campos preenchidos do curso e do roteiro, miniatura ao vivo.
  Cada camada vira uma anotação comum (fundo, selo, título, itens) que entra uma depois da outra, então a
  prévia e a exportação são iguais e tudo continua editável (`shared/templates.ts`, `lib/templates.ts`).
  Abertura e encerramento ocupam a tela toda e empurram a aula. Não usamos Remotion: ele exigiria um Chromium
  de renderização à parte, e o motor de camadas do EdiAula já faz o mesmo papel.
- **Transições** (barra lateral): dissolver ou passar pelo preto em todos os cortes de uma vez, com duração.
- **Animações** (barra lateral): entrada e saída dos clipes selecionados (ou de todas as anotações) e o
  movimento por keyframes.
- **Áudio** (barra lateral): música de fundo numa faixa própria, repetida até o fim, a 35% e **abaixando
  sozinha enquanto alguém fala** (envelope pelas falas da transcrição, igual na prévia e na exportação,
  `shared/audio.ts`); marcar qualquer faixa como música; **reduzir ruído** (passa-alta + afftdn na exportação).
- **Legendas** (barra lateral): os ajustes da legenda no vídeo.
- IA: `add_template`, `set_audio`.

## Estilo: sombra projetada, contornos, setas, formas e fontes

- **Sombra projetada** em qualquer clipe (Propriedades › Sombra projetada): nenhuma, suave, forte, longa ou
  brilho, com distância, direção, desfoque, intensidade e cor. Em vídeos, imagens e no avatar ela segue a forma
  (cantos arredondados, círculo, recorte do avatar): a prévia usa `drop-shadow` e a exportação uma cópia
  borrada do alfa (`shadowGraph` em `shared/exportPlan.ts`), com o mesmo desfoque. Nas anotações ela é
  desenhada na própria imagem.
- **Contorno** de anotações: Sem contorno · Sólido · Tracejado · Pontilhado, com cor e espessura. O sólido fica
  por fora da forma; traços e pontos ficam sobre a borda.
- **Formas** (galeria de Anotações › Formas): retângulo, círculo e triângulo cheios, linha, curva e círculo vazado,
  com preenchimento na cor da paleta, contorno e sombra. Linhas e setas compartilham traço (contínuo, tracejado,
  pontilhado), pontas (nenhuma, uma, duas), curva e espessura.
- **Setas**: cheia, linha ou tracejada, uma ou duas pontas, curva, espessura e tamanho da ponta.
- **Formas**: destaque arredondado, reto ou em elipse, com preenchimento opcional; blocos novos "Círculo" e
  "Caixa".
- **Fontes**: 12 famílias livres (OFL) empacotadas em `resources/fonts` (baixadas por
  `node scripts/fetch-fonts.mjs`), mais todas as instaladas no Windows. Valem para anotações, templates e
  legenda gravada (o libass usa os mesmos arquivos TTF).
- IA: `set_style`; `add_annotation` aceita fonte, contorno, sombra, estilo da seta e forma; `set_captions` aceita fonte.

## Paletas de cores

- Cada aula escolhe uma **paleta** (Propriedades do projeto, ou no topo de Anotações e Templates). Vêm prontas
  **EdiAula** e **Sistema Zero**; "Editar paletas…" cria, duplica e edita as suas (salvas no perfil do app,
  valem para todos os projetos). Dá para colar uma lista de cores ("Fundo $bg · #E9EEF6", uma por linha).
- Cada cor tem nome e observação, e cada paleta diz o **papel** de cada cor: fundo escuro, claro, tinta, destaque,
  atenção, principal, sucesso, alerta, criativo. Anotações, templates, cartelas e a borda da câmera nascem nas
  cores desses papéis, e as bolinhas de cor do app mostram só a paleta da aula.
- **Recolorir o que já está na aula**: cada cor que tem papel em alguma paleta vai para o mesmo papel na nova
  (anotações redesenhadas, bordas, sombras, cor da palavra na legenda), num único Ctrl+Z. Cores escolhidas à
  mão fora das paletas ficam como estão (`shared/palettes.ts`).
- **Fontes do tema**: cada paleta pode ter fonte de títulos (título, cartela, passo) e de texto (balões, notas,
  rótulos, faixa de nome, legenda). Sistema Zero: Baloo 2 e Nunito. Fica desligado por padrão; a chave "Usar as
  fontes do tema" troca as fontes do que já está na aula e de tudo que for criado, e acompanha a troca de tema.
  Fontes escolhidas à mão ficam.
- IA: `set_palette` ("usa a paleta do Sistema Zero", `fonts: true` para as fontes do tema).

## Timeline livre

- Como no Camtasia, **qualquer faixa aceita qualquer clipe** (vídeo, imagem, som); a de cima fica na frente.
  Rótulos por posição (F1 é a de baixo), faixas novas com nome neutro ("Faixa 5"); dois cliques no nome renomeiam.
- O avatar sem fundo toca a voz do arquivo original também na prévia (a versão transparente não tem som).
- **Ctrl+C / Ctrl+X / Ctrl+V** (também no menu Editar): copia, recorta e cola clipes selecionados (balões, imagens,
  trechos de vídeo…). Cola no cursor, mantendo o espaço entre eles; volta à mesma faixa se o trecho estiver livre,
  senão vai para a faixa livre logo acima (ou uma nova), sem cobrir nada. A cópia é independente: editar uma
  anotação colada não muda a original.
- **Altura das faixas**: arraste a borda de baixo do nome da faixa (dois cliques voltam ao normal), ou use os
  botões ⇕ na barra da timeline para todas de uma vez. A altura fica salva no projeto.
- **Botão direito num clipe** abre um menu com velocidade, copiar/recortar/colar, dividir e excluir (age na
  seleção; o clipe clicado é selecionado se não estava). O menu fica em `src/renderer/src/editor/ClipMenu.tsx`.
- **Copiar e colar propriedades** (botão direito › Copiar propriedades / Colar propriedades…, ou Ctrl+Alt+C e
  Ctrl+Alt+V, como o "Colar atributos" do Premiere): numa janela você marca o que aplicar nos clipes
  selecionados — posição e tamanho, movimento, corte/cantos/borda, opacidade, sombra, entrada e saída, volume e
  redução de ruído, velocidade, transição, estilo da anotação (cores, preenchimento, contorno, fonte, traço; o
  texto fica) e remoção de fundo (vale para a mídia inteira). Começa marcado o que o clipe copiado mudou do
  padrão (de uma anotação, sem a posição) e depois lembra a última escolha. Tudo num único Ctrl+Z.
- **Velocidade do clipe** (0,25× a 8×, pelo menu, pelas Propriedades ou pelo assistente com `set_speed`): mantém
  o mesmo trecho do original, então mais rápido encurta e mais lento alonga; por padrão o que vem depois na
  faixa anda junto. A voz mantém o tom (atempo na exportação, o mesmo no navegador na prévia). Transcrição,
  legendas, cortes por texto, zooms da gravação e o cursor seguem a velocidade. Imagens, anotações e camadas de
  zoom não têm velocidade (mude a duração pela borda).

## Velocidade por duração e estender quadro

- **Velocidade / duração** (Propriedades ou botão direito › Velocidade do clipe): informe a duração
  desejada em segundos, `mm:ss` ou `hh:mm:ss`, com decimais por ponto ou vírgula (`1:30,5`). A velocidade
  é calculada para manter o trecho inteiro, entre 0,25× e 8×. Com vários clipes, o tempo é a soma das
  durações dos clipes elegíveis; todos recebem a mesma velocidade. Faixas travadas ficam intactas.
- **Estender quadro…** (Propriedades ou botão direito): posicione o cursor no vídeo e informe o tempo
  adicional. Insere uma imagem silenciosa daquele quadro e retoma o vídeo depois, deslocando os clipes
  seguintes da mesma faixa. Fora do clipe, usa o início ou o último quadro. Outras faixas não se movem.
  Preserva posição, tamanho, recorte, transparência, cursor e zoom do clipe no quadro capturado.
  O quadro estendido pode ser aparado pelas bordas como uma imagem. Um Ctrl+Z desfaz a operação inteira.

## Transições

- Dissolver, passar pelo preto, cortina (→ ← ↓ ↑), círculo abrindo e fechando, relógio, deslizar, zoom,
  virar página, dobrar papel (a folha descola do canto mostrando o verso), glitch (blocos, cores separadas,
  varredura e flashes; a cena anterior sobrevive em blocos) e cinco transições de cor: giro de cores, faixas,
  círculos, painéis e portas. As cores vêm da paleta da aula, de conjuntos prontos (arco-íris, neon, pastel,
  fogo, noite, preto e branco) ou uma a uma (2 a 5), no painel do corte selecionado. As formas de cor são
  expressões únicas: o ffmpeg as avalia na exportação e um avaliador próprio na prévia (sem eval).
- Cada corte entre clipes colados tem um ◆ na timeline: clique para selecioná-lo e escolher a transição no
  painel (só naquele corte), ou arraste a transição do painel até o ◆. Delete remove a transição do corte
  selecionado. "Todos os cortes" (aplicar a escolhida / remover todas) fica numa seção à parte do painel.
- Máscaras e página: a cena que sai continua por cima da que entra (o último quadro segura se a mídia acabou)
  e some pela mesma curva na prévia (CSS) e na exportação (`geq`/`perspective`, ligados só durante a transição).
  Glitch e giro de cores são efeitos de tela cheia centrados no corte; o glitch da prévia é uma aproximação mais
  leve do que a exportação desenha pixel a pixel.

## Camada de zoom

- Barra lateral › Zoom › "Adicionar camada de zoom": um clipe que aproxima **tudo que está nas faixas abaixo dele**
  enquanto dura, com entrada e saída suaves; o que está acima (anotações, legenda) fica como está. Entra numa faixa
  nova no topo; arraste para uma faixa mais baixa para deixar camadas de fora.
- Com a camada selecionada, a prévia mostra o quadro sem zoom e um retângulo com a área que vai encher a tela:
  arraste para mover, rodinha do mouse para aproximar mais ou menos. Propriedades: força, ponto (atalhos de
  posição) e suavidade.
- Como no Camtasia, entrada e saída são opcionais: "Aproximar suave" ou "Começar já no zoom"; "Voltar suave ao
  normal" ou "Ficar no zoom até o fim". "Continuar em outro ponto" cria a etapa seguinte colada na atual: o zoom
  desliza de um ponto a outro sem voltar ao normal; "Voltar ao normal aqui" é o "Restaurar" (uma etapa em 1×).
- A exportação aplica o zoom ao composto das faixas de baixo naquele ponto da pilha (`zoomLayerFilter`), com as
  mesmas curvas da prévia (`shared/zoomLayer.ts`). IA: `add_zoom`.

## Gravação guiada da plataforma web

- **MP4 do HeyGen:** em **Importar áudio ou MP4 do HeyGen**, selecione o vídeo exportado com a voz. O EdiAula extrai a primeira faixa de áudio em WAV, preserva o MP4 original e usa o mesmo WAV para escuta, transcrição e narração na timeline. Não é necessário converter o arquivo antes. Vídeos sem faixa de áudio mostram uma mensagem de erro.
- O modo **Manual** permanece disponível e é o padrão. Em Gravar, escolha **Guiado por roteiro/áudio** para preparar uma demonstração.
- **Abrir ambiente de aula** abre uma janela web isolada, sem acesso à ponte do editor. Entre na plataforma normalmente e pressione **F8** para voltar ao gravador. Os dados de login ficam no perfil local dessa janela.
- Cole o roteiro (uma etapa por linha) ou importe a narração. O roteiro produz tempos estimados; a transcrição propõe tempos nas palavras “clique”, “clicar” e “clicamos”. A transcrição depende do motor/modelo já configurado. Também é possível definir etapas e tempos manualmente.
- Revise as ações e, em cada etapa, escolha **Marcar alvo**, posicione o cursor e pressione **F8**. Na janela da aula, botões usam seletores de elementos e são localizados novamente antes de executar. Canvas e iframes usam pontos relativos; outros navegadores usam posições fixas. Mudanças de conteúdo de jogos precisam de revisão: ainda não há reconhecimento visual do resultado das ações.
- Ritmo didático inicial para aulas de **9 a 14 anos**, ajustável: movimento suave de **1,2 s**, chegada **0,5 s antes da fala**, espera mínima de **0,8 s** no alvo antes do clique e **1,5 s** após a ação. Em cada etapa, **Fala começa em (s)** indica o início da frase e **Ação em (s)** indica quando clicar. A chegada considera ambos: o cursor espera no botão enquanto a explicação começa. Uma preparação inicial permite antecipar o cursor mesmo na primeira fala. Etapas próximas demais são recusadas; ajuste o roteiro/áudio para caberem as pausas.
- A importação de áudio sugere o começo da frase anterior ao comando, respeitando pontuação e pausas; revise essa sugestão na narração. Planos sem um início de fala separado usam o instante da ação como referência. A localização dos elementos começa antes do movimento; atrasos de localização ou saltos durante o trajeto interrompem a execução, sem acelerar para compensar. O modo Manual continua sem automação.
- Ações: apontar, clique esquerdo/direito, clicar e digitar, e teclas de navegação. **F9** pausa/retoma; **F10** interrompe e salva. A execução pausa se perder o ritmo ou se o alvo estiver ausente, coberto, deslocado durante a aproximação ou em outra janela.
- Com áudio importado, microfone e áudio do PC são desligados para evitar duplicação. Use fones para acompanhar. O arquivo de voz é copiado para a pasta da gravação e inserido numa faixa própria, alinhado ao vídeo e preservando o cursor editável. Sem áudio importado, grave a demonstração e use **Narrar intervalo** depois.
- A conclusão das etapas encerra a gravação automaticamente. A correspondência de alvos e a sincronização final devem ser revisadas na aula real antes de publicar.

## Estrutura

Quando a licença deixa de autorizar o uso, novas tarefas ficam bloqueadas. A gravação e a execução guiada param imediatamente; o vídeo permanece em `Documentos/EdiAula/Gravações`, em pasta exclusiva por sessão. Segmentos usam MP4 fragmentado para permitir recuperação de uma interrupção. Uma falha de finalização informa a pasta preservada. Exportação, proxy, chroma e transcrição já iniciados têm até 30 minutos para concluir, sem reiniciar esse prazo; uma exportação interrompida não substitui os arquivos anteriores. Consulte [o registro de preservação](../../docs/propostas/edi-suite-2026-10-16/producao-jobs.md).

```
src/main       processo principal: FFmpeg, projetos, protocolo media://, IPC
src/preload    ponte segura window.api
src/shared     tipos, operações da timeline e plano de exportação (testados)
src/renderer   interface React (home, editor, timeline, preview, exportação)
tests/         testes com node:test
```
