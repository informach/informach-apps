**Cozya — review técnico, funcional e de experiência**

11 de setembro de 2026. Complementa a [proposta de produto e negócio](proposta.md).

**A base está organizada e compilável, mas há problemas de confiança e lacunas no uso recorrente que devem preceder um lançamento pago.**

Escopo: código do Cozya, schema de receitas, integração com autenticação/cobrança/IA, página pública em produção, cadastro público, fluxo gratuito autenticado em ambiente local e verificações automatizadas. A conta local usada na navegação era sintética; a receita criada para a revisão foi excluída ao terminar.

As constatações abaixo distinguem reprodução no navegador, evidência estática e recomendação de produto. Não foram executadas chamadas pagas aos modelos, transações reais, campanhas, alterações em produção ou testes de invasão. A qualidade culinária das saídas de IA, a entrega real de e-mails, a cobrança real e métricas de desempenho em campo permanecem sem validação nesta revisão.

**O núcleo atual entrega um acervo pessoal; partes da capacidade descrita ainda não chegam ao usuário.**

| Capacidade | Evidência | Avaliação |
| --- | --- | --- |
| CRUD de receitas | Interface, actions, service e repository; criação/edição/leitura/exclusão exercitadas localmente | Funciona no fluxo observado, com defeito de atualização do detalhe |
| Busca e favoritos | Busca por título sem acento, favoritos primeiro, índices e paginação | Base útil; busca por ingrediente e filtros culinários não foram encontrados |
| Foto, texto e voz | Componentes e rotas correspondentes | Implementados; não equivale a comprovação de precisão dos modelos |
| Pesquisa por descrição | Pesquisa web seguida de extração estruturada | Implementada; origem não é preservada no registro final |
| Refinamento de receita | Rota /api/ai/recipes/refine, serviço e agente | Não encontrei chamada dessa rota na interface de receitas |
| Importação por URL | Modelo e preço da feature aparecem no catálogo | Não encontrei rota/serviço/interface de importação de uma URL fornecida pelo usuário |
| Compartilhamento | Link wa.me com texto completo | Não é colaboração de acervo nem integração de entrada com WhatsApp |
| Perfil culinário | Template de memória de IA por usuário | Não encontrei interface para revisar, corrigir ou apagar esse perfil |
| PWA | Manifesto e ícones | Não encontrei service worker, offline ou push; instalação real em iOS/Android não foi testada |
| Planejamento e compras | Ausentes nas rotas e no modelo do domínio examinado | São evolução de produto, não simples mudança visual |

**Há boas decisões que devem ser mantidas.**

As consultas e mutações de receitas incluem o usuário autenticado; o limite gratuito usa transação com bloqueio por usuário; as entradas são validadas; o dashboard pagina e carrega os detalhes sob demanda. O billing separa reserva, confirmação e liberação de créditos. Há limites de uso, configuração de segurança, testes de pacotes, observabilidade e estados de erro.

Essas evidências sustentam uma evolução incremental. Não demonstram segurança exaustiva nem eliminam a necessidade de testes das jornadas reais. Em particular, o defeito do detalhe mostra que testes unitários de repositório não cobrem toda a experiência.

**Prioridades dos achados.**

P1: corrigir antes do piloto pago ou antes de anunciar a capacidade afetada. P2: incluir na estabilização e evolução do produto. A prioridade expressa impacto neste estágio; não é uma classificação formal de vulnerabilidade.

| ID | Prioridade | Achado | Base da conclusão |
| --- | --- | --- | --- |
| R01 | P1 | Detalhe e compartilhamento usam receita antiga depois de editar | Reproduzido no navegador |
| R02 | P1 | Voz consome duas operações cobradas onde a comunicação promete uma captura/um crédito | Fluxo e cobrança rastreados no código |
| R03 | P1 | Política de privacidade contradiz persistência configurada de IA | Política, factory de memória e transcrição |
| R04 | P1 | Entrada gratuita não demonstra a principal promessa da página | Página pública, conta local Free e guards |
| R05 | P1 | Fontes da receita pesquisada são descartadas; promessa de precisão é forte demais | Prompt, schema e interface |
| R06 | P1 | Créditos esgotados e falhas de rede têm recuperação insuficiente | Tratamento de exceções e estado dos componentes |
| R07 | P1 | Contraste insuficiente no botão principal em tema claro | Medição no navegador: aproximadamente 2,63:1 |
| R08 | P1 | Avaliação de qualidade de IA não tem fixtures de imagem nem baseline no checkout | Dataset, arquivos presentes e runner |
| R09 | P2 | Refinamento existe no backend sem caminho encontrado na interface | Busca por referências e navegação |
| R10 | P2 | Texto livre limita porções, compras e planejamento | Schema e parser |
| R11 | P2 | Experiência de preparo, rascunho e navegação é frágil | Componentes e comportamento observado |
| R12 | P2 | Não há instrumentação identificada para medir o benefício semanal | Busca no código; logs atuais são principalmente operacionais |
| R13 | P2 | Exclusão/exportação e controle do perfil não aparecem no autosserviço | Menu, rotas e política |
| R14 | P2 | Segurança e custo operacional precisam de validação adicional | Headers públicos, código e documentação |
| R15 | P2 | E2E tem cobertura estreita e logout do teste não é verificado | Execução, logs e leitura dos testes |

**R01 — a receita pode parecer atualizada e ainda mostrar quantidades antigas.**

[recipe-card.tsx:42](../../../apps/cozya/src/features/recipes/components/recipe-card.tsx): o estado fullRecipe é reutilizado quando o ID coincide. Depois de uma edição, router.refresh atualiza os dados recebidos do servidor, mas esse estado local continua contendo a versão anterior. O card permanece com a mesma chave.

Reprodução em conta local Free:

1. Criei “Receita de revisão — omelete” com “2 ovos”.
2. Editei o nome para “Receita de revisão — omelete atualizada” e a quantidade para “3 ovos”.
3. A lista exibiu o nome novo e o aviso de sucesso.
4. Ao abrir, o diálogo mostrou o nome antigo e “2 ovos”; o link de compartilhamento também continha “2 ovos”.
5. Depois de recarregar a página, o diálogo e o link mostraram o nome novo e “3 ovos”.

Evidências: [antes da recarga](evidence/recipe-stale.md) e [depois da recarga](evidence/recipe-reloaded.md). O destino do WhatsApp foi inspecionado; nenhuma mensagem foi enviada.

Correção proposta: tornar explícita a invalidação ou atualização do detalhe após mutações, usando a versão atual da receita. Validar editar → reabrir → compartilhar → editar novamente, sem recarga. O comportamento atual pode fazer a pessoa cozinhar com quantidades antigas ou sobrescrever alterações numa edição posterior.

**R02 — a unidade vendida não coincide com a jornada de voz.**

[voice-recipe-dialog.tsx:59 e 83](../../../apps/cozya/src/features/recipes/components/voice-recipe-dialog.tsx): chama transcrição e, depois, parse de voz. [transcribe-service.ts:65](../../../apps/cozya/src/features/ai/transcribe-service.ts) e [parse-recipe-service.ts:34](../../../apps/cozya/src/features/ai/parse-recipe-service.ts) fazem cobranças independentes de um crédito.

O caminho “falar descrição → buscar receita” também soma transcrição e pesquisa, embora [prompt-recipe-dialog.tsx:169](../../../apps/cozya/src/features/recipes/components/prompt-recipe-dialog.tsx) informe um crédito. A [demonstração comercial:219](../../../apps/cozya/src/components/marketing/sections/ai-demo.tsx) diz um crédito por captura.

Com apenas um crédito, a transcrição pode ser concluída e cobrada, deixando a segunda operação sem saldo para gerar a receita. Isso é uma consequência do fluxo estático; não executei uma cobrança real para reproduzi-la.

Correção proposta: definir o preço total por tarefa e reservar o fluxo completo no servidor, com política explícita de falha parcial. O fluxo de pesquisa já agrupa duas etapas internas numa única reserva e oferece uma referência de arquitetura.

**R03 — o contrato de privacidade precisa refletir a implementação.**

[privacidade/page.tsx:61](../../../apps/cozya/src/app/(marketing)/privacidade/page.tsx): afirma que prompts e respostas não são armazenados após processamento, salvo quando a receita é salva.

[ai/index.ts:45](../../../apps/cozya/src/ai/index.ts): configura storage PostgreSQL e memória persistente, compartilhada por usuário. [working-memory.ts](../../../apps/cozya/src/ai/working-memory.ts) inclui alergias e restrições religiosas/éticas. [transcribe-service.ts:76](../../../apps/cozya/src/features/ai/transcribe-service.ts) grava um trecho da transcrição em metadata, independentemente de salvar uma receita.

O hook de exclusão em [auth.ts:120](../../../apps/cozya/src/lib/auth.ts) cuida da cobrança; não encontrei nele limpeza explícita de memória/traces de IA. Não consultei dados pessoais em produção nem confirmei a retenção efetiva de cada fornecedor.

Correção proposta: inventariar os dados realmente retidos, definir propósito e prazo, remover o que não é necessário e testar exclusão dos dados associados. O perfil deve ser visível e corrigível pelo usuário. Rever as afirmações sobre descarte por fornecedores e a política com base no comportamento comprovado. Este achado é uma divergência técnica/documental, sem conclusão jurídica de conformidade.

**R04 — o momento de experimentar valor chega tarde.**

A [chamada final:45](../../../apps/cozya/src/components/marketing/sections/final-cta.tsx) promete a primeira receita estruturada por IA em um minuto e convida a começar grátis. Na conta gratuita examinada, quatro dos cinco métodos levam ao Pro; apenas o manual está liberado.

[new-recipe-method-dialog.tsx:35](../../../apps/cozya/src/features/recipes/components/new-recipe-method-dialog.tsx) e [features/ai/_shared.ts:72](../../../apps/cozya/src/features/ai/_shared.ts) confirmam a regra. O cadastro ainda passa por verificação e escolha de plano.

Correção proposta: alinhar imediatamente a comunicação e experimentar uma demonstração limitada, com direito de uso específico e protegido. Medir primeira tarefa concluída, retorno e conversão. Não há dados atuais que permitam quantificar o abandono causado por essa barreira.

**R05 — a IA encontra uma receita, mas o usuário não consegue conferir de onde veio.**

[research-recipe-prompt.ts:25](../../../apps/cozya/src/features/ai/research-recipe-prompt.ts) solicita resposta “sem links”. O [schema:20](../../../packages/db/src/schema/cozya.ts) não armazena fonte, autor, rendimento, tempo ou evidência de verificação. O campo usedWebSearch recebe true pelo desenho da integração; isso não demonstra que uma receita está correta nem que é a mais popular.

A [página de recursos](../../../apps/cozya/src/components/marketing/sections/features.tsx) anuncia que a IA valida e não inventa ingredientes. Um prompt e uma saída estruturalmente válida não comprovam essa garantia.

Correção proposta: preservar URL e autoria quando disponíveis, separar conteúdo extraído de adaptação gerada e sinalizar trechos incertos. Não substituir silenciosamente uma receita incompleta por uma inventada. Usar fontes e conteúdo autorizados para coleções públicas. Medidas, rendimento e passos precisam de avaliação humana em amostras reais.

O refiner pode realizar adaptações alimentares, mas não há comprovação de adequação para dietas clínicas ou alergias. Esse uso não deve sustentar a promessa inicial de produto.

**R06 — falhas previsíveis aparecem como indisponibilidade genérica.**

[from-prompt/route.ts:57](../../../apps/cozya/src/app/api/ai/recipes/from-prompt/route.ts) e outras rotas convertem exceções, incluindo falta de créditos vinda da reserva, em erro genérico 502. [_ai-http-errors.ts](../../../apps/cozya/src/features/recipes/components/_ai-http-errors.ts) trata 403, 429 e 503, sem caminho específico para saldo esgotado.

Os handlers de texto, imagem e descrição usam await fetch após mudar o estado para “processando”, sem try/finally abrangendo rejeição de rede. Se fetch rejeitar, o estado pode permanecer processando e a orientação de recuperação não aparece.

Também há cobrança quando uma pesquisa termina normalmente com “não encontrada”: o custo calculado é fixo e a resposta negativa é retornada dentro da reserva. Isso é uma decisão implementada e testada, mas precisa estar clara para o usuário.

Correção proposta: respostas distintas para falta de saldo, limite, conteúdo inválido e falha do provedor; restaurar estado em falhas de rede; preservar o material enviado; permitir repetição segura; mostrar o destino de cada crédito. Política de estorno deve considerar custo, abuso e resultado percebido.

**R07 — a identidade visual precisa de uma variante acessível para ações.**

[globals.css:20](../../../apps/cozya/src/app/globals.css): o botão “Nova receita”, no tema claro, usa texto branco sobre laranja. No navegador, o texto tinha 14 px/peso 500; as cores resolvidas eram RGB(255,255,255) e RGB(254,120,66), com contraste aproximado de 2,63:1.

Texto desse tamanho exige ao menos 4,5:1 para o critério AA de contraste. [W3C, contraste mínimo](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

Correção proposta: texto escuro sobre o laranja, ou fundo mais escuro para botões com texto branco, preservando a cor de marca em elementos adequados. Conferir hover, foco e estado desabilitado.

Achados complementares de interface, seguindo as [diretrizes examinadas](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md):

- [recipe-view-dialog.tsx:53](../../../apps/cozya/src/features/recipes/components/recipe-view-dialog.tsx): aviso de descrição acessível ausente emitido pelo componente no navegador.
- [features.tsx:63](../../../apps/cozya/src/components/marketing/sections/features.tsx): transition-all; especificar propriedades e respeitar redução de movimento.
- [recipe-form-dialog.tsx:159](../../../apps/cozya/src/features/recipes/components/recipe-form-dialog.tsx): fechar reinicializa os campos, sem confirmação de alterações não salvas.
- Botões de ação do card têm 36 px; aumentar a área de toque é uma melhoria prática para uso na cozinha, sem afirmar violação de tamanho mínimo.

No dashboard Free examinado em 390 × 844, a largura do documento foi de 390 px, sem rolagem horizontal. Isso não substitui uma auditoria de todas as telas, tamanhos, teclado e leitores de tela.

**R08 — a qualidade culinária ainda não tem uma base verificável de regressão.**

O [dataset](../../../apps/cozya/src/ai/recipe-parser/evals/dataset.ts) contém 14 casos, quatro deles de imagem. A pasta fixtures contém somente .gitkeep e o baseline não está presente neste checkout. O [runner:194](../../../apps/cozya/scripts/run-evals.ts) pula imagens ausentes; sem baseline, não faz uma comparação histórica.

Correção proposta: adicionar fotos reais autorizadas e resultados revisados, testar erros de quantidade/unidade, imagens cortadas, manuscrito, receita incompleta, mistura de receitas e instruções maliciosas dentro do conteúdo. Incluir falha parcial de voz e avaliações do refinamento. Não anunciar qualidade medida sem executar esse conjunto.

Não executei avaliações pagas nesta revisão. Os 519 testes unitários relatados abaixo não são 519 testes de receitas geradas por IA.

**R09 a R13 — utilidade semanal exige alguns fundamentos novos.**

[refine/route.ts](../../../apps/cozya/src/app/api/ai/recipes/refine/route.ts): expor refinamento só depois de definir revisão das alterações, custo e critérios de qualidade. Ter o agente no backend não significa que a funcionalidade está entregue.

[schema/cozya.ts:20](../../../packages/db/src/schema/cozya.ts): ingredientes e preparo são texto livre. Evoluir para ingredientes com texto original, quantidade, unidade e identificação normalizada; rendimento/porções; passos; tempos; origem e estado de revisão. “A gosto”, intervalos e itens desconhecidos precisam continuar válidos.

A extração deve continuar fiel ao original. A estrutura adicional pode ser preenchida progressivamente, sem forçar um processamento pago de todo o acervo.

[recipe-view-dialog.tsx:34](../../../apps/cozya/src/features/recipes/components/recipe-view-dialog.tsx): a marcação de ingredientes é efêmera e reinicia ao abrir. O detalhe vive num modal sem URL própria. Propor página de preparo com retorno ao ponto anterior, passos separados, temporizadores e tela ligada quando disponível. O acervo e a lista selecionada podem ganhar offline depois de planejar isolamento por conta e limpeza no logout.

[manifest.ts](../../../apps/cozya/src/app/manifest.ts): start_url aponta para a raiz pública. Avaliar entrada direta no app para quem instalou, respeitando a sessão. Corrigir também a FAQ que ainda trata a versão instalável como futura.

Não encontrei eventos de ativação, plano concluído ou receita cozinhada; existem logs de CRUD e telemetria operacional de IA. A instrumentação proposta deve medir ações e resultado, minimizando conteúdo pessoal.

[user-menu.tsx](../../../apps/cozya/src/components/app-shell/user-menu.tsx): oferece assinatura e saída, sem exportação, exclusão ou gerenciamento do perfil. A política menciona exclusão pelas configurações. O endpoint de exclusão habilitado no auth não substitui um caminho encontrável e testado para o usuário.

**R14 — operação, segurança e margem precisam ser tratadas como contratos verificáveis.**

Em 11/09/2026, a raiz pública respondeu 200 com HSTS e CSP em Report-Only, sem CSP aplicada para bloqueio. Isso é compatível com o default do código; não demonstra exploração. Após revisar os relatórios de violação, ativar a política e validar os fluxos essenciais.

Os limites de upload incluem checagem de Content-Length, mas ela não limita a leitura de um corpo sem esse header. Antes de abrir uma demonstração de IA, verificar limites reais no proxy/servidor e implementar leitura limitada onde necessário. Não executei teste de carga ou exploração.

A documentação do app diverge do código em alguns pontos: limite de IA documentado como 10/h, mas catálogo atual em [rate-limit.ts:108](../../../apps/cozya/src/lib/rate-limit.ts) é 60/h; cálculos de preço por crédito ainda usam 30 em alguns comentários, enquanto a assinatura entrega 50. Corrigir documentação e testes de contrato das mensagens.

A pesquisa usa um plugin web que possui cobrança própria, além do modelo e da segunda etapa. A documentação atual do OpenRouter apresenta custo do plugin por engine; no caso Exa Auto, US$ 0,007 por solicitação, mais tokens. A engine efetiva e o uso devem ser medidos, sem assumir esse preço para todos os fluxos. [OpenRouter, plugin de busca](https://openrouter.ai/docs/guides/features/plugins/web-search).

A documentação de migração classifica o plugin como deprecated e apresenta a server tool. A migração precisa preservar o requisito de pesquisa: a ferramenta nova permite que o modelo decida quando buscar. Não basta trocar o nome da opção. [OpenRouter, server tool](https://openrouter.ai/docs/guides/features/server-tools/web-search).

Prioridades operacionais: custo monetário por tarefa e por cliente, latência, taxa de falha, reconciliação do ledger, processamento de webhooks, comportamento com saldo zero, cancelamento e restauração de backup. A presença de jobs e testes não comprova configuração correta de todos eles em produção.

**R15 — os testes verdes cobrem contratos úteis, mas não a jornada inteira.**

Os dois testes Playwright atuais usam principalmente APIRequestContext para autenticação. Não cobrem cadastro de receita, edição, persistência visual, captura, compra, cancelamento, navegação mobile e qualidade culinária.

Na execução observada, o helper de login por OTP chamou sign-out, recebeu 415 e não verificou o resultado. [auth.signin-otp.spec.ts:38](../../../apps/cozya/e2e/auth.signin-otp.spec.ts). O teste comprova a resposta aceita de login por OTP, mas não comprova corretamente a transição de uma sessão encerrada para uma sessão nova. Corrigir a requisição de saída e afirmar que a sessão ficou ausente antes de prosseguir.

A primeira execução com servidor frio teve timeout de 10 segundos no signup. Com servidor previamente iniciado e rota de auth carregada, a mesma suíte passou sem alteração no código dos testes. Registrar esse limite evita tratar uma falha de partida como prova de falha em produção.

Testes de maior valor para a próxima entrega: edição refletida no detalhe e no compartilhamento; isolamento entre duas contas; limite gratuito sob concorrência com banco real; voz com saldo insuficiente; falha parcial com reserva; geração com revisão; cancelamento e acesso ao acervo; exclusão de dados associados. Evitar testes que apenas reproduzem a implementação com mocks.

**Verificações executadas nesta revisão.**

Usei os princípios da skill cy-final-verify para limitar cada conclusão ao que foi efetivamente verificado. Horários referem-se a 11/09/2026, America/Sao_Paulo. Nenhum código de implementação foi alterado.

| Verificação | Comando | Resultado e alcance |
| --- | --- | --- |
| Tipos do app | pnpm --filter @informach/cozya typecheck | Exit 0, tsc --noEmit |
| Unitários do app | pnpm --filter @informach/cozya test | 15 arquivos; 59 testes passaram |
| Pacotes compartilhados | pnpm --filter @informach/billing --filter @informach/auth --filter @informach/ai-core test | Auth: 215; billing: 175; AI core: 70; exit 0 |
| Lint/formatação do app | pnpm exec biome check apps/cozya | 175 arquivos; sem correções; exit 0 |
| E2E com servidor frio | pnpm --filter @informach/cozya e2e | Um passou; um falhou por timeout de 10 segundos no signup |
| E2E com servidor já iniciado | E2E_SKIP_WEBSERVER=1; pnpm --filter @informach/cozya e2e | Dois passaram; limitação de logout descrita em R15 |
| Build | pnpm --filter @informach/cozya build | Exit 0; compilação, TypeScript e geração de 35/35 páginas |
| Navegação local | Login por senha; criar, editar, abrir e excluir receita | R01 reproduzido; dados atualizados confirmados depois de recarga |
| Público | Landing, cadastro e headers | Site disponível; CSP Report-Only; análise mobile |

O build usou valores de teste para Stripe/IA, sandbox de e-mail e envio de sourcemaps ao Sentry desativado. Validou compilação e geração de páginas; não validou integração financeira real. Testes de autenticação usaram banco local e e-mails em sandbox.

```text
VERIFICATION REPORT
-------------------
Claim: App compila e passa nas verificações estáticas e unitárias listadas; não é uma declaração de prontidão comercial.
Command: pnpm --filter @informach/cozya typecheck; pnpm --filter @informach/cozya test; pnpm --filter @informach/billing --filter @informach/auth --filter @informach/ai-core test; pnpm exec biome check apps/cozya; pnpm --filter @informach/cozya build.
Executed: 11/09/2026, nesta revisão, aproximadamente 10:39–10:49.
Exit code: 0 para os comandos acima.
Output summary: 59 + 215 + 175 + 70 = 519 testes; Checked 175 files; Compiled successfully; Generating static pages (35/35).
Warnings: Build informa uso do experimento clientTraceMetadata.
Errors: Nenhum nesses comandos.
Verdict: PASS
```

```text
VERIFICATION REPORT
-------------------
Claim: A suíte E2E passa também na inicialização fria.
Command: pnpm --filter @informach/cozya e2e.
Executed: 11/09/2026, aproximadamente 10:41.
Exit code: 1.
Output summary: 1 failed; 1 passed; apiRequestContext.post: Timeout 10000ms exceeded.
Warnings: NO_COLOR ignorado na presença de FORCE_COLOR.
Errors: Timeout no signup usado pelo teste de login OTP.
Verdict: FAIL
```

```text
VERIFICATION REPORT
-------------------
Claim: Os dois testes E2E existentes passam com servidor iniciado e auth carregado.
Command: E2E_SKIP_WEBSERVER=1; pnpm --filter @informach/cozya e2e.
Executed: 11/09/2026, aproximadamente 10:44.
Exit code: 0.
Output summary: 2 passed (2.0s).
Warnings: NO_COLOR/FORCE_COLOR; o helper não verifica a resposta de logout, conforme R15.
Errors: Nenhum apontado pelo runner nesta execução.
Verdict: PASS
```

**A ordem de implementação sugerida acompanha o risco para quem usa.**

Primeiro R01, R02, R03, R05, R06 e R07: receita correta na tela, cobrança compreensível, dados tratados conforme o contrato e recuperação de falhas. Em seguida R04 e R08: demonstrar valor com qualidade avaliada. Depois, estruturar o domínio e entregar o ciclo semanal da proposta, com instrumentação desde o início.

O resultado desta revisão é uma proposta e uma lista de achados, com evidências. As correções descritas ainda precisam ser implementadas e verificadas.
