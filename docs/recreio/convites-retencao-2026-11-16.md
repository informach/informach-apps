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


## Geração e limites da candidata

A geração `43863187650` sobre `5fe7922b` produziu somente
`0164_needy_moira_mactaggert.sql`, snapshot 0164 e journal com 165 entradas.
SHA-256 do SQL: `f7cc957f0ec1217f8fc1e30ce1e7970796a6499635116cfe9f114b0d3bf187f7`.
Arquivo e metadados foram copiados do artefato com seus hashes conferidos.
Comparação completa com o snapshot anterior identificou somente o novo índice;
o prefixo de 164 entradas do journal está idêntico. SQL gerado não foi editado.

O cliente operacional do migrator usa startup parameters do Postgres.js 3.4.9:
uma conexão, conexão em até 15 s, espera de trava em até 1 s e instrução em até
60 s. Compatível com PG 16/18; sem transaction_timeout global e sem novo flag de
corte. Erros desconhecidos emitem somente classificação; URL, SQL e parâmetros
não são impressos. Mensagens controladas de histórico/corte permanecem disponíveis.

A integração usa o mesmo cliente em DDL bloqueado e verifica rollback e retomada,
além de presença/validade do índice gerado. As tabelas de prova são exclusivamente
do banco descartável. O escritor de limpeza fica em candidata separada,
sem habilitação nesta entrega.

## Gates aprovados para a etapa do índice

A fonte `892f8571` passou nos seis gates `43866074913` e no CI geral
`43866074845`. O conjunto com a página de participações próprias (`1935b078`)
passou nos seis gates `43874709358`: 237 integrações, nove jornadas e dois
casos reservados a outros executores. O código de banco é idêntico a `892f8571`;
o código do portal é idêntico a `9f9f9e3a`. O escritor de limpeza não faz parte
dessa entrega e o índice ainda precisa de sua conferência de produção.

## Índice em produção

Fonte `26a2316b`: migrator `894273a8-7cc6-4fa3-95cf-eb02e5f30822`
SUCCESS, Drizzle concluído às 13:38:58.156 UTC e seeds às 13:39:03.938 UTC.
Consulta somente de leitura às 13:42:07 UTC confirmou 165 recibos,
`when=1794830662795` e o índice parcial válido/pronto com `(expires_at,id)`
e predicado `state <> 'accepted'`. Zero convites; 40.960 bytes com índices.
Não houve exclusão de convites nessa etapa. Configuração do migrator idêntica,
sem alterar o flag Compasso. As prontidões dos nove apps web responderam 200.
O escritor continua em candidata própria e exige nova conferência integrada.
[Prova operacional](evidencias/indice-participacoes-producao-2026-11-16.json).

## Candidata do escritor, separada da implantação do índice

A rotina acrescenta `convitesApagados` ao resumo do job, depois das quatro
etapas existentes. Apaga no máximo 500 por instrução, com prazo estável,
ordenação por vencimento/UUID, SKIP LOCKED e repetição das condições no DELETE.
A transação limita instrução a 5 s, espera de trava a 1 s e duração a 15 s.
Erro aborta o lote e mantém a resposta 503 do job; etapas anteriores podem
ter concluído e continuam idempotentes. Não há auditoria de conteúdo na limpeza;
o registro operacional do job conserva somente contagens/classificação.

Seis casos novos no PostgreSQL descartável cobrem lote/ordem/prazos, convite
aceito e membro preservados, código antigo recusado antes/depois, duas execuções
com 250 linhas travadas, erro real de DELETE e retomada HTTP, e EXPLAIN da
consulta efetiva com 20 mil convites futuros. EXPLAIN não executa a exclusão.
A fonte inicial foi homologada abaixo. O conjunto integrado à nova main ainda exige sua rodada remota e não está habilitado em produção.
Publicá-la somente depois de confirmar o recibo 165 e o índice válido/pronto.

A candidata `79a9504f` passou nos seis gates `43869499608`. Integração:
229 testes, incluindo os seis casos novos, sem falhas. O plano da consulta
efetiva usou faixa do índice no volume sintético; o DELETE continuou limitado,
e a falha real chegou ao HTTP seguida de retomada. A execução não altera o
banco de produção e não demonstra capacidade do serviço Railway.
[Evidências das candidatas](evidencias/convites-candidatas-2026-11-16.json).
