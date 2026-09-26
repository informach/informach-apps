# Operação do Missão Saber

Publicado em 13/09/2026 em https://missao-saber.informach.com.br. A versão comercial atende estudantes do 6º e 7º ano e permanece com `noindex` enquanto a família valida o produto. Compra e estudo não dependem de aprovação de conteúdo.

## Serviços

| Recurso | Configuração atual |
| --- | --- |
| Railway | Projeto `informach-apps`, ambiente `production` |
| Aplicação | Serviço `91f572ad-b55c-4938-9967-0650c90e49c6`; deployment `b7aa6d9e-26f1-4b20-8b95-2a5c10a07815` |
| Cron e monitor | Serviço `5a361c2e-96d0-4dbc-9993-f7c0ff3cd13b`, a cada cinco minutos |
| Cron do resumo semanal | Criar um serviço `cron-missao-saber-weekly-report` com a imagem `alpine/curl` (mesma de `railway-cron-weekly.json`), agenda `0 12 * * 1,2` (segunda e terça, 9h em Brasília; a terça só reenvia falhas da segunda), e rodar `python scripts/production.py configure-weekly-cron <id-do-serviço>`; até isso existir, nenhum resumo é enviado |
| PostgreSQL | Compartilhado; a última migração do Missão Saber é a `0063` |
| Redis | Compartilhado, com prefixos exclusivos do Missão Saber |
| Sentry | Organização `informach-nucleo-de-aprendizag`, projeto `missao-saber` |
| Cloudflare | CNAME para `aijyebw0.up.railway.app`, proxy ligado |
| SendGrid | Fila compartilhada; eventos assinados processados pelo Cozya |

O build executa `pnpm install --frozen-lockfile --prod=false && pnpm build:missao-saber`; o start executa `pnpm start:missao-saber`. `/api/ready` verifica PostgreSQL e Redis, e `/api/health` identifica o deployment. Produção rejeita chaves Stripe de teste, e-mail sandbox, preços ausentes e URLs incoerentes. Os segredos ficam apenas na Railway e nos ambientes locais ignorados pelo Git.

## Banco, migrations e recuperação

A migração `0063` (26/09/2026) abre o perfil para todos os anos escolares: `grade` aceita de 1 (1º ano) a 12 (3ª série do EM), `grade_year` guarda o ano civil a que o ano escolar se refere e `birth_month` guarda só mês e ano de nascimento, opcional, para sugerir o ano pela regra de corte de 31 de março. O ano efetivo avança sozinho em 1º de janeiro; se a trilha gravada não cobre o ano novo, as páginas mostram a sucessora da mesma olimpíada e a gravação acontece na primeira missão. Os formulários só oferecem anos que têm trilha publicada. A mesma migração indexa `reports.user_id`.

As migrations `0044` a `0049` adicionaram controles de conteúdo, interrupção segura, acesso por perfil, relatos versionados, atualizações de relatório e confirmação financeira. A `0047` removeu a antiga tabela `missao_saber.releases`; não existe fluxo de publicação ou aprovação no runtime.

Antes da atualização foi criado o backup Railway `109e5c1e-d8a4-4c76-82ad-3129e3d3cb7f`, `pre-missao-comercial-0044-0049-2026-09-13`. O dump físico, com 14.405.814 bytes, foi restaurado em PostgreSQL descartável: 44 migrations de origem, 100 tabelas e 13 usuários. Depois da atualização, `production:verify-schema` confirmou 50 migrations, remoção de `releases` e presença dos novos campos e tabelas.

Em falha de aplicação, promover o último deployment saudável compatível com o schema. Restaurar o PostgreSQL compartilhado afeta os outros produtos e exige janela coordenada; não usar restauração do banco como rollback automático de código. Nunca usar `db:push` em produção.

## Catálogo e manutenção

O catálogo comercial contém 61 missões e 604 atividades autorais únicas: 508 de ensino/prática e 96 reservadas em oito bancos de diagnóstico e simulado. Há 37 desafios de justificativa e três laboratórios. As 96 questões de avaliação permanecem distintas mesmo sem a numeração visual e formam 26 famílias semânticas compartilhadas entre diagnóstico e simulado, de modo que o produto identifica corretamente a segunda exposição como prática. OLITEF N1, Canguru E, Canguru B e OBMEP N1 compartilham fundamentos sem duplicar a contagem.

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

Na versão publicada foram aprovados: 73 testes unitários do app, 47 integrações com PostgreSQL, 199 testes de billing, 112 de e-mail, 86 do Cozya, 506 da Agenda da Turma e 6 E2E em desktop/celular. A suíte raiz somou 1.265 testes e os 12 pacotes passaram no typecheck. Os builds Railway dos três consumidores terminaram com sucesso. O smoke do deployment final confirmou páginas, assets, bloqueio de rotas privadas, readiness, webhook Stripe assinado/deduplicado e job autenticado.

O repositório tem `.gitattributes` com `eol=lf`, então o Biome passa igual em Linux e Windows. Em um clone feito antes desse arquivo, o checkout está em CRLF e o `pnpm check` local acusa formatação: com a árvore limpa, rode `git rm -r -q --cached . && git reset --hard` para reescrever os arquivos em LF (o comando descarta alterações não commitadas).

O Sentry recebe `environment` do nome do ambiente Railway (`RAILWAY_ENVIRONMENT_NAME`) e `release` do commit (`RAILWAY_GIT_COMMIT_SHA`); só erros viram eventos, avisos ficam no log estruturado. No cliente, as duas variáveis precisam existir com o prefixo `NEXT_PUBLIC_` para aparecerem.

O grupo `(app)` não tem `loading.tsx` de propósito: com essa fronteira de Suspense, o Next 16.2 deixa de aplicar na tela a árvore devolvida por uma server action ou por `router.refresh()` em produção (vercel/next.js#86055). A troca de trilha em `/jornada` reproduzia isso. Reavaliar quando o Next corrigir.

A área da família abre com a sessão normal do responsável; assinatura, exportação, encerramento, exclusão da conta e criação de perfis pedem login feito há menos de dez minutos. A exclusão da conta Informach é pedida dentro do app, confirmada por e-mail, recusada enquanto outro app tiver assinatura viva e, antes de apagar o usuário, encerra a cobrança e os dados pedagógicos deste app.

A primeira operação comercial é a compra Família pela responsável, seguida da criação de até três perfis. A validação que permanece é de produto: observar compreensão, uso de pistas, transferência para problemas inéditos, retorno semanal e utilidade do relatório. Nenhuma campanha ou divulgação automática foi ativada.
