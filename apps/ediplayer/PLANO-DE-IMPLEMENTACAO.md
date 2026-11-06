# EdiPlayer

## Escopo autorizado em 06/11/2026

O titular aprovou a proposta (doc "Proposta: EdiPlayer") e as telas finais (canvas "EdiPlayer – telas finais") e pediu a implementação dos quatro lotes como ferramenta da suíte Edi, aberta pelo Edi Hub e coberta pela assinatura única. Nome e id: EdiPlayer / `ediplayer`. Como ninguém tinha comprado a suíte, os contratos de licença e release puderam mudar sem transição em duas fases; agora derivam do catálogo. O portal foi atualizado junto.

Fora deste ciclo: timeline com várias faixas, transições e efeitos (são do EdiAula), streaming de rede, DVD/Blu-ray, DRM, macOS/Linux e IA.

## Lotes e aceite

| Lote | Entrega | Gate |
| --- | --- | --- |
| 0 | Registro na suíte: catálogo, marca e ícones, contratos derivados do catálogo, migration 0079, harness, portal e docs. | Testes de config, contratos, licença, SDK, portal e ferramental; typechecks. |
| 1 | Player: formatos nativos, cópia e prévia, controles, legendas, lista, retomar, captura, miniplayer. | Unitários, integração FFmpeg (cópia de MKV, prévia de AVI) e harness nativo. |
| 2 | Cortes sem perda: trechos, dividir, juntar, extrair/remover/trocar som, Salvar e fila. | Integração: duração, original intacto byte a byte; jornada nativa abrir → marcar → salvar. |
| 3 | Recodificação: corte preciso, girar, espelhar, recortar, velocidade, volume/normalização, legenda gravada, predefinições, GIF. | Integração com FFmpeg real para cada operação. |
| 4 | Formatos legados, "Abrir com", "Abrir no EdiAula", jornada nativa. | Harness nativo da suíte com jornada e capturas. |

## Execução

Os cinco lotes foram implementados em 06/11/2026 no branch `feat/ediplayer`. Verificação, desvios e limites no [review](../../docs/reviews/ediplayer-2026-11-06/review.md); correções do [full review](../../docs/reviews/ediplayer-2026-11-06/full-review.md), incluindo o "Abrir com" retirado do instalador até haver um registro seguro. Desvio do plano: o corte preciso recodifica o resultado inteiro, não só as pontas (ver limites no README).
