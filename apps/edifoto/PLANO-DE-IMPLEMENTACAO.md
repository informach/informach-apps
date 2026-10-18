# Evolução do EdiFoto

## Escopo autorizado em 18/10/2026

O titular autorizou implementação seguida por lotes, review entre cada lote e full review final. A análise original em `docs/reviews/edifoto-2026-10-18/analise-funcional.md` é um diagnóstico amplo, não uma obrigação de reproduzir o Photoshop.

O público de referência é o professor sem formação em design, mas a interface usa nomes genéricos para servir outros propósitos. O produto facilita criar imagens, editar fotos, combinar texto/formas, recortar e exportar. Não usar nomes como “capas de aula” ou “material de aula” na interface. A IA continua pelos clientes oficiais Claude Code/Codex e assinatura pessoal do usuário; sem créditos Edi, cobrança de IA pelo app ou provedor pago da casa.

Ficam fora deste ciclo: PSD/PSB, RAW/TIFF/HEIC, 16/32 bits/HDR, CMYK/Lab/ICC profissional, warp/perspectiva de estúdio, plugins, panorama/focus stacking, motor de tablet, colaboração/cloud, geração de pixels por API e modelos pesados com download obrigatório. Preservar ferramentas existentes em controles avançados; simplificar a experiência padrão. Remover fundo continua com métodos locais claramente descritos e refinamento manual, sem prometer segmentação semântica inexistente.

## Lotes e aceite

| Lote | Entrega | Gate de review |
| --- | --- | --- |
| 1 | Projeto validado, abertura segura, snapshot/savepoint, coleta de bitmaps, recuperação local e harness atualizado. | Unitários, tipos e integração de arquivos/cancelamento/concorrência/recuperação. |
| 2 | Fidelidade de transformação/máscara/merge, bloqueio, limites GPU e operações consistentes. | Probes de pixels, persistência, undo/redo e revisão das causas dos achados. |
| 3 | Interface simples e adaptável, modelos genéricos, ajustes rápidos, texto/forma e exportação fácil. | Jornadas criar/editar/exportar e inspeção visual em dois tamanhos. |
| 4 | Assistente só por assinatura pessoal, contexto por documento, cancelamento, histórico isolado e ferramentas locais úteis. | Testes de contratos, falhas parciais, cancelamento e chamadas obsoletas; sem chamadas pagas. |
| 5 | Refinamento de seleção/recorte, alinhamento, presets e processamento/exportação reutilizáveis compatíveis com escopo simples. | Jornadas completas e regressão editorial. |
| Final | Full review: coerência do escopo, segurança de arquivos, fidelidade, UX, IA pessoal e documentação. | Gates focados, build, smoke Electron e review final sem achados altos pendentes. |

## Execução

Lotes 1 a 5 implementados e revisados ([lote 1](../../docs/reviews/edifoto-2026-10-18/review-lote-1.md), [lote 2](../../docs/reviews/edifoto-2026-10-18/review-lote-2.md)). Review do [lote 3](../../docs/reviews/edifoto-2026-10-18/review-lote-3.md). Review do [lote 4](../../docs/reviews/edifoto-2026-10-18/review-lote-4.md). Review do [lote 5](../../docs/reviews/edifoto-2026-10-18/review-lote-5.md). Full review final concluído com verificações locais; resultados e limites no [review final](../../docs/reviews/edifoto-2026-10-18/review-final.md). Checkout compartilhado já contém frentes EdiSVG/EdiPDF; manter mudanças restritas ao EdiFoto e documentos próprios. Não fazer commit/push/deploy/release nesta autorização. Atualizar cada review com resultados realmente executados, correções de achados e limitações.

## Revisão para publicação

O pedido posterior autorizou commit, main e produção. O [review para publicação](../../docs/reviews/edifoto-2026-10-18/review-producao.md) complementa o aceite anterior, corrige novos achados e explicita a correspondência com o diagnóstico. Gates locais passaram no checkout isolado; integração/release dependem dos gates remotos.
