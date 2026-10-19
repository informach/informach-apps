# Lote 1 — integridade de documentos e capturas

18/10/2026, branch `feat/edicaptura-snagit`. Escopo: A01–A10 do diagnóstico; fundação de M12. A execução completa foi autorizada pelo titular, em lotes com review entre eles e full review ao final.

## Implementação

- Decodificação e validação antes de ativar imagem, abertura serializada, preservação da captura atual em releitura e drenagem das revisões editadas durante saves pendentes.
- Estado explícito de erro/pendência no autosave; renomeação de vídeo por metadados sem mudar tipo ou bytes.
- Schema TypeScript/Zod versionado para projetos/anotações/recortes, IDs nas anotações, validação no main e cópia dos metadados legados antes da primeira conversão persistida.
- Listagem sinaliza item danificado; recuperação preserva metadados corrompidos e mídia original. Não promete recuperar anotações ilegíveis.
- Numeração de passos sem duplicatas; painel acompanha seleção; histórico limitado por quantidade e orçamento de memória.
- Interrupção de monitor impede fotos novas/tardias e mantém trechos anteriores para finalizar/repetir salvamento.
- Cronômetro segue início efetivo/finalização/falha; parada automática também envia as fases reais e mantém retry.
- README e comandos atualizados; `test:renderer` adicionado ao workflow Windows; `test:e2e` aponta ao harness nativo licenciado, evitando o smoke legado sem provisionamento de licença/cofre isolado.

## Review

Revisão independente em `.compozy/tasks/edicaptura-snagit/reviews-001/`. Três achados confirmados durante a implementação: releitura/troca concorrente, foto pendente após alteração de monitor e finalização automática sem sincronizar relógio. Os três foram corrigidos. O revisor verificou a versão atual, executou regressões e informou ausência de bloqueadores residuais confirmados. A recomendação de testar parada automática foi incorporada com uma regressão adicional.

## Verificação

VERIFICATION REPORT
-------------------
Claim: regressões de integridade deste lote passam, com revisão independente remediada.
Command: `pnpm --filter @informach/edicaptura test`; `pnpm --filter @informach/edicaptura test:renderer`; `pnpm --filter @informach/edicaptura typecheck`; `pnpm --filter @informach/edicaptura build`; `pnpm edi:test:native edicaptura`; Biome dos arquivos afetados; `git diff --check`.
Executed: 18/10/2026, nesta sessão, após alterações respectivas; suíte Node/renderer repetida após a regressão final de parada automática.
Exit code: 0.
Output summary: `tests 49; pass 49; fail 0`; renderer `PASS: failed/concurrent opening preserves document, stale same-document reload, explicit save failure/retry, video rename, properties, unique steps, bounded history`; native `Verified gate, valid signed offline lease, expiration and IPC denial: edicaptura`.
Warnings: diagnósticos informativos de estilo preexistentes; fixture nativa informa rebuild/assinatura de executável omitidos. Nenhuma vulneração das proteções foi usada.
Errors: nenhum nas verificações finais descritas.
Verdict: PASS para o escopo verificado.

## Limites e continuidade

Não é homologação completa de captura em hardware multimonitor. `typecheck` cobre os novos módulos TypeScript, não promete tipagem integral do renderer legado. A10 ainda precisa do percurso funcional licenciado de captura/vídeo/rolagem, que será integrado com os lotes 4/5. Recuperação após crash no meio do vídeo e nova biblioteca/portabilidade pertencem aos lotes seguintes. Não houve commit, publicação ou alteração remota.

Próximo: lote 2, objetos/texto, composição, interface contextual e exportação saneada.
