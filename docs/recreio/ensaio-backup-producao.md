# Ensaio de restauração do backup de produção

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
