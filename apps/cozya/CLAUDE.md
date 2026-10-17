# Cozya: produto e contratos de implementação

Atualizado em 17/10/2026. A base aprovada está em `docs/reviews/cozya-2026-09-11/implementacao.md`; operação e piloto em `operacao-e-piloto.md` na mesma pasta. A reformulação "Hoje tem" (Hoje como casa, marmitas, lista em duas fases, modo cozinha com "Como foi?" e nova página de vendas) está em `docs/propostas/cozya-hoje-tem-2026-10-17/implementacao.md`.

## Produto e preço

Ciclo principal: abrir no Hoje → escolher as receitas da semana com mesa e marmitas → levar a lista do mercado → cozinhar passo a passo e dizer como foi → repetir a semana.

- **Manter R$ 14,90/mês e R$ 149/ano**, conforme instrução expressa do usuário. Não alterar preços ou Price IDs nesta entrega.
- Pro: 50 créditos mensais, inclusive no anual por liberação mensal. Receitas sem limite comercial e planejamento/compras.
- Free: até 15 receitas simultâneas. Acervo, preparo e listas já criadas continuam acessíveis depois do teste.
- Teste de 14 dias com planejamento e 3 créditos de IA, sem cartão, com e-mail verificado e um por e-mail. Começa sozinho na primeira refeição com receita da própria casa colocada na semana (`ensurePlanning` em `features/kitchen/actions.ts`) ou ao escolher um caminho com IA em "Trazer uma receita"; não há botão de "ativar". Refeição sem receita nunca gasta o teste. A primeira semana roda com trava por conta (`withAccountLock`) e não planeja de novo se já há refeições. `getKitchenAccess` centraliza acesso; `hasProSubscription` continua controlando a compra de pacotes. A oferta do Pro só aparece no fim do teste.
- Pacotes existentes preservados: 10/R$ 6,90; 20/R$ 12,90; 30/R$ 17,90. A conta correta do crédito mensal é 14,90/50 = R$ 0,298. Não afirmar margem sem medir custos, taxas e suporte.

## IA e cobrança

- Uma tarefa concluída de captura, busca ou adaptação custa **1 crédito**. Voz completa agrupa transcrição e extração/pesquisa numa única reserva. Ditar um termo de busca no acervo é uma transcrição avulsa de 1 crédito, comunicada antes de gravar; busca digitada é gratuita.
- Reservar → executar → validar → confirmar. Falhas, material inválido e busca sem receita verificável liberam a reserva. Isso pode ter custo de provedor mesmo sem débito ao usuário.
- Toda rota exige autenticação, e-mail verificado, acesso, limite de corpo efetivo e rate limit. `Idempotency-Key` UUID + `runAiOperation` impede execução duplicada para a mesma operação/conteúdo. O UUID também identifica a reserva.
- Repetição recupera a resposta por 24h. `/receitas/recuperar` permite revisar resultados completos depois de recarregar a página. Cada etapa interna tem um run próprio ligado à reserva.
- Operações interrompidas ou com erro após débito são reconciliadas depois de 1h: liberação de reserva ou crédito compensatório idempotente válido por 30 dias. A rotina horária deve estar ativa em produção.
- Texto/pesquisa/adaptação: `openai/gpt-4o-mini`; imagem: `openai/gpt-4o`, detalhe **high**; áudio: `openai/gpt-4o-transcribe`. Gateway único OpenRouter. Modelos/fallbacks ficam em `src/ai/`.
- Pesquisa usa ferramenta web do OpenRouter, engine Exa, até 5 resultados e 1 chamada da ferramenta. A URL retornada precisa constar nas fontes reais da resposta. A extração confere os requisitos do pedido, podendo recusar uma receita semelhante que não os cumpra.
- Saída estruturada: metadados obrigatórios e anuláveis no schema de transporte; validação de URL http/https no servidor. Não enviar formato JSON Schema `uri` incompatível com o endpoint usado.
- Timeout de 90s por etapa; limites de saída explícitos e sem retries automáticos do wrapper. Nunca inferir rendimento desconhecido para escalar porções.
- Registrar custo USD apenas quando o provedor informar `usage.cost` (ou `usage.raw.raw.cost` na saída Mastra); ausência é **desconhecido**, nunca zero. Tokens não substituem custo de busca ou transcrição. As métricas mostram cobertura de custo conhecido.

## Dados e privacidade

- Mastra no Cozya é stateless: sem memória compartilhada, storage de conversa ou observabilidade que armazene conteúdo. Logs internos do framework estão desativados (`logger: false`), inclusive se a env pedir debug; o recorder sanitizado continua ativo. `agent_runs` guarda metadados operacionais, sem áudio, prompt, ingredientes, transcrição ou erro bruto.
- Perfil culinário é explícito e editável, sem inferência de alergias/religião. Preferências não são aplicadas silenciosamente à IA.
- Prévia de IA: leitura por 24h, remoção de conteúdo na rotina horária; metadados de operações/eventos/runs: 90 dias. Pendências de compensação preservam identificadores/estado até a reconciliação, inclusive além do lote de 100. Hash HMAC do e-mail previne repetição do teste; desvinculado é removido após 365 dias da ativação.
- Configurações oferecem exportação JSON, limpeza dos dados do Cozya e exclusão da conta Informach (escopo compartilhado explícito). Limpeza exige sessão recente; exclusão global requer confirmação por e-mail e encerra billing do Cozya. Assinaturas ativas de outros apps bloqueiam exclusão global.
- Falha da limpeza obrigatória impede exclusão no Cozya (`requireCleanupSuccess` opt-in). Operações de IA em andamento ou não reconciliadas também impedem a limpeza; registro de operação e limpeza compartilham bloqueio por usuário. O padrão dos outros apps permanece inalterado.
- `features/account/legacy-ai.ts` remove conversas antigas do Cozya pelo store instalado, preservando threads de outros apps. Schema `ai_mastra` pertence ao migrator Mastra, nunca ao Drizzle.

## Domínio e interface

- Tabelas do domínio em `packages/db/src/schema/cozya.ts`; gerar migrations com `pnpm db:generate`. Aplicar Drizzle + Mastra com `pnpm db:migrate`.
- Toda consulta/mutação inclui o proprietário autenticado. Limite Free e planejamento usam bloqueios transacionais para concorrência; checklists salvam intenções individuais para não sobrescrever progresso simultâneo.
- Ingredientes conservadores (`features/kitchen/ingredients.ts`): preservar texto, converter somente unidades compatíveis (kg/g, l/ml). Medidas desconhecidas, intervalos e rendimento ausente exigem conferência. Sem densidades ou equivalências inventadas. O preparo sai do nome e vira nota ("alho picado" e "alho amassado" somam numa linha); básicos de despensa e "a gosto" viram a pergunta da despensa; água de cozimento não entra na lista. Escalar com fator 1 ou sem rendimento devolve a linha original. Na lista, o que se compra inteiro (unidade) é arredondado para cima; na receita, não. A lista recalcula as linhas planejadas pelas regras atuais na leitura e marca `stale` quando diferem das gravadas; ao atualizar, só voltam para pegar os itens cuja quantidade mudou, e a despensa marcada como "falta" continua faltando. Na impressão, uma regra global esconde botões; as linhas da lista usam `data-print="keep"`.
- Refeição tem `servings` (total) e `lunchbox_servings` (marmitas, entre 0 e o total). A marmita do jantar aparece no almoço do dia seguinte sem criar refeição; a lista soma o total.
- Rotas: `/hoje` (casa; `/dashboard` redireciona), `/semana` (`?week=` e `?editar=<dia>:<lunch|dinner>`), `/compras` (`?fase=antes|mercado`), `/receitas`, `/receitas/[id]`, `/receitas/[id]/cozinhar` (grupo `(cook)`, sem cabeçalho; `?porcoes=`, `?marmitas=`, `?etapa=fim`), `/settings/account`. Preparo conserva `contentUpdatedAt`, porções, progresso e horário absoluto do timer; alterar conteúdo culinário reinicia o progresso. Favorito/nome/origem não reiniciam. Mudar as porções limpa somente ingredientes marcados. Wake lock depende do navegador/visibilidade.
- "Como foi?" grava `verdict` (`again`, `tweak`, `skip`) e `note` (até 500 caracteres) em `cozya.cooking_sessions`. A nota aparece no Hoje, na receita e no modo cozinha da próxima vez; "não repetiria" tira a receita do filtro "Faz tempo".
- `cooked_at` é o fim do preparo atual: o primeiro toque num dia novo começa outro preparo e o limpa. "Feita há…", a escolha da semana e "Faz tempo" leem `last_cooked_at`, que só muda ao concluir. Rótulos de dia usam dias de calendário em São Paulo (`daysBetween`, `cookedAgo` em `dates.ts`).
- A marmita derivada do jantar anterior nunca é a refeição a cozinhar no Hoje: aparece em "Também hoje". `/semana` carrega o jantar do domingo anterior para mostrar a marmita de segunda.
- Confirmar descarte de rascunhos, áreas de toque de 44px, descrição de diálogos, foco visível, redução de movimento. Laranja da marca usa texto marinho; textos de destaque usam `brand-ink`. Tokens do app (papel, tinta, laranja, sálvia, pêssego, com modo escuro) ficam em `app/globals.css`.
- PWA com entrada `/hoje`; requer internet. Não prometer offline, push ou instalação validada em todos os sistemas.
- Coleção inicial é autoral e revisável; ainda sem teste culinário humano. Adaptação de IA salva uma cópia após revisão. Não prometer adequação clínica ou ausência de alérgenos.

## Página pública de vendas

- Narrativa implementada em 17/10/2026: "O que tem pra janta? Já está decidido." → a semana em quatro momentos → demonstração de semana (mesa e marmitas), mercado e cozinha → caderno da família → marmita → mercado com WhatsApp → repetir a semana → planos → perguntas → convite final. Registro em `docs/propostas/cozya-hoje-tem-2026-10-17/implementacao.md`; a versão anterior está em `docs/proposals/cozya-home-2026-09-11/proposta.md`. Contato público só pelo direct do Instagram (`INFORMACH_CONTACT`). Seção "Quem faz" pendente de texto e foto da titular.
- Paleta editorial clara em `app/(marketing)/marketing.css`, com variáveis locais à `.cozya-marketing`. Não sobrescrever o tema da área autenticada.
- Demonstrações são locais, identificadas como exemplos e sem chamadas de IA, billing ou gravação na conta. `demo-data.ts` usa a coleção inicial e as funções reais de consolidação/porções. Alterar porções exige atualizar compras; marcações de quantidades alteradas são limpas e as demais preservadas.
- Controles de demonstração ficam desabilitados até a hidratação. Conteúdo público, FAQ nativo, preços e links de cadastro são legíveis sem JavaScript; isso não implica suporte sem JavaScript ao aplicativo autenticado.
- Loading compartilhado fica nos grupos `(app)` e `(auth)`, com componente em `components/page-loading.tsx`. Não recolocar `app/loading.tsx` envolvendo marketing: o fallback de streaming ocultava a home sem execução de JavaScript.
- Fotografias e imagem social em `public/marketing/`; origem editorial gerada documentada em `docs/proposals/cozya-home-2026-09-11/imagens-implementacao.md`. Preços continuam derivados do catálogo; a home destaca o total anual, preservando os links de onboarding por ciclo.

## Segurança e operação

- CSP com nonce e strict-dynamic **aplicada por padrão** (`CSP_ENFORCE=1`). `0` é modo diagnóstico explícito. `upgrade-insecure-requests` somente em produção; APIs de jobs/webhooks/health/ready têm exclusões específicas.
- `healthcheckPath` é `/api/ready`, não `/api/health`. O ready chama `checkSchemaReadiness()` de `@informach/db` e responde 503 enquanto o banco estiver atrás da última migração deste build — o migrator é um service separado, e sem esse portão um app publicado antes dele subia verde e servia erro. A comparação é "atrás", nunca "diferente": rollback do app sem desfazer migração continua passando. O `/api/health` segue sempre 200 de propósito, porque é ele que diz qual commit está servindo quando um deploy vai mal.
- Limite IA: 60 solicitações/hora/usuário; novas operações em teste: 6/dia/usuário e 100/dia global, além dos 3 créditos do teste. Redis obrigatório em produção.
- Não relaxar auth de produção por testes. `E2E_RELAX_AUTH_RATE_LIMITS=1` é rejeitado em produção.
- Preços/produtos: `packages/config/src/products.ts`. Seed versionado de custo em créditos: `packages/billing/src/seeds/credit-pricing.ts`; `pnpm db:seed` é idempotente.
- Stripe, webhooks, pacotes, renovações e jobs compartilhados: `packages/billing/PRODUCTION.md`. Confirmar Price IDs live e sandbox de pagamento antes de publicar.
- Jobs Cozya: POST `/api/jobs/cozya-retention` a cada hora; GET `/api/jobs/cozya-metrics` para diagnóstico agregado. Ambos exigem `Authorization: Bearer CRON_SECRET`. Não incluir o segredo em logs.

## Verificação

- `pnpm check`, `pnpm typecheck`, `pnpm test`, `pnpm build` no monorepo. Para máquinas com poucos recursos, `pnpm exec turbo test --concurrency=1` evita competição entre suítes.
- `pnpm --filter @informach/cozya test:integration`: PostgreSQL local com permissão de criar banco e Redis DB12. O runner cria/migra/remove exatamente um banco descartável `cozya_review_<uuid>`; a configuração recusa execução direta sobre o banco normal. Nunca truncate de tabelas compartilhadas.
- `pnpm --filter @informach/cozya e2e`: servidor local 3102, e-mails sandbox, IA/Stripe com chaves de teste não funcionais. Jornadas OTP, primeira semana, semana com marmitas, lista nas duas fases, modo cozinha com "Como foi?", página de vendas de 320 a 1440 px e gravação cancelada. Para reaproveitar um `next dev` já aberto: `E2E_SKIP_WEBSERVER=1 E2E_BASE_URL=http://localhost:<porta>`.
- Eval pago opcional: `pnpm --filter @informach/cozya eval`. Variáveis: `EVAL_PREFLIGHT=1` sem chamadas; `EVAL_FILTER` para subconjunto; `EVAL_JUDGES=1` adiciona juízes LLM; `EVAL_SNAPSHOT=1` grava baseline somente após conjunto completo aprovado. Não remover casos para ocultar regressão.
- 22 casos, 5 imagens sintéticas autorais. Fidelidade crítica avalia medidas, rendimento, incompletude, injeção e adaptação; disponibilidade de busca é métrica separada. Recusa segura não equivale a receita encontrada. Consultar baseline e metadados reais, sem apresentar testes sintéticos como validação culinária humana.

Teste pago de integração real, opt-in: definir `COZYA_LIVE_AI_SMOKE=1` e rodar `pnpm --filter @informach/cozya test:integration`. Exige banco local e chave real do OpenRouter; realiza duas chamadas curtas e verifica débito único, replay, liberação em recusa, custo reportado e ausência de conversas Mastra. Sem essa variável, a suíte usa IA desativada e nunca chama modelos.
