# Coleta de objetos destacados

Estado: implementação em candidata; sem cron ou DELETE de produção.

A retirada conserva o recibo e `retired_at` original. A ampliação aditiva do
CHECK de lease permite reconferir recibos `retired` sem apagar esse tombstone;
nenhum estado existente passa a ser inválido e não há backfill.

Admissão: barreira compartilhada captura/coleta antes de mundo → entrega →
reservas; reler destino exato, ausência de ponteiro, destaque há pelo menos
24 horas, prazo/tentativa anterior e ausência de reserva ativa. Prazo vencido
não prova término do PUT antigo. Fixar token antes de DELETE; I/O fora da
transação, com SDK sem repetição automática e limites por pedido.

DELETE precisa de GET `NoSuchKey` explícito; erro de rede, acesso negado ou
bucket ausente não comprovam ausência. Após I/O, repetir as travas e conferir
token/prazo/reservas/ponteiro; gravar retirada e auditoria estrita atomicamente.
Falha de auditoria mantém o fato pendente, mesmo se os bytes já desapareceram.
Tentativa vencida nunca confirma em nome do próximo worker.

Retirados são reconferidos diariamente para eliminar PUT tardio, mantendo a
primeira data de retirada. Scanners são limitados e restritos ao destino;
falhas individuais deixam repetição para cinco minutos depois e precisam
aparecer como falha operacional. Cadência/custo/atraso precisam de homologação
antes de habilitar qualquer rotina. A carência técnica de coleta não concede
prazo adicional a direitos de privacidade nem define retenção do backup.

Gates no GitHub: integridade, token antigo, reserva ativa, destaque/ponteiro,
concorrência com captura e liberação, DELETE perdido/GET negativo, PUT tardio,
falha de auditoria, limites e limpeza dos recursos sintéticos. Sem mudança de
modo de armazenamento, migração automática ou exposição de conteúdo.
