# Resultado do envio de observabilidade no encerramento

Correção verificada no GitHub, ainda sem implantação. O SDK `@sentry/node` 10.76.2 devolve um booleano de `flush`; resolver
a promessa não significa que a fila terminou. O adapter anterior aguardava a
promessa e ignorava esse resultado. O encerramento já tratava rejeições, mas
não recebia como falha o timeout que o SDK representa por `false`.

A candidata lê o cliente configurado e conserva o limite de dois segundos.
Sem cliente configurado, conclui sem envio. Um `false` vira erro operacional
fixo e segue pelo encerramento existente: salvamento é tentado, observabilidade
é concluída dentro do prazo total de 25 s e a falha chega à saída 1. Não muda
os classificadores/payloads, não amplia orçamento ou ativa monitores pagos.

O teste usa o SDK e o transporte HTTP reais contra um receptor em loopback no
executor GitHub. Confere fila concluída, conteúdo sanitizado e uma requisição
sem resposta que excede o prazo. Não usa DSN de produção nem mock do SDK. A
prova é de drenagem da fila, não garantia de entrega de e-mail pelo provedor.

O gate de qualidade `43911549761`, fonte `e738760d`, reproduziu o defeito:
o teste do timeout resolveu `undefined` em vez de rejeitar, com 158 testes
aprovados e somente esse caso falhando. Os controles sem cliente e com envio
concluído passaram. O transporte e o SDK eram reais; nenhum mock do envio foi
usado. Os seis gates da correção passaram em `43912699035`, fonte
`66dd63aa`, e novamente na candidata integrada `43915310811`, fonte `37a75491`.

Testes/builds somente no GitHub. [Contrato do SDK](https://docs.sentry.io/platforms/javascript/guides/node/configuration/draining/).
