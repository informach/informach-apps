# PostgreSQL: capacidade exigida pelo Recreio

O CI geral `43838006618` falhou em PostgreSQL 16 ao executar a expiração de sessões: `42704`, parâmetro `transaction_timeout` desconhecido. Os seis gates do Recreio usavam PG 18 e passaram; essa divergência deixou de verificar a compatibilidade declarada. O Edi conservou o deploy anterior, pois o gate geral impediu a nova implantação; não contornar esse bloqueio.

O limite nativo de duração da transação foi introduzido no [PostgreSQL 17](https://www.postgresql.org/docs/17/release-17.html). É parte do contrato de revogação e manutenção: não ignorar o erro, retirar o limite ou simular cancelamento em JavaScript enquanto a transação continua no banco.

O Recreio passa a declarar explicitamente PG 17+, com alvo de homologação PG 18, como a produção existente. `databaseReady` verifica a existência da capacidade com `current_setting('transaction_timeout', true)` antes da sonda do schema. Ausência é falha de prontidão, sem expor detalhes no HTTP público.

O CI geral conserva PG 16 para os demais consumidores e acrescenta PG 18 na porta 5433 somente para os testes completos do Recreio. Um teste real do mesmo repositório roda nas duas versões: exige recusa em PG 16 e prontidão e configuração transacional nativa em PG 18. Sem mocks, dependências novas, alteração de banco real ou troca de imagem em um volume existente. A execução dessa candidata ainda precisa ser registrada antes da publicação.
