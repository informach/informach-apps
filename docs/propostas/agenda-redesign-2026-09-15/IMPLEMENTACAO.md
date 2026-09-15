# Implementação da proposta — o que ficou de pé

15/09/2026 · Registro do que foi implementado da [proposta](./PROPOSTA.md), do que foi feito diferente, do que não foi feito e do que ficou esperando decisão. Branch `feat/agenda-redesign-2026-09`.

---

## 1. Como ler este documento

A proposta descreve o que deveria ser feito. Este arquivo descreve **o que é verdade no código**. Onde os dois discordam, este manda — e a discordância está explicada.

Cada fase foi implementada, revisada por uma leitura independente e corrigida antes da seguinte. Os achados dessas revisões estão nos commits `fix(agenda): fecha os achados do review da fase N`, e os mais graves estão resumidos em §5, porque dizem mais sobre o produto do que sobre o código.

---

## 2. As fases

| Fase | Commit | Estado |
|---|---|---|
| 0 — Correções | `090875b` | completa |
| 1 — Direção visual | `090875b` | completa |
| 2 — Produto rápido | `090875b` + `0a67851` | completa |
| 3 — Modo Criança | `0f9ffca` + `e0f6df3` | completa |
| 4 — Profundidade | `abae20a` + `762c29b` | completa |
| 5 — Offline | `4bbe15b` | **parcial, de propósito** (ver §4) |

### Fase 0 — o que estava quebrado

**T1, o bug de fuso, era real e está provado.** `features/activities/utils.ts` tinha uma cópia privada de `todayLocalIso` que lia o fuso do processo, e `getDueUrgency` cai em `new Date()` por padrão. No Railway (UTC), das 21h à meia-noite de Brasília, o prazo de **toda** atividade errava o dia. O teste novo prende o fuso do processo em UTC: sem isso ele passaria na máquina de quem escreve e só o CI descobriria. Verificado revertendo a correção — quatro casos reprovam, e voltam a passar com ela.

**D1/T4, o avatar,** tinha duas implementações com cores de texto diferentes, cada uma reprovando no tema oposto (2,54:1 no claro, 1,31:1 no escuro). Uma só agora, pastilhada: 13,65:1 e 7,76:1 no pior caso.

**D2, as tintas.** `chart-N` e `primary` como cor de TEXTO reprovavam (2,43:1 a 4,29:1). Entraram `chart-N-ink` e `primary-ink`, derivadas por `color-mix` contra o `--foreground`. Não é token de paleta novo: é a mesma cor, legível. A regra ficou escrita em `globals.css`: **preenchimento usa a cor, glifo usa a tinta.** O Lightning CSS ainda gerou fallback automático para navegadores sem `color-mix`.

Também: o PWA instalado abria a landing de vendas; o calendário lia datas em ISO cru para leitor de tela; o blip conhecia quatro dos oito tipos; e o `CLAUDE.md` §9 negava um service worker que existe desde que o push entrou.

### Fase 1 — três níveis de superfície

Sem inventar token: o fundo do app leva `bg-app-ground` (tinta de 5% do laranja existente), o cartão fica `bg-card` puro, e **um** elemento por tela ganha `shadow-solid`. O título da atividade subiu para a primeira linha do card — a criança desceu para a linha de contexto, como pastilha com avatar. No celular a vista do mês virou agenda vertical; a grade 7×6 ficou para `md`.

### Fase 2 — os números viraram navegação

Os quatro contadores da rotina abrem a lista que contaram. Isso **exigiu um filtro de prazo real** em `/atividades`: um contador que leva a uma lista sem recorte mentiria. Os limites de `dueWindowRange` replicam os `COUNT(*) FILTER` de `getRoutineCounters`, e há teste de integração contra Postgres prendendo os quatro recortes.

Depois das 18h em São Paulo a mochila de amanhã vira o primeiro bloco da página e sai do bucket — nada aparece ou some, só troca de lugar. E o dia passou a fechar: concluída a última pendência, a seção reconhece o esforço em vez de devolver a mesma caixa de quem nunca cadastrou nada.

### Fase 3 — a criança

`/crianca/[perfilId]`, fora do grupo `(app)`: nada de "Seja Pro", menu do avatar ou rodapé a um toque de uma criança com o telefone. Uma atividade por vez, botão de 64 px, sem prazo em vermelho. Sair exige segurar o dedo — quebra-molas, não tranca, e está dito assim no código.

`getKidModeSnapshot` **reusa** `getRoutineSnapshot` e fica com o bucket `attention`: a mesma projeção SQL que o responsável vê. Há teste de integração prendendo essa invariante — se alguém criar uma consulta própria para o modo criança, o teste quebra.

A sequência é **por casa, nunca por criança**. `listFamilyCompletionDays` não aceita filtro de perfil de propósito: um número por filho viraria placar entre irmãos dentro de casa.

### Fase 4 — profundidade

Estimativa de tempo (coluna nullable, presets de 5/15/30/60, soma por bucket com aviso quando é parcial), "Só o que é meu" para o segundo adulto, barra de sem conexão, o combinado da casa, e o fim da franquia contado do lado do que a família ganhou.

---

## 3. O que foi feito diferente da proposta

**F10 não virou quarto passo do onboarding.** A proposta pedia um passo depois do plano. O passo 3 termina no Stripe para quem escolhe o Pro, e um passo entre o checkout e a volta tornaria frágil justamente o caminho que paga. Virou card na primeira rotina, com os mesmos quatro horários e o mesmo compromisso explícito. Se a preferência for o stepper, a mudança é contida — o widget já encapsula a escrita.

**F4 precisou de mais do que a proposta dizia.** "Cada card vira `Link` para `/atividades?situacao=…`" não era suficiente: `situacao` não expressa atrasada/hoje/semana. O filtro de janela de prazo é parte do F4, não escopo extra.

**O KPI "Concluídas (7d)" mudou de significado.** Contava atividades cujo **prazo** caiu nos últimos sete dias; concluir hoje uma tarefa vencida há três semanas não mexia no número. Agora conta pela **conclusão**, e a lista que o card abre usa a mesma coluna. É mudança de comportamento de um número que já existia, e está aqui para não passar despercebida.

---

## 4. O que não foi feito

**A fila de escrita offline (parte do F8).** A leitura offline do esqueleto está pronta: service worker registrado para todo mundo, `/_next/static/*` em cache, e `/offline` no lugar da tela do navegador quando a navegação falha. **HTML autenticado nunca entra no cache** — a rotina de uma família é dado sensível e o aparelho é compartilhado; uma página em cache sobreviveria ao logout.

A fila não entrou, e é decisão. Concluir usa `version` para concorrência otimista: repetir uma gravação enfileirada depois que outra pessoa editou não é "tentar de novo", é decidir por ela. Uma fila honesta precisa de:

1. um endpoint idempotente próprio — replay de server action não serve, o id muda a cada build;
2. uma política explícita para conflito de versão na reconciliação;
3. uma tela que mostre o que não subiu.

São três peças, e é trabalho de uma fase própria. Enquanto isso, a barra de sem conexão diz o que é verdade: dá para ler, e **marcar como feito precisa de rede** — a primeira versão do texto prometia que as mudanças esperavam, o que era falso.

**A fatia barata entrou no lugar dela.** Quando a gravação falha, o card mostra
**"Tentar de novo"** ao lado do erro, em vez de só reverter e deixar a pessoa
adivinhar que dá para insistir. Nada fica guardado e nada sobe sozinho — mas o
`router.refresh()` da falha já trouxe a versão nova, então a segunda tentativa
não repete um conflito de versão. No modo criança o caminho já era esse: a
atividade volta e a criança toca "Feito!" de novo.

---

## 5. Decisões que precisam de você

### 5.1 Matéria extracurricular pausada — resolvido: o silêncio vale em tudo

Era divergência pré-existente que ficou visível quando os contadores viraram
link: na mesma tela, o card dizia "Atrasadas 1" e o progresso logo abaixo dizia 0
para a mesma criança.

A regra "pausada é silêncio" já estava escrita e já valia em duas consultas. Foi
aplicada na terceira em vez de removida das outras duas: o predicado mora em
`features/profile-subjects/visibility.ts` e é composto por **sete** consultas —
as três projeções de tela mais o limite do plano gratuito, o calendário, as
listas do PDF e a fonte do resumo por e-mail.

A primeira tentativa aplicou só nas três, e o review final mostrou o preço:
`countPendingActivities` passou a contar o que a tela escondia, então a família
que pausasse uma extra lia 15 pendências e era recusada ao cadastrar a 16ª, sem
causa visível. O calendário e o e-mail das 20h continuavam nomeando a atividade
que tinha sumido de todas as telas. **Aplicar em algumas e não em outras é pior
do que não aplicar.**

`listFamilyCompletionDays` (a sequência) fica de fora de propósito: ela conta
histórico, e pausar uma matéria hoje não desfaz o que foi feito em março.

O teste de integração prende as cinco superfícies juntas: pausar tira da lista,
do KPI, do limite, do calendário e do resumo no mesmo passo; despausar devolve
as cinco.

O preço aceito: pausar uma extra tira as atividades dela de `/atividades`
também. É o que "pausar" quer dizer, é explícito e é reversível.

### 5.2 Uma migração do `missao-saber` pegou carona neste branch

`packages/db/src/migrations/0054_green_revanche.sql` (coluna `reading_support` em
`missao_saber.sessions`) e a alteração correspondente em
`packages/db/src/schema/missao-saber.ts` entraram no commit `0a67851`, que é um
commit da Agenda. Aconteceu porque `pnpm db:generate` roda sobre a árvore
inteira, e outra sessão estava editando o `missao-saber` ao mesmo tempo.

**Não extraí, de propósito.** O código do `missao-saber` que usa a coluna está
na árvore de trabalho (`features/learning/*`), e o arquivo de schema mudou de
novo depois do meu commit — ou seja, aquela sessão continua trabalhando nele.
Reverter aqui apagaria o trabalho dela da árvore compartilhada.

O risco prático é baixo: `ADD COLUMN boolean NOT NULL DEFAULT false` é aditiva e
sem reescrita, e a coluna fica sem uso até o código do outro app chegar. O custo
real é de procedência — o snapshot 0054 fixa um estado de schema que esta
revisão não examinou, e um merge da Agenda leva para produção uma coluna de
outra feature.

**O que fazer antes do merge:** decidir com quem cuida do `missao-saber` se a
0054 sai daqui e vai com a feature dela, ou se fica. Se sair, a 0055 da Agenda
precisa ser regerada. Se ficar, basta registrar no PR que a 0054 não pertence a
este trabalho.

**Regra para a próxima vez:** conferir `git status` antes de `pnpm db:generate`,
e commitar `packages/db` por caminho de arquivo, nunca com `-A` no diretório.

### 5.3 Editar apagava repetição semanal e lembrete — resolvido

`taskSelect` não projetava `recurrence` nem `reminderAt`, então o formulário de
edição não tinha como lê-los e gravava `"none"`/`null` por cima: uma atividade
semanal editada pelo detalhe virava avulsa e o lembrete sumia.

As duas colunas entraram na projeção e `taskToActionInput` passou a lê-las.
Devolver os **mesmos** valores não esbarra no gate de Pro — `updateNoticeAction`
recusa quando a edição *acrescenta* automação, não quando preserva o que já
estava lá. Isso também é o certo para quem voltou ao gratuito: editar o título
não é hora de apagar em silêncio o que a família configurou quando era Pro.

### 5.4 O KPI calcula "hoje" no render; a lista recalcula no clique

Numa aba deixada aberta na virada da meia-noite, o contador e a lista discordam por um dia. É a mesma propriedade que os buckets da rotina já têm. Fixar exigiria pôr o dia no link e ampliar o contrato da URL — o que significa aceitar um "hoje" arbitrário vindo de fora. Deixei como está e registrei.

---

## 6. Verificação

Tudo verde no fim:

| O quê | Resultado |
|---|---|
| `typecheck` | limpo |
| `biome check` | limpo, 401 arquivos |
| Testes unitários | **467** (eram 423) |
| Testes de integração, contra Postgres local | **56** (eram 51) |
| Playwright, config do CI | **16/16** |
| `build` de produção | compila |

Migração `0055_ambiguous_devos.sql`: `ALTER TABLE agenda.tasks ADD COLUMN estimated_minutes integer`. Aditiva, nullable, sem default e sem backfill — aplicável antes do código novo, sem janela de indisponibilidade.

**Duas regressões foram pegas por rodar o que os reviews não rodam:** o Playwright quebrou porque o botão de escape do estado vazio mudou de nome, e a primeira tentativa de E2E falhou por `EMAIL_SANDBOX_MODE=live` no `.env.local` — configuração local, não código. Vale lembrar que o E2E de rotina precisa de `EMAIL_SANDBOX_MODE=sandbox` no servidor.

---

## 7. O que não foi trazido das referências, e por quê

Registrado na proposta §5 e mantido: nenhum leaderboard ou pontuação entre crianças (a sequência é da casa), nenhum mascote proprietário, nenhum fundo ilustrado de borda a borda, e a tipografia continua Plus Jakarta Sans.
