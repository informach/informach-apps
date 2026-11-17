# Missão Saber

## Compasso — autenticação em migração (09/11/2026)

O código deste app usa o login central em `apps/conta`, com callbacks/origens cadastrados em `@informach/config`. Cadastro, senha, verificação, recuperação e identidade compartilhada são geridos pela central; o app inicia OIDC e mantém apenas sua sessão vinculada à raiz. Sair encerra a raiz desse navegador. Ações que exigem confirmação recente usam `@informach/auth/web-sessions`, com a data da autenticação central; um callback novo não renova essa janela. `reautenticar=1` abre a confirmação real de credenciais. Não restaurar os antigos emissores de senha/OTP, hooks de exclusão global ou sessão Redis.

A migração de perfis, cobrança, créditos e privacidade ainda está em execução; os contratos antigos descritos abaixo não foram removidos integralmente nem migrados em produção. O corte exige concluir a conversão dos writers, backfill, sessões e provedores. Estado e evidências: [registro da migração](../../docs/propostas/assinatura-web-2026-11-09/implementacao.md). Para a matriz isolada de login, execute `pnpm compasso:test:integration --apps-only` na raiz; ela cobre os apps registrados, em série, no computador e no celular. Essa matriz usa PostgreSQL e autenticação; não homologa dependências operacionais Redis nem o readiness completo de produção.


Publicado em https://missao-saber.informach.com.br. Configuração e próximos passos de operação em [PRODUCAO.md](PRODUCAO.md). Stripe real em produção e teste no local. O catálogo publicado fica disponível conforme o plano; missões podem ser pausadas pontualmente para correção.

Versão comercial funcional para estudantes do 2º ano à 3ª série do ensino médio, com conta do responsável e trilhas de estratégias para OLITEF N1, N2 e N3, Canguru P, E, B, C, J e S, OBMEP N1, N2 e N3 e OBMEP Mirim 1 e 2. O catálogo tem 291 missões, 2.960 atividades autorais únicas, 336 itens reservados para diagnóstico e simulados e 175 desafios de justificativa, além de três laboratórios. As trilhas compartilham fundamentos; a contagem não duplica atividades compartilhadas. O perfil do estudante guarda o ano escolar e, se a família quiser, o mês e o ano de nascimento, que só servem para sugerir o ano; o ano avança sozinho na virada e as trilhas elegíveis acompanham.

## Abrir localmente

Requisitos: Node 24.15.0, pnpm 9.15.0 e o PostgreSQL/Redis locais do monorepo. A central (`conta`, porta 3011) e o Missão (3005) devem usar a **mesma base local**. Configure seus arquivos ignorados de ambiente pelos exemplos seguros, inclusive [o da central](../conta/.env.example), com segredos locais próprios, e-mail sandbox e cobrança desabilitada. Não reutilize uma conexão de produção.

```powershell
pnpm install --frozen-lockfile
# DATABASE_URL deve apontar explicitamente para a base local comum.
pnpm --filter @informach/db db:migrate
pnpm --filter @informach/conta exec node --env-file=.env.local --import=tsx scripts/setup-oauth.ts
# Em terminais separados:
pnpm dev:conta
pnpm dev:missao-saber
```

Abra `http://localhost:3005`. A demonstração em `/experimentar` dispensa cadastro. Cadastro, confirmação de e-mail e recuperação acontecem na central; em sandbox, os arquivos de e-mail ficam no `EMAIL_SANDBOX_DIR` configurado nela. Crie a família e as pessoas na Minha conta, depois prepare a trilha no Missão. O antigo `preview:setup`, que criava uma base somente para o app, foi retirado porque não atende ao SSO compartilhado. Arquivos `.env.local` e bancos de previews existentes não são sobrescritos nem apagados automaticamente.

Para abrir a manutenção de conteúdo em `/manutencao`, configure o e-mail de uma conta responsável em `MISSAO_CONTENT_MANAGER_EMAILS` ou seu ID em `MISSAO_CONTENT_MANAGER_IDS` e confirme esse e-mail. Em produção, `helena@informach.com.br` está autorizada. A manutenção permite consultar relatos, pausar conteúdo com problema, corrigir e reativar. Não existe fluxo de aprovação do catálogo. A área da família abre com a sessão normal; assinatura, dados pessoais, exclusão da conta e novos perfis exigem login feito há menos de dez minutos.

## Verificar

```powershell
pnpm --filter @informach/missao-saber test
pnpm --filter @informach/missao-saber test:integration
pnpm --filter @informach/missao-saber e2e
pnpm --filter @informach/missao-saber typecheck
pnpm build:missao-saber
```

Integração e E2E usam o harness Compasso. No Windows ele cria um servidor PostgreSQL descartável; no CI Linux cria uma base `compasso_review_<id>` no serviço PostgreSQL local, sem migrar a base administrativa. O E2E também exige Docker disponível para seu próprio Redis autenticado, compila central + Missão em série e inicia os servidores standalone nas portas cadastradas 3011/3005. Portas ocupadas causam falha; não há reaproveitamento de servidor alheio. Chromium cobre computador e Pixel 7, SSO e as jornadas de domínio existentes. Artefatos de build recebem ID aleatório; traces de falhas ficam em `apps/conta/test-results/compasso-apps/missao-saber`. E-mails e pagamentos são sintéticos. O harness neutraliza provedores dos `.env` no processo de teste sem alterar os arquivos. Encerramento abrupto pode exigir limpeza; confira primeiro os IDs exatos da execução.

Para focar um arquivo de banco: `pnpm compasso:test:integration --missao-test=test/family-plan.integration.ts` na raiz. O comando completo do app continua obrigatório após alterações transversais. O runner para o navegador após três falhas para permitir diagnóstico, sem retries nem redução das proteções de autenticação.

Os configs Vitest usam `oxc.jsx.runtime = "automatic"` para transformar os templates TSX com o Vite 8 fixado no lockfile, conforme o [guia de migração do Vite](https://vite.dev/guide/migration). O `jsx: preserve` herdado do Next não deve chegar sem transformação à execução dos testes de e-mail.

## Decisões principais

- A resposta correta e o feedback ficam no servidor. Tentativas têm idempotência, ordem validada e snapshot da versão estudada. Diagnóstico/simulado escondem correção até a conclusão, inclusive em histórico e exportação.
- Domínio requer variedade de problemas, dias diferentes e respostas sem pistas. Repetir a mesma atividade não cria evidência inédita. Revisões seguem 1/3/7/14/30 dias e voltam a um dia após erro ou apoio.
- Laboratórios de barras, malha e agrupamentos aceitam teclado. O botão de salvar persiste o estado por perfil com controle de concorrência; o caderno conserva a reflexão.
- As primeiras missões de cada trilha e o diagnóstico são gratuitos. O restante exige assinatura. Uma suspensão operacional impede novas sessões e respostas até a correção; o histórico permanece. Os arquivos oficiais de referência não entram no bundle nem no catálogo.
- Competição em família: o responsável coordena, no aparelho dele, vezes cronometradas entre perfis, com problemas sorteados no nível de cada criança e desafios de peças. O pódio fica só na conta do responsável (exceção registrada à regra de cooperação) e as respostas sob tempo não entram no motor de evidência. Os desafios de peças (3D, three.js) moram no laboratório, em `/laboratorio/pecas`. Ver a [proposta da competição](../../docs/propostas/missao-saber-competicao-2026-10-31/PROPOSTA.md).
- Na migração Compasso desta branch, identidade e cobertura são centrais. A página de conta encaminha ao Compasso; contratos anteriores conservam seu portal e reconciliação. Apagar o estudo exige gestão de todos os estudantes do contexto e remove somente dados/aparelhos deste app nessa família. Assinatura, pessoas e outros apps permanecem. O corte remoto ainda não foi executado.

Veja [PRODUCAO.md](PRODUCAO.md), a [proposta](../../docs/propostas/missao-saber-2026-09-13/PROPOSTA.md) e os [reviews](../../.compozy/tasks/missao-saber/reviews/).


## Migração Compasso em execução

Login já usa o SSO da central. A integração de pessoas e domínio está sendo convertida: não publicar esta branch até concluir os consumidores e o corte financeiro descritos no [registro da migração](../../docs/propostas/assinatura-web-2026-11-09/implementacao.md). O novo contrato de aparelhos grava família, IDs das concessões centrais e geração da ativação; a sessão infantil tem duração própria. Revogar e conceder novamente não reativa a credencial antiga. O gate focado `pnpm compasso:test:integration --missao-devices-only` usa PostgreSQL descartável e provedores sintéticos. Não substitui o conjunto de integração, navegador ou homologação operacional.

A sequência 0101 → 0102 → 0103 → 0104 preserva aparelhos autorizados e remove apenas capacidades operacionais que perderam permissão, sem apagar estudo. Origem ativa conflitante aborta o backfill. Requer pausar escritores antigos junto ao corte 0082 e restauração de backup ensaiada para reversão; não fazer downgrade ou reescrever migrations aplicadas. O emissor agora aponta para `core.users`; limpar preferências antigas não revoga aparelhos por cascata. Exclusão dos dados deste app deve encerrar seus aparelhos explicitamente, sem afetar a identidade central.


O domínio do Missão usa `LearningAuthority` discriminada: adulto com família selecionada ou criança com emissor, família, aparelho e estudante. Actions não reduzem essa identidade a um userId. Leituras de histórico conferem concessão atual; mutações travam família, aparelho (quando houver) e estudante, com rechecagem após espera. Cobertura e slots comerciais são relidos na transação. Novo estudante ativa uma pessoa da central e guarda apenas preferências escolares locais. `getProfiles` não usa a autoria histórica como autorização.

0105–0107 migram desafios para a família; 0108 solta a autoria histórica dos perfis da cascata de preferências; 0109–0111 migram competições pela origem registrada. 0113 remove nome/avatar nativos e exige `family_profile_id`; snapshots históricos de competições não são identidade corrente. 0112 permite preferências de um adulto convidado sem fabricar consentimento: versão/data só são gravadas quando ele confirma o formulário escolar. O resumo semanal consulta apenas pessoas concedidas e reconfere destinatário, opt-in, IDs das concessões, geração da ativação e versão dos dados antes de entregar. O pódio requer leitura de todos os participantes; gestão familiar ou pagamento isoladamente não concede essa leitura.

`pnpm compasso:test:integration --missao-only` executa a suíte PostgreSQL completa com as mesmas proteções de banco descartável do gate focado. A limpeza dos fixtures desativa contas sintéticas, sem contornar as restrições de custódia da conta; o harness remove a base inteira no final. Os ensaios históricos adicionais ficam em `packages/family`. Tipos, testes de banco e navegador são gates distintos; evidências correntes estão no registro da frente.

A exclusão do histórico do app exige gestão explícita atual, inclusive para pessoas arquivadas, sem reabrir leitura/estudo. A operação inteira da família exige administrador e gestão de todos os perfis removidos. Compartilhamento, pagamento e autoria histórica isolados não concedem esse direito. A manutenção de conteúdo não recebe nome/avatar da pessoa central.


## Avaliação de privacidade Compasso

`POST /api/jobs/account-departure` exige o segredo de cron do próprio app. A composição `lib/account.ts` fixa o app e injeta banco; o repository da funcionalidade consulta somente indicadores e contagens, com timeout por statement. Não aceitar ator/app vindos do corpo, retornar conteúdo ou considerar ausência de resposta como ausência de dados. A fila compartilhada tem posse, repetição e invalidação de respostas atrasadas; falha parcial é 503 e falha operacional no Bastidores. O agendamento está preparado na IaC, ainda sem provisão remota. A avaliação de leitura não congela acesso nem autoriza exclusão. A mesma rota agora processa primeiro as etapas de encerramento já autorizadas no coordenador, por adapter fixado na composição do app, e depois as avaliações; nunca aceita ator/domínio do HTTP. Retorna contagens separadas de etapas e avaliações. Congelamento e consentimento pertencem à Conta; provisionamento e homologação remotos continuam pendentes. Contrato e limitações no [plano de privacidade](../../docs/propostas/assinatura-web-2026-11-09/privacidade-conta.md).

A composição dos preços usa `getConfiguredProducts` de `@informach/config`: o nome da variável está junto do produto no catálogo. A Conta reutiliza a mesma resolução para conciliar contratos anteriores; não manter mapas locais paralelos de produto para variável. Somente o ID do modo configurado é substituído, sem alterar valores, franquias ou o outro modo Stripe.


### Participação Compasso e conexões de estudo

Rotina e consentimento de resumo semanal são escritas pessoais protegidas pela participação web; a seleção/entrega de resumos exige participação ativa. Checkpoints atrasados não escrevem numa conta suspensa. A migration 0144 registra a revisão do emissor em aparelhos/códigos: suspender e retomar não reativa uma conexão antiga. As consultas de perfil comparam a revisão, além das concessões e do prazo existentes. Novas conexões capturam a revisão sob trava, após a autorização familiar. A lista apresenta conexões antigas como encerradas; elas não ocupam capacidade. Não é um encerramento global: o pedido durável e sua limpeza continuam no plano de privacidade Compasso.


### Encerramento Compasso — adapter interno

`features/account/closure-repository.ts` usa a seleção congelada de `family/closure`. Preferências e relatos pessoais sem perfil são do ator; estudo e relatos com perfil seguem a ativação, não o autor histórico. Limpeza nativa é compartilhada com `clearFamily`. Remover perfis exige apagar relatos explicitamente, pois as FKs de relatos/competidores usam SET NULL. Competições totalmente exclusivas são apagadas junto de snapshots/turnos; compartilhadas são preservadas. Uma competição mista impede confirmar até resolver a responsabilidade ou remover a competição com a autorização normal do app. Não amputar participantes de um resultado compartilhado nem deixar cópias escolares órfãs. Desafios do grupo só desaparecem em grupo exclusivo.

Retomada preserva estudo/preferências e remove aparelhos/códigos antigos do emissor. A prova de envio de resumo inclui a revisão web: reabrir a participação não revalida corpo preparado antes da suspensão. O adapter está conectado à rotina HTTP autenticada e ao coordenador da Conta, em implementação local; habilitação em produção depende da jornada integrada e do corte. Evidências no registro Compasso.
