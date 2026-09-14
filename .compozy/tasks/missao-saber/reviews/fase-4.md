# Review da fase 4 — família, cobrança, privacidade e editorial

Data: 13/09/2026. Revisão independente e somente de leitura da aplicação, seguindo `cy-review-round`, com o contexto de `_prd.md`, `_techspec.md`, `_tasks.md`, regras raiz e rodadas anteriores. O implementador continua F5 em paralelo; nenhuma fonte da aplicação foi alterada pelo revisor.

## Escopo e mapa de dependências

Os arquivos centrais foram lidos integralmente antes de formar os achados. O mapa cobre os quatro fluxos abaixo; páginas de apoio e configuração foram verificadas quanto a ligações, permissões e declarações de produto.

1. **Família:** página RSC → autenticação e sessão recente → controles de rotina, criação de perfil, assinatura, exportação e encerramento → Server Actions autenticadas → serviços de cobrança/repositório pedagógico. As leituras e gravações pedagógicas usam o responsável como proprietário, e exportação/exclusão usam a trava por responsável. Perfis, sessões, respostas, pistas, caderno e experimentos compõem a fronteira de dados do app.
2. **Editorial:** página restrita por lista de IDs → actions com verificação de editor e sessão recente → validação de aula, versão, hash, nota e atestado de revisão → registro append-only sob trava da aula. A disponibilidade usa o hash do conteúdo corrente. Relatos de alunos chegam ao repositório e são tratados nessa console.
3. **Cobrança:** configuração de produtos/preços do app → `@informach/billing` com cliente/assinatura delimitados por `app: missao-saber` → checkout/portal/cancelamento e entitlement. Venda depende da aprovação por hash de uma trilha completa e preço configurado. Webhook Stripe preserva o corpo bruto, verifica assinatura e delega idempotência/reconciliação ao pacote compartilhado. O job protegido chama reconciliação e lembretes de cobrança.
4. **E-mail/HTTP:** autenticação e cobrança → `@informach/emails` → preferências assinadas; webhook SendGrid verifica assinatura antes de parsear e limita o corpo. Rotas operacionais usam segredo de job comparado com tempo constante. Textos públicos explicam o piloto, autoria, titular responsável, limites de avaliação e dados coletados.

Arquivos de maior atenção: `features/family/actions.ts`, controles/página de família, `features/editorial/{repository,service,actions}.ts`, página/controles editoriais, `features/billing/{repository,service,maintenance}.ts`, `features/content/version.ts`, `lib/{action,auth,emails,http,env}.ts`, handlers de Stripe/SendGrid/job/exportação/unsubscribe e operações de dados relacionadas em `learning/repository.ts`. Dependências compartilhadas de billing checkout/subscriptions/sweepers/portal e emails dispatcher/webhook/política de supressão foram rastreadas para confirmar os contratos.

## Resultado

**Quatro achados de F4 resolvidos.** As correções passaram em revalidação de código e PostgreSQL descartável, incluindo eventos assinados e persistência das regras de cobrança. Última execução independente: 15 testes aprovados às 11:52:34 America/Sao_Paulo em 13/09/2026. O full review também corrigiu e verificou a interação adicional com endpoints de outros apps, registrada em `reviews-006/issue_002`.

| Questão | Severidade | Impacto |
| --- | --- | --- |
| [issue_001.md](../reviews-004/issue_001.md) | Alta | Encerramento pode deixar checkout aberto criar cobrança depois da exclusão. |
| [issue_002.md](../reviews-004/issue_002.md) | Média | Parse descartava categoria de unsubscribe; corrigido e verificado pela rota assinada. |
| [issue_003.md](../reviews-004/issue_003.md) | Média | Falha normal de envio é contada como lembrete de cobrança enviado. |
| [issue_004.md](../reviews-004/issue_004.md) | Média | Limites globais ocultam relatos pendentes e distorcem o estado editorial atual. |

A rodada foi registrada em `reviews-004` e pode ser processada por `compozy fix-reviews --name missao-saber`. Os achados de F1–F3 não foram duplicados. O reforço transacional da política de publicação em `startSession` já está em implementação pelo agente principal e pertence à revalidação de F2, portanto não foi aberto como uma questão nova de F4.

## Requisitos e pontos corretos

| Requisito da fase | Avaliação |
| --- | --- |
| Área do responsável, rotina e perfis | Presente, com sessão recente para dados familiares e ações sensíveis; relatórios agregam evidências por perfil. |
| Venda de assinatura por app | Produtos, preços, entitlements, checkout, portal e webhook presentes; preços de produção e portal do Stripe ainda exigem configuração operacional. |
| Aprovação editorial verificável | Versão/hash e atestado explícito, decisões imutáveis, retirada e propriedade de editor; estado corrente e fila de pendências corrigidos e verificados. |
| Exportação e remoção de dados pedagógicos | Trava por responsável, snapshots omitidos, correção incompleta retida e encerramento remoto com checkouts/eventos atrasados verificados. |
| E-mail, preferências e manutenção | Payload assinado e resultados de envio/supressão verificados em PostgreSQL. |
| Transparência do piloto e autoria | Páginas públicas presentes, sem prometer pontuação oficial ou chancela das olimpíadas. Revisão jurídica e humana permanecem externas. |

As mutações verificam autenticação no servidor e não dependem do ocultamento de botões. O cookie de perfil é conferido contra a família. A aprovação de conteúdo usa hash, evitando reaproveitar silenciosamente uma aprovação quando o texto muda sem subir a versão. O encerramento preserva os dados caso um cancelamento conhecido falhe. Exportação responde com download JSON e `private, no-store`; ações e logs evitam devolver erros internos detalhados. A limitação de corpo e verificação de assinatura são aplicadas antes de processar eventos.

## Evidência e limites

```text
VERIFICATION REPORT
-------------------
Claim: Verificações estáticas e testes existentes passam no código revisto de F4.
Executed: 2026-09-13 14:16–14:17 UTC
Command: pnpm --filter @informach/missao-saber typecheck
Exit code: 0
Output summary: tsc --noEmit sem diagnósticos.
Command: pnpm --filter @informach/missao-saber test
Exit code: 0
Output summary: 2 arquivos, 26 testes aprovados.
Command: pnpm exec biome lint apps/missao-saber/src/features/family apps/missao-saber/src/features/editorial apps/missao-saber/src/features/billing apps/missao-saber/src/app/api apps/missao-saber/src/lib/http.ts
Exit code: 0
Output summary: Checked 17 files in 26ms. No fixes applied.
Verdict: PASS para os comandos iniciais acima; correções funcionais posteriormente verificadas na integração.
```

Os testes unitários iniciais eram do motor e laboratórios. Na revalidação, os testes operacionais passaram em PostgreSQL descartável com assinatura ECDSA real, fornecedor de cobrança controlado e persistência dos resultados; o E2E cobre a jornada familiar. O revisor executou a integração completa mais recente às 11:52:34, com 15 testes aprovados e banco removido. Não houve cobrança, envio ou alteração em serviços de produção. Configuração de portal, agendamento, filas de e-mail e validação humana/jurídica constam do roteiro de lançamento, sem declaração de ativação externa.
