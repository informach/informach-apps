# Custo medido do alfa — 20/11/2026

Consulta oficial Railway CLI 5.62.1, `usage projects --project
f4da4285-5b98-48b5-b03e-5be02f4e7c56 --period current --json`, às 20h38 UTC.
Período aberto de 09/11 às 10h40 UTC a 09/12 às 10h40 UTC. Valores em USD,
acumulados e medidos pelo provedor; não são fatura quitada ou projeção mensal.
[Recibo com componentes e hashes](evidencias/custo-acumulado-railway-2026-11-20.json).
O CLI é documentado no [Railway](https://docs.railway.com/cli/usage).

| Centro de custo | USD acumulados |
| --- | ---: |
| Recreio portal e manutenção exclusivos | 0,394070 |
| Morada servidor, referência separada | 0,431279 |
| Subtotal exclusivo portal + referência | 0,825349 |
| PostgreSQL compartilhado, incluindo volume e backup nativo | 1,170574 |
| Redis compartilhado | 0,036443 |
| Bastidores compartilhado | 0,838341 |
| Migrator compartilhado | 0,000017 |
| Pool compartilhado listado | 2,045376 |

A consulta de PostgreSQL foi somente leitura, com statement_timeout de cinco
segundos e lock_timeout de dois, via SSH no serviço já existente. Só agregados
foram coletados. Há sete posses de servidor, todas encerradas, em dois mundos;
2.899,865151 segundos de posse no período (0,805518 horas-mundo) e 2.700
segundos de jogadores dos registros completos (0,75 horas-jogador). Posse é
capacidade alocada, não tempo de simulação ativa ou prova de diversão/FPS.

O intervalo de cada posse começa no maior entre claimed_at e início do período;
termina no menor entre released_at (ou expires_at), expires_at e instante da
consulta. Durações negativas contam zero. Nenhuma linha de pessoa ou mundo foi
exportada. A consulta confirmou transaction_read_only=on e PostgreSQL 18.6.

O subtotal exclusivo dividido pelo tempo de posse resulta em **USD 1,024619 por
hora-mundo alocada no alfa observado**. Esse número inclui toda a ociosidade
acumulada do portal e servidor: não é custo marginal ou estimativa sob carga.
Não converter em reais ou margem comercial usando câmbio ou taxas presumidos.

O rateio causal do pool compartilhado ainda não foi medido. Por isso os custos
ficam discriminados, sem percentual inventado. Como cenário conservador, atribuir
100% do pool listado ao Recreio + referência resulta em subtotal de USD 2,870725
ou USD 3,563824 por hora-mundo observada. É uma hipótese explícita de atribuição,
não consumo causal observado nem rateio comercial aprovado.

Esses subtotais não incluem armazenamento de objetos não discriminado nessa
resposta, outras taxas/provedores, assinatura de workspace, impostos, descontos
ou câmbio. A medição do provedor pode ter atraso. Homologação fica em serviços
separados, não somada ao custo exclusivo acima. A medição não alterou limites,
credenciais, dados ou configuração de serviços.

## Repetição e pendências

Repetir o CLI oficial no fechamento do período; conservar resposta original
fora do Git e publicar apenas o recorte agregado com SHA-256. Repetir os
agregados de posses com a mesma janela, em transação read-only e prazos curtos.
Conferir soma de CPU, memória, saída, volume e backup com total de cada serviço.
Sem atividade, reportar custo e denominador zero com razão indisponível.

F10 ainda exige medir recursos compartilhados sob atividade representativa,
atribuição documentada por recurso e custos externos da operação definitiva.
A carga remota 1/2/4/8 é evidência de protocolo; não transforma esta amostra
ociosa em capacidade Railway. Agenda/custódia de backup, RPO/RTO e atendimento
continuam sujeitos aos demais aceites do fechamento.

## Releitura de 21/11

Às 05:03 UTC, a mesma consulta oficial retornou USD 0,433733 acumulados para
portal, manutenção e executor de backup exclusivos do Recreio. Somando a
referência Morada, USD 0,887916. Os componentes foram somados e comparados
com os totais de cada serviço; [recibo](evidencias/custo-acumulado-railway-2026-11-21.json).
Não se recalculou razão por atividade com denominador de outra janela. O
executor de backup ainda apresenta USD 0,000023155278, sem memória discriminada;
isso não comprova memória gratuita nem custo integral da restauração. Custos
dos serviços de recuperação removidos e dos objetos não vieram discriminados.
O bucket de arquivos continua com dois objetos/19.496.587 bytes. Rateio causal
e preços mensais não foram presumidos a partir desses dados.
