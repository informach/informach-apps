# Dia de Estrela: guia do app

Leia antes o `AGENTS.md` da raiz, o [README](README.md) (como rodar e verificar) e o [PRODUCAO.md](PRODUCAO.md) (o que falta para publicar). Este guia guarda as regras do produto e as decisões que não aparecem só lendo o código.

Origem: o protótipo Taskids (React/Vite, sem servidor) passou por engenharia reversa e redesenho no canvas https://claude.ai/artifact/VotSYxs9k76uubPQAm5XGf. O relatório 4 do canvas registra as decisões de 06/11/2026 tomadas pelo titular; o app segue essas decisões.

## Produto

Rotina visual da criança, projetada para crianças autistas e com TDAH e vendida para qualquer família com crianças de 5 a 12 anos. Nenhuma promessa terapêutica.

- **Conta do titular, crianças só com apelido e cor.** Nada de idade, nascimento, foto da criança ou dado de saúde.
- **Grátis:** 1 criança, rotinas prontas e próprias, passo a passo, voz do aparelho, modo calmo, lembretes no tablet, estrelas, cofrinho, baú do dia e a loja só com itens de dinheiro.
- **Família** (R$ 24,90/mês ou R$ 249/ano): até 4 crianças, segundo responsável, alertas por push, voz dos pais gravada, itens próprios na loja e foto da meta.
- A política fica em `features/acesso/policy.ts`. O servidor recusa o que o plano não libera, mesmo que a tela tenha deixado passar. Nada que ajude a criança a funcionar no dia a dia fica atrás do pagamento.

## Regras (o servidor confere todas)

- **Dia da casa.** Tudo é calculado no fuso da família (`domain/relogio.ts`), nunca no UTC do servidor nem no fuso do aparelho.
- **Motor do dia** (`domain/rotina.ts`, portado do Taskids com os testes): tarefa "da vez", estados (feita, agora, atrasada, por vir), Primeiro → Depois, lembretes (aviso antes, "é agora", repetição, no máximo 6 toques, desiste em 3 horas, cede à próxima tarefa, "Adiar 15 min", "Lembrar agora").
- **Concorrência.** Todo escritor de conclusões, extrato e pedidos trava a criança (`lockChild`) e relê o registro depois da trava: dois adultos aprovando e desfazendo, ou entregando e recusando, ao mesmo tempo, decidem sobre o estado gravado.
- **Marcar.** A criança só marca o que já chegou ou a próxima da fila (`criancaPodeMarcar`), uma vez por dia. Com "precisa do ok", a conclusão fica `pending` e as estrelas só entram no extrato quando um adulto aprova. Adulto marca já aprovado. Desfazer não deixa linha de castigo e é recusado se as estrelas já foram usadas na loja.
- **Extrato.** Saldo = soma de `ledger`. Cada linha tem `sourceKey` única (`task:<conclusão>`, `chest:<criança>:<data>`, `redeem:<pedido>`, `bonus:<uuid>`), então repetir a operação não duplica. Nunca se perde estrela por esquecer.
- **Baú do dia.** Abre quando todas as tarefas do dia foram marcadas (inclusive as pendentes) e dá `chestBonus` estrelas (0 desliga a surpresa), uma vez por dia. Nunca fecha nem tira nada. Não há ofensiva.
- **Loja.** Pedido só com saldo livre (saldo − pedidos pendentes). As estrelas ficam guardadas até os pais entregarem (`delivered` debita) ou recusarem. Item de dinheiro custa `centavos × taxa / 100` estrelas no momento do pedido. Pagamentos e entregas são feitos fora do app. Itens próprios só aparecem e só podem ser pedidos enquanto o plano é Família (depois de rebaixar, ficam guardados). A meta tem teto de 1.000.000 estrelas (`META_MAX_ESTRELAS`).
- **Alertas aos pais.** A rotina `/api/jobs/alertas` (5 em 5 minutos, cron próprio, separado da cobrança) cria o alerta quando a tarefa passou do horário por `(alertAfter − 1) × repeatEvery` minutos, mesmo com o tablet desligado, uma vez por tarefa e dia, só para criança com aparelho conectado e até 3 horas depois do horário. Família recebe push; todos veem no Início. O push nunca mostra o nome da criança nem da tarefa. A rotina só percorre famílias com aparelho ativo, para em 50 s e guarda no Redis onde parou (`dia-de-estrela:jobs:alertas:cursor`); a execução seguinte continua dali e dá a volta na lista, então nenhuma família fica sempre de fora. Desligar o push num navegador tira só a inscrição dele (sempre por endpoint).

## Aparelho da criança e PIN

- O aparelho é pareado por código de 10 caracteres (10 minutos, uso único, HMAC) ou pelo "Usar este aparelho" (o adulto sai da conta). Token só como SHA-256; 30 dias renovados pelo sinal de vida (`/api/aparelho/sinal`, a cada 4 minutos, renova no máximo de hora em hora). Até 10 aparelhos ativos e 4 crianças por aparelho. Modelo da Missão Saber (`features/aparelho`).
- Um adulto que entra com a conta num navegador que era aparelho de criança encerra a conexão (`concluirEntradaAction`): o mesmo navegador não guarda as duas identidades.
- **PIN** de 4 a 6 dígitos, só como `scrypt` com sal (`features/aparelho/pin.ts`). Cinco erros em 15 minutos travam o PIN naquele aparelho (`access_limits`, chave HMAC). O acerto grava um cookie assinado, preso ao aparelho, que vale 10 minutos: abre Início, Rotinas e Cofrinho (aprovar, marcar, desfazer, lembrar, adiar, bônus, pedidos, rotinas, voz). Conta, assinatura, PIN, aparelhos, convites e apagar criança exigem a conta (`recentParent`/`familyOwner`). Isso corrige o protótipo, em que um PIN vazio liberava a área dos pais. `estrela.pin_locked` é gravado uma vez, no erro que trava o PIN.
- "Usar este aparelho" e o código de pareamento pedem entrada recente (`recentParent`): o aparelho dura 30 dias renováveis e não cai quando a sessão do adulto acaba.
- A tela Hoje é montada de novo quando vira o dia da casa (chave pelo dia); o que foi marcado no aparelho só vale até chegarem dados novos do servidor.

## Adultos

- **Segundo responsável:** convite por link (72 horas, uma pessoa por família, e-mail confirmado igual ao do convite). Ele vê e cuida de todas as crianças; assinatura, convites e apagar criança continuam do titular. Uma pessoa é segundo responsável de no máximo uma família e, para aceitar, não pode ter crianças numa família própria.
- Toda leitura e escrita passa pela família dona (`ownerId`) nas consultas, não só na tela (`daFamilia` em `rotina/repository.ts`, `lockChild` em `estrelas/repository.ts`).

## Tempo real

`features/tempo-real/bus.ts`: Redis pub/sub em produção, memória fora dela. A mensagem só diz o tipo de mudança; cada tela (`components/tempo-real.tsx`) faz `router.refresh()` e busca o que é dela com a própria autorização. Sem SSE, as telas se atualizam sozinhas (a criança a cada 60 s, os pais a cada 45 s).

## Arquivos

Voz da tarefa (até 15 s, 300 KB) e foto da meta (reduzida no aparelho, até 250 KB) ficam em `bytea` no Postgres (decisão de 06/11/2026: sem serviço de arquivos novo). O tipo vem dos bytes (`features/arquivos/validacao.ts`); as rotas `/api/voz/[taskId]` e `/api/meta/[childId]/foto` servem só para a família (num aparelho, só das crianças conectadas a ele), com `no-store`, `nosniff` e CSP `sandbox`.

## Visual

- Paleta e tokens em `src/app/globals.css` (canvas "Identidade visual proposta"); `src/app/tema.test.ts` mede o contraste de cada par de texto. O verde vivo `#27985A` não leva texto branco: botões usam `--de-folha-botao`.
- Fontes Baloo 2 (títulos) e Nunito (texto), servidas pela própria origem a partir dos pacotes `@fontsource-variable/*` (OFL).
- Área da criança: botões 3D (`.b3`), cartões `.chapa`, mascote Lumi (`components/desenhos.tsx`). Área dos pais: mesma paleta em doses pequenas (`.cartao`, `.bp`).
- **Responsivo:** criança em tablet/computador deitado em duas colunas (cartão e trilha, zigue-zague só do `lg`); celular em uma coluna, com estrelas e cadeado ao lado do nome e as abas numa linha própria; o lembrete e a conquista ocupam a tela toda. Pais: barra de baixo no celular, trilho lateral do `lg`. O E2E confere que não há rolagem lateral no celular.
- Nada pisca. O modo calmo (`data-calmo`) e o `prefers-reduced-motion` tiram animação e confete.

## Camadas

- Ações (`actions.ts`) chamam repositórios e conferem a autorização (`parentActor`, `familyAdult`, `familyOwner`, `requireChild`).
- Repositórios (`repository.ts`) fazem a persistência e as transações; lógica pura fica em `src/domain`.
- Contexto de página: `features/familia/view.ts` (`parentPage`, adulto ou PIN) e `features/aparelho/server.ts` (aparelho, criança escolhida, desbloqueio).
- O Biome da raiz verifica as fronteiras (páginas, componentes, ações e rotas não importam o banco).
