# Correção consolidada do checkpoint — 18/10/2026

Implementação e verificação local concluídas para010/001,010/002,Q1,Q2,C1. **Re-review independente escopado e pipeline global final do coordenador permanecem pendentes.** Não há aprovação de publicação neste registro. O [full review original](full-review.md) permanece preservado integralmente, incluindo seus achados e limites; o coordenador acrescentará as disposições posteriores. Lotes1–4/5a/5b são o checkpoint;5c e6–8 continuam adiados.

## Causas e correções

- **010/001:** `file:export` escrevia diretamente no destino do diálogo. A política tipada local `export-destination.ts` canonicaliza raiz, pai e destino existente, com case/junction do Windows; recusa qualquer arquivo interno, publica por staging externo e revalida autoridade/identidade após awaits e imediatamente antes de chamar rename. O callback mantém Library/raiz/janela/mainFrame/URL e acesso. PNG/JPEG/WebP/WebM usam a mesma política. QuickVideo mantém seu guard próprio e passou seus controles nativos.
- **010/002:** origem e tamanho eram arredondados independentemente. O editor agora quantiza/clampa os quatro limites e deriva a extensão positiva dentro do recorte atual em coordenadas do original. A validação estrita de `prepare` permanece.
- **Q1:** o `div` genérico focável tornou-se superfície gráfica nativa `canvas`, nomeada e descrita, dentro da região de aplicação do seletor bidimensional. Overlay visual, ponteiro e foco usam o contêiner; a ação padrão do pointerdown é cancelada somente nesse arraste customizado para conservar foco no canvas. Tab, setas1/Shift10, campos, confirmar e cancelar permanecem. AX observado é application + Canvas nomeado/focável; não é homologação com leitor de tela.
- **Q2:** somente o bloco `.editor-extras p` foi movido antes de `#empty p`. Comparação do DOM real estático em1366×768, com scripts inativos e details abertos, encontrou dimensões/estilos e PNGs idênticos. O renderer funcional também passou.
- **C1:** Preferências e mensagem de WebM inválido agora descrevem duração/miniatura e saídas MP4/GIF existentes, mantendo importação WebM, limite400MB e original. [003/004](../../../../.compozy/tasks/edicaptura-snagit/reviews-003/issue_004.md) recebeu append; sua resolução histórica não foi reescrita nem duplicada.

## Evidência desta onda

| Gate | Resultado final |
| --- | --- |
| Node Captura |161/161,0fail,0skip |
| Tipos/build | Ambos exit0 depois da última mudança de produção |
| Biome dos18 arquivos alterados | exit0;0erros,5avisos CSS antigos,20infos; sem supressão |
| Check global com VCS/ignore explícitos | exit0;2.507arquivos,0erros,415avisos,82infos. Comparação por caminho/regra/mensagem/trecho real com main27ac:0avisos novos,7 removidos; não se alega zero avisos |
| Renderer completo |11runners,exit0; inclui90casos/180saídas exatas da seleção, AX/teclado/arraste/foco, nove crops, raster25MB, persistência/rolagem/MediaRecorder e vídeo rápido |
| Mídia Electron | exit0; PNG/JPEG/WebP reais, perfis próprios e child/cleanup0. Estação privada de clipboard recusada5; nenhuma publicação global |
| Vídeo nativo |4/4 com FFmpeg/FFprobe9.0.2, incluindo cancelamento/revogação separados e controle |
| Percurso licenciado | exit0; nova raiz `run-KZq36o`, filho fechado normalmente0/sem sinal/0falhas, cleanup0. Superfícies próprias antes da aquisição; active permanece não verificado |
| Pacote e proveniência | beta22332, inventário/NSIS,21arquivos de build idênticos ao ASAR, nove fontes finais inalteradas durante o build,38arquivos de bundle/licenças/fontes/rebuild e execução dos dois binários nos recursos próprios |

A regressão de exportação executa o callback real com Library/filesystem reais:48combinações internas (quatro formatos/quatro originais ou metadados/direto+junction+case), quatro saídas externas exatas,112fronteiras de autoridade e quatro casos determinísticos durante/depois do último realpath, com revogação/raiz isoladas. Refusas preservam hashes dos internos e o destino anterior, sem rememberExport. Diálogo, provedor de licença e codecs permanecem inertes nessa prova de destino; os gates reais acima exercitam licença e codecs separadamente. O diálogo nativo de salvar da exportação individual permanece não exercitado. WebM dessa fixture é conteúdo opaco próprio para cópia, não vídeo decodificado.

O crop usa ponteiro real e PNG gradiente próprio8×8, snapshot→Library.save/read→prepare, undo/redo, dimensões/pixels e SHA original. São nove casos: fracionário nas duas bordas/junto e separado, controles inteiro/reverso, zoom CSS, rotação de90°, flip horizontal e crop sucessivo. A fonte congelada falhou depois do save/read em prepare; a final passa. Não houve injeção de retângulo inválido ou relaxamento de validação.

Instalador novo: **0.0.0-beta.22332**,192.958.158bytes, SHA256 `dc51ecc93d12cbc211501dda8e1dea34099cf146f9e0cda71898844eb95f8537`. ASAR8.425.957bytes/SHA256 `965db8f3257b292b6408d18c9fdd277f7a3bc702ebaafee534aea9211c32f4ef`. FFmpeg/FFprobe9.0.2 executados exclusivamente sob os recursos Captura, sem fallback Aula/PDF. Chaves efêmeras/inventário próprio não equivalem a Authenticode; não houve instalação, release, deploy ou publicação.

## Falhas preservadas e incidente do harness

RED original: exportação interna não recusada; crop2/2/7/7 e prepare recusa a reabertura. A primeira montagem WebP do novo teste omitiu o símbolo BrowserWindow; foi corrigida no harness, sem mudança no produto. Div/application e canvas/application isolados ainda violavam regras HTML; a composição final usa application no contêiner e canvas nativo. Um novo teste de overlay revelou perda real de foco; pointerdown agora impede essa ação padrão e o teste mantém suas assertions. Primeiro renderer completo parou antes das assertions de captura porque aguardava largura inline no antigo elemento; a espera foi atualizada para o contêiner real, sem aumentar prazo. Outra execução foi provisória por mudanças nos destinos de evidência; somente a quarta rodada completa sustenta o resultado final. Um check intermediário encontrou formatação das novas assertions, corrigida normalmente.

**Lacuna de preservação:** antes da auditoria dos writes do harness, os scripts existentes gravaram novamente `task-4b3-selection.png`, `apps/edicaptura/test-results/integrity.png` e os três `library-renderer/library-{grid,settings,workflows}.png`. O conteúdo anterior não foi lido, hashado, copiado ou restaurado nesta onda. O coordenador não encontrou cópia comprovada de task-4b3-selection pelos manifests/textos consultados; isso não é prova forense de inexistência absoluta. Arquivos atuais ficam no lugar, e não se alega preservação integral de screenshots históricos. Após detectar o incidente, os quatro runners de screenshots receberam um helper que cria raízes únicas por execução e as conserva. A primeira saída redirecionada da seleção e as duas de scroll também ficam preservadas; não entram como evidência de bytes antigos nem no freeze de mídia histórica.

O primeiro wrapper de pacote saiu1 no guard legítimo `npm_execpath`, pois `pnpm exec` não fornecia lifecycle de script. A pasta beta39228 criada antes desse guard e seu receipt foram preservados. A decisão12 do coordenador autorizou apenas um harness privado novo em scratch, usando o lifecycle normal do pnpm, mesmo PID/argv, ausência da pasta beta exata antes de importar o script original e nenhum override de ambiente/guard. O pacote final saiu0. O primeiro auditor ASAR usou separadores POSIX; a API Windows exigia caminho nativo. Corrigir somente o auditor produziu21comparações exatas, sem reempacotar ou mudar produto.

O script original de pacote registrou rebuild/materialização de dependências nativas, extração do Electron44.8.0 e mensagens `downloaded electron zip extracted`/signtool. O rótulo não prova cache versus rede; não se afirma ausência desses efeitos normais do build nem publicador Authenticode certificado. Manifests/lockfile de produto não receberam upgrade. Esses passos ocorreram depois dos probes GUI/nativos anteriores encerrarem.

## Limites e próximo passo

As onze decisões do full review continuam vinculantes; a decisão12 é somente proteção/proveniência do harness de pacote. Nenhum segredo/configuração pessoal/`.claude`, mídia pessoal, microfone/câmera, clipboard global ou captura ativa foi adquirido. Não houve Git staging/commit/refs/remote, mudança de dependências/manifests de produto, banco/produção ou nova funcionalidade. A leitura de HEAD interna ao script obrigatório de pacote foi expressamente permitida pelo coordenador.

Continuam sem causa estabelecida os exits/WGC/GetFrame e timeout de retomada históricos; os greens atuais não os resolvem. A rotação da credencial Context7 anterior permanece não confirmada. O incidente4d teve amostragem automatizada anterior ao STOP; LFenEJ foi limpo após close normal; ljtJAW permanece retido e nenhuma limpeza rejeitada foi repetida. Mixed-DPI/HDR/dock/suspensão, hardware/AT físicos, clipboard OS integral,32GiB/24h/RSS total, instalação/upgrade em máquina sem checkout e CI remoto não são homologados aqui. O modelo512MiB não é teto de RSS. Vídeo permanece região de um monitor; multi-monitor refere-se a imagem.

5c áudio/pausa manual,6/OCR,7/guias e8/share/IA permanecem adiados; sem fonte PDF, segundo OCR, handoff direto ou vídeo avançado. IA futura usa somente assinatura própria Claude Code/Codex. O próximo passo é re-review pelo mesmo revisor limitado a010/Q1/Q2/C1 e quebra introduzida, depois pipeline global e integração remota atual pelo coordenador. O relatório completo e freeze novos ficam em `.superpowers/sdd/2026-10-18-edicaptura-snagit/task-checkpoint-fix-{report.md,freeze.json}`; este registro e os issues guardam o handoff durável fora de scratch.
