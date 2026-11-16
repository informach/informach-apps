# Resultado verificável do desligamento

Achado em A9: `Ator.encerrar` registra `encerramento_sem_salvar`, mas resolve
sem resultado; a instância usa `allSettled` sem examinar os resultados. O
processo pode sair com zero após falha de diário/fotografia/liberação. O caminho
de erro também sai sem aguardar o flush do Sentry. O watchdog é retirado antes
do flush no caminho de sucesso. Não se provocou falha na produção.

Incremento em implementação, sem alteração de mundo ou protocolo:

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
