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

`dev`, `build`, `test` e `shortcut` compilam antes o auxiliar nativo (`resources/native/ediaula-helper.exe`,
fontes em `native/helper`) com o compilador C# do .NET Framework 4.x que vem no Windows; a variável `CSC` aponta
outro `csc.exe`. A compilação só roda de novo quando mudam as fontes ou a versão. Fora do Windows o passo apenas avisa.
Se o executável estiver em uso por um EdiAula aberto em desenvolvimento, o comando para e pede para fechá-lo.

Os testes do auxiliar que geram cliques, rolagens e movimentos reais (retidos pelo próprio teste, mas ainda
assim entrada de verdade) só rodam com `EDIAULA_NATIVE_INPUT_TESTS=1`; `pnpm edi:media:test` liga essa variável.

## Etapa 1 (pronta)

- Tela inicial com projetos recentes, cursos e "continuar editando"
- Projetos `.ediaula` em `Documentos/EdiAula/Projetos`, com salvamento automático
- Importar vídeo, áudio e imagem (botão, Ctrl+I ou arrastar do Explorer)
- Miniaturas, formas de onda e proxy 720p automático para vídeos 4K
- Timeline com faixas de vídeo e áudio: mover, aparar, cortar (C), dividir (S), ímã, excluir com ripple, fechar lacunas, travar/ocultar/silenciar faixas
- **Fechar lacunas** (barra da timeline ou Editar) só remove os trechos vazios em todas as faixas ao mesmo tempo, então balões, avatar, camadas de zoom e voz continuam sincronizados; a música segue tocando e termina com a aula, e faixas travadas ficam exatamente como estão. Para encostar os clipes de uma faixa só, clique com o botão direito no nome dela › **Fechar lacunas desta faixa** (começa no primeiro clipe da faixa, não em 0:00)
- Preview sincronizado com J/K/L, quadro a quadro e tela cheia
- Desfazer/refazer de tudo
- Exportação MP4 H.264 pela GPU (NVENC, AMF ou Media Foundation) ou pela CPU (x264), com normalização −14 LUFS

## Salvamento e mídias ausentes

- Se o salvamento falhar, o aviso fica fixo na barra de cima até um salvamento dar certo, com **Tentar de novo** e **Salvar cópia…**. A cópia ganha o nome do arquivo escolhido e a edição continua nela. Voltar ao início, abrir ou criar outro projeto e fechar a janela (pelo X ou Alt+F4) esperam o texto que está sendo digitado, as anotações sendo redesenhadas e o salvamento, com o aviso "Salvando antes de fechar…" quando demora; se o salvamento falhar ou passar de 20 s, uma janela pergunta o que fazer: tentar de novo, salvar uma cópia, sair sem salvar ou cancelar. Com exportações na fila, a janela continua aberta e nada é descartado.
- Salvar e exportar mandam o projeto ao processo principal como texto (um valor só, por maior que seja a aula), validado uma vez, com o mesmo teto de 32 MB da abertura; as posições do cursor vão como lista binária, então gravações longas (27 min ou mais) também exportam. Um projeto que não poderia ser reaberto não é salvo, e uma falha na lista de recentes não impede o salvamento.
- Os zooms pertencem à gravação, no tempo dela, como o cursor: cada clipe mostra os do seu trecho. Cortar, aparar e desfazer o aparo pela borda nunca perde nem duplica um zoom, e um zoom tirado fica fora. Projetos antigos, com os zooms copiados em cada pedaço, são convertidos ao abrir.
- Cada pedaço de um clipe cortado (dividir, sobrescrever, aparar, estender quadro, cortes da transcrição) mostra exatamente o mesmo movimento e a mesma vista da camada de zoom do original (`src/shared/pieces.ts`): o pedaço guarda todas as posições do movimento, então aumentá-lo pela borda traz o movimento de volta, e a camada de zoom mantém o tempo da entrada e da saída mesmo num pedaço curto. Um corte no meio tira a entrada e a saída das bordas de dentro; cortar a cabeça ou o rabo de um clipe só move aquela borda, com a transição, o fade e a animação dela.
- Ctrl+Z desfaz também a remoção de fundo. O que o app descobre sobre a mídia (miniatura, forma de onda, proxy, transcrição, vídeo recortado, arquivo ausente) e o tempo de edição medido não voltam com o desfazer.
- **Arquivo sumiu · Reconectar…** (na biblioteca) ou **Reconectar…** no aviso da exportação: aponte o arquivo no novo lugar. Ele precisa ser a mesma mídia (mesmo tipo, duração com até 0,5 s de diferença e mesmo tamanho de quadro). Cortes, zooms, transcrição e caches continuam, e o `cursor.json` de uma gravação é reconectado junto quando está ao lado do vídeo. Os outros arquivos ausentes são procurados uma vez na mesma pasta; **Procurar em uma pasta…** procura todos numa pasta escolhida, pelo nome e pelo tamanho do arquivo, até três níveis abaixo, abrindo só arquivos de mídia e liberando só os que são a mesma mídia. **Cursor sumiu** pede só o arquivo de dados do cursor.
- Imagens do próprio editor (anotações e a imagem vazia das camadas de zoom) são desenhadas de novo quando o arquivo some, sem precisar procurar.
- A lixeira da biblioteca pede confirmação quando a mídia tem clipes na timeline.

## Etapa 2 (pronta)

- Transcrição local com whisper.cpp (instalado pelo próprio app na primeira vez: GPU NVIDIA ou CPU)
- Modelo `large-v3-turbo` (recomendado) ou `small`; os `ggml-*.bin` de `C:\whisper-cpp` entram só se você marcar a opção no painel, e o app avisa que não os confere
- Tempos por palavra com DTW + silêncios medidos pelo FFmpeg
- Painel de transcrição: clique numa palavra para ir até ela, selecione palavras e aperte Delete para cortar
- Limpeza automática: vícios de fala ("né", "tipo,", "ahn"…), frases repetidas e silêncios longos, com contagem e tempo economizado
- Cortes aplicados em todas as faixas de vídeo e de fala ao mesmo tempo (ficam sincronizadas); trilha de música é preservada e acompanha o novo final; faixas travadas nunca são tocadas
- Legenda `.srt` gerada da transcrição editada, salva junto do MP4

O motor e os modelos ficam em `%APPDATA%\ediaula\whisper`.

**Downloads conferidos.** O motor (build `b5454` do whisper.cpp, a versão noturna da v1.9.5), os dois modelos oferecidos e o modelo Silero de detecção de voz têm SHA-256 e tamanho fixados em `src/main/whisperAssets.ts`, tirados do que o GitHub publica para cada arquivo da release e do SHA-256 que o Hugging Face lista para cada modelo, numa revisão fixa do repositório. O hash é calculado durante o download (`src/main/download.ts`) e conferido antes de o arquivo ir para o lugar: se não bater, o `.part` é apagado e nada é instalado. Dois pedidos do mesmo arquivo ao mesmo tempo viram um download só. O zip do motor é extraído numa pasta temporária, cada arquivo é conferido contra `src/main/whisperManifest.ts` (gerado por `scripts/build-whisper-manifest.mjs` a partir dos zips oficiais conferidos) e só então o motor em uso é posto de lado e trocado pelo novo; se a troca falhar, o antigo volta, e o zip só é apagado depois do sucesso. Motor e modelos instalados antes desta conferência são conferidos na primeira transcrição; o que não bater sai da lista e precisa ser baixado de novo. Os nomes das pastas e arquivos temporários são gerados pelo app, nunca a partir do que chega da interface.

**Retomada.** Um download interrompido deixa o `.part` e um `.part.json` (endereço, ETag e tamanho). A tentativa seguinte confere de novo o que já está no disco e pede só o resto (`Range` com `If-Range`); um servidor que não aceita continuar manda o arquivo inteiro, e o download recomeça do zero. Um `.part` com mais de 7 dias é apagado quando o app abre.

**Detecção de voz e alucinação.** Quando o `whisper-cli --help` lista `--vad`, a transcrição usa `--vad --vad-model` com o Silero (baixado junto com o motor, conferido antes de cada uso e baixado de novo se não bater, com tempo limite). Com VAD, o JSON do whisper.cpp deixa os tempos das palavras no áudio encurtado; o app lê a tabela de trechos que ele registra no log, confere que veio inteira e devolve cada palavra ao tempo do arquivo (`src/shared/whisperParse.ts`). Sem a tabela inteira, a transcrição é feita de novo sem VAD; quando o VAD não acha fala nenhuma, o resultado vazio vale. Se o whisper falhar com VAD, o modelo do VAD é apagado e a transcrição segue sem ele. O arquivo de cache leva no nome o modo que rodou de fato. O filtro de alucinação marca, sem apagar: palavras de confiança baixa no meio de um silêncio de 0,5 s ou mais (onde o VAD ouviu fala não conta como silêncio), créditos de legenda ("Legendas pela comunidade Amara.org") e despedidas de vídeo ("Obrigado por assistir", "Inscreva-se no canal") mal ouvidas ou em silêncio sem confiança. As palavras marcadas não aparecem no texto, mas ficam como marca discreta na transcrição e voltam com um clique. O whisper usa os núcleos do processador menos dois (de 2 a 16), e o WAV e o JSON temporários são apagados também quando a transcrição falha.

**Glossário corrigindo na leitura.** O glossário do curso (até 60 termos; acima disso o app recusa e avisa) e os nomes do roteiro corrigem o texto quando a transcrição é lida (`src/shared/glossary.ts`): sem acento nem caixa, pelo som ("Zapi" vira "Zappy"), juntando palavras partidas ("de binha" vira "Debinha"), com até uma letra de diferença em nomes de até 5 letras e duas acima disso. Uma palavra que existe em português nunca é trocada, nem muda de caixa: a lista de 48 mil palavras em `src/shared/lexicon/` vem da lista de frequência FrequencyWords (legendas do OpenSubtitles, licença CC BY-SA 4.0, registrada em `LICENSE-pt-words.txt`; gerada por `scripts/build-pt-lexicon.mjs`). Toda troca que não seja só de caixa ou acento exige que o whisper estivesse inseguro (confiança abaixo de 0,8). Do roteiro entram só os falantes, os nomes de várias palavras ("Sistema Zero", "Chave do Farol") e palavras que não existem em português ("Zappy"); botões como "Salvar" e "Executar" ficam de fora. As palavras que o glossário mudou ficam marcadas, com a dica "corrigido pelo glossário: era X". Mudar o glossário corrige na hora, sem transcrever de novo; o campo fica na aba Transcrição, em **Glossário do curso**. O glossário fica guardado por curso, fora do projeto, e não volta com Ctrl+Z. Só os 20 termos mais citados no roteiro entram no prompt do whisper.

**Editor de palavras.** Duplo clique numa palavra da transcrição (ou F2 e Enter pelo teclado) abre a correção. Enter ou um clique fora confirma, Esc cancela, e o foco volta para a palavra. Dá para aplicar em todas as ocorrências (o editor mostra quantas são; "esta" e "está" contam como palavras diferentes), adicionar ao glossário do curso, mover o começo e o fim em passos de 50 ms, ouvir a palavra com 0,3 s antes e depois e começar uma legenda nova naquela palavra. Texto vazio tira a palavra da transcrição sem cortar o vídeo; a palavra tirada fica como marca discreta e volta com um clique. Uma palavra juntada pelo glossário é editada inteira, e mexer numa palavra corrigida guarda a correção junto; digitar o que o whisper ouviu desfaz uma troca errada do glossário naquela palavra. As correções ficam no projeto (`wordEdits` de cada mídia, no tempo da fonte, com o texto e o tempo originais), acompanham cortes e divisões e entram no Ctrl+Z; numa transcrição refeita, cada correção procura a mesma palavra a até 1 s de onde estava, e o painel avisa quantas não acharam lugar. São aplicadas num lugar só, onde as palavras da mídia são lidas (`src/shared/wordEdits.ts`), então legenda gravada, `.srt`, `.vtt`, karaokê, prévia e IA veem o texto corrigido. Palavras de confiança baixa aparecem sublinhadas em laranja.

## Inteligência artificial

Duas formas, configuradas em **Configurações › Inteligência artificial** (ícone de engrenagem):

1. **Com a sua assinatura (igual ao pen):** o EdiAula abre um servidor MCP local em `http://127.0.0.1:47321/mcp`.
   O botão **Conectar** registra o EdiAula no Claude Code ou no Codex. Depois é só pedir lá
   ("limpe a aula aberta no EdiAula", "gere os capítulos") e acompanhar as edições ao vivo.
2. **Assistente dentro do app:** aba **Assistente**. O motor pode ser o Claude Code (assinatura do Claude),
   o Codex (assinatura do ChatGPT) ou a API da Anthropic (chave cobrada por uso, guardada criptografada).

As duas usam as mesmas ferramentas (`src/shared/aiTools.ts`): visão geral, ler transcrição, sugestões e
limpeza automática, cortar frases ou trechos, propor cortes, desfazer, mover o cursor, salvar título/descrição/capítulos/resumo,
transcrever, importar mídia e abrir/criar projetos. Toda edição entra no histórico (Ctrl+Z).

**Modelos (chave da API):** Claude Opus 5.5 (padrão e recomendado), Claude Sonnet 5.5 e Claude Haiku 5.5 (econômico).
Quem tinha escolhido o Claude Opus 5 continua nele, com um aviso de que o Opus 5.5 é mais novo e mais barato; o
Claude Haiku 4.5 passa sozinho para o Haiku 5.5. Cada pedido vai com raciocínio adaptativo e com o **esforço**
escolhido em Configurações (Alto por padrão; também vale para o Claude Code). Conversas longas são compactadas pela
própria API, e quando um filtro de segurança recusa um pedido o Opus e o Sonnet tentam de novo num modelo
alternativo (o Haiku 5.5 não tem essa opção). O histórico da conversa só cresce: uma falha vira um resultado de erro,
nunca uma mensagem apagada. O painel mostra os tokens e o custo de cada pedido e o total da conversa: na chave da API
é o preço da Anthropic (`src/shared/aiModels.ts`); no Claude Code aparece o equivalente na API, porque a
assinatura não cobra por pedido; no Codex aparecem só os tokens.
`get_transcript` devolve 10 minutos por vez (com `next_from` para continuar) ou um resumo de uma linha por parágrafo.

**Conexões e permissões:** cada token é uma permissão, guardada só como hash num arquivo protegido de cada
ferramenta, ao lado da sessão da suíte (`packages/edi-desktop/src/access.ts` e `grants.ts`; a sessão compartilhada não
recebe nada que uma ferramenta mais antiga recusaria). O **Conectar** dá ao Claude Code ou ao Codex um token próprio que
pode **ler** a aula e **propor** cortes; para **alterar** a aula, cada pedido abre no EdiAula a janela "A IA quer
alterar a aula", com todos os parâmetros do pedido e **Permitir uma vez**, **Permitir por 15 min neste projeto** e
**Negar** (Negar vem selecionado, os botões de permitir só funcionam depois de um instante e, sem resposta em 60 s, o
pedido é negado). Abrir ou criar projeto e importar mídia sempre perguntam, mesmo dentro dos 15 minutos. Um app que só
lê e propõe nunca apaga a proposta de outro: a nova fica junto, e a barra de propostas deixa escolher qual ver.
O **Conectar** não troca o token de um app que já está conectado (o Claude Code aberto regrava a configuração antiga);
**Reconectar** troca, e depois é preciso fechar e abrir o app. O token de uma versão anterior continua funcionando por
30 dias, só para ler e propor, e deixa de valer no primeiro **Conectar**. Ele ainda aparece nas cópias
`.claude.json.edi-backup-*` e `.codex\config.toml.edi-backup-*` que o Conectar guarda ao lado da configuração dos apps:
o EdiAula não apaga arquivos desses programas, então apague essas cópias se quiser. O chat do Assistente usa, a cada
pedido, um token de 30 minutos (renovado enquanto o pedido roda) que só existe na memória, vai ao programa por
variável de ambiente (nunca na linha de comando nem em arquivo) e é revogado quando o pedido termina ou quando você
aperta Parar. A lista **Conexões com acesso** mostra quem pode falar com o EdiAula e tem **Revogar**; sair da conta Edi
neste computador revoga todas as conexões de todas as ferramentas, encerra os pedidos em andamento e fecha as janelas
do Claude Code só com o EdiAula.

**Configuração manual:** em **Claude Desktop e configuração manual**, **Gerar token para configuração manual** cria um
token que lê e propõe e preenche os trechos prontos, que já levam o cabeçalho de autorização:
- Claude Code: `claude mcp add --transport http --scope user ediaula http://127.0.0.1:47321/mcp --header "Authorization: Bearer <token>"`
- Codex (`.codex\config.toml` na pasta do usuário): seção `[mcp_servers.ediaula]` com `url` e
  `http_headers = { Authorization = "Bearer <token>" }`
- Claude Desktop: `npx -y mcp-remote@0.15.1 <url> --header "Authorization:${EDIAULA_AUTH}"`, com o token em
  `env.EDIAULA_AUTH` (o `mcp-remote` tem versão fixa, para nunca mudar sozinho).

O token aparece uma vez só; guarde como uma senha e revogue quando não usar mais. O servidor só aceita conexões deste
computador e recusa pedidos vindos de páginas web.

**O que cada motor alcança:** o Claude Code roda sem nenhuma ferramenta própria (arquivos, terminal, internet), só com
as do EdiAula. O Codex roda sem a configuração pessoal (`--ignore-user-config`), em modo só leitura, com busca na
internet desligada e com as funções da própria lista do Codex instalado (`codex features list`) que vão além do editor
também desligadas (terminal, agentes, navegador, imagens, extensões). O EdiAula só deixa passar mensagens, raciocínio,
lista de tarefas e chamadas ao servidor do próprio EdiAula: qualquer outra coisa (um comando, uma mudança de arquivo,
uma busca, outro servidor de ferramentas, outro agente) interrompe a conversa na hora. Antes da primeira conversa com
cada versão do Codex, o EdiAula pede a ele para chamar uma ferramenta do editor e depois ler um arquivo de teste: a
versão só fica marcada como restrita (em `ai.json`) quando ele chama a ferramenta e não consegue ler o arquivo; uma
resposta "não consigo" sem tentar não conta. Se ele lê o arquivo ou age fora do editor, a tela mostra "sem restrição
garantida" e o Codex só é usado depois de uma confirmação explícita. Os dois programas são abertos sem shell e a
mensagem vai pela entrada padrão, então `&`, `|`, `%VAR%`, quebras de linha e textos começando com "-" chegam como
texto, e roteiros longos cabem. Atalhos `.cmd` do npm e `.bunx` do bun são lidos para achar o programa de verdade (no
Codex, o `codex.exe` nativo); um atalho que não for reconhecido, ou que aponte para fora da própria pasta, não é aberto.
**Parar** revoga o token e encerra o programa com todos os processos que ele abriu.

**Caminhos de arquivo vindos da IA** (`import_media`, `add_image`, `set_audio`, `open_project`) são conferidos antes de
qualquer arquivo ser aberto (`src/shared/aiPaths.ts`, `src/main/aiPaths.ts`): caminhos de rede (`\\servidor`),
`\\?\`, `\\.\`, `file:`, `C:arquivo` e fluxos alternativos (`arquivo:fluxo`) são recusados, assim como atalhos que
levam para outro computador. Dentro da pasta do projeto, de Documentos, Downloads, Vídeos, Música, Imagens ou de uma
pasta que a aula já usa, o arquivo é aceito (nunca a raiz de uma unidade nem a pasta do usuário inteira); fora delas, o
EdiAula pergunta numa janela do Windows, sem travar as outras ferramentas, e a pergunta é recusada sozinha em 60 s.

**Regras de edição com IA**
- Um pedido do Assistente = um Ctrl+Z. O `undo` da IA desfaz só as edições dela, uma ferramenta por vez, e recusa
  quando a última edição foi sua. Uma edição sua no meio do pedido (soltar mídia, aplicar uma proposta) vira um passo
  seu, separado: só o que cada ferramenta da IA grava pelo próprio caminho conta como da IA.
- As chamadas de escrita rodam uma de cada vez; as leituras esperam a escrita em andamento. Uma ferramenta que passa de
  20 minutos responde à IA, mas a próxima só começa quando ela termina.
- Cada pedido fica preso à aula aberta quando começou: se você abrir outra aula, as chamadas seguintes são recusadas,
  e o chat do app não abre nem cria projetos.
- Edições amplas viram **propostas**: aparecem destacadas na timeline e você aplica ou descarta. A proposta fica salva
  na aula (até 2.000 itens; um trecho que passa por centenas de clipes vira vários itens), sobrevive a fechar e abrir,
  só se aplica na aula em que foi feita e cada item pode ser deixado de fora. Os itens ficam ancorados no tempo da
  mídia: um corte antes deles não os desloca e, se o trecho mudar, eles são procurados pelas palavras e, por último,
  pelo texto, mas só perto de onde estavam (a mesma frase em outra tomada é outro trecho). O que aparece na barra e na
  timeline é exatamente o que o Aplicar corta; um item que não é encontrado fica de fora, com aviso.
- **Trechos protegidos** (selecione palavras na Transcrição › Proteger) nunca são cortados por limpeza ou IA.
- Cortes por tempo exigem a **revisão** atual do projeto; se você mexeu depois, a IA relê antes.
- `transcribe` transcreve tudo o que se ouve na timeline e ainda não tem transcrição; clipes mudos ficam de fora e a
  voz extraída de um MP4 do HeyGen é transcrita uma vez só.
- **Encaixar** uma inserção nunca move uma faixa travada: se uma faixa travada tem algo depois do ponto onde seria
  preciso abrir espaço, o encaixe vira uma proposta com aviso e nada muda. Os templates de tela cheia fazem o mesmo:
  com uma faixa travada que ficaria para trás, eles não são inseridos e o aviso diz qual destravar.
- **Glossário por curso** (nomes, personagens, blocos) corrige a transcrição na leitura e orienta a IA.

**Outros:** vídeos com taxa de quadros variável ganham cópia de trabalho com taxa fixa; cópias de
segurança automáticas em `Projetos/.backups`; tempo de edição medido por aula; exportação com
.srt, .vtt e miniatura .jpg.

## Voz, HeyGen e tela: o caminho de uma aula

O caminho é este: gravar a própria voz lendo o roteiro, levar essa voz ao HeyGen para gerar o
avatar, trazer o MP4 de volta, gravar a tela sobre a voz e editar. Tudo roda no computador; o
HeyGen é usado pelo site dele, como sempre.

1. **Gravar a voz (modo Só voz).** Em Gravar, escolha **Só voz** em Modo de gravação. Só o
   microfone é gravado, em PCM 48 kHz, em partes Matroska (`voz-0.mkv`) que sobrevivem a uma
   queda; ao parar vira `voz.wav`. O diário, a recuperação de gravação interrompida e o painel de
   saúde valem igual.
   - O teleprompter fica grande no meio da tela, com a fala atual em destaque. Embaixo, escolha
     de quem são as falas que você vai gravar: vêm marcadas todas, menos as do Zappy e as de
     "não gravar".
   - **Ctrl+Shift+↓** e **Ctrl+Shift+↑** (ou o passador de slides) trocam a fala. Cada troca fica
     no diário, então cada tomada sai marcada com a fala dela. **Ctrl+Shift+R** joga fora a
     tomada atual: leia a fala de novo.
   - **Testar 5 s** mede o ruído do ambiente e o volume da voz (fique um segundo em silêncio e
     depois leia uma frase) e diz se é melhor chegar mais perto, se afastar ou baixar o ruído.
     Durante a gravação, a pílula avisa de silêncio longo e de voz estourando.
   - Com o motor e um modelo de transcrição instalados (aba Transcrição), marque **Teleprompter
     acompanha a voz**: o app escuta trechos de 4 a 6 s do microfone e passa para a próxima fala
     quando ouve o fim da atual (só contam as palavras ditas depois que a fala apareceu). A troca
     fica no diário no instante em que a última palavra terminou, não quando o reconhecimento
     respondeu. Ele prefere o modelo mais leve instalado e conferido (tiny, base ou small), com o
     motor e o modelo verificados como na transcrição, e usa o `whisper-server` do motor, que fica
     carregado. O servidor só escuta em `127.0.0.1`, numa porta sorteada, e vive enquanto a
     tomada grava; um servidor que sobrou de uma queda é encerrado na próxima vez. Se a máquina
     não acompanhar, o aviso aparece e a fala segue só pelo atalho; nada disso atrasa a gravação.
   - Ao parar, a voz entra na faixa **Voz**, depois da tomada anterior, e já começa a ser tratada.
     Se houve tomadas repetidas ou marcadas para refazer, aparece a proposta de limpeza.
2. **Tratar a voz.** Painel **Áudio › Voz**: escolha o tratamento (**Voz da professora**,
   **Suave** ou **Desligado**) e clique em **Tratar a voz** (vale para os clipes selecionados ou,
   sem seleção, para a faixa Voz). A Voz da professora corta o grave abaixo de 75 Hz, tira o
   ruído de fundo, suaviza o "s", comprime de leve e deixa a voz em -16 LUFS com pico de -1 dBTP
   (medido numa passada e aplicado com um ganho só na outra). Nas pausas o ruído que sobra baixa
   de leve, sem virar silêncio digital. Cada clipe usa o tratamento escolhido para a mídia dele.
   O arquivo tratado fica em cache (`cache/voz` no perfil do app), pelo conteúdo da gravação, e
   é o mesmo na prévia e na exportação. O cache guarda até 6 GB (o da narração, `cache/narracao`,
   até 3 GB) e o que ficou mais tempo sem uso sai primeiro; se o arquivo tratado de uma voz
   sumir, o app trata de novo sozinho ao abrir a aula ou ao exportar. **Ouvir o original**
   compara antes e depois na prévia. O tratamento espera uma gravação em andamento terminar,
   como os outros trabalhos de fundo.
   - O ruído sai pelo RNNoise (`arnndn` com o modelo `resources/rnnoise/sh.rnnn`, origem e
     licença em `resources/rnnoise/README.md`) no FFmpeg do app. No FFmpeg 6 de desenvolvimento,
     que deu resultados diferentes para o mesmo arquivo, o app usa o `afftdn` com o perfil de
     ruído aprendido no trecho mais quieto da gravação.
3. **Limpar a voz antes do HeyGen.** **Limpar a voz para o HeyGen** monta uma proposta só, item a
   item: das tomadas repetidas de uma fala fica a última completa (pelas tomadas da gravação e,
   com transcrição, pelo texto do roteiro); saem as tomadas marcadas para refazer, os vícios de
   fala e os silêncios longos, que viram uma pausa de 0,4 s. Aplicar desfaz com um Ctrl+Z.
4. **Exportar a voz para o HeyGen** (menu Arquivo ou painel Áudio): grava WAV 48 kHz, 16 bits,
   mono da faixa Voz, já tratada e cortada. Cada exportação ganha uma pasta própria dentro de
   **Para o HeyGen**, ao lado do projeto, com a data e a hora (`Para o HeyGen/2026-10-18 14h05m09`),
   e nunca apaga o que foi antes. Os arquivos levam o nome da aula e do trecho, como
   `Aula 3 (F1P1-D01).wav`. Dá para exportar a aula inteira, uma parte por seção do roteiro ou
   uma por inserção do avatar (como `F1P1-D01`); uma inserção que tem falas em vários parágrafos
   sai inteira, e dois trechos com o mesmo código fazem a exportação parar com um aviso para
   corrigir o roteiro. O envio de arquivo do HeyGen aceita até 32 MB por pedido; por isso cada
   arquivo tem no máximo 5 minutos (28,8 MB), dividido numa pausa. A aula guarda as últimas 20
   exportações (os mestres da voz), cada uma com o mapa de cada arquivo para a timeline.
5. **Importar vídeo do HeyGen** (menu Arquivo ou painel Áudio): escolha um ou vários MP4. Cada um
   é comparado pelo próprio som (correlação no envelope e depois no sinal) com todos os arquivos
   exportados que ainda estão no disco, e entra na faixa do avatar onde o mapa do arquivo
   vencedor diz que aquela voz está agora, seguindo os cortes feitos antes e depois da
   exportação. A voz como está agora só é usada quando nenhum arquivo enviado sobrou. O fundo
   liso sai sozinho e o avatar vai para o lado, como nas inserções. Uma pausa curta entre dois
   clipes da voz (até 1,5 s) não faz o avatar sumir, e o esmaecimento fica só nas pontas. O som
   do HeyGen entra mudo, porque vale a voz tratada; com **Usar o som do HeyGen**, a voz fica
   calada só naquele trecho, marcada como calada para o HeyGen, sem mudar a voz enviada nem dar
   aviso de voz editada. Um vídeo um pouco mais longo ou mais curto que a voz é acelerado ou
   freado o necessário.
   - Se a voz foi editada depois da exportação, o app só avisa: o encaixe segue o mapa do
     arquivo enviado e já respeita os cortes.
   - Quando o encaixe é incerto (confiança baixa, dois arquivos que servem igual em lugares
     diferentes, ou nada a encaixar), o vídeo não entra às cegas: a barra acima da timeline
     mostra o melhor palpite, com **Ir para lá**, **Encaixar aqui** e **Descartar**.
6. **Gravar a tela sobre a narração.** No painel Áudio (ou no menu Arquivo), **Gravar a tela
   sobre a narração** abre o gravador nesse modo: a voz da aula toca nos fones a partir do cursor
   da timeline enquanto a tela é gravada. O teleprompter mostra a voz em karaokê, com a palavra
   atual acesa, e as próximas instruções "Na tela" do roteiro. Microfone e áudio do PC começam
   desligados (a voz já existe); dá para ligar. Pausar pausa as duas coisas: a pausa vira corte
   na tela e a voz continua do mesmo ponto. O take entra na faixa da tela no tempo da voz: o
   gravador anota, a cada meio segundo, que segundo da voz estava sendo ouvido, já descontada a
   latência da saída de áudio.
   - **Regravar a tela neste intervalo:** marque um intervalo na régua da timeline e use o botão
     ao lado de Narrar intervalo. A voz começa dois segundos antes, a gravação para sozinha no
     fim do intervalo e só aquele trecho da tela é trocado, na faixa em que a tela gravada está.
     Se você parar antes do fim, só o que foi gravado é trocado.
7. **Editar e exportar** como sempre. A exportação usa a voz tratada; se algum tratamento ainda
   não terminou, ela trata antes de exportar.

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
  ajustável, câmera (com prévia e modo escolhido sozinho ou à mão), microfone (com medidor) e **teleprompter**
  com as falas do roteiro do projeto. Nada disso aparece na gravação (proteção de conteúdo do Windows).
- O gravador lembra as escolhas entre uma gravação e outra (`recorder.json`, no perfil do app): tela, região,
  microfone, câmera e modo, áudio do PC, teclas, quadros por segundo (30 ou 60), qualidade, contagem, atalhos,
  tamanho e ritmo do teleprompter e se os trabalhos de fundo esperam a gravação. Um microfone ou câmera que não
  está mais ligado dá lugar ao padrão, sem apagar a escolha salva. **Opções do gravador** (engrenagem) muda as
  que não estão na barra.
- Atalhos (configuráveis): **F9** inicia e pausa, **F10** para, **F8** marca o alvo do modo guiado,
  **Ctrl+Shift+M** marcador, **Ctrl+Shift+R** refazer o último trecho (vira proposta de corte, da pausa antes do
  trecho errado até a pausa depois da marca), **Ctrl+Shift+↓** e **Ctrl+Shift+↑** próxima fala e fala anterior do
  teleprompter. Um passador de slides (Page Down e Page Up) também muda a fala, se ligado nas opções. Iniciar,
  parar e o alvo valem enquanto o gravador está aberto; os outros só durante a gravação, então Ctrl+R e as setas
  continuam funcionando nos outros programas. Atalho que outro programa já usa ou que repete outro aparece no
  painel; sem iniciar e parar a gravação não começa.
- **Pausa instantânea:** pausar não fecha nada. Tela, microfone e câmera continuam gravando; a pausa é anotada e
  vira corte quando a gravação entra no projeto. Retomar é imediato e as primeiras palavras depois do F9 não se
  perdem. Só uma pausa de mais de 5 min fecha a parte da tela e da câmera, para poupar disco; aí a retomada leva
  cerca de 1 s e o gravador avisa. A gravação termina no instante do F10 (ou de **Parar**): o que vem depois,
  enquanto os arquivos fecham, fica de fora. **Descartar** (lixeira na pílula) manda o take para a Lixeira e
  volta ao começo sem fechar o gravador.
- **Cada fonte é um processo:** tela, microfone e câmera gravam em FFmpeg separados, então a falha de um não
  derruba os outros. Se a tela ou o microfone param (disco, dispositivo desligado, driver), a gravação pausa sozinha
  e o aviso oferece **Retomar** (reabre a fonte numa parte nova) ou **Parar e salvar**. Retomar abre só o que
  está parado; se uma das fontes não abrir, as que abriram fecham de novo e a gravação continua pausada, então
  tentar outra vez nunca deixa duas gravações da mesma fonte. Se a câmera para, a gravação segue sem ela e
  avisa. Microfone e câmera são abertos pelo nome único que o Windows dá ao dispositivo, então um nome com ":"
  também funciona; a interface e as opções guardam o nome que aparece para você.
- **Painel de saúde** na pílula, atualizado dez vezes por segundo: nível do microfone (do mesmo processo que
  grava, então é o microfone certo), aviso de silêncio depois de 10 s abaixo de -55 dBFS, minutos de disco que
  restam no ritmo da gravação, quadros perdidos quando houver, estado do cursor e o aviso mais importante ("a
  máquina não acompanha" quando o codificador fica abaixo do tempo real por 5 s, pela velocidade dos últimos
  instantes). Nos primeiros 12 s de cada parte o painel não conta quadros nem lentidão, e depois conta só o que
  o codificador perdeu a partir dali, mais o que o FFmpeg duplicou ou descartou. O disco reserva o que a
  finalização vai precisar (o som de novo, e a tela inteira se for juntar as partes): com menos de 10 min além
  disso avisa; com menos de 300 MB pausa e fecha os arquivos, para o disco parar de encher; com menos de 100 MB
  para e salva. O painel também avisa quando não vai sobrar espaço para juntar a tela. Na preparação, o medidor
  abre o mesmo dispositivo que a gravação vai usar.
- A tela é gravada pela Desktop Duplication **sem o ponteiro**. Ao abrir o gravador, o EdiAula grava a própria
  tela por três segundos com cada codificador, no tamanho do monitor e na taxa da gravação, nesta ordem: NVENC,
  AMF e Media Foundation (que alcança o Quick Sync da Intel), primeiro com o quadro ainda na GPU e depois pela
  memória, e por último o x264 pela CPU. Fica com o primeiro que acompanha a taxa; se nenhum acompanhar, com o
  mais rápido que funcionou. O painel mostra "Testando o codificador nesta tela…" e depois o escolhido. A matriz
  de cor é medida e marcada no vídeo. O resultado fica em `encoders.json`, no perfil do app, por tela, tamanho e
  taxa; a chave inclui o FFmpeg, as placas e drivers e a versão do app. Codificador que não existe na máquina não
  é testado de novo; escolha feita porque um melhor estava ocupado é refeita no dia seguinte.
- Se o codificador escolhido não abrir a gravação, o EdiAula tenta o caminho seguinte (o mesmo pela memória,
  depois o x264), registra a falha para não escolher aquele caminho de novo e avisa no resultado da gravação.
  Pela CPU a conversão é sempre BT.709 em faixa limitada, e o vídeo é marcado assim. Todos os codificadores
  rodam no modo de baixa latência (NVENC sem atraso, AMF com latência baixa, Media Foundation no cenário de
  transmissão de tela, x264 com `zerolatency`), porque o começo de cada parte é calculado pela saída do
  codificador.
- **Microfone com relógio de parede:** o som do microfone segue o relógio do Windows (`aresample` assíncrono),
  sem deriva em relação ao vídeo numa aula longa. A câmera abre no melhor modo que ela oferece (MJPEG até 1080p na
  taxa pedida, senão NV12 ou YUYV até 720p, senão o maior), e o atraso da imagem dela é ajustável nas opções. O
  áudio do PC vai para o disco a cada segundo, nunca pausa, e é esticado de volta ao relógio quando deriva mais
  de 0,1% e mais de 50 ms.
- Um auxiliar nativo (`ediaula-helper.exe`) registra movimentos, formato do cursor, cliques e teclas no mesmo
  relógio do vídeo, sem PowerShell. O gancho do mouse só copia o evento; quem escreve é outra linha de execução,
  então o Windows não o desliga quando o app demora a ler. Se o gancho cair mesmo assim, o auxiliar o reinstala e
  segue lendo a posição do ponteiro; se o auxiliar parar, o app o reinicia (até três vezes por minuto), e se ele
  parar de vez a pílula da gravação mostra "sem cursor". O vídeo continua; os avisos vão junto com a gravação.
  Os atalhos do gravador, como estiverem configurados, não entram nas teclas na tela. O ponteiro sobre os
  controles do gravador (pílula, teleprompter, avisos) não entra no vídeo: ele fica parado onde estava, e os
  cliques ali não viram onda nem zoom automático.
- **Arquivos** em `Documentos/EdiAula/Gravações/<data>/`. Durante a gravação, cada fonte grava em partes de MP4
  fragmentado (`tela-0.mp4`, `microfone-0.m4a`, `camera-0.mp4`, `sistema.webm`; no modo Só voz, `voz-0.mkv` em PCM), legíveis até o último fragmento
  se algo cair; o auxiliar grava `cursor.jsonl` e as imagens dos cursores em `cursors/`; e o app grava
  `sessao.jsonl`, o diário da sessão (começo, primeira amostra de cada parte, pausas, marcadores, falhas, falas do
  teleprompter, parada), que vai ao disco nas pausas, marcadores, falhas e na parada e a cada 5 s. Ao parar, as
  partes da tela viram `tela.mp4` comum (busca rápida) se houver espaço para a cópia; o microfone e o áudio do PC
  são cortados no que cada parte da tela cobre, com silêncio onde faltar, e saem em `microfone.m4a` e
  `sistema.m4a` começando no segundo 0 da tela; a câmera fica como foi gravada; o `cursor.json` (versão 2, com as
  pausas, os trechos sobre os controles e as lacunas do auxiliar) e `gravacao.json` são escritos. Cada arquivo
  novo é conferido pela duração e gravado no disco antes da linha `finalized`, e só então as partes copiadas
  saem; uma parte que não sai (arquivo preso) vira aviso e o take não se perde. Sem espaço para alinhar o som,
  o microfone e o áudio do PC ficam nas partes em que foram gravados, colocados pedaço a pedaço. O editor lê
  `cursor.json` da versão 1 como versão 2.
- **Gravação interrompida:** se o app ou o computador caírem durante uma gravação, ao abrir o EdiAula de novo
  aparece "Gravação interrompida" com **Recuperar e importar** (confere cada parte, refaz o MP4 se o último
  fragmento estiver quebrado e finaliza como se tivesse parado), **Mostrar pasta** e **Descartar** (Lixeira).
  Uma gravação que terminou mas não chegou a entrar num projeto (o app fechou antes, ou a importação falhou)
  também aparece, com **Importar**: o diário só marca o take como importado depois que todos os arquivos
  entraram e o projeto foi salvo. Se a finalização falhar, o editor avisa na hora e abre a lista. Se só a janela
  do gravador cair, o que foi gravado é salvo e entra no projeto. Gravações feitas antes do diário não aparecem
  ali.
- **Faixas separadas na importação:** a tela vai na faixa de vídeo principal (se ela estiver travada, numa faixa
  "Tela" nova, depois de tudo o que a aula já tem), a câmera na faixa acima (uma faixa "Câmera" é criada se só
  houver uma), o microfone na faixa "Voz", o áudio do PC na dele e a narração guiada na
  dela; faixas existentes são reaproveitadas quando estão livres. As pausas viram cortes em todas ao mesmo tempo,
  e os cortes da limpeza e as inserções do roteiro passam a levar junto o microfone e o áudio do PC, mesmo antes
  da transcrição. Os trechos de Ctrl+Shift+R são propostos por pedaço, pelo som do microfone.
- **Trabalhos de fundo esperam a gravação:** proxies, remoção de fundo e transcrição que começariam durante a
  gravação esperam ela acabar, e a fila de exportação segura o próximo item ("Exportação em espera"); o que já
  estava rodando continua com prioridade baixa. Dá para desligar nas opções do gravador.
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
- **Legenda por legenda** (barra lateral › Legendas, com a legenda no vídeo ligada): a lista de todas as legendas.
  Clique numa palavra para começar uma legenda nova nela (`captionBreaks`); **Juntar à anterior** desfaz a quebra.
  O pincel dá a uma legenda só a sua posição, tamanho ou cor (`cueStyles`), e **Como as outras** volta ao estilo do
  projeto. Quebras e estilos valem igual na prévia e na exportação; o `.srt` continua com a divisão automática.
- **Movimento por keyframes** (Propriedades › Movimento): marque posições em momentos diferentes; o clipe desliza
  entre elas. Com keyframes, arrastar no vídeo ajusta a posição daquele momento (`shared/keyframes.ts`).
- **Áudio do PC** na gravação (loopback do Windows pelo Chromium), numa faixa própria já alinhada e cortada nas
  mesmas pausas da tela.
- **Teclas na tela**: atalhos (Ctrl/Alt/Win+…) e setas/Enter/Tab/Esc/Delete/F1 a F12 aparecem num balão no canto.
  Espaço e Backspace sozinhos não aparecem, porque o auxiliar não tem como saber se o foco está num campo de
  texto; AltGr e Alt com o teclado numérico também ficam de fora, porque escrevem caracteres.
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
- O modo **Tela** (gravação à mão) permanece disponível e é o padrão. Em Gravar, escolha **Guiado por roteiro/áudio** em Modo de gravação para preparar uma demonstração. Os outros modos, **Só voz** e **Tela sobre a narração**, estão em "Voz, HeyGen e tela".
- **Abrir ambiente de aula** abre uma janela web isolada, sem acesso à ponte do editor. Entre na plataforma normalmente e pressione **F8** para voltar ao gravador. Os dados de login ficam no perfil local dessa janela.
- Cole o roteiro (uma etapa por linha) ou importe a narração. O roteiro produz tempos estimados; a transcrição propõe tempos nas palavras “clique”, “clicar” e “clicamos”. A transcrição depende do motor/modelo já configurado. Também é possível definir etapas e tempos manualmente.
- Revise as ações e, em cada etapa, escolha **Marcar alvo**, posicione o cursor e pressione **F8**. Na janela da aula, botões usam seletores de elementos e são localizados novamente antes de executar. Canvas e iframes usam pontos relativos; outros navegadores usam posições fixas. Mudanças de conteúdo de jogos precisam de revisão: ainda não há reconhecimento visual do resultado das ações.
- Ritmo didático inicial para aulas de **9 a 14 anos**, ajustável: movimento suave de **1,2 s**, chegada **0,5 s antes da fala**, espera mínima de **0,8 s** no alvo antes do clique e **1,5 s** após a ação. Em cada etapa, **Fala começa em (s)** indica o início da frase e **Ação em (s)** indica quando clicar. A chegada considera ambos: o cursor espera no botão enquanto a explicação começa. Uma preparação inicial permite antecipar o cursor mesmo na primeira fala. Etapas próximas demais são recusadas; ajuste o roteiro/áudio para caberem as pausas.
- A importação de áudio sugere o começo da frase anterior ao comando, respeitando pontuação e pausas; revise essa sugestão na narração. Planos sem um início de fala separado usam o instante da ação como referência. A localização dos elementos começa antes do movimento; atrasos de localização ou saltos durante o trajeto interrompem a execução, sem acelerar para compensar. O modo Manual continua sem automação.
- Ações: apontar, clique esquerdo/direito, clicar e digitar, e teclas de navegação. **F9** pausa/retoma; **F10** interrompe e salva. A execução pausa se perder o ritmo ou se o alvo estiver ausente, coberto, deslocado durante a aproximação ou em outra janela.
- Cada movimento até o alvo é um só comando para o auxiliar nativo, que desenha a curva a 120 Hz no próprio relógio; uma pausa para o cursor onde ele está e a mesma curva continua na retomada. Se o auxiliar atrasar, o cursor para onde está em vez de saltar e a gravação pausa.
- Com áudio importado, microfone e áudio do PC são desligados para evitar duplicação. Use fones para acompanhar. O arquivo de voz é copiado para a pasta da gravação e inserido numa faixa própria, alinhado ao vídeo e preservando o cursor editável. Sem áudio importado, grave a demonstração e use **Narrar intervalo** depois.
- A conclusão das etapas encerra a gravação automaticamente. A correspondência de alvos e a sincronização final devem ser revisadas na aula real antes de publicar.

## Estrutura

Quando a licença deixa de autorizar o uso, novas tarefas ficam bloqueadas. A gravação e a execução guiada param imediatamente; o vídeo permanece em `Documentos/EdiAula/Gravações`, em pasta exclusiva por sessão. As partes usam MP4 fragmentado e o diário da sessão permite recuperar uma interrupção. Uma falha de finalização informa a pasta preservada. Exportação, proxy, chroma e transcrição já iniciados têm até 30 minutos para concluir, sem reiniciar esse prazo; uma exportação interrompida não substitui os arquivos anteriores. Consulte [o registro de preservação](../../docs/propostas/edi-suite-2026-10-16/producao-jobs.md).

```
src/main       processo principal: FFmpeg, projetos, protocolo media://, IPC
src/preload    ponte segura window.api
src/shared     tipos, operações da timeline e plano de exportação (testados)
src/renderer   interface React (home, editor, timeline, preview, exportação)
tests/         testes com node:test
```
