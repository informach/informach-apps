# Carga do protocolo Recreio

Plano do incremento F10; candidata em implementação, sem resultados ainda.
Não executar nesta máquina. O executor é o GitHub Actions, com PG descartável,
sem chaves de produção, Stripe real ou bucket externo.

1. Registrar um título interno independente, com oito membros, sem alterar o
   contador existente de quatro membros ou o manifesto público do Morada.
2. Criar oito contas/perfis/concessões e convites pelas jornadas nativas,
   com portal em build de produção e servidor do título em processo separado.
3. Sustentar um mundo com 1/2/4/8 membros por 60–180 segundos por cenário.
   Oferecer até um comando por jogador por segundo. Nenhum limitador é desligado.
   Conferir SIDs nativos, propagação a todos, diário e foto no PostgreSQL,
   saída pelo jogo e recuperação após reiniciar o processo do título.
4. Medir latências p50/p95/p99 de rodada completa, CPU e RSS amostrado do
   título, bytes persistidos e horas de mundo/jogador observadas. Conferir a
   origem do recibo e a remoção do banco antes de publicar só agregados numéricos.

A latência inclui automação do navegador e atualização da tela, além do caminho
HTTP/PG/WS. CPU e RSS são do processo do título; não são consumo exclusivo do
portal, PG ou navegadores. Horas normalizadas não são uma hora observada nem
custo financeiro. Este ensaio não mede saturação, WAN, Railway, FPS, arte ou
simulação do Morada. Capacitação do Railway e custo por mundo-hora continuam
exigindo medição operacional separada, com rateio dos recursos compartilhados.

O gate auxiliar capacity não substitui os 16 gates regulares. Ele só existe
pelo workflow explícito e não entra nos testes cotidianos ou no build público.


A primeira fonte 140daa7c passou qualidade 44768767055. A rodada de carga
44768761710 falhou antes da medição, em convidar o segundo participante:
o helper esperava apenas o rótulo inicial do botão. A correção reconhece
Gerar outro código e exige a mudança efetiva do código exibido antes de
convidar a próxima pessoa. Não altera produto, teto, rate limit ou timeout.
O banco descartável foi removido mesmo nessa falha. Ainda não há resultado
de capacidade desta rodada; a candidata corrigida exige nova execução.


A correção ee1a4157 passou carga 44771690103 e qualidade 44771697104. Foram
908 comandos (60/120/240/488), zero perdas, contador final 908 conferido no
PostgreSQL e recuperado por processo novo; banco descartável removido. O ensaio
usou 60/60/60/61 segundos reais por cenário, sem desligar limites. ZIP original
de 1.575 bytes e JSON conferidos por SHA no
[recibo](evidencias/capacidade-protocolo-44771690103.json).

| Jogadores | p95 da rodada com automação | CPU média do título (núcleos) | RSS máximo amostrado |
| --- | --- | --- | --- |
| 1 | 123,37 ms | 0,00766 | 129,13 MiB |
| 2 | 227,23 ms | 0,00990 | 124,49 MiB |
| 4 | 379,02 ms | 0,01621 | 125,87 MiB |
| 8 | 1.023,49 ms | 0,03058 | 152,37 MiB |

Esses valores não isolam RTT WebSocket e incluem a automação de oito páginas.
Não são orçamento de latência WAN, custo ou capacidade do Railway. O título é
interno e sem simulação/arte do Morada. F10 continua exigindo recursos dos
outros processos, carga operacional e custo/rateio por mundo-hora em produção.
