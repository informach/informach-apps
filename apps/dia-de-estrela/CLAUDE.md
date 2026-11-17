# Dia de Estrela: guia do app

## Compasso — contrato implementado na branch (10/11/2026)

O código deste app usa o login central em `apps/conta`, com callbacks/origens cadastrados em `@informach/config`. Cadastro, senha, verificação, recuperação e identidade compartilhada são geridos pela central; o app inicia OIDC e mantém apenas sua sessão vinculada à raiz. Sair encerra a raiz desse navegador. Ações que exigem confirmação recente usam `@informach/auth/web-sessions`, com a data da autenticação central; um callback novo não renova essa janela. `reautenticar=1` abre a confirmação real de credenciais. Não restaurar os antigos emissores de senha/OTP, hooks de exclusão global ou sessão Redis.

A identidade, as permissões e os writers deste app foram convertidos para o núcleo Compasso; a migração completa, a cobrança anterior e a privacidade central ainda estão em execução. Nada foi migrado em produção. Os ensaios e gates pendentes estão no [registro da migração](../../docs/propostas/assinatura-web-2026-11-09/implementacao.md). O `e2e` próprio agora usa a fixture comum com central, app standalone e Redis real; comandos no README.

Leia antes o `AGENTS.md` da raiz, o [README](README.md) (como rodar e verificar) e o [PRODUCAO.md](PRODUCAO.md) (o que falta para publicar). Este guia guarda as regras do produto e as decisões que não aparecem só lendo o código.

Origem: o protótipo Taskids (React/Vite, sem servidor) passou por engenharia reversa e redesenho no canvas https://claude.ai/artifact/VotSYxs9k76uubPQAm5XGf. O relatório 4 do canvas registra as decisões de 06/11/2026 tomadas pelo titular; o app segue essas decisões.

## Produto

Rotina visual da criança, projetada para crianças autistas e com TDAH e vendida para qualquer família com crianças de 5 a 12 anos. Nenhuma promessa terapêutica.

- **Conta compartilhada, pessoas centrais e histórias por app.** Crianças usam nome de exibição e cor. Nada de idade, nascimento, foto da criança ou dado de saúde.
- **Grátis:** 1 criança, rotinas prontas e próprias, passo a passo, voz do aparelho, modo calmo, lembretes no tablet, estrelas, cofrinho, baú do dia e a loja só com itens de dinheiro.
- **Compasso**, conforme `COMPASSO_POLICY` (R$ 49,90/mês ou R$ 499/ano, dois adultos e quatro dependentes, teste de 14 dias sem cartão): até 4 crianças, alertas por push, voz dos pais gravada, itens próprios na loja e foto da meta.
- A política fica em `features/acesso/policy.ts`. O servidor recusa o que o plano não libera, mesmo que a tela tenha deixado passar. Nada que ajude a criança a funcionar no dia a dia fica atrás do pagamento.

## Regras (o servidor confere todas)

- **Dia da casa.** Tudo é calculado no fuso da família (`domain/relogio.ts`), nunca no UTC do servidor nem no fuso do aparelho.
- **Motor do dia** (`domain/rotina.ts`, portado do Taskids com os testes): tarefa "da vez", estados (feita, agora, atrasada, por vir), Primeiro → Depois, lembretes (aviso antes, "é agora", repetição, no máximo 6 toques, desiste em 3 horas, cede à próxima tarefa, "Adiar 15 min", "Lembrar agora").
- **Concorrência.** Todo escritor de conclusões, extrato e pedidos trava o grupo, o aparelho quando houver e a criança em ordem estável (`lockChildAccess`) e relê o registro depois da trava: dois adultos aprovando e desfazendo, ou entregando e recusando, ao mesmo tempo, decidem sobre o estado gravado.
- **Marcar.** A criança só marca o que já chegou ou a próxima da fila (`criancaPodeMarcar`), uma vez por dia. Com "precisa do ok", a conclusão fica `pending` e as estrelas só entram no extrato quando um adulto aprova. Adulto marca já aprovado. Desfazer não deixa linha de castigo e é recusado se as estrelas já foram usadas na loja.
- **Extrato.** Saldo = soma de `ledger`. Cada linha tem `sourceKey` única (`task:<conclusão>`, `chest:<criança>:<data>`, `redeem:<pedido>`, `bonus:<uuid>`), então repetir a operação não duplica. Nunca se perde estrela por esquecer.
- **Baú do dia.** Abre quando todas as tarefas do dia foram marcadas (inclusive as pendentes) e dá `chestBonus` estrelas (0 desliga a surpresa), uma vez por dia. Nunca fecha nem tira nada. Não há ofensiva.
- **Loja.** Pedido só com saldo livre (saldo − pedidos pendentes). As estrelas ficam guardadas até os pais entregarem (`delivered` debita) ou recusarem. Item de dinheiro custa `centavos × taxa / 100` estrelas no momento do pedido. Pagamentos e entregas são feitos fora do app. Itens próprios só aparecem e só podem ser pedidos enquanto há cobertura Compasso (depois de rebaixar, ficam guardados). A meta tem teto de 1.000.000 estrelas (`META_MAX_ESTRELAS`).
- **Alertas aos pais.** A rotina `/api/jobs/alertas` (5 em 5 minutos, cron próprio, separado da cobrança) cria o alerta quando a tarefa passou do horário por `(alertAfter − 1) × repeatEvery` minutos, mesmo com o tablet desligado, uma vez por tarefa e dia, só para criança com aparelho conectado e até 3 horas depois do horário. O Compasso libera push; só adultos com leitura explícita da criança são destinatários, com nova conferência antes de cada envio. O push nunca mostra o nome da criança nem da tarefa. A rotina só percorre famílias com aparelho ativo, para em 50 s e guarda no Redis onde parou (`dia-de-estrela:jobs:alertas:group-cursor`); a execução seguinte continua dali e dá a volta na lista, então nenhuma família fica sempre de fora. Desligar o push num navegador tira só a inscrição dele (sempre por endpoint).

## Aparelho da criança e PIN

- O aparelho é pareado por código de 10 caracteres (10 minutos, uso único, HMAC) ou pelo "Usar este aparelho" (o adulto sai da conta). Token só como SHA-256; 30 dias renovados pelo sinal de vida (`/api/aparelho/sinal`, a cada 4 minutos, renova no máximo de hora em hora). Até 10 aparelhos ativos e 4 crianças por aparelho. Modelo da Missão Saber (`features/aparelho`).
- Um adulto que entra com a conta num navegador que era aparelho de criança encerra a conexão (`concluirEntradaAction`): o mesmo navegador não guarda as duas identidades.
- **PIN** de 4 a 6 dígitos, só como `scrypt` com sal (`features/aparelho/pin.ts`). Cinco erros em 15 minutos travam o PIN naquele aparelho (`access_limits`, chave HMAC). O acerto grava um cookie assinado, preso ao aparelho e à geração atual do PIN, que vale 10 minutos: abre Início, Rotinas e Cofrinho (aprovar, marcar, desfazer, lembrar, adiar, bônus, pedidos, rotinas, voz). Conta, assinatura, PIN, aparelhos, convites e apagar criança exigem a conta (`recentParent`/`familyAdministrator`). Isso corrige o protótipo, em que um PIN vazio liberava a área dos pais. `estrela.pin_locked` é gravado uma vez, no erro que trava o PIN.
- "Usar este aparelho" e o código de pareamento pedem entrada recente (`recentParent`): o aparelho dura 30 dias renováveis e não cai quando a sessão do adulto acaba.
- A tela Hoje é montada de novo quando vira o dia da casa (chave pelo dia); o que foi marcado no aparelho só vale até chegarem dados novos do servidor.

## Pessoas, adultos e permissões

- Convites e gestão da identidade ficam na Minha conta. Participar do grupo não concede leitura das crianças. `read`, `write`, `manage` e `use_ai` são concessões distintas por pessoa e app; este app não usa IA.
- Adulto seleciona o contexto `/contexto`. Consultas vinculam grupo, pessoa e ativação canônicos, estado de arquivamento, membro atual e concessão. O `userId` nativo de crianças é só origem histórica, nunca autorização.
- Primeiro uso e ativação adicional recebem IDs centrais, nunca inferem identidade por nome. Settings, loja global e PIN exigem administrador; exclusão de um histórico exige `manage`, preservando pessoa e outros apps. Perfil arquivado ainda pode ser apagado por um gestor atual.
- `familia/authority.ts` distingue adulto, criança e PIN. O PIN não administra o grupo nem amplia a lista de crianças do aparelho. Escritas conferem autoridade e cobertura novamente dentro da transação; a vaga gratuita é da família inteira, não de cada subconjunto visível.
- Aparelhos conservam a geração da ativação e os IDs exatos das concessões de leitura/escrita que os autorizaram. Revogar e recriar concessão não ressuscita aparelho/código antigo. Expiração e troca de PIN são conferidas após as travas.
- `0114` expande, `0115` confere proveniência e vincula as capacidades existentes, `0116` contrai. Não altera IDs, hashes, validade ou históricos. Nomes e cores passam ao núcleo; convites locais pendentes deixam de ser aceitos, e os responsáveis já aceitos conservam somente as permissões migradas. Conflito de proveniência aborta a transação inteira.

## Tempo real

`features/tempo-real/bus.ts`: Redis pub/sub em produção, memória fora dela. A mensagem só diz o tipo de mudança; cada tela (`components/tempo-real.tsx`) faz `router.refresh()` e busca o que é dela com a própria autorização. O canal é o grupo canônico. Sessão/concessão é revalidada antes de cada sinal e ping; revogação fecha a conexão, e cada conexão dura no máximo cinco minutos. Sem SSE, as telas se atualizam sozinhas (a criança a cada 60 s, os pais a cada 45 s).

## Arquivos

Voz da tarefa (até 15 s, 300 KB) e foto da meta (reduzida no aparelho, até 250 KB) ficam em `bytea` no Postgres (decisão de 06/11/2026: sem serviço de arquivos novo). O tipo vem dos bytes (`features/arquivos/validacao.ts`); as rotas `/api/voz/[taskId]` e `/api/meta/[childId]/foto` servem só para a família (num aparelho, só das crianças conectadas a ele), com `no-store`, `nosniff` e CSP `sandbox`.

## Visual

- Paleta e tokens em `src/app/globals.css` (canvas "Identidade visual proposta"); `src/app/tema.test.ts` mede o contraste de cada par de texto. O verde vivo `#27985A` não leva texto branco: botões usam `--de-folha-botao`.
- Fontes Baloo 2 (títulos) e Nunito (texto), servidas pela própria origem a partir dos pacotes `@fontsource-variable/*` (OFL).
- Área da criança: botões 3D (`.b3`), cartões `.chapa`, mascote Lumi (`components/desenhos.tsx`). Área dos pais: mesma paleta em doses pequenas (`.cartao`, `.bp`).
- **Responsivo:** criança em tablet/computador deitado em duas colunas (cartão e trilha, zigue-zague só do `lg`); celular em uma coluna, com estrelas e cadeado ao lado do nome e as abas numa linha própria; o lembrete e a conquista ocupam a tela toda. Pais: barra de baixo no celular, trilho lateral do `lg`. O E2E confere que não há rolagem lateral no celular.
- Nada pisca. O modo calmo (`data-calmo`) e o `prefers-reduced-motion` tiram animação e confete.

## Camadas

- Ações (`actions.ts`) chamam repositórios e conferem a autorização (`parentActor`, `familyAdult`, `familyAdministrator`, `requireChild`).
- Repositórios (`repository.ts`) fazem a persistência e as transações; lógica pura fica em `src/domain`.
- Contexto de página: `features/familia/view.ts` (`parentPage`, adulto ou PIN) e `features/aparelho/server.ts` (aparelho, criança escolhida, desbloqueio).
- O Biome da raiz verifica as fronteiras (páginas, componentes, ações e rotas não importam o banco).


## Avaliação de privacidade Compasso

`POST /api/jobs/account-departure` exige o segredo de cron do próprio app. A composição `lib/account.ts` fixa o app e injeta banco; o repository da funcionalidade consulta somente indicadores e contagens, com timeout por statement. Não aceitar ator/app vindos do corpo, retornar conteúdo ou considerar ausência de resposta como ausência de dados. A fila compartilhada tem posse, repetição e invalidação de respostas atrasadas; falha parcial é 503 e falha operacional no Bastidores. O agendamento está preparado na IaC, ainda sem provisão remota. A avaliação de leitura não congela acesso nem autoriza exclusão. A mesma rota agora processa primeiro as etapas de encerramento já autorizadas no coordenador, por adapter fixado na composição do app, e depois as avaliações; nunca aceita ator/domínio do HTTP. Retorna contagens separadas de etapas e avaliações. Congelamento e consentimento pertencem à Conta; provisionamento e homologação remotos continuam pendentes. Contrato e limitações no [plano de privacidade](../../docs/propostas/assinatura-web-2026-11-09/privacidade-conta.md).

A composição dos preços usa `getConfiguredProducts` de `@informach/config`: o nome da variável está junto do produto no catálogo. A Conta reutiliza a mesma resolução para conciliar contratos anteriores; não manter mapas locais paralelos de produto para variável. Somente o ID do modo configurado é substituído, sem alterar valores, franquias ou o outro modo Stripe.


## Participação web e aparelhos

A 0144 conserva a revisão de participação do adulto emissor em cada aparelho. A emissão a captura sob a trava de participação depois da trava familiar; as consultas de delegação comparam revisão e estado atuais. Suspender e retomar exige novo pareamento, inclusive para códigos ainda não utilizados e autoridade PIN. Aparelhos de revisão anterior não ocupam a capacidade nem aparecem ativos. Push pessoal usa a mesma trava para inscrição e admissão de entrega; um endpoint de outro adulto não pode ser reassociado silenciosamente. Leituras e jobs descartam destinatários suspensos. Isso não substitui o executor de encerramento, ainda separado.

A 0146 conserva também a revisão da entrega push. Claim dura 60 segundos, exige inscrição ainda existente do destinatário e é revalidado antes de enviar; recibo encerrado/expirado não volta a `sent` por conclusão atrasada. O timeout externo é de 10 segundos; não há promessa de recolher push já aceito pelo provedor.

O adapter interno `features/account/closure-repository.ts` compartilha a remoção nativa com `deleteChild`. Usa `family/closure` para preservar históricos concedidos a outro adulto; configurações/PIN e loja são do grupo, nunca do criador histórico. Vozes, fotos, rotinas, estrelas e pedidos exclusivos seguem as FKs do perfil removido. Retomada mantém conteúdo e invalida somente aparelhos, códigos, inscrições push e claims antigos do emissor. Envios em curso impedem executar até terminar/vencer. Conta, worker HTTP e desligamento final estão conectados localmente. A implantação exige todos os domínios e validação integrada; o worker não aceita consentimento ou seleção vindos do HTTP.
