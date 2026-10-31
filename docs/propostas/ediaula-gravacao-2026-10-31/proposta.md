# EdiAula: gravar e enviar para a edição

31/10/2026. Pedido da titular: analisar o fluxo de gravação de aula e propor como facilitar a vida de quem grava a aula e a envia para outra pessoa editar. A proposta foi aprovada no mesmo dia, com duas respostas dela: o .zip chega a quem edita por uma **pasta sincronizada**, e os professores **gravam a voz no app ou trazem pronta**, então as duas formas ficam à mão. No meio da implementação ela pediu o **trecho acelerado** (time-lapse), que entrou como lote 7.

## O que atrapalhava

Quem grava passava por seis lugares (início, aba Roteiro, painel Áudio, gravador, menu Arquivo, janela de salvar) sem nada dizer o próximo passo.

- A voz importada não era transcrita. Sem transcrição, o gravador em Tela sobre a narração abria sem karaokê, sem a lista Começar na fala e sem o Na tela, e nada avisava. O aviso da importação dizia "Já dá para gravar a tela sobre a narração".
- Não se via o que faltava gravar. O gravador sabia onde já havia tela, mas só usava isso para avisar que ia gravar por cima. Reaberto, começava no cursor ou no começo da voz.
- O fim da voz levava de volta ao editor, e o envio ficava escondido no menu Arquivo.
- O pacote levava todas as mídias do projeto, até os takes gravados por cima.
- Não havia como deixar recado para quem edita.
- Uma construção longa na tela não cabia na narração: a tela andava presa ao tempo da voz.

## Estado item a item

| Lote | Item | Onde | Commit |
| --- | --- | --- | --- |
| 1 | Voz transcrita sozinha ao importar ou gravar, com opção para desligar | `lib/voice.ts` (`transcribeVoice`), `shared/speechSources.ts` (`voiceToTranscribe`), `shared/recorderSettings.ts` (`autoTranscribe`) | `e971bce1` |
| 1 | O gravador aberto recebe as palavras e as falas quando a transcrição termina | `recorder:refreshOver`, `refreshRecorderText` em `lib/recording.ts` | `e971bce1` |
| 2 | Cobertura de tela por fala, mapa das falas e "Continuar de onde parei" | `shared/screenCues.ts` (`screenCoverage`), `OverStart` e `OverMap` em `RecorderOverlay.tsx` | `e971bce1` |
| 2 | O gravador começa no primeiro trecho da voz sem tela | `overContext` em `lib/recording.ts` | `e971bce1` |
| 3 | A parte grava sozinha no fim da voz; etapa "Tela completa" | `OverDone` em `RecorderOverlay.tsx`, `onEnded` em `overPlayer.ts` | `c3794313` |
| 3 | O gravador avisa o editor do próximo passo ao fechar | `recorder:closed` (`flow`, `send`) | `c3794313` |
| 4 | Painel Etapas (Gravação da aula) | `editor/LessonFlowPanel.tsx`, `lib/coverage.ts` | `c3794313` |
| 5 | Enviar para a edição: conferência, pacote só com o que a aula usa, pasta de envio | `editor/SendDialog.tsx`, `shared/usedAssets.ts`, `main/sendSettings.ts`, `project:packEstimate`, `project:pack` | `136bdd3f` |
| 6 | Recados durante a gravação (Ctrl+Shift+Y), marcadores âmbar na aula | journal `note`, `shared/markers.ts` (`notesOnTimeline`, `addNotes`, `lessonNotes`) | `185e3280` |
| 7 | Trecho acelerado (F7) sobre a narração | journal `lapse`, `shared/overNarration.ts` (`overPieces`, `lapseEnd`), `elementRate` | `c012f98e` |

O comportamento está descrito no [README do EdiAula](../../../apps/ediaula/README.md#o-caminho-de-quem-grava-painel-etapas-31102026).

## Decisões

- O painel Etapas reúne os botões que já existiam e não tira nada do painel Áudio, que continua servindo quem edita. O nome na barra é "Etapas", para não confundir com "Gravar".
- A transcrição automática vale só para a voz da aula (o que o gravador precisa) e espera a gravação em andamento, como os outros trabalhos de fundo.
- "Levar só o que a aula usa" vem ligado. Um vídeo do apresentador com encaixe ainda a decidir vai junto.
- A pasta de envio é a única preferência nova fora do projeto. O nome do pacote é "Curso, Aula".
- O recado vale o momento em que foi aberto, não o em que foi guardado.
- O trecho acelerado leva só a tela. A câmera, o som do PC e o desenho acelerados seriam ruído sob a voz. A velocidade não tem o limite de 8× de Velocidade / duração; a prévia toca no máximo a 16×.

## Full review

Um review independente do diff inteiro achou e o trabalho corrigiu, no mesmo dia:

- descartar um take deixava o trecho acelerado e o recado abertos para o take seguinte;
- duas paradas podiam correr juntas com um recado ou um trecho aberto (o estado "salvando" agora vem antes de tudo);
- um recado deixado com a gravação pausada se perdia (agora vai para o próximo ponto do take que ficou na aula);
- uma fala achada em duas partes no mesmo ponto nunca ficava "com tela";
- o texto da voz que chegava enquanto uma parte salvava era desfeito;
- depois de "Tela completa", F9 gravava por cima do começo da aula (agora pede uma fala);
- "Gravar esta fala" seguia gravando por cima do que vinha depois (agora regrava só aquele trecho);
- a estimativa do pacote lia arquivos sem a checagem de permissão do app;
- a mesma voz podia ser transcrita duas vezes;
- o trecho acelerado podia começar antes do ponto da parte ou virar câmera lenta;
- a conta do texto da voz rodava com o gravador fechado.

O atalho do recado passou de Ctrl+Shift+N para Ctrl+Shift+Y, porque nova pasta no Explorador e janela anônima no navegador aparecem em aulas. Ficou como está, por decisão: Arquivo › Enviar para a edição substitui o antigo Empacotar e vem com "Levar só o que a aula usa" ligado e a pasta de envio; o pacote inteiro continua possível desligando a opção.

## Verificação

Typecheck, Biome nos arquivos alterados e a suíte do app passaram a cada lote. Depois do full review: typecheck, Biome, `node --test` (961 testes, 946 aprovados, 15 pulados por exigirem hardware, nenhuma falha) e o build do app. Testes novos: `speech-sources`, `scriptProduction` (cobertura), `used-assets`, `markers` (recados), `recordingJournal` (recado), `overNarration` (trecho acelerado e `lapseEnd`), `hotkeys` e `recorderSettings`.

O app não foi aberto nesta sessão: o computador da titular fica sem memória com ele aberto. Falta o teste manual:

1. novo projeto: o painel Etapas abre;
2. colar o roteiro e importar a voz: a transcrição começa sozinha e o gravador recebe as falas;
3. gravar a tela em duas partes, fechar e reabrir: o gravador começa no primeiro buraco;
4. deixar a voz acabar: a parte grava sozinha e aparece "Tela completa";
5. deixar um recado e fazer um trecho acelerado com F7;
6. enviar para a edição com a pasta sincronizada: o pacote fica menor que o antigo;
7. abrir o .zip em outro computador: os recados aparecem.

Comando: `$env:EDI_OPEN_USER_DATA = "$env:USERPROFILE\EdiAula-teste\user-data"; pnpm edi:open ediaula`.
