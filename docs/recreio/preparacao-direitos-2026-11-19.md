# F7 — preparação persistida de direitos

Estado: candidata em implementação. Migration 0224 gerada e adotada intacta;
gates próprios ainda pendentes.
Não é consentimento, exportação integral, exclusão ou liberação de tráfego.

O pedido distingue retirar um perfil e encerrar a participação no Recreio.
A seleção é explícita, ordenada e sem repetição; somente o adulto próprio ou
o responsável atual pelo menor pode preparar. Encerramento exige conferir
todo o conjunto atual de perfis próprios/responsabilidades. Conta sem jogador
pode preparar um escopo vazio. Cobrança e identidade global ficam separadas.

O repositório persiste a prévia e seu SHA por trinta minutos, com até três
prévias abertas por conta. Perfis e responsabilidade são relidos sob as travas
nativas; login recente é conferido após esperas/auditoria. Mundos incluem
autoria, responsabilidade e participação anterior, com revisão/cerca/gestão
e contagem dos demais participantes; não copiam nomes, resumo ou conteúdo.
A prévia não congela esses mundos: confirmação/executor ainda devem reconstruir
o escopo sob as travas apropriadas e recusar divergência.

Cancelamento é idempotente e restrito à própria prévia/hash, com auditoria
atômica. A linha não é capacidade destrutiva. Não há endpoint, publicação de
intenção externa, corte de sessão, transferência ou limpeza neste incremento.

Migration 0224 gerada exclusivamente pelo workflow `db-generate.yml`, rodada
`44526938362`/`c9ea06d7`, e adotada intacta após ZIP/SHA, proveniência,
predecessor e igualdade de todas as tabelas anteriores. São 69 tabelas/148 FKs
Recreio e 225 recibos. Nenhum SQL/snapshot/journal foi escrito manualmente. Gates PostgreSQL e qualidade
precisam comprovar autoridade, conta sem jogador, preservação de terceiros,
limite, contexto infantil e rollback de auditoria.


## Rodada inicial e ampliação nativa

Quality `44526944134`/`c9ea06d7` concluiu com sucesso. A integração
`44527978489`/`2aea9b3f` executou 1324 cenários PostgreSQL: 1323 passaram
e um revelou contagem incorreta de outros participantes. SQL interpolado no
campo de seleção de tabela única teve a referência externa desqualificada
pelo builder. O contador correlacionado nativo `$count` substitui essa expressão;
o teste que exige preservar o outro participante foi mantido sem afrouxamento.
A nova fonte ainda requer verificação.

A ampliação usa `pedidoId` estável e revalida autoridade antes de recuperar a
mesma prévia: replay não cria outra linha/evento, não renova prazo e não reabre
cancelamento. Plano antigo permanece imutável; alteração de versão/dependência
é mostrada como desatualizada. Identificador alheio ou seleção divergente recusa.

`/conta/dados` apresenta os perfis pessoais atuais e prévias recentes da própria
conta, sem exigir assinatura ou jogador. Preparar/cancelar usa ações nativas com
login recente. Conta sem jogador, menor sob responsabilidade atual e negativa de
contexto pareado têm jornadas de navegador preparadas para GitHub Actions. A
tela informa explicitamente que não existe execução de exclusão neste incremento;
nenhuma intenção externa ou consentimento destrutivo foi exposto.


A fonte `e33c2d30` aprovou quinze dos dezesseis gates em `44531301242`,
incluindo integração com o contador corrigido, mas o E2E recusou dois cenários
novos. Cancelamento passava a prévia inteira para um contrato estrito de duas
referências; a UI foi corrigida para projetar somente ID/hash, sem afrouxar o
servidor. O seletor passou a ter associação explícita label/id, tema coerente e
espera pelo estado habilitado público (já condicionado à hidratação), em vez de
inspecionar propriedade interna do React. Capturas sintéticas foram examinadas;
a nova fonte exige nova rodada. Não houve promoção de fonte reprovada.


`aa95fb7b` concluiu os dezesseis gates em `44535164302`: 1330 integrações
PostgreSQL, dezesseis cenários de captura, cinco HTTP e 44 E2E comuns.
Os dois cenários de direitos passaram; captura mobile de 390 px conferida,
ZIP/SHA verificados. A simulação aprovou 252 casos, incluindo catorze novos
do adapter. [Recibo da fonte](evidencias/rodada-integral-44535164302.json).
O CI compartilhado dessa fonte é separado; não inferir seu resultado.

Na ampliação seguinte, o SHA do plano completo continua sendo conferido, mas
a comparação de desatualização considera pessoas/autoridade/vínculos/gestão.
Checkpoint, diário e troca de posse não invalidam consentimento sobre a mesma
participação: o executor precisará recapturá-los sob trava. Mudança de perfis,
responsabilidade, mundo, gestão ou outros participantes exige nova prévia.
O índice de mundos visitados amplia a descoberta sem conceder acesso.
