# Laboratório: revisão, conclusão em fases e publicação

Continuação autorizada pelo usuário em 03/10/2026. Branch de trabalho: `feat/missao-saber-laboratorio-completo`; base `718f3e4`. Referência: proposta e notas técnicas em `docs/propostas/missao-saber-laboratorio-2026-10-03/`.

O inventário de modos não prova atendimento funcional. Cada fase exige revisão do comportamento, exemplos matemáticos independentes, correções e testes pertinentes antes de ser aceita. Revisores de ferramentas têm propriedade exclusiva de seus três diretórios; a integração pertence ao responsável principal.

## Fase 1 — Revisão completa da implementação existente e fundação

- [x] Corrigir os achados matemáticos, de enunciado, renderização e validação dos três grupos.
- [x] Preservar a identidade da investigação no retorno missão → caderno → missão, inclusive novas montagens do componente e concorrência.
- [x] Ordenar os marcos familiares pela data do evento, evitando que edições de experiências antigas ocultem descobertas recentes.
- [x] Recomendar a missão atual/pendente da trilha; oferecer até três alternativas pertinentes.
- [x] Acrescentar teclado incremental e transferência com resultados derivados ocultos até pedido explícito de apoio.
- [x] Rever persistência, navegação, idempotência, propriedade, elegibilidade, caderno e migrações; verificar integração e fluxos de navegador.

## Fase 2 — Anos iniciais e fundamental intermediário

- [x] Revisar L01–L07/L19 contra cada capacidade proposta e completar representações ausentes, incluindo região/reta de frações, dupla reta proporcional, unidades não convencionais e linha do tempo.
- [x] Rever os novos recursos com casos de referência, limites, teclado, texto alternativo e transferência com menos apoio.

## Fase 3 — Anos finais e ensino médio

- [x] Revisar L08–L11/L18 e L12–L17 contra as capacidades da proposta, completando sincronização de funções compostas/inversas e demais lacunas confirmadas.
- [x] Rever domínios, identidades exatas, gráficos, impossibilidades, hipóteses probabilísticas/financeiras e limites de provas abertas.
- [x] Verificar redução de apoio em todas as famílias e adequação por ano/trilha.

## Fase 4 — Revisão integrada e gate final

- [x] Fazer revisão cruzada de diffs e dos requisitos, corrigindo todos os achados reproduzíveis.
- [x] Validar Biome, tipos, testes unitários e de integração completos, navegador desktop/mobile e build após a última alteração de código.
- [x] Preservar artefatos em falhas para diagnosticar intermitências; nunca aumentar retries ou remover asserções para obter aprovação.
- [x] Atualizar a matriz de cobertura e relatório com evidências reais. Preparar roteiro de piloto; validação com alunos depende de participantes e não é substituída por automação.

## Fase 5 — Main e produção

Execução operacional após o commit verificado. Resultado e identificadores registrados no CI/Railway e na resposta final de entrega.


- Conferir remoto e backup; fazer commit apenas dos arquivos do escopo, integrar em main e push.
- Acompanhar CI e migrador até sucesso no commit publicado; verificar migrations aditivas 0065–0067.
- Conferir deploy do Missão Saber e serviços afetados pelo schema compartilhado, readiness, health, SHA e schema de produção.
- Registrar commits, deploys e resultados; manter alterações pessoais de `.claude/settings.local.json` intactas.
