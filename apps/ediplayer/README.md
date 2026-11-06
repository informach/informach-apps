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
- **Edição (tecla E).** Régua com miniaturas e onda, I/O/S/Del, desfazer/refazer. "Remover marcados" ou "Manter só eles". **Dividir e apagar:** S divide no ponto atual, Del (ou a lixeira na lista de partes) apaga a parte sob o cursor, e "Salvar o vídeo sem as partes apagadas" gera um arquivo só; a parte apagada vira um trecho removido (`setPartRemoved` em `src/shared/ranges.ts`, nos dois modos), então desfazer, régua e resultado são os mesmos dos cortes por I/O. "Salvar cada parte num arquivo" deixa de fora as apagadas. Sem recodificar a imagem quando só há cortes, giro (metadado), troca/remoção de som: uma lista do concat demuxer corta o original por pontos (inpoint no quadro-chave anterior à marca, outpoint meio quadro antes do fim), e o som é cortado com precisão de amostra e codificado em AAC 192k para ter exatamente a mesma duração, numa única execução do FFmpeg. Assim vários cortes não desalinham imagem e som (verificado com B-frames em MKV e com arquivos que não começam em 0). Arquivo só de som é cortado por cópia, sem recodificar. Corte preciso, recorte, espelho, velocidade, volume/normalização (loudnorm em duas passagens), legenda gravada e as predefinições recodificam (H.264 NVENC com recuo para x264).
- **Salvar.** Original (sem perda), WhatsApp (720p, ~15 MB), E-mail (480p, ~10 MB), YouTube (1080p), MP3 e GIF; dividir em partes numa pasta; juntar por cópia quando os formatos batem ou convertendo para o tamanho do primeiro; extrair o som (cópia ou MP3). Tudo entra numa fila serial com progresso e cancelamento. O resultado é gravado em área temporária ao lado do destino, re-sondado (duração), sincronizado e só então publicado; nunca substitui o original.

## Limites conhecidos

- No corte sem perda o som é recodificado (AAC 192k) para acompanhar a imagem; um WebM cortado sai como MKV, porque WebM não aceita AAC.
- Juntar por cópia arquivos com o som um pouco mais longo que a imagem acumula algumas dezenas de milissegundos por arquivo.
- "Abrir com" do Windows ainda não é registrado pelo instalador: as associações do electron-builder sobrescrevem o padrão sem backup e deixam extensões quebradas ao desinstalar. A pessoa pode escolher o EdiPlayer em "Abrir com › Escolher outro aplicativo"; o arquivo chega pelo argv.
- Previews e miniaturas ficam em `%LOCALAPPDATA%\EdiPlayer\cache` (até 6 GB, os mais antigos saem primeiro); "Limpar recentes" apaga o cache.

- Corte preciso recodifica o resultado inteiro em alta qualidade (CRF 18). Recodificar só as pontas (smart cut) ficou para depois: juntar trechos com parâmetros H.264 diferentes do original não é confiável em MP4.
- Legendas que são imagem (PGS, DVD) aparecem na lista, desabilitadas.
- "Abrir no EdiAula" abre o EdiAula e copia o caminho do vídeo: o EdiAula ainda não recebe arquivo pela linha de comando.
- WhatsApp/E-mail miram o tamanho pelo bitrate; vídeos muito longos ficam acima do alvo em vez de perder legibilidade (piso de 250 kbps).
