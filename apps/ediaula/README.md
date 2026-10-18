# EdiAula

Editor de vídeo para aulas: a simplicidade do Camtasia com a timeline do Premiere.

**Modelo de edição em Markdown:** peça ao assistente “Gere um arquivo MD com o modelo de edição desta aula para replicar em outro projeto”. Ele usa `export_editing_template` e abre a janela para salvar um `.md` com faixas, mídias de referência, estilos, balões, movimentos, áudio, legendas e falas de referência quando houver transcrição. No projeto seguinte, peça “Leia meu modelo de edição e proponha a adaptação para esta aula”; `read_editing_template` permite escolher o arquivo. O modelo não inclui mídias nem caminhos locais e seus tempos precisam ser adaptados à nova aula.

**Fila de exportação:** em Exportar, escolha o destino e clique em **Adicionar à fila**. Cada item guarda uma cópia do projeto e das configurações, incluindo o caminho editado do cursor. Clique em **Continuar editando** para abrir outra aula enquanto a fila processa um arquivo por vez. Acompanhe, cancele ou tente novamente pelo botão **Exportações** ou pelo menu **Arquivo → Fila de exportação**; **Tentar com a edição atual** refaz com o projeto aberto agora, em vez da cópia guardada. O fechamento normal é bloqueado enquanto há itens pendentes, mas a fila fica gravada: se o EdiAula fechar no meio, ao abrir de novo ele oferece **Retomar** ou **Descartar**, e retomar só refaz os trechos que faltavam. Os arquivos originais precisam continuar disponíveis.

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
- Preview sincronizado com J/K/L (com som também para trás), quadro a quadro e tela cheia
- Desfazer/refazer de tudo
- Exportação MP4 H.264 pela GPU (NVENC, AMF ou Media Foundation) ou pela CPU (x264), com normalização −14 LUFS

## Exportação

- **Por trechos:** a imagem é renderizada em trechos de 4 a 20 s, com bordas nos cortes da faixa principal, dois ou três ao mesmo tempo (duas sessões de NVENC, AMF ou Media Foundation, divididas com os proxies; até três processos x264, cada um com uma parte dos núcleos). Durante uma gravação nada da exportação começa (trechos, medições, montagem), como os outros trabalhos pesados. Cada quadro de um trecho é o mesmo que uma passada única mostraria: o deslocamento no tempo é em quadros inteiros, a tela parada de uma gravação com taxa variável continua na tela e o último quadro de um arquivo mais curto que o clipe fica parado também no trecho seguinte (`tests/export-frames.integration.test.ts`). Pedaços seguidos da mesma gravação são lidos com um só decodificador e juntados numa camada, então a memória fica perto da de entradas separadas. Cada comando do FFmpeg leva só os clipes do seu trecho, então aulas longas e muito cortadas não passam do limite da linha de comando do Windows (`src/shared/export/`, `src/main/export/`).
- **Trechos reaproveitados:** cada trecho fica guardado em `cache/segments` com a assinatura do que ele mostra (clipes, efeitos, legenda gravada e os arquivos das fontes dela, cursor, codificador, versão e configuração do FFmpeg e o tamanho e a data de cada arquivo). Exportar de novo só refaz os trechos que mudaram: cortar 2 s no minuto 10 de uma aula de 25 min reaproveita mais de 90% dos trechos depois do corte. A fila mostra, por exemplo, "40 de 52 trechos prontos, 34 reaproveitados". O cache vai até 15 GB, e nunca passa de um quarto do espaço que o disco deixa para ele (os mais antigos saem primeiro); cada arquivo vai para o disco antes de ganhar o nome, e um trecho cortado ou de tamanho diferente do anotado é refeito. **Configurações › Limpar cache de exportação** apaga tudo.
- **Som numa passada:** o som da aula inteira é misturado de uma vez em PCM, ao mesmo tempo que a imagem, e codificado em AAC só no final, então nenhuma emenda de trecho estala. Cada corte que não continua a mesma gravação ganha um fade de 8 ms; o fade de entrada e de saída do clipe vale também para o som; quem sai numa transição termina com um fade de até 0,25 s; a música que vai até o fim da aula termina com fade de 1,5 s.
- **Volume:** com a normalização ligada, as vozes (avatar, microfone, narração) são niveladas entre si com um ganho fixo medido uma vez por arquivo; depois a mistura é medida e a montagem aplica −14 LUFS com ganho linear (duas passadas). Se a medição falhar, cai para uma passada.
- **Música abaixando:** profundidade, rampa e pausa vêm do projeto (`audio.ducking`), e uma faixa de música pode ficar fora (`duck: false`); a prévia usa as mesmas contas.
- **Cor:** a composição é BT.709 em faixa limitada e o arquivo sai marcado assim, então navegador e YouTube mostram as cores da aula (o verde-limão #C8F031 volta como 200, 240, 49). Fontes sem marcação são lidas como BT.709; gravações e câmeras marcadas BT.601 são convertidas.
- **Efeitos fixos desenhados uma vez:** cantos arredondados, círculo, borda e sombra viram imagens em `cache/fx`, feitas uma vez por tamanho e estilo; o avatar recortado com sombra calcula a sombra a cada quadro em 1/4 da resolução.
- **Transparência:** vídeos que já têm alfa (WebM VP8/VP9, ProRes 4444, PNG) mantêm a transparência na exportação e na prévia, que usa o original ou um proxy VP9 com alfa, nunca H.264.
- **Plano B do codificador:** se o NVENC (ou o AMF, ou o Media Foundation) falhar num trecho, esse trecho é refeito sozinho no fim; se falhar de novo, a exportação continua com o próximo da cadeia, até o x264, e avisa na fila. O que falhou só fica de fora até o app fechar quando também não codifica uma imagem de teste. Erro de filtro ou de arquivo não troca de codificador (as mensagens reais do FFmpeg 6.1 e 9.0 estão em `tests/fixtures/ffmpeg-encoder-errors.json`).
- **Qualidade:** Rascunho, Padrão, Alta e Máxima usam qualidade constante pela resolução (CRF no x264, CQ com AQ e lookahead no NVENC); o valor em Mbps é o teto.
- **Montagem:** os trechos são juntados sem recodificar (quando dois trechos do cache vêm de versões diferentes do codificador, com cabeçalhos H.264 diferentes, a imagem é refeita na montagem), com o título e os capítulos (os marcadores de capítulo, ou os de `publish`) no MP4, `+faststart` e a miniatura; a barra só chega a 100% depois disso. As legendas `.srt` e `.vtt` saem dos mesmos cues da legenda gravada (no máximo duas linhas de 42 caracteres, sem sobreposição), só com as falas ouvidas e cada palavra uma vez, mesmo quando o vídeo do apresentador e a voz extraída dele estão transcritos.
- **Vertical e podcast:** a resolução é escolhida pelo lado menor, então um projeto vertical sai em 1080 × 1920; o layout vertical (fundo desfocado ou corte) fica para projetos horizontais. **Só áudio (podcast)** sai em MP3.
- **Limpeza:** ao abrir, o app apaga as pastas `.edi-output-*` que uma exportação interrompida deixou ao lado do destino e as pastas `work/export-*` dela, só as de antes da abertura; as que guardam cópias de segurança ficam. Uma exportação espera essa limpeza terminar.
- **Retomar:** um item da fila cuja pasta de destino ou mídia sumiu aparece como "não dá para retomar", com o motivo, e nada dele é liberado; um item cuja aula foi editada depois de entrar na fila avisa disso. Só destinos `.mp4` (ou `.mp3` no podcast) são guardados.

## Salvamento e mídias ausentes

- Se o salvamento falhar, o aviso fica fixo na barra de cima até um salvamento dar certo, com **Tentar de novo** e **Salvar cópia…**. A cópia ganha o nome do arquivo escolhido e a edição continua nela. Voltar ao início, abrir ou criar outro projeto e fechar a janela (pelo X ou Alt+F4) esperam o texto que está sendo digitado, as anotações sendo redesenhadas e o salvamento, com o aviso "Salvando antes de fechar…" quando demora; se o salvamento falhar ou passar de 20 s, uma janela pergunta o que fazer: tentar de novo, salvar uma cópia, sair sem salvar ou cancelar. Com exportações na fila, a janela continua aberta e nada é descartado.
- Salvar e exportar mandam o projeto ao processo principal como texto (um valor só, por maior que seja a aula), validado uma vez, com o mesmo teto de 32 MB da abertura; as posições do cursor vão como lista binária, então gravações longas (27 min ou mais) também exportam. Um projeto que não poderia ser reaberto não é salvo, e uma falha na lista de recentes não impede o salvamento.
- Os zooms pertencem à gravação, no tempo dela, como o cursor: cada clipe mostra os do seu trecho. Cortar, aparar e desfazer o aparo pela borda nunca perde nem duplica um zoom, e um zoom tirado fica fora. Projetos antigos, com os zooms copiados em cada pedaço, são convertidos ao abrir.
- Cada pedaço de um clipe cortado (dividir, sobrescrever, aparar, estender quadro, cortes da transcrição) mostra exatamente o mesmo movimento e a mesma vista da camada de zoom do original (`src/shared/pieces.ts`): o pedaço guarda todas as posições do movimento, então aumentá-lo pela borda traz o movimento de volta, e a camada de zoom mantém o tempo da entrada e da saída mesmo num pedaço curto. Um corte no meio tira a entrada e a saída das bordas de dentro; cortar a cabeça ou o rabo de um clipe só move aquela borda, com a transição, o fade e a animação dela.
- Ctrl+Z desfaz também a remoção de fundo. O que o app descobre sobre a mídia (miniatura, forma de onda, proxy, transcrição, vídeo recortado, arquivo ausente) e o tempo de edição medido não voltam com o desfazer.
- **Arquivo sumiu · Reconectar…** (na biblioteca) ou **Reconectar…** no aviso da exportação: aponte o arquivo no novo lugar. Ele precisa ser a mesma mídia (mesmo tipo, duração com até 0,5 s de diferença e mesmo tamanho de quadro). Cortes, zooms, transcrição e caches continuam, e o `cursor.json` de uma gravação é reconectado junto quando está ao lado do vídeo. Os outros arquivos ausentes são procurados uma vez na mesma pasta; **Procurar em uma pasta…** procura todos numa pasta escolhida, pelo nome e pelo tamanho do arquivo, até três níveis abaixo, abrindo só arquivos de mídia e liberando só os que são a mesma mídia. **Cursor sumiu** pede só o arquivo de dados do cursor.
- Imagens do próprio editor (anotações, a imagem vazia das camadas de zoom e os quadros de **Estender quadro**) são desenhadas de novo quando o arquivo some, sem precisar procurar: é o que acontece ao levar a aula para outro computador, onde o cache do app não está. O quadro estendido guarda de que mídia e de que segundo ele é (`asset.still`) e é tirado de novo da fonte, com o cursor e o zoom que ela mostra ali (`src/shared/relink.ts`, `redrawPlan`). Quadros estendidos feitos antes disso continuam como imagem comum e, se sumirem, pedem o arquivo como qualquer mídia.
- A lixeira da biblioteca pede confirmação quando a mídia tem clipes na timeline.

## Etapa 2 (pronta)

- Transcrição local com whisper.cpp (instalado pelo próprio app na primeira vez: GPU NVIDIA ou CPU)
- Modelo `large-v3-turbo` (recomendado) ou `small`; os `ggml-*.bin` de `C:\whisper-cpp` entram só se você marcar a opção no painel, e o app avisa que não os confere
- Tempos por palavra com DTW + silêncios medidos pelo FFmpeg
- Painel de transcrição: clique numa palavra para ir até ela, selecione palavras e aperte Delete para cortar
- Limpeza automática: vícios de fala ("né", "tipo,", "ahn"…), frases repetidas e silêncios longos, com contagem e tempo economizado (detalhes em **Limpeza que respeita a aula**, abaixo)
- Cortes aplicados em todas as faixas de vídeo e de fala ao mesmo tempo (ficam sincronizadas); trilha de música é preservada e acompanha o novo final; faixas travadas nunca são tocadas
- Legenda `.srt` gerada da transcrição editada, salva junto do MP4

O motor e os modelos ficam em `%APPDATA%\ediaula\whisper`.

**Downloads conferidos.** O motor (build `b5454` do whisper.cpp, a versão noturna da v1.9.5), os dois modelos oferecidos e o modelo Silero de detecção de voz têm SHA-256 e tamanho fixados em `src/main/whisperAssets.ts`, tirados do que o GitHub publica para cada arquivo da release e do SHA-256 que o Hugging Face lista para cada modelo, numa revisão fixa do repositório. O hash é calculado durante o download (`src/main/download.ts`) e conferido antes de o arquivo ir para o lugar: se não bater, o `.part` é apagado e nada é instalado. Dois pedidos do mesmo arquivo ao mesmo tempo viram um download só. O zip do motor é extraído numa pasta temporária, cada arquivo é conferido contra `src/main/whisperManifest.ts` (gerado por `scripts/build-whisper-manifest.mjs` a partir dos zips oficiais conferidos) e só então o motor em uso é posto de lado e trocado pelo novo; se a troca falhar, o antigo volta, e o zip só é apagado depois do sucesso. Motor e modelos instalados antes desta conferência são conferidos na primeira transcrição; o que não bater sai da lista e precisa ser baixado de novo. Os nomes das pastas e arquivos temporários são gerados pelo app, nunca a partir do que chega da interface.

**Retomada.** Um download interrompido deixa o `.part` e um `.part.json` (endereço, ETag e tamanho). A tentativa seguinte confere de novo o que já está no disco e pede só o resto (`Range` com `If-Range`); um servidor que não aceita continuar manda o arquivo inteiro, e o download recomeça do zero. Um `.part` com mais de 7 dias é apagado quando o app abre.

**Detecção de voz e alucinação.** Quando o `whisper-cli --help` lista `--vad`, a transcrição usa `--vad --vad-model` com o Silero (baixado junto com o motor, conferido antes de cada uso e baixado de novo se não bater, com tempo limite). Com VAD, o JSON do whisper.cpp deixa os tempos das palavras no áudio encurtado; o app lê a tabela de trechos que ele registra no log, confere que veio inteira e devolve cada palavra ao tempo do arquivo (`src/shared/whisperParse.ts`). Sem a tabela inteira, a transcrição é feita de novo sem VAD; quando o VAD não acha fala nenhuma, o resultado vazio vale. Se o whisper falhar com VAD, o modelo do VAD é apagado e a transcrição segue sem ele. O arquivo de cache leva no nome o modo que rodou de fato. O filtro de alucinação marca, sem apagar: palavras de confiança baixa no meio de um silêncio de 0,5 s ou mais (onde o VAD ouviu fala não conta como silêncio), créditos de legenda ("Legendas pela comunidade Amara.org") e despedidas de vídeo ("Obrigado por assistir", "Inscreva-se no canal") mal ouvidas ou em silêncio sem confiança. As palavras marcadas não aparecem no texto, mas ficam como marca discreta na transcrição e voltam com um clique. O whisper usa os núcleos do processador menos dois (de 2 a 16), e o WAV e o JSON temporários são apagados também quando a transcrição falha.

**Glossário corrigindo na leitura.** O glossário do curso (até 60 termos; acima disso o app recusa e avisa) e os nomes do roteiro corrigem o texto quando a transcrição é lida (`src/shared/glossary.ts`): sem acento nem caixa, pelo som ("Zapi" vira "Zappy"), juntando palavras partidas ("de binha" vira "Debinha"), com até uma letra de diferença em nomes de até 5 letras e duas acima disso. Uma palavra que existe em português nunca é trocada, nem muda de caixa: a lista de 48 mil palavras em `src/shared/lexicon/` vem da lista de frequência FrequencyWords (legendas do OpenSubtitles, licença CC BY-SA 4.0, registrada em `LICENSE-pt-words.txt`; gerada por `scripts/build-pt-lexicon.mjs`). Toda troca que não seja só de caixa ou acento exige que o whisper estivesse inseguro (confiança abaixo de 0,8). Do roteiro entram só os falantes, os nomes de várias palavras ("Sistema Zero", "Chave do Farol") e palavras que não existem em português ("Zappy"); botões como "Salvar" e "Executar" ficam de fora. As palavras que o glossário mudou ficam marcadas, com a dica "corrigido pelo glossário: era X". Mudar o glossário corrige na hora, sem transcrever de novo; o campo fica na aba Transcrição, em **Glossário do curso**. Entre parênteses vão as formas como um nome costuma sair na transcrição ("Zappy (Zapi, Zapy)"): essas viram o termo mesmo com o whisper seguro, mas uma palavra do português continua sem troca. No arquivo, um termo com formas ouvidas fica como `{term, aliases}`; os glossários antigos, só com texto, continuam valendo. O glossário fica guardado por curso, fora do projeto, e não volta com Ctrl+Z. Só os 20 termos mais citados no roteiro entram no prompt do whisper.

**Limpeza que respeita a aula.** A aba Transcrição, as ferramentas `find_cleanup` e `apply_cleanup` da IA e o botão **Limpar a aula** do Assistente usam o mesmo cálculo (`src/renderer/src/lib/cleanupPlan.ts`), com as escolhas guardadas na aula (`project.cleanup`: o que foi marcado para manter, os tipos ligados, o silêncio mínimo e a pausa que fica). O que a pessoa manteve no painel, ou deixou de fora de uma proposta de limpeza antes de aplicar, fica mantido também quando a IA limpa. Vícios e repetições são identificados pela palavra; uma pausa, pelo trecho da mídia em que está (`s:<mídia>:<início>-<fim>`, ancorado na mídia da última palavra dita antes dela), e a marcação de manter vale para a mesma pausa mesmo depois de um corte que a encurta, de um clique que a divide ou de outra fonte transcrita depois.
- **Silêncio só onde ninguém fala** (`audibleSilences` em `src/shared/cleanup.ts`): junta a fala de cada clipe que se ouve (faixa não muda, volume acima de 0, mídia com som, fora da faixa de música, fora do trecho em que a voz fica muda sob o som do apresentador). Com transcrição, a fala é o que não é silêncio nela, mais cada palavra que o whisper ouviu dentro de um silêncio do FFmpeg (com 0,15 s de margem) e os trechos que o VAD guardou: uma resposta baixinha da criança nunca vira pausa. Sem transcrição, vale o envelope do som (40 dB abaixo do pico do arquivo por 0,3 s é pausa); sem nenhum dos dois, o clipe inteiro conta como fala. O avatar encaixado numa pausa da narração não é cortado, e um trecho sem som nenhum (cartela, imagem) não é pausa.
- **A tela parada também conta** (`src/shared/activity.ts`): numa gravação de tela, a limpeza só encurta uma pausa onde a imagem fica parada e ninguém fala. Onde a imagem fica parada é medido em segundo plano (o agendador espera a gravação terminar) pelo `freezedetect` do FFmpeg, a 5 quadros por segundo e 480 px, sobre o proxy quando está pronto ou sobre a própria mídia, e fica em cache ao lado da mídia (`asset.motion`). Enquanto essa análise não termina, nenhuma pausa daquela gravação é cortada, e o painel avisa. Além da imagem, seguram a pausa: qualquer movimento do ponteiro, mesmo devagar; cliques (de 0,6 s antes até 0,8 s depois); arrastos inteiros; rolagem; atalhos; digitação (só os instantes, veja **Teclas na tela**); e as etapas, as interações e as esperas do `guided-run.json` que a gravação guiada escreve ao lado do vídeo (cada espera guarda meio segundo de cada lado do ponto em que o vídeo segurou; uma etapa que o take não alcançou não conta). Lê o `cursor.json` v1 e v2. De um silêncio só se corta o que sobra e ainda tem o silêncio mínimo.
- **Pausa para pensar**: depois de uma pergunta, ou onde o roteiro pede para pausar, aguardar ou esperar entre duas falas, a pausa fica com 2,5 s em vez de 0,4 s.
- **Vício e repetição só na fala da professora**: são procurados nas palavras de cada fonte da professora; o apresentador (avatar ou pessoa: mídia com fundo removido ou gravada num fundo de cor, o vídeo encaixado pela voz, a narração guiada tirada de um vídeo, um clipe encaixado do roteiro), o áudio do PC e fontes que não se ouvem ficam de fora. Entre as tomadas cabem no máximo 0,6 s (uma palavra), 1,5 s (duas) ou 3 s (três ou mais); uma ou duas palavras de novo depois de ponto final começam outra frase; com atividade na tela entre as tomadas é demonstração, não repetição. Contagens ("um, dois, três") e repetições de ênfase ("muito, muito", "vamos lá, vamos lá") ficam (lista `DEFAULT_INTENTIONAL`, trocável por `project.cleanup.intentional`). Um vício no meio de um arrasto ou de outra atividade fica, e um corte que pegaria a fala de outra fonte não é sugerido.
- **Tudo vira proposta**: **Propor a limpeza**, no painel, e o botão rápido do Assistente montam a limpeza no computador, sem IA e sem custo, como proposta ancorada na mídia e revisada item a item na barra de proposta. `apply_cleanup` propõe por padrão (`mode: "propose"`, que basta a um app conectado só para ler e propor) e só corta direto com `mode: "apply"`, que é uma escrita. Enquanto a proposta da limpeza da voz espera, a limpeza geral deixa de fora o que ela já propõe, e o que a pessoa deixar de fora dela também fica mantido aqui.
- **Pontos cegos**: o painel e a resposta da IA dizem o que a limpeza não vê: vídeo sem dados do cursor (ou com dados que não abriram), mídia sem transcrição nem forma de onda (conta inteira como fala), transcrição de uma fonte que não se ouve e gravação de tela ainda sem a análise da imagem.

**Editor de palavras.** Duplo clique numa palavra da transcrição (ou F2 e Enter pelo teclado) abre a correção. Enter ou um clique fora confirma, Esc cancela, e o foco volta para a palavra. Dá para aplicar em todas as ocorrências (o editor mostra quantas são; "esta" e "está" contam como palavras diferentes), adicionar ao glossário do curso, mover o começo e o fim em passos de 50 ms, ouvir a palavra com 0,3 s antes e depois e começar uma legenda nova naquela palavra. Texto vazio tira a palavra da transcrição sem cortar o vídeo; a palavra tirada fica como marca discreta e volta com um clique. Uma palavra juntada pelo glossário é editada inteira, e mexer numa palavra corrigida guarda a correção junto; digitar o que o whisper ouviu desfaz uma troca errada do glossário naquela palavra. As correções ficam no projeto (`wordEdits` de cada mídia, no tempo da fonte, com o texto e o tempo originais), acompanham cortes e divisões e entram no Ctrl+Z; numa transcrição refeita, cada correção procura a mesma palavra a até 1 s de onde estava, e o painel avisa quantas não acharam lugar. São aplicadas num lugar só, onde as palavras da mídia são lidas (`src/shared/wordEdits.ts`), então legenda gravada, `.srt`, `.vtt`, karaokê, prévia e IA veem o texto corrigido. Palavras de confiança baixa aparecem sublinhadas em laranja.

## Inteligência artificial

Duas formas, configuradas em **Configurações › Inteligência artificial** (ícone de engrenagem):

1. **Com a sua assinatura (igual ao pen):** o EdiAula abre um servidor MCP local em `http://127.0.0.1:47321/mcp`.
   O botão **Conectar** registra o EdiAula no Claude Code ou no Codex. Depois é só pedir lá
   ("limpe a aula aberta no EdiAula", "gere os capítulos") e acompanhar as edições ao vivo.
2. **Assistente dentro do app:** aba **Assistente**. O motor pode ser o Claude Code (assinatura do Claude),
   o Codex (assinatura do ChatGPT) ou a API da Anthropic (chave cobrada por uso, guardada criptografada).

As duas usam as mesmas ferramentas (`src/shared/aiTools.ts`): visão geral, ler transcrição, sugestões e
limpeza automática (proposta por padrão), cortar frases ou trechos, propor cortes, desfazer, mover o cursor, salvar título/descrição/capítulos/resumo,
transcrever, importar mídia, abrir/criar projetos, preparar a aula (`prepare_lesson`), aplicar o modelo do curso
(`apply_editing_template`), várias anotações de uma vez (`add_annotations`), a verificação antes de exportar
(`check_before_export`), ver o quadro (`get_frame`), traduzir as legendas (`translate_captions`), o quiz
(`generate_quiz`), a miniatura (`set_thumbnail`) e a exportação (`export_video` e `get_export_status`). Toda edição
entra no histórico (Ctrl+Z).

**A IA vê o quadro (`get_frame`).** A ferramenta devolve uma imagem da aula no tempo pedido, com um JSON do que está
desenhado por cima (anotações, imagens, apresentador e camadas de zoom, cada um com a caixa em frações do quadro) e de
onde a gravação de tela fica. Sem `composited`, é o quadro da gravação de tela lido do arquivo pelo FFmpeg, com o
ponteiro gravado desenhado pelo mesmo código da prévia (rápido). Com `composited: true`, é a aula montada exatamente
como a exportação monta, pela janela de um quadro da exportação por trechos (`export:frame`), com zoom, cursor e
legenda gravada. `region` recorta uma parte (frações do quadro) e `max_width` limita a largura; o lado maior nunca
passa de 1568 px. No MCP a imagem vai como bloco de imagem, e na chave da API ela entra no resultado da ferramenta. A
IA usa para conferir onde uma seta, um balão ou um zoom caem e se nada cobre os controles que a criança precisa ver.
Com um rascunho do mesmo assistente esperando revisão, o quadro mostra a aula como o rascunho a deixa. Na chave da API,
só as 4 imagens mais recentes ficam no histórico; as anteriores viram uma linha "[quadro de m:ss]". O canal é
`export:frame(jobId, projeto em JSON, spec, segundo, geometria)` e devolve os bytes do PNG.

**Painel do Assistente.** Cada ferramenta em andamento mostra a etapa em que está (por exemplo "Lote 2 de 3
traduzido" ou a etapa do Preparar aula) e, quando dá, a porcentagem; **Cancelar** para só aquela ferramenta, e o resto
do pedido continua (o que ela ainda não tinha gravado não é gravado depois). Embaixo de cada resposta aparecem os
tokens e o custo do pedido, e o bloco **O que mudou** lista as mudanças da aula naquele pedido, com o mesmo texto da
barra de revisão, **Ir até** em cada uma e **Desfazer este pedido** enquanto as edições dele são as últimas do
histórico (só as edições da IA naquele pedido entram na lista; uma edição sua no meio fica de fora). A conversa fica
guardada por aula em `conversas/<projeto>` na pasta de dados do EdiAula: ao abrir a aula de novo ela volta, o Claude
Code e o Codex continuam a mesma sessão, e na chave da API a primeira mensagem leva um resumo do que foi conversado (as
imagens do quadro não são guardadas). Se a sessão guardada não existir mais no Claude Code ou no Codex, o pedido
recomeça sozinho numa sessão nova, com o resumo. O que tem cara de chave ou token (`sk-…`, `Bearer …`, sequências longas)
é guardado como "[segredo omitido]", e as mensagens mais antigas saem quando a conversa passa de 4 MB. **Nova conversa**
apaga tudo isso. O EdiAula não tem um jeito de apagar uma aula; quem apaga o arquivo do projeto por fora usa **Nova
conversa** antes, se quiser tirar a conversa também. Quando a versão do Codex manda a resposta enquanto escreve, o
texto aparece aos poucos; senão, aparece inteiro no fim, como antes.

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
- Edições amplas que mudam a imagem (anotações em lote, zooms, inserções, paleta, modelo do curso) viram
  **rascunho** por padrão (veja Preparar aula, revisão e verificação).
- Cortes amplos viram **propostas**: aparecem destacadas na timeline e você aplica ou descarta. A proposta fica salva
  na aula (até 2.000 itens; um trecho que passa por centenas de clipes vira vários itens), sobrevive a fechar e abrir,
  só se aplica na aula em que foi feita e cada item pode ser deixado de fora. Os itens ficam ancorados no tempo da
  mídia: um corte antes deles não os desloca e, se o trecho mudar, eles são procurados pelas palavras e, por último,
  pelo texto, mas só perto de onde estavam (a mesma frase em outra tomada é outro trecho). O que aparece na barra e na
  timeline é exatamente o que o Aplicar corta; um item que não é encontrado fica de fora, com aviso. Cada ferramenta
  da IA tem a sua proposta (`propose_cuts`, `apply_cleanup`, `propose_off_script`): uma nova só substitui a anterior
  da mesma ferramenta, e a resposta diz quando substituiu.
- **Trechos protegidos** (selecione palavras na Transcrição › Proteger) nunca são cortados por limpeza ou IA.
- Cortes por tempo exigem a **revisão** atual do projeto; se você mexeu depois, a IA relê antes.
- `transcribe` transcreve tudo o que se ouve na timeline e ainda não tem transcrição; clipes mudos ficam de fora e a
  voz extraída de um vídeo do apresentador é transcrita uma vez só.
- **Encaixar** uma inserção nunca move uma faixa travada: se uma faixa travada tem algo depois do ponto onde seria
  preciso abrir espaço, o encaixe vira uma proposta com aviso e nada muda. Os templates de tela cheia fazem o mesmo:
  com uma faixa travada que ficaria para trás, eles não são inseridos e o aviso diz qual destravar.
- **Glossário por curso** (nomes, personagens, blocos) corrige a transcrição na leitura e orienta a IA.

**Outros:** vídeos com taxa de quadros variável ganham cópia de trabalho com taxa fixa; cópias de
segurança automáticas em `Projetos/.backups`; tempo de edição medido por aula; exportação com
.srt, .vtt e miniatura .jpg.

## Preparar aula, revisão e verificação

**Preparar aula** leva a gravação até uma edição pronta para revisar, em dez etapas, sempre na
mesma ordem. Abre pelo botão **Preparar aula** no topo do editor, pela faixa que aparece quando uma
gravação de tela ou o vídeo do apresentador entra na aula ou pela IA (`prepare_lesson`). Depois de uma
gravação **Só voz**, a faixa lembra o caminho da voz (escolher as tomadas, limpar e exportar para
gerar o vídeo do apresentador) e o Preparar aula fica para quando o vídeo voltar; depois de **Voz e
câmera**, que já traz o vídeo do apresentador, a faixa oferece o Preparar aula. O painel **Preparar
aula** abre na barra lateral e mostra as etapas, o que cada uma fez e o que está esperando você.

1. **Transcrever** cada fonte que se ouve na aula, uma vez só: a voz que toca muda por baixo do som
   do apresentador e o vídeo do apresentador sem som não são transcritos de novo.
2. **Confirmar a seção do roteiro** que esta gravação é. Quando a gravação deixa claro, a etapa passa
   sozinha; senão, escolha a seção na lista.
3. **Cortes:** vícios, repetições, pausas longas e o que foi dito fora do roteiro numa proposta só,
   separada por categoria. Na barra de revisão dá para deixar uma categoria inteira de fora.
   Se toda voz que se ouve passou pelo caminho da voz (gravada em Só voz, exportada para gerar o
   vídeo do apresentador, ou o vídeo dele encaixado por ela), esta etapa fica de fora e o painel diz
   por quê: cortar de novo picotaria o vídeo do apresentador junto. Numa aula mista, com o microfone
   gravado junto com a tela, a etapa continua para essa voz, e nenhum corte cai onde o vídeo do
   apresentador toca.
4. **Inserções** do apresentador do roteiro, todas de uma vez. Se a aula mudou enquanto as
   inserções eram planejadas, nada é colocado e a etapa espera um **Tentar de novo**.
5. **Modelo do curso:** paleta, posição do apresentador, cursor, música e escolhas da limpeza.
6. **Zoom automático** nos cliques das gravações de tela do EdiAula.
7. **Anotações do Na tela:** cada "Na tela" do roteiro vira uma anotação no começo da fala seguinte.
   O lugar vem do clique da gravação naquele momento, onde ele aparece na tela com o zoom da
   gravação; se não houver, da regra do modelo do curso; se não, de um canto que não cobre o
   apresentador (com o apresentador na tela inteira, um canto de baixo). A anotação fica sempre dentro
   da área segura de 90% do quadro, e um "Na tela" que já tem anotação na aula não ganha outra.
8. **Legenda** gravada no vídeo, no estilo do curso.
9. **Cartelas** de abertura e de encerramento.
10. **Verificação antes de exportar** (abaixo). O volume é medido uma vez, nesta etapa; a lista é
    refeita sozinha a cada mudança na aula, sem medir de novo (o Refazer mede).

Cada etapa vira uma proposta (os cortes) ou um rascunho (o resto). Aplicar conclui a etapa e a
próxima começa sozinha; descartar pula. Cada rascunho e proposta sabe a etapa que o fez, então
resolver um só decide essa etapa. **Pular** e **Refazer** valem para qualquer etapa; o Refazer
descarta o que o Preparar aula deixou esperando revisão. Onde a preparação parou fica salvo na aula,
então fechar e abrir de novo continua dali.

**Rascunho.** O que muda a aula de forma ampla (várias anotações, zooms, inserções, paleta, modelo do
curso) primeiro vira um rascunho: a prévia já mostra como fica, os clipes que mudam aparecem
tracejados na timeline e a barra de revisão lista cada mudança em português ("Inserção F1P1-D01 em
2:00, abre 4,0 s", "Cartela de abertura em 0:00: a aula anda 4,0 s", "Balão "Olha aqui!" em 0:04").
O que muda a estrutura da aula (clipes divididos, aparados, movidos ou removidos, com os clipes que
a mesma edição criou) é um item só: metade dele deixaria buracos ou clipes um sobre o outro. O que foi
posto depois dele no tempo depende dele. Cada item tem **Deixar de fora** e **Incluir**; deixar um
item de fora leva junto o que depende dele (o balão de uma faixa nova sai com a faixa) e avisa, e
incluir traz junto o que ele precisa. A lista é refeita a cada edição escrita no rascunho, então cada
item diz a mudança final. **Aplicar** grava tudo num Ctrl+Z só. Se você mexeu na aula num ponto que o
rascunho também muda, o item aparece como "a aula mudou aqui" e o Aplicar espera você deixá-lo de
fora. Enquanto um rascunho muda a estrutura, a lâmina, mover e aparar clipes, colocar mídia, ouvir
os cortes e Revisar cortes esperam: aplique ou descarte antes. O rascunho fica só na memória: não vai
para o arquivo da aula nem para a exportação, e por isso fechar a aula, ir para o início ou abrir
outra pergunta se é para aplicar, descartar ou cancelar (a IA não troca de aula com um rascunho
esperando). Uma anotação, cartela ou paleta posta no rascunho é feita sobre o que o rascunho mostra.
As ferramentas da IA `add_annotations`, `auto_zoom`, `place_inserts`, `set_palette` e
`apply_editing_template` escrevem no rascunho por padrão; com `mode: "apply"` (só quando você pede)
mudam a aula na hora. Um rascunho espera por vez.

**Barra de revisão.** Junta o rascunho, as propostas de corte e a revisão dos cortes. Em cada corte
proposto, **Ouvir pulando o corte** toca 1,5 s antes e 1,5 s depois como se o trecho já tivesse saído.

**Revisar cortes** (Editar › Revisar cortes) passa por cada emenda da aula, isto é, cada ponto onde
dois pedaços da mesma gravação se encontram com um trecho tirado entre eles, e toca 1,5 s antes e
1,5 s depois. **Enter** aprova (a emenda fica marcada na aula e não volta na próxima revisão),
**Backspace** restaura o trecho (a timeline abre ali nas faixas que os cortes atingem e o pedaço da
esquerda volta a tocar até o da direita), **→** pula e **R** ouve de novo. Restaurar é um Ctrl+Z.
Só contam as faixas que os cortes atingem (não as anotações, a música ou um efeito sonoro). Cada
emenda é procurada de novo antes de agir, pelos segundos da mídia: depois de um Ctrl+Z ou de outra
edição, ela é achada onde está, e uma que sumiu é pulada com aviso. Uma emenda onde o vídeo do
apresentador toca por cima não é restaurada (dividiria o vídeo ao meio): aprove ou ajuste à mão. A
revisão termina quando outra aula abre ou o editor sai da tela.

**Verificação antes de exportar.** Aparece no diálogo Exportar, na última etapa do Preparar aula e na
IA (`check_before_export`). Cada lista vale para a aula como estava quando foi feita: depois de
qualquer mudança ela é refeita, e uma correção nunca age com os tempos de antes. Confere, pensando
em crianças de 9 a 14 anos:
- silêncio de mais de 1,5 s no começo ou no fim (embaixo de uma cartela, o silêncio é de propósito);
- volume: **Medir o volume** mixa o som como a exportação, com a voz tratada (espera o tratamento
  terminar) e a música abaixando quando alguém fala, e mede LUFS e pico (fora de −20 a −9 LUFS, ou
  pico acima de −1 dBTP, a correção é ligar a normalização). A medida vale só para a aula como
  estava; mudou, meça de novo;
- duração fora do alvo do roteiro, falas do roteiro que não estão na aula ou estão pela metade, e o
  texto do Zappy na página falado no vídeo: com 6 palavras ou mais dele em ordem (e pelo menos 60%
  dele) é um problema e a correção propõe o corte; com menos, só um lembrete para conferir;
- duas vozes ao mesmo tempo por mais de 0,3 s;
- legenda fora da área segura de 90% do quadro ou menor que 5% da altura; e, quando a legenda é
  gravada no vídeo ou o .srt sai junto, um trecho inteiro de 10 s acima de 17 caracteres por
  segundo (contando o tempo que cada legenda fica na tela; o aviso mostra o pior trecho);
- letra de anotação menor que 3,3% da altura (36 px em 1080p) é aviso, menor que 2,6% é problema,
  medida no tamanho em que a anotação fica parada (a correção aumenta a letra). Balões, notas e
  rótulos novos já nascem com 36 px;
- mídia ausente (a correção reconecta; a aula não exporta sem ela) e dados do cursor ausentes (um aviso: "O
  ponteiro não vai aparecer nestes trechos", com **Exportar sem o cursor**, que só no diálogo de exportação deixa
  aquelas gravações saírem sem ponteiro e sem teclas; sem essa escolha a exportação recusa);
- capítulos do YouTube que não valem: o primeiro precisa estar em 0:00, são pelo menos 3 e cada um
  com 10 s ou mais;
- tela preta na imagem e pedaços com menos de 3 quadros.

Cada aviso tem **Ir até** e, quando dá, a correção num clique.

**Modelo do curso (versão 2).** Numa aula pronta, **Arquivo › Salvar como modelo do curso** guarda
como o curso é editado em `cursos/<curso>/modelo.json`, dentro da pasta de dados do EdiAula: formato,
faixas (nome, altura, música e abaixamento; silenciar, esconder e travar ficam de fora), paleta e
fontes, legenda, cartelas, posição e entrada do apresentador, remoção de fundo, cursor, zoom, música
(o arquivo, a faixa, o volume da aula e como ela abaixa quando alguém fala), escolhas da limpeza, quantas
anotações por minuto, os estilos delas e regras do tipo "quando o Na tela falar do botão Play,
destaque ali". O apresentador da aula e as inserções do roteiro guardam cada um a sua posição, e uma
inserção nunca é posta em cima do apresentador que está na tela ao mesmo tempo (um modelo antigo, de
uma posição só, vale para o apresentador, e para as inserções só numa aula sem ele). Ao abrir outra
aula do mesmo curso, o EdiAula oferece aplicar o modelo como rascunho; a resposta (aplicar ou agora
não) fica guardada na aula para aquele curso, e o modelo aplicado marca no Preparar aula as etapas que
ele já fez.
Dois cursos cujos nomes só diferem no que um nome de pasta não aceita ("Aula: 1" e "Aula 1") nunca
dividem o arquivo: o segundo vai para `cursos/Aula 1 (2)`, e toda leitura e gravação confere o curso
escrito dentro. Os modelos da primeira versão (`course-templates/<curso>.json`) viram versão 2 na
primeira vez que o curso é lido, e o arquivo antigo fica como `.migrated`.
O modelo de edição em Markdown (`export_editing_template`) leva o mesmo bloco JSON, sem onde a música
está neste computador, e diz o papel certo de cada mídia (camada de zoom, quadro parado da tela, música
de fundo, apresentador, voz). Um arquivo da versão 1 continua valendo como referência em texto, só não
tem o que aplicar.

## Entrega para a plataforma de cursos, tradução e quiz

A publicação é manual: o EdiAula prepara os arquivos e você sobe na plataforma. No painel do Assistente, o cartão
**Publicação e plataforma** junta o título, a descrição, os capítulos (com o aviso quando eles não valem), o resumo,
o código do vídeo do roteiro (`F1P1-V01`), o quiz, a miniatura e as legendas traduzidas.

- **Quiz:** **Gerar quiz** (ou a IA, com `generate_quiz`) faz as perguntas a partir das falas da aula (as falas do
  roteiro que estão na aula, ou o que foi dito quando não há roteiro) pelo motor de IA configurado. Cada pergunta é
  conferida antes de ser guardada: quatro alternativas diferentes, uma certa, a fala de origem citada como ela é e o
  trecho dela de onde sai a resposta, que precisa estar na fala; uma resposta que não passa é pedida de novo uma vez.
  Uma resposta certa sem nenhuma palavra da fala aparece marcada para conferir. Você marca **Revisada** em cada
  pergunta, e só as revisadas vão para o pacote. **Pôr na aula** coloca o template "Pergunta" com aquela pergunta logo
  depois da fala dela (a IA faz o mesmo com `add_template` e `quiz_item`). Se você abrir outra aula enquanto o quiz ou
  a tradução são feitos, nada é guardado e o aviso diz isso.
- **Miniatura:** **Usar o quadro atual** escolhe o quadro onde está o cursor, com o título da aula; a IA escolhe com
  `set_thumbnail` (quadro e título). O `.jpg` exportado é esse quadro; sem escolha, sai o de 30% da aula.
- **Traduzir as legendas** (ou `translate_captions`): as legendas como a exportação faz o `.srt` vão ao motor de IA
  configurado (sua chave, o Claude Code ou o Codex, sempre sem ferramentas), 150 por vez. Cada resposta é conferida
  (a mesma quantidade de legendas, em ordem, e no máximo 2 linhas de 42 caracteres; uma linha longa é quebrada de novo
  entre palavras quando cabe) e pedida de novo até duas vezes com o motivo. A tradução fica na aula
  (`captionTranslations`), legenda por legenda, presa à primeira palavra e ao texto dela: se a aula mudar depois, só as
  legendas que mudaram ficam desatualizadas, o cartão e a exportação avisam, e o arquivo daquele idioma só sai quando
  todas estão em dia.
- **Exportar:** além do `.srt`, `.vtt` e `.jpg`, a exportação grava `<aula>.<idioma>.srt` e `.vtt` de cada tradução em
  dia e `<aula>.plataforma.json` (opção **Pacote para a plataforma**), ao lado do vídeo. O pacote leva o código do
  vídeo, título, descrição, resumo, os capítulos só quando valem (começam em 0:00, são pelo menos 3, em ordem e cada um
  com 10 s ou mais; senão vão de fora, com o motivo), o quiz, a miniatura (arquivo, segundo e título), os arquivos de
  legenda e o SHA-256 do vídeo exportado, para a plataforma conferir que o arquivo é o mesmo. Um vídeo chamado como a
  tradução de outro da mesma pasta (`aula.en.mp4` ao lado de `aula.mp4`) é recusado: as legendas dele cairiam por cima
  de `aula.en.srt`.
- **Exportação pela IA:** `export_video` (preset `youtube`, `hotmart`, `draft`, `reels` ou `audio`, `formats` e
  `range` opcionais) é uma ferramenta de escrita: um app conectado só para ler e propor pede a sua permissão. Antes,
  roda a verificação antes de exportar; com problemas, a janela "A IA quer exportar com problemas" pergunta, com
  **Não exportar** selecionado. O destino é sempre você quem escolhe, na janela de salvar; a IA nunca escolhe. A
  exportação entra na fila e a IA acompanha com `get_export_status`. Com `range`, sai só o trecho, com legenda e
  miniatura: as legendas traduzidas e o pacote da plataforma descrevem a aula inteira e são recusados num trecho.

## Regravar falas, narração pelo roteiro e lote por curso

- **Regravar falas** (aba Roteiro): com a seção confirmada, as falas da professora que faltam na aula ou estão pela
  metade (menos de 40% e menos de 80% das palavras achadas) abrem o gravador em **Só voz** com o teleprompter só
  delas, uma por tomada. Na volta, a voz é tratada e transcrita, cada fala é achada na própria tomada e encaixada entre
  as falas em volta dela (`planLineInsert`, a mesma conta das inserções do apresentador), abrindo a timeline com a tela
  parada quando a pausa é curta. Uma fala pela metade é trocada no lugar: a tomada incompleta sai e a nova começa onde
  ela começava, no mesmo rascunho.
- **Narrar intervalo** com roteiro: o painel mostra as falas daquele trecho (as que estão nele e as que faltam no
  lugar dele; numa gravação de tela sem voz, todas as falas da professora). Grave acompanhando a prévia e use
  **Próxima fala** a cada fala. Cada fala entra como rascunho na faixa "Narração" (a das tomadas de antes, quando
  está livre ali; senão uma nova), onde você a disse enquanto a prévia tocava, ajustada para o clique da gravação ou o momento do "Na tela" mais perto (até 2,5 s), sem passar por cima da
  fala anterior (contando as bordas de cada clipe). Com o motor de transcrição instalado, cada fala é cortada nas
  palavras dela. A gravação só entra na biblioteca junto com o rascunho: descartado o rascunho, nada fica solto.
- **Narrar intervalo** grava a voz como o microfone ouve: sem cancelamento de eco, supressão de ruído nem ganho
  automático do navegador, em mono a 48 kHz, em PCM quando o Chromium grava assim (senão Opus a 256 kb/s). O
  microfone salvo nas opções do gravador já vem escolhido. A tomada passa pelo mesmo tratamento de voz da gravação
  (Áudio › Voz) e entra na faixa "Narração" que já existe quando ela está livre no intervalo, sem passar por cima de
  outra tomada (`insertNarration`, `narrationTrack` em `src/shared/narration.ts`).
- **Dividir por seção** (aba Roteiro, com a gravação transcrita): uma gravação longa com várias seções do roteiro vira
  uma proposta de trechos, um por seção achada, com a divisa no meio da pausa entre elas. **Produzir todas** cria um
  projeto por seção com as mesmas mídias, a seção confirmada e o código do vídeo dela. A barra do lote, acima da
  timeline, é a fila de aprovação: abra cada aula, prepare, e **Aprovar e exportar** põe a aula como ela está na fila
  de exportação, na pasta escolhida uma vez para o lote. Dois nomes iguais ganham um número ("Aula (2).mp4"), e um
  vídeo que já está na pasta só é gravado por cima se você confirmar.

## Aprender com a aula anterior

O que você aceita e recusa nas propostas e nos rascunhos de uma aula de um curso fica em
`cursos/<curso>/aprendizado.json`, na pasta de dados do EdiAula, com a aula em que foi decidido. Nada é aprendido de
uma aula só: cada ajuste precisa de decisões de pelo menos 2 aulas, e as aulas mais recentes pesam mais (cada aula
anterior vale 75% da seguinte). Descartar uma proposta inteira conta como uma decisão por tipo de corte, e não uma por
item. Ao abrir a próxima aula do mesmo curso, o modelo do curso oferecido já vem ajustado (`learnedDefaults`), e a
oferta diz o que mudou: a menor pausa cortada passa a ser a
que melhor separa as pausas que você cortou das que manteve (com 6 decisões ou mais); um vício que você recusou cortar
3 vezes ou mais (70% das vezes) deixa de ser cortado no curso; um tipo de corte recusado quase sempre (10 decisões,
90%) sai da limpeza; o zoom automático, as cartelas e a anotação de um "Na tela" recusados toda vez saem do modelo; e
anotações recusadas na maioria das vezes ficam em menor número por minuto.

## Voz, apresentador e tela: o caminho de uma aula

O caminho é este: gravar a própria voz lendo o roteiro, gerar com ela o vídeo do apresentador
(avatar ou pessoa) na ferramenta que preferir, por exemplo uma ferramenta de avatar como o HeyGen,
ou gravar você mesmo, trazer o vídeo de volta, gravar a tela sobre a voz e editar. Tudo roda no
computador; a ferramenta de avatar é usada pelo site dela, como sempre. A interface não cita
marca: quem aparece no vídeo é o **apresentador**.

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
   - **Voz e câmera** é um modo próprio, ao lado de Só voz, com tudo o que ele tem (teleprompter com
     locutores, próxima fala, refazer, medidor, teste de 5 s, acompanhamento pela voz, tratamento e
     tomadas por fala) e a câmera ligada ao mesmo tempo, num processo próprio como no modo Tela, no
     modo negociado da câmera e com a mesma medição de atraso. A câmera e a prévia dela ficam na
     preparação (a câmera deste modo é lembrada à parte da câmera do modo Tela, e a prévia mostra a
     imagem como ela vai sair, sem espelhar). Sem a câmera a gravação não começa, e uma câmera que
     cai no meio pausa a gravação com **Retomar** e **Parar e salvar**, como o microfone. Ao parar,
     a voz entra na faixa **Voz** e o vídeo na faixa **Apresentador**, acima da aula, mudo e
     alinhado à voz desde o primeiro quadro; o tratamento da voz vale para os dois. Numa aula
     deitada a câmera (sem fundo removido) fica no canto, nunca em tela cheia, então a tela gravada
     depois em Tela sobre a narração aparece em volta dela. O vídeo é marcado como apresentador, e
     o Preparar aula corta a voz e o vídeo juntos (eles foram gravados juntos). A recuperação de
     gravação interrompida, o painel de saúde e o teleprompter funcionam igual.
     Quem prefere gravar a câmera depois, ouvindo a própria voz, grava em qualquer programa e usa
     **Importar vídeo do apresentador**, que encaixa o vídeo pela voz.
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
3. **Limpar a voz antes de exportar.** **Limpar a voz antes de exportar** monta uma proposta só, item a
   item: das tomadas repetidas de uma fala fica a última completa (pelas tomadas da gravação e,
   com transcrição, pelo texto do roteiro); saem as tomadas marcadas para refazer, os vícios de
   fala e os silêncios longos, que viram uma pausa de 0,4 s. Aplicar desfaz com um Ctrl+Z.
4. **Exportar a voz** (painel Áudio › Vídeo do apresentador, ou menu Arquivo), para gerar o vídeo do
   apresentador: grava WAV 48 kHz, 16 bits,
   mono da faixa Voz, já tratada e cortada. Cada exportação ganha uma pasta própria dentro de
   **Voz exportada**, ao lado do projeto, com a data e a hora (`Voz exportada/2026-10-18 14h05m09`),
   e nunca apaga o que foi antes. Os arquivos levam o nome da aula e do trecho, como
   `Aula 3 (F1P1-D01).wav`. Dá para exportar a aula inteira, uma parte por seção do roteiro ou
   uma por inserção do avatar (como `F1P1-D01`); uma inserção que tem falas em vários parágrafos
   sai inteira, e dois trechos com o mesmo código fazem a exportação parar com um aviso para
   corrigir o roteiro. **Dividir a voz em partes de até N min** (5 min por padrão, de 1 a 60, salvo
   na aula) limita cada arquivo, dividido numa pausa, porque algumas ferramentas de avatar limitam
   o tamanho do arquivo: o envio do HeyGen, por exemplo, aceita até 32 MB por pedido, e 5 minutos
   dão 28,8 MB. A aula guarda as últimas 20
   exportações (os mestres da voz), cada uma com o mapa de cada arquivo para a timeline.
5. **Importar vídeo do apresentador** (menu Arquivo ou painel Áudio): escolha um ou vários vídeos. Cada um
   é comparado pelo próprio som (correlação no envelope e depois no sinal) com todos os arquivos
   exportados que ainda estão no disco, e entra na faixa do avatar onde o mapa do arquivo
   vencedor diz que aquela voz está agora, seguindo os cortes feitos antes e depois da
   exportação. A voz como está agora só é usada quando nenhum arquivo exportado sobrou. O fundo
   liso sai sozinho e o avatar vai para o lado, como nas inserções. Uma pausa curta entre dois
   clipes da voz (até 1,5 s) não faz o avatar sumir, e o esmaecimento fica só nas pontas. O vídeo
   entra mudo, porque vale a voz tratada; com **Usar o som do vídeo importado**, a voz fica calada
   só naquele trecho (`Clip.mutedFor: "presenter"`; aulas salvas com o valor antigo `"heygen"`
   abrem com o novo), sem mudar a voz exportada nem dar aviso de voz editada. Um vídeo um pouco
   mais longo ou mais curto que a voz é acelerado ou freado o necessário. O clipe e a mídia se
   chamam **Apresentador · aula inteira** (ou o nome do trecho) e ficam com a miniatura.
   - Se a voz foi editada depois da exportação, o app só avisa: o encaixe segue o mapa do
     arquivo enviado e já respeita os cortes.
   - Quando o encaixe é incerto (confiança baixa, dois arquivos que servem igual em lugares
     diferentes, ou nada a encaixar), o vídeo não entra às cegas: a barra acima da timeline
     mostra o melhor palpite, com **Ir para lá**, **Encaixar aqui** e **Descartar**.
6. **Gravar a tela sobre a narração.** No painel Áudio (ou no menu Arquivo), **Gravar a tela
   sobre a narração** abre o gravador nesse modo: a voz da aula toca nos fones a partir do cursor
   da timeline enquanto a tela é gravada. O teleprompter mostra a voz em karaokê, com a palavra
   atual acesa, e as próximas instruções "Na tela" do roteiro. Microfone e áudio do PC começam
   desligados (a voz já existe); dá para ligar, e o áudio do PC não grava a voz que o gravador
   toca, porque deixa de fora o som da janela do gravador (num Windows que não separa esse som, o áudio
   do PC fica desligado, com aviso). Pausar pausa as duas coisas: a pausa vira corte
   na tela e a voz continua do mesmo ponto. O take entra na faixa da tela no tempo da voz: o
   gravador anota, a cada meio segundo, que segundo da voz estava sendo ouvido, já descontada a
   latência da saída de áudio.
   - **Regravar a tela neste intervalo:** marque um intervalo na régua da timeline e use o botão
     ao lado de Narrar intervalo. A voz começa dois segundos antes, a gravação para sozinha no
     fim do intervalo e só aquele trecho da tela é trocado, na faixa em que a tela gravada está.
     Se você parar antes do fim, só o que foi gravado é trocado. A câmera, o áudio do PC e o desenho
     do take antigo saem do mesmo trecho; o microfone dele sai também quando outra voz cobre o trecho
     (quando ele é a própria voz da aula, ele fica). O desenho e o quadro do take novo entram sobre a
     tela nova, e uma tela guardada em partes (sem espaço para juntar) entra pelas mesmas âncoras.
7. **Editar e exportar** como sempre. A exportação usa a voz tratada; se algum tratamento ainda
   não terminou, ela trata antes de exportar.

## Apresentador (avatar ou pessoa) e composição

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
- Escolhe sozinho a seção que corresponde à gravação (`rankSections`, pela parte das palavras de cada seção que foi falada, sem contar artigos e preposições). Se a seção escolhida tem menos de 60% das palavras ditas ou fica a menos de 10 pontos da seguinte, o painel pergunta se é ela mesma; escolher na lista ou clicar em **É esta** confirma (`script.confirmed`).
- Compara com a **duração alvo** e mostra cada fala com o tempo
  na timeline (clique para ir até ela) e se foi gravada inteira.
- **Português falado** (`src/shared/ptSpeech.ts`): "pra", "pro", "tá", "tô", "tava", "cê", "num", "numa", "dum", "vamo" valem o que querem dizer; números batem escritos ou falados, até os milhões ("x 208" e "xis duzentos e oito", "25%" e "vinte e cinco por cento", ordinais); palavras com hífen batem juntas ou separadas; siglas soletradas ("pê dê efe") viram a sigla. O alinhamento (`src/shared/scriptAlign.ts`) usa as palavras já corrigidas pelo glossário; o que sobra casa pelo som (até uma letra de diferença, duas a partir de 7 letras, só em palavras de 4 letras ou mais ou termos do glossário). Casar exato vale 2, aproximado vale 1, e casar a palavra seguinte da mesma tomada vale um pouco mais, para a fala dita de uma vez ganhar das mesmas palavras soltas pela aula. Cada fala fica onde a maior parte dela foi dita em sequência, o que acerta as falas curtas do avatar.
- **Tomadas da mesma fala:** perto de onde cada fala foi achada, as tomadas são separadas em pausas de 0,8 s ou fim de frase, e uma tomada nunca passa de 1,3 vez as palavras da fala; fica a tomada mais recente com pelo menos 80% dos acertos da melhor, mesmo com duas ou três palavras diferentes, e as outras viram proposta como "tomada anterior da linha N".
- **Fora do roteiro:** o que foi falado e não está no roteiro (tropeços, regravações) vira proposta de corte, só em blocos inteiros, entre pausas de 0,3 s ou pontuação; até 3 palavras enfiadas numa fala são paráfrase e ficam. Um número ou um nome dito diferente do roteiro dentro de uma fala ("sobe 4" onde está 3) não passa como paráfrase: aparece no painel do roteiro e no `get_script` para conferir. A proposta é recusada sem seção confirmada ou quando mais de 35% das palavras faladas não se alinharam a nenhuma fala da seção (seção errada, não regravação);
  quando um trecho foi gravado duas vezes, fica a última tomada.
- Os IDs de inserção (`F1P1-D01`) valem em qualquer lugar de um **Na tela**, em negrito ou não, vários na mesma linha, e cada um vai para a próxima fala do avatar. Quando o **Na tela** começa com um ID em negrito, valem os IDs em negrito dele; um ID já anunciado na seção e citado de novo ("a mesma entrada de F1P1-D01") não desloca os seguintes.
- **Encaixar** (ou peça à IA "aplique a inserção F1P4-D01"): acha a fala do avatar no vídeo do apresentador transcrito,
  coloca logo depois da fala anterior, numa faixa acima de tudo e no lado livre; se a pausa gravada for curta,
  abre espaço na timeline segurando a tela num quadro parado. A música de fundo não é cortada.
- **Encaixar todas** (ou `place_inserts` da IA, com os IDs ou `"all"`): pede a seção confirmada, planeja todas as falas do avatar da seção sobre o mesmo alinhamento e aplica do fim para o começo, num Ctrl+Z só; uma que esbarra numa faixa travada ou cairia na mesma pausa de outra fica de fora com o motivo, e as outras entram. Uma fala do avatar já colocada conta como fala anterior: a seguinte entra depois dela, sem os clipes se sobreporem. Se o avatar ficaria por cima de outra voz, a da professora ou a de outro avatar, a mensagem avisa.
- A IA ganhou `get_script`, `place_insert`, `place_inserts`, `propose_off_script`, `set_clip_layout` e `set_background_removal`.

## Gravação de tela, cursor e zoom

- **Gravar tela** (Início, barra superior ou barra lateral): camada transparente sobre o monitor com região
  ajustável, câmera (com prévia e modo escolhido sozinho ou à mão), microfone (com medidor) e **teleprompter**
  com as falas do roteiro do projeto. Nada disso aparece na gravação (proteção de conteúdo do Windows).
- **Modos de gravação**, nesta ordem: **Tela** (microfone, câmera e áudio do PC, todos opcionais e lembrados
  entre gravações), **Só voz** (só o microfone, sem áudio do PC), **Voz e câmera** (o microfone e a câmera do
  apresentador, sem áudio do PC), **Tela sobre a narração** (microfone e áudio do PC opcionais, desligados por
  padrão) e **Guiado por plano**. Cada caixa de escolha mostra o nome inteiro ao passar o mouse.
- O gravador lembra as escolhas entre uma gravação e outra (`recorder.json`, no perfil do app): tela, região e a
  trava da proporção, microfone, câmera e modo, áudio do PC, teclas, quadros por segundo (30 ou 60), qualidade,
  contagem, atalhos, tamanho e ritmo do teleprompter, se os trabalhos de fundo esperam a gravação e o zoom automático
  ao importar. Um microfone ou câmera que não
  está mais ligado dá lugar ao padrão, sem apagar a escolha salva. **Opções do gravador** (engrenagem) muda as
  que não estão na barra.
- **Região** (barra do gravador): tela inteira, 1920 × 1080, 1280 × 720, 16:9 no centro, a resolução da aula ou
  personalizada. Largura e altura se digitam em pixels da tela (os de verdade, qualquer que seja a escala do Windows),
  com a proporção travada ou não, e a região sempre tem medidas pares (`src/shared/region.ts`). Pelo teclado, o ícone
  da região a move e cada alça a redimensiona com as setas (1 px, ou 10 px com Shift). **Janela…** lista as
  janelas abertas (as do EdiAula ficam de fora) e encaixa a região na escolhida, cortada à tela dela. Durante a
  gravação, a pílula avisa se essa janela for minimizada, fechada ou sair da região; **Manter a janela à frente**
  deixa ela por cima das outras enquanto grava, e ela volta ao normal ao parar ou descartar. Enquanto está por cima
  ela fica anotada no perfil (`janelas-na-frente.json`): se o app e o auxiliar caírem juntos, a próxima abertura a
  devolve ao normal (só se o computador não reiniciou no meio).
- Atalhos (configuráveis): **F9** inicia e pausa, **F10** para, **F8** marca o alvo do modo guiado,
  **Ctrl+Shift+M** marcador, **Ctrl+Shift+R** refazer o último trecho (vira proposta de corte; veja abaixo),
  **Ctrl+Shift+D** desenhar na tela, **Ctrl+Shift+↓** e **Ctrl+Shift+↑** próxima fala e fala anterior do
  teleprompter. Um passador de slides (Page Down e Page Up) também muda a fala, se ligado nas opções. Iniciar,
  parar e o alvo valem enquanto o gravador está aberto; os outros só durante a gravação, então Ctrl+R e as setas
  continuam funcionando nos outros programas. Atalho que outro programa já usa ou que repete outro aparece no
  painel; sem iniciar e parar a gravação não começa.
- **Pausa instantânea:** pausar não fecha nada. Tela, microfone e câmera continuam gravando; a pausa é anotada e
  vira corte quando a gravação entra no projeto. Retomar é imediato e as primeiras palavras depois do F9 não se
  perdem. Só uma pausa de mais de 5 min fecha a parte da tela e da câmera, para poupar disco; aí a retomada leva
  cerca de 1 s e o gravador avisa. A gravação termina no instante do F10 (ou de **Parar**): o que vem depois,
  enquanto os arquivos fecham, fica de fora. **Descartar este take e recomeçar** (lixeira na pílula) pede
  confirmação dentro da própria pílula (nunca numa janela do sistema, que entraria no vídeo), manda o take
  para a Lixeira e volta ao começo sem fechar o gravador. Se a Lixeira recusar, a pasta é apagada; se nem
  isso der, o aviso diz onde os arquivos ficaram, e o gravador volta ao começo do mesmo jeito.
- **O que a pausa gravou não sai dos arquivos do take:** como a captura continua na pausa, os segundos
  pausados ficam anotados em cada mídia do take (`asset.recording.paused`, `src/shared/pausedMedia.ts`).
  Nenhum aparo, arrasto de borda em grupo nem fechamento de corte estica um clipe para dentro deles, e o
  pacote da aula leva cada uma dessas mídias com os trechos pausados em preto e silêncio (refeitas pelo
  FFmpeg, com a mesma duração e os mesmos tempos) e a transcrição sem as palavras ditas ali. Os arquivos
  originais na pasta da gravação continuam com esse conteúdo, e o editor avisa ao importar. Apagar a pausa
  nos próprios arquivos depois de finalizar ficou para depois: refazer a tela custa cerca de um terço da
  duração do take (2 min de 1080p30 levaram 35 a 39 s nesta máquina, com NVENC ou x264), o que daria uns
  20 min para uma aula de uma hora, além de mais uma perda de qualidade e o dobro de disco enquanto roda.
- **Windows 10 versão 2004 ou mais novo para gravar a tela:** antes dela o Windows não deixa a janela do
  gravador fora da captura (só a pinta de preto), e ela cobre a tela inteira. Nessas versões os modos de
  tela recusam começar, com o aviso; Só voz segue funcionando.
- **Desenho na tela:** durante a gravação, **Ctrl+Shift+D** (ou o lápis na pílula, nos modos Tela e Tela sobre a
  narração) liga o desenho sobre o gravador, com as cores da paleta da aula, três espessuras e **Apagar tudo**. O
  desenho não entra no vídeo: cada traço vai com o tempo dele para o diário da sessão e, na importação, vira um clipe
  "Desenho" numa faixa livre acima da tela, alinhado ao take e animado como foi feito (o traço aparece aos poucos),
  igual na prévia e na exportação (`src/shared/drawing.ts`). No modo desenho o gravador recebe o mouse: o clique
  não chega ao programa de baixo, e os cliques e arrastos da caneta ficam de fora do zoom automático, do som de
  clique, da onda e da proteção de atividade da limpeza. O desenho funciona nos modos com tela, e só neles o atalho
  fica registrado; o que se desenha nos primeiros instantes, antes de o relógio do gravador ser medido, entra no
  take com o tempo certo. Esc devolve o teclado ao programa gravado, e se a janela do gravador parar de responder
  com o desenho ligado o mouse volta na hora para a tela.
- **O desenho no projeto:** fica guardado uma vez só, na mídia do vídeo dele (`Asset.drawing`); cada clipe guarda só
  o trecho que mostra. As posições vão com quatro casas, e um desenho enorme é limitado (5000 traços, 100 mil pontos
  ao todo, com aviso na importação), para o projeto continuar salvando. Um "Apagar tudo" antes do primeiro traço é
  descartado. O vídeo do desenho é feito em segundo plano, na fila do trabalho pesado e com progresso, sem segurar a
  importação: só os quadros em que algo muda são desenhados, cada imagem diferente uma vez só (guardada pelo que
  mostra), e o vídeo segura cada uma até a próxima (taxa variável), então meia hora parada vira um quadro. Os clipes
  entram num passo de desfazer próprio quando o vídeo fica pronto, e não entram se a importação foi desfeita. Cada
  clipe de desenho entra no grupo do clipe de tela em que está: mover, aparar a mesma ponta e a faixa magnética
  levam os dois juntos (Alt + clique seleciona só o clipe do desenho, para editar), e "Lado a lado" leva os traços
  com a tela e devolve os dois ao lugar de antes.
- **Ferramentas do desenho:** caneta, marca-texto translúcido e seta; com Shift o traço sai reto. A cor começa pelo
  destaque da paleta da aula e troca pela paleta.
- **Quadro branco e quadro negro:** no modo desenho, com o gravador em foco, **B** põe um quadro branco por cima da
  região gravada e **N** um quadro negro (a mesma tecla de novo tira o quadro), **P** abre uma página nova (limpa os
  traços e mantém o quadro), **Ctrl+Z** desfaz o último traço e **Esc** sai do modo desenho. Uma barrinha discreta
  mostra essas teclas, fora da captura. No quadro branco a tinta começa escura; no negro, giz claro. O vídeo continua
  gravando a tela por baixo; ligar e desligar o quadro (com o tipo e o tempo), página nova e desfazer vão para o diário
  como dados, junto com os traços.
- Na importação, cada trecho com quadro vira um clipe de anotação "Quadro": o fundo na cor do quadro cobrindo a tela,
  os traços animados por cima e o cursor da gravação desenhado acima do quadro, como a ponta da caneta; cada página
  nova é um corte entre dois clipes. Nas propriedades dá para trocar a cor do quadro e apagar um traço específico
  (de um Quadro ou de um Desenho; a lista mostra só os traços que aparecem naquele clipe): o vídeo do desenho é
  feito de novo, só nas imagens que mudaram, e a prévia e a exportação mudam juntas. Cortar, aparar e apagar o clipe
  é como em qualquer clipe. O desenho é uma fronteira do zoom automático: nada feito com a caneta vira zoom, e um
  zoom nunca atravessa o desenho (o clique antes e o clique depois dão dois zooms); as sugestões pelas mudanças de
  tela também pulam esses trechos. O pacote da aula leva o desenho no projeto e faz o vídeo de novo ao abrir.
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
  fragmentado (`tela-0.mp4`, `microfone-0.m4a`, `camera-0.mp4`; o áudio do PC em `sistema-0.wav`, ou `sistema.webm` pela reserva; no modo Só voz, `voz-0.mkv` em PCM), legíveis até o último fragmento
  se algo cair; o auxiliar grava `cursor.jsonl` e as imagens dos cursores em `cursors/`; e o app grava
  `sessao.jsonl`, o diário da sessão (começo, primeira amostra de cada parte, pausas, marcadores, falhas, falas do
  teleprompter, parada), que vai ao disco nas pausas, marcadores, falhas e na parada e a cada 5 s. Ao parar, as
  partes da tela viram `tela.mp4` comum (busca rápida) se houver espaço para a cópia; o microfone e o áudio do PC
  são cortados no que cada parte da tela cobre, com silêncio onde faltar (o áudio do PC chega como `sistema-0.wav`
  do auxiliar, ou `sistema.webm` pelo Chromium), e saem em `microfone.m4a` e
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
  houver uma; num take Voz e câmera, a câmera vai para a faixa "Apresentador", acima da aula), o microfone na
  faixa "Voz", o áudio do PC na dele e a narração guiada na
  dela; faixas existentes são reaproveitadas quando estão livres. As pausas viram cortes em todas ao mesmo tempo,
  e os cortes da limpeza e as inserções do roteiro passam a levar junto o microfone e o áudio do PC, mesmo antes
  da transcrição.
- **Ctrl+Shift+R pelas palavras:** com a voz transcrita, o corte começa onde o trecho repetido foi dito antes (a
  última vez que as duas ou três primeiras palavras ditas depois da marca aparecem antes dela) e vai até onde ele
  recomeça; sem essas palavras, começa no início da frase interrompida (`retakeCutsFromWords` em
  `src/shared/recording.ts`). Sem transcrição, a proposta sai pelo volume do microfone, da pausa antes do trecho
  errado até a pausa depois da marca, e é trocada pela das palavras se a voz for transcrita enquanto ela espera.
- **Câmera da gravação** (Propriedades do clipe da câmera › Câmera): enquadramento em círculo no canto, arredondado
  no canto, lado a lado (a tela do take vai para a outra metade) ou tela cheia, para todos os trechos da câmera
  (`src/shared/cameraFraming.ts`). **Remover fundo com IA local** recorta a pessoa com um modelo de segmentação que
  roda no próprio computador, sem enviar nada: em segundo plano, como a remoção de fundo por cor, ele gera o vídeo com
  transparência em cache que a prévia e a exportação usam, e espera a gravação terminar. Custa cerca de 12 ms por
  quadro, a 256 px. O modelo e a licença ficam em `resources/segmentation/`.
- **Trabalhos de fundo esperam a gravação:** proxies, remoção de fundo e transcrição que começariam durante a
  gravação esperam ela acabar, e a fila de exportação segura o próximo item ("Exportação em espera"); o que já
  estava rodando continua com prioridade baixa. Dá para desligar nas opções do gravador.
- **Cursor** (Propriedades): tamanho, suavizar, onda nos cliques, halo (na cor da paleta da aula), esconder
  quando parado e teclas na tela.
  - **Desenho do ponteiro:** Automático (o desenho do EdiAula nos formatos comuns: seta, mão, barra de texto,
    espera, ocupado, cruz, mover, redimensionar e proibido; e a imagem real nos cursores próprios dos programas, como
    a mão de arrastar dos blocos), Desenhado (sempre o desenho) ou Do sistema (a imagem que o Windows mostrou, onde
    ela foi guardada). Um cursor que inverte a tela (a barra de texto de muitos programas) sai escuro com contorno
    claro (`src/renderer/src/lib/cursorImages.ts`).
  - **Suavizar sem atraso:** a mola anda para a frente e para trás (`buildTrack` em `src/shared/cursor.ts`), então o
    ponteiro não fica para trás nem passa do ponto. Em cada clique ele é preso ao ponto clicado: chega nele no
    instante do clique, fica nele enquanto o botão está apertado (um arrasto segue a gravação) e solta aos poucos
    depois. O erro no instante do clique fica abaixo de 0,5 px (`tests/cursor-effects.test.ts`).
  - **Lupa** (raio e aumento): um círculo em volta do ponteiro com a tela ampliada. **Holofote** (raio e
    intensidade): escurece o resto da tela. **Som de clique** (volume): um clique curto feito pelo próprio app
    (`src/shared/clickSound.ts`), tocado na prévia e misturado ao áudio da exportação.
  - **Efeito por trecho:** liga ou desliga a lupa, o holofote, o halo, a onda, o som ou o próprio cursor só num
    pedaço da gravação. O trecho aparece em roxo no pé do clipe da gravação, e as pontas dele se arrastam ali.
  - Tudo igual na prévia e na exportação: o mesmo desenho (`src/renderer/src/lib/cursorDraw.ts`) faz a prévia e o
    vídeo pequeno do ponteiro; a exportação amplia a lupa e move a imagem do holofote com as mesmas posições.
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
- **Zoom automático**: um zoom por sequência de cliques, passeando entre eles, acompanhando arrastos (blocos do
  Blockly) e seguindo o cursor de texto enquanto algo é digitado (o auxiliar anota onde ele está, com o zoom automático
  ligado nas opções do gravador). Roda sozinho quando a gravação entra no projeto (opção ligada por padrão) e nunca dá
  zoom num clique sobre os controles do gravador. Zoom manual "aqui". O zoom fica no tempo da gravação, então
  acompanha cortes.
- **Zooms da gravação editáveis:** as faixas âmbar na timeline se clicam e se arrastam pelas pontas (começo e fim).
  Com um zoom selecionado, o painel e o retângulo na prévia são os mesmos da camada de zoom: aproximar, ponto (o
  retângulo move o ponto do zoom na posição atual) e suavidade, mais **Apagar** (apaga o zoom selecionado).
- **Sugerir pelas mudanças de tela:** a detecção de cena do FFmpeg no proxy (`select='gt(scene,0.25)'`) acha as
  telas que mudam muito e propõe um zoom logo depois de cada uma, olhando para onde o ponteiro vai; as sugestões se
  aplicam uma a uma ou todas.
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
- **Formato vertical** no projeto novo (1080 × 1920 · 30 fps, para Reels, Shorts e celular) e **Mudar formato…**
  (Arquivo, ou Propriedades do projeto com nada selecionado) para levar uma aula pronta a outro tamanho:
  **Encaixar** mostra a imagem de agora inteira no novo formato, com faixas onde ela não chega; **Preencher**
  cobre o novo formato e corta o que passa das bordas. Cada clipe mantém o lugar e o tamanho em relação à
  imagem de antes, inclusive o movimento por keyframes e o ponto das camadas de zoom (`reframeProject` em
  `src/shared/compose.ts`), num único Ctrl+Z.
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
- **Áudio do PC** na gravação (o som do sistema: música, efeitos de um jogo, o navegador), numa faixa própria
  já alinhada e cortada nas mesmas pausas da tela. Por padrão quem grava é o `ediaula-helper.exe`, com o process
  loopback do WASAPI no modo que exclui a árvore de processos do EdiAula (`loopback --exclude-pid`): nenhum som do app
  entra, de nenhuma janela, então a voz da aula no modo Tela sobre a narração e a narração do modo guiado não entram
  duplicadas. Ele grava `sistema-0.wav` (PCM 16 bits, 48 kHz, estéreo) na pasta do take, no relógio da gravação
  (lacunas viram silêncio), em partes no disco, e uma parte cortada por uma queda é recuperada como as outras. Precisa
  do Windows 10 versão 2004 ou mais novo; o app confere enquanto a resposta for não (uma falha passageira não tira
  essa captura pelo resto da execução) e guarda o sim. Se a captura nativa não abrir no começo, o gravador passa
  para a reserva abaixo; se o auxiliar parar no meio, a gravação segue, o aviso aparece e a captura abre de novo na
  hora, numa parte nova alinhada pela primeira amostra dela (até três vezes por take; numa pausa, abre com a
  retomada). Numa pausa longa
  (mais de 5 minutos) a parte do áudio do PC fecha com a tela, e a retomada abre `sistema-1.wav`, para o arquivo não
  crescer com a pausa inteira.
- **Reserva do áudio do PC:** num Windows sem esse modo, o áudio do PC vai pelo loopback do Windows no Chromium com
  `restrictOwnAudio` (`src/shared/systemAudio.ts`): o som que a própria janela do gravador toca fica de fora, mas o
  de outra janela do EdiAula entra, por isso tudo o que o gravador toca durante a gravação toca na janela dele. O
  processamento de voz do Chromium (cancelamento de eco, supressão de ruído, ganho automático) fica desligado nessa
  faixa. Quando nem o process loopback existe (anterior ao Windows 10 2004), o áudio do PC fica desligado, com aviso,
  nos modos em que o gravador toca uma voz (Tela sobre a narração e guiado com narração), e nos outros segue com o
  loopback comum e um aviso.
- Medido nesta máquina com Electron 44 (`tests/systemAudioExclusion.test.ts`, com `EDIAULA_SOUND_TESTS=1`): pelo
  auxiliar, um tom tocado numa janela do app cai de -13 dB (captura sem exclusão) para cerca de -83 dB, e em outra
  janela do app também; o tom de outro programa fica em -30 dB. Pela reserva do Chromium, o tom da janela que captura
  cai para -83 dB, mas o de outra janela do app fica em -13 dB.
- **Teclas na tela**: atalhos (Ctrl/Alt/Win+…) e setas/Enter/Tab/Esc/Delete/F1 a F12 aparecem num balão no canto.
  Espaço e Backspace sozinhos não aparecem, porque o auxiliar não tem como saber se o foco está num campo de
  texto; AltGr e Alt com o teclado numérico também ficam de fora, porque escrevem caracteres.
  A digitação comum **nunca** é gravada. Para a limpeza não cortar uma digitação silenciosa, o auxiliar anota só o
  instante em que algo foi digitado (evento `ty` do `ediaula-helper.exe`, `typing` no `cursor.json`): no máximo um
  a cada meio segundo, sem qual tecla, sem quantas e sem o ritmo, e nada enquanto o gravador está na frente. Isso
  vale mesmo com as teclas na tela desligadas, porque não mostra nada.
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
  borrada da forma, desenhada uma vez (`shared/export/fx.ts`), ou do alfa a cada quadro no avatar recortado e
  nas imagens transparentes, com o mesmo desfoque. Nas anotações ela é
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

## Projetos, cópias de segurança e modelos do curso

- **Início:** a lista de aulas guarda até 300 recentes; aparecem as 48 mais recentes e **Mostrar todas as
  N aulas** traz o resto. A busca e os cursos filtram sempre a lista inteira.
- **Duplicar, renomear e cópias de segurança:** no botão **…** (ou no botão direito) de cada aula no Início,
  e no menu Arquivo do editor. **Duplicar** grava ao lado uma aula própria, "<nome> (cópia)", com outro id
  (as propostas da IA vão junto). **Renomear** muda o nome da aula e do arquivo, e a pasta das cópias de
  segurança acompanha. **Restaurar cópia de segurança…** lista as cópias que o app guarda em
  `Projetos/.backups` (uma a cada 10 minutos de edição, as últimas 20) com data, duração e número de clipes,
  lidos de um índice pequeno ao lado delas (`indice.json`): a cópia inteira só é lida para restaurar.
  Restaurar grava antes o estado atual como mais uma cópia, então dá para voltar. A aula aberta é salva
  antes de cada uma dessas ações; enquanto o arquivo é renomeado, os salvamentos esperam, e o que foi
  editado nesse meio tempo é salvo no arquivo novo.
- **Começar pelo modelo do curso:** o mesmo modelo do curso (`src/shared/courseTemplate.ts`, em
  `cursos/<curso>/modelo.json`) serve para começar uma aula nova. Em **Novo projeto**, ao digitar um curso
  que tem modelo, aparece **Começar com o modelo do curso** (ligado) e o formato do modelo vem escolhido,
  mas pode ser trocado: a aula nasce no formato escolhido, com as faixas, a paleta e a legenda do modelo, e
  a música entra na biblioteca (`startingLesson`, `src/renderer/src/lib/courseStart.ts`). Quando a primeira
  mídia chega à timeline, a abertura (que empurra a aula para frente), o encerramento e a música até o fim
  entram sozinhos, num Ctrl+Z. Essas são as únicas cartelas dessa aula: o modelo não é oferecido de novo
  nela e o Preparar aula deixa as cartelas para esse momento (e nunca põe outra quando já há uma, seja
  cartela de anotação ou o modelo animado de Modelos). O modelo não leva mídias da aula nem cortes; a
  música precisa continuar no mesmo lugar do disco e só é aberta quando está neste computador (um
  caminho de rede, `\\servidor\pasta`, nunca é tocado, para não mandar as credenciais do Windows para lá).

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
- **Prévia:** ao arrastar um clipe no vídeo, ele encaixa nas bordas e no centro da tela e também nas
  bordas e no centro dos outros clipes visíveis, com guias cor-de-rosa (Alt desliga). **Alt + clique**
  seleciona a camada de baixo naquele ponto (cada Alt + clique desce uma camada e, do fundo, volta ao topo),
  decidido ao soltar o botão sem arrastar: Alt + arrasto continua movendo o clipe clicado sem encaixe.
  **Ctrl + roda do mouse** aproxima e afasta a prévia em volta do ponteiro (de 50% a 400%, só a visão, não a
  aula), a roda ou o botão do meio movem a prévia aproximada e o número da porcentagem volta a ajustar. O
  escudo mostra as **áreas seguras**: a margem de 5% que todo player mostra, a faixa da legenda e, numa
  aula horizontal, o lado onde o apresentador costuma ficar.
- **Posição e tamanho com números:** tamanho, horizontal e vertical (em pixels da aula), opacidade, corte das
  bordas e **Girar** (graus) aceitam valor digitado ao lado do controle; enquanto o controle está seguro, a
  prévia já mostra a mudança, e soltar grava um único Ctrl+Z. **Espelhar na horizontal** e **na vertical**
  invertem a parte visível. O giro é em volta do centro e leva junto forma, borda e sombra; a prévia usa CSS
  e a exportação os filtros `hflip`, `vflip` e `rotate`, com o mesmo resultado (`tests/export-orientation.test.ts`).
  Num clipe girado, a cortina e a dobra da transição são aplicadas antes do giro, sobre a imagem, como a
  prévia faz, e a sombra gira junto.
  Em **Tempo**, início, fim e duração do clipe também se digitam (horas:minutos:segundos:quadros, mm:ss ou
  segundos).
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

## Timeline: precisão, ímã, seleção e faixas

- **Quadro a quadro de verdade:** procurar, dividir, aparar e mover caem sempre num quadro da aula
  (`toFrame` em `src/shared/timeline.ts`), e pausar para no quadro que estava na tela. O tempo aparece como
  horas:minutos:segundos:quadros.
- **Ímã** (`src/shared/snap.ts`): encaixa nas bordas dos clipes, no cursor de reprodução, no começo e no fim
  de cada palavra transcrita, nos silêncios, nos marcadores da gravação e no intervalo marcado; sem nada
  perto, cai no quadro mais próximo. É o que deixa cortar exatamente onde a fala começa ou termina. Os
  alvos ficam numa lista ordenada com busca binária, feita de novo só quando os clipes, as palavras ou o
  intervalo mudam; o clipe arrastado e o cursor de reprodução são tratados na busca. Só contam as
  palavras e os silêncios do que se ouve (faixa silenciada ou fora do solo não). A ferramenta Corte (C)
  usa o mesmo ímã.
- **Excluir o intervalo:** marque o intervalo na régua e use **Excluir o intervalo** (barra do intervalo ou
  Editar): ele sai de todas as faixas que os cortes de texto alcançam e o resto anda para a esquerda, sem
  perder a sincronia; a música continua e termina com a aula, e faixas travadas não mudam. É o mesmo corte
  da transcrição: um trecho protegido recusa, com aviso, e o intervalo fica marcado.
- **Aparar empurrando o resto (Shift + borda)** (`src/shared/ripple.ts`): o clipe fica no lugar e a aula
  acompanha a mudança nas faixas que os cortes de texto alcançam e na do clipe. Encurtar é um corte
  delas, o mesmo caminho de Excluir o intervalo: a voz perde o mesmo trecho da tela e continua em
  sincronia, mesmo com o microfone inteiro debaixo da tela dividida. Alongar abre espaço nelas, cortando
  em dois o que passa pelo ponto. A música não é empurrada nem fica com buraco: só o fim dela acompanha o
  novo fim da aula. Sem nada depois do clipe, é um aparo comum. Aparar o começo tira ou devolve o trecho
  do início sem mover o clipe.
- **Inserir empurrando (Ctrl ao soltar):** soltar mídia da biblioteca (ou do Explorer) com Ctrl abre espaço
  nas faixas que os cortes alcançam e na faixa onde a mídia entra: o que estiver no ponto (a tela, a voz,
  uma anotação) é dividido e o resto anda para a direita; a música e as faixas travadas ficam. O marcador
  de soltar fica laranja.
- **Rascunho esperando revisão:** enquanto um rascunho que muda a estrutura da aula espera na barra de
  revisão, aparar, inserir, excluir o intervalo, estender o quadro, reordenar faixas e mudar o formato
  esperam também, com um aviso.
- **Seleção por retângulo:** arraste no fundo das faixas para selecionar tudo o que o retângulo toca (Ctrl
  ou Shift somam à seleção). No botão direito do nome da faixa: **Selecionar a faixa inteira**,
  **Selecionar desta faixa a partir do cursor** e **Selecionar tudo a partir do cursor** (este também em
  Editar).
- **Ajustar vários de uma vez:** com vários clipes selecionados, Propriedades mostra opacidade, posição
  (com as posições prontas), entrada e saída, volume e velocidade; cada mudança vale para todos, num único
  Ctrl+Z.
- **Reordenar faixas:** arraste o rótulo da faixa (F1, F2…) para outro lugar da pilha, use **Alt+↑** e
  **Alt+↓** com o rótulo em foco, ou **Subir a faixa** e **Descer a faixa** no botão direito. A de cima
  continua na frente; uma faixa travada não sai do lugar. Uma faixa de vídeo nova (a tela de uma gravação)
  entra logo abaixo da última faixa de vídeo, onde quer que as faixas de som estejam. Ctrl+Z desfaz.
- **Solo:** o fone no cabeçalho da faixa toca só ela (e as outras em solo). Vale só para ouvir no editor:
  não fica salvo na aula, e a verificação antes de exportar avisa quando há solo ligado (com **Ouvir todas
  as faixas**), porque a exportação leva o som de todas as faixas que não estão silenciadas.
- **Miniaturas por posição:** cada vídeo ganha em segundo plano folhas de miniaturas de dez minutos cada
  (uma a cada 2 s, 160 × 90, `media:filmstrip`, em cache ao lado da mídia, feitas pelo proxy quando ele
  existe, lendo só os quadros-chave), e cada clipe mostra as do trecho que ele toca, conforme o ponto de
  entrada e a velocidade. Uma folha que sumiu (outro computador, cache limpo) é feita de novo; até lá o
  clipe mostra a miniatura do vídeo.
- **J, K e L com som:** L avança e acelera a cada toque (até 8×); J volta, com o som em grãos de 80 ms
  tocados ao contrário; segurar K com L (ou J) anda devagar, a 0,5× e depois a 0,25×, com a voz no mesmo
  tom; soltar o K para. Quadro a quadro (← →) e arrastar o cursor na régua também tocam o som daquele
  ponto. O som vem do processo principal em blocos de 1 s de PCM (`media:audioSnippet`), guardados para ir
  e voltar no mesmo trecho sem ler o arquivo de novo; faixas silenciadas ou fora do solo ficam quietas. As
  leituras usam duas vagas do agendador, e o que só grãos antigos esperam é interrompido: arrastar rápido
  não acumula processos do FFmpeg.
- **Altura da timeline:** a divisão entre a prévia e a timeline fica salva no app (vale para todas as aulas).

## Velocidade por duração e estender quadro

- **Velocidade / duração** (Propriedades ou botão direito › Velocidade do clipe): informe a duração
  desejada em segundos, `mm:ss` ou `hh:mm:ss`, com decimais por ponto ou vírgula (`1:30,5`). A velocidade
  é calculada para manter o trecho inteiro, entre 0,25× e 8×. Com vários clipes, o tempo é a soma das
  durações dos clipes elegíveis; todos recebem a mesma velocidade. Faixas travadas ficam intactas.
- **Estender quadro…** (Propriedades ou botão direito): posicione o cursor no vídeo e informe o tempo
  adicional. Insere uma imagem silenciosa daquele quadro e retoma o vídeo depois, deslocando os clipes
  seguintes da mesma faixa. Fora do clipe, usa o início ou o último quadro. Por padrão as outras faixas não
  se movem; com **Abrir espaço em todas as faixas** (a escolha fica lembrada), tudo o que vem depois anda
  junto em todas as faixas que os cortes de texto alcançam (`extendFrameAll` em `src/shared/ripple.ts`): a
  voz que passa pelo ponto é cortada ali e continua depois do quadro, outro vídeo que passa pelo ponto (o
  apresentador) também para no próprio quadro, a anotação, a imagem ou a camada de zoom que passa pelo
  ponto fica mais longa e parada enquanto o quadro segura (o movimento continua depois, de onde estava), a
  música que ia até o fim segue até o novo fim e as faixas travadas não mudam.
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
  posição) e suavidade. Os zooms das gravações usam o mesmo painel e o mesmo retângulo (`FocusBox` em
  `ZoomTarget.tsx`, `ZoomPointControls` em `ZoomLayerPanel.tsx`); a camada continua sendo o jeito de aproximar tudo
  o que está nas faixas abaixo dela.
- Como no Camtasia, entrada e saída são opcionais: "Aproximar suave" ou "Começar já no zoom"; "Voltar suave ao
  normal" ou "Ficar no zoom até o fim". "Continuar em outro ponto" cria a etapa seguinte colada na atual: o zoom
  desliza de um ponto a outro sem voltar ao normal; "Voltar ao normal aqui" é o "Restaurar" (uma etapa em 1×).
- A exportação aplica o zoom ao composto das faixas de baixo naquele ponto da pilha (`zoomLayerFilter`), com as
  mesmas curvas da prévia (`shared/zoomLayer.ts`). IA: `add_zoom`.

## Gravação guiada da plataforma web

- O modo **Tela** (gravação à mão) permanece disponível e é o padrão. Em Gravar, escolha **Guiado por plano
  (roteiro ou áudio)** em Modo de gravação. Os modos **Só voz**, **Voz e câmera** e **Tela sobre a narração** estão
  na seção de voz e tela.
- **Planos salvos e retomáveis:** cada demonstração é um plano (`shared/guidedPlan.ts`, versão 2) com nome,
  endereço, tamanho de captura, etapas, alvos, tempos e a narração. Os planos ficam no projeto
  (`project.guided`, fora do desfazer) e cada mudança vai para o editor um segundo depois, passando antes por
  um rascunho em `guided-drafts/<id do projeto>.json` no perfil do app: se o app cair antes de salvar, o
  gravador abre com o rascunho. Planos da versão 1 abrem migrados como planos de tela.
- **Onde acontece:** **Na janela da aula** (recomendado) ou **Na tela, em outros programas**.
- **Na janela da aula** o EdiAula não mexe no seu mouse. **Abrir janela da aula** abre a plataforma numa
  janela isolada (sem acesso à ponte do editor; o login fica no perfil dessa janela). Essa janela não tem menu
  (Ctrl+W e Ctrl+R da página não a fecham nem recarregam), só abre endereços da web, e a página só pode entrar
  em tela cheia e copiar para a área de transferência: câmera, microfone, localização, notificações e o resto
  são recusados (`main/guidedSession.ts`). A demonstração roda pela própria página, pelo Chrome DevTools
  Protocol (`main/guidedCdp.ts`): mouse com um evento por quadro (um arrasto de blocos de programação, como os
  do Blockly, recebe todos os eventos de ponteiro), clique com o botão segurado um instante, clique duplo como
  dois cliques, roda, teclas com modificadores e digitação com uma tecla descendo e subindo por caractere.
  Abrir as ferramentas de desenvolvedor nessa janela desliga a automação, com aviso: feche as ferramentas de
  desenvolvedor e tente de novo.
- **Página lenta ou ocupada:** a página conta como aberta quando o documento fica pronto, mesmo que uma imagem
  nunca termine de carregar, e um redirecionamento é seguido; depois de 30 s sem abrir, o take para com aviso.
  Cada comando à página desiste em 10 s. Uma consulta que falha por um momento (a página ocupada ou entre dois
  documentos) é "ainda não" até a espera máxima da etapa; só a automação desligada, uma pergunta da página ou
  parar o take encerram na hora. Enquanto uma navegação está em curso, nenhuma condição vale, nem "sumir". O
  tempo pausado com **F9** não conta na espera máxima. Um aviso da página (alerta, sair da página) é aceito; uma
  pergunta (confirmar, digitar) é recusada e a etapa diz qual foi.
- **Captura em tamanho fixo** (`main/guidedCapture.ts`): uma janela fora da tela, na mesma sessão já logada,
  desenha a página em 1280 × 720 ou 1920 × 1080, escala 1, a 30 ou 60 quadros. O relógio do vídeo é a contagem
  de quadros: o último quadro se repete enquanto a página não muda. Quando a etapa espera (o alvo ainda
  carregando, uma navegação, uma condição), o vídeo segura: não sai quadro e a espera fica registrada. A ação
  acontece no segundo exato da narração, sem "O movimento atrasou". O codificador é o detectado para a tela, pelo
  caminho da CPU (BT.709), e o x264 entra se ele não aceitar. Durante o take, o gravador mostra uma prévia a 5
  quadros por segundo, a etapa e o motivo de cada espera; **F9** pausa, **F10** para e salva. Cada espera vai
  para o registro do take assim que termina, e um take recuperado depois de uma queda entra no projeto com o
  resultado dele. O quadro chega do Electron como uma cópia (`toBitmap`; o `getBitmap` desta versão é o mesmo
  método), cerca de 8 MB por quadro a 1080p: a 60 quadros isso pesa, e o painel avisa ao escolher 60.
- **Marcar alvos:** em cada etapa, **Marcar alvo**: vá até o elemento na janela da aula (navegando à vontade),
  pressione **F8** para ligar o inspetor e clique nele; **F8** de novo cancela. Enquanto marca, a página fica no
  tamanho de captura do plano, reduzida para caber na janela: o que se marca está onde o take vai agir, numa
  tela de qualquer tamanho. O alvo vira um localizador (`shared/locators.ts`) com várias estratégias, da mais
  estável à menos: identificação de teste, atributos `data-`, id estável, papel e nome de acessibilidade,
  rótulo, texto, blocos de programação (como os do Blockly) e, por último, o caminho CSS (que nunca vale
  sozinho: só conta se o elemento ainda tiver a mesma tag e o mesmo texto). Na hora de agir, vale o primeiro
  que encontrar um único elemento visível, habilitado e não coberto. Entre elementos iguais vale, nesta ordem,
  o lugar do bloco na área de trabalho (em unidades dela, que não mudam com rolagem, zoom ou tamanho da
  página), a ordem dele entre os iguais quando foi marcado e o mais perto do retângulo marcado. A página
  precisa estar no endereço marcado (sem contar consulta e âncora). Os valores guardados têm limite (textos
  longos são cortados, um caminho CSS enorme fica de fora) e o plano é conferido na tela antes de salvar: um
  valor inválido aparece com o que corrigir, e o plano só é salvo quando ele for válido. Um projeto guarda até
  50 planos.
- **Quadros (iframes):** um elemento num quadro do mesmo site é lido no próprio quadro, mesmo num quadro escrito
  pela página. Um quadro de outro site (que o Chromium desenha em outro processo) não é aberto por dentro: ao
  marcar, o painel avisa, e o EdiAula age no mesmo ponto do quadro, sem reconhecer os elementos de dentro.
- **Blocos de programação (como os do Blockly):** um bloco é achado pelo texto dos seus rótulos, no flyout, na
  área de trabalho ou como categoria da caixa de ferramentas, e é pego pela borda esquerda. O destino de um
  arrasto é **abaixo de um bloco** (marque o bloco) ou **um ponto da área de trabalho** (marque o fundo),
  convertido pela transformação do `.blocklyBlockCanvas`: funciona com rolagem e zoom diferentes. Num arrasto, a
  página desenha cada passo um pouco depois do evento: cada quadro manda a posição do seguinte e o vídeo espera
  a página desenhá-la, então a mão desenhada e o bloco ficam juntos em todos os quadros (no teste de fumaça, a
  1 ou 2 pixels; a 60 quadros com a página animada e o codificador atrasado, um quadro ou outro a até 7),
  por mais lenta que a página seja; o take só demora mais no relógio.
- **Ações:** apontar, passar o mouse, clicar, clique duplo, clique direito, arrastar, rolar (uma distância ou até
  um elemento aparecer), clicar e digitar, tecla ou atalho (por exemplo **Ctrl+Shift+Z**) e esperar (um elemento
  aparecer, sumir ou ficar disponível). Cada etapa pode ter **Conferir depois** (a etapa só termina quando a
  condição vale) e uma **Espera máxima**.
- **Verificar plano** roda o plano inteiro na janela fora da tela, sem gravar, e lista as etapas que falharam,
  cada uma com uma foto da página naquele momento. Marque de novo só essas. Depois de 3 etapas seguidas com
  falha a verificação para, porque as seguintes dependem delas.
- **Continuar da etapa k:** quando um take para numa etapa (erro ou **F10**), salve o que foi gravado, corrija a
  etapa e use **Continuar da etapa k**: as etapas anteriores são refeitas sem gravar, o ponteiro começa onde
  elas o deixaram e o take novo começa na etapa k, com a narração cortada no mesmo ponto. Ao importar, o take
  anterior do mesmo plano é cortado no segundo da narração em que o novo começa (a fala da etapa k menos a
  antecedência) e o novo entra ali, em todas as faixas do take: a narração segue sem salto. Se houver outro
  clipe depois do take anterior nessas faixas, o corte é só proposto e o take novo vai para o fim.
- **Cursor e registro:** o cursor do vídeo é sintetizado do que a automação fez (`shared/guidedCursor.ts`):
  `cursor.json` versão 2 com um movimento por quadro enquanto ele anda, passando pelo ponto de cada clique no
  instante do clique, cliques com duração (o arrasto é um clique segurado), roda, atalhos com o rótulo e a forma
  tirada do cursor CSS do elemento (mão, texto). Ao lado fica `guided-run.json` (formato estável, versão 1): as
  etapas com os segundos planejados e reais, cada interação e cada espera. A mídia da tela guarda o caminho
  dele (`guidedRun`). A pasta do take é um take comum: uma queda é recuperada como as outras, com cursor. Os
  planos que vieram com o take entram no projeto mesmo quando o gravador foi aberto sem ele.
- **Planos de cada aula:** o gravador mostra os planos da aula para a qual foi aberto e salva neles; aberto de
  novo para outra aula, troca os planos. Trocar **Onde acontece** num plano com alvos marcados pede confirmação,
  porque os alvos de um lugar não valem no outro.
- **Regravar e substituir:** na biblioteca, uma tela gravada assim tem **Regravar e substituir**. O gravador abre
  com o mesmo plano e o take novo entra no lugar do antigo, nos mesmos clipes. Se os tempos do plano ou a etapa
  inicial mudaram desde a gravação, ou o take novo tem outro tamanho ou outra taxa de quadros, a substituição é
  recusada e o take entra como uma gravação nova.
- **Custo medido** (Ryzen 5 5600G com 12 threads e RTX 3050, codificador NVENC pela CPU, página com uma animação
  contínua, 22 s de vídeo, várias rodadas com outros trabalhos na máquina): a 1080p30, de 0,9 a 1,5 núcleo (8% a
  13% da máquina), uns 650 a 860 MB nos processos do Electron e 200 MB no FFmpeg, e o vídeo quase nunca segurou
  pelo codificador (no máximo 1 s). A 1080p60, de 2,3 a 2,8 núcleos (19% a 23%), 770 MB a 1,7 GB no Electron, e
  o vídeo segurou pelo codificador de 1 s (máquina livre) a 60 s (máquina ocupada): a 60 não acompanha com
  segurança. Com a página parada, 0,4 a 0,8 núcleo a 30 e 0,9 a 1,6 a 60. Por isso o padrão é 30.
  `scripts/guided-smoke.mts` refaz a medida.
- **Na tela, em outros programas:** o modo de antes, para alvos fora da janela da aula. O auxiliar nativo move o
  mouse do Windows com o `glide` (a curva desenhada no relógio dele), clica, arrasta, rola e envia atalhos. A
  posição do alvo é marcada com **F8** sobre ele; a janela é conferida antes de agir e a execução pausa se o
  ritmo se perder. Esperar por elemento só existe na janela da aula.
- **Narração de um vídeo:** em **Importar narração (áudio ou vídeo)**, escolha o áudio da narração ou o vídeo do
  apresentador com a voz. Do vídeo, o EdiAula extrai a primeira faixa de áudio em WAV, preserva o arquivo
  original e usa o mesmo WAV para escuta, transcrição e narração na timeline. A transcrição propõe etapas nas palavras "clique", "clicar" e "clicamos"; o roteiro
  produz tempos estimados. Também dá para definir etapas e tempos à mão.
- Ritmo didático inicial para aulas de **9 a 14 anos**, ajustável: movimento suave de **1,2 s**, chegada **0,5 s
  antes da fala**, espera mínima de **0,8 s** no alvo antes do clique e **1,5 s** após a ação. Em cada etapa,
  **Fala começa em (s)** indica o início da frase e **Ação em (s)** quando agir. Etapas próximas demais são
  recusadas.
- A narração importada entra numa faixa própria, alinhada ao vídeo. Na tela, o microfone fica desligado (use
  fones); o áudio do PC é opcional e não grava a narração de novo, porque deixa de fora o som da janela do gravador.
  Sem narração, grave a demonstração e use **Narrar intervalo** depois. A conclusão das etapas encerra a gravação automaticamente.

### Teste de fumaça da gravação guiada

`node_modules/.bin/electron scripts/guided-smoke.mts` (em `apps/ediaula`, com uns 2 GB de memória livres) serve
`tests/fixtures/guided-blockly.html` (blocos de programação em SVG que arrastam como os do Blockly), marca os
alvos pelo protocolo como o **F8** numa janela de 1280 × 800 com a página no tamanho do plano, grava um plano com
clique, espera, arrasto do flyout para baixo de um bloco, digitação, conferência e atalho, a 1080p30 e a 1080p60
(com a página animada e parada), e um take que continua da quarta etapa. Confere a duração do vídeo e o que ele
mostra (o alvo sob o ponteiro em cada clique e o bloco junto da mão no arrasto), o cursor e o `guided-run.json`,
e mede CPU e memória de cada processo. Confere também o que a janela da aula recusa (microfone, Ctrl+W, Ctrl+R e
F5), um botão num quadro do mesmo site e páginas que redirecionam, nunca terminam de carregar ou não abrem. Não
mexe no mouse real.

## Grupos, marcadores, efeitos de região e exportações extras

- **Grupos** (`src/shared/groups.ts`): **Ctrl+G** agrupa os clipes selecionados e **Ctrl+Shift+G**
  desfaz o grupo (também no botão direito do clipe). Um clique num clipe do grupo seleciona o grupo
  inteiro; **Alt + clique** pega só aquele clipe. Mover, copiar, colar, recortar e excluir valem para o
  que está selecionado: o grupo todo depois de um clique, só o clipe depois de Alt + clique. Aparar a
  borda de um clipe leva junto a mesma borda dos outros clipes do grupo que terminavam (ou começavam)
  no mesmo ponto (Alt apara só ele); os clipes do grupo em faixas travadas ficam como estão, e a borda
  para onde o primeiro deles encontraria um vizinho ou o fim da mídia. Pedaços de um clipe dividido continuam no
  grupo, uma cópia colada vira um grupo novo e um grupo que ficou com um clipe só deixa de existir. As
  camadas de um template entram agrupadas. Clipes agrupados têm a borda de cima verde e o ícone de
  corrente.
- **Separar áudio** (botão direito ou Propriedades › Volume ao longo do clipe): o som de um vídeo vai
  para um clipe próprio numa faixa de som livre (ou nova), no mesmo grupo, e o vídeo fica mudo. Com
  Alt + arrasto da borda de um dos dois saem os cortes em J e em L.
- **Faixa magnética** (botão direito no nome da faixa): os clipes dela ficam sempre encostados desde
  0:00, na ordem em que estão. Cada alteração passa por `applyMagnetic()` (`src/shared/magnetic.ts`), e
  um clipe arrastado para cima de outro entra antes ou depois dele, sem cobrir nada. Uma faixa travada
  não se mexe. Quando um clipe da faixa anda, os clipes do grupo dele nas outras faixas andam o mesmo
  tanto (o som separado de um vídeo continua com ele); se algum deles está numa faixa travada, a faixa
  não vira magnética e o aviso diz qual faixa destravar.
- **Marcadores e capítulos** (`src/shared/markers.ts`): **M** marca o ponto do cursor de reprodução,
  **Shift+M** vai ao próximo marcador e **Alt+M** ao anterior. Na régua, um clique leva ao marcador,
  dois cliques renomeiam e o botão direito transforma em começo de capítulo ou remove. Os marcadores
  acompanham a mídia que marcam em toda alteração (cortes da transcrição, excluir intervalo, aparar com
  Shift, inserir com Ctrl, estender quadro, rascunhos aplicados e a IA): um corte antes deles os puxa
  para a esquerda e um marcador dentro de um trecho cortado vai para onde o corte ficou. Os capítulos
  marcados entram no MP4 (FFMETADATA) e substituem os de `publish.chapters` quando existem. O ímã
  encaixa nos marcadores. A lista fica em Propriedades com nada selecionado.
- **Andar pela fala:** **Alt+←/→** vai à palavra anterior ou à próxima (começo e fim de cada uma) e
  **Alt+Shift+←/→** de frase em frase e de silêncio em silêncio (Ctrl+Alt+setas gira a tela em alguns
  drivers de vídeo), pelo mesmo índice do ímã (`stepTo` e `sentenceStarts` em `src/shared/snap.ts`).
- **Substituir mídia** (ícone de troca no cartão da biblioteca): outro arquivo entra no lugar e cada
  clipe mantém posição, tamanho, movimento, entradas, transições, remoção de fundo e grupo
  (`src/shared/replaceAsset.ts`). Se a mídia atual tem transcrição, o arquivo novo é transcrito e as
  palavras dos dois são alinhadas (maior sequência comum): cada clipe passa a tocar as mesmas falas no
  arquivo novo, com o ponto de entrada e a duração ajustados, que é o caso do vídeo do apresentador gerado de novo.
  Sem transcrição, só um arquivo da mesma duração (até 0,5 s de diferença) entra no lugar. Quando a fala
  ficou mais longa ou mais curta, cada clipe cresce ou encolhe como um aparo com Shift: o que vem depois
  na faixa e nas faixas que os cortes de texto alcançam é empurrado ou puxado, sem sobreposição nem
  buraco, e as faixas travadas ficam como estão (com um aviso). Os zooms, os marcadores da gravação, os
  trechos protegidos, os caminhos desenhados do cursor, o fundo da aula, as vozes exportadas para o
  vídeo do apresentador e as propostas pendentes seguem o mesmo alinhamento; o cursor gravado não
  acompanha um arquivo com outro tempo e sai, com aviso. Ctrl+Z traz a mídia antiga de volta com os
  clipes.
- **Desfoque, pixelado e holofote de região** (painel Zoom › Esconder ou destacar uma região): um clipe
  sem imagem, como a camada de zoom, que vale para tudo o que está nas faixas abaixo dele enquanto dura.
  Com ele selecionado, o retângulo aparece na prévia para mover e redimensionar; força e borda suave
  ficam em Propriedades. Serve para esconder nome e e-mail de aluno que aparecem na plataforma. A
  exportação recorta só a região (`crop`, `boxblur` ou `scale` em blocos e `overlay`, com a borda
  suave numa máscara feita uma vez); o holofote é uma imagem do quadro inteiro feita uma vez em
  `cache/fx`. Na prévia, o desfoque e o pixelado usam `backdrop-filter` e o holofote uma sombra com a
  mesma borda suave, com o mesmo raio e o mesmo limite da exportação (`regionStrength`), e uma camada
  de zoom acima da região a aproxima junto com o resto do quadro. **Seguir a gravação** prende o
  retângulo à gravação embaixo (`src/shared/regionFollow.ts`): quando ela aproxima pelos zooms dela ou
  por uma camada de zoom entre as duas, a região vai junto, quadro a quadro. A exportação aplica o
  efeito na própria imagem da gravação, antes dos zooms, e a prévia posiciona a região com
  `regionRectAt()`, pelas mesmas contas. Uma região parada com zoom embaixo ganha um aviso no painel.
- **Volume ao longo do clipe** (`src/shared/gain.ts`): pontos em dB ligados por retas. No clipe
  selecionado, dois cliques criam um ponto na posição, o ponto é arrastado para mudar quando e quanto, e
  Alt + clique o remove; **Ponto no cursor** cria um pelo painel. A exportação aplica o mesmo envelope em
  cada pedaço do som (`volume='…':eval=frame`, uma soma de rampas com só os pontos do trecho do pedaço,
  então centenas de pontos cabem na expressão) e a prévia passa pelo WebAudio, num nó de ganho por
  elemento, o que também deixa o volume acima de 100% audível na prévia, com um limitador na saída para
  não estourar e a imagem do avatar recortado seguindo a voz já descontado o atraso do som. **Destacar faixa** (botão
  direito no nome) abaixa as outras faixas enquanto ela toca, com a mesma profundidade, rampa e pausa
  do abaixamento da música.
- **Cor, moldura e fundo:** brilho, contraste, saturação e temperatura em Propriedades › Cor (a curva do
  `eq` aplicada por `lutyuv`, que não perde a transparência, e `colortemperature`; na prévia, uma matriz
  de cor SVG com as mesmas contas: contraste e brilho só na luz, pelos pesos BT.709, como o `eq` faz no
  YUV). **Moldura de dispositivo** põe o clipe na tela de um notebook ou de um
  celular desenhados pelo próprio app (sem imagem de produto de terceiros, então não há licença a
  conferir), com a forma do clipe preservada; a moldura toma o lugar dos cantos arredondados e da borda.
  **Fundo da aula** (Propriedades com nada selecionado): cor, degradê ou uma imagem da biblioteca no
  lugar do preto, igual na prévia e na exportação.
- **Anotação que entra:** um balão, nota, título, cartela ou nome entra **palavra por palavra** e uma
  seta ou linha **se desenha** (Propriedades da anotação). Quando as palavras são ditas enquanto a
  anotação aparece (o assistente coloca a anotação onde o texto é falado com `near_text`), cada uma
  entra no momento em que é dita; as outras entram uma depois da outra. Prévia e exportação desenham cada
  estado com a mesma função (`renderAnnotation`); para exportar, a anotação vira um vídeo transparente
  feito no renderer pelo mesmo caminho do cursor, guardado em cache pelo que mostra
  (`src/renderer/src/lib/reveal.ts`, `src/shared/reveal.ts`). O vídeo cobre só a entrada: quando a
  anotação está inteira, a exportação volta para a imagem nítida dela, como a prévia.
- **Biblioteca de todas as aulas** (Mídia › Todas as aulas, em `userData/library.json`): o ícone de
  marcador num cartão guarda a mídia (vinheta, logo, música, cartela) para as próximas aulas, e
  **Favoritar estilo** guarda o visual de uma anotação, da legenda ou do cursor de uma gravação, que
  depois se aplica em um clique. O processo principal só guarda mídias que o app já podia ler e as
  libera de novo ao listar.
- **Exportar intervalo:** com um intervalo marcado na régua, **Só o intervalo marcado** no Exportar
  limita os trechos da exportação a ele; o som da aula é cortado no mesmo ponto (`atrim`), e as
  legendas `.srt` e `.vtt` e os capítulos passam a contar do começo do trecho (o capítulo em andamento
  vira o primeiro). Os trechos do cache são os mesmos da aula inteira.
- **Quadro atual em PNG** (Arquivo ou o botão no Exportar): o quadro do cursor de reprodução no tamanho
  da aula, desenhado pelo próprio plano da exportação como um trecho de um quadro (cursor, zooms,
  efeitos, legenda gravada e teclas na tela incluídos), com as cores BT.709 que um player mostra. É o
  mesmo caminho de um quadro do canal `export:frame` (`src/main/export/frame.ts`), com a conversão para
  PNG por cima, no canal `export:framePng`.
- **Voz e música separadas (WAV):** no Exportar, dois arquivos numa pasta escolhida na hora,
  `<vídeo> (voz).wav` e `<vídeo> (música).wav` (canal `dialog:stems`). Só esses dois ficam liberados
  para escrita, e o app pergunta antes de substituir um que já existe. A voz e a música já abaixada
  como na mistura, com o ganho fixo da normalização quando ela é linear. Uma exportação retomada depois
  de fechar o app faz o vídeo e pede a pasta de novo para os stems.
- **Aula empacotada:** Arquivo › **Empacotar a aula com as mídias…** grava um `.zip` sem compressão
  (`src/main/zip.ts`, ZIP64 quando um tamanho ou a quantidade de arquivos passa do limite clássico, CRC
  calculado com `zlib.crc32` enquanto o arquivo passa) com o projeto, as mídias, os dados do cursor, as
  transcrições, as execuções guiadas, as vozes exportadas para o vídeo do apresentador e as narrações
  dos planos guiados em `media/`. Uma voz exportada cujos arquivos sumiram fica de fora, com aviso.
  Proxies, miniaturas, formas de onda, o avatar recortado e a voz tratada ficam de fora e são refeitos.
  **Abrir aula empacotada…** (Início ou Arquivo) lê primeiro o índice do pacote e recusa o que um pacote
  de aula não tem: nome fora de `media/`, atalho, pasta, arquivo comprimido, nome repetido, mais de
  20 mil arquivos ou mais do que cabe no disco. Depois pergunta se pode extrair (cancelar não grava
  nada), extrai com o `tar.exe` do Windows numa pasta nova em `Projetos`, confere o que saiu contra o
  índice e reescreve os caminhos. Os caches que o pacote traz são apagados, as imagens do editor
  ganham lugar na pasta para serem redesenhadas, qualquer caminho que ainda aponte para fora de
  `media/` recusa o pacote e a aula aberta ganha um id novo, por ser outra cópia.
- **Prévia com um par de elementos por mídia** (`src/renderer/src/editor/previewPool.ts` e
  `mediaPool.ts`): cada arquivo de cada faixa toca por dois elementos de mídia, nunca um por pedaço. Os
  pedaços se revezam pela ordem (pares no elemento A, ímpares no B): enquanto um toca, o outro já espera
  parado no começo do próximo pedaço e assume no corte, então uma gravação com 200 cortes mantém dois
  decodificadores. Um relógio só comanda tudo (o da reprodução); no avatar recortado, a voz segue o
  relógio e a imagem segue a voz pela velocidade de reprodução. A correção de deriva do Lote 1 continua
  valendo para cada elemento. `window.__ediaulaPreview.stats()` mostra quantos elementos há, quadros
  perdidos e saltos, usado pelo teste visual.

## Estrutura

Quando a licença deixa de autorizar o uso, novas tarefas ficam bloqueadas. A gravação e a execução guiada param imediatamente; o vídeo permanece em `Documentos/EdiAula/Gravações`, em pasta exclusiva por sessão. As partes usam MP4 fragmentado e o diário da sessão permite recuperar uma interrupção. Uma falha de finalização informa a pasta preservada. Exportação, proxy, chroma e transcrição já iniciados têm até 30 minutos para concluir, sem reiniciar esse prazo; uma exportação interrompida não substitui os arquivos anteriores. Consulte [o registro de preservação](../../docs/propostas/edi-suite-2026-10-16/producao-jobs.md).

```
src/main       processo principal: FFmpeg, projetos, protocolo media://, IPC
src/preload    ponte segura window.api
src/shared     tipos, operações da timeline e plano de exportação (testados)
src/renderer   interface React (home, editor, timeline, preview, exportação)
tests/         testes com node:test
```
