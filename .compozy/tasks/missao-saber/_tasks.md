# Fases

## Nova etapa comercial, ainda pendente

O [plano completo](../../../docs/propostas/missao-saber-2026-09-13/PLANO-VERSAO-COMERCIAL.md) registra a decisão atual de disponibilizar o conteúdo sem aprovação editorial prévia, validar com os filhos após a entrega e integrar o design desenvolvido em outra sessão. Cada fase inclui implementação, testes, review e correção dos achados.

- [ ] Comercial 01: disponibilidade sem aprovação editorial.
- [ ] Comercial 02: motor e experiência dos novos formatos didáticos.
- [ ] Comercial 03: catálogo autoral de pelo menos 600 atividades e progressão.
- [ ] Comercial 04: assinatura Família e jornada completa.
- [ ] Comercial 05: acompanhamento e correção durante o uso.
- [ ] Comercial 06: integração com design, full review e publicação.

## Histórico da implementação inicial

Revisão complementar e correções concluídas: [remediation-007.md](reviews/remediation-007.md). Rodada `reviews-007`: cinco achados resolvidos, zero pendentes; parecer independente favorável. Os passos externos para ativar vendas continuam previstos no PRD. As marcações abaixo representam a execução original das fases.

- [x] F1 — cadastro do produto, app, autenticação, schema e migration; review.
- [x] F2 — banco autoral, regras de aprendizagem, persistência e controles de acesso; review.
- [x] F3 — experiência do aluno, missões e laboratórios; review.
- [x] F4 — família, cobrança, privacidade e editorial; review.
- [x] F5 — integração, operação, testes completos e full review.

As evidências e correções serão registradas em `reviews/` e no relatório final. Não efetuar deploy nem migração em banco não descartável durante a verificação.

Verificação atual da remediação: 32 testes unitários do app, 27 testes PostgreSQL, seis jornadas E2E desktop/mobile, 193 testes do billing, 106 de emails, typecheck dos 12 packages e build do app aprovados. Workspace: sete tarefas de testes aprovadas, com três em cache; check focado em 113 arquivos aprovado. O check global ainda contém erros fora do escopo, discriminados no relatório. Os 18 achados anteriores e os cinco da rodada 007 estão resolvidos.
