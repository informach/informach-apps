# Estado do trabalho no repositório

Atualizado em 16/10/2026. Este é o índice de continuidade entre sessões. As regras permanentes ficam no [AGENTS.md](../AGENTS.md); resultados de testes, lotes e configuração operacional ficam nos registros específicos abaixo. Atualizar este índice quando a frente, as decisões ou o próximo passo mudarem.

## Contexto confirmado

- Os apps web existentes usam o Railway e o domínio `informach.com.br`, com serviços e subdomínios por produto. O Edi deve seguir esse padrão, reutilizando a infraestrutura compatível; GitHub é o canal de distribuição desktop, não o backend comercial.
- Agenda da Turma, Cozya e Missão Saber são produtos existentes em operação. Não alterar suas regras de acesso, preços, serviços ou dados como efeito colateral da integração Edi.
- Mudanças de arquitetura e operação devem atualizar a documentação na mesma entrega. O usuário não deve precisar reapresentar esse contexto a cada sessão.

## Frente em andamento

Suíte Edi, desenvolvida na branch `feat/edi-suite` e integrada em `main` a pedido explícito do usuário. Commit de implementação `abef0ab`; merge `22098c8`, enviado para `origin/main` e conferido por fetch e igualdade dos hashes. Os 782 arquivos da entrega foram commitados; caches, credenciais e instaladores gerados ficaram fora. Essa integração não libera distribuição, cobrança ou implantação do Edi. Conferir `git status` e o histórico ao retomar e preservar trabalho existente.

Decisões aprovadas: uma assinatura da suíte, preços registrados no catálogo e no documento de implementação, comercialização por empresa/CNPJ e consumo pago de IA separado. O piloto usa GitHub e chaves próprias Ed25519, sem contratar certificado Authenticode ou CDN. Não habilitar cobranças reais antes da homologação.

As cinco ferramentas foram importadas e integradas ao Hub. Preservar interfaces e funcionalidades existentes é requisito da integração; a regressão funcional completa ainda está no review. A conclusão dos recursos ainda ausentes dos editores está fora dessa frente. Testes e builds locais não significam que o produto foi publicado ou que o full review está aprovado.

- [Lotes, verificações e pendências Edi](propostas/edi-suite-2026-10-16/implementacao.md): fonte de verdade do andamento e das evidências.
- [Full review da implementação](propostas/edi-suite-2026-10-16/full-review.md): revisão global executada em 16/10/2026, reprovada para entrega; registra achados, prioridades e verificações. Uma exportação do EdiAula apagou um sentinela preexistente em perfil descartável; nenhum projeto real foi acessado.
- [Implantação do portal](../apps/edi/PRODUCAO.md): destino `https://edi.informach.com.br` no Railway, variáveis, pre-deploy e homologação.
- [Distribuição do piloto](propostas/edi-suite-2026-10-16/distribuicao-piloto.md): GitHub, credencial de publicação, assinatura própria e limites do piloto.
- [Padrão desktop](arquitetura-desktop.md): desenvolvimento das ferramentas atuais e futuras.
- [Correções do review](propostas/edi-suite-2026-10-16/correcoes.md): R02–R10 corrigidos e gates locais repetidos. R01 teve redução de 151 para um alerta moderado de produção, mas permanece bloqueante para release e operação comercial; não aceitar exceção nem publicar. A autorização posterior de integração em `main` não encerra R01. Consultar esse registro antes de repetir achados históricos.

Próximos passos: acompanhar os workflows disparados pelo push sem presumir aprovação remota; resolver a dependência indireta sprintf-js por correção/substituição validada, sem ocultar o alerta ou presumir autorização para reescrever os produtos existentes; fechar as homologações de instalação/upgrade, Stripe e operação antes de publicar. O gate `pnpm audit --prod` do release permanece bloqueante. A configuração do serviço, DNS e deploy do Edi depende de acesso autenticado ao Railway; na última sessão de implementação, a integração não estava conectada. Revalidar o acesso antes de solicitar qualquer ação ao usuário. Integração Git não comprova implantação, publicação ou homologação; eventuais deploys automáticos dos serviços existentes devem ser conferidos no Railway.

## Ambiente de desenvolvimento

`.nvmrc` e os workflows usam Node `24.15.0`, alinhados ao requisito `>=24.15.0` do manifest. Usar pnpm `9.15.0`, fixado em `packageManager`.

## Operação dos produtos existentes

- [Missão Saber](../apps/missao-saber/PRODUCAO.md): produção, migrations, Stripe, cron e observabilidade.
- [Cozya](../apps/cozya/CLAUDE.md): produto, preços, acesso e referências da operação.
- [Agenda da Turma](../apps/agenda-da-turma/CLAUDE.md): família, permissões e fluxos de atividades/recados.
- [Runbook compartilhado](deploy-runbook.md): procedimentos gerais; conferir a configuração versionada e o guia atual de cada app antes de aplicar exemplos históricos.

Datas e identificadores de deployments nesses documentos são evidências históricas. Confirmar o estado remoto quando a tarefa envolver produção, sem registrar credenciais ou dados pessoais neste índice.
