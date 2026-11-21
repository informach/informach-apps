# Sonda do executor de direitos — candidata

A sonda `/api/direitos/health` fica desligada por padrão. Com configuração
explícita, exige uma execução nativa recente do mesmo livro, ausência de revisão
ou atrasos e leitura autenticada do cabeçalho aberto com a chave ativa. Não
concede autorização de retirada nem comprova toda a cadeia de efeitos.

A execução registra `direitos:<id técnico do livro>` em `ops.job_runs`; não usa
identificadores de pessoa, família ou pedido. O leitor usa transação consistente
somente de leitura, prazos SQL e resposta pública mínima sem cache. Livro
congelado, falha, execução ausente ou antiga e fila vencida retornam 503. Trabalho
recente e retenção ainda no prazo original permanecem legítimos.

A configuração usa `RECREIO_RIGHTS_MONITOR_MODE=on` e
`RECREIO_RIGHTS_MONITOR_MAX_AGE_SECONDS` explícito (exemplo: 900). A idade deve
acompanhar a cadência homologada do executor. O padrão off responde 404 sem ler
banco ou custódia. O monitor externo compartilha a ingestão já restrita do
Recreio e só inclui a quarta sonda quando `RECREIO_MONITOR_DIREITOS=on`.

O ensaio candidato usa a rota real, PostgreSQL e bucket exclusivos sintéticos:
sem execução, duas rodadas ociosas da imagem, falha de outro livro, congelamento
e falha do livro configurado. O Worker tem prova de cron, repetição e transporte
para a nova sonda no runtime remoto. A configuração externa permanece off até a
implantação e observação do executor real; não há ativação por este documento.

Ainda é necessário qualificar esta candidata no GitHub, implantar a composição
operacional restrita, observar heartbeat e fila e só então ativar a quarta sonda.
A aceitação de um direito individual não depende de a fila de outra conta estar
saudável. Não foi solicitado novo orçamento de uptime ao Sentry.
