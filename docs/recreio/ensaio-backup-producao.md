# Ensaio de restauração do backup de produção

Atualizado em **18/11/2026 às 10:31 UTC**, depois dos gates de integração de F5
e imediatamente antes da preparação do migrator:
[evidência](evidencias/backup-logico-2026-11-18-pre-deploy-mundos.json).
19.492.655 bytes, 255 tabelas e 286.877 linhas; backup em 2.458 ms,
restauração/comparação em 6.212 ms e processo em 14.873 ms, excluindo
build/provisionamento. Conteúdo e estrutura comparada idênticos. Temporários
e serviço `f4e26815-8dd2-4fbc-8b90-fe8438d15deb` removidos; inventário relido
com 34 serviços, nenhum volume destacado e nenhum patch pendente. Origem
somente de leitura, sem migrations/seeds pelo executor. Na leitura das 10:29 UTC,
produção ainda tinha 191 recibos, dois mundos, dez fotos e nenhuma SID aberta;
presenças F5 e claims de teste F6 ausentes. Limites de retenção/agenda/PITR
permanecem; este resultado não é restauração de objeto guardado.

Repetido em **18/11/2026 às 09:33 UTC**, antes da implantação de F5:
[evidência](evidencias/backup-logico-2026-11-18-pre-mundos.json).
19.485.531 bytes, 255 tabelas e 286.703 linhas; backup em 1.905 ms,
restauração/comparação em 10.411 ms e processo em 16.896 ms, excluindo
build/provisionamento. Conteúdo e estrutura comparada idênticos. Temporários
e serviço `4b2cd791-5bbd-48a0-903b-a760b0d39230` removidos; inventário com 34
serviços e nenhum volume destacado. Executor homologado `6b51dd13`, origem
somente de leitura, sem migration ou seed. Às 09:35 UTC, leitura SQL confirmou
191 recibos, dois mundos, dez fotos e nenhuma sessão aberta; tabelas F5 ausentes.
As limitações de backup retido, agendado, PITR e RTO abaixo permanecem.

Repetido em **17/11/2026 às 12:38 UTC**, na preparação de 0177/0178:
[evidência](evidencias/backup-logico-2026-11-17-pre-salvamento.json).
19.202.661 bytes, 242 tabelas e 283.017 linhas; backup em 2.443 ms,
restauração/comparação em 5.870 ms e processo total em 14.274 ms.
Conteúdo e estrutura comparada idênticos. Temporários removidos, serviço
`e0a2153d-fcc8-4d39-b205-41e78bfb9062` excluído, nenhum volume destacado;
inventário novamente com 34 serviços. Executor homologado `6b51dd13`.
Origem somente de leitura, sem migration ou seed neste ensaio. Consulta prévia
confirmou dois mundos, dez fotos, sete sessões/81.920 bytes, 177 recibos,
ausência da tabela de salvamento e famílias/checkpoint desligados. O índice
regular de 0178 atua nesse volume pequeno; as migrations continuam pendentes.

Nova execução em **17/11/2026 às 09:09 UTC**, antes das migrations candidatas
0175/0176: [evidência](evidencias/backup-logico-2026-11-17-pre-checkpoint.json).
19.161.865 bytes, 241 tabelas e 282.387 linhas; backup em 2.288 ms,
restauração/comparação em 5.743 ms e processo total em 13.216 ms.
Conteúdo e estrutura comparada idênticos. Temporários removidos, serviço
`77e1ca3a-5631-4ca6-84a1-97b890fc2c3b` excluído e inventário novamente com
34 serviços, sem volume destacado. Executor homologado `6b51dd13`, origem
somente de leitura e nenhum seed/migration executado neste ensaio. As limitações
de snapshot agendado, PITR e comparação abaixo permanecem.

Repetido em **17/11/2026 às 06:19 UTC**, antes da próxima publicação do Recreio:
backup lógico atual restaurado em cluster isolado, conteúdo e estrutura comparada
idênticos, temporários removidos e serviço temporário excluído, sem volumes
destacados. [Evidência atual](evidencias/backup-logico-2026-11-17.json):
19.077.682 bytes, 231 tabelas e 281.871 linhas; 12.617 ms de processo, excluindo
build/provisionamento. Executor homologado `6b51dd13`, sem migration/seed nem
escrita na origem. A restauração de snapshots agendados continua sem prova;
este ensaio não altera PITR, agenda ou volume de produção.

Executado em 15/11/2026: **backup lógico atual restaurado e comparado em destino isolado no Railway**, com origem somente para leitura, temporários removidos e serviço do ensaio excluído. [Evidência sanitizada](evidencias/backup-logico-2026-11-15.json). A restauração dos snapshots agendados do provedor continua sem prova; PITR permanece desligado. A ferramenta auditada de restauração de um mundo e este ensaio completo têm funções distintas.

Metadados conferidos na origem: UTF8, `en_US.utf8`, provedor libc e versão de colação 2.41; extensões `plpgsql`, `pg_trgm` e `unaccent`. O destino conserva esses fatos. O comparador em `apps/recreio/scripts/backup/inventario.ts` passou nas quatro regressões entre bancos descartáveis e no ensaio real: ordem física diferente, corrupção de mesmo tamanho/contagem, perda de índice e concessão de permissão divergente. Ele pede hashes de linhas ao próprio PostgreSQL e não devolve linhas privadas nem fingerprints nas falhas. A comparação de estrutura cobre tabelas/colunas, proprietários, ACLs, índices, constraints e políticas; não certifica isoladamente todas as funções, gatilhos ou contadores de sequences do cluster.

O executor nativo em `scripts/backup/ensaiar.ts` usa a imagem `infrastructure/railway/recreio-backup.Dockerfile`: Node 24.15.0 e PostgreSQL 18.6 fixados por digest, sem migração ou seed. Passou no workflow sintético 43713604481 antes do ensaio real. A origem ficou em transação somente de leitura; o destino usou cluster e socket Unix próprios em `/tmp`, sem porta TCP. O Dockerfile não recebe conexão no build. Nenhum dump real ou segredo foi enviado ao GitHub. Não executar esse ensaio nesta máquina.

Em nova execução, exigir os gates e a pré-condição de mundo/fotografia. Criar somente um serviço temporário no projeto existente (uma réplica na região do banco, sem cron/domínio/proxy/volume, 1 vCPU e 1 GB), fixar o commit homologado e usar `RECREIO_BACKUP_ENSAIO=1` e `RECREIO_BACKUP_DATABASE_URL=${{Postgres.DATABASE_URL}}`. A ferramenta confere projeto/ambiente e hostname privado. O serviço de 15/11 foi removido depois da evidência e não deve ser tratado como infraestrutura permanente.

## Resultado real

O titular criou, jogou e saiu pelo botão do jogo. Consulta somente de leitura confirmou um mundo e cinco fotografias antes do ensaio. Fonte `0aa4c82c`, deployment `df567e47-d570-4de1-824a-09ad8f704f96`; snapshot de origem às **12:37:27.998415 UTC**. Dump de **18.725.197 bytes**, 227 tabelas e 274.493 linhas. Backup: 2.430 ms; restauração/comparação: 6.267 ms; processo total: 14.876 ms. Conteúdo e estrutura comparada idênticos, incluindo proprietários/ACLs; remoção dos temporários confirmada. O tempo não inclui provisionar/construir a imagem e não é um RTO contratual.

Serviço temporário `0097b2d7-90ee-4c33-b8ef-90bcd2844d3e` removido em seguida, sem volumes destacados; inventário do projeto voltou aos 34 serviços anteriores. Nenhuma restauração, migration, reinício ou alteração de dados foi executada na origem. Este é o backup lógico do instante acima; não substitui a prova dos backups agendados ou uma política de RPO/RTO aprovada.

## Execução prevista

1. Validar o executor com PostgreSQL descartável no GitHub, incluindo corrupção que conserva contagens, falha do dump/restauração, divergência de proprietário/ACL, exclusão dos temporários e recusa de um destino remoto. Builds, integração e cargas automatizadas permanecem fora desta máquina.
2. Conferir extensões, versão e permissões do banco real. Exigir ao menos um mundo com fotografia persistida antes de usar o ensaio como prova do Morada. A consulta das 10:45 UTC ainda tinha zero mundos; o login até a estante não satisfaz essa condição.
3. Preparar um serviço temporário no mesmo projeto Railway, com a mesma versão do PostgreSQL e Node 24.15. Sem domínio, proxy TCP, volume persistente, cron, SMTP ou outros consumidores. O PostgreSQL de destino escuta somente no loopback do próprio container. A conexão de origem chega por referência de variável, nunca no repositório, argumento de processo ou GitHub.
4. Abrir transação de origem `REPEATABLE READ READ ONLY`, exportar o snapshot, recolher fatos técnicos e gerar `pg_dump --format=custom --snapshot=...` com ferramentas da mesma versão. Conservar proprietários e ACLs. O arquivo fica com modo 0600 no armazenamento temporário do serviço, dentro do Railway.
5. Encerrar a leitura da origem assim que o dump terminar. Criar cluster descartável, senha aleatória e papéis sem login, sem copiar senhas/permissões de autenticação dos papéis reais. Restaurar com `pg_restore --exit-on-error`. Não executar migrator, seeds, jobs dos aplicativos ou corte financeiro.
6. Comparar contagens, proprietários, ACLs e conteúdo determinístico das tabelas Recreio com os fatos do mesmo snapshot. Não comparar com uma consulta posterior da origem que pode ter mudado. Impressões de conteúdo e material real ficam apenas na memória/armazenamento temporário; relatório público contém resultado, versões, contagens e durações, nunca dados, tokens ou hashes de conteúdo dos mundos.
7. Medir instante do snapshot, duração do backup, tempo até o destino validado e a janela restaurada. Uma cópia atual validada não comprova restauração dos backups agendados ou PITR. Registrar separadamente a limitação do backup diário e o teste de recuperação de mundo.
8. Encerrar o PostgreSQL descartável, remover o dump e o diretório temporário e conferir a limpeza. Registrar a evidência operacional antes de remover somente o serviço temporário criado para este ensaio. O banco, o volume e os backups existentes da origem permanecem preservados.

## Condições de aceite

- Nenhuma restauração sobre o volume/banco compartilhado, alteração de PITR ou reinício de outros aplicativos.
- Nenhum dado real ou segredo enviado ao GitHub ou gravado em artefato público. Integração no GitHub usa somente fixtures.
- Falha de backup, restauração, comparação ou limpeza produz falha operacional explícita; um processo que apenas iniciou não é prova de sucesso.
- O resultado precisa identificar precisamente qual backup foi restaurado. `pg_dump` novo não pode ser apresentado como teste de um snapshot agendado do provedor.
- Restauração dos backups agendados em destino isolado ainda exige um mecanismo de cópia suportado pelo Railway. A API consultada de `volumeInstanceBackupRestore` restaura a própria instância de volume; não é apropriada para este ensaio. Não usá-la sobre produção para obter uma aprovação de DR.

Conferência adicional em 15/11 às 17h56 UTC: o schema vivo descreve
`volumeInstanceId` como a instância **de origem**, sem argumento para destino
isolado. A [documentação oficial](https://docs.railway.com/volumes/backups#how-to-restore-a-backup)
confirma a troca de volume no serviço original e seu redeploy. O argumento
`replicaServiceIds` trata réplicas HA; não comprova uma cópia independente.
Nenhuma chamada de restauração foi executada. A API de busca recuperou as
referências, mas a leitura das páginas pelo conector falhou; a documentação
oficial foi consultada diretamente como alternativa.

## Revalidação da CLI em 16/11/2026

A CLI instalada é 5.62.1. Seu `postgres pitr backup restore` usa
`volumeInstanceBackupRestore` com a instância de origem, espera a cópia e
aplica a troca de volume/redeploy automaticamente; não usar esse comando no
Postgres compartilhado para este ensaio. O schema público foi relido somente
por introspecção: `volumeInstanceId` continua descrito como origem e não há
argumento de destino isolado. Nenhuma mutation de backup foi executada.

PITR possui uma restauração diferente, em serviço novo. Porém está desligado,
não recupera períodos anteriores à ativação e habilitá-lo cria arquivo em bucket
e reinicia a origem. Isso não é um meio de testar o snapshot agendado existente.
Não foi habilitado nem houve mudança do banco, bucket ou agenda. Continua
pendente uma cópia suportada dos snapshots ou um arquivo lógico agendado próprio
com restauração isolada verificada; não anunciar DR agendado a partir do dump novo.

Fontes: [CLI 5.62.1, implementação do restore](https://github.com/railwayapp/cli/blob/v5.62.1/src/commands/database/pitr.rs),
[API de volumes](https://docs.railway.com/integrations/api/manage-volumes#restore-from-backup),
[snapshots](https://docs.railway.com/volumes/backups#how-to-restore-a-backup) e
[PITR](https://docs.railway.com/volumes/point-in-time-recovery#restoring-to-a-point-in-time).


## Ensaio fresco de 20/11, antes do fechamento

Fonte 42f8a60c, executor qualificado nos usuários postgres/ci em **44814781248**.
Serviço temporário 49713eed-e323-4459-8f44-ae3e71bba186, deployment
6a6c6de2-b3f8-4735-96eb-cb702bd1856d, mesma região do banco, uma CPU/1 GB,
sem cron/domínio/proxy/volume. Origem somente leitura, sem migration/seed.
Snapshot em **20/11 às 20:52:30,386180 UTC**: 20.046.014 bytes, 265 tabelas e
297.166 linhas. Backup 1.833 ms, restauração/comparação 11.101 ms, total
15.432 ms. Conteúdo, estrutura e globais comparados idênticos, PostgreSQL 18.6,
um papel e três participações no inventário real; temporários removidos.

O serviço foi removido e a ausência conferida: 38 serviços, quatro volumes,
um bucket e nenhuma mudança staged. Deployments de portal/Morada/PostgreSQL
permaneceram iguais. [Recibo sanitizado](evidencias/backup-logico-2026-11-20-pre-fechamento.json).
O dump real não foi enviado ao GitHub nem guardado no bucket de homologação.
Este ensaio é lógico e transitório: não comprova custódia durável independente,
restauração de agenda ou upgrade privado do schema antigo; duração exclui
provisionamento/build e não define RPO/RTO contratual.


## Upgrade privado comprovado em 20/11

A captura real de 22:22:51 UTC foi restaurada, comparada e atualizada somente
na cópia de 204 para 244 recibos, preservando os recibos históricos e os
valores existentes conferidos. A origem continuou com 204 recibos e dois
mundos/dez fotografias. Serviço/temporários removidos e ausência confirmada.
A divergência histórica de dois SQLs foi explicada pelo Git, sem reescrever
recibos ou reaplicar o DROP antigo. [Caminho e limites da prova](upgrade-privado-2026-11-20.md)
e [recibo real](evidencias/upgrade-privado-producao-2026-11-20.json).
Custódia cifrada durável, agenda e recuperação completa F7/F8 ainda pendentes.
