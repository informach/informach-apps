# Processo principal do Morada

Achado operacional na implantação dos leitores `f0f1c96c`: na conferência do processo,
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

Os seis gates de `43904561482`, fonte `c082a1c4`, passaram. A prova confirmou
um mundo com fundação, zero falhas, saída 0, fechamento 4010 e cerca de 121 ms
para encerrar. É o ensaio isolado acima, sem certificação de banco/RTO.

O serviço recebeu somente a alteração do comando inicial. Reutilizar o
snapshot anterior (`5ea757a6`) também conservou seu comando antigo; não usar
esse caminho para aplicar configuração nova. A implantação da fonte atual
(`railway redeploy --from-source`, `afe83ea7`) aplicou o comando: às 16:27:15
UTC, o PID 1 era o Node 24.15.0 com `apps/morada-server/dist/main.mjs`, na
raiz `/app`. Fonte ainda `f0f1c96c`, prontidão 200, zero mundos/conexões,
arte D2 com o SHA anterior e nenhuma outra diferença de configuração.

IaC e gate publicados em `92f665e7`. Na retirada normal de `afe83ea7`, às
17:27:03 UTC, o PID 1 recebeu SIGTERM e confirmou `instancia_encerrada`, com
zero mundos e zero falhas. A nova instância está pronta com o mesmo comando.
Não havia mundo aberto; isso não prova salvamento de uma partida de produção.
[Operação posterior](responsabilidade-producao-2026-11-16.md) e
[dados da correção inicial](evidencias/processo-principal-producao-2026-11-16.json).

Contrato do provedor: [SIGTERM e tempo de drenagem](https://docs.railway.com/deployments/deployment-teardown#draining-time).
