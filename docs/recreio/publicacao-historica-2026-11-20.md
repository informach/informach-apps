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
