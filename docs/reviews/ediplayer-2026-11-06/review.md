# EdiPlayer: implementação e verificação (06/11/2026)

Os lotes 0 a 4 do [plano](../../../apps/ediplayer/PLANO-DE-IMPLEMENTACAO.md) estão implementados no branch `feat/ediplayer`. Tudo abaixo foi executado nesta máquina (Windows 11, Electron 44.8.0). Nenhum instalador foi publicado e nada foi provisionado no Stripe.

## Verificação executada

| Gate | Resultado |
| --- | --- |
| `apps/ediplayer` unitários (`node --test`) | 15/15: trechos, quadros-chave, legendas, compatibilidade, argumentos FFmpeg, grafo de exportação, esquema dos trabalhos |
| `apps/ediplayer` integração com FFmpeg real | 9/9: corte sem perda em dois trechos com o original intacto byte a byte, giro por metadado, recodificação com recorte + velocidade + normalização + legenda gravada, corte preciso, GIF, MP3, dividir, juntar por cópia e convertendo, extrair e trocar o som, cópia de MKV e prévia de AVI |
| Typecheck e testes dos pacotes tocados (turbo) | 17/17 tarefas: config, edi-contracts, edi-licensing, edi-desktop (27 arquivos), db, portal edi, edi-hub, informach-site, ediplayer |
| Ferramental da suíte (`pnpm edi:test:tooling`, `edi:typecheck:tooling`) | 72/72; typecheck limpo |
| Harness nativo `pnpm edi:test:native ediplayer` | Tela de acesso, licença offline assinada, expiração, negação de IPC sem licença e jornada: abrir clipe real, tocar, marcar 3 s → 8 s, salvar sem perda (15 s), original intacto |
| Harness nativo `pnpm edi:test:native edi-hub` | Passou; card do EdiPlayer e marca com seis barras conferidos na captura |
| Biome nos arquivos alterados | Sem erros (8 avisos de especificidade CSS, como nos outros apps) |

Capturas da jornada (player, edição, salvar, fila) foram comparadas com o canvas; os desvios de layout encontrados (vídeo invadindo a régua no modo edição, rótulo final da régua cortado, idioma "UND", miniaturas finais pretas) foram corrigidos e verificados numa segunda rodada.

## Desvios e limites

- Corte preciso recodifica o resultado inteiro em alta qualidade; o plano previa recodificar só as pontas. Juntar pedaços H.264 com parâmetros diferentes do original não é confiável em MP4.
- Encoders: NVENC com recuo para x264 (detecção compartilhada do `NativeMedia`), não a cadeia completa nvenc → amf → mf → x264 do EdiAula.
- "Abrir no EdiAula" abre o EdiAula e copia o caminho: o EdiAula não recebe arquivo pela linha de comando.
- As receitas de FFmpeg foram adaptadas dentro do EdiPlayer, citando a origem; unificar com EdiAula e EdiCaptura num pacote fica como evolução.

## Não verificado

- Instalador do EdiPlayer com o bundle `native-media` 9.0.2 e as associações de arquivo (`scripts/edi/installer-config.mts`): exige `pnpm edi:media:build` e o fluxo de pacote da suíte. Em desenvolvimento os testes usaram o FFmpeg 6.1.1 do `ffmpeg-static`.
- Vídeos reais de celular (HEVC), MKV com várias faixas e arquivos de horas: os fluxos estão cobertos por testes sintéticos, não por uma sessão manual com arquivos pessoais.
- Hubs já instalados validam exatamente seis apps no manifesto: precisam ser reinstalados ao chegar o primeiro release com o EdiPlayer (decisão do titular: ninguém comprou a suíte ainda). O [full review](full-review.md) corrigiu os contratos para que isso não se repita.
