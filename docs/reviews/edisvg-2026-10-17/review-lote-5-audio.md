# Review incremental 5.3 — efeitos de áudio por eventos

18/10/2026. Continuidade do catálogo/fontes 5.1–5.2. Não encerra o lote 5, o lote 6 ou o full review solicitado.

## Entrega e contrato

Pranchetas v15 podem conter `audio: {version:1,bindings:[{id,eventId,assetId,volume,caption}]}`. Referências a WAV PCM16 e eventos reais são validadas, com alternativa textual obrigatória e até 256 vínculos no documento/expansão. Exclusões que deixem referências quebradas falham atomicamente. UI e MCP usam `audio replace/disable` na transação comum; `get_audio/get_audio_value` inspecionam por páginas/JSON exato com sessão/revisão/prancheta.

O compilador inclui somente os WAV usados no catálogo raiz do blueprint v3; componentes têm vínculos locais, sem copiar os bytes a cada instância. O relógio único prepara todo o avanço antes de publicar e limita a 128 efeitos agregados por avanço. HTML interativo/React preservam efeitos; SVG/HTML de timeline exigem consentimento explícito pela perda de áudio/lógica/dados/eventos/layout. O caminho direto de exportação de clips também tem esse gate.

Um mixer Web Audio por cena, sem autoplay de som: contexto criado somente na ativação, PCM decodificado uma vez por recurso, até 32 vozes, substituição da mais antiga, volume mestre e headroom pela soma dos ganhos. Um efeito atrasado inicia no offset de amostra correspondente ou é contado como já encerrado; ativar não toca efeitos históricos. Pausa/ocultação/reset/fechamento interrompem as vozes; pause/reset de componente interrompem apenas seu prefixo de instância. Contextos fornecidos pelo host não são fechados pelo player. `destroyAsync()` permite aguardar/receber falhas da limpeza; `destroy()` reporta falhas assíncronas. Callbacks assíncronos do mixer reportam erros, inclusive falhas de observadores.

Editor Testar, HTML e React possuem ativação explícita, volume, diagnóstico de vozes e janela de 16 alternativas textuais, com contagem do excedente. `onAudioCue`, `onAudioStateChange` e métodos tipados ficam na API/ref portátil. Alternativas aparecem com áudio desativado, sem abrir o dispositivo. Estado terminal desabilita controles e nenhuma ativação tardia publica no componente desmontado.

Perfil: efeitos pontuais por eventos de timeline. Não é trilha sonora contínua, editor de áudio, streaming, mixer de estados com crossfade, masterização ou garantia de true-peak após conversões de sample rate. WAV fora do perfil ainda precisa de conversão externa; não se declara homologação React Native.

## Review e evidências

- 139 testes do editor e 62 do núcleo aprovados; tipos editor/núcleo/tooling e build passaram.
- Rodada conjunta serial: 33 E2E aprovados, seguida de Next.js em produção/SSR/hidratação. Após o ajuste da prévia, o consumidor React/ZIP foi repetido com sucesso, incluindo Testar com PNGs e fonte.
- OfflineAudioContext real comprova amostras assinadas, energia/cauda, headroom, limite de vozes, cache, descarte, avanço atrasado, efeitos de componentes e destruição dentro de callbacks. Nenhum alto-falante é aberto pelos testes.
- UI compilada importa WAV, vincula evento, edita ganho, desfaz/refaz, recupera em outra janela e mostra alternativas no Testar/HTML offline. React ZIP compila em consumidor TypeScript independente e emite callback/alternativas desativado, sem dependências de workspace/rede.
- Jornada Electron completa aprovada: probe sob file/CSP confirmou PCM real, alternativas desativadas e projeto intacto; integridade física, GUI/gerenciador, Worker/Yoga/rig/recursos, Save/Open/Cancel/recuperação/ZIP, licença/expiração e negação de IPC passaram. Não equivale a instalação/publicação de produto. O pequeno ajuste posterior de encaminhamento de erros assíncronos do mixer passou no teste real OfflineAudioContext, mas não motivou outra rodada nativa.

Achados corrigidos: ganho do último bloco amplificado cedo por `onended` (agora os fins agendados das fontes controlam o envelope); uso do relógio após destruição em callback; limpeza reentrante e estado terminal dos controles; exportador direto descartando áudio sem confirmação; prévia Testar sem os PNGs/fontes já presentes nas exportações. O teste do envelope manteve a tolerância original após a correção. Erros de fixture de navegador foram corrigidos: contexto explícito para múltiplas páginas e aceitação do diálogo de recuperação na janela de restauração.

## Continuidade obrigatória

Gráficos/tipografia avançados, nine-slice visual, raster/triangulação, joystick/timeline de rig, formatos adicionais, semântica/scripting e itens do lote 6 permanecem na execução. Próximo incremento: uniformizar o contrato/render de imagens e completar recursos gráficos com provas de fidelidade. Não houve commit, merge, push, release ou mudança de produção nesta frente.
