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

A 0219 foi gerada em `44486780124`/`065c8ff8`, sem banco/segredos; SQL,
snapshot e journal foram adotados intactos após verificar SHA/tamanho,
predecessor, apenas uma tabela adicionada e todas as tabelas anteriores iguais.
O controle guarda prazo de vinte minutos; renovação exige token ainda vigente.
A confirmação revalida o prazo depois da auditoria, que pode esperar.

O executor `publicar-captura.ts` recupera ciphertext do provedor, abre o arquivo
e confere o composto inteiro antes da confirmação. Compara destino e inventário
aos persistidos, fixa bytes assinados antes do PUT e relê índice/tombstone antes
de confirmar. Uma falha de auditoria depois do índice guardado mantém a captura
selada e todas as reservas; retomada usa novo token e os mesmos bytes, mesmo
sem arquivos locais. Não há endpoint público para aceitar provas do navegador.

Retirada de arquivo, expurgo de objetos, agendamento, custódia e replay F7
continuam pendentes. O controle durável em candidata não é rotina de produção.

Evidências parciais: quality `44487584581`/`eb6f3146` aprovado, com 489 unitários
do app; composição nativa `44487878646`/`5f6f80b8` aprovada, dezesseis casos,
incluindo falha de auditoria após índice guardado, perda dos arquivos locais,
nova tentativa e replay dos mesmos bytes. A integração `44488238322`/`02ea9242`
teve 1.275 casos aprovados e uma expectativa incorreta de SQLSTATE no teste de
FK RESTRICT: PostgreSQL devolveu `23001`, conservando a proteção; teste corrigido
para esse código específico. Não contar a rodada como aprovada. Nova integração
qualifica conjuntamente publicação e coleta na candidata seguinte.

A prova externa `44488576793`/`02ea9242` foi cancelada após o build ficar
mais de dezessete minutos no bootstrap do Corepack, antes de executar o teste
ou criar objetos. O log termina no download do pnpm 9.15.0; não comprova erro
de integridade nem publicação/limpeza no provedor. O executor passa a instalar
explicitamente o gerenciador fixado com limite de 120 s e dependências com
limite de 600 s, sem mudar versões/digests, desativar integridade ou trocar
registry. A indisponibilidade de rede permanece uma falha, com término limitado.
