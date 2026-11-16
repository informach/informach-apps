# Processo principal do Morada

Achado operacional na implantação dos leitores `f0f1c96c`: às 16:02 UTC,
`/proc/1/cmdline` era `pnpm start:morada-server`. A árvore tinha mais um pnpm
e dois shells antes de `node dist/main.mjs` (PID 41). A retirada anterior
registrou `Stopping Container` e `ELIFECYCLE Command failed`, sem confirmação
da instância. Isso não prova perda de dados: o inventário anterior tinha zero
partidas abertas. Também não comprova encerramento ordenado do jogo.

A candidata define um comando único em `.railway/morada-runtime.ts`:
`node apps/morada-server/dist/main.mjs`, executado da raiz do artefato. A IaC
usa esse comando diretamente; o script local do package permanece relativo
ao app. Drenagem de 35 s, prazo do processo de 25 s, volume, réplica e arte D2
continuam nos contratos existentes.

O gate de qualidade compila o processo e inicia um contêiner Linux com o Node
24.15.0, usando exatamente os argumentos da IaC. Confere o PID 1, entra por
WebSocket, funda uma família, envia SIGTERM pelo `docker stop` e exige saída
0, fechamento 4010 e confirmação de um mundo sem falhas. Produz somente
contagens/estado/tempo no relatório. A plataforma em memória é a de testes,
isolada no executor; essa prova não certifica banco ou durabilidade depois
de uma queda. A máquina do titular não executa esse teste.

Aguardar os gates antes de alterar o serviço. Depois da alteração, conferir
o PID 1 real, a prontidão, a arte D2 e a configuração completa; registrar a
mudança intencional somente no comando inicial. O deploy automático do código
não aplica sozinho a alteração da configuração gerenciada no Railway.

Contrato do provedor: [SIGTERM e tempo de drenagem](https://docs.railway.com/deployments/deployment-teardown#draining-time).
