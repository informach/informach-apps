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
- [Identidade visual, páginas e Hub](propostas/edi-suite-2026-10-16/implementacao.md#identidade-visual-páginas-e-hub-17102026): direção "bancada e marca-texto" aplicada em 17/10 ao portal, ao Hub e aos seis ícones, com pendências de suporte e requisitos.
- [Full review da implementação](propostas/edi-suite-2026-10-16/full-review.md): revisão global executada em 16/10/2026, reprovada para entrega; registra achados, prioridades e verificações. Uma exportação do EdiAula apagou um sentinela preexistente em perfil descartável; nenhum projeto real foi acessado.
- [Implantação do portal](../apps/edi/PRODUCAO.md): destino `https://edi.informach.com.br` no Railway, variáveis, pre-deploy e homologação.
- [Distribuição do piloto](propostas/edi-suite-2026-10-16/distribuicao-piloto.md): GitHub, credencial de publicação, assinatura própria e limites do piloto.
- [Padrão desktop](arquitetura-desktop.md): desenvolvimento das ferramentas atuais e futuras.
- [Guia prático Edi](desenvolvimento-edi.md): execução local do Hub/editores, desenvolvimento de funcionalidades, inclusão de ferramentas e testes; solicitado pelo titular nesta frente.
- [Correções do review](propostas/edi-suite-2026-10-16/correcoes.md): histórico de R01 a R10. A frente atual corrigiu a cadeia restante e obteve auditoria de produção sem vulnerabilidades conhecidas; isso não dispensa os demais gates de operação e distribuição.
- [Operação provisionada](propostas/edi-suite-2026-10-16/producao-operacao.md), [Stripe](propostas/edi-suite-2026-10-16/producao-stripe.md), [preservação de trabalhos](propostas/edi-suite-2026-10-16/producao-jobs.md) e [Windows](propostas/edi-suite-2026-10-16/producao-windows.md): evidências e pendências da implantação atual.

O diagnóstico inicial de 17/10 está preservado na [consulta operacional](propostas/edi-suite-2026-10-16/implementacao.md#consulta-de-prontidão-em-17102026). Desde então, foram corrigidas as dependências, criados portal/cron/Sentry no Railway e homologados pagamentos e webhooks em Stripe de teste. O domínio chega ao Railway por HTTPS, mas o portal ainda não tem deploy saudável. A configuração Edi passou para IaC; os demais serviços não foram migrados. Preço aprovado: R$ 49,90/mês ou R$ 499/ano, com IA paga separada.

O [PR #6](https://github.com/informach/informach-apps/pull/6), inicialmente em draft, executa CI, integração de banco, testes nativos e upgrade dos instaladores no Windows. Depois dos primeiros gates locais e remotos, a repetição Windows revelou uma falha intermitente na sincronização do cursor exportado pelo EdiAula. O diagnóstico reproduziu a falha com o bundle exato do CI; a correção elimina comandos mutáveis e calcula as coordenadas pelo timestamp do frame. A evidência, a regressão ampliada e o estado dos instaladores estão no registro Windows. A implantação usa um worktree isolado para preservar a sessão paralela de identidade visual confirmada pelo titular.

Próximos passos: concluir os gates remotos da correção, aplicar migrations pelo migrator e implantar o portal. Depois verificar login/e-mail, imagem e configurações Stripe finais, cron monitorado e publicação assinada. Integração Git, configuração de variáveis e testes locais não comprovam implantação nem distribuição; conferir também os deploys automáticos dos consumidores afetados.

A correção do cursor passou na suíte remota de mídia. A instalação seguinte de Hub e EdiCaptura revelou outro bloqueio: o filesystem virtual do Electron impedia a leitura física do ASAR pelo verificador de integridade. A correção usa um adapter explícito de `original-fs` no desktop e acrescenta regressão no Electron real. A regressão nativa passou nos seis apps; a homologação dos instaladores ainda precisa passar antes do merge.

O titular autorizou incluir os trabalhos da sessão paralela na próxima subida e confirmou o conjunto como finalizado. O visual do Edi, a home institucional e a padronização do contato foram copiados para o worktree isolado, com snapshot e integração das correções posteriores de produção. O checkout original e as configurações pessoais foram preservados. Os gates agora precisam validar esse conjunto integrado.

Antes da publicação, o titular solicitou incorporar um segundo lote da sessão paralela. Ele foi capturado e integrado no worktree isolado; inclui revisão dos estados/ações do Hub, refinamentos do portal/site e a desativação de traces de conteúdo dos agentes da Agenda. As verificações do primeiro conjunto não substituem os gates dessa nova revisão. Evidências e correções de integração ficam no [registro operacional](propostas/edi-suite-2026-10-16/producao-operacao.md#complemento-da-sessão-paralela).

## Home institucional e contato público

Em 17/10/2026, a home de `informach.com.br` foi refeita conforme a proposta aprovada em canvas e incluída, por autorização do titular, na integração da próxima subida Edi. Ela apresenta os cinco produtos, com seção própria para a Comunidade dos Criadores do Sistema Zero (crianças de 9 a 14 anos, vendida em `sistemazero.com.br`) e Helena e Júlio como quem faz. Conteúdo, tokens e regras em [`apps/informach-site/CLAUDE.md`](../apps/informach-site/CLAUDE.md).

Decisão da titular: nenhuma página pública mostra e-mail de contato. O canal é o direct do Instagram `@criecomhelenaejulio`, lido de `@informach/config/contact`. Aplicado ao site institucional, às páginas de Termos e Privacidade do Cozya e da Missão Saber e ao portal Edi (página de vendas e conta).

Também em 17/10, a pedido da titular: a cláusula 12 da privacidade guarda-chuva passou a tratar crianças e adolescentes que usam os produtos sob supervisão do responsável; a descrição do OpenRouter foi corrigida (OpenRouter, Inc., contratado e pago pela Informach, com retenção própria de cada provedor) e os Termos explicam a cota de créditos de IA; o suporte dentro da conta da Missão Saber também passou para o direct. Pendências: revisão jurídica geral dos textos legais antes do go-live, incluindo se o direct do Instagram atende ao art. 2º, II, do Decreto nº 7.962/2013 (endereço físico e eletrônico do fornecedor em sites de venda) e se o arrependimento pode ser feito pela mesma ferramenta da contratação (art. 5º, § 1º); nova medição Lighthouse após o deploy; manter os preços do Sistema Zero em `apps/informach-site/src/lib/products.ts` iguais aos da página de oferta. O deploy do portal Edi, de que depende o link da Suíte Edi na home, é acompanhado na frente do Edi.

Full review de tudo o que foi feito em 17/10 (portal e Hub Edi, home, páginas legais e documentação), com quatro revisores independentes e correção de cada achado confirmado. Registros: [portal e Hub](propostas/edi-suite-2026-10-16/implementacao.md#identidade-visual-páginas-e-hub-17102026), [home](../apps/informach-site/CLAUDE.md) e [Agenda](../apps/agenda-da-turma/CLAUDE.md), cujos leitores de matérias deixaram de gravar o conteúdo enviado à IA nos traces do Mastra. As linhas antigas desses traces (`ai_mastra.mastra_ai_spans` com `"serviceName" = 'agenda-da-turma'`) continuam em produção até uma limpeza autorizada pela titular. Verificação final: `pnpm check` sem erros, `pnpm typecheck` (21 tarefas), `pnpm exec turbo test` (19 tarefas), builds de portal, Hub, cinco ferramentas, site, Agenda, Cozya e Missão Saber, e `pnpm edi:test:integration --portal` em PostgreSQL descartável.

## Ambiente de desenvolvimento

`.nvmrc` e os workflows usam Node `24.15.0`, alinhados ao requisito `>=24.15.0` do manifest. Usar pnpm `9.15.0`, fixado em `packageManager`.

O complemento integrado em `d59c836` passou nos gates remotos de banco e Electron, incluindo abertura das ferramentas pelo Hub. A rodada Windows encontrou um timeout isolado no helper de captura guiada: 175 testes de mídia passaram e um foi cancelado. O atraso não foi reproduzido localmente; o teste recebeu alinhamento com o ambiente do produto e controle de diagnóstico/encerramento, mantendo seu limite. A nova evidência e os gates pendentes estão no [registro Windows](propostas/edi-suite-2026-10-16/producao-windows.md#espera-e-encerramento-do-helper-de-captura-guiada). Merge e publicação continuam pendentes.

## Operação dos produtos existentes

- [Missão Saber](../apps/missao-saber/PRODUCAO.md): produção, migrations, Stripe, cron e observabilidade.
- [Cozya](../apps/cozya/CLAUDE.md): produto, preços, acesso e referências da operação.
- [Agenda da Turma](../apps/agenda-da-turma/CLAUDE.md): família, permissões e fluxos de atividades/recados.
- [Runbook compartilhado](deploy-runbook.md): procedimentos gerais; conferir a configuração versionada e o guia atual de cada app antes de aplicar exemplos históricos.

Datas e identificadores de deployments nesses documentos são evidências históricas. Confirmar o estado remoto quando a tarefa envolver produção, sem registrar credenciais ou dados pessoais neste índice.
