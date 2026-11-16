# Retenção técnica: inventário anterior à limpeza

A7 continua aberto. Leitura do schema e dos escritores em 16/11/2026; nenhuma
linha de produção foi apagada por esse levantamento. Referências principais:
`packages/db/src/schema/recreio.ts` e os repositórios de `sessao`,
`sessao-de-jogo`, `posse` e `mundos` do portal.

| Tabela | Situação e dependências que a limpeza deve respeitar |
| --- | --- |
| `game_tickets` | Em produção, remoção de todos os ingressos vencidos há mais de um dia, com retorno dos IDs. Candidata abaixo limita o lote e retorna somente contagem. O índice `recreio_game_tickets_expires` já existe; nenhuma migration necessária para este incremento. |
| `game_sessions` | `ended_seq` alimenta o cursor de encerramentos do host. Não apagar sessões abertas nem encerramentos ainda necessários para revogar tokens/conexões. Manter ordem e um topo monotônico após compactação; uma sequência PostgreSQL não substitui a confirmação ordenada das transações. |
| `device_sessions` | O login carrega ou cria por `auth_session_id`. A linha revogada funciona como uma negativa persistida: apagá-la enquanto o login ainda for aceito poderia criar outra sessão de aparelho para o mesmo login. A expiração copiada pode estar antiga, pois uma linha revogada não é renovada. Também há cascata para ingressos e sessões de jogo. |
| `space_invites` | Código é hash único; aceite trava mundo antes de convite. Convite aceito ou vencido não pode voltar a valer. A autoria fica também em `space_members.invited_by_member_id` e nos eventos de auditoria; não inferir que a linha do convite seja a única evidência de participação. |
| `game_instances` | `gone` é recuperável: um batimento pode trazer a instância de volta. `started_at` delimita a primeira leitura dos encerramentos. Não tratar ausência de batimento como prova de inexistência definitiva ou apagar instância ativa/em drenagem. |
| `space_leases` | Posses abertas sustentam a cerca do mundo. A época cresce em `spaces.lease_epoch`, sem depender de `max(fence)`. Posses encerradas conservam segundos e pico de jogadores, necessários à medição de uso/custo antes de qualquer agregação ou remoção. |
| `entitlements` | Concessões auditadas, não cache. A revogação é conservada; não incluir na limpeza técnica por prazo de acesso. |
| `spaces`, membros, fotografias e diário | Dados compartilhados e recuperação de mundo. A6 deve definir saída, sucessão, exportação e exclusão; não entram numa limpeza de sessões/convites. |
| `audit.events` | Retenção padrão de cinco anos e contrato próprio em `docs/audit-payload-policy.md`. Sem exclusão oportunista pelo cron do Recreio. |

## Contratos a implementar antes de habilitar

1. Separar prazo de validade da credencial, janela de revogação, dados de uso
   agregados e evidência de auditoria. Registrar prazos técnicos como política
   versionada, com finalidade e dependências explícitas por tabela.
2. Definir um critério comprovável de encerramento do login antes de retirar
   sua negativa persistida. Leitura de Redis que falha deve falhar o job, sem
   ser convertida em ausência. Cobrir renovação concorrente e login ainda
   válido depois da expiração copiada na linha revogada.
3. Definir compactação de encerramentos que conserve revogação e monotonia
   do cursor. Cobrir transação de encerramento não confirmada, duas instâncias
   em cursores diferentes, reconexão e primeira leitura após a compactação.
4. Limitar cada lote, ordenar por prazo/ID e não aguardar indefinidamente
   linhas disputadas. Preservar as travas de mundo/conta dos escritores e
   revalidar o predicado de elegibilidade na exclusão. Índices e migrations
   seguem o fluxo compartilhado do banco; não aplicar DDL avulso.
5. Ensaiar idempotência, concorrência, interrupção e continuação no PostgreSQL
   descartável do GitHub. O HTTP deve falhar quando a etapa falhar; registrar
   apenas contagens e estado operacional. Repetir os gates do portal e as
   provas de revogação antes da implantação.

A7 permanece aberto; a implementação precisa dos contratos acima, sem usar
apenas `expires_at`, `gone` ou `released_at` como critério de remoção.

## Primeiro incremento: ingressos, em verificação

Mantém a política existente de um dia depois do vencimento, usados ou não.
Cada chamada seleciona até 500 linhas por prazo e UUID, com `FOR UPDATE SKIP
LOCKED`, e exclui no mesmo comando. A exclusão repete o predicado temporal;
o processo recebe somente a contagem. Um prazo de execução de 5 s limita a
consulta; erro interrompe a etapa e chega ao HTTP 503/registro de falha do job.
Não converte contenção ou erro em prova de limpeza completa. O cron seguinte
retoma o que sobrou; zero pode significar que outra transação segura as linhas.

Testes novos em PostgreSQL descartável cobrem mais de um lote, ordem de prazo,
usados/não usados, conservação dos recentes/válidos, duas execuções enquanto
250 linhas estão travadas e erro real de exclusão pelo HTTP seguido de retomada.
Os testes pesados rodam no GitHub; resultados e implantação abaixo.
Este incremento não remove sessões, cursores, negativos de revogação ou mundos,
nem encerra A7. Referência SQL: [DELETE em lotes](https://www.postgresql.org/docs/18/sql-delete.html).

## Implantação do primeiro incremento

Fonte isolada `7f9b2b0a`, seis gates `43803801642` e repetição main
`43804734967` aprovados. Integração: 175 testes, incluindo os três novos casos
de lotes/concorrência/falha. Portal implantado no Railway:
`7a757f0c-a1cb-4ef9-9b55-1cb10525906d`, fonte e saúde/prontidão 200 conferidas
em 16/11. Morada conserva `22a3db6`, Mundo V2, protocolo 1 e arte D2.

Consulta somente de leitura confirmou a execução automática da manutenção
às **04:45:04,759 UTC**, término **04:45:04,882 UTC**, `ok=true`, quatro
contagens zero. Isso comprova execução após a ativação, sem inferir ausência
global de linhas disputadas ou carga de 500 remoções em produção. Os mapas do
portal foram enviados ao Sentry no build, confirmação às 04:34:33,912 UTC;
release `7f9b2b0a` presente. Nenhum orçamento de monitoração alterado.

Após o incremento de prazos HTTP, os dois serviços foram recompilados em
`d13038b7`; a fonte do jogo continua idêntica a `22a3db6`. Arte D2/V3 e hash
relidos no processo ativo, e cron automático às 05:15 UTC confirmado.
[Operação dos prazos](prazos-navegador-2026-11-16.md). A7 continua aberto para
a retenção das demais tabelas e medição em rede/banco.
