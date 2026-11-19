# Correções versionadas de dependências

## postgres 3.4.9 — escopo encerrado por perda da conexão

`postgres@3.4.9.patch` corrige o ciclo de vida de `begin`/savepoints em
`src/index.js`, `cjs/src/index.js` e `cf/src/index.js`, preservando versão, API,
tipos, licença e protocolo do driver. CommonJS é a entrada default do pacote;
corrigir só ESM deixaria builds Node sem a correção.
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
[`pnpm.patchedDependencies` do pnpm 9](https://github.com/pnpm/pnpm/blob/v9.15.9/patching/plugin-commands-patching/src/patchCommit.ts).
O lockfile é gerado no GitHub e adotado intacto com hash/proveniência. Nenhum
`node_modules` local é modificado. A prova deve terminar backends reais e cobrir
callback suspenso, retorno/erro/consulta após queda, fila e savepoint, além de
nova transação no pool. Todo consumidor de postgres/Drizzle precisa dos gates
compartilhados antes de implantação. Reavaliar o patch numa futura atualização
autorizada; não removê-lo sem repetir as provas de queda.

O mesmo teste é executado em ESM e compilado em CommonJS com `postgres`
externo, para carregar de fato as duas entradas do pacote instalado. O build
Cloudflare recebe a mesma correção de escopo, mas não está homologado como
runtime deste repositório. O lock intermediário `44457602594` conferiu igualdade
de versões, mas foi substituído antes da homologação para incluir as três
entradas. Exige nova geração e instalação congelada do patch completo.

O lock final foi gerado em `44458443087`/`b935970c`, adotado intacto e conferido
sem mudança nas versões/estruturas de 1.438 packages e 1.446 snapshots, além da
identidade do patch. [Proveniência](../docs/recreio/evidencias/postgres-lock-44458443087.json).
Instalação congelada, tipos e cinco quedas por formato Node, mais dez casos de
captura, passaram em `44459074435`/`4952ae0b`; os dezesseis gates completos do
Recreio passaram em `44459423949`. [Evidência](../docs/recreio/evidencias/postgres-recreio-completo-44459423949.json).
Estado: correção candidata; CI compartilhado `44459423698` ainda em execução.
Nenhuma implantação decorre dessas provas.
