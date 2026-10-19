# EdiCaptura — matriz de verificação Windows

Atualizado em 18/10/2026. Esta matriz separa testes de coordenadas, testes com conteúdo sintético em Electron e homologação com hardware. Um resultado em uma coluna não aprova automaticamente as demais. O [lote 4](lote-04.md) registra a captura/rolagem; vídeo será registrado no lote 5. Publicação e instaladores têm gates próprios.

O gate de implementação4d e a cobertura completa do lote4 foram aceitos em revisão independente, sem novos achados. A aceitação preserva todas as células não verificadas abaixo, incluindo a limitação de isolamento do modo ativo; não equivale à homologação física universal.

## Ambiente medido

Windows 11 Pro 10.0.26200; AMD Ryzen 5 5600G, 6 núcleos/12 processadores lógicos; 16.962.715.648 bytes de memória instalada; Node24.15.0, pnpm9.15.0 e Electron44.8.0. Topologia observada pelo Electron no gate4d: dois displays, bounds(0,0,2560,1080) e(2560,0,1920,1080), ambos scale1 e rotation0; composição4480×1080. Todas as áreas capturadas de screen estavam cobertas por janelas opacas próprias. Não foram coletados identificadores de hardware; HDR/perfil de cor não medidos.

## Captura e imagem

A infraestrutura4b e a precisão/presets foram aceitas após revisões004/005;4c/fix1 foi aceita na006. O gate4d exercitou o percurso licenciado real nos casos abaixo, com chaves efêmeras e conteúdo próprio; a revisão independente4d permanece obrigatória. Pixels reais em conteúdo sintético não homologam todas as combinações de hardware.

| Cenário | Critério observável | Teste sintético/automatizado | Hardware físico |
| --- | --- | --- | --- |
| Região em um monitor | Pixels e dimensões correspondem à seleção; cancelar não publica | Serviço/renderer4b e gate licenciado4d: região64×48 pela interface real, pixels conhecidos | Não homologado |
| Monitor inteiro | Conteúdo sintético conhecido, sem corte ou imagem antiga | Pixels próprios Electron4b2 e percurso licenciado4d verificados | Não homologado |
| Janela | Identidade e limites corretos; alvo fechado é recusado | Gate licenciado4d321×241, pixels e anotação/reabertura; perda do alvo no serviço/ponte4b | Não homologado |
| Ativa | Foreground autoritativo deve preceder aquisição | NÃO VERIFICADO nativo4d: fixture não garantiu origem, caso removido e root descartável removida; testes de serviço4b separados | Não homologado |
| Controles de janela | Seleção só anunciada onde a ponte retorna limites válidos | Bounds/clipping/crop e seleção renderer4b verificados separadamente; percurso licenciado não exercitado | Não homologado |
| Atraso, menus e cursor | Captura obtida no prazo; cursor respeita preferência | Gate4d mudou pixels próprios durante atraso2s e conferiu imagem fresca; cancelou outra captura sem perder anotação. Cursor serviço/ponte4b; menus licenciados não exercitados | Não homologado |
| Teclado/lupa/números | Ajustes preservam limites e correspondem aos pixels de saída | Chromium 4b3 passo 1/10/números/lupa e integração renderer→serviço: 90 casos, 180 saídas 2×2 com pixels exatos; review005 aprovado após correção | Não homologado |
| Presets/repetição/atalhos | Conflitos e topologia inválida visíveis; cancelamento preserva trabalho | Arquivos/renderer 4b3, repetição persistida na matriz fracionária e região 64×48 com cada pixel próprio assertado; conflito/rollback de atalhos Electron reais; review aprovado | Não homologado |
| Coordenadas negativas | Layout e recorte corretos em monitor à esquerda/acima | Buffers/crop 4b1/4b2 e seleção Chromium 4b3 passaram; matriz renderer→serviço com origens negativas inteiras e fracionárias, confirmação e repetição, aceita na rodada 005 | Não homologado |
| Escalas mistas | Composição usa escala de saída definida e dimensões reais | Geometria/bitmaps 4b1/4b2 passaram; seleção 2×2 em 100%/125%/150%/175%/200% passou na integração sintética após correção e re-review005; hardware misto continua pendente | Não homologado |
| Região entre monitores/todos | Sem distorção; lacunas reais preservadas; orçamento agregado respeitado | Todos4480×1080 no gate licenciado4d com cores próprias; região cruzada em serviço/renderer4b, não novo cenário físico | Não homologado |
| Retrato/rotação/resolução | Seleção/presets acompanham topologia e cancelam resultados antigos | Fingerprint/schema/serviço4b3 rejeitam rotação/bounds/escala alterados; não exercitado fisicamente em4d | Não homologado |
| Docking/desconexão | Interrompe coleta e preserva capturas/trechos existentes | Regressão de eventos do serviço; não exercitado fisicamente em4d | Não homologado |
| Suspensão/retorno | Sessão interrompida permanece recuperável e não publica resposta antiga | Não exercitado em4d; vídeo depende5 | Não homologado |
| HDR/perfil de cor | Saída comparada a referência controlada; limitações declaradas | Sem evidência atual | Não homologado |

## Rolagem, persistência e vídeo

| Cenário | Critério observável | Estado/evidência |
| --- | --- | --- |
| Rolagem vertical/horizontal | Emendas, preview, remover/desfazer e fim estável corretos | 4c aceita;4d licenciado:1comando/1evento/40px por eixo em Chromium próprio, pixels120×140/160×100, emenda/preview/remover/desfazer/save. Fim estável permanece evidência serviço4c |
| Conteúdo repetido/dinâmico | Baixa confiança interrompe automação para revisão | 4c aceita: ambiguidade/repetição pausa e preserva trechos; alinhamento continua heurístico |
| Alvo/foreground/cancelamento | Wheel apenas no alvo autorizado e interrompido imediatamente | 4d licenciado: alvo selecionado em background, estado de ativação ou automação confirmada, offset real, sem roda tardia após pausa. WinForms4d: ambos eixos, espera/cancelamento/perda de foco/alvo movido, região externa e foco fora da área recusados. Perda de alvo no percurso licenciado não adicionada |
| Worker/falha/limite | Resultados antigos recusados; trechos preservados; memória agregada limitada | 4c aceita após review006/fix1: cancelamento DURANTE worker restaura estado; aquisição agrega fontes/normalização/PNG/crop e rejeita antes dos efeitos; orçamento modelado, RSS não medido |
| Raster de 25 MB | Duplicar/mover/desfazer/reabrir preserva pixels, sem fontes no histórico | Verificado e revisado 4a em Chromium/filesystem: 12 estados, 11.174 caracteres |
| Falha/fila de gravação | Retry conserva fonte; confirmação antiga não afeta novo documento | 4a aceita;4d renderer e gate licenciado corrigiram close após expiração: gravação confirmada fecha sem list restrito, erro de gravação mantém aberto |
| Renomeação/preview | Zero exportações na renomeação; alterações visuais atualizam miniatura | Verificado e revisado 4a por chamadas reais e pixels |
| Clipboard de arquivo | FileDrop/CF_HDROP consumido com nomes Unicode e arquivo válido | Formato/consumidor reais repetidos4d com quatro roots/pai-filho/failureexit; publicação integral não verificada, estação privada negada5; clipboard pessoal não acessado |
| Vídeo incremental/recuperação | Chunks duráveis, ordem/limites e recuperação após interrupção | 5a aceita após review007/fix1: últimos bytes/ACK e reutilização de montagem revisados; filesystem real valida hash/ordem/retry/orfão/commit+read antes de limpar e teto100k; renderer MediaRecorder640×480 valida pressão/relógio/falha/retry/tracks encerradas e UI de recuperação; corrida de abrir/editar preserva documento atual. Gate Electron próprio64×48 valida gravação/ACK/reprodução |
| Vídeo grande/protocolo | Intervalos autorizados, sem vídeo inteiro em base64 | 5a: arquivo sintético esparso600MB decodificado640×480 em Chromium, leitura~5,5MB e intervalo final6bytes; Electron96×64, capacidade desconhecida/subframe recusados. Revogação durante open/read testada deterministicamente. Não mede RSS total nem vídeo real32GiB |
| Microfone/sistema/pausa | Permissões explícitas, sincronização e encerramento de tracks | Pendente5c; áudio/câmera continuam negados em5a. Webcam retirada pela decisão de foco; não gravar mídia pessoal |
| MP4/GIF/cortes | Probe e pixels/áudio da saída correspondem à receita revisada | 5b aceita após008/fix1: probe/trim/quadro/MP4H264-AAC/GIF reais, preview/undo/reopen e original preservado; cancel/revoke no último realpath recusam publicação e conservam destino anterior. Áudio de aquisição5c adiado; legendas/transcrição retiradas |

## Limites da evidência

Testes atuais de captura usam janelas sintéticas e perfis isolados. A fixture de pixels anterior ao fix1 da 4b2 isolava somente a biblioteca, sem `userData`/`sessionData` exclusivos; a afirmação histórica ampla foi retirada. O comando corrigido possui pai/filho e limpeza de perfil próprio verificados, sem inspecionar ou remover perfis anteriores. Não se armazenam o desktop, áudio ambiente ou webcam pessoal para produzir evidência. Homologação física exige conteúdo e dispositivos controlados.

No re-review4b2, assertions de pixels próprios e encerramento passaram, mas Chromium emitiu diagnósticos WGC de timeout/GetFrame/CaptureSession (`-2147019873`) sem identificar a fonte responsável. Os logs foram preservados, sem retry para obter saída limpa e sem atribuir causa. Isso permanece um limite de estabilidade/latência a considerar na 4d e nos benchmarks8.

O histórico nativo inclui falha3221226505 anterior à identificação do subprocesso.4d agora registra etapas instalação/build/manifest/launch/primeira janela/funcional/cleanup, launcher e runtime distintos, código/sinal e stderr limitado por estágio/tempo. Isso não atribui nem resolve a causa histórica. WGC5000ms/GetFrame também reapareceu durante4d sem fonte identificada; passes posteriores não são alegação de estabilidade universal.

O run `native-recipient-green` teve assertions funcionais completas, mas o fechamento travou e o launcher próprio foi encerrado com1. O harness então imprimiu0 indevidamente: esse gate foi invalidado, preservado e corrigido. O gate posterior `native-close-final` passou incluindo save após expiração, ambos os filhos0 e cleanup/result0. Uma tentativa active de origem desconhecida foi contida e removida sem inspeção posterior; nenhum screenshot posterior/cópia externa foi identificado pelo fluxo estático. Outra raiz temporária ljtJAW permanece retida após rejeição automática de cleanup; não se tentou removê-la novamente.

M12 observado em `native-close-final`:36pings IPC durante captura todos, máximo438ms; pico amostrado de RSS **somente main**287576064bytes. Intervalo alvo10ms e agendamento do harness influenciam os valores. Não é RSS total/SLA; orçamento512MiB é modelado e benchmark8 permanece pendente. Raster25MB e zero exportação em rename continuam gates de renderer separados.


5b/fix1 aprovado no escopo de software: execução nativa real4/4 e pacote finalbeta29880 verificados, sem instalação/publicação. O timeout anterior de resume após liberar primeiro append permanece sem causa; verdes posteriores não comprovam resolução. O native5b passou funcionalmente e encerrou/limpou com0, preservando quatro diagnósticos WGC first-frame5000/GetFrame nas etapas durable-video, janela, região e temporização, sem identidade interna/causa estabelecida. Não alegar homologação plena de confiabilidade/latência. Áudio/pausa, OCR e fases posteriores adiados pelo titular; ver [continuidade](continuidade-edicaptura-edipdf.md).

No refresh f488, o gate native geral passou nos seis apps com preflight de diretórios próprios, seis filhos close0 e cleanup0; esse run não repetiu a aquisição active-native e não demonstrou correção causal de WGC/retomada. O renderer Captura repetiu11runners com raízes próprias; mídia Electron concluiu com filho close0, mas a estação privada recusou cinco tentativas de clipboard, sem fallback global. O bundle FFmpeg novo e o pacote beta28800 foram verificados localmente; beta29880 nesta matriz é histórico. Os15skips do teste de mídia Aula foram explícitos: nove input/desktop, cinco áudio e AMF indisponível. Mixed-DPI físico/HDR/dock/suspensão, SaveDialog individual, clipboard OS integral, áudio físico, escala prolongada e instalação limpa continuam sem homologação. Ver [integração e revisão](integracao-remoto-refresh.md).
