# Correções versionadas de dependências

## postgres 3.4.9 — escopo encerrado por perda da conexão

`postgres@3.4.9.patch` corrige o ciclo de vida de `begin`/savepoints em
`src/index.js`, preservando versão, API, tipos, licença e protocolo do driver.
A base inspecionada tem SHA-256
`4e21f5733e70d79cffc10d10d4ef01031de4a9ac862210e43f8870029fd103ed`.
[Fonte da versão](https://github.com/porsager/postgres/blob/v3.4.9/src/index.js).

A prova nativa de captura com PostgreSQL real (`44456802954`/`39e362f0`)
encontrou `TypeError: Cannot read properties of null (reading 'write')` em
`nextWrite`, após terminar o backend de coordenação. `begin` já havia rejeitado
pela perda da conexão, mas seu callback ainda podia finalizar e tentar
ROLLBACK/COMMIT ou mais consultas sobre a conexão morta. Consultas enfileiradas
nesse escopo também precisavam receber a falha de encerramento.

A correção registra o erro de fechamento no próprio escopo, rejeita sua fila e
qualquer consulta posterior, e encerra o escopo sem enviar ROLLBACK/COMMIT a um
backend que já não existe. A próxima transação legítima continua podendo abrir
outra conexão. Não há interceptação de exceção global, supressão de teste,
repetição automática, alteração do banco ou mudança de versão.

O pnpm aplica o patch de forma reproduzível por
[`pnpm.patchedDependencies`](https://pnpm.io/9.x/package_json#pnpmpatcheddependencies).
O lockfile é gerado no GitHub e adotado intacto com hash/proveniência. Nenhum
`node_modules` local é modificado. A prova deve terminar backends reais e cobrir
callback suspenso, retorno/erro/consulta após queda, fila e savepoint, além de
nova transação no pool. Todo consumidor de postgres/Drizzle precisa dos gates
compartilhados antes de implantação. Reavaliar o patch numa futura atualização
autorizada; não removê-lo sem repetir as provas de queda.

Estado: correção candidata; geração do lockfile e gates ainda pendentes.
