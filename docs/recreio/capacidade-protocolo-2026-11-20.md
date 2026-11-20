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
