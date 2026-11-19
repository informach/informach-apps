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

## Evidência candidata

A 0220 foi gerada em `44489272058`/`21da85fc` e adotada intacta, conferindo
predecessor, hashes e alteração exclusiva da entrega. A geração anterior
`44488715514` não foi adotada: ainda não incluía o índice parcial.
`44489929595`/`8154725f` aprovou tipos do app e 163 testes de objetos, nove
novos do coletor com SDK/HTTP reais. A integração `44489934715` aprovou os treze
cenários de coleta entre 1.289 casos; testou barreira antes de mundo/entrega,
reserva, ponteiro, concorrência, token, auditoria, tombstone e falha parcial.

O coletor integrou a captura nativa em `44491175912`/`68fd5653`; a composição
com bucket real passou em `44491770523`/`44281736`, inclusive restauração em
cluster novo e limpeza. Datas artificiais de carência existem só no fixture.
Nenhuma fotografia ou recibo de produção foi alterado por essas provas.
