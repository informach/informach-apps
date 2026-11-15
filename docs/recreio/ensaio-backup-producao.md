# Ensaio de restauração do backup de produção

Preparação em 15/11/2026. Execução e aceite ainda pendentes; acompanhar o [registro](execucao-2026-11-15.md). O PostgreSQL compartilhado usa 18.6; possui backups diários, semanais e mensais, com PITR desligado. A ferramenta auditada de restauração de um mundo e este ensaio completo têm funções distintas.

Metadados conferidos na origem: UTF8, `en_US.utf8`, provedor libc e versão de colação 2.41; extensões `plpgsql`, `pg_trgm` e `unaccent`. O destino precisa conservar esses fatos. O comparador em `apps/recreio/scripts/backup/inventario.ts` está em preparação, com quatro regressões entre bancos descartáveis: ordem física diferente, corrupção de mesmo tamanho/contagem, perda de índice e concessão de permissão divergente. Ele pede hashes de linhas ao próprio PostgreSQL e não devolve linhas privadas nem fingerprints nas falhas. Isso ainda não executa `pg_dump`/`pg_restore` nem comprova um backup real.

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
