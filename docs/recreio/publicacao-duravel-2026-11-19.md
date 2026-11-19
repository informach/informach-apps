# Publicação durável de capturas

Estado: implementação em candidata; sem implantação ou ativação.

O destino das fotografias na 0218 não é o destino do backup. A publicação terá
registro aditivo próprio, FK restritiva para a captura, destino independente,
fonte Git, tentativa UUID e prazo pelo relógio do banco. Não há backfill de
capturas antigas nem inferência de índice publicado a partir de `verified`.

Sequência: fixar ciphertext e destino antes do primeiro PUT; confirmar arquivo
recuperado e composto autenticado; persistir bytes exatos do índice assinado;
publicar/ler os mesmos bytes; confirmar captura/publicação atomicamente com
auditoria; só então liberar reservas em lotes limitados. I/O fica fora das
transações. Captura e publicação são travadas nessa ordem; liberação não toma
trava de mundo/entrega e não realiza DELETE.

Reinício retoma referências imutáveis. Nova tentativa substitui token apenas
após prazo; token antigo não confirma nem renova. Prazo vencido não comprova
que I/O antigo cessou: PUT continua condicional e só aceita bytes idênticos.
Perda de ciphertext local exige recuperar a referência guardada, nunca cifrar
novamente sob a mesma operação. Retirada/tombstones e coleta exigem incremento
próprio antes de habilitar cron ou limpeza.

Verificação no GitHub: geração intacta de DDL aditivo; constraints, FK, retomada,
destino divergente, token vencido/concorrente, bytes divergentes, rollback por
auditoria, lotes/repetição de liberação, e integração com composição real de
arquivo/índice. A prova de cluster novo é evidência separada, já conferida em
`44484289365`/`1893b6f4`. Nenhuma dessas candidatas habilita produção.
