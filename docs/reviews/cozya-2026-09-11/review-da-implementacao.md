# Cozya — revisão da implementação

11/09/2026. Revisão do diff completo da evolução, das dependências compartilhadas alteradas e das jornadas de cadastro, receitas, IA, cozinha, conta e cobrança. Complementa o [review original](review-tecnico.md) e a [implementação](implementacao.md). Os 12 achados abaixo foram corrigidos e a verificação local passou. A homologação do pagamento no ambiente publicado permanece pendente; não encontrei outra regressão reproduzida nos cenários examinados.

**Preços preservados: R$ 14,90/mês e R$ 149/ano. Os dois planos continuam concedendo 50 créditos mensais.** O catálogo e seus Price IDs de desenvolvimento/produção não foram modificados. Nenhum deploy, cobrança real, campanha ou mensagem externa foi feito nesta revisão.

## Achados e correções

P1 indica risco de cobrança, recuperação financeira ou perda de dados. P2 indica falha funcional na jornada. P3 indica um problema pontual de contrato/apresentação. “Anterior” significa que o defeito já existia antes da evolução; não significa regressão causada por ela.

| ID | Prioridade / origem | Problema e efeito | Correção e evidência |
| --- | --- | --- | --- |
| F01 | P1 · anterior, exposto também pela demonstração | O saldo ignorava concessões vencidas, mas ainda subtraía seu consumo histórico. Usar 3 créditos de demonstração, deixá-los vencer e receber 50 resultava em **47**. O mesmo problema atingia bônus mensais. | O cálculo reconstitui o uso cronológico das concessões, consumindo primeiro as que vencem antes; expira apenas o restante não utilizado. Exibição, reserva, consumo e recibo usam a mesma projeção. Teste PostgreSQL reproduziu 47 e passou a exigir 50, inclusive reservar/consumir todos os 50. Doze testes cobrem renovação, sobreposição, pacotes, reembolso, compensação, vencimento e dívida real. |
| F02 | P1 · evolução | A retenção recuperava no máximo 100 operações e podia apagar as pendências restantes antes da compensação. | Processamento por antiguidade e exclusão apenas de operações resolvidas. Teste com **101 falhas de 91 dias** exige recuperação de 100 + 1, com uma compensação por operação e nenhuma na terceira execução. |
| F03 | P1 · evolução | Apagar os dados durante uma operação interrompida podia remover sua evidência de compensação; uma execução em andamento também podia recriar a prévia depois da limpeza. | Registro de operação e limpeza usam o mesmo bloqueio por usuário. A limpeza reconcilia falhas antigas e interrompe a exclusão se ainda houver execução/compensação pendente, com mensagem específica. Integração verifica preservação dos dados, devolução do crédito e exclusão posterior. |
| F04 | P1 · anterior, exposto pelo novo autosserviço | A exclusão da conta cancelava assinaturas ativas/em atraso, mas ignorava `incomplete` e `paused`, que podem voltar a produzir cobrança. | Incluídos os dois estados não terminais no cancelamento imediato. Integração verifica chamada de cancelamento e estado local final para ambos. A comunicação externa com Stripe permanece simulada nesse teste. |
| F05 | P2 · evolução | Favoritar mudava `updatedAt`, usado também como versão do preparo; o próximo passo podia apagar checklist e temporizador. | Versão específica do conteúdo culinário. Favorito/nome/origem não reiniciam preparo; ingredientes, passos, rendimento e tempo alterados reiniciam. Teste real preserva passos/timer ao favoritar e os reinicia depois de alterar ingredientes. |
| F06 | P2 · evolução | Porções escolhidas na tela de preparo se perdiam ao recarregar; um parâmetro antigo na URL também podia sobrescrever a escolha salva. | Porções persistidas na sessão, botão de aplicação e retirada do parâmetro antigo após salvar. Mudar porções limpa somente as marcações de ingredientes. Integração e navegador cobrem porções, passos, timer e recarga. |
| F07 | P2 · evolução | `1.000 g` era interpretado como 1 g, podendo virar 2 g ao duplicar a receita. | Separadores ambíguos de milhar preservam o texto original e pedem conferência. Decimais e frações suportados continuam escaláveis. Testes reproduziram a interpretação incorreta antes da correção. |
| F08 | P2 · evolução | Recuperar uma prévia de IA podia classificá-la como manual e retirar o aviso de revisão. | A resposta salva inclui o método de criação. A recuperação aceita apenas métodos de IA, com fallback para registros antigos sem método. Integração cobre método explícito e legado. |
| F09 | P2 · evolução | Uma adaptação bem-sucedida continuava disponível para salvar após editar o pedido ou receber recusa na tentativa seguinte. | A prévia anterior é descartada ao editar/enviar. Teste de navegador controla duas respostas para verificar que o botão de salvar a cópia antiga desaparece. Não é uma avaliação do modelo. |
| F10 | P2 · evolução | Itens extras adicionados à compra não podiam ser removidos, inclusive erros de digitação. | Remoção de itens manuais, vinculada ao dono da lista. Testes verificam isolamento, proteção dos itens gerados, regeneração e recarga. |
| F11 | P2 · integração da evolução | O histórico de créditos recebidos omitia demonstrações e compensações recém-introduzidas, embora o saldo as incluísse. | Incluídos `promo_grant` e `adjustment` nos lançamentos exibidos. Conferência estática dos tipos, labels e consulta. |
| F12 | P3 · evolução | Título de fonte retornado pela busca podia ultrapassar o limite de 200 caracteres aceito ao salvar. | O título da citação é limitado sem alterar a URL. Teste do serviço cobre título longo e conclusão com uma cobrança. |

Arquivos centrais: [saldo](../../../packages/billing/src/credits/ledger-balance.ts), [reserva/consumo](../../../packages/billing/src/credits/reservations.ts), [cancelamento](../../../packages/billing/src/subscriptions.ts), [retenção](../../../apps/cozya/src/features/account/maintenance.ts), [limpeza](../../../apps/cozya/src/features/account/repository.ts), [cozinha](../../../apps/cozya/src/features/kitchen/repository.ts), [preparo](../../../apps/cozya/src/features/kitchen/components/cooking-view.tsx).

## Pagamentos: o que foi preservado e verificado

A evolução anterior não havia trocado checkout, provedor, webhook de assinatura/fatura, portal ou configuração de preços. Nesta revisão, as alterações financeiras são o saldo interno e seu uso no recibo, além da cobertura de estados no cancelamento da conta. A correção anterior de serialização JSON na liberação de reservas continua necessária e coberta por integração.

Os [testes de pagamento](../../../apps/cozya/test/payments.integration.ts) usam PostgreSQL descartável, o catálogo real, a rota HTTP do app e a verificação de assinatura do SDK Stripe. As chamadas de saída para criar checkout, portal e cancelamento usam um provedor simulado; não houve compra nem cancelamento na conta Stripe real.

| Cenário | Verificação local |
| --- | --- |
| Mensal e anual | R$14,90 / R$149 e respectivos Price IDs do catálogo; nenhum `trialDays` adicionado ao Stripe |
| Demonstração | 3 créditos uma vez; acesso temporário não se transforma em assinatura nem libera compra de pacote no Free |
| Retorno do checkout | O retorno isolado não concede Pro; o ciclo de assinatura é confirmado pelos eventos |
| Webhooks | Assinatura HMAC válida processada; requisição sem assinatura rejeitada; replay da fatura/pacote sem crédito duplicado |
| Créditos do Pro | Fatura concede 50; renovação mensal e rotina de concessão mensal do anual conferidas |
| Pacotes e portal | Pacote usa modo de pagamento e Price ID correto; 10 créditos uma única vez; retorno do portal preservado |
| Falha e cancelamento | Falha retira Pro quando o teste também acabou; cancelamento ao fim do período mantém acesso até encerrar; evento final retira Pro |
| Exclusão | Assinaturas incompletas e pausadas também entram no cancelamento imediato |
| Saldo após validade | Uso de créditos antigos não reduz indevidamente a nova concessão; reserva e consumo seguem o mesmo resultado |

Confirmar acesso por eventos, em vez de confiar apenas na página de retorno, segue a [orientação de webhooks de assinatura do Stripe](https://docs.stripe.com/billing/subscriptions/webhooks). `incomplete` e `paused` não são estados terminais: [ciclo de assinaturas](https://docs.stripe.com/billing/subscriptions/overview).

## Cobertura do restante da evolução

| Escopo original | Resultado da revisão |
| --- | --- |
| R01 — CRUD, detalhe e compartilhamento | Invalidação revisada; jornada editar → reabrir → WhatsApp → editar coberta no navegador |
| R02/R06 — voz, custo por tarefa, erros e replay | Reserva única e falha parcial cobertas nas suites; banco real cobre replay, concorrência, liberação e compensação; revisão ampliou retenção/limpeza |
| R03/R13 — privacidade e conta | Ausência de memória implícita e logs de conteúdo revisada; exportação/isolamento e limpeza legada testados; política atualizada para pendências de reconciliação |
| R04 — demonstração e limites | Ativação concorrente concede só 3 créditos, conta não verificada recusada, Free continua limitado a 15 receitas; cadastro chega ao dashboard |
| R05/R08/R09 — fonte e IA | Contratos, recusa, proveniência, runner e interface revistos. Avaliação paga anterior permanece como evidência histórica; esta rodada não refez chamadas pagas |
| R07/R11 — interface e preparo | Navegação, foco, contraste, diálogos, microfone, checklist/timer, tema e largura móvel cobertos; porções e adaptação ganharam regressões |
| R10 — semana e compras | Consultas/mutações pertencem ao usuário; plano livre, cópia sem sobrescrever, quantidades compatíveis, estado de compra e extras exercitados no banco/navegador |
| R12 — métricas | SQL agrega eventos sem conteúdo culinário; funil e custos executados em banco. Não são métricas de clientes ou prova de disposição a pagar |
| R14/R15 — segurança e entrega | Guards, CSP, limites de corpo, CI, migrations e suites compartilhadas revisados. Runner de integração agora cria e remove exclusivamente seu banco descartável |

## Migração e limites

A migration gerada **0034** acrescenta porções à sessão de preparo e a versão de conteúdo da receita, com limite de 1–100 porções. É aditiva e foi aplicada localmente. Como a evolução ainda não foi publicada, não há sessões desse novo preparo em produção; sessões de desenvolvimento anteriores à 0034 podem reiniciar uma vez por causa da nova versão. Publicação precisa incluir 0032, 0033 e 0034 via migrator.

O novo saldo não altera lançamentos financeiros nem exige backfill. Reconstitui apenas o histórico do dono/app solicitado, usando o índice de escopo existente. O custo de leitura cresce com esse histórico; monitorar latência e volume antes de escalar. A regra de consumo é por vencimento mais próximo, depois créditos sem vencimento. Registros de expiração continuam sendo auditoria do valor original da concessão, não um segundo débito.

Permanecem sem comprovação externa nesta revisão:

- Checkout hospedado, portal real, configuração do endpoint/segredo de webhook e concessões no ambiente publicado. Fazer ensaio em **Stripe test mode** conforme o [runbook](operacao-e-piloto.md), antes de validar cobrança real.
- Jobs de produção, entrega real de e-mails, backup/restauração, instalação em aparelhos físicos e comportamento de rede móvel.
- Precisão em fotos/áudios reais, preparo humano das receitas iniciais, retenção de famílias e conversão paga. A baseline anterior usa imagens sintéticas e teve uma recusa segura entre duas buscas; não equivale a sucesso universal.

## Verificação final

Evidências desta rodada em 11/09/2026. Suites e compilação executadas novamente após as correções. Mudanças finais somente em documentação não alteram o código verificado.

```text
VERIFICATION REPORT
-------------------
Claim: Formatação, lint e tipos passam no workspace atual
Command: pnpm check; pnpm typecheck
Executed: 11/09/2026, após as correções
Exit code: 0 em ambos
Output summary: Checked 807 files. No fixes applied. / Tasks: 11 successful, 11 total
Warnings: none
Errors: none
Verdict: PASS
```

```text
VERIFICATION REPORT
-------------------
Claim: Suites unitárias gerais passam
Command: pnpm exec turbo test --concurrency=1 --force; pnpm exec turbo test --concurrency=1
Executed: 11/09/2026; execução sem cache e nova verificação após ajuste de estilo do teste
Exit code: 0 em ambos
Output summary: Tasks: 6 successful, 6 total. 1.124 testes em 98 arquivos: Cozya 85, billing 185, ai-core 71, auth 216, emails 106, Agenda 461. A primeira execução teve 0 cached; a final, 5 cached e Cozya reexecutado.
Warnings: none
Errors: none
Verdict: PASS
```

```text
VERIFICATION REPORT
-------------------
Claim: Integração real de cozinha, pagamentos e retenção passa
Command: pnpm --filter @informach/cozya test:integration
Executed: 11/09/2026, após as correções
Exit code: 0
Output summary: Test Files 3 passed (3); Tests 21 passed (21). Migrations Drizzle e Mastra concluídas. Banco cozya_review_0df80f7f9ab3471f87d41ded0647c52c removido ao terminar.
Warnings: NOTICE de extensões já existentes e truncamento de um identificador de migration antiga do Agenda
Errors: none
Verdict: PASS
```

```text
VERIFICATION REPORT
-------------------
Claim: Jornada de navegador e regressões funcionais passam em Chromium local
Command: pnpm --filter @informach/cozya e2e
Executed: 11/09/2026, rodada isolada final
Exit code: 0
Output summary: 4 passed (1.8m). Cozinha: 50.3s; saída do microfone: 7.0s; OTP e cadastro aprovados. Nenhum pageerror na jornada principal.
Warnings: NO_COLOR ignorado porque o runner define FORCE_COLOR
Errors: none
Verdict: PASS
```

```text
VERIFICATION REPORT
-------------------
Claim: Avaliação possui todos os casos/fixtures, catálogo de preços permanece intacto e diff não tem erro de whitespace
Command: $env:EVAL_PREFLIGHT='1'; pnpm --filter @informach/cozya eval; git diff --quiet -- packages/config/src/products.ts; git diff --check
Executed: 11/09/2026, após as correções
Exit code: 0 em todos
Output summary: [eval] preflight passed: 22 cases, 5 image fixtures. Os comandos de diff concluíram sem diferenças no catálogo nem erros de whitespace.
Warnings: Git avisa sobre conversão futura LF/CRLF no Windows
Errors: none
Verdict: PASS
```

```text
VERIFICATION REPORT
-------------------
Claim: Build de produção passa nos quatro apps
Command: pnpm exec turbo build --concurrency=1 --cache=local:r
Executed: 11/09/2026, após as correções funcionais
Exit code: 0
Output summary: Tasks: 4 successful, 4 total. Cached: 2 cached, 4 total. Time: 3m0.365s. Cozya e Agenda recompilados; site e admin reutilizaram o cache válido. Cozya gerou 43/43 páginas; Agenda, 40/40.
Warnings: none
Errors: none
Verdict: PASS
```

O build recebeu somente variáveis de processo de verificação: URLs HTTPS fictícias, Stripe/IA com chaves dummy, e-mail sandbox e Sentry desativado. Os arquivos de ambiente não foram alterados. `--cache=local:r` permite ler cache válido e evita gravar novos arquivos grandes de cache; o código alterado foi compilado normalmente.

As primeiras execuções detectaram os defeitos de saldo, favorito e quantidade. Depois das correções, foi preciso alinhar um stub antigo de SQL à composição de consultas, usar clique seguido de espera no checkbox salvo pelo servidor e retirar uma asserção não nula de fixture. Uma execução do navegador com outras suites simultâneas excedeu 5 segundos no carregamento do detalhe; a captura final já tinha o conteúdo correto. A repetição isolada passou sem ampliar o timeout ou retirar a verificação. Uma tentativa de `diff --check` desativando artificialmente `autocrlf` interpretou CRLF como whitespace; o comando normal, com a configuração do repositório, passou.

As capturas finais foram inspecionadas: [compras](evidence/review-shopping-mobile.png), [preparo claro](evidence/review-cooking-mobile.png), [preparo escuro](evidence/review-cooking-dark-mobile.png). A [medição](evidence/review-ui-measurements.json) registrou contraste de 5,705:1 e altura de 48px no botão principal. As telas verificadas não transbordaram horizontalmente em 390×844. O indicador “N” é do servidor Next.js de desenvolvimento.
