# Review do lote 1

18/10/2026. Escopo: integridade e preservação de projetos, conforme plano simplificado autorizado.

Implementado: schema validado de projeto/índice binário, rejeição de versões futuras e referências ausentes, inspeção de dimensões PNG antes da decodificação, snapshot síncrono dos pixels antes do encoder assíncrono, fila de saves e savepoint por documento/revisão. Menu/drop/abertura do sistema convergem na proteção de substituição; a abertura também verifica se o trabalho mudou durante a leitura. Presets agora nascem como trabalho não salvo. Bitmaps sem referência são coletados, e o histórico tem orçamento de patches em bytes além do limite de entradas. Exportação preserva `.jpeg`. Recuperação local em IndexedDB restaura uma cópia editável sem associar o arquivo original. Fechamento oferece salvar e sair.

Review identificou e corrigiu dois casos adicionais antes de avançar: abertura assíncrona sobre edição posterior e uso de chave de bitmap especial no índice de serialização. A escrita atômica existente do SDK foi preservada. Recuperação não promete zero perda: a cópia local é atualizada após pausa de 1,5 segundo; salvar explicitamente continua imediato.

Gates: 25 testes unitários e typecheck aprovados. Harness versionado reparado: 68 verificações anteriores, 10 de segurança e 10 de chroma passaram sem erros JavaScript. A suíte de segurança foi repetida após o review e passou. Biome dos arquivos modificados passou sem erros após formatação; warnings legados seguem visíveis. Capturas/resultados em `.cache/edifoto-tests`. Testes web simulam somente arquivos/conta; usam modelo, compositor e operações reais. Jornada Electron completa de arquivos e full review ficam no gate final.

Conclusão: lote aprovado para seguir à fidelidade. Isolamento/cancelamento de IA, transformação/máscaras, bloqueio e layout pertencem aos lotes seguintes e não foram declarados resolvidos aqui. Sem commit/push/deploy/publicação.
