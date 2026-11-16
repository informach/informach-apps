# Saída voluntária de um convidado: contrato do incremento

Em implementação; testes e builds somente no GitHub. Este incremento não conclui A6.

## Comportamento

O adulto, em seu próprio perfil e aparelho autenticado, confirma a saída de um mundo em que participa como membro ou coadministrador. O direito comercial de jogar não é pré-condição para sair. A linha vira `former`, com `left_at`, e todas as sessões desse perfil já vinculadas ao mundo são encerradas como `left` na mesma transação. O host recebe o cursor de encerramentos existente. Personagens, diário, fotografias, finanças e permissões dos outros membros permanecem no mundo.

Repetir a saída confirmada devolve sucesso sem repetir a auditoria. Mundo ausente, alheio ou excluído recebe a mesma recusa. O responsável precisa do futuro fluxo de sucessão com aceite; a saída não escolhe automaticamente outra pessoa. Reingresso exige um convite novo e conserva a identidade da linha de participação; uma sessão encerrada continua encerrada.

## Autoridade e concorrência

- Derivar conta, perfil e aparelho da sessão confiável; a tela fornece somente o mundo. Exigir perfil adulto próprio ativo e aparelho de conta atual, não revogado nem vencido, relendo prazo depois das travas.
- Limitar consultas/travas/transação como a gestão de aparelhos: 5 s/1 s/15 s.
- Perfil e aparelho ficam sob `SHARE`, conservando a autoridade sem bloquear leitores ou FKs. Depois mundo `UPDATE`, membro, cursor de encerramentos e sessões. Não tomar o cursor antes da autoridade. A participação própria é sondada antes da trava do mundo para não disputar um mundo alheio e relida depois da trava.
- A entrada no mundo já toma `UPDATE` do mundo em `conferirPosse`, antes de ler a participação e vincular a sessão. A saída usa a mesma trava. Assim uma entrada que esperou a saída relê a participação e falha; uma admitida primeiro fica vinculada antes de a saída encerrar suas sessões. Nenhuma mudança nessa admissão é necessária.
- Auditoria estrita de saída e de encerramento no mesmo commit; falha conserva participação e sessões. Nenhuma exclusão ou alteração de schema.

## Entrega e prova exigidas

1. Repositório/serviço/ação com guardas e revogação atômica; evento tipado e nomes legíveis nos Bastidores.
2. Confirmação acessível na página do mundo para participantes elegíveis, com consequência explícita e cancelamento; retorno à estante. Essa página hoje lista somente membros ativos; a gestão de participações afastadas/sem acesso continua parte de A6.
3. PostgreSQL descartável: saída sem concessão comercial, idempotência/concorrência, ausência de autoridade, responsável recusado, escopo, conservação dos demais dados, auditoria que falha e retomada, corrida com admissão e convite novo sem ressuscitar sessão encerrada.
4. Jornada com dois navegadores: convidado sai, desaparece da lista, sessão antiga é recusada e o responsável continua. Gates dos consumidores de auth e seis gates do Recreio antes da integração. Registrar implantação e limites separadamente.

Saída do responsável, sucessão aceita, remoção por outro adulto, arquivamento, exportação/exclusão e proteção familiar continuam pendentes. Não anunciar A6 ou as cinco frentes concluídas.
