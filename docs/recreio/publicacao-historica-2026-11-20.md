# Consentimento publicado com confirmação SQL perdida

Incremento F7 independente do Morada. A recuperação já retoma operações
admitidas antes do backup. Falta o caso em que o livro externo confirmou a
intenção, mas o commit SQL da admissão não aconteceu: o dump ainda contém
`publishing`. Repetir o consentimento ou tratar esse estado como ausência
perderia a decisão original.

## Implementação e prova

1. A fábrica privada confere também as publicações nativas pendentes que
   pertencem ao prefixo externo completo. Guarda correspondência somente na
   capacidade privada, após verificar preparação, MAC, plano, seleção e mapa
   atuais. Operação sem referência externa, em revisão ou de encerramento
   financeiro não recebe essa autorização.
2. A admissão fixa trava preparação, execução, avaliação e operação. Reconcilia
   somente `publishing` nativo com os campos de admissão ainda nulos. Conserva
   a preparação, os bytes assinados, o ator e as datas de autenticação e aceite.
   A confirmação SQL recebe a cerca histórica conferida e a data da confirmação
   atual; não inventa uma admissão anterior. Auditoria e recibo da avaliação
   são atômicos com a transição. Nenhum novo consentimento ou escrita no livro.
3. Repetição preserva os campos e não remove a posse de um worker novo.
   Escopo copiado, fonte/plano/mundo divergente, cabeçalho alterado e falha de
   auditoria devem recusar ou reverter antes de permitir os efeitos privados.
4. A fixture GitHub cria o consentimento pelos serviços nativos, confirma o
   livro e provoca rollback da confirmação SQL por auditoria estrita. Captura
   o estado pendente, descarta a origem e reconcilia em cluster frio. Reaplica
   os workers reais, prova ausência do alvo, preservação de terceiro e datas,
   repetição e conclusão técnica da avaliação.

Verificações pesadas somente no GitHub: qualidade, direitos, captura nativa e
cluster externo; nenhum dado ou credencial real na fixture. Publicar candidata
sem ativar serviços. Gates desta implementação ainda pendentes.

Não fecha finanças, identidade atual, custódia produtiva, retomada/publicação
seletiva ou as duas recuperações completas F7. Produção mantém 204 recibos;
o backup manual pré-migração foi recusado pelo limite de cópias do provedor.


## Primeira rodada

1faf0746 passou direitos 44841033151 e captura nativa 44841036341. O cluster
externo 44840684459 confirmou os cinco resultados da publicação pendente,
restauração fria e limpeza, mas a rodada inteira falhou na contagem final
de objetos da fixture, ainda fixada em nove para dois consentimentos. O
terceiro consentimento acrescenta intenção/plano/histórico; a conferência
passa a exigir exatamente doze objetos de direitos, preservando os quatro
objetos de foto/arquivo e os três prefixos. Nenhuma regra produtiva foi
relaxada; repetir a rodada completa antes de qualificá-la.


## Cluster frio e inventário qualificados

4b852101 passou o cluster externo 44841477078 e a captura nativa 44841484383.
Foram conferidos doze objetos de direitos (três intenções, três planos, cinco
históricos e cabeçalho), quatro objetos de foto/arquivo, privacidade e limpeza.
A recuperação confirmou a publicação pendente, rollback da auditoria, origem/
datas, ausência de novo consentimento e preservação de terceiro. Os cenários
anteriores de retirada posterior à captura e operação nativa parcialmente
executada continuam exigidos, com verificação terminal das três operações.
[Recibo e hash do artefato](evidencias/publicacao-pendente-cluster-frio-44841477078.json).
Qualidade 44841480696 e os dezesseis gates 44840684445 passaram.
Nenhuma dessas provas liquida financeiro ou autoriza tráfego/publicação.
