# Preservação de tarefas e gravações — 17/10/2026

Implementação local na frente de produção Edi. Este registro não comprova deploy, publicação ou instalação comercial. A autorização atual é corrigir e publicar a suíte; os gates globais e o estado remoto são registrados pelo responsável pela frente em `implementacao.md`.

## Contrato implementado

- `@informach/edi-desktop/jobs` registra uma operação que já passou por licença válida. O primeiro bloqueio fixa o prazo de preservação; novas operações não herdam esse acesso. Repetição de eventos e transições de status não estendem a operação existente. Fechar/reabrir o app não recupera permits.
- O máximo é 30 minutos, com timer e checagem por tempo monotônico e de parede. O retorno da suspensão verifica os prazos antes do refresh. `check()` é obrigatório antes do commit e entre etapas; `finish()` remove o registro. Falhas ao parar são reportadas sem incluir conteúdo dos arquivos nos logs do SDK.
- EdiAula: exportação, proxy, chroma e transcrição recebem cancelamento nativo ao final da janela. O FFmpeg aguarda fechamento dos handles antes de devolver o erro ao rollback. Saídas comerciais continuam em staging até validação final; a saída anterior permanece intacta se o job for interrompido.
- EdiAula: captura e execução guiada encerram a aquisição imediatamente. `pause`/`stop` compartilham a finalização do segmento, evitando que um stop concorrente encontre a lista de segmentos vazia. MP4 fragmentado e pasta exclusiva mantêm arquivos recuperáveis. Falha de finalização preserva a pasta e informa o local, sem chamar o descarte de uma gravação comum. Falha do capturador não é mais declarada como primeiro quadro bem-sucedido.
- EdiCaptura: vídeo e rolagem encerram imediatamente. Nenhum próximo trecho é capturado enquanto restrito, inclusive depois de falha de disco. A recuperação pode repetir o salvamento dos bytes/trechos existentes. Vídeo tem cópia local de recuperação antes da biblioteca; os bytes permanecem no renderer em caso de falha. A janela permanece viva até a confirmação IPC de recuperação. Exportações de arquivo revalidam licença e usam escrita atômica.
- Projetos EdiAula já usavam `atomicWrite`, `projectSchema` na leitura/escrita e limite de 32 MB no checkout. Foram acrescentadas evidências de roundtrip com dados de extensão, backup, rejeição de estado inválido e recuperação após erro de escrita; não se reimplementou um mecanismo já corrigido.

## Verificações

### Recuperação concorrente do vídeo e da rolagem — revisão final

O `MediaRecorder` muda para `inactive` antes de entregar o último `dataavailable` e o evento `onstop`. A revisão final identificou que um pedido de recuperação concorrente ao encerramento automático podia salvar apenas os chunks anteriores. A finalização agora aguarda `onstop` para permitir persistência ou nova tentativa; chamadas concorrentes compartilham o salvamento em andamento. Os bytes continuam disponíveis quando a escrita falha.

A regressão sobre o código real do renderer, com eventos do navegador controlados na fronteira, falhou antes da correção: salvou `first frames;` antes da entrega final. Após a correção, confirmou nenhuma escrita nem confirmação antecipada, concatenação dos dois chunks e uma única persistência.

Na rolagem, o segundo pedido também retornava antes de terminar o primeiro. A finalização agora compartilha uma Promise e propaga sucesso ou erro a todos os pedidos; uma falha conserva os trechos e permite nova tentativa. As duas regressões falharam antes da correção, por confirmação antecipada e por ausência da rejeição de disco esperada, e passaram depois.

Os três arquivos focados (`recording-preservation`, `scroll-session` e `control-feedback`) passaram `15/15`, incluindo falha de disco e retry. Biome passou nos quatro arquivos de código/teste, mantendo três warnings e três infos de trechos preexistentes de `main.cjs`; `git diff --check` passou nos cinco arquivos da correção. EdiCaptura não declara script de typecheck; não foram executados builds concorrentes nem captura de tela real nesta revisão.

### Revisão do bloqueio por versão mínima

Uma ferramenta abaixo da versão mínima não pode apagar a licença compartilhada das versões atualizadas. O controller agora preserva o grant e registra `licenseVersionDeniedThrough` no cofre protegido: versões recusadas continuam bloqueadas após reinício ou falha de rede, enquanto ferramentas mais novas mantêm acesso e jobs. Um grant assinado que incorpora o novo piso substitui essa recusa; a autorização explícita da própria versão recusada também permite uma revisão deliberada da política no servidor. O campo é opcional para permitir a leitura dos cofres anteriores.

A comparação de versão ocorre depois da assinatura, vínculos, validade temporal e rollback de relógio. Assim, a recusa específica de uma versão não esconde uma falha que deve invalidar o acesso compartilhado. Negação comercial, revogação e suspensão conservam o comportamento global.

As duas regressões com controllers de versões diferentes falharam antes da correção, com a ferramenta atualizada indevidamente em `restricted`. Um terceiro teste detectou a precedência incorreta de `update_required` sobre clock rollback. Após as correções, `pnpm --filter @informach/edi-desktop test` passou em 11 arquivos/43 testes, o typecheck do SDK terminou com código zero e `license.test.ts` passou 10/10. Os cenários exercitam o cofre compartilhado, reload serializado, falha de rede, atualização do grant, gravação ativa e bloqueio global por negação comercial/rollback. Não substituem o gate global nem a homologação dos instaladores.

No servidor, `accountAccess` também precisa preceder o bloqueio por versão: suspensão comercial, disputa e reembolso não podem virar uma recusa específica do aplicativo e conservar grants em outras ferramentas. Três regressões com PostgreSQL real falharam antes dessa correção. Cada cenário obtém uma licença válida, altera o fato comercial no banco e exige a mesma negação para clientes antigos e atualizados. Depois da correção, `pnpm edi:test:integration` passou OAuth `3/3`, licensing `12/12` e Edi `7/7`, com banco descartável encerrado e removido. Biome e `git diff --check` dos arquivos alterados também terminaram sem erros.

### Rodada inicial de preservação

Rodada focada após as alterações: SDK desktop `40/40`, EdiCaptura `40/40`, testes de exportação EdiAula `7/7`, persistência de projeto `2/2` e gravação/processo nativo `3/3`. Typecheck do SDK desktop e EdiAula terminou com código zero. A suíte completa EdiAula executou `171/171` antes da inclusão do terceiro caso nativo; esse arquivo foi novamente executado e passou `3/3`. O total esperado da próxima suíte é 172, mas essa contagem só deverá ser declarada verificada depois do gate global.

| Comando | Evidência desta rodada |
| --- | --- |
| `pnpm --filter @informach/edi-desktop test` | `Test Files 11 passed (11)`, `Tests 40 passed (40)`, código 0 |
| `pnpm --filter @informach/edicaptura test` | `tests 40`, `pass 40`, `fail 0`, código 0 |
| `pnpm --filter @informach/ediaula test` | `tests 171`, `pass 171`, `fail 0`, código 0; executado antes do último caso negativo nativo |
| `pnpm --filter @informach/ediaula exec node --test tests/recording-preservation.test.ts` | `tests 3`, `pass 3`, `fail 0`, código 0 depois da inclusão do caso negativo |
| `pnpm --filter @informach/edi-desktop typecheck` e `pnpm --filter @informach/ediaula typecheck` | código 0 nos dois comandos |
| `pnpm --filter @informach/ediaula build` e `pnpm --filter @informach/edicaptura build` | três ambientes Electron gerados em cada app, código 0 nos dois comandos |

Os testes nativos executam FFmpeg/FFprobe reais sobre vídeo sintético e arquivos temporários isolados: um bloqueio finaliza a gravação com pausa concorrente e verifica que os dois MP4 permanecem legíveis e distintos; outro cancela um FFmpeg real, espera seu fechamento e confirma que a saída antiga continua intacta. O terceiro provoca erro de fonte nativa antes do primeiro quadro e verifica que o início falha sem rejeição background tardia. O adapter de monitor/cursor é substituído somente nesses testes; não gravam a tela ou arquivos pessoais.

Os testes do EdiCaptura exercitam o código real de controle com MediaRecorder/IPC substituídos na fronteira do navegador. Cobrem bloqueio durante a permissão, evento de início tardio, falha de disco e nova tentativa, além do fechamento da rolagem. Não substituem a homologação da captura em Windows com monitores e dispositivos físicos.

Limites: disco cheio pode impedir até a cópia de recuperação; nesse caso é necessário manter a janela aberta enquanto se libera espaço. Não há garantia de persistência após queda abrupta de energia antes da escrita. O gate nativo e a homologação completa dos cinco editores permanecem separados desses testes. Warnings antigos de módulo CommonJS/ESM e estilo do código legado não foram usados como justificativa para alterar o formato dos apps.
