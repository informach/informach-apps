# Operação do Missão Saber

Publicado em 13/09/2026 em https://missao-saber.informach.com.br. A versão comercial atende estudantes do 2º ano à 3ª série do ensino médio (onda 1 de 8º/9º, OBMEP N2, Canguru C e OLITEF N2; onda 2 de 3º a 5º, Canguru P e Mirim 2; onda 3 do ensino médio, OBMEP N3, Canguru J, Canguru S e OLITEF N3; e onda 4 de 2º e 3º, Mirim 1, publicadas em 26/09/2026) e permanece com `noindex` enquanto a família valida o produto. Compra e estudo não dependem de aprovação de conteúdo.

## Serviços

| Recurso | Configuração atual |
| --- | --- |
| Railway | Projeto `informach-apps`, ambiente `production` |
| Aplicação | Serviço `91f572ad-b55c-4938-9967-0650c90e49c6`; deployment `b7aa6d9e-26f1-4b20-8b95-2a5c10a07815` |
| Cron e monitor | Serviço `5a361c2e-96d0-4dbc-9993-f7c0ff3cd13b`, a cada cinco minutos |
| Cron do resumo semanal | Serviço `446b4a71-3a35-4be3-be99-743ac72688e3` (`cron-missao-saber-weekly-report`), criado em 26/09/2026, com build pelo `infrastructure/railway/missao-weekly-cron.Dockerfile` e agenda `0 12 * * 1,2` (segunda e terça, 9h em Brasília; a terça só reenvia falhas da segunda). Imagem, agenda e comando estão em `.railway/railway.ts`; para copiar de novo `CRON_SECRET`, `APP_ORIGIN` e as variáveis do Sentry do app para os dois crons: `python apps/missao-saber/scripts/production.py sync-cron-variables` e redeploy dos crons |
| PostgreSQL | Compartilhado; o laboratório requer as migrações aditivas `0065`–`0067`; conferir o banco publicado com `production:verify-schema` |
| Redis | Compartilhado, com prefixos exclusivos do Missão Saber |
| Sentry | Organização `informach-nucleo-de-aprendizag`, projeto `missao-saber` |
| Cloudflare | CNAME para `aijyebw0.up.railway.app`, proxy ligado |
| SendGrid | Fila compartilhada; eventos assinados processados pelo Cozya |

O build executa `pnpm install --frozen-lockfile --prod=false && pnpm build:missao-saber`; o start executa `pnpm start:missao-saber`. `/api/ready` verifica PostgreSQL e Redis, e `/api/health` identifica o deployment. Produção rejeita chaves Stripe de teste, e-mail sandbox, preços ausentes e URLs incoerentes. Os segredos ficam apenas na Railway e nos ambientes locais ignorados pelo Git.

## Ordem de deploy com migração nova

O migrator é um serviço à parte, configurado em `.railway/railway.ts`, com Watch Paths em `packages/db/**`, nos seeds de billing, em `packages/ai-core/**`, em `escolas_inep.csv.gz` e nos manifests da raiz. Missão Saber, Cozya, Agenda da Turma, Suíte Edi e o Bastidores só recebem tráfego quando `/api/ready` confirma que o banco não está atrás do build. Um push que traz migração nova e mexe em `packages/db` dispara juntos o migrator e os deploys de Missão Saber, Cozya e Agenda; os deployments antigos continuam servindo até os novos passarem no healthcheck. Por isso:

1. `git push` para `main`.
2. Railway: conferir que o `migrator` ganhou um deployment no commit do push e esperar SUCCESS, com `[db:migrate] done.` no log. Se o push não disparou o migrator, usar Deploy Latest Commit; nunca Redeploy de um deployment antigo, que roda o commit antigo sem a migração nova. Uma falha depois da migração, no `db:seed:reference` (busca no IBGE), marca o deployment como FAILED com o banco já migrado: o log diz qual foi o caso.
3. Railway: redeploy de Missão Saber, Cozya e Agenda da Turma se algum deploy do push falhou no healthcheck (Cozya e Agenda esperam só 30 s). O redeploy usa o mesmo commit, que é o certo aqui.
4. Conferir `/api/ready` dos três, o commit em `/api/health` e rodar `DATABASE_PUBLIC_URL=… pnpm --filter @informach/missao-saber production:verify-schema`, que compara com o journal do checkout.

As migrações desta atualização são compatíveis com o código que já está no ar, então aplicar antes ou depois do push é seguro. O rollback de código continua possível para o schema, mas não para os dados: depois que a versão nova rodar, podem existir perfis com anos escolares e trilhas que a versão antiga não conhece. Voltar para um deployment anterior a esta atualização exige conferir esses perfis antes.

## Banco, migrations e recuperação

A migração `0063` (26/09/2026) abre o perfil para todos os anos escolares: `grade` aceita de 1 (1º ano) a 12 (3ª série do EM), `grade_year` guarda o ano civil a que o ano escolar se refere e `birth_month` guarda só mês e ano de nascimento, opcional, para sugerir o ano pela regra de corte de 31 de março. O ano efetivo avança sozinho em 1º de janeiro; se a trilha gravada não cobre o ano novo, as páginas mostram a sucessora da mesma linha (a OBMEP Mirim segue para a OBMEP) e a gravação acontece na primeira missão. Os formulários só oferecem anos que têm trilha publicada. A mesma migração indexa `reports.user_id`. Antes dela, a `0054` criou `sessions.reading_support` e a `0056` criou `families.weekly_report_email` e a tabela `family_challenges`.

A migração `0075` (31/10/2026) é só aditiva: cria `competitions`, `competitors`, `competition_turns` e `puzzle_solves` para a competição em família e os desafios de peças do laboratório. É compatível com o código anterior, então aplicar antes ou depois do push é seguro. Rollback de código sem desfazer a migração continua passando no `/api/ready`; as competições criadas nesse intervalo ficam guardadas, só sem tela.

As migrations `0044` a `0049` adicionaram controles de conteúdo, interrupção segura, acesso por perfil, relatos versionados, atualizações de relatório e confirmação financeira. A `0047` removeu a antiga tabela `missao_saber.releases`; não existe fluxo de publicação ou aprovação no runtime.

Antes da atualização foi criado o backup Railway `109e5c1e-d8a4-4c76-82ad-3129e3d3cb7f`, `pre-missao-comercial-0044-0049-2026-09-13`. O dump físico, com 14.405.814 bytes, foi restaurado em PostgreSQL descartável: 44 migrations de origem, 100 tabelas e 13 usuários. Depois da atualização, `production:verify-schema` confirmou 50 migrations, remoção de `releases` e presença dos novos campos e tabelas.

Em falha de aplicação, promover o último deployment saudável compatível com o schema. Restaurar o PostgreSQL compartilhado afeta os outros produtos e exige janela coordenada; não usar restauração do banco como rollback automático de código. Nunca usar `db:push` em produção.

## Catálogo e manutenção

A expansão do laboratório de 03/10/2026 acrescenta 19 famílias de ferramentas e 379 modos, selecionados por ano escolar e trilha. São 1.522 associações entre missão e modo, cobrindo 291 missões e 116 retomadas (2.972 itens de ensino e retomada); os 336 itens reservados ficam fora do laboratório. `pnpm --filter @informach/missao-saber laboratory:coverage` regenera a matriz. O [relatório da implementação](../../docs/propostas/missao-saber-laboratorio-2026-10-03/implementacao-e-verificacao.md) registra revisões, evidências e a validação pedagógica ainda dependente de participantes.

As migrations `0065`–`0067` criam `lab_executions`, anexo opcional no caderno, marcos e identidade de criação. As três ferramentas antigas e seus dados permanecem preservados; a biblioteca permite importar uma cópia quando elegível. A ajuda na missão é registrada antes da exposição da ferramenta. Transferência com apoio reduzido continua separada da evidência de autonomia.

O catálogo comercial contém 291 missões e 2.960 atividades autorais únicas: 2.624 de ensino/prática e 336 reservadas em 28 bancos de diagnóstico e simulado. Há 175 desafios de justificativa; a cobertura do laboratório está detalhada acima. As habilidades das faixas novas vivem em `src/features/content/skills/` (um arquivo por habilidade) e as trilhas em `src/features/content/tracks/`; os números são conferidos por snapshot em `inventory.test.ts`, atualizado de propósito a cada lote. Cada lote tem registro em `docs/propostas/missao-saber-2026-09-13/lotes-de-autoria/` e recebe revisão matemática independente antes de os hashes entrarem em `reviewed-catalog.ts`. As 336 questões reservadas formam 116 famílias semânticas compartilhadas entre diagnóstico e simulado, de modo que o produto identifica corretamente a segunda exposição como prática. A numeração interna que mantém cada questão distinta no catálogo não aparece para o estudante. OLITEF N1, Canguru E, Canguru B e OBMEP N1 compartilham fundamentos sem duplicar a contagem.

`MISSAO_CONTENT_MANAGER_EMAILS=helena@informach.com.br` dá acesso à manutenção para uma conta verificada. `/manutencao` permite consultar relatos, pausar uma unidade com problema, corrigir, invalidar a evidência atingida e reativar. Esse é um controle de incidente; não existe fila editorial nem aprovação prévia.

## Stripe

| Plano | Mensal | Anual | Perfis |
| --- | --- | --- | --- |
| Missão Saber Individual | R$ 29,90 | R$ 299,00 | 1 |
| Missão Saber Família | R$ 44,90 | R$ 449,00 | até 3 |

Os produtos `missao_saber_individual` e `missao_saber_family` existem nos modos teste e produção com nomes e descrições em linguagem natural e a imagem atual do app. Os quatro preços, o Portal e o webhook são separados por modo. Em produção:

- preços: `price_1UFGGOCvOctqao30UY082JQo`, `price_1UFGGPCvOctqao300RiFEm8H`, `price_1UFGGQCvOctqao30Fya8DJNi` e `price_1UFGGRCvOctqao30FdZw4Sn8`;
- Portal: `bpc_1UFGGRCvOctqao30Q1tV0rqx`;
- webhook: `we_1UFGGSCvOctqao30axwiGh5V`, em `/api/webhooks/stripe`;
- eventos: checkout concluído/expirado, assinatura criada/alterada/encerrada e fatura paga/com falha.

O Portal administra pagamento, faturas e cancelamento. Trocas de plano ficam no app para aplicar prorrateio, preservar o perfil escolhido no downgrade e coordenar o acesso local. Uma alteração agendada pode ser repetida com segurança quando a Stripe não confirmou a primeira tentativa. Para escolher outro plano, a família usa “Manter assinatura atual” e então inicia a nova alteração.

A homologação real em modo teste (`runId fb4707d4-453e-4444-bf90-ea31b7e25ac6`) validou checkout abandonado e liberado, compra Família mensal, Portal, três perfis, reativação remota seguida de upgrade anual, downgrade agendado e aplicado na virada, renovação, falha de pagamento, revogação de acesso, cancelamento e exportação do histórico. Clientes, relógios e banco descartável foram removidos.

## E-mail, jobs e observabilidade

O remetente é `Missão Saber <contato@casaldevgames.com>`. `processed` registra somente que o SendGrid aceitou a mensagem; `delivered` confirma a entrega. Aceitação confirmada interrompe novas tentativas, e estados terminais não são sobrescritos por eventos ou falhas atrasadas. Após os deployments `804e173b-93a9-4d69-b3ce-b0444e4eb959` do Cozya e `ab1e9a9c-e73b-43f7-b675-aa65c3267dfd` da Agenda da Turma, os consumidores compartilhados executam essa regra. Ambos usam o servidor standalone e iniciam a conexão Redis somente no runtime. Cadastro, login por OTP e recuperação de senha reais receberam `delivered`, aceitação e ID do provedor. Os códigos do próprio Better Auth concluíram os três desafios; a conta e as chaves temporárias foram removidas.

`POST /api/jobs/weekly-report` também exige `CRON_SECRET` e envia o resumo semanal aos responsáveis que optaram por recebê-lo em `/familia`. A chave de mensagem inclui a semana, então o pipeline idempotente entrega no máximo um resumo por família por semana, mesmo se o cron disparar mais de uma vez. O corpo descreve o estudo de uma criança e por isso não é persistido: uma retentativa genérica reenviaria uma leitura vencida. O e-mail usa o layout compartilhado dos produtos Informach, com o link de descadastro no rodapé; o descadastro mostra uma confirmação no GET e só efetiva no POST. O disparo é do serviço cron semanal descrito na tabela acima: sem ele, a opção em `/familia` fica ligada e nada chega.

`POST /api/jobs/billing` exige `CRON_SECRET`. Redis mantém lease e cursor; o ciclo trata reconciliação, inadimplência e manutenção da fila. O cron consulta `/api/ready` e envia falhas ao Sentry. O Sentry remove corpos, cookies, respostas dos estudantes, breadcrumbs e parâmetros SQL. O monitor nativo de uptime não foi criado por limite da conta; o monitor operacional está no cron Railway e registra falhas no Sentry.

## Verificação e operação inicial

Na atualização de 26/09/2026, com o catálogo completo, passaram 161 testes unitários do app, 69 integrações com PostgreSQL isolado e 8 E2E em desktop e celular sobre o build de produção. Na versão publicada em 13/09 foram aprovados: 73 testes unitários do app, 47 integrações com PostgreSQL, 199 testes de billing, 112 de e-mail, 86 do Cozya, 506 da Agenda da Turma e 6 E2E em desktop/celular. A suíte raiz somou 1.265 testes e os 12 pacotes passaram no typecheck. Os builds Railway dos três consumidores terminaram com sucesso. O smoke do deployment final confirmou páginas, assets, bloqueio de rotas privadas, readiness, webhook Stripe assinado/deduplicado e job autenticado.

O repositório tem `.gitattributes` com `eol=lf`, então o Biome passa igual em Linux e Windows. Em um clone feito antes desse arquivo, o checkout está em CRLF e o `pnpm check` local acusa formatação: com a árvore limpa, rode `git rm -r -q --cached . && git reset --hard` para reescrever os arquivos em LF (o comando descarta alterações não commitadas).

O Sentry recebe `environment` do nome do ambiente Railway (`RAILWAY_ENVIRONMENT_NAME`) e `release` do commit (`RAILWAY_GIT_COMMIT_SHA`); só erros viram eventos, avisos ficam no log estruturado. No cliente, o `next.config.ts` repassa as duas variáveis do Railway no build como `NEXT_PUBLIC_*`, sem configuração manual.

O grupo `(app)` não tem `loading.tsx` de propósito: com essa fronteira de Suspense, o Next 16.2 deixa de aplicar na tela a árvore devolvida por uma server action ou por `router.refresh()` em produção (vercel/next.js#86055). A troca de trilha em `/jornada` reproduzia isso. Reavaliar quando o Next corrigir.

A área da família abre com a sessão normal do responsável; assinatura, exportação, encerramento, exclusão da conta e criação ou edição de perfis pedem login feito há menos de dez minutos. A exclusão da conta Informach é pedida dentro do app, confirmada por e-mail, recusada enquanto outro app tiver assinatura viva e, antes de apagar o usuário, encerra a cobrança e os dados pedagógicos deste app.

A primeira operação comercial é a compra Família pela responsável, seguida da criação de até três perfis. A validação que permanece é de produto: observar compreensão, uso de pistas, transferência para problemas inéditos, retorno semanal e utilidade do relatório. Nenhuma campanha ou divulgação automática foi ativada.
