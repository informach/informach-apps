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
