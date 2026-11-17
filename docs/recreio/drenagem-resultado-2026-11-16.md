# Resultado verificável do desligamento

Antes da correção de A9: `Ator.encerrar` registra `encerramento_sem_salvar`, mas resolve
sem resultado; a instância usa `allSettled` sem examinar os resultados. O
processo pode sair com zero após falha de diário/fotografia/liberação. O caminho
de erro também sai sem aguardar o flush do Sentry. O watchdog é retirado antes
do flush no caminho de sucesso. Não se provocou falha na produção.

Contrato implantado em `179a0a76`, sem alteração de mundo ou protocolo:

1. `ator.ts`: devolver confirmação booleana; falha conserva a posse e o diário
   confirmado, fecha conexões e devolve false. Ator já fechado/perdido não tenta
   escrever. Não transformar falha em fotografia nem liberar a posse sem salvar.
2. `instancia.ts`: contar falhas depois de aguardar todos os atores, fechar todas
   as conexões e devolver `{ mundos, falhas }`. Repetições compartilham a mesma
   Promise e conservam o resultado, inclusive quando há falha.
3. `servidor.ts`: propagar o resultado e encerrar WebSocket/HTTP também em erro
   inesperado; manter o encerramento forçado de WS em um segundo.
4. `encerramento.ts`/`main.ts`: consumir o resultado, registrar falha sanitizada e
   sair com 1 se algum mundo falhar. Aguardar o flush nos dois caminhos, mantendo
   o watchdog de 25 s até o fim. Sinais repetidos não duplicam o trabalho.
5. Testes: diário indisponível conserva fatos não confirmados fora do snapshot e
   reporta falha; todos os mundos são tentados; repetição conserva o resultado;
   relógio controlado confere flush antes do exit, falha no flush e watchdog.
   A jornada de rede continua exigindo aviso, WS fechado, posse liberada e foto
   cobrindo o diário quando o desligamento é confirmado.

Os gates são executados no GitHub. O resultado ainda não comprova drenagem com
latência real no Railway nem alta disponibilidade; uma réplica/volume continuam
sendo o perfil de produção.

## Validação e implantação

Os seis gates da [candidata 43815849549](https://github.com/informach/informach-apps/actions/runs/43815849549)
e da [main 43817020639](https://github.com/informach/informach-apps/actions/runs/43817020639)
passaram. A suíte do servidor teve 147 testes aprovados: seis do coordenador de
saída, um de vários mundos, dez de diário pendente e quinze de rede, entre os
conjuntos. HTTP/WebSocket reais conferem prontidão 503 durante escrita retida,
manutenção da posse até confirmação, liberação depois de salvar e rede fechada
mesmo em falha. O banco nessa bancada é em memória; não confundir com latência
real do provedor.

A regressão encontrou uma referência que ficava no registro da instância quando
o ator já havia enviado o close. A remoção agora independe do callback posterior
do transporte. A repetição preserva o resultado de falha sem duplicar gravações.

Deployment Morada `2ca8645b-865b-4b18-83b0-61314f8e2e7e`, fonte e prontidão
conferidas em 16/11. Portal permaneceu em `cc48f3c6`, sem rebuild. Saúde e
prontidão dos dois serviços: HTTP 200. Métricas autenticadas depois do deploy:
zero mundos/conexões, viva e fora de drenagem. Manifesto D2/V3 e seu SHA relidos
no processo. Configuração remota comparada integralmente, sem mudanças: 35 s,
uma réplica, sobreposição zero e o mesmo volume. [Prova estruturada](evidencias/drenagem-producao-2026-11-16.json).

Não se provocou falha nem desligamento de mundo real nesse deploy vazio. A9
continua exigindo o ensaio de latência/recuperação no Railway; o resultado não
certifica alta disponibilidade. D3 permanece separado da produção.
