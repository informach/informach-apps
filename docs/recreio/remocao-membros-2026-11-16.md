# Remoção de membro pelo responsável: próximo incremento A6

Em preparação, sem publicação. Parte da autorização das cinco frentes e de
corrigir todos os achados. A transferência aceita não conclui continuidade,
privacidade ou proteção familiar. Manter Mundo V2/protocolo 1/arte D2 e não
misturar a candidata D3. Testes e builds somente no GitHub.

## Contrato

Somente o responsável adulto atual pode encerrar a participação de outro
membro de seu mundo, com login nativo recente vinculado ao aparelho atual.
A operação não depende da cobertura comercial nem exige que o destinatário
continue ativo ou tenha perfil. Não remove a si próprio nem o responsável;
a saída própria e a transferência aceita continuam sendo operações distintas.
O vínculo histórico, seus IDs, a autoria, os moradores, o diário, o progresso
e a identidade das outras pessoas permanecem. Não excluir conteúdo nem
credenciais globais. Uma remoção não cancela assinatura ou concessão comercial.

A mudança de estado e prazo do membro, o cancelamento de propostas pendentes,
o encerramento das partidas desse perfil somente nesse mundo e os eventos de
auditoria são atômicos. Usar o motivo já implantado `permissions_changed`.
O ator é o adulto que removeu, e a conta afetada permanece no `targetId` das
partidas. Repetição sem novo ingresso não gera outro evento. A admissão e a
reentrada precisam continuar recusando o membro encerrado.

A autoridade e os prazos são relidos depois das travas: perfis em ordem,
aparelho, mundo, membros em ordem, pedidos pendentes, cursor e partidas.
Conservar limites locais de declaração, espera e transação. Não tomar travas
de perfil depois de travar o mundo. Reutilizar o contrato de prova nativa da
gestão do mundo, sem campos de autoridade vindos do navegador.

## Execução e prova

1. Extrair apenas o contexto compartilhado de gestão, preservando o contrato
   da responsabilidade e suas 29 regressões. Adicionar o escritor de remoção
   e seu evento estrito/classificador no Bastidores, sem acesso a conteúdo.
2. PostgreSQL descartável: escopo e autoridade negativa, alvo suspenso/sem
   perfil, retirada de proposta, fim somente das partidas afetadas, ator
   correto, repetição, rollback real da auditoria, concorrência com aceite e
   saída e prazos vencendo enquanto esperam. Recusar um ID de outro mundo.
3. Painel paginado do próprio responsável, confirmação com consequência
   explícita, cancelamento e retorno. Não publicar e-mails ou dados comerciais.
   Provar duas contas em navegador, recusa de reentrada e mundo preservado,
   além de teclado/celular e ausência de rolagem horizontal.
4. Seis gates do Recreio e consumidores de auth atingidos; revisão do diff e
   publicação limitada. Conferir fonte, configuração, prontidão, mapas e cron
   após implantar. Não reexecutar testes pesados nesta máquina.

Arquivamento, exportação/exclusão, menores, supervisão e encerramento global
continuam fora deste incremento e permanecem pendências explícitas de A6/A5.

## Revisão dos convites anteriores

A fonte `e94a1d1a`, run `43922914708`, reproduziu três falhas: convite anterior
à remoção readmitia o perfil; convites do antigo responsável sobreviviam à
troca e à volta de papel; o aceite não relia a autoridade do emissor. As três
promessas resolveram quando deveriam recusar, com 318 integrações aprovadas.
A correção ainda precisa de gates e publicação.

A troca e a remoção preparam as travas dos convites não usados do membro antes
do cursor. Somente depois dos prazos revalidados os revogam, com evento estrito
na mesma transação. Repetição de recibo não repete a ação. Aceites históricos e
convites de outro mundo ficam preservados. O aceite exige emissor que continua
membro ativo e responsável, conferido sob a trava do mundo. Um reingresso exige
convite emitido após a saída/remoção. A comparação dos tempos fica no PostgreSQL,
sem perder microssegundos em JavaScript; emissão e validade usam o relógio real
após as travas. Vínculo histórico sem data de saída não ganha data inventada.

A candidata da interface `65895f48` passou 318 integrações e a jornada nova no
navegador. Qualidade falhou na formatação da inserção sintética paginada; foi
corrigida antes de `e94a1d1a`. Isso não era falha da aplicação em produção.
