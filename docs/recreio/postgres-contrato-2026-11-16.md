# PostgreSQL: capacidade exigida pelo Recreio

O CI geral `43838006618` falhou em PostgreSQL 16 ao executar a expiração de sessões: `42704`, parâmetro `transaction_timeout` desconhecido. Os seis gates do Recreio usavam PG 18 e passaram; essa divergência deixou de verificar a compatibilidade declarada. O Edi conservou o deploy anterior, pois o gate geral impediu a nova implantação; não contornar esse bloqueio.

O limite nativo de duração da transação foi introduzido no [PostgreSQL 17](https://www.postgresql.org/docs/17/release-17.html). É parte do contrato de revogação e manutenção: não ignorar o erro, retirar o limite ou simular cancelamento em JavaScript enquanto a transação continua no banco.

O Recreio passa a declarar explicitamente PG 17+, com alvo de homologação PG 18, como a produção existente. `databaseReady` verifica a existência da capacidade com `current_setting('transaction_timeout', true)` antes da sonda do schema. Ausência é falha de prontidão, sem expor detalhes no HTTP público.

O CI geral conserva PG 16 para os demais consumidores e acrescenta PG 18 na porta 5433 somente para os testes completos do Recreio. Um teste real do mesmo repositório roda nas duas versões: exige recusa em PG 16 e prontidão e configuração transacional nativa em PG 18. Sem mocks, dependências novas, alteração de banco real ou troca de imagem em um volume existente. A execução dessa candidata ainda precisa ser registrada antes da publicação.


## Prova e implantação

Fonte `1c51feb19c0e66c585fff07aa889f8c19a7712a0`: seis gates da candidata
`43844337331`, CI geral `43844337189` e seis gates da main `43853153185`
aprovados. O CI geral executou a recusa real em PG 16 (um teste) e a suíte
completa em PG 18 (201 testes); concluiu também os demais consumidores.
A repetição do CI geral na main segue seu próprio estado, não foi declarada
concluída pela rodada da candidata.

Portal `a14a491c-1e67-405e-a81b-a8020ed961a3` em SUCCESS. Fonte, banco 18.6 e
capacidade relidos no processo às 11:02:18 UTC, saúde/prontidão 200.
Configuração integral idêntica à anterior, sem staged. Mapas enviados ao Sentry
às 10:57:09,790 UTC, release presente. Cron automático posterior: 11:10:52,667
a 11:10:52,729 UTC, ok=true, quatro contagens zero. Zero não comprova ausência
de disputa ou capacidade de carga. O banco real não foi alterado e o Morada
conserva `179a0a76`, Mundo V2/protocolo 1 e arte D2.

O Edi conservou a versão disponível enquanto o gate anterior falhava. Esta
entrega não o força a recompilar por uma mudança de prontidão exclusiva do
Recreio; o fluxo de deploy segue protegido pelos checks normais.

[Prova estruturada](evidencias/postgres-producao-2026-11-16.json).
