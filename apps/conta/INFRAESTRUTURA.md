# Infraestrutura e crons do corte Compasso

Revisão de 13/11/2026. Fonte declarativa: [`.railway/railway.ts`](../../.railway/railway.ts).
Este documento cobre a retirada dos jobs financeiros individuais; não autoriza
remover serviços por parecerem ociosos durante a preparação.

## O que foi preparado no Railway

A conexão foi confirmada em `informach-apps / production`. Conta e Dia de Estrela
já existiam sem fonte e sem deployments. Foram salvos seus comandos de build,
start standalone, readiness, observação de arquivos e versão Node. A Conta
recebeu origem pública, referência do banco, configuração de e-mail e referências
dos preços legados. Segredos próprios existentes foram preservados, vendas seguem
desligadas e `ADMIN_COMPASSO_ENABLED=0` foi preparado no Bastidores. Essas alterações
não iniciaram serviços, crons ou migrations.

Os domínios estão registrados no Railway, mas os CNAME/TXT externos ainda não
foram encontrados e o certificado aguarda validação. Usar os registros exibidos
em Networking de cada serviço no provedor DNS; não inventar outro destino nem
publicar credenciais no Git. A conexão OAuth não fornece valores de segredos nem
uma sessão CLI para o ensaio do backup real. Esse ensaio e a conciliação Stripe
continuam pendentes. Passos Stripe em [STRIPE.md](STRIPE.md).

## Sete serviços a retirar no corte

| Serviço atual | Cadência UTC | Responsabilidade substituta |
| --- | --- | --- |
| `cron-perapp-billing-reconcile` | 03h diariamente | Conciliação central e recuperação dos contratos legados |
| `cron-perapp-billing-expire-bonus` | 03h30 diariamente | Validade dos lotes na carteira compartilhada |
| `cron-perapp-billing-grant-monthly` | 03h45 diariamente | Franquia compartilhada com recibo por período |
| `cron-perapp-billing-dunning` | A cada 6 horas | Cobertura por fatos financeiros conciliados |
| `cron-perapp-billing-release-reservations` | A cada 5 minutos | Expiração limitada no job financeiro da Conta |
| `cron-missao-saber-billing` | A cada 5 minutos | Conta para cobrança; worker Missão para limpeza de acesso |
| `cron-bora-treinar-billing` | A cada 5 minutos | Conciliação na Conta |

O job `conta/billing`, a cada minuto, compõe contratos nativos, contratos antigos,
continuidade e coordenação familiar. Expira reservas nos escopos `compasso` e dos
cinco apps, sem alcançar Edi/Recreio. Uma falha parcial continua sendo falha
operacional; outros escopos são tentados e a próxima execução retoma o trabalho.

A limpeza de códigos de pareamento, aparelhos expirados/revogados e contadores
de estudo da Missão Saber estava escondida no cron financeiro antigo. Agora ela
também pertence ao worker `account-departure` da Missão, para não desaparecer
quando esse cron financeiro for retirado.

Antes de retirar os genéricos, conferir seus destinos `APP_DOMAINS` no Railway.
Se aparecer um produto independente, preservar sua obrigação e corrigir o plano
antes da exclusão. A conexão OAuth desta sessão não revela esses valores.

As sete rotinas ainda atendem os deployments antigos em produção. Na consulta
de 13/11, suas últimas execuções constavam como bem-sucedidas, sem réplicas
mantidas em execução entre invocações. A retirada ocorrerá com a promoção
coordenada do novo runtime, não antes dela. Nenhum desses serviços foi apagado
nesta preparação.

As métricas de 24 horas também foram consultadas, com amostragem de um minuto.
O uso observado é baixo; execuções curtas podem não aparecer na amostra. Valores
zero não significam ausência de custo. O plugin fornece consumo, sem uma fatura
que permita atribuir economia em reais a essa retirada.

## Jobs que permanecem necessários

Preservar os onze crons independentes: `cron-perapp-email-retry`,
`cron-perapp-email-recover-stale`, `cron-global-auth-cleanup`,
`cron-global-email-suppression-sync`, `cron-agenda-routine`,
`cron-cozya-retention`, `cron-missao-saber-weekly-report`,
`cron-bora-treinar-lembretes`, `cron-edi-reconcile`, `cron-admin-watch` e
`cron-admin-weekly`. Transporte de e-mail, retenção, lembretes, estudos e operação
não são duplicações da cobrança. A fila de e-mail preserva o remetente e os links
assinados da origem; não criar outra rotina só para repetir essa fila.

O corte acrescenta oito jobs necessários: `cron-conta-billing`,
`cron-conta-account-maintenance`, os cinco `cron-<app>-account-departure` e
`cron-dia-de-estrela-alertas`. Cada worker de domínio recebe somente o segredo
do seu app. O financeiro roda por minuto; os outros, a cada cinco minutos.
Não manter os sete jobs financeiros antigos junto com o novo por tempo indefinido.

A quantidade de jobs financeiros cai de sete para um. A quantidade total de
crons aumenta em um, porque entram também privacidade e alertas do novo app.
Isso não permite prometer economia em reais sem dados de consumo e faturamento.
Postgres, Redis e seus volumes continuam preservados; recursos de Recreio/Morada
pertencem à frente independente e devem permanecer intactos.

## Plano e verificação

`COMPASSO_LAUNCHED=false` e `ESTRELA_LAUNCHED=false` conservam os serviços vazios
da Conta e Dia de Estrela no grafo, sem conectar fontes. Ao habilitar as duas
flags no corte, o grafo retira exatamente os sete serviços da tabela e acrescenta
os oito jobs acima. Nunca voltar as flags após lançar para tentar rollback.

`pnpm compasso:test:infrastructure` avalia os dois grafos offline e verifica esse
contrato e a preservação dos recursos independentes. Ele não consulta a API nem
substitui `railway config plan` contra o ambiente real. Antes do apply, revisar
o plano inteiro: as únicas destruições esperadas são os sete serviços listados,
depois que suas obrigações estiverem cobertas. Parar diante de qualquer exclusão
de banco, volume, app ou recurso fora da frente.

O Bastidores usa `ADMIN_COMPASSO_ENABLED=1` somente após o corte: inclui a Conta e
o Dia nas sondagens e troca as rotinas financeiras individuais pelas centrais.
O padrão `0` evita sondar serviços vazios e mantém a visão operacional antiga.
`ADMIN_RECREIO_ENABLED` continua independente.

Depois do corte, conferir readiness e versão servida, autenticação dos jobs,
`ops.job_runs` sem falhas parciais, conciliação sem pendências e ausência dos
sete serviços substituídos. Medir consumo e latência do novo financeiro antes de
alterar cadência; reduzir chamadas sem conhecer o lote pode atrasar recuperação
de pagamento e encerramentos consentidos.

## Verificações desta revisão

Passaram os testes unitários de Conta, Missão Saber e Bastidores, os types dos
três apps, o contrato offline de infraestrutura e o ensaio HTTP integrado de
encerramento (22 etapas com PostgreSQL/Redis descartáveis). O build de produção
do Bastidores passou com fontes locais e configuração sintética. O lint geral
passou com os avisos já existentes. Esses resultados não substituem o backup
real nem atestam o corte de produção.

A regressão da Agenda após corrigir a captura passou nas 54 jornadas, com central
e app em standalone, PostgreSQL/Redis descartáveis e sem provedores externos.
Os builds de produção do site e Cozya também passaram com fontes locais; nenhuma
fonte desses três apps exige download do Google durante a compilação.

Na investigação do CI, o login Missão falhou antes da jornada do produto: o
endpoint OIDC de tokens respondeu 429 ao contador chegar a 20, ainda dentro dos
60 segundos (42,8 s na leitura local). A capacidade do emissor agora agrega os
cinco clientes servidores, com teto de 100/minuto/IP. A regressão confere o teto,
a recusa de códigos inválidos e o limite independente de cinco senhas; não
desliga o limitador nem reutiliza códigos. O cenário inicial foi reproduzido em
banco/conta sintéticos, sem acessar contas reais.

Após o ajuste do emissor, passaram 278 unitários de auth, 32 integrações de auth
com PostgreSQL, 2.802 unitários dos oito consumidores e typecheck dos 40 projetos
mais tooling Edi. Duas jornadas locais de navegador repetiram 40 entradas cada
(80 reentradas, além da preparação), com builds standalone, sem o 429 observado
antes do ajuste. O diagnóstico temporário foi removido do checkout; não entra
na suíte cotidiana nem altera as verificações do protocolo.
