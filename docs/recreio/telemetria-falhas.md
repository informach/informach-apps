# Resumo de falhas do Morada

A revisão de 15/11 encontrou `Error.message` nos logs de rede/encerramento e
`String(erro)` no encerramento fatal do processo. O Sentry já usa classificadores
fixos; mensagens livres ou serialização de objetos desconhecidos não devem
reintroduzir conteúdo, credenciais ou dados de configuração nos logs Railway.
Não há evidência de vazamento real neste registro; o achado é o caminho de código.

Implementar um resumo puro compartilhado pelos logs e pelo emissor Sentry:
somente classe controlada de exceção e código de domínio admitido, ou `INTERNO`.
Não ler nome livre, mensagem, stack, causa, `toString` ou propriedades arbitrárias.
Conservar contexto operacional fixo e release/ambiente já existentes.

Testar erros com segredos em mensagem/nome/causa, códigos do Recreio e objetos
desconhecidos cuja conversão falha. Conferir os consumidores e a entrada fatal;
rodar os testes/tipos no GitHub. Atualizar o README para o alfa já implantado e
o runbook real, sem declarar os recursos D3 publicados.

Primeira candidata `cd30a72d`, execução focada `43786361105`: a tipagem recusou
a união de construtores nativos no teste de `AggregateError`. A fixture passa
a fornecer instâncias explícitas; sem mudar o código ou remover a verificação.
Ainda aguarda repetição focada e seis gates.

O filtro final Sentry também valida os valores de operação/código contra as
listas controladas; retirar as demais chaves não bastaria se o próprio valor
do classificador fosse livre. Os códigos reutilizam o catálogo do Recreio.
