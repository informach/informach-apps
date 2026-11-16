# Saída voluntária de um convidado: contrato do incremento

Em implementação; testes e builds somente no GitHub. Este incremento não conclui A6.

## Comportamento

O adulto, em seu próprio perfil e aparelho autenticado, confirma a saída de um mundo em que participa como membro ou coadministrador. O direito comercial de jogar não é pré-condição para sair. A linha vira `former`, com `left_at`, e todas as sessões desse perfil já vinculadas ao mundo são encerradas como `left` na mesma transação. O host recebe o cursor de encerramentos existente. Personagens, diário, fotografias, finanças e permissões dos outros membros permanecem no mundo.

Repetir a saída confirmada devolve sucesso sem repetir a auditoria. Mundo ausente, alheio ou excluído recebe a mesma recusa. O responsável precisa do futuro fluxo de sucessão com aceite; a saída não escolhe automaticamente outra pessoa. Reingresso exige um convite novo e conserva a identidade da linha de participação; uma sessão encerrada continua encerrada.

## Autoridade e concorrência

- Derivar conta, perfil e aparelho da sessão confiável; a tela fornece somente o mundo. Exigir perfil adulto próprio ativo e aparelho de conta atual, não revogado nem vencido, relendo prazo depois das travas.
- Limitar consultas/travas/transação como a gestão de aparelhos: 5 s/1 s/15 s.
- Perfil e aparelho ficam sob `SHARE`, conservando a autoridade sem bloquear leitores ou FKs. Depois mundo `UPDATE`, membro, cursor de encerramentos e sessões. O prazo é relido depois dessas esperas e antes de alterar a participação. Não tomar o cursor antes da autoridade. A participação própria é sondada antes da trava do mundo para não disputar um mundo alheio e relida depois da trava.
- A entrada no mundo já toma `UPDATE` do mundo em `conferirPosse`, antes de ler a participação e vincular a sessão. A saída usa a mesma trava. Assim uma entrada que esperou a saída relê a participação e falha; uma admitida primeiro fica vinculada antes de a saída encerrar suas sessões. Nenhuma mudança nessa admissão é necessária.
- Auditoria estrita de saída e de encerramento no mesmo commit; falha conserva participação e sessões. Nenhuma exclusão ou alteração de schema.

## Entrega e prova exigidas

1. Repositório/serviço/ação com guardas e revogação atômica; evento tipado e nomes legíveis nos Bastidores.
2. Confirmação acessível na página do mundo para participantes elegíveis, com consequência explícita e cancelamento; retorno à estante. Essa página hoje lista somente membros ativos; a gestão de participações afastadas/sem acesso continua parte de A6.
3. PostgreSQL descartável: saída sem concessão comercial, idempotência/concorrência, ausência de autoridade, responsável recusado, escopo, conservação dos demais dados, auditoria que falha e retomada, corrida com admissão e convite novo sem ressuscitar sessão encerrada.
4. Jornada com dois navegadores: convidado sai, desaparece da lista, sessão antiga é recusada e o responsável continua. Gates dos consumidores de auth e seis gates do Recreio antes da integração. Registrar implantação e limites separadamente.

Saída do responsável, sucessão aceita, remoção por outro adulto, arquivamento, exportação/exclusão e proteção familiar continuam pendentes. Não anunciar A6 ou as cinco frentes concluídas.


## Primeira candidata e revisão do vencimento

A candidata `bccc185d` passou na integração, mas qualidade e builds recusaram
`Promise.withResolvers` no teste: o alvo de tipos do projeto é ES2022. A barreira
foi reescrita com o construtor Promise, sem alterar a configuração compartilhada.
A revisão também move a última conferência de prazo para depois das travas de
mundo, membro, cursor e partidas. Os testes novos seguram cada trava no banco,
aguardam o vencimento real e exigem recusa sem saída ou encerramento parcial.
Resultados da continuação ainda precisam ser registrados. Nada deste incremento
foi ativado em produção.


A rodada `43855646492` aprovou cinco gates, incluindo 220 integrações. A nova
jornada de navegador parou antes de aceitar o convite: o documento da estante
fora carregado antes da concessão do fixture. A captura confirmou a mensagem
“Acesso por convite da equipe”, sem campo de convite. A continuação navega
novamente para a estante depois da concessão, seguindo a jornada existente;
sem alterar o produto, o helper global, seletores ou prazos. Ainda falta provar
a saída na jornada completa. Os catorze tipos passaram em `43855245767` sobre
`307740bb`; as mudanças posteriores até este ponto são teste de navegador e
este registro, com código de produção idêntico.


## Candidata aprovada para implantação

Código `bfd587a0e30f1937786cd47dea536d6931d97c52`: seis gates
`43857336365` aprovados. PostgreSQL: 220 testes, dezenove novos. Navegador:
oito jornadas aprovadas, dois casos reservados aos outros executores. A jornada
nova levou 21,2 s no total (não é latência de revogação): cancelou a confirmação,
conservou o jogo, confirmou a saída em outra aba, observou o encerramento pelo
batimento e continuou somando como responsável. A tentativa posterior do
convidado de reabrir o mundo foi recusada.

Tela sintética de confirmação inspecionada: consequência, participantes,
cancelamento e confirmação legíveis. Catorze tipos aprovados em `43855245767`
sobre `307740bb`; `git diff` até `bfd587a0` confirma somente mudanças no teste
de navegador e neste documento. O código dos produtores/consumidores é idêntico.
A implantação ainda precisa de sua prova própria; não modificar contas piloto
para simulá-la e não anunciar A6 concluído.

[Prova estruturada](evidencias/saida-candidata-2026-11-16.json).
