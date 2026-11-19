# F7 — preparação persistida de direitos

Estado: candidata em implementação, ainda sem migration gerada ou gate próprio.
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

Migration será gerada exclusivamente pelo workflow `db-generate.yml`; nenhum
SQL/snapshot/journal foi escrito manualmente. Gates PostgreSQL e qualidade
precisam comprovar autoridade, conta sem jogador, preservação de terceiros,
limite, contexto infantil e rollback de auditoria.
