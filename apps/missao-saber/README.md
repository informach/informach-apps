# Missão Saber

Publicado em https://missao-saber.informach.com.br. Configuração e próximos passos de operação em [PRODUCAO.md](PRODUCAO.md). Stripe real em produção e teste no local. O catálogo publicado fica disponível conforme o plano; missões podem ser pausadas pontualmente para correção.

Versão comercial funcional para estudantes do 2º ano à 3ª série do ensino médio, com conta do responsável e trilhas de estratégias para OLITEF N1, N2 e N3, Canguru P, E, B, C, J e S, OBMEP N1, N2 e N3 e OBMEP Mirim 1 e 2. O catálogo tem 291 missões, 2.960 atividades autorais únicas, 336 itens reservados para diagnóstico e simulados e 175 desafios de justificativa, além de três laboratórios. As trilhas compartilham fundamentos; a contagem não duplica atividades compartilhadas. O perfil do estudante guarda o ano escolar e, se a família quiser, o mês e o ano de nascimento, que só servem para sugerir o ano; o ano avança sozinho na virada e as trilhas elegíveis acompanham.

## Abrir localmente

Requisitos: Node 24.15.0, pnpm 9.15.0 e PostgreSQL local, conforme manifest e CI do monorepo. O projeto usa os packages compartilhados.

```powershell
pnpm install --frozen-lockfile
pnpm --filter @informach/missao-saber preview:setup
pnpm dev:missao-saber
```

`preview:setup` lê o `DATABASE_URL` local da raiz, cria um banco `missao_preview_<uuid>`, aplica as migrations nesse banco e grava `.env.local` ignorado pelo Git. Recusa destinos remotos e não sobrescreve configuração existente. Nesta implementação, o preview já foi configurado; basta iniciar o app.

Abra `http://localhost:3005`. A demonstração em `/experimentar` dispensa cadastro. Para testar o cadastro, use um e-mail fictício; o código fica no arquivo JSON de e-mail correspondente em `tmp/emails` (modo sandbox, sem envio externo). Não use esses dados locais em produção.

Para abrir a manutenção de conteúdo em `/manutencao`, configure o e-mail de uma conta responsável em `MISSAO_CONTENT_MANAGER_EMAILS` ou seu ID em `MISSAO_CONTENT_MANAGER_IDS` e confirme esse e-mail. Em produção, `helena@informach.com.br` está autorizada. A manutenção permite consultar relatos, pausar conteúdo com problema, corrigir e reativar. Não existe fluxo de aprovação do catálogo. A área da família abre com a sessão normal; assinatura, dados pessoais, exclusão da conta e novos perfis exigem login feito há menos de dez minutos.

## Verificar

```powershell
pnpm --filter @informach/missao-saber test
pnpm --filter @informach/missao-saber test:integration
pnpm --filter @informach/missao-saber e2e
pnpm --filter @informach/missao-saber typecheck
pnpm build:missao-saber
```

Integração e E2E criam e removem seu próprio banco local; recusam banco remoto ou banco compartilhado. O E2E usa Chromium em desktop e Pixel 7, porta 3105 e artefatos com um identificador aleatório por execução. Ele compila e inicia uma aplicação de produção isolada para não disputar o cache do preview. Quando a porta estiver ocupada por outra sessão, defina `MISSAO_E2E_PORT`. E-mails são sandbox e a Stripe não recebe requisições de pagamento. Fixtures de assinatura são inseridas somente no banco descartável. Um encerramento abrupto do processo pode deixar um banco ou diretório de teste; confirme o nome exato antes de removê-lo manualmente.

Os três configs Vitest (unitário, integração e ferramentas) usam `oxc.jsx.runtime = "automatic"` para transformar os templates TSX com o Vite 8 fixado no lockfile, conforme o [guia de migração do Vite](https://vite.dev/guide/migration). O `jsx: preserve` herdado do Next não deve chegar sem transformação à execução dos testes de e-mail.

## Decisões principais

- A resposta correta e o feedback ficam no servidor. Tentativas têm idempotência, ordem validada e snapshot da versão estudada. Diagnóstico/simulado escondem correção até a conclusão, inclusive em histórico e exportação.
- Domínio requer variedade de problemas, dias diferentes e respostas sem pistas. Repetir a mesma atividade não cria evidência inédita. Revisões seguem 1/3/7/14/30 dias e voltam a um dia após erro ou apoio.
- Laboratórios de barras, malha e agrupamentos aceitam teclado. O botão de salvar persiste o estado por perfil com controle de concorrência; o caderno conserva a reflexão.
- As primeiras missões de cada trilha e o diagnóstico são gratuitos. O restante exige assinatura. Uma suspensão operacional impede novas sessões e respostas até a correção; o histórico permanece. Os arquivos oficiais de referência não entram no bundle nem no catálogo.
- Cobrança e dados ficam no escopo `missao-saber`. Encerramento expira checkouts, cancela assinaturas remotas, registra IDs encerrados para impedir reativação por webhooks atrasados e só então limpa os dados pedagógicos. Falhas preservam esses dados para nova tentativa. A conta Informach e registros financeiros são preservados.

Veja [PRODUCAO.md](PRODUCAO.md), a [proposta](../../docs/propostas/missao-saber-2026-09-13/PROPOSTA.md) e os [reviews](../../.compozy/tasks/missao-saber/reviews/).
