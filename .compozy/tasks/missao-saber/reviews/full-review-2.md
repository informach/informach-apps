# Missão Saber — segunda revisão completa

> Estado atual: as cinco pendências da revisão complementar foram corrigidas em [remediation-007.md](remediation-007.md), com parecer independente favorável. O texto abaixo preserva a evidência histórica desta revisão.

Data: 13/09/2026. Escopo: implementação atual no workspace, ainda sem commit, incluindo o app, migrations/configuração e alterações nos pacotes compartilhados. PRD, TechSpec, proposta, tarefas e as dezoito issues das rodadas 001–006 foram consultados. A leitura integral foi priorizada nos serviços, repositórios, motor, catálogo, componentes principais e fronteiras de autenticação/cobrança/e-mail; arquivos auxiliares, configuração e testes foram inspecionados no contexto desses fluxos.

## Parecer

**Needs fixes before merge — corrigir antes de integrar ou abrir o piloto pago.** Foram confirmados **cinco achados novos: três altos e dois médios**, todos pendentes. Nenhum achado crítico foi confirmado. Este parecer substitui o estado de aprovação da primeira revisão completa para a versão atual; não invalida as dezoito correções anteriores, que tratavam de outras causas.

Esta rodada identifica e documenta os problemas. Não modifica a fonte do produto nem declara os achados corrigidos. Foram acrescentados os arquivos de revisão e usados ensaios locais, sem publicação, pagamentos ou e-mails reais.

| Issue | Severidade | Gatilho e consequência |
| --- | --- | --- |
| [001 — Checkouts duplicados](../reviews-007/issue_001.md) | Alta | Abrir dois planos antes de pagar gera duas URLs pagáveis para a mesma família. O lock termina antes do ciclo de pagamento. |
| [002 — Reconciliação após encerramento](../reviews-007/issue_002.md) | Alta | Uma resposta remota anterior ao encerramento chega atrasada e troca `canceled` por `active` no banco, mesmo com o ID marcado como encerrado. Pode restaurar acesso local indevido. |
| [003 — Categorias SendGrid](../reviews-007/issue_003.md) | Alta | Evento assinado com categoria em array recebe HTTP 400. O formato é usado pelo dispatcher e documentado pelo provedor; o lote de eventos não é processado. |
| [004 — Retomada desaparece](../reviews-007/issue_004.md) | Média | Trinta sessões concluídas mais recentes ocultam uma missão pausada. O snapshot existe, mas o caminho de retomada desaparece da interface. |
| [005 — Oito dias em uma semana](../reviews-007/issue_005.md) | Média | Uma janela móvel de 168 horas abrange oito datas brasileiras e o painel exibe `8/7` dias. |

A rodada canônica é [reviews-007](../reviews-007/_meta.md), com `issue_001.md`, `issue_002.md`, `issue_003.md`, `issue_004.md` e `issue_005.md`. O [mapa independente](dependency-map-review-2.md) registra o rastreio de dependências e as reproduções de cobrança/e-mail. O contrato SendGrid foi conferido na [referência oficial do Event Webhook](https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/event).

## Confronto com os requisitos

| Critério do PRD | Resultado da revisão |
| --- | --- |
| 1. App independente, responsável, perfis e PostgreSQL | Implementado; permissões por responsável e perfis isolados verificadas. Autenticação e conta compartilhada inspecionadas, inclusive proteções de exclusão dos outros apps. |
| 2. Catálogo autoral 6º/7º e quatro trilhas | 24 missões, 144 itens, 12 habilidades e 288 devolutivas. Catálogo, enunciados, respostas, pistas e fórmulas inspecionados. Os fundamentos são compartilhados entre trilhas; não são quatro bancos independentes. Continua exigindo revisão pedagógica humana antes da publicação comercial. |
| 3. Missões, diagnóstico, domínio, espaçamento e retomada | Correção e pistas no servidor, snapshots, ordem e idempotência estão presentes. Diagnóstico não certifica domínio. Há falhas de navegação histórica e janela semanal, issues 004/005. |
| 4. Áreas do aluno e três laboratórios acessíveis | Fluxos desktop/mobile passaram. Exploração pública funciona sem conta; controles de laboratório aceitam teclado e apresentam valores em texto. Navegação direta diagnóstico → próxima missão foi exercitada adicionalmente e funciona. Inspeção visual de laboratório em 320 px não identificou overflow horizontal. |
| 5. Planos, unidade gratuita, billing e preservação | Produtos, preços esperados, gates, portal e exportação existem. As issues 001/002 impedem aprovar a confiabilidade do ciclo de assinatura. Histórico permanece no banco, mas sua retomada tem a limitação da issue 004. |
| 6. Família, consentimento, exportação, limpeza e editorial | Autenticação recente, isolamento, embargo de avaliações, persistência de laboratório e autorização editorial passaram nos testes. O processamento de eventos de e-mail tem a incompatibilidade da issue 003. |
| 7. Testes, migrations, build, reviews e operação | Testes e build passaram; migrations aplicadas apenas em bancos descartáveis. Os cinco achados mostram lacunas dos testes atuais. Não houve homologação dos provedores reais ou do deploy Railway. |

A proposta inclui etapas posteriores que continuam explicitamente fora deste piloto: banco de lançamento com aproximadamente 600 atividades, avaliações inéditas reservadas, respostas numéricas/abertas, preparação discursiva específica, expansão de anos e níveis, escolas, IA e offline. Não foram contadas como defeitos novos de implementação porque o recorte está explícito no PRD e na proposta. A eficácia didática e a disposição das famílias a pagar continuam sem validação de campo.

## Áreas técnicas

| Área | Avaliação |
| --- | --- |
| Segurança | Autorização no servidor, dono do perfil/sessão, entrada validada, limites de payload e assinaturas verificadas. Nenhum novo bypass confirmado. Eventos legítimos SendGrid são rejeitados por tipo incompatível. |
| Correção | Matemática das ferramentas e motor passaram nos testes; dois erros de projeção/histórico confirmados. |
| Concorrência | Criação de perfis, tentativas, pistas, exclusão pedagógica e experimentos usam controles reais. A coordenação de billing não cobre o ciclo inteiro de checkout nem a reconciliação. |
| Desempenho | Catálogo piloto pequeno. Evidências e releases ainda são lidos amplamente; dimensionar com uso real. O limite de 30 sessões já causa perda de descoberta da retomada, independentemente de carga. |
| Erros | Actions sanitizam falhas e preservam dados para retentativa; callback de dunning distingue falha/supressão. O formato real do evento de e-mail precisa ser coberto. |
| Código | Separação entre actions, serviços, repositórios e motor puro está preservada. Nenhum achado de estilo foi transformado em issue. |
| Testes | Boa cobertura dos caminhos existentes, inclusive banco real e navegador. Faltam regressões dos cinco cenários reproduzidos nesta rodada. |
| Arquitetura | Pacotes continuam consumidos como TypeScript; app não importa outros apps. O protocolo de encerramento exige adesão de todos os escritores de billing. |
| Operação | Guia diferencia homologação e produção; preços/editorial bloqueiam vendas. Provedores, alertas, backups e deploy não foram ativados. O cron pode concorrer com a família mesmo sem duas execuções sobrepostas. |

## Evidência fresca desta rodada

Horários abaixo em America/Sao_Paulo, em 13/09/2026. Todos os comandos de aprovação listados terminaram com exit 0; reproduções com exit 0 confirmam defeitos, não o funcionamento correto desses cenários.

| Comando / ensaio | Resultado |
| --- | --- |
| `pnpm --filter @informach/missao-saber test` às 12:04 | 31 testes aprovados. |
| `pnpm --filter @informach/billing test` às 12:04 | 188 testes aprovados. |
| `pnpm --filter @informach/missao-saber test:integration` às 12:04 | 15 testes em PostgreSQL descartável; migrations aplicadas e banco removido. |
| `pnpm --filter @informach/missao-saber e2e` nesta rodada | 6 cenários desktop/mobile aprovados em 51,5 s; banco descartável removido. |
| `pnpm typecheck` nesta rodada | 12 tarefas aprovadas; 11 resultados reutilizados do cache e o app executado. |
| `pnpm test` às 12:10 | 7 tarefas aprovadas; 5 em cache, app e billing executados novamente. |
| `pnpm --filter @informach/missao-saber build` às 12:10 | Compilação, TypeScript, geração e finalização aprovadas; 23 rotas e proxy. |
| Biome focado no app e arquivos compartilhados alterados | 111 arquivos verificados, sem correções e sem erros. |
| `pnpm --filter @informach/db exec drizzle-kit check` | Metadados de migrations válidos. |
| `git diff --check` | Sem erros de whitespace; avisos de normalização LF/CRLF no Windows. Não cobre arquivos ainda não rastreados. |
| Navegador adicional em preview isolado | Diagnóstico → próxima missão reinicia o Player corretamente; missão pausada antiga fica sem link após trinta conclusões; laboratório em 320 px sem overflow. Usuário de teste removido. |
| Smoke do build em produção local, porta 3106 | Demonstração hidratou com CSP/nonce, feedback interativo funcionou, sem erro de página; `/hoje` sem autenticação redirecionou. Servidor temporário encerrado. |
| Reproduções independentes de checkout/reconcile/SendGrid | Dois checkouts distintos; status cancelado sobrescrito por active; POST assinado com array de categoria recusado. Detalhes e saídas no mapa independente. |
| Execução direta de `weeklyEvidence` com oito datas em 168 h | `practiceDays=8`, reproduzindo a issue 005. |
| `node apps/missao-saber/tmp/review-2/verify-artifacts.mjs` às 12:18 | YAML, nomes, linhas, severidades e contadores válidos: 5 pendentes, 18 anteriores resolvidas, 22 links locais existentes. |
| Conferência documental independente após a redação | Cinco issues e parecer aprovados como registro fiel da revisão; não é aprovação do produto. |

O smoke de produção usou `next start` com o repositório completo; Next avisou sobre a configuração `output: standalone`. Isso não impediu o ensaio, mas não valida a execução do artefato standalone nem o serviço Railway. Os testes de desenvolvimento emitiram avisos de `NO_COLOR`/`FORCE_COLOR`, e migrations emitiram notices conhecidos de extensões/identificador; não houve erro nesses comandos aprovados. Na inspeção visual inicial, uma captura ainda mostrava o estado de carregamento; o ensaio foi corrigido para aguardar os elementos da página e repetido antes de usar a evidência.

O `pnpm check` global não foi repetido nesta rodada: a [revisão anterior](full-review.md) registra falhas fora deste escopo. O resultado Biome acima é apenas do app e dos arquivos compartilhados selecionados; não declara o monorepo inteiro livre de problemas de lint/formatação.

```text
VERIFICATION REPORT
-------------------
Claim: Segunda revisão completa documentada, com cinco achados novos pendentes
Command: Leitura priorizada + mapa independente + testes/migrations/build/ensaios descritos acima + validação YAML dos artefatos
Executed: 13/09/2026, nesta rodada
Exit code: 0 nos comandos de aprovação e reprodução listados, incluindo validação documental às 12:18
Output summary: 3 high, 2 medium; testes existentes passam, mas reproduções demonstram lacunas reais
Warnings: Cache nas tarefas indicadas, notices PostgreSQL/Windows, aviso standalone; check global fora da aprovação
Errors: Cinco defeitos confirmados na implementação; nenhum tratado como resolvido
Verdict: REVIEW COMPLETE / NEEDS FIXES BEFORE MERGE
```

## Próximo passo concreto

Tratar `reviews-007` com `cy-fix-reviews` (ou `compozy fix-reviews --name missao-saber`), começando pelas três issues altas. Incorporar as reproduções como regressões de contrato/concorrência e repetir os testes afetados e o review após as correções. Depois, manter a sequência já prevista de revisão humana do conteúdo, homologação Stripe/SendGrid e piloto acompanhado com famílias.
