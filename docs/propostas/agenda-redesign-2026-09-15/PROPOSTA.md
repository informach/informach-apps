# Proposta de evolução da Agenda da Turma — design, produto e correções

15/09/2026 · Estudo de duas referências de mercado, diagnóstico do app implementado e proposta de evolução. Nenhum código foi alterado nesta etapa. Os achados técnicos foram verificados no repositório; os de contraste foram medidos a partir dos tokens em `apps/agenda-da-turma/src/app/globals.css` e `packages/ui/src/styles.css`.

Referência visual: [`conceito.html`](./conceito.html).

> ⚠️ **Este documento é a proposta, não o registro do que foi feito.** A
> implementação divergiu dele em dez pontos — rota do modo criança, regra da
> sequência, PIN, reuso do `useCardToggle`, escopo do filtro "o que é meu",
> onboarding, agenda do mês, ilustrações, cor da sombra, e a fila de escrita
> offline, que foi deliberadamente recusada. Várias dessas divergências são
> decisões melhores que a proposta; nenhuma está descrita aqui.
>
> **Para saber o que é verdade no código, leia [`IMPLEMENTACAO.md`](./IMPLEMENTACAO.md).**

---

## 1. As duas referências estudadas

### 1.1 Top Grade — Online Assessment & Homework App (Amrita Paithankar, fev/2024)

Case study completo de um app de dever de casa com três papéis: professor, estudante e responsável. Pesquisa com survey, personas, empathy map, customer journey, wireframes e UI final.

**Sistema visual.** O fundo não é branco: é um creme quente que ocupa a tela inteira, e o branco fica reservado para os cartões. A primária é um verde-petróleo profundo, usada só em botão e barra; o laranja é o acento de urgência e de "você está aqui"; os títulos são roxo-escuro. Cada seção tem uma ilustração vetorial de pessoas, e cada capítulo de matéria tem uma miniatura fotográfica real — a lousa com a conta escrita — que dá reconhecimento imediato sem precisar ler o nome.

**Padrões de interação que valem para a Agenda:**

| Padrão | O que faz | Por que importa aqui |
| --- | --- | --- |
| Saudação nominal + uma ação-âncora | "Welcome Amrita!" e um único cartão escuro grande: *Assign Homework →*. Todo o resto é secundário. | A Agenda abre com cabeçalho, filtro, horário, KPIs e três buckets. Nada é a âncora. |
| Contadores que são navegação | "Homework: 1 Open → / 1 Pending for Checking →". O número é o link. | Os quatro KPIs da rotina são `<Card>`, não `<Link>`. O número mais acionável da tela não leva a lugar nenhum. |
| Relatório formativo, não nota | Rosca de acerto + chips ✓2 / ✗1 / 0, e duas listas de tags: *Concepts, need improvements* e *Concepts you are good at*. | Mostra que dá para devolver leitura de desempenho sem inventar nota nem ranking. |
| Tela de sucesso dedicada | Ilustração + "Thank You!" + um CTA "Go Back to Home". Todo fluxo tem parada. | Na Agenda nenhum fluxo termina — a lista só encolhe. |
| Confirmação ilustrada | Modal "Remove Question" com ilustração de lixeira, Cancelar / OK. | A Agenda confirma cancelamento numa caixa de texto dentro do card. Funciona, mas não comunica peso. |
| Envio em lote com multi-seleção | Marcar Class 6th A e 6th B, e um painel rosa "Rules for the students" antes de enviar. | Espelha o compartilhamento com a turma, que hoje é uma caixinha no formulário. |
| Leaderboard com pódio | Top-3 com coroa, a própria linha destacada em laranja. | **Referência deliberadamente descartada.** Ver §5. |

### 1.2 Lingofy — Kids Learning App (2026)

App de aprendizado infantil. Landing page, onboarding, mapa de progressão, cursos, leaderboard e área de responsáveis.

**Sistema visual — declarado no próprio case:**

- Paleta: `#FFBA21` (âmbar, cor de marca dominante), `#C14201` (terracota, para texto sobre âmbar e para a sombra), `#393AC9` (índigo), `#46565A` (cinza-azulado), `#0F0F0F`, `#FFFFFF`.
- Tipografia: **Nunito** em quatro pesos declarados — Medium, Semi-Bold, Extra Bold, Display Bold.
- **Sombra sólida**: botões e cartões têm um deslocamento escuro embaixo, sem desfoque. É o detalhe que faz o elemento parecer um botão físico, e é barato de reproduzir.
- Ícones em forma de selo hexagonal com contorno duplo (Learn, Write Notes, Explore Words).
- Cabeçalho de tela como pílula flutuante: título ao centro, botões redondos nas pontas.
- Navegação inferior como pílula flutuante âmbar, com o ícone ativo dentro de um círculo terracota.

**Padrões de interação que valem para a Agenda:**

| Padrão | O que faz | Por que importa aqui |
| --- | --- | --- |
| "Hey, Grace / Good morning" | Saudação com nome e hora do dia. | A Agenda diz "Olá, {nome}! Vamos organizar o dia e fazer juntos?" — já é isso, e é bom. Manter. |
| Meta escolhida pela pessoa | "What's your daily learning goal?" — 5/10/15/20 min rotulados Casual / Regular / Serious / Intense, e o botão **I'M COMMITTED**. | Compromisso explícito e escolhido. A Agenda tem lembretes, mas ninguém escolheu nada. |
| Streak e recompensa como celebração | "Learning Streak! Amazing 3 days in a row." / "Daily Reward! Great job!" — cartões, não números. | É a peça emocional que falta. Precisa ser adaptada: por família, nunca comparando crianças. |
| Aviso de prazo discreto no topo | "⚠ Deadline is coming! ›" — uma linha, com seta. | Padrão enxuto para trazer o atraso à tona sem ocupar um bloco. |
| Progressão como mapa | O dever vira lugar a visitar. Metáfora espacial em vez de lista. | Descartada para o responsável; adaptada para a criança em §3.3. |
| Cartão de período | "Autumn Term / Week 1 / [Start]". | A Agenda tem `year`, `grade` e horário: dá para dizer "Bimestre 3 · semana 6". |
| Estados de erro são telas de primeira classe | A arquitetura do app lista, ao lado das telas normais: 404 (Error), Connection lost, Free 7 Days, Deadline. | A Agenda trata erro em toast e texto inline. Nenhum estado de falha foi desenhado. |
| Landing com números e FAQ | "95% / 50K+ / 20+" e accordion de sete perguntas. | A landing da Agenda já tem FAQ; não tem prova numérica. |

### 1.3 O que as duas têm em comum, e que é a lição principal

As duas trocam o branco clínico por **um fundo colorido de baixa saturação** e reservam o branco para a superfície que carrega conteúdo. Isso cria três níveis — fundo, superfície, elevado — e é de onde vem toda a hierarquia visual delas. É o mais barato de adotar e o que mais muda a percepção do app.

As duas também **nomeiam e desenham o fim**: o sucesso tem tela, o erro tem tela, o vazio tem ilustração. Nenhuma delas deixa um fluxo simplesmente parar.

---

## 2. Diagnóstico da Agenda da Turma

### 2.1 A essência que a proposta não pode contrariar

Registrada em `apps/agenda-da-turma/CLAUDE.md` e respeitada em tudo o que vem abaixo:

1. **Uma tarefa é uma tarefa** — uma tabela (`agenda.tasks`), um card (`UnifiedActivityCard`), um detalhe (`/atividades/[id]`), um formulário (`ActionFields`). Nada nesta proposta cria card, detalhe ou formulário por origem.
2. **Um gesto de entrada** — a folha Adicionar, com quatro caminhos. Nada aqui cria um quinto rótulo para o mesmo destino.
3. **Quatro destinos e uma ação** no rodapé.
4. **A IA nunca inventa prazo.** A mesma regra vale para qualquer campo novo que esta proposta introduza.
5. **Nenhuma pontuação ou competição entre crianças.**
6. **Nenhum token de cor novo**; a identidade vem de trabalhar bem `primary`, `secondary`, `destructive` e `chart-1..5`.
7. **Turma é do titular**, porque o código é credencial.

### 2.2 Problemas de produto

**P1 — A criança não tem lugar no app.** A direção visual declarada é "a criança realizando atividades e a família acompanhando", mas não existe superfície para a criança. Os perfis são sub-entidades sem login, e tudo — rotina, lista, calendário, detalhe — é escrito para o adulto. É o maior descompasso entre o que o produto diz querer ser e o que ele é, e é exatamente onde as duas referências concentram todo o valor.

**P2 — O PWA instalado abre a página de vendas.** `src/app/manifest.ts` declara `start_url: "/"`, e `/` é `src/app/(marketing)/page.tsx`, a landing com hero, preços e FAQ. Quem instalou o app já comprou.

**P3 — Não há uso offline.** `public/sw.js` existe, mas só trata `push` e `notificationclick`. O momento de uso é o portão da escola, o ponto de ônibus, o corredor — sinal ruim. Ler a rotina e marcar "feito" precisam funcionar sem rede.

**P4 — O dia não fecha.** Quando a última pendência de hoje é marcada, o bucket mostra uma caixa verde com "Tudo certo por aqui!" — a mesma caixa que aparece quando nunca houve nada. O esforço da família não é reconhecido em lugar nenhum.

**P5 — A franquia gratuita é contada, nunca celebrada nem convertida no momento certo.** A folha Adicionar mostra "Restam N importações grátis" num rodapé cinza e, quando acaba, "As importações de teste acabaram. Escrever à mão continua livre." Não existe o momento "você organizou 5 recados e 14 atividades neste mês" — que é o argumento do Pro.

**P6 — Os KPIs não levam a lugar nenhum.** `KpiCards` renderiza quatro `<Card>` com Atrasadas / Hoje / Próximos 7 dias / Concluídas. Nenhum é clicável, apesar de `/atividades` já aceitar `?situacao=`.

**P7 — Nenhuma noção de esforço.** Nada na atividade diz quanto tempo ela leva. A família não consegue responder "dá para fazer antes do jantar?", que é a pergunta operacional das 19h.

**P8 — A mochila de amanhã está enterrada.** `TomorrowBackpack` é a melhor ideia do dashboard: diz o que entra na mochila a partir do horário cadastrado, com o revezamento quinzenal aplicado. Ela mora dentro do segundo bucket, abaixo de KPIs e do primeiro bucket — invisível às 21h, que é quando importa.

**P9 — O segundo adulto não vê a própria carga.** O Pro vende "divida os cuidados". O card mostra "Acompanhamento: {nome}", mas não há nenhuma visão "o que é meu hoje". O benefício existe no banco e não na tela.

### 2.3 Problemas de design

**D1 — O contraste do avatar da criança falha nos dois temas, por dois motivos opostos.** Existem duas implementações do mesmo avatar:

- `features/students/components/student-avatar.tsx` usa `text-primary-foreground` (branco no tema claro) sobre `bg-chart-N`.
- `features/dashboard/components/per-profile-progress.tsx` monta outro avatar, com `text-foreground` sobre `bg-chart-N`.

Medido a partir dos tokens:

| Combinação | chart-1 | chart-2 | chart-3 | chart-4 | chart-5 |
| --- | --- | --- | --- | --- | --- |
| `StudentAvatar`, tema **claro** (branco sobre a cor) | 3,68:1 | **2,54:1** | 4,23:1 | **2,80:1** | 3,53:1 |
| `PerProfileProgress`, tema **escuro** (`#d0d0d0` sobre a cor) | **1,80:1** | **1,31:1** | **2,07:1** | **1,51:1** | **1,77:1** |

O mínimo AA para texto normal é 4,5:1; 3:1 é o piso até para elemento gráfico. Nenhuma das dez combinações passa. As iniciais da criança no tema escuro (1,31:1 a 2,07:1) são efetivamente invisíveis.

**D2 — Verde e laranja como cor de texto reprovam no tema claro.**

| Uso | Razão sobre `--background` claro | Onde aparece |
| --- | --- | --- |
| `text-chart-2` (#10b981) | **2,43:1** | rótulo do KPI "Concluídas", `welcome-flash`, `turma-card`, `dashboard-empty-state`, ícone da caixa vazia dos buckets |
| `text-chart-4` (#f97316) | **2,69:1** | rótulo do KPI "Hoje", ícone do cabeçalho da rotina, `pending-drafts-section`, opção "Escrever" da folha Adicionar |
| `text-chart-5` (#ec4899) | 3,38:1 | tinta de matéria |
| `text-chart-1` (#3b82f6) | 3,52:1 | "Na mochila de amanhã" |
| `text-primary` (#006ffd) | 4,29:1 | todos os links de texto ("Ver os recados guardados", "Atualizada · versão N") |

Os rótulos dos KPIs são `text-xs font-medium uppercase` — texto pequeno, exige 4,5:1 e entrega 2,43:1.

**D3 — A ação central do rodapé não parece uma ação.** O `+` é um `Button` `size-12 rounded-2xl` numa das cinco colunas do grid, com o mesmo peso visual das abas. Nas duas referências a ação central é elevada e inconfundível. O gesto mais importante do app está escondido à vista.

**D4 — O calendário mensal não tem vista móvel.** `month-view.tsx` usa `grid-cols-7` fixo e `day-cell.tsx` usa `min-h-36`. `calendar-view.tsx` não tem um único breakpoint. Em 360 px cada célula tem ~48 px de largura: os blips truncam antes da primeira palavra e a grade tem 864 px de altura. A vista semana já trata mobile (colunas viram linhas); a mensal, que é o padrão, não.

**D5 — A hierarquia do card está invertida.** Em `UnifiedActivityCard`, a primeira linha é o nome da criança + o badge de tipo; o título da atividade vem depois. Numa lista de vinte, a varredura é por "Maria, Maria, João, Maria" em vez de "Prova de Ciências". O nome é filtro, não identidade do item.

**D6 — Densidade uniforme.** KPI, bucket, card, widget e estado vazio são todos `rounded-2xl border p-4`. Sem contraste de superfície, nada dirige o olho — o que explica por que a página inteira parece igualmente importante e, por isso, igualmente ignorável.

**D7 — Nenhuma ilustração, nenhuma celebração.** Todo estado vazio é um ícone Lucide num círculo com fundo a 10%. As duas referências desenham esses momentos, e é de lá que vem a sensação de cuidado.

**D8 — A escala tipográfica não tem expressão.** `text-3xl` no h1, `text-xl` nos h2, `text-sm`/`text-xs` no resto. Nas referências o dado é enorme e o rótulo é minúsculo; aqui o número do KPI é `text-3xl`, o mesmo tamanho do título da página.

**D9 — O calendário lê datas em ISO cru.** `day-cell.tsx`: `aria-label={\`Criar atividade em ${iso}\`}` → um leitor de tela anuncia "Criar atividade em 2026-09-15".

**D10 — O blip do calendário conhece metade do vocabulário.** `activity-blip.tsx` mantém um `TYPE_A11Y_LABEL` próprio com quatro entradas (`task`, `exam`, `project`, `reminder`). Os outros quatro tipos — `material`, `authorization`, `event`, `study` — caem no genérico "atividade". Além do bug de leitura, é uma segunda fonte para um vocabulário que o `CLAUDE.md` declara ter fonte única em `activity-types.ts`.

### 2.4 Problemas técnicos

**T1 — Bug de fuso horário no prazo de toda atividade.** *(o mais grave)*

`features/activities/utils.ts` define um `todayLocalIso(now)` **privado** que lê `now.getFullYear()`, `now.getMonth()` e `now.getDate()` — campos no fuso do processo. `getDueUrgency` e `getDueBadgeLabel` têm `now = new Date()` como valor padrão.

`features/dashboard/date.ts` documenta exatamente esse perigo e resolve com `Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })`, avisando em comentário: *"em produção o Railway roda UTC, então sem isso uma tarefa cadastrada às 21h BRT 'viraria' pro dia seguinte"*. O módulo de atividades não usa esse helper — tem a sua própria cópia, que é justamente a forma que o módulo de datas marca como proibida receber `new Date()`.

Consequência: no Railway (UTC), entre 21h e meia-noite BRT, a renderização no servidor calcula "hoje" como o dia seguinte. O badge de uma atividade que vence hoje passa a dizer a data em vez de "Hoje"; a de amanhã diz "Hoje"; e a que venceu hoje é marcada como atrasada. Como `UnifiedActivityCard` é um componente de cliente renderizado no servidor, há ainda divergência de hidratação entre o HTML do servidor (UTC) e o navegador (BRT).

Alcance: `getViewDueBadge` (usado por **todo** card, em `/atividades`, na rotina, na vista do dia e na vista rápida do calendário), `ActivityBlip` (grade do calendário) e `shared-activities-widget`.

Por que os testes não pegam: `features/activities/utils.test.ts` sempre passa um `now` explícito. O caminho padrão — o único usado em produção — nunca é exercitado.

**T2 — `start_url` do manifesto aponta para a landing.** Mesmo achado de P2, do lado técnico: `src/app/manifest.ts`, `start_url: "/"` e `scope: "/"`.

**T3 — A documentação contradiz o código sobre o service worker.** `CLAUDE.md` §9 afirma "Sem cache de assets, sem offline, sem push notifications" e "A decisão é deliberada". Mas `public/sw.js` existe e `features/notifications/components/preferences-panel.tsx` chama `navigator.serviceWorker.register("/sw.js", { scope: "/" })`. O que é verdade é mais estreito: há service worker, ele só faz push. A §9 precisa ser corrigida antes que alguém decida com base nela.

**T4 — Avatar duplicado.** `StudentAvatar` e o avatar inline de `per-profile-progress.tsx` fazem a mesma coisa com cores de texto diferentes. É a causa direta de D1: dois lugares, duas escolhas, cada uma errada num tema.

**T5 — Vocabulário de tipos duplicado.** `TYPE_A11Y_LABEL` em `activity-blip.tsx` (ver D10).

**T6 — Dívida de nome já registrada.** `features/notices` exporta `listNoticeActions`, `updateNoticeActionAtomically` e `setNoticeActionStatus` sobre a tabela `agenda.tasks`. Documentada no `CLAUDE.md`; continua valendo mover o CRUD para `features/tasks` ao mexer no módulo.

**T7 — Segundo formulário sobrevivente.** `ProfileSubjectActivityFormDialog` em `/perfis/[id]/extras/*`. Já documentado como duplicação aceita.

**Estado de saúde, para constar:** `typecheck` limpo, `biome check` limpo em 373 arquivos, 423 testes passando em 37 arquivos. Nenhum dos achados acima aparece nessas verificações — são de fuso, de contraste, de arquitetura de informação e de escopo de produto.

---

## 3. Proposta

### 3.1 Direção visual: três níveis de superfície, sem token novo

A lição comum das duas referências é a separação entre fundo e superfície. A Agenda hoje é branco sobre branco: `--background` é `oklch(0.9851 0 0)` e o `--card` do pacote é praticamente o mesmo valor, então os cartões não se destacam de nada.

A regra do repositório é que os neutros vêm do `@informach/ui` e não se sobrescreve no app — e essa regra não precisa ser quebrada. A §7 já manda "combinar tokens pra variações ricas". Então:

| Nível | Como | Onde |
| --- | --- | --- |
| **Fundo** | `bg-chart-4/5` sobre o `background` — uma tinta de 5% do laranja já existente | `(app)/layout.tsx`, envolvendo o conteúdo |
| **Superfície** | `bg-card` puro, borda `border-border/60` | cards, buckets, widgets |
| **Elevado** | `bg-card` + sombra sólida deslocada na cor da matéria | reservado a **um** elemento por tela: a próxima coisa a fazer |

A sombra sólida — o truque do Lingofy — entra como utilitário em `globals.css`, no mesmo bloco `@theme` que já hospeda as animações da landing, para não virar valor arbitrário espalhado por componente:

```css
@theme {
  --shadow-solid: 0 3px 0 0 color-mix(in oklch, var(--color-foreground) 12%, transparent);
  --shadow-solid-primary: 0 3px 0 0 color-mix(in oklch, var(--color-primary) 35%, transparent);
}
```

**Tipografia.** Manter Plus Jakarta Sans — a identidade é dela, e o que as referências provam é que o que importa é peso e escala, não a família. Adotar expressão:

| Papel | Hoje | Proposta |
| --- | --- | --- |
| Número de KPI | `text-3xl font-bold` | `text-4xl font-extrabold tabular-nums leading-none` |
| Rótulo de KPI | `text-xs uppercase tracking-wide` | `text-[11px] uppercase tracking-[0.08em] font-semibold` |
| Título do card | `text-base font-semibold` | `text-[17px] font-bold leading-snug`, **primeira linha do card** |
| Nome da criança | `text-sm font-semibold`, primeira linha | vira chip com avatar, na linha de metadados |

### 3.2 Melhorias de funcionalidade

Ordenadas por razão impacto/esforço. Nenhuma introduz card, formulário ou tabela por origem.

**F1 — O fecho do dia.** Quando o último item de "Para cuidar hoje" é concluído *e havia pelo menos um*, a seção troca a caixa genérica por um cartão de fecho: ilustração, "Dia fechado", o que já está preparado para amanhã e a mochila. Sem pontos, sem comparação. Distingue-se do vazio de sempre ("nunca houve nada") porque o snapshot já sabe quantos itens existiam. Resolve P4.

**F2 — Sequência da família.** "Vocês fecharam 4 dias seguidos." Contado **por família, nunca por criança** — é o que permite adotar o padrão do Lingofy sem violar a regra de não comparar filhos. Deriva de `agenda.tasks` sem tabela nova: um dia conta quando teve ao menos uma conclusão e nenhuma pendência vencida no fim do dia. Materializar só se a consulta doer.

**F3 — Modo Criança.** *(a maior, e a que realiza a direção visual declarada)*

Uma rota `/hoje/[perfil]`, sem menu, sem edição, sem cobrança. O responsável abre e passa o telefone.

- Uma atividade por vez, com o ícone da matéria grande e a cor da matéria como fundo da tela.
- Tipografia grande, botão "Feito!" de 64 px, e a celebração ao concluir.
- Barra de progresso do dia: "2 de 4".
- Nada de prazo em vermelho para a criança: "hoje" e "esta semana", só.
- Saída protegida por toque longo ou PIN de 4 dígitos, opcional.

Não muda nada no modelo de dados: continua sendo `agenda.tasks` filtrada por perfil, e a conclusão passa pelo mesmo `setNoticeActionStatus`, com o mesmo `useCardToggle`. É uma vista nova sobre a lista única — não uma segunda lista, que é justamente o que o `CLAUDE.md` proíbe.

**Fica no plano gratuito.** Free tem 1 criança, e é essa criança que o modo serve. Ele é o gancho de aquisição — a família mostra para a filha, a filha pede para usar de novo, a família volta.

**F4 — KPIs viram navegação.** Cada card de `KpiCards` vira `Link` para `/atividades?situacao=…` com o filtro de criança carregado. Mudança de poucas linhas; resolve P6 e traz o padrão "1 Open →" do Top Grade.

**F5 — Estimativa de tempo, opcional.** Um campo `estimatedMinutes` nullable em `agenda.tasks`, oferecido como quatro chips no formulário (5 / 15 / 30 / 60+). O bucket soma: "Para cuidar hoje · 3 atividades · ~45 min". Responde P7.

**A IA não estima, pela mesma regra do prazo.** `enrich.ts` devolve `dueAt: null` quando o recado não traz prazo; `estimatedMinutes` segue idêntico — a família escolhe, ou o campo fica vazio e o bucket não soma. Calcular a próxima aula a partir do horário cadastrado é determinístico; adivinhar quanto tempo uma criança leva num trabalho não é.

**F6 — A mochila sobe à noite.** Depois das 18h (fuso de São Paulo, pelo helper correto), "Na mochila de amanhã" vira o primeiro bloco do dashboard, acima de "Hoje na escola". Reusa `getTodaySubjectsForProfiles`, que a rotina já chama. Resolve P8 sem código novo de dados.

**F7 — "O que é meu hoje", para o segundo adulto.** Um filtro na rotina e na lista que usa o `assignedName` já existente e já exibido. Vende o Pro pelo que ele faz de melhor — dividir — em vez de por crédito de IA. Resolve P9.

**F8 — Leitura offline e fila de conclusão.** O `sw.js` já existe (T3): estendê-lo com cache de `/dashboard` e `/atividades` e uma fila de conclusões pendentes, drenada ao voltar a rede. Cuidados reais e conhecidos: invalidação após mutação, `worker-src` no CSP, e o cookie do Better Auth. Fase própria, não misturada com o resto.

**F9 — Estados nomeados.** Como o Lingofy declara na arquitetura: sem conexão, 404, franquia esgotada, plano expirado, importação falhou. Telas desenhadas, com o que aconteceu e o que fazer — não toast.

**F10 — Compromisso no onboarding.** Um quarto passo curto, depois do plano: "Que horas vocês querem conferir a agenda juntos?" com quatro opções e um botão que assume o compromisso. Alimenta `features/notifications`, que já existe e já respeita consentimento e silêncio. É o "I'M COMMITTED" do Lingofy, e é a diferença entre um app que notifica e um app com o qual a família combinou algo.

### 3.3 Correções, com o conserto

| ID | Conserto |
| --- | --- |
| **T1** | Remover o `todayLocalIso` privado de `features/activities/utils.ts` e importar o de `features/dashboard/date.ts`. Acrescentar em `utils.test.ts` um caso **sem** `now` explícito, com `TZ=UTC` e hora BRT noturna congelada, que falhe hoje. |
| **T2 / P2** | `start_url: "/dashboard"` em `manifest.ts`. O proxy já manda quem não tem sessão para `/login`. |
| **T3** | Reescrever `CLAUDE.md` §9: há service worker, escopo `/`, só push; sem cache e sem offline — até a F8. |
| **T4 / D1** | Uma implementação de avatar só. Trocar o texto sólido sobre `bg-chart-N` por tinta + texto tokenizado: `bg-chart-N/20` com `text-chart-N` escurecido, ou manter o fundo sólido e usar `text-white` no claro e `text-background` no escuro — o que passar 4,5:1 nos cinco tons, medido, não estimado. |
| **T5 / D10** | Apagar `TYPE_A11Y_LABEL`; usar `ACTIVITY_TYPE_LABELS` de `activity-types.ts`. |
| **D2** | `text-chart-N` deixa de ser cor de texto sobre fundo claro. Rótulo e ícone passam a viver dentro do pastilhado (`bg-chart-N/15` + `text-foreground`), que é o padrão que o próprio `CLAUDE.md` §7.4 já recomenda e que a maior parte do app já usa. Onde a cor precisa mesmo ser texto, escurecer via `color-mix` com o `foreground`. |
| **D3** | O `+` sai do grid de cinco colunas e vira botão elevado: `size-14`, círculo, `bg-primary`, sombra sólida, deslocado 12 px acima da barra. |
| **D4** | Abaixo de `md`, a vista "mês" renderiza uma agenda vertical — os dias com atividade, em lista, com cabeçalho grudento por semana — e o grid 7×6 fica para `md:` em diante. A vista semana, que já funciona no celular, vira o padrão do mobile. |
| **D5** | O título sobe para a primeira linha do card. Criança e tipo descem para a linha de metadados, junto do prazo. |
| **D6** | Os três níveis de §3.1. Estado vazio deixa de ser card e vira texto centrado sem borda. |
| **D7** | Um conjunto pequeno de ilustrações — fecho do dia, nenhuma criança cadastrada, sem conexão, franquia esgotada — em SVG inline, na paleta existente, sem dependência nova. |
| **D8** | A escala de §3.1. |
| **D9** | `aria-label` com data por extenso; `formatDayLabel` de `features/calendar/date.ts` já existe. |
| **T6 / T7** | Sem ação isolada. Ao tocar `features/notices`, mover o CRUD de tarefa para `features/tasks`. |

### 3.4 Sequência de execução

As fases são uma sequência real: cada uma depende da anterior.

**Fase 0 — Correções.** T1, T2, T3, T4, T5, D1, D2, D9, D10. Nenhuma depende de decisão de produto, e T1 é um bug de dado visível para quem usa o app à noite. Sai primeiro, sozinha, com teste de regressão de fuso.

**Fase 1 — Direção visual.** Três níveis de superfície, sombra sólida, escala tipográfica, hierarquia do card (D5, D6, D8), `+` elevado (D3), calendário móvel (D4). Só depois da Fase 0, porque mexer em cor sem consertar contraste é replicar o problema.

**Fase 2 — Produto rápido.** F4 (KPIs navegáveis), F6 (mochila à noite), F1 (fecho do dia). Todas reusam dado que a rotina já busca.

**Fase 3 — Modo Criança.** F3 e F2. É a fase que muda o que o produto é, e precisa das Fases 1 e 2 prontas, porque nasce do mesmo sistema visual.

**Fase 4 — Profundidade.** F5 (estimativa), F7 (o que é meu), F9 (estados nomeados), F10 (compromisso no onboarding), e a peça de conversão de P5.

**Fase 5 — Offline.** F8, isolada, com o cuidado de CSP e sessão.

---

## 4. Como isso muda a página de rotina

| Hoje | Proposta |
| --- | --- |
| Cabeçalho, filtro, horário de hoje, quatro KPIs mudos, três buckets, compartilhadas, pendências de cadastro — sete blocos de peso igual | Uma âncora visível (de manhã: "Hoje na escola"; à noite: "Na mochila de amanhã"), depois os quatro contadores como navegação, depois os buckets |
| O número do KPI é grande e não faz nada | O número é o link para a lista já filtrada |
| Nome da criança lidera cada card | O título da atividade lidera; a criança é chip com avatar |
| Fundo branco, cartões brancos | Fundo com tinta de 5%, cartões brancos, um elevado por tela |
| A última conclusão do dia devolve uma caixa verde genérica | A última conclusão do dia fecha o dia |
| Nada é da criança | O responsável entrega o telefone e o Modo Criança assume |

---

## 5. O que deliberadamente não trazer das referências

**Leaderboard e pontos entre crianças** (Top Grade e Lingofy). A regra do app é explícita — nenhuma pontuação ou competição entre crianças — e ela está certa: numa conta há irmãos de idades diferentes, e um pódio entre eles é um aparelho de comparação dentro de casa. A F2 (sequência da **família**) é a adaptação que preserva o benefício motivacional sem o custo.

**Mascote 3D proprietário** (Lingofy). Custa ilustração contínua e cria dependência de marca. O caminho barato é a paleta e o ícone de matéria, que já existem e já são reconhecíveis.

**Fundo ilustrado de borda a borda** (Lingofy). Bonito na apresentação, caro em legibilidade e em peso para um app usado no corredor da escola com 3G. A tinta de 5% entrega a mesma separação de níveis por praticamente nada.

**Troca da tipografia para Nunito.** A Plus Jakarta Sans já é a identidade da Agenda e do monorepo. O que as duas referências realmente provam sobre tipografia é sobre peso e escala, e isso é reproduzível sem trocar a família.

**Conectores automáticos** com Teams ou Batista ID. Já registrado no `CLAUDE.md`: dependem de acesso autorizado e prova técnica, e não estão disponíveis. A importação assistida continua sendo o caminho honesto.
