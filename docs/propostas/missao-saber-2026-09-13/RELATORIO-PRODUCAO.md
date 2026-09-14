# Missão Saber: publicação da versão comercial

Data: 13/09/2026. URL: https://missao-saber.informach.com.br.

## Estado publicado

Os deployments finais `b7aa6d9e-26f1-4b20-8b95-2a5c10a07815` do Missão Saber, `804e173b-93a9-4d69-b3ce-b0444e4eb959` do Cozya e `ab1e9a9c-e73b-43f7-b675-aa65c3267dfd` da Agenda da Turma estão `SUCCESS` na Railway. Cozya e Agenda receberam as salvaguardas da fila de e-mail compartilhada, passaram a executar seus bundles standalone diretamente e não abrem conexão Redis durante o build. O domínio usa o CNAME configurado pela responsável e mantém o proxy Cloudflare ligado.

O catálogo publicado possui 61 missões e 604 atividades autorais únicas para OLITEF N1, Canguru E/B e OBMEP N1 no 6º/7º ano. O produto está pronto para venda e permanece com `noindex`, sem divulgação. Não existe console, fila ou aprovação editorial. A manutenção restringe-se a relatos, pausa, correção, invalidação e reativação de conteúdo afetado.

## Infraestrutura

| Recurso | Evidência |
| --- | --- |
| Aplicação | Serviço Railway `91f572ad-b55c-4938-9967-0650c90e49c6`, healthcheck `/api/ready` aprovado |
| Cron | Serviço `5a361c2e-96d0-4dbc-9993-f7c0ff3cd13b`, intervalo de cinco minutos |
| Banco | 50 migrations; `releases` removida; controles, relatos, acesso por perfil e confirmação financeira presentes |
| Backup | `109e5c1e-d8a4-4c76-82ad-3129e3d3cb7f`; dump restaurado em instância descartável antes da atualização |
| Redis | Readiness, locks, cursor e coordenação de cobrança aprovados |
| Sentry | Projeto `missao-saber`, captura sanitizada no app e no cron |
| SendGrid | Evento real de OTP correlacionado como `delivered` após o deploy do coletor |
| Cloudflare | Certificado e páginas públicas funcionando com proxy ligado |

O smoke público confirmou `/api/health`, `/api/ready`, landing page, entrada, demonstração, páginas legais, manifest e ícones com `200`; Família e Manutenção redirecionam visitantes para login; job sem segredo retorna `401`; webhooks sem assinatura retornam `400`; evento Stripe assinado é processado e deduplicado; job autenticado retorna estado operacional. Nos consumidores compartilhados, página, manifest e asset JavaScript do bundle standalone também retornaram `200`, sem erro de aplicação ou resposta 5xx nos deployments finais.

## Stripe

Os produtos de teste e produção têm nomes humanizados, descrições completas e a imagem atual do Missão Saber. Existem quatro preços em cada modo:

| Plano | Mensal | Anual |
| --- | --- | --- |
| Individual | R$ 29,90 | R$ 299,00 |
| Família | R$ 44,90 | R$ 449,00 |

O webhook de produção `we_1UFGGSCvOctqao30axwiGh5V` recebe os sete eventos necessários. O Portal `bpc_1UFGGRCvOctqao30Q1tV0rqx` gerencia dados de pagamento, faturas e cancelamento. O app gerencia trocas para coordenar prorrateio, acesso e o perfil retido em redução de capacidade.

A homologação com recursos reais da Stripe em modo teste passou sob o `runId fb4707d4-453e-4444-bf90-ea31b7e25ac6`. Foram exercitados checkout abandonado, compra mensal Família, Portal, três perfis, reativação remota seguida de upgrade anual, downgrade agendado e aplicado, renovação paga, pagamento recusado, revogação, cancelamento e exportação. Os recursos descartáveis foram limpos.

## E-mail

As suítes compartilhadas passaram em 112 testes. O coletor diferencia aceitação (`processed`) de entrega (`delivered`), protege bounce, drop e spam complaint contra eventos antigos e não reenvia uma mensagem já aceita mesmo diante de uma resposta tardia de erro. Cadastro, login por OTP e recuperação de senha reais enviaram códigos para `helena@informach.com.br`; os códigos criados pelo Better Auth concluíram os três desafios. O ledger e a Activity API registraram `delivered`, aceitação e IDs do provedor. A conta e as chaves temporárias foram removidas.

## Verificação da versão

- 73 testes unitários do Missão Saber;
- 47 integrações com PostgreSQL descartável;
- 199 testes do pacote de billing;
- 112 testes do pacote de e-mail;
- 86 testes do Cozya;
- 506 testes da Agenda da Turma;
- 6 E2E em desktop e celular;
- 1.265 testes na suíte raiz e typecheck dos 12 pacotes;
- builds do Missão Saber, Cozya e Agenda da Turma;
- Biome focado nos arquivos da entrega;
- smoke e schema contra produção.

O check global da raiz permanece vermelho por dívida preexistente de lint/formatação e arquivos do acervo. O log foi preservado e esse trabalho fica separado da versão comercial.

## Início do teste familiar

Helena pode criar ou acessar sua conta, confirmar o e-mail, escolher Família mensal ou anual e criar até três perfis. A compra será uma transação real da própria responsável; nenhuma automação cobrou cartão. Depois da compra, o uso dos filhos passa a validar didática, retenção e utilidade do relatório. O [runbook](../../../apps/missao-saber/PRODUCAO.md), o [relatório de implementação](RELATORIO-IMPLEMENTACAO.md) e o [roteiro familiar](ROTEIRO-OBSERVACAO-FAMILIAR.md) registram operação e acompanhamento.
