# EdiPlayer

Player de vídeo da suíte Edi com as edições do dia a dia: assistir, cortar, juntar, dividir e converter sem abrir um editor de timeline. Proposta e telas: doc "Proposta: EdiPlayer" e canvas "EdiPlayer – telas finais" (06/11/2026). Escopo, lotes e limites no [plano](PLANO-DE-IMPLEMENTACAO.md); verificação no [review](../../docs/reviews/ediplayer-2026-11-06/review.md).

## Desenvolver e verificar

```bash
pnpm --filter @informach/ediplayer dev            # para na tela de acesso da suíte
pnpm edi:open ediplayer                           # aberto com licença de teste (Windows)
pnpm --filter @informach/ediplayer typecheck
pnpm --filter @informach/ediplayer test           # unitários + integração com FFmpeg real
pnpm --filter @informach/ediplayer test:media-native
pnpm --filter @informach/ediplayer test:e2e       # harness nativo da suíte + jornada do player
```

Em desenvolvimento o FFmpeg vem do bundle da suíte (`.cache/edi-native-media`) quando existe, senão de `ffmpeg-static`/`@derhuerst/ffprobe-static`. O instalador leva o bundle `native-media` (FFmpeg 9.0.2) declarado em `packages/config/src/edi-tools.ts`. Perfil isolado: `EDIPLAYER_USER_DATA`.

## Como funciona

- **Tocar.** MP4/MOV/WebM e áudio comum tocam direto no Chromium. Matroska com H.264, som que o Chromium não decodifica (AC-3, WMA…) e outra faixa de áudio que não a primeira passam por uma cópia dos mesmos dados em MP4, em segundos. HEVC sem suporte da máquina, WMV, MPEG-4 Part 2 e outros viram uma prévia H.264 720p em cache. Se o `<video>` falha, o player tenta a cópia e depois a prévia. Os cortes sempre usam o arquivo original.
- **Arquivos na janela.** O processo principal serve a mídia por `ediplayer-media://media/<token>` (64 hex por arquivo, sem caminho na URL, identidade conferida a cada leitura, ranges pelos helpers da suíte). A leitura exige permissão concedida pelo diálogo, por arrastar ou por "Abrir com"; a gravação exige o diálogo de salvar ou de pasta.
- **Player.** Velocidade 0,25×–4× mantendo o tom, quadro a quadro, A–B, volume até 200% e "Realçar" (Web Audio), legendas SRT/VTT e faixas de texto do arquivo com atraso e tamanho, captura de quadro (arquivo ou área de transferência), sempre no topo, miniplayer, tela cheia, lista e "Continuar assistindo".
- **Edição (tecla E).** Régua com miniaturas e onda, I/O/S/Del, desfazer/refazer. "Remover marcados" ou "Manter só eles". Sem recodificar quando só há cortes, giro (metadado), troca/remoção de som: cada trecho é copiado a partir do quadro-chave anterior e unido pelo concat demuxer. Corte preciso, recorte, espelho, velocidade, volume/normalização (loudnorm em duas passagens), legenda gravada e as predefinições recodificam (H.264 NVENC com recuo para x264).
- **Salvar.** Original (sem perda), WhatsApp (720p, ~15 MB), E-mail (480p, ~10 MB), YouTube (1080p), MP3 e GIF; dividir em partes numa pasta; juntar por cópia quando os formatos batem ou convertendo para o tamanho do primeiro; extrair o som (cópia ou MP3). Tudo entra numa fila serial com progresso e cancelamento. O resultado é gravado em área temporária ao lado do destino, re-sondado (duração), sincronizado e só então publicado; nunca substitui o original.

## Limites conhecidos

- Corte preciso recodifica o resultado inteiro em alta qualidade (CRF 18). Recodificar só as pontas (smart cut) ficou para depois: juntar trechos com parâmetros H.264 diferentes do original não é confiável em MP4.
- Legendas que são imagem (PGS, DVD) aparecem na lista, desabilitadas.
- "Abrir no EdiAula" abre o EdiAula e copia o caminho do vídeo: o EdiAula ainda não recebe arquivo pela linha de comando.
- WhatsApp/E-mail miram o tamanho pelo bitrate; vídeos muito longos ficam acima do alvo em vez de perder legibilidade (piso de 250 kbps).
