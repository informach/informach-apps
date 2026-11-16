# Expiração de sessões em lotes

Candidata, ainda sem implantação. O cron chamava o mesmo encerramento
transacional dos pedidos interativos para todas as sessões vencidas. Uma
acumulação podia segurar a trava global do cursor e gerar um evento de auditoria
por sessão numa transação sem limite de linhas ou prazo total.

O incremento seleciona até 100 sessões abertas, ordenadas por vencimento e ID,
com `FOR UPDATE SKIP LOCKED`, depois de adquirir a trava dos encerramentos.
Reutiliza o encerramento e a auditoria atômicos e repete o predicado de validade.
Mantém `ended_seq`, suas linhas e sua ordem de confirmação. Não apaga sessões,
negativas de revogação, aparelhos ou registros de auditoria.

Os limites locais são 1 s para cada espera por trava, 5 s por comando e 15 s
para a transação inteira, no PostgreSQL 18 já adotado. Erro chega ao HTTP 503 e
ao registro de falha do job; não é convertido em contagem zero. A próxima
execução continua o lote. Uma linha em renovação pode ser pulada; zero não
comprova ausência global de sessões vencidas. Não muda a recusa imediata de
credenciais vencidas pelos consumidores.

Quatro integrações no banco descartável do GitHub cobrem mais de um lote,
conservação da sessão válida, cursor/auditoria, renovação não confirmada,
rollback por falha de auditoria e timeout da trava mantida por um escritor real,
seguido de retomada e leitura dos dois encerramentos. Não há testes pesados
locais nem DDL de produção. O índice parcial existente de sessões abertas
continua disponível; medição de plano e volume real e a retenção das sessões
encerradas permanecem pendências distintas de A7/A8.

Referências: [timeouts locais](https://www.postgresql.org/docs/18/runtime-config-client.html)
e [SKIP LOCKED](https://www.postgresql.org/docs/18/sql-select.html).
