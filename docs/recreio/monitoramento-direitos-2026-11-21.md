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

A ativação do consentimento nativo exige custódia e monitor configurados; a
validação não consulta a saúde da fila para aceitar um pedido individual.

Ainda é necessário qualificar esta candidata no GitHub, implantar a composição
operacional restrita, observar heartbeat e fila e só então ativar a quarta sonda.
A aceitação de um direito individual não depende de a fila de outra conta estar
saudável. Não foi solicitado novo orçamento de uptime ao Sentry.

## Evidência remota da primeira candidata

Fonte 2d460817: qualidade 44888952548, imagem nativa 44888955514,
Worker 44888958553 e navegador 44888961366. A imagem passou oito execuções
nativas, incluindo rota real sem execução, rodada saudável, livro alheio falho,
cabeçalho congelado e falha do livro configurado; armazenamento e SQL sintéticos
foram limpos. [Recibo derivado](evidencias/monitor-direitos-44888955514.json).
Os quatro gates passaram, sem implantação produtiva. A exigência de monitor na
ativação é incremento posterior 4f9410ce: qualidade 44889448135 e jornada nativa
44889450605 também passaram. Falta qualificar a integração final e observar a
composição operacional real antes de ativar o consentimento.
