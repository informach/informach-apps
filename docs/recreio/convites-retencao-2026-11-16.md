# Convites sem aceite: retenção e implantação em duas etapas

Em preparação. Testes, builds e geração de migração no GitHub. Não conclui A7.

## Fatos conferidos

Em 16/11 às 11:51 UTC, produção tem os 164 recibos esperados pelo journal,
último `when=1794482118133`, tag `0162_military_dexter_bennett` no índice 163.
Prontidão do portal responde 200. `space_invites` tem zero linhas e ocupa
32.768 bytes com índices. O migrator já admite migrações posteriores a esse
lote sem mudar `COMPASSO_CUTOVER_RELEASE`; não alterar a trava do corte.

## Contrato de retenção

Preservar convites `accepted`: são evidência de ingresso e podem conservar a
participação original, mesmo depois de uma nova entrada do mesmo membro.
A6 ainda precisa fechar o contrato dessa evidência. Não apagar membros,
concessões, sessões, cursores, mundos ou auditoria neste incremento.

A limpeza futura seleciona no máximo 500 convites sem aceite, com vencimento
anterior a um dia, por prazo e UUID. Trava apenas candidatos com SKIP LOCKED
e repete estado/prazo na exclusão. Para o corte dessa limpeza, usar
statement_timestamp estável na instrução, permitindo o limite do índice;
autorizações continuam usando relógio atual depois das travas. Registrar
contagem e falha de etapa, nunca código, hash ou conteúdo de participação.

## Etapa 1: índice e migração

Índice parcial `(expires_at, id)` para `state <> 'accepted'`, gerado pelo
script do projeto, sem editar SQL ou snapshots gerados. Revisar somente esse
DDL. O migrator deve ter limite de espera por trava e de execução por instrução,
compatíveis com PostgreSQL 16/18, testados com conexão real e DDL disputado.
A configuração de conexão vale desde a abertura de cada conexão, inclusive
reconexão, sem depender de SET em uma conexão devolvida ao pool.

Homologar antes da main. Confirmar migrator, índice válido e prontidão dos
consumidores antes de publicar o escritor da limpeza. A tabela medida é pequena;
CREATE INDEX comum toma SHARE de tabela e precisa abortar em contenção, não
aguardar uma transação indefinidamente. O rollback do app conserva o índice.
Nenhuma transformação de dados ou ativação comercial é parte dessa etapa.

## Etapa 2: manutenção

Depois do índice implantado, adicionar a limpeza ao job já autenticado, com
lote, timeout e HTTP de falha. Provar fronteiras de prazo, conservação dos
aceitos, código antigo recusado, concorrência/linhas retidas, falha real de
exclusão e retomada. Conferir plano com volume sintético no GitHub e executar
somente consultas de metadados em produção. Registrar o cron automático.

A definição de retenção dos aceitos, negativos de aparelhos, encerramentos,
possessões e instâncias continua pendente em seus contratos próprios.
