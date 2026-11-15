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
