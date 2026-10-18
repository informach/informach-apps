# EdiCaptura — execução autorizada em lotes

Em 18/10/2026 o titular autorizou implementar o diagnóstico completo, com review entre lotes e full review final. Requisitos: [diagnóstico](../../../docs/propostas/edi-suite-2026-10-16/analise-edicaptura-snagit.md). Execução: [plano](../../../docs/superpowers/plans/2026-10-18-edicaptura-snagit.md).

Revisões usam escopo explícito e o diagnóstico/plano como contexto de requisitos. Não há PRD/TechSpec separados; não presumir que somente qualidade de código basta para aprovar funcionalidade.

Decisão posterior do titular em18/10: **Enxuto com vídeo rápido**. A referência vigente é `docs/propostas/edi-suite-2026-10-16/edicaptura-lotes/foco-na-suite.md`: preservar entregas/5a; vídeo avançado no EdiAula, edição geral de PDF no EdiPDF, Captura com OCR/ocultação/guias simples e vídeo rápido. Oito lotes, quinze fases; requisitos retirados/encaminhados não contam como implementados.

O titular dispensou passagem direta entre apps nesta entrega: exportar arquivos comuns; a pessoa escolhe e abre a ferramenta. Sem botões/lançamento/contratos de recebimento entre apps.

Condição posterior do titular: integrar atualizações remotas antes de qualquer push, preservando alterações locais. Remoto27ac84cf integrado e aceito após009/fix1; atualização seguinte f488e68a integrada e aceita em revisão independente do delta, após a revisão final do checkpoint entregue e sua correção010. O pipeline global atualizado passou em série com os benchmarks originais, e duas falhas sob concorrência permanecem registradas na [verificação](../../../docs/propostas/edi-suite-2026-10-16/edicaptura-lotes/verificacao-checkpoint.md). O remoto deve ser reconsultado antes do push. O pedido posterior de encerramento autoriza commit/push/main após integração, reviews e gates; consultar Git/PR para confirmar publicação.

Decisão vinculante de 18/10/2026: IA remota opcional do lote 8 somente pela assinatura do usuário no Claude Code ou Codex, seguindo o código existente do EdiAula e extraindo infraestrutura compartilhada quando necessário. Sem opção de API, créditos Edi ou fallback pago. Ver `docs/propostas/edi-suite-2026-10-16/edicaptura-lotes/decisao-ia-assinatura.md`.

| Lote | Estado | Review |
| --- | --- | --- |
| 1 — integridade | Base implementada; A04 renumeração explícita continua no lote 6; percurso funcional A10 continua nos lotes 4/5 | Review 001: três achados resolvidos |
| 2 — editor/composição | Implementado e verificado | Review 002: cinco achados resolvidos |
| 3 — biblioteca/portabilidade | Implementado e revisado; extração de vídeo M05 continua no lote 5 | Review 003: quatro achados resolvidos |
| 4 — captura/rolagem | Implementado e revisado no escopo de software e isolamento disponível; matriz física mantém limites explícitos | Reviews004/005/006 resolvidos; 4d e cobertura completa4 aceitas com zero novos achados |
| 5 — vídeo rápido | 5a/5b aprovadas; 5c áudio/pausa/integração interna adiada pelo titular; lote5 integral incompleto, antiga5d retirada | Reviews007/008 corrigidos e aceitos em re-review; limites de confiabilidade/hardware documentados |
| 6 — OCR/inteligência local | Adiado; aguardar base atualizada do EdiPDF | Não iniciado |
| 7 — guias simples/arquivos HTML-PDF | Adiado; sem DOCX/editor geral/passagem entre apps | Não iniciado |
| 8 — compartilhamento/assistência | Adiado | Não iniciado |
| Full review do checkpoint entregue | Aceito após010/Q1/Q2/C1; delta f488 aceito com ressalvas; pipeline global atualizado passou em série | Escopo1–4/5a/5b, não todos os oito lotes |

Fechamento solicitado pelo titular: não iniciar OCR em paralelo com a grande melhoria do EdiPDF. A [passagem de trabalho](../../../docs/propostas/edi-suite-2026-10-16/edicaptura-lotes/continuidade-edicaptura-edipdf.md) registra pendências, contratos, independência de instalação e critérios da futura base comum.
