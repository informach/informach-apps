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

Esta cópia de produção ainda aguarda os seis gates do seu próprio candidato
e conferência do deploy/saúde no Railway. Nenhum dado de mundo é reiniciado.
