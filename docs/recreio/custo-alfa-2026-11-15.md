# Primeira medição de uso do alfa

Consulta somente de leitura ao Railway em **15/11/2026, 12:25 UTC**, por `railway usage projects --project <projeto existente> --json`. Período de cobrança consultado: 09/11 a 09/12. Os serviços Recreio começaram a operar neste período; a API informa uso acumulado estimado, sujeito à atualização do provedor, não fatura liquidada.

| Serviço | CPU (US$) | Memória (US$) | Saída de rede (US$) | Volume (US$) | Total (US$) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Portal Recreio | 0,00019332 | 0,00501285 | 0,00009498 | 0 | 0,00530115 |
| Servidor Morada | 0,00012170 | 0,00467572 | 0,00001348 | 0,00002388 | 0,00483478 |
| Soma atribuída aos dois serviços | | | | | **0,01013593** |

O cron ainda não apareceu como linha de custo nessa resposta. Ausência de linha não comprova custo zero. Banco, Redis, Bastidores e backups são compartilhados: seu custo não foi rateado nem incluído artificialmente no total exclusivo acima. Não há prova de custo unitário por jogador ou hora de mundo.

Na janela móvel anterior de uma hora, com 61 amostras de 60 s: portal com memória média de 0,18783 GB e máxima de 0,19318 GB; Morada com média de 0,17748 GB e máxima de 0,18204 GB. A consulta operacional anterior tinha um perfil e nenhum mundo persistido. Esta é uma base praticamente ociosa, com sondagens/implantação; não projetar preço mensal ou capacidade a partir dela.

## Aceite ainda aberto

- Medir uma janela delimitada com mundo real, jogadores e tempo de mundo ativo conhecidos.
- Comparar uso acumulado antes/depois, respeitando a defasagem da contabilização, e guardar instante/release/configuração.
- Rodar carga sintética no GitHub e relacionar mundos ativos, CPU, memória, tráfego e latência do servidor; não executar carga nesta máquina nem no Postgres compartilhado por padrão.
- Definir rateio explícito da infraestrutura compartilhada e margem/capacidade antes da venda. Limite configurado de mundos não é capacidade comprovada.

## Segunda leitura, aproximadamente 20h04 UTC

Mesma consulta e período: portal **US$ 0,02732842**, Morada **US$ 0,03619232**,
soma exclusiva **US$ 0,06352074**. A diferença para a leitura anterior arredondada
é aproximadamente US$ 0,05338481. [Resposta numérica sanitizada](evidencias/custo-alfa-2026-11-15-2004.json).

O cron continua sem linha na resposta; não atribuir custo zero. Nesse intervalo
houve implantações, validações operacionais e o uso humano já confirmado, mas
não uma janela controlada com tempo ativo de mundo/jogadores conhecido. O total
é acumulado estimado e pode chegar com atraso; não dividir pelas horas de
relógio e apresentar isso como custo por hora de mundo. Banco/Redis/backups
compartilhados continuam sem rateio. Os quatro critérios de aceite acima
permanecem abertos.

## Bancada sintética no GitHub

O workflow `morada-carga.yml` executa a bancada existente com 20 mundos e
dez minutos simulados, nos cenários de 1/2/4/8 conexões. Os parâmetros aceitam
somente inteiros limitados. Artefato de 30 dias conserva fonte, executor,
hardware, limites e relatório de CPU/tráfego/memória/fotografia. Fonte
`229baf7c`, [execução 43803715201](https://github.com/informach/informach-apps/actions/runs/43803715201)
aprovada. [Valores e origem](evidencias/carga-sintetica-2026-11-16.json).

A bancada usa conexões e persistência em memória, no mesmo processo e tempo
acelerado. Os robôs disputam os moradores existentes; oito conexões não são
oito moradores controlados de forma independente. A coluna de mundos por
vCPU é extrapolação aritmética de CPU, não capacidade homologada. Não há
PostgreSQL, WebSocket real, preço Railway, FPS ou efeito da rede nessa prova.
O ensaio remoto em rede/banco e a janela financeira acima continuam obrigatórios.

CPU arredondada por tick: 0,121/0,097/0,037/0,050 ms; tráfego por mundo:
1,15/2,56/6,09/12,20 kB/s, na ordem 1/2/4/8 conexões. Cenários ocorreram
sequencialmente no mesmo processo; ordem/JIT e disputa pelos mesmos moradores
limitam a comparação. Não inferir que acrescentar jogadores reduz o custo.
Heap foi medido após aquecimento, não como pico sustentado da execução. CPU
inclui clientes e armazenamento em memória no processo da bancada.

## Nova fotografia em 16/11

Leitura somente de metadados às 12:52:03–12:52:04 UTC, no mesmo período de
cobrança: portal **US$ 0,07450435**, Morada **US$ 0,11494477**, soma exclusiva
**US$ 0,18944912**. Os valores continuam acumulados e estimados; não são uma
fatura ou a diferença de uma janela controlada. Cron novamente ausente da
resposta, sem inferência de custo zero. Nenhum rateio de serviços compartilhados
ou GitHub Actions foi acrescentado.

Consulta agregada ao banco às 12:52:06 UTC: seis posses assumidas, nenhuma
aberta, 2.678 segundos-jogador relatados e pico relatado de um jogador.
Primeira aquisição em 15/11 às 12:30:51 UTC; última liberação às 18:50:01 UTC.
Esses contadores integram relatos de batimento e não equivalem a uma medição
contínua de horas de mundo ou a uma janela de faturamento já conciliada.
Não dividir os dois números para anunciar custo unitário, capacidade, FPS ou
prova humana com duas contas simultâneas. A janela delimitada continua pendente.

[Fotografia estruturada](evidencias/custo-2026-11-16.json).
