# Estado do trabalho no repositório

Atualizado em 17/10/2026. Este é o índice de continuidade entre sessões. As regras permanentes ficam no [AGENTS.md](../AGENTS.md); resultados de testes, lotes e configuração operacional ficam nos registros específicos abaixo. Atualizar este índice quando a frente, as decisões ou o próximo passo mudarem.

## Contexto confirmado

- Os apps web existentes usam o Railway e o domínio `informach.com.br`, com serviços e subdomínios por produto. O Edi deve seguir esse padrão, reutilizando a infraestrutura compatível; GitHub é o canal de distribuição desktop, não o backend comercial.
- Agenda da Turma, Cozya e Missão Saber são produtos existentes em operação. Não alterar suas regras de acesso, preços, serviços ou dados como efeito colateral da integração Edi.
- Mudanças de arquitetura e operação devem atualizar a documentação na mesma entrega. O usuário não deve precisar reapresentar esse contexto a cada sessão.

## Frente em andamento

Entrada em produção da suíte Edi, na branch `fix/edi-production`. A implementação anterior de `feat/edi-suite` foi integrada em `main` (`abef0ab`, merge `22098c8`). Em 17/10, após a consulta de prontidão, o titular autorizou corrigir os bloqueios, implantar o portal/Hub e configurar integralmente Stripe teste/produção. A publicação continua condicionada aos gates, sem cobrança real de teste. Conferir `git status` e preservar a alteração pessoal em `.claude/settings.local.json`.

Decisões aprovadas: uma assinatura da suíte, preços registrados no catálogo e no documento de implementação, comercialização por empresa/CNPJ e consumo pago de IA separado. O piloto usa GitHub e chaves próprias Ed25519, sem contratar certificado Authenticode ou CDN. Não habilitar cobranças reais antes da homologação.

As cinco ferramentas foram importadas e integradas ao Hub. Preservar interfaces e funcionalidades existentes é requisito da integração; a regressão funcional completa ainda está no review. A conclusão dos recursos ainda ausentes dos editores está fora dessa frente. Testes e builds locais não significam que o produto foi publicado ou que o full review está aprovado.

- [Lotes, verificações e pendências Edi](propostas/edi-suite-2026-10-16/implementacao.md): fonte de verdade do andamento e das evidências.
- [Full review da implementação](propostas/edi-suite-2026-10-16/full-review.md): revisão global executada em 16/10/2026, reprovada para entrega; registra achados, prioridades e verificações. Uma exportação do EdiAula apagou um sentinela preexistente em perfil descartável; nenhum projeto real foi acessado.
- [Implantação do portal](../apps/edi/PRODUCAO.md): destino `https://edi.informach.com.br` no Railway, variáveis, pre-deploy e homologação.
- [Distribuição do piloto](propostas/edi-suite-2026-10-16/distribuicao-piloto.md): GitHub, credencial de publicação, assinatura própria e limites do piloto.
- [Padrão desktop](arquitetura-desktop.md): desenvolvimento das ferramentas atuais e futuras.
- [Guia prático Edi](desenvolvimento-edi.md): execução local do Hub/editores, desenvolvimento de funcionalidades, inclusão de ferramentas e testes; solicitado pelo titular nesta frente.
- [Correções do review](propostas/edi-suite-2026-10-16/correcoes.md): histórico R01–R10. A frente atual corrigiu a cadeia restante e obteve auditoria de produção sem vulnerabilidades conhecidas; isso não dispensa os demais gates de operação e distribuição.
- [Operação provisionada](propostas/edi-suite-2026-10-16/producao-operacao.md), [Stripe](propostas/edi-suite-2026-10-16/producao-stripe.md), [preservação de trabalhos](propostas/edi-suite-2026-10-16/producao-jobs.md) e [Windows](propostas/edi-suite-2026-10-16/producao-windows.md): evidências e pendências da implantação atual.

O diagnóstico inicial de 17/10 está preservado na [consulta operacional](propostas/edi-suite-2026-10-16/implementacao.md#consulta-de-prontidão-em-17102026). Desde então, foram corrigidas as dependências, criados portal/cron/Sentry no Railway e homologados pagamentos e webhooks em Stripe de teste. O domínio chega ao Railway por HTTPS, mas o portal ainda não tem deploy saudável. A configuração Edi passou para IaC; os demais serviços não foram migrados. Preço aprovado: R$ 49,90/mês ou R$ 499/ano, com IA paga separada.

O [PR #6](https://github.com/informach/informach-apps/pull/6), inicialmente em draft, executa CI, integração de banco, testes nativos e upgrade dos instaladores no Windows. Depois dos primeiros gates locais e remotos, a repetição Windows revelou uma falha intermitente na sincronização do cursor exportado pelo EdiAula. O diagnóstico reproduziu a falha com o bundle exato do CI; a correção elimina comandos mutáveis e calcula as coordenadas pelo timestamp do frame. A evidência, a regressão ampliada e o estado dos instaladores estão no registro Windows. A implantação usa um worktree isolado para preservar a sessão paralela de identidade visual confirmada pelo titular.

Próximos passos: concluir os gates remotos da correção, aplicar migrations pelo migrator e implantar o portal. Depois verificar login/e-mail, imagem e configurações Stripe finais, cron monitorado e publicação assinada. Integração Git, configuração de variáveis e testes locais não comprovam implantação nem distribuição; conferir também os deploys automáticos dos consumidores afetados.

## Ambiente de desenvolvimento

`.nvmrc` e os workflows usam Node `24.15.0`, alinhados ao requisito `>=24.15.0` do manifest. Usar pnpm `9.15.0`, fixado em `packageManager`.

## Operação dos produtos existentes

- [Missão Saber](../apps/missao-saber/PRODUCAO.md): produção, migrations, Stripe, cron e observabilidade.
- [Cozya](../apps/cozya/CLAUDE.md): produto, preços, acesso e referências da operação.
- [Agenda da Turma](../apps/agenda-da-turma/CLAUDE.md): família, permissões e fluxos de atividades/recados.
- [Runbook compartilhado](deploy-runbook.md): procedimentos gerais; conferir a configuração versionada e o guia atual de cada app antes de aplicar exemplos históricos.

Datas e identificadores de deployments nesses documentos são evidências históricas. Confirmar o estado remoto quando a tarefa envolver produção, sem registrar credenciais ou dados pessoais neste índice.
