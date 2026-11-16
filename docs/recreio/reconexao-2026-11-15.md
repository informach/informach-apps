# Reconexão rápida: correção operacional

Correção preparada sobre a produção `7c81a68f`, conservando mundo V2,
protocolo 1 e arte D2. Editor/travas/mundo V3 continuam na frente candidata.

A queda era enfileirada pelo SID; se a conexão voltasse antes do próximo
passo, o aviso antigo colocava a sessão nova em graça. Seus comandos eram
recusados e a reserva podia expirar mesmo com o aparelho conectado.

O ator agora confere se já existe uma conexão vigente para o SID antes de
consumir esse aviso. Queda sem sucessora conserva a janela e a expiração.

Prova de causa: `1b88f4d7`, execução focada `43777623906`, dois casos falharam
antes do conserto. Prova posterior `5a86e6bf`, `43778006421`: três casos
passaram, cobrindo uma/três quedas antigas e a queda normal sem retorno.
Os testes usam instância, fila, presença e comandos reais da bancada, com
plataforma/identidades sintéticas. Foram executados somente no GitHub.

Fonte de produção: `18f52aa004dc88be85420b9f7bc7eae77bbd6a56`, seis gates
`43778361615` aprovados. A checagem global registrou 618 avisos, sem falha;
as três regressões passaram. A main remota foi conferida antes do push,
preservando o histórico, e a publicação ocorreu às 00h15 UTC de 16/11.

Railway Morada `9fa87860-2503-4fda-a872-b0234b0cbba5`: `SUCCESS`, fonte conferida
no provedor e em `/api/health`. Saúde e prontidão de ambos os serviços 200 após
a implantação. O portal conservou `7c81a68f`/deployment `59c3b020`; seu build
foi omitido pelos padrões de arquivos, pois esta mudança não o afeta. Mundo V2,
protocolo 1 e arte D2 conservados; sem migration ou reset de dados.

Repetição na main `43779266639`: seis gates aprovados, fonte `18f52aa` conferida
em 16/11 às 00h46 UTC. Recursos D3 continuam somente em candidata; a publicação
deste hotfix não os habilita.
