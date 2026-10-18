# `@informach/agenda-da-turma` — app guide

> Documentação primária do app para humanos e agentes. Para o root do monorepo ver [`/CLAUDE.md`](../../CLAUDE.md). Para os packages consumidos: [`@informach/auth/CLAUDE.md`](../../packages/auth/CLAUDE.md), [`@informach/billing/CLAUDE.md`](../../packages/billing/CLAUDE.md), [`@informach/emails/CLAUDE.md`](../../packages/emails/CLAUDE.md), [`@informach/ai-core/CLAUDE.md`](../../packages/ai-core/CLAUDE.md).

---

## 1. Propósito

Agenda da Turma organiza recados escolares em providências para a família: o que fazer, até quando e quem cuida. O titular continua sendo o subject de billing; o Pro permite um segundo adulto com login próprio e permissões por criança. Não usar o identificador do titular como identidade de autenticação do convidado.

Estado da implementação em 11/09/2026: rotina móvel, recado com texto + imagem/PDF, revisão antes de salvar, prazos opcionais e origem da data, convites revogáveis, atribuição de responsável, histórico/versionamento, resumo e lembretes, push opt-in, calendário privado, exportação e exclusão de conta. Nascimento, turma e matérias são opcionais no primeiro uso. Grupos de turma são privados por criador e turno; conhecer os dados públicos da sala não concede acesso.

Fluxo de atividades e originais (12/09/2026): **Atividades** é a lista única de escola, recados/fotos e extras, com filtros por criança, tipo e situação aplicados antes da paginação. Para casa/Trabalho/Prova/Lembrete são tipos no formulário e na lista. **Nova atividade** leva sempre ao mesmo formulário (ver "Um formulário só" em §6). **Importar mensagem ou foto** aceita Teams, Batista ID e anotações manuscritas da agenda/caderno (`notebook`), com câmera, prévia e revisão obrigatória. A referência explícita de escrita pode fundamentar datas relativas; data da fotografia nunca vira prazo. **Recados e originais** guarda as fontes e rascunhos, com links para as atividades derivadas. Rotina e Calendário consultam os mesmos registros; atividades sem prazo permanecem na rotina/lista, sem data fictícia no calendário. O acesso ao original continua exigindo permissão sobre todo o escopo de crianças revisado. Arquivos originais expiram após 30 dias. A inclusão de `notebook` altera apenas os tipos da coluna textual existente, sem migração SQL.

Um card, um detalhe (14/09/2026): `features/unified-activities/view.ts` é o único adaptador entre o banco e a tela. `toActivityView` traduz a tarefa num `ActivityView`, e tudo depois dele lê um formato só — antes havia três cards, cada um com o seu jeito de mostrar prazo, o seu destino ao toque no título (ou nenhum) e o seu tratamento de erro, decididos por uma origem que a família não vê. A forma que ficou é a de melhor toque: alvo de 44 px, `<article>`, título sempre abrindo a atividade, prazo em badge **mesmo sem prazo** (`getViewDueBadge`) e menu de ações para quem pode editar.

**`/atividades/[id]` é o detalhe de qualquer atividade.** A página busca a tarefa aplicando o acesso por criança e a entrega a um renderizador só. `/recados/acoes/[id]` e `/atividades/[id]/historico` viraram redirecionamento 307 em `next.config.ts` (`redirects()`, antes de renderizar): o histórico é uma seção do detalhe, não uma página. **Não recriar card ou detalhe por fonte**: a assimetria entre eles foi exatamente o que fez a mesma lista se comportar de três jeitos.

Navegação (14/09/2026, a aba Semana em outubro): o rodapé tem **quatro destinos e uma ação**: `Hoje` · `Atividades` · `+` · `Semana` · `Família` (`components/app-shell/bottom-nav.tsx`). A aba Semana mora em `/calendario`, de propósito: o endereço é o que os e-mails, as notificações e os links guardados já usam. O `+` não navega: abre a folha Adicionar, no centro porque é a ação mais frequente. A criança filtrada (`?perfil=`) viaja com a navegação, o que tornou dispensável o card de atalhos do dashboard (`DashboardNavButtons`, removido): ele repetia três destinos que já estavam no rodapé.

**A vez da criança (15/09/2026, refeita em outubro): `/crianca/[perfilId]`**, no grupo de rotas `(kid)`, **fora** de `(app)`. Sem cabeçalho, sem menu do avatar e sem rodapé: tudo ali é endereçado ao responsável e fica a um toque de uma criança com o telefone na mão. "Oi, Clara!", uma atividade por vez, botão "Feito!" de 76 px, e **sem prazo em vermelho**: o que passou vira "É para hoje", sem data vira "Ainda sem data marcada" (`kidDueLabel`).

- **A lista vai até a próxima aula** (decisão de 17/10/2026): quem estuda de manhã faz em casa o que é para amanhã, e numa sexta o que é para segunda. `getKidModeSnapshot` **reusa `getRoutineSnapshot`** e recorta os três buckets com `splitKidTurn` (`features/kid-mode/turn.ts`, puro e testado): `todo` é o "Para hoje" do responsável mais o que vence até `nextSchoolDayIso`, e `ahead` é o resto da semana, oferecido no fim como "Quer adiantar?". O rótulo diz "É para amanhã" ou "É para segunda". **Não criar consulta própria**: pai e filha discordarem sobre o que falta é a pior forma da segunda lista que este app deixou de ter, e o teste de integração compara chave a chave com os buckets da rotina.
- **Feito não tira a atividade da tela**: ela fica marcada, com "Desfazer", até a criança tocar em "Próxima" (ou "Terminar"). O dedo de uma criança erra, e uma atividade que some no toque errado não tinha como voltar. A tela manda a maior versão entre a que a última gravação devolveu e a que o servidor trouxe, e depois de um conflito é o estado do servidor que decide se a atividade está feita.
- **As listas são da sessão**: congeladas na chegada. O refresh (o de um conflito, ou o do `OfflineQueueFlusher` quando a fila sobe) traz só o que está pendente, e lido direto das props o que a criança acabou de fazer sumia da tela junto com o "Desfazer". "Próxima" nasce no lugar de "Feito!" e espera um instante antes de aceitar toque, para o segundo toque de um duplo toque não pular o "Desfazer". O "Quer adiantar?" vai até hoje mais seis, a mesma janela de "A semana" em Hoje.
- Sair exige segurar o dedo ("Segure para devolver"): quebra-molas contra o toque distraído, **não tranca**. Entradas: o cartão de cada criança em "Hoje na escola" e "A vez de Clara" na folha da criança, em Família.

**`/offline`** é pública e estática, servida pelo service worker quando a navegação falha (§9). Não toca banco nem sessão — depender de sessão seria mais uma navegação a falhar justamente quando a rede caiu.

**Marcar como feito não precisa de rede (24/09/2026).** Concluir e reabrir passam por uma rota idempotente e, quando ela não responde, a decisão fica guardada no aparelho e sobe sozinha depois — com o card dizendo, enquanto isso, que ainda não subiu. Só concluir e reabrir: editar, cancelar e importar continuam exigindo conexão. O contrato inteiro está em §9, "A fila de escrita".

**Família › Crianças é uma folha por criança** (outubro de 2026): o avatar, a idade, a turma e a escola, "A vez de Clara" à vista, e as duas coisas que mais mudam a rotina dela, "Horário da turma" (ou "Vincular a turma") e "Atividades extras"; Editar, Excluir e Gerenciar turmas ficam no menu. Embaixo, "Adicionar criança (2 de 3)", "Quem cuida junto" (quem está vendo, o segundo adulto e as crianças que ele vê, ou o convite esperando resposta, com "Mudar" para Adultos) e uma linha por turma em que alguma criança da casa está, com "Convidar" (o mesmo link de `/turmas/entrar?codigo=`, em `features/turmas/share-invite.ts`). O adulto convidado vê só as folhas das crianças que acompanha, com "Ver as atividades": o horário, as extras, os adultos e o código da turma são da conta de quem matriculou (ver "Turma é do titular, de propósito").

**Família é quem é quem**, não ajustes: `/familia` (Crianças) · `/familia/turmas` · `/familia/adultos` · `/familia/ajustes`, com sub-navegação em pílulas `Link` (`features/family/components/family-tabs.tsx`) em vez de `Tabs` do Radix, porque cada seção carrega dados próprios no servidor. `/perfis` e `/turmas` viraram redirecionamento temporário em `next.config.ts` (307, não 308: um produto em movimento não grava a decisão no navegador de quem usa) para as novas casas; as telas profundas (`/perfis/[id]/extras/*`, `/turmas/[turmaId]/{materias,acesso}`) continuam onde estavam. O menu do avatar ficou só com assinatura, conta e sair: **não repor atalhos de conteúdo ali**: crianças e turmas moravam nesse menu, junto de cobrança e sair, e quem procurava "meus filhos" não achava.

**Turma é do titular, de propósito.** Crianças, atividades, rotina e calendário são escopados por criança acessível (`accessibleProfileCondition`); **turmas e matérias são escopadas por conta** (`listTurmasForUser`, `userHasMemberInTurma`). Não é descuido: a turma é espaço compartilhado com outras famílias e o `TurmaCard` mostra o **código**, que é credencial — quem o tem vincula qualquer criança àquela sala. Quem consentiu em ter a filha cuidada não consentiu com isso. O segundo adulto já usa matéria onde importa: `listSubjectOptionsByProfile` é por criança, então ele escolhe a matéria na atividade e recebe a sugestão de prazo pela próxima aula. Por isso Família › Turmas mostra a ele o porquê, e não "nenhuma turma" com botões que recusam. Se um dia abrir: **tirar o código do card de quem não é criador primeiro**, depois trocar o escopo das duas consultas — e só então `/api/ai/subjects/*` e `/api/ai/transcribe` passam a precisar de `ownerId`, resolvido pela turma (nunca por `resolveTrialOwner`, que desempata globalmente entre famílias).

**Recados deixou de ser aba.** `/recados` continua existindo (o e-mail de lembrete aponta para `/recados/acoes/<id>`) como sub-página de Atividades, alcançável pelo link "Ver os recados guardados". O prefixo `/familia` do `requireAuth` no `proxy.ts` já cobre as sub-rotas novas; `/perfis` e `/turmas` seguem listados porque os stubs de redirect também exigem sessão.

Entrada única (14/09/2026): existe **um gesto** para trazer atividade para dentro, a folha **Adicionar** (`features/activities/components/add-sheet.tsx`), com quatro caminhos — **Foto ou arquivo**, **Colar mensagem**, **Falar** e **Escrever**. Os três primeiros abrem `/recados/novo?modo=foto|colar|falar` e o quarto abre `/atividades/nova`; todos terminam no mesmo `ActionFields`. Antes o mesmo destino tinha quatro rótulos ("Importar mensagem ou foto", "Organizar recado", "Organizar um recado", "Tirar foto da agenda ou do caderno") e convivia com um segundo sistema Pro-only escondido num `<details>` ("Ferramentas por matéria" na lista, "Importar atividades" no calendário). Esse segundo caminho saiu da interface: os cinco diálogos de lote foram removidos e **voz agora vive no fluxo de recados** — transcreve para o campo de texto, que a pessoa confere antes de disparar a leitura. `agenda.activities.parse_{voice,image,pdf}` foram **removidos por inteiro** — rotas, services, o módulo `ai/activities-parser` e os resolvedores fuzzy `match-{student,subject}` — porque eram endpoints pagos sem nenhum cliente. Só `transcribe` segue em uso, pelo ditado. As linhas de preço continuam no seed: o ledger histórico referencia essas chaves. Se a Fase 3 quiser a resolução fuzzy de volta, ela está no histórico do git. **Não repor rótulo novo para o mesmo destino**: foi daí que veio a confusão corrigida aqui.

**Trazer o recado sem copiar (24/09/2026).** A folha Adicionar continua sendo o gesto único; o que mudou é de onde o conteúdo pode vir.

- **Compartilhar do sistema** — `manifest.ts` declara `share_target` (POST `multipart/form-data` para `/recados/compartilhar`). Quem recebe é o **service worker**: ele guarda título, texto, URL e um arquivo de até 5 MB no IndexedDB (`agenda-share`) e devolve `303` para `/recados/novo?modo=compartilhado`; a tela busca uma vez e apaga (`features/notices/share-target.ts`, validade de 10 min). **Nada sobe sem revisão** — o conteúdo fica no aparelho até a pessoa mandar ler. `app/(app)/recados/compartilhar/route.ts` é a rede de segurança para a primeira vez e para o worker desligado: redireciona com o texto na URL e **descarta o arquivo**, porque guardá-lo no servidor seria subir um anexo que ninguém conferiu. O `CACHE` do worker foi para `v3`.
- **Exportação do WhatsApp** — o campo de arquivo aceita `.txt`. `features/notices/whatsapp-export.ts` lê os formatos iOS e Android (com continuação de linha, ano de dois dígitos, e descartando o que o WhatsApp escreve sozinho e anexos que não vieram), e `WhatsAppPicker` mostra as mensagens para a pessoa marcar até dez. **Só o marcado vai para a leitura**: a conversa tem coisas de outras famílias. O texto leva a data de cada mensagem e a mais recente vira `publishedAt` — sem isso, um "entregar amanhã" de terça viraria prazo de hoje. Origem nova: `whatsapp` (enum de texto, sem migração).
- **Várias fotos, um recado** — "Adicionar outra foto" monta um PDF de até três páginas no navegador (`features/notices/photo-pdf.ts`: WebP e fotos grandes reencodadas em JPEG com o lado maior em 1600 px, qualidade caindo até caber em 5 MB). Antes, cada página da agenda era uma importação — e uma cobrança — separada, com as atividades saindo desconexas.
- **Aviso de turma trocada** — o contexto da leitura leva a série da criança escolhida e a das outras da casa (**só a série, nunca o nome**), e o prompt pede um aviso quando o documento identifica claramente outra. Ele não troca a criança: quem escolhe é quem revisa.
**Recado por e-mail: construído e removido no mesmo dia (24/09/2026).** A família ganharia um endereço só dela para encaminhar o e-mail da escola. Chegou a existir inteiro — endereço com token em hash, webhook do SendGrid Inbound Parse, caixa no painel, retenção de 30 dias — e saiu antes de ser ligado, na migração 0062.

**A premissa estava errada, e isso é o que importa registrar.** A ideia veio da pesquisa de mercado: organizadores familiares com IA convergiram em "encaminhe o e-mail". Na escola real das famílias que usam a Agenda, tarefa **não chega por e-mail**. O canal serve a assunto administrativo e financeiro — atestado, boleto, secretaria — e quem trata de tarefa não usa e-mail. O recurso resolvia um problema que essas famílias não têm, e ainda custava um registro MX, um serviço externo e uma superfície de entrada nova.

**Não repor sem evidência de campo.** O código está no histórico do git (commits `86d79e2` e `86530bf`); o que falta não é implementação, é uma escola que mande tarefa por e-mail. Os canais que a família de fato usa são os que ficaram: foto, colar, ditado, compartilhamento do sistema e exportação do WhatsApp.

Franquia de teste (14/09/2026): `features/notices/trial.ts` é a fonte única. A franquia é contada em **importações** (`FREE_NOTICE_TRIAL`, aplicado em `reserveNoticeParse` sobre linhas `is_trial`); os créditos só a financiam e por isso precisam **sobrar, nunca faltar** — se o saldo morrer antes do teto, a tela ainda anuncia importações que falham. Duas concessões idempotentes: `base` dá 1 crédito por importação e `voice` dá 3 por importação, porque ditar é iterativo e regravar é normal. Financiar generosamente não basta: `checkTrialAdmission` **recusa o ditado quando gastá-lo deixaria menos de um crédito por importação restante** (`VOICE_TRIAL_SPENT`), senão a transcrição comeria o saldo e a tela anunciaria importações que falham. `admitFreeTrialCall` **concede os créditos que financiam a chamada** antes de medir o saldo: medir antes vê um saldo sem o próprio financiamento, e foi assim que o ditado ficou recusado para toda conta gratuita, de forma autotravante. A aritmética mora em `trial-reserve.ts`, fora do `server-only`, para poder ser testada. Ele replica as MESMAS pré-condições de `reserveNoticeParse` (e-mail confirmado, orçamento diário global, teto de importações) para as rotas que entram pela franquia antes de existir um recado — sem isso, uma conta com e-mail não confirmado gastava IA por conta da casa. `withAiRouteGuards` aceita `freeTrial` e `ownerId`; **sempre passe `ownerId`** em rota que saiba de qual criança se trata, senão um segundo adulto convidado é tratado como Free numa família Pro. `getAddEntitlement` resolve plano e franquia do titular para a UI pelo mesmo caminho.

Direção visual da rotina (12/09/2026): agenda escolar acolhedora para responsáveis e crianças, com a criança realizando atividades e a família acompanhando. A navegação mora no rodapé e a entrada na folha Adicionar; a rotina não repete atalhos. Usar a fonte e os tokens existentes: azul para tarefas, lilás para provas, rosa para trabalhos/eventos, verde para materiais e laranja para lembretes/autorizações. Cor sempre acompanhada de texto e ícone; fundos suaves, bordas arredondadas e controles de pelo menos 44 px. O mapa compartilhado fica em `features/unified-activities/presentation.ts`. Manter leitura nos temas claro e escuro, linguagem de acompanhamento em família e nenhuma pontuação ou competição entre crianças.

O plano gratuito permite uma criança, 20 pendências próprias combinando escola/extras/recados, recebimento de atividades compartilhadas e cinco importações por conta verificada. Dados existentes continuam consultáveis após downgrade; novas automações pagas ficam pausadas. O Pro tem até três crianças, dois adultos e 70 créditos/mês. Não há validação de pagantes informada pelo fundador.

Teams e Batista ID são fontes de importação assistida (copiar publicação e enviar anexo). Conectores automáticos dependem de acesso autorizado e prova técnica; não estão disponíveis. Operação requer configuração de VAPID, envio de e-mail e scheduler. A implementação e a validação local não constituem implantação em produção.

Consulte [implementação e rastreabilidade](../../docs/reviews/agenda-da-turma-2026-09-11/IMPLEMENTACAO.md), [operação](../../docs/reviews/agenda-da-turma-2026-09-11/OPERACAO.md) e [piloto](../../docs/reviews/agenda-da-turma-2026-09-11/PILOTO.md).

---

## 2. Modelo econômico (alinhado com `@informach/billing`)

| Item | Valor |
|---|---|
| Pro mensal | **R$ 19,90/mês** (`agenda_da_turma_pro_monthly`) |
| Pro anual | **R$ 199,00/ano** (`agenda_da_turma_pro_annual`) — ~17% desc, 2 meses grátis |
| Créditos Pro | **70/mês**, drip mensal no anual, expiram no fim do ciclo |
| Free | 1 criança, 20 pendências próprias e 5 importações de teste por conta verificada |
| Gateway de IA | OpenRouter; revisão obrigatória dos resultados |

### Pacotes extras (Pro-only)

Mesma régua do cozya — pack custa mais per-credit que o plano (premium 20-40%) pra incentivar assinatura:

| Pack | Créditos | Preço | R$/crédito |
|---|---|---|---|
| `agenda_da_turma_credits_10` | 10 | R$ 6,90 | R$ 0,69 |
| `agenda_da_turma_credits_20` | 20 | R$ 12,90 | R$ 0,645 |
| `agenda_da_turma_credits_30` | 30 | R$ 17,90 | R$ 0,597 |

### Features de IA cadastradas

Recados têm captura própria com texto, anexo e ditado no mesmo fluxo. As ferramentas de **matérias** continuam em `/turmas/[id]/materias`; as de **atividades** (`parse_voice`/`parse_image`/`parse_pdf`) não têm mais entrada na interface. Pro tem 70 créditos/mês via webhook + sweeper; a captura de recados também aceita a franquia inicial gratuita.

| Feature | Modelo (OpenRouter) | Créditos |
|---|---|---|
| `agenda.notices.parse` | `openai/gpt-4o` | 1 |
| `agenda.subjects.parse_image` | `openai/gpt-4o` (imageDetail=low) | 1 |
| `agenda.subjects.transcribe_audio` | `openai/gpt-4o-transcribe` | 1 |
| `agenda.subjects.parse_voice` | `openai/gpt-4o-mini` | 1 |
| `agenda.activities.transcribe_audio` | `openai/gpt-4o-transcribe` | 1 |

Cadastro em lote de atividades por voz/imagem/PDF espelha o pattern de
matérias: áudio → transcribe (1 crédito) → parse (1 crédito) → batch confirm
dialog; imagem → parse vision (1 crédito) → batch confirm dialog; PDF →
parse multimodal (1 crédito) → batch confirm dialog. Cada chamada cobra
1 crédito via reserve→commit/release, mesma régua das matérias. O parser
recebe a lista de nomes dos perfis de estudante do user no user-message
(server-side via `findStudentProfilesByUser`) e devolve `studentNameHint`
por atividade; o serviço resolve `studentNameHint` → `activeTurmaId` via
`findClosestStudent` (Levenshtein ≤ 3 + normalização) antes de devolver
pra UI, então o dialog pré-seleciona a turma do card quando a IA aponta
um filho específico. Somente ditado atual recebe a data de hoje como contexto.
Imagens e PDFs recebem aviso de data desconhecida; prazos relativos exigem
referência de publicação inequívoca. Nunca preencher amanhã/próxima aula por
ausência de prazo. A captura de recados não envia nomes dos perfis à IA e
exige escolha da criança pela pessoa na revisão. Envia só os **nomes das
matérias** da criança escolhida (turma + extras) e o ano corrente, e recebe
`subjectHint` por ação (ver §6, "Matéria nas providências de recado").

PDF é processado direto pelo gpt-4o via AI SDK v6 (`type: "file"` +
`mediaType: "application/pdf"`) — sem conversão pra imagem no servidor.
Limites enforced antes da IA: máx 5 MB e 3 páginas (validação via
`pdf-lib` em `features/ai/pdf-utils.ts`); PDFs maiores retornam
`PDF_TOO_LONG`/`PDF_TOO_LARGE` no route handler antes de gastar crédito.

Fluxo de voz custa 2 créditos (transcribe + parse). Fluxo de imagem e
fluxo de PDF custam 1 crédito cada.

**Nenhum agente da Agenda exporta traces (17/10/2026).** O leitor de recados nunca exportou; os leitores de matérias exportavam pelo `createDefaultObservability`, que grava entrada e saída de cada chamada (foto do horário, transcrição) em `ai_mastra.mastra_ai_spans`, sem rotina de exclusão. Saiu do `getMastra()`, e a política guarda-chuva promete que o conteúdo enviado à IA só fica guardado quando a família salva o resultado ou pelos prazos desta página. **Não religar sem uma retenção e sem atualizar as duas políticas.** As linhas antigas em produção (`"serviceName" = 'agenda-da-turma'`) continuam lá até uma limpeza autorizada.

Seed em `packages/billing/src/seeds/credit-pricing.ts` (`AGENDA_PRICING_SEED` + `seedAgendaCreditPricing`) idempotente. Rodar `pnpm db:seed` insere rows em `billing.credit_pricing`.

Para adicionar nova feature de IA:
1. Adicionar row em `AGENDA_PRICING_SEED` com ID de modelo prefixado (`openai/gpt-4o-mini` por default).
2. Adicionar entry em `AGENDA_MODELS` (`apps/agenda-da-turma/src/ai/models.ts`).
3. Criar service em `src/features/ai/` envolvendo a chamada em `runBillableAiCall` (ou `withCredits` se multi-stage).
4. Adicionar route handler em `src/app/api/ai/...` com `withAiRouteGuards` (cobre OpenRouter key + auth + rate-limit + Pro gate).
5. Garantir que rate-limit em `lib/rate-limit.ts` cobre — hoje `AI_INVOKE_PER_HOUR: 60` cobre todas as features de IA da Agenda.
6. UI: se a feature faz parte da entrada de atividades, ela entra na folha Adicionar e usa `freeTrial` no guard, sem selo "Pro" no botão. Feature exclusiva do Pro mostra o selo "Pro" e **não fica desligada**: o toque leva a `/upgrade` (como o `ExportPdfButton`, "Imprimir a semana"). Botão cinza sem saída é beco. O direito vem do plano da FAMÍLIA (`getFamilyEntitlements(...).enabled`), não de `getIsProForUser` de quem toca: o segundo adulto de uma casa Pro tem direito.

---

## 3. Estrutura

```
apps/agenda-da-turma/
├── src/
│   ├── app/                       # Next 16 app router
│   │   ├── (auth)/                # /login, /signup (quatro passos); /choose-plan só redireciona para /upgrade
│   │   ├── (app)/                 # autenticadas
│   │   │   ├── dashboard/         # "Hoje": horário do dia, rotina, rascunhos a conferir
│   │   │   ├── atividades/        # lista + `[id]` (detalhe único) + `nova` (formulário único)
│   │   │   ├── calendario/        # a aba Semana: a semana (padrão) e o mês, com a vista rápida do mês
│   │   │   ├── recados/           # originais guardados + `novo` (captura) + redirects antigos
│   │   │   ├── familia/           # crianças, turmas, adultos e ajustes
│   │   │   ├── perfis/, turmas/   # redirect 307 para Família + telas profundas (extras, matérias)
│   │   │   ├── settings/billing/  # plano + saldo + packs (Pro) + history + portal
│   │   │   └── upgrade/           # UpgradeOffer: o Pro na hora certa, com o motivo de quem chegou
│   │   ├── api/                   # webhooks/jobs + as poucas rotas do app
│   │   │   ├── auth/[...all]/     # Better Auth handler
│   │   │   ├── webhooks/{stripe,sendgrid}/
│   │   │   ├── jobs/              # 5 billing crons + 3 email crons + rotina
│   │   │   ├── ai/                # transcribe + matérias por voz/imagem
│   │   │   ├── recados/           # parse, original e anexo
│   │   │   ├── tasks/[id]/status/ # concluir/reabrir idempotente (fila offline, §9)
│   │   │   ├── calendario/[token]/ # feed ICS privado
│   │   │   ├── data/              # estados/cidades/escolas + exportação
│   │   │   ├── product-event/     # métricas da landing
│   │   │   ├── email/unsubscribe/
│   │   │   ├── health/            # commit servindo; nunca toca o banco
│   │   │   └── ready/             # portão de deploy: schema do banco (ver §6)
│   │   ├── (marketing)/           # landing pública + termos/privacidade
│   │   └── layout.tsx             # Plus Jakarta Sans + ThemeProvider + Toaster
│   ├── features/
│   │   ├── account/               # exportação e exclusão (LGPD)
│   │   ├── activities/            # folha Adicionar, lista, aceite de compartilhadas e o fato publicado na turma
│   │   ├── ai/                    # helpers cross-feature: _http-errors, image-utils, _shared (withAiRouteGuards)
│   │   ├── billing/               # upgrade-offer, plan-card, credit-balance-card, credit-packs, history, plans-content (preços e franquias do catálogo)
│   │   ├── calendar/              # a aba Semana: semana em linhas por dia, mês em grade, blips, vista rápida, range/grid
│   │   ├── calendar-feed/         # token do feed ICS (hash em repouso, girável)
│   │   ├── dashboard/             # Hoje: horário do dia (em lote), folhas, faixa da semana, semana para imprimir, datas com TZ São Paulo
│   │   ├── family/                # acesso por criança, segundo adulto, convites e ajustes da casa
│   │   ├── kid-mode/              # a vez da criança: até a próxima aula, uma por vez, "Feito!" com "Desfazer"
│   │   ├── metrics/               # eventos de produto (enum estrito) + contrato da landing
│   │   ├── notices/               # recado, leitura, rascunho e o CRUD de toda atividade (dívida de nome, ver §6)
│   │   ├── notifications/         # resumo diário, resumo de domingo, lembretes, push e retenção
│   │   ├── offline-queue/         # a fila de conclusões que esperam a rede (§9)
│   │   ├── onboarding/            # signup-form (quatro passos), signup-flow (para onde vai depois do código), login-form
│   │   ├── profile-subjects/      # matérias extracurriculares + o predicado de matéria pausada (§6)
│   │   ├── students/              # perfis de estudante (CRUD, dialogs, avatar com chart-N, widgets do dashboard)
│   │   ├── study-plan/            # plano de estudo determinístico para prova e trabalho
│   │   ├── subject-kits/          # "levar sempre" por matéria
│   │   ├── subjects/              # matérias por turma + paleta chart-N collision-free
│   │   ├── turmas/                # turmas (create/join-by-code/active/leave + comboboxes IBGE+INEP)
│   │   └── unified-activities/    # a projeção única: card, detalhe, carga do dia, toggle otimista
│   ├── components/
│   │   ├── brand/agenda-logo.tsx  # logotipo SVG inline (theme-aware)
│   │   ├── app-shell/             # DesktopHeader e MobileTopBar, BottomNav, DesktopNav, UserMenu (conta e aparência)
│   │   └── icons/canvas-icons.tsx # os ícones do canvas que o Lucide instalado redesenhou
│   ├── lib/
│   │   ├── env.ts                 # Zod-validated envs
│   │   ├── auth.ts                # createAuth({ email: { verification: "otp", signIn: { magicLink: false }, forgetPassword: "otp" } })
│   │   ├── billing.ts             # createBillingService({ organizationsEnabled: false, app: APPS.agendaDaTurma.slug })
│   │   ├── emails.ts              # createEmailService(...)
│   │   ├── action.ts              # createActionFactory({ helpers, rateLimitStorage: redisRateLimitStorage(redis, "agenda-da-turma:rl:") })
│   │   ├── action-result.ts       # catchActionResult / isActionRejected (client helper)
│   │   ├── observability.ts       # packageLogger + Sentry
│   │   ├── redis.ts               # ioredis com ?family=0 implicit (Railway IPv6)
│   │   ├── sendgrid-webhook.ts    # signature verify helper
│   │   └── logger.ts              # pino app-level
│   ├── proxy.ts                   # auth proxy; requireAuth: ["/dashboard","/choose-plan","/upgrade","/settings","/perfis","/turmas","/api/data"]
│   ├── instrumentation.ts         # Sentry init (server)
│   └── instrumentation-client.ts  # Sentry init (client)
├── e2e/                           # Playwright (auth signup/signin por senha/OTP)
├── public/
│   └── logotipo.svg               # asset original (versão inline em components/brand/)
└── next.config.ts                 # Sentry + standalone output + security headers/CSP estática
```

### Auth (OTP-only)

- **Verificação de email**: OTP 6 dígitos (não link).
- **Sign-in**: email/senha (sem magic link).
- **Forget password**: OTP (não link).

Justificativa em `packages/auth/CLAUDE.md` §3.1: OTP mantém usuário na mesma página, ótimo para mobile-first. Mesma decisão do cozya.

Notificação `auth.signup-attempt-on-existing` está wired e dispara para **todos** os usuários existentes (não só Pro). O gate Pro foi removido em 2026-05-14 porque criava vazamento de info: atacante deduzia que "email existente recebe notificação ⇒ é Pro" via signup attempt. Defesa anti-spam fica no rate limit do `/sign-up/email` (5/h) — qualquer escalada futura (CAPTCHA, IP throttle) deve manter a notificação democrática.

### Billing

- `subject.type = "user"` sempre (`organizationsEnabled: false`).
- `app: APPS.agendaDaTurma.slug` ("agenda-da-turma") garante isolamento de customers/credits do cozya — UNIQUE `(provider, subject_type, subject_id, app)` em `billing.customers`.
- `hasProSubscription` é o gate único para liberar packs de crédito + (futuramente) features de IA.
- LGPD: `accountDeletion.onBeforeDelete` chama `billing.cancelBillingForSubject` (cancela assinaturas; saldos e linhas históricas ficam por retenção fiscal).
- Webhook handlers transacionais (`billing.payment-success` / `subscription-renewed` / `subscription-canceled` / `credits-purchased`) e dunning (`billing.payment-failed` via cron) usam `appName: APPS.agendaDaTurma.name` ("Agenda da Turma") nos templates.

### Cadastro em quatro passos, plano fora dele (outubro de 2026)

A escolha de plano saiu do cadastro: **o grátis vale por padrão e o Pro aparece quando faz falta**. Antes o cadastro terminava em `/choose-plan`, antes de a pessoa ver a Agenda fazer qualquer coisa, e o Pro anual escolhido na página de vendas se perdia ali (o `/signup` só lia `next` e a escolha abria no mensal).

O desenho é o do canvas ("O começo"): sem cabeçalho e sem cartão, o símbolo no canto (o link para a página inicial) e as barras das etapas ao lado; o texto "Passo 2 de 4: Código" é o nome da figura para o leitor de tela. Título de 34 px, campos de 52 px e o botão no pé. O `(auth)/layout.tsx` é só o fundo do app; o login usa o mesmo canto com o símbolo.

1. **Conta**: nome, e-mail e uma senha só, com "Mostrar" dentro do campo.
2. **Código**: OTP de 6 números, reenviar depois de 60 s.
3. **Criança**: só o nome (`createStudentProfileAction`, e a escolha fica lembrada neste aparelho para a folha "O que chegou?").
4. **Primeiro recado**: os três caminhos. "Tirar uma foto" abre a câmera (ou a galeria) ali mesmo e a tela do recado já chega com a foto (`photo-handoff.ts`); mensagem e falar vão para `/recados/novo?modo=…&perfil=…`. Ou "Ir para Hoje sem recado".

Para onde vai depois do código é uma regra pura e testada, `afterVerification` em `features/onboarding/signup-flow.ts`:

- o convite de outro adulto (`?next=/familia/convite…`) vai direto ao destino e não cadastra criança;
- `?plan=pro&cycle=` (ou `?next=/upgrade?cycle=`, o Pro que chegou pelo login) abre o pagamento **na confirmação do código**, no ciclo escolhido; se o pagamento não abrir, a pessoa tenta de novo ou segue no grátis, e o passo a passo passa a ser o da criança;
- **qualquer outro `next` não pula a criança.** O proxy põe `?next=` em toda rota protegida, inclusive Hoje e o início do aplicativo instalado, e com a regra antiga a conta nova ficava sem criança. Esse destino vem depois dela (o convite de uma turma, por exemplo); `/dashboard` e nenhum destino terminam no primeiro recado. O "Criar conta" do login só repassa o `next` que veio na URL.

O passo a passo no topo (`OnboardingStepper`) mostra só as etapas do caminho da pessoa ("Passo 2 de 4: Código"). O passo da criança tem "Fazer isso depois", e todo `next` passa por `safeInternalPath` (`lib/url.ts`), que recusa barra invertida e caractere de controle: o navegador transforma os dois em `//outro-site` na hora de navegar.

**O ciclo não se perde em nenhum caminho de quem já tem conta.** `proOfferHref(cycle)` é o endereço da oferta (`/upgrade?cycle=anual|mensal`) e é usado por: `/signup` com sessão e `?plan=pro` (quem recarrega depois do código), o "Entrar" do cadastro de quem escolheu o Pro, a volta de um pagamento cancelado (`cancelUrl` em `features/onboarding/service.ts`), a sessão que vence na própria oferta e `/choose-plan`, que virou uma rota (`route.ts`) que só redireciona para lá, com 307, e continua existindo para links antigos.

**O Pro na hora certa** (`/upgrade`, `UpgradeOffer`, como a prancha "Plano": o "X" para sair, o cartão do Pro com borda azul, o ciclo num seletor de duas partes, quatro linhas do Pro (`PRO_OFFER_FEATURES`) e o grátis numa frase; sem rodapé, como a tela do recado): a página abre respondendo ao motivo de quem chegou (`?motivo=imprimir|crianca|adulto|lembretes`; sem motivo conhecido ela olha a franquia: "Os recados de teste acabaram.", que é o caso do fim da franquia na folha Adicionar). Cada porta do Pro manda o seu motivo: "Imprimir a semana", a segunda criança, o convite de outro adulto e os lembretes. O titular que já assina vai para `/settings/billing`; o adulto convidado de uma casa Pro, sem criança própria, lê que tudo do Pro já vale para ele. Quem cuida junto numa casa Pro e cadastrou os próprios filhos no grátis vê a oferta: esta página é a única porta do pagamento fora do cadastro. **Não repor o "Seja Pro" no cabeçalho**: ele saiu justamente porque anunciava o Pro em todas as telas do grátis.

Os números do plano (franquia, leituras por mês, crianças, adultos, atividades em aberto, o ditado que conta como dois, o menor pacote e "pague 10 meses, use 12") saem de `features/billing/plans-content.ts`, derivados do catálogo e dos limites do app, e a mensagem de franquia esgotada (`features/notices/messages.ts`) lê os mesmos. Número de plano escrito à mão na interface fica velho na primeira mudança de catálogo.

---

## 4. Stripe Dashboard — checklist operacional

Estrutura no Stripe espelha o cozya (`apps/cozya/CLAUDE.md` §5): **2 Products + 5 Prices**, não 5 Products. Catálogo live (criado em 2026-05-14):

- **Product 1 — `Agenda da Turma Pro`** (`prod_UVx1FUGEPYM2bz`, subscription)
  - Price Monthly: R$ 19,90/mês → `agenda_da_turma_pro_monthly` → `price_1TWv7xCvOctqao30IPggyGFa`
  - Price Annual: R$ 199,00/ano → `agenda_da_turma_pro_annual` → `price_1TWv81CvOctqao30XGmMOWZD`
- **Product 2 — `Agenda da Turma Créditos`** (`prod_UVx1G1I9SR4qgE`, one-time)
  - Price 10 créditos: R$ 6,90 → `agenda_da_turma_credits_10` → `price_1TWv84CvOctqao30QgIrNZ9n`
  - Price 20 créditos: R$ 12,90 → `agenda_da_turma_credits_20` → `price_1TWv8HCvOctqao30iOFfzANE`
  - Price 30 créditos: R$ 17,90 → `agenda_da_turma_credits_30` → `price_1TWv8nCvOctqao30K7FDTElg`

Com `NODE_ENV=production` e `STRIPE_MODE=prod`, `src/lib/billing.ts` falha no boot se qualquer produto da Agenda voltar a ter `price_TODO_*`. UI também esconde packs com placeholder via `isStripePriceIdConfigured` no slot do `/settings/billing`, e checkout do Pro retorna `PRO_NOT_CONFIGURED` no toast (`InvalidProductError` do package).

> **Estado em 15/09/2026, conferido no Stripe live:** completo. Os 2 products e
> os 5 prices existem, estão ativos, os valores batem com `products.ts`
> (R$ 19,90 · R$ 199,00 · R$ 6,90 · R$ 12,90 · R$ 17,90, todos BRL), ambos os
> products têm `tax_code=txcd_10000000` e `metadata {app, kind}`, e os 5 prices
> têm `nickname` e `metadata`.
>
> A forma veio do **catálogo live do cozya**, não de invenção: produto leva
> `kind=credit_pack`, preço de assinatura leva `interval` e
> `bonus_credits_per_month`, preço de pack leva `credit_amount`, e nenhum preço
> repete `app` — quem diz o app é o produto. Nada disso muda comportamento: **o
> billing package roteia por `priceId`, nunca por metadata**, e o Stripe Tax não
> é usado em lugar nenhum de `packages/billing`, então `tax_code` é inerte hoje.
>
> **Refazer exige uma chave com `product_write` e `plan_write`.** A `rk_live_`
> da CLI não nasce com elas e a API recusa com `more_permissions_required`. Ela
> é outra chave que a de produção, então ampliá-la não mexe no raio de ação do
> app. Os comandos, para referência:
>
> ```bash
> stripe products update prod_UVx1FUGEPYM2bz --live -d tax_code=txcd_10000000
> stripe products update prod_UVx1G1I9SR4qgE --live -d tax_code=txcd_10000000 >   -d "metadata[app]=agenda-da-turma" -d "metadata[kind]=credit_pack"
>
> stripe prices update price_1TWv7xCvOctqao30IPggyGFa --live >   -d "nickname=Agenda da Turma Pro Mensal" >   -d "metadata[product_id]=agenda_da_turma_pro_monthly" >   -d "metadata[interval]=month" -d "metadata[bonus_credits_per_month]=70"
> stripe prices update price_1TWv81CvOctqao30XGmMOWZD --live >   -d "nickname=Agenda da Turma Pro Anual" >   -d "metadata[product_id]=agenda_da_turma_pro_annual" >   -d "metadata[interval]=year" -d "metadata[bonus_credits_per_month]=70"
> stripe prices update price_1TWv84CvOctqao30QgIrNZ9n --live >   -d "nickname=10 créditos" >   -d "metadata[product_id]=agenda_da_turma_credits_10" -d "metadata[credit_amount]=10"
> stripe prices update price_1TWv8HCvOctqao30iOFfzANE --live >   -d "nickname=20 créditos" >   -d "metadata[product_id]=agenda_da_turma_credits_20" -d "metadata[credit_amount]=20"
> stripe prices update price_1TWv8nCvOctqao30K7FDTElg --live >   -d "nickname=30 créditos" >   -d "metadata[product_id]=agenda_da_turma_credits_30" -d "metadata[credit_amount]=30"
> ```

Webhook endpoint + eventos de billing: ver `packages/billing/PRODUCTION.md` e `docs/deploy-runbook.md` Fase 10.

### Crons no Railway (não recriar)

A estratégia é **híbrida** (ver `docs/deploy-runbook.md` Fase 11): existem 7 cron services per-app + 2 globais no Railway, **independentes do número de apps**. Pra ativar os crons da Agenda da Turma após deploy:

1. Editar a env var `APP_DOMAINS` em cada um dos 7 cron-perapp services.
2. Adicionar `agenda-da-turma.informach.com.br` (space-separated):
   ```
   APP_DOMAINS=cozya.informach.com.br agenda-da-turma.informach.com.br
   ```
3. Os 2 cron-global services (`auth-cleanup`, `email-suppression-sync`) operam em schemas compartilhados (`core.users`, `core.email_suppressions`) — **nada a fazer**.

**Não criar cron services novos.** As rotas `/api/jobs/billing-*` e `/api/jobs/email-*` já existem no app — recebem o curl do loop `for d in $APP_DOMAINS; do curl https://$d/api/jobs/<endpoint>; done`.

---

## 5. Env vars

Validadas em `src/lib/env.ts` via Zod (`@t3-oss/env-nextjs`):

| Var | Required | Notas |
|---|---|---|
| `DATABASE_URL` | sim | Postgres compartilhado com auth/emails/billing |
| `BETTER_AUTH_SECRET` | sim | ≥32 chars (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | sim | URL pública (HTTPS em prod) |
| `NEXT_PUBLIC_APP_URL` | sim | mesmo valor de `BETTER_AUTH_URL` |
| `SENDGRID_API_KEY` | sim | escopo Mail Send + Suppressions |
| `SENDGRID_FROM` | sim | email verificado no domínio autenticado |
| `SENDGRID_WEBHOOK_PUBLIC_KEY` | opcional | só se webhook ativado |
| `EMAIL_SANDBOX_MODE` | default `live` | `live\|sandbox\|memory` |
| `EMAIL_SANDBOX_DIR` | default `./tmp/integration_emails` | só pra `mode=sandbox` |
| `CRON_SECRET` | sim | ≥32 chars; gate de `/api/jobs/*` |
| `STRIPE_SECRET_KEY` | sim | `sk_test_*\|sk_live_*\|rk_test_*\|rk_live_*` (restricted recomendado em prod) |
| `STRIPE_WEBHOOK_SECRET` | sim | `whsec_*`; placeholder na fase 5 do runbook |
| `STRIPE_PUBLISHABLE_KEY` | opcional | só se for usar Stripe Elements client-side |
| `STRIPE_MODE` | opcional | override; default infere de `NODE_ENV` |
| `REDIS_URL` | opcional dev / **obrigatório prod** | secondary storage do Better Auth + rate-limit do action factory (prefix `agenda-da-turma:rl:*`). Use `?family=0` no Railway (IPv6-only) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | opcional | habilita social login Google |
| `E2E_RELAX_AUTH_RATE_LIMITS` | opcional | `"1"` em CI Playwright; **proibido em prod** (guard pós-parse) |
| `LOG_LEVEL` | opcional | `debug\|info\|warn\|error` |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | opcional | wire-up Sentry |

**Build-time vars** (afetam output Next): toda var lida via `env.X` em código de boot/proxy precisa estar em `turbo.json` `tasks.build.env`. Ao adicionar nova var build-relevante, atualizar lá ou Turbo serve cache stale.

---

## 6. Perfis e Turmas (modelo de dados central)

### Perfis de Estudante (`agenda.student_profiles`)

Sub-entidades por conta, sem login próprio. Free = 1 perfil, Pro = 3. Limite enforced em `service.createStudentProfile` via `pg_advisory_xact_lock("agenda:student_profiles:<userId>")` + count check antes do insert. Coluna `active_turma_id uuid NULL FK -> agenda.turmas.id ON DELETE SET NULL` aponta pra turma ativa do perfil (no máximo uma).

Avatar: iniciais (até 2 letras) + cor derivada por hash do nome via paleta `chart-1..5` (mesma das matérias). Sem upload de foto no v1 — não há infra de blob storage no monorepo.

Card em Família › Crianças mostra `"X anos · {Turma ativa | Sem turma vinculada}"`. Menu do card: **Gerenciar turmas** (`/familia/turmas?perfil=<id>`) + Editar + Excluir.

### Turmas (`agenda.turmas` + `agenda.turma_members`)

**Turmas são compartilhadas entre contas** (modelo Netflix-household estendido) — diferente dos perfis. Várias famílias com filhos na mesma turma têm uma única row em `agenda.turmas`. UNIQUE em `(school_inep_code, grade, year, class_letter)` é a chave natural pra dedup.

Fluxos de cadastro:
1. **Manual** — usuário escolhe estado → cidade → escola → série → ano → letra. Service tenta `INSERT ... ON CONFLICT DO NOTHING`; se conflitou, faz SELECT pelo natural key e retorna `created: false`. Em ambos os casos: insere `turma_member` (idempotente), seta como ativa do perfil.
2. **Por código** — código de 12 chars (`TURMA_CODE_LENGTH`; alfabeto sem ambíguos: sem `0/O/1/I/L`; o validador ainda aceita 6 para linhas antigas) gerado server-side, retry em colisão. UNIQUE em `agenda.turmas.code`. User entra com o código + escolhe perfil → vira membro + ativa.

Listagem: `listTurmasForUser` traz turmas onde **(a) o user é o criador (`created_by_user_id`) OU (b) algum dos perfis do user é membro**. LEFT JOIN em `turma_members` filtrado por perfis do user — turmas criadas mas sem nenhum perfil seu vinculado ainda aparecem com `members: []`, pra que o creator consiga ver/copiar o código pra compartilhar ou re-vincular. Página `/familia/turmas` é única, filtrável via `?perfil=<id>` — o filtro restringe só a turmas onde aquele perfil é membro (turmas creator-only só aparecem em "Todos").

**O código também é link.** `/turmas/entrar?codigo=XXXX` mostra escola, série e cidade a quem tem o código e pede só a escolha da criança (`findTurmaForInvite` → `joinTurmaByCodeAction`). Não abre nada novo: o código já era a credencial de entrada — tira o erro de digitação do caminho de quem recebe no grupo da turma. Turma órfã (criador que apagou a conta) devolve "convite não encontrado", porque `joinPrivateGroup` recusa sem criador e um botão que sempre falha é pior que uma recusa clara. `TurmaCard` ganhou "Convidar" (`navigator.share` com queda para copiar; cancelar a folha **não** copia).

`TurmaCard` lida com `members.length === 0`: mostra "Nenhum estudante seu vinculado" + botões "Vincular [perfil]" pra cada perfil disponível (chama `joinTurmaByCodeAction` com o próprio code da turma — auth + rate-limit do helper já cobrem). Quando há membros mas perfis não-membros existem, aparece um dropdown discreto "Vincular" no header da seção Estudantes.

`active_turma_id` é mutuamente exclusivo: setar uma turma como ativa só faz UPDATE da coluna; o helper `setActiveTurma` em `service.ts` valida que o perfil é membro antes (`verifyMembership`). Sair da turma (`deleteTurmaMember`) limpa `active_turma_id` na mesma transação se for a turma ativa.

### Governança creator/membro em turmas compartilhadas

Como turmas são compartilhadas entre famílias, edição/exclusão precisa balancear autonomia do creator com proteção dos dados das outras famílias. As regras são:

| Ação | Quem pode | Bloqueado quando |
|---|---|---|
| Criar matéria | Qualquer membro da turma (creator ou perfil vinculado de outra família) | — |
| Editar `teacherName` da matéria | Só quem criou a matéria | — (sempre livre) |
| Editar `name` da matéria | Só quem criou a matéria | "Em uso por outras famílias" + mudança não é "pequeno ajuste" (regra abaixo) |
| Excluir matéria | Só quem criou a matéria | "Em uso por outras famílias" (qualquer atividade alheia) |
| Apagar turma | Só o creator (`turmas.created_by_user_id`) | Outra família tem perfil vinculado (`hasOtherFamilyMembersInTurma`) OU turma tem qualquer atividade cadastrada (`turmaHasActivities`) |
| Editar turma | Só o creator (`turmas.created_by_user_id`) | Mesma regra de apagar — outra família vinculada OU qualquer atividade cadastrada. Edita `grade`, `year`, `classLetter` (escola não editável). Retorna `CONFLICT_EXISTING_TURMA` se as novas coordenadas colidirem com o UNIQUE `(school+grade+year+letter)` |

**Regra "em uso por outras famílias"** (matérias): qualquer atividade — individual OU compartilhada com a turma — criada por outro usuário e vinculada à matéria conta como uso. Mensagem genérica ("essa matéria está sendo usada por outras famílias") preserva privacidade: não vaza quem nem quantos. **Atividades do próprio criador da matéria NÃO contam** (`created_by_user_id != currentUserId`).

**Regra "pequeno ajuste no nome"** (`isMinorNameEdit` em `features/subjects/utils.ts`): quando o nome está em uso por outras famílias, edição do nome só é permitida se for:
1. **Normalize-equal** — depois de tirar acento/caixa/pontuação/espaços extras, os nomes coincidem (ex: "matematica" → "Matemática", "Ed. Física" → "Ed Física").
2. **Distância de edição ≤ 3** (Levenshtein) sobre os nomes normalizados — cobre erro de digitação típico ("Matemtica" → "Matemática", "Geogarfia" → "Geografia").

Mudanças maiores (ex: "Matemática" → "Educação Física") retornam `NAME_CHANGE_TOO_BIG`. Mensagem na UI: "Outras famílias já usam essa matéria. Só ajustes pequenos no nome são permitidos (acento, caixa, erro de digitação)." Quem quiser nome radicalmente diferente: criar matéria nova. **`teacherName` continua livre sempre** — professor não muda o teor da matéria.

**Implementação**: o helper `isSubjectInUseByOtherUsers(subjectId, currentUserId)` em `features/subjects/repository.ts` consulta `agenda.activities` com `subject_id = $1 AND created_by_user_id != $2`. O service invoca esse helper em `updateSubject`/`deleteSubject` e retorna `IN_USE_BY_OTHERS` quando outra família usa a matéria.

**Por que "apagar turma" não tem transferência automática de creator?** Decisão de produto: turmas que perdem o creator viram órfãs (ninguém deleta) mas seguem 100% funcionais — membros ainda criam/editam suas próprias matérias e atividades. Trade-off aceito: simplicidade > housekeeping. Membros que quiserem uma turma 100% sua podem sair desta e criar nova.

### Atividades

Schema (`packages/db/src/schema/agenda.ts`):

**Uma tarefa é uma tarefa (14/09/2026).** Eram três tabelas com contratos diferentes — `activity_statuses` (exigia turma, matéria e prazo), `notice_actions` (prazo opcional com procedência, hora, local, responsável, lembrete, recorrência, versão) e `profile_subject_activities` (extras, sem nada disso). A diferença vazava para a tela: o mesmo card se comportava de três jeitos conforme uma origem que a família não vê. Depois da convergência (migrações 0051–0053):

- **`agenda.tasks`** (antiga `notice_actions`) — **a única linha de execução, uma por criança**. Toda atividade mora aqui, venha da escola, de um recado ou da própria família, e por isso toda atividade tem hora, local, responsável, lembrete, cancelamento e histórico. `shared_activity_id` aponta para o fato publicado na turma quando há um; `notice_id` para o recado de origem; `subject_id` XOR `profile_subject_id` para a matéria. UNIQUE parcial `(shared_activity_id, profile_id) WHERE shared_activity_id IS NOT NULL` impede tarefa duplicada por criança.
- **`agenda.activities`** — deixou de ser tarefa e é só **o fato publicado na turma**: turma, matéria, título, prazo, `visibility`, `canceled_at`, `version`. É o que outras famílias aceitam, e o que `activity_revisions` versiona pelo lado da turma.
- **`agenda.activity_acceptances`** — quando outra família aceita uma shared activity (1 row por `(activityId, userId)`); aceitar cria as tarefas das crianças ativas dela na turma.

**Um formulário só (14/09/2026).** `ActionFields` é o formulário de qualquer atividade, e `/atividades/nova` é o seu único destino — a lista e o calendário levam a ele (`?data=` traz o dia tocado, `?perfil=` a criança filtrada). O segundo formulário, que só servia à escola e exigia turma, matéria e prazo, saiu junto com `createActivity`/`updateActivity`/`deleteActivity` e as suas ações: **criar, editar e cancelar são a mesma gravação de qualquer atividade**, em `features/notices`. O que separava os dois formulários virou uma caixa: **Compartilhar com a turma**, visível quando a matéria escolhida é da turma, recusada sem Pro (`SHARE_REQUIRES_PRO`), sem prazo, ou quando outra família já recebeu (`SHARE_ALREADY_ACCEPTED`) — e nunca disponível a quem não publicou (`SHARE_NOT_YOURS`). Publicar cria o fato em `agenda.activities`; duas crianças da mesma turma na mesma revisão compartilham UM fato, não dois. **Não recriar formulário por origem**: era isso que fazia "Nova atividade" abrir telas diferentes conforme a criança filtrada ter turma ativa.

**Quem publica corrige para a turma inteira.** `updateNoticeActionAtomically` detecta que a tarefa tem `shared_activity_id` e que quem edita é quem publicou, e então atualiza `agenda.activities` e propaga o enunciado (tipo, matéria, título, descrição, prazo) para as tarefas das outras famílias. **Hora, local, responsável, lembrete e conclusão de cada casa não viajam** — a turma corrige o enunciado, não a rotina alheia. Como o fato publicado exige matéria e prazo, limpar um dos dois numa atividade publicada é **recusado** (`SHARED_REQUIRES_SCHOOL_FIELDS`) em vez de gravar só a cópia de quem editou. Cancelar a atividade (pelo mesmo botão de qualquer atividade) cancela o fato publicado e as tarefas **pendentes** das outras famílias: quem já cumpriu continua tendo cumprido.

**A remoção das tabelas antigas mora no `db:backfill-tasks`, não numa migração.** O `db:migrate` aplica TODAS as migrações pendentes antes de rodar o backfill — a remoção numa migração acontecia com os dados ainda dentro, e num banco na release anterior o deploy terminava verde com toda atividade escolar e extracurricular perdida. O script copia, **confere que cada linha antiga tem a sua tarefa**, e só então remove; se faltar uma, ele para e não remove nada. A migração 0052 ficou como no-op de propósito. **Não mover a remoção de volta para uma migração.**

**Não reintroduzir tabela de tarefa por origem.** Foi exatamente a assimetria entre as três que fez a mesma lista se comportar de três jeitos. Origem nova vira coluna opcional em `agenda.tasks`.

> Duplicação que ficou: `ProfileSubjectActivityFormDialog` continua sendo um formulário próprio nas telas de matéria extracurricular (`/perfis/[id]/extras/*`). Ele já grava em `agenda.tasks` como todo o resto, e a matéria ali é fixa pelo contexto — não é um segundo "Nova atividade" no fluxo principal, que era o problema. Se for convergir, o caminho é `/atividades/nova` aceitar a matéria por query e a página da matéria listar `UnifiedActivityCard`; não vale criar um terceiro formulário no meio do caminho.
>
> Dívida conhecida de nome: o módulo ainda se chama `features/notices` e exporta `listNoticeActions`, `updateNoticeActionAtomically`, `setNoticeActionStatus` — nomes de quando a tabela era só de recados. A tabela e o schema já dizem `tasks`; o módulo continua como está para não misturar renomeação de arquivos com a convergência. Ao mexer nele, prefira mover o CRUD de tarefa para `features/tasks` a espalhar o nome antigo.

**RBAC de visibilidade (enforcement no service `features/activities/service.ts`)**:
- **Compartilhar exige Pro**: no Free, criar força `visibility = 'individual'`.
- **Na importação, a turma é uma pergunta depois de salvar** (o canvas, outubro de 2026): a revisão não marca a caixa (`defaultShare: false`), e o "Pronto" pergunta "Mandar para a turma do 3º B?" quando o que acabou de entrar pode ir: matéria da turma, prazo **da escola** (`school`/`relative`) e Pro. "Mandar para a turma" chama `shareSavedWithTurmaAction`, que passa cada atividade pela mesma gravação da edição (`updateNoticeAction` com `shareWithTurma`), e é ela que recusa o que não pode ir. Prazo calculado pelo horário (`schedule`) **não** vai para a turma: é planejamento desta casa. O caminho "Foto" (`?modo=foto`) **nasce com a origem `notebook`** em vez de `teams`. `draftFromExtractedAction` continua aceitando `defaultShare` para quem quiser o comportamento antigo.
- **Receber compartilhada é benefício do Free** (ver §1): as listas usam `accessibleProfileCondition(userId)`, que autoriza por criança (titular ou adulto convidado com acesso), e a atividade só chega ao perfil quando a família aceita. `listPendingSharedActivitiesForUser` continua exigindo participação efetiva na turma, então nada vaza entre turmas.
- Gate único: `hasProSubscription(subject)` do `@informach/billing/access`. Nunca inline `status === 'active'`.

**Repetição e série**: `resolveSeriesId` (`features/notices/recurrence.ts`) é a regra única dos **três** caminhos de escrita — criar, corrigir por recado e editar. Os três já divergiram: a criação zerava a série quando a repetição saía, e as duas edições preservavam o `seriesId` antigo, deixando tarefas que dizem "não repete" ocupando um lugar no índice único `(series_id, profile_id, due_at)` — até alguém remarcar o prazo em cima e receber erro de banco em vez de recusa com texto. Voltar a repetir depois de ter parado abre série **nova**, de propósito: as ocorrências futuras da série anterior já existem como linhas próprias, e retomar o mesmo identificador as devolveria à disputa pelo índice. Fora dessa função, `seriesId` só é lido em `setNoticeActionStatus`, para materializar a próxima ocorrência.

**Vocabulário de tipos**: fonte única em `features/unified-activities/activity-types.ts` (8 valores), espelhada no banco por `AGENDA_ACTIVITY_TYPES` em `packages/db/src/schema/agenda.ts`. `agenda.tasks` e `agenda.activities` usam a mesma lista. A coluna é `text` sem CHECK: ampliar é mudança de código; remover valor exigiria migração de dados.

**Edit/delete de atividade**: só o `created_by_user_id`. **E** bloqueia mesmo o criador se a atividade é shared_with_turma e `hasOtherAcceptances=true` (outra família já aceitou). Regra centralizada em `canEditActivity(item, currentUserId)` em `features/activities/utils.ts` — UI esconde, service aplica.

**Defaults do form** (`buildActivityFormDefaults` em `features/activities/utils.ts`): pura, testada — calcula `defaultValues` do RHF tanto em modo create quanto edit. Aceita `defaultDueAt` (usado pelo calendário ao clicar num dia vazio) e `defaultTurmaId` (auto-select se única turma). Em modo edit, ignora os defaults e usa os campos da `activity`.

**SELECT canônico** (`activityListSelect` + `hasOtherAcceptancesExpr` em `features/activities/repository.ts`): export compartilhado entre a hidratação da projeção unificada (`/atividades` e os buckets da rotina) e o calendário (range BETWEEN). Garante que `ActivityCard`, `ActivityDetailDialog` e demais consumidores recebem o mesmo shape `ActivityListItem` sem adapters.

**Cascade quando matéria é apagada**: como a regra bloqueia delete da matéria enquanto há atividades de OUTRAS famílias, na prática o cascade só roda quando todas as atividades vinculadas são do próprio creator da matéria — perda consciente.

### Matéria extracurricular pausada é silêncio — em todo lugar

O predicado único é `activeProfileSubjectCondition`
(`features/profile-subjects/visibility.ts`), com a variante
`activeProfileSubjectConditionFor(alias)` para o SQL cru.

**Compõem o predicado, hoje cinco:** `activityIndexCte` (buckets de Hoje,
`countDoneToday` e `/atividades`), `countPendingActivities` (o limite do plano
gratuito), `listTasksInDateRange` (calendário e a semana para imprimir),
`listNoticeActions` (resumo diário, resumo de domingo e feed de calendário) e
`findLoadUntilExam` (a carga que decide quais dias o plano de estudo evita).

**Aplicar em algumas e não em outras é pior do que não aplicar.** Foi assim que
o limite do gratuito passou a contar o que a tela escondia: a família lia 15
pendências e era recusada ao cadastrar a 16ª, sem nenhuma causa visível.

**A exceção é histórico, e é deliberada:** `listFamilyCompletionDays`, que
alimenta a sequência da família, **não** compõe. Ela conta dias em que a casa
cuidou de alguma coisa, e pausar uma matéria hoje não desfaz o que foi feito em
março. Silenciar o que está por fazer respeita a pausa; reescrever o que já foi
feito é outra coisa.

Consulta nova sobre `agenda.tasks` que produza número, lista ou mensagem sobre o
que a família **ainda tem a fazer** entra na lista. Tarefa sem vínculo com
matéria nunca é escondida pelo predicado — a maioria delas.

### Ordem de deploy quando há migração

`taskSelect` (em `features/unified-activities/task-repository.ts`) é a leitura de
**toda** atividade — rotina, `/atividades`, calendário e detalhe. Ele projeta as
colunas explicitamente, então **uma coluna faltando derruba as quatro telas**,
não degrada.

O migrator é um service Railway separado e deploya em paralelo com o app. Numa
release que acrescenta coluna (o caso comum, `ADD COLUMN` nulável), a migração é
compatível com a versão que já está no ar: o migrator precisa terminar **antes**
de o app receber tráfego. Ver `docs/deploy-runbook.md` Fase 4.3.

**Isso já aconteceu, e está registrado.** Em 14/09/2026, das 14:53 às 15:06 UTC,
a release `84bf571` serviu `/dashboard` com `column notice_actions.subject_id
does not exist` — o app no ar com o código da convergência e o banco ainda na
forma anterior. Treze minutos, uma família em Belo Horizonte, a tela principal
quebrada. No Sentry é `AGENDA-DA-TURMA-F` (o erro do servidor) e
`AGENDA-DA-TURMA-E` (a mesma requisição vista do navegador — o `trace_id` é o
mesmo). O healthcheck ficou verde o tempo inteiro, porque apontava para uma rota
que não toca o banco.

**Quem garante essa ordem é o healthcheck, não o runbook.** `healthcheckPath` é
`/api/ready`, e essa rota chama `checkSchemaReadiness()` de `@informach/db`, que
compara a última migração do journal deste build com `max(created_at)` em
`drizzle.__drizzle_migrations`. Banco atrás do build → 503 → o Railway não troca
a instância, e a versão anterior segue servindo. Antes disso o `healthcheckPath`
era `/api/health`, que não toca o banco: um app publicado cedo demais passava
verde e servia erro nas quatro telas, e a única defesa era alguém lembrar de
conferir na mão.

A pergunta é "o banco está **atrás** deste build?", nunca "o banco é exatamente
este build" — rollback do app sem desfazer migração continua passando, que é a
razão de o migrator ser um service separado.

**`/api/health` continua existindo e continua sempre 200**, de propósito: é ele
que responde qual commit está servindo, e precisa responder justamente quando um
deploy falha. Um portão que derruba junto a fonte de diagnóstico esconde o
problema na hora de investigá-lo.

A migração `0055` (`agenda.tasks.estimated_minutes`) é desse tipo, e foi
aplicada em produção em 15/09/2026 pelo commit `bb2b408`. O migrator **não tem
`watchPatterns`**, então ele redeploya a cada push e terminou antes do build dos
apps — naquela release a ordem saiu certa por construção, confirmada nos logs
(`[db:migrate] done.`) antes de qualquer app trocar de instância. O `/api/ready`
existe para as releases em que ela não sair.

### Datas e timezone (`features/dashboard/date.ts`)

Toda data de calendário vive como **string "YYYY-MM-DD"** (formato da coluna `date` do Postgres em `agenda.activities.dueAt`). Comparação lexicográfica funciona corretamente nesse formato (ano-mês-dia padded).

**Regra de TZ**: `todayLocalIso()` usa `Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })` via `formatToParts` — independente do TZ do servidor (Railway roda UTC). Sem isso, uma tarefa cadastrada às 21h BRT "viraria" pro dia seguinte na visão do back-end UTC, e a vista de "hoje" no dashboard/calendário mostraria o dia errado por 3h por noite.

Helpers:
- `todayLocalIso(now?)` — São Paulo hoje (aceita Date pra testes).
- `addDaysIso(iso, days)` — **pure string math**, server-TZ-neutro. Use pra qualquer "hoje ± N": `addDaysIso(todayLocalIso(), 7)`.
- `toLocalIso`, `parseLocalIso`, `addDaysLocalIso` — server-TZ-neutros (operam sobre Dates sintéticos meio-dia local). **Não passe `new Date()` direto** pra eles — só use com Dates vindos de `parseLocalIso`. Pra "hoje + N" use sempre `addDaysIso(todayLocalIso(), N)`.

### Semana (`/calendario`, outubro de 2026)

A aba se chama Semana e abre na semana; o mês fica a um toque (`?view=month`). A URL é a fonte da verdade (`?view=`, `?date=YYYY-MM-DD`, `?perfil=<id>`). **A semana começa na segunda** (`WEEK_STARTS_ON` em `features/calendar/date.ts`), como a página da agenda que vai na mochila, e isso vale para a semana, para a grade do mês e para a semana impressa. Era domingo, e a semana da escola ficava partida.

- **Semana** (`WeekView`): uma linha por dia, de segunda a domingo, com o dia da semana e o número à esquerda e o que vence nele à direita. Hoje vem marcado, o dia cheio avisa ("dia cheio", pela mesma `summarizeDayLoad` do resumo de domingo e da faixa de Hoje) e o dia vazio tem o seu "+" ("Adicionar para sábado, 24"), que leva ao formulário único com a data e a criança. A atividade é uma linha que abre a leitura (`/atividades/[id]`): ponto da matéria, título e hora, e "Matéria · Criança · na próxima aula · local · cerca de 30 min". Marcar como feito é em Hoje e em Atividades, no card de sempre. O que está em aberto sem data fica numa linha recolhida em cima ("Sem data marcada · 2"), e sai da rotina de Hoje (`getRoutineSnapshot`), como na semana impressa. No pé, "Lista de todas as atividades" e "Imprimir a semana".
- **Mês**: a grade 7×6 com os blips a partir de `md`, e a agenda vertical no telefone (`MonthAgenda`); tocar num blip abre a vista rápida (o mesmo card). Estado apagado do blip é cor, nunca opacidade.
- **A vista do dia saiu**: a semana já mostra cada dia inteiro. `?view=day` (links guardados) cai na semana daquele dia, e a faixa da semana de Hoje leva ao dia dentro da semana (`#dia-AAAA-MM-DD`, `weekDayAnchor`).
- Sem pílulas de criança na Semana, como no canvas: a criança escolhida em Hoje viaja pela navegação (`?perfil=`). O seletor "Todos os perfis" e os botões "Nova atividade" e "Adicionar de um recado" saíram da barra: um botão por destino, e o + do rodapé é a porta de entrada.

Data layer: `getCalendarSnapshot` (`features/calendar/service.ts`) lê `listTasksInDateRange` no range de `rangeForView` (o mês cobre os 42 dias visíveis) e, na semana, as sem data da rotina.

**Por que grid manual em vez do `<Calendar>` (react-day-picker) do `@informach/ui`**: RDP v9 renderiza `<button>` por dia, e aninhar blips clicáveis cria nested interactives (problema de a11y). Além disso RDP só faz mês.

### Reference data: estados, cidades, escolas

Schema: `agenda.states` (27 rows IBGE), `agenda.cities` (~5570 rows IBGE, FK pra states.uf), `agenda.schools` (~181k rows INEP, FK pra cities.ibge_code). Tabelas auxiliares pra alimentar comboboxes pesquisáveis no cadastro manual de turma.

**Seed via `pnpm db:seed:reference`** (em `packages/db/src/seeds/`):
1. `states.ts` — fetch IBGE `/api/v1/localidades/estados` + upsert (rápido).
2. `cities.ts` — pra cada estado, fetch `/api/v1/localidades/estados/{UF}/municipios` + upsert (~30s).
3. `schools.ts` — busca o CSV em duas localizações no root do repo, em ordem: (a) `escolas_inep.csv.gz` (~11MB, **rastreado em git** — Railway Migrator usa essa fonte) descomprimido em runtime via `zlib.createGunzip()`; (b) `escolas_inep.csv` (~74MB, gitignored, opção dev). Stream via `papaparse`, batch upsert de 1000 rows (~30s). Resolve `cityIbgeCode` por lookup `(UF, normalized name)` contra `agenda.cities` (já seedado). Sem nenhum dos dois o seed loga warning e segue (estados+cidades funcionam mesmo assim, mas combobox de escolas fica vazio).

**Em produção (Railway)**: o start do serviço `migrator` em `.railway/railway.ts` é `pnpm db:migrate && pnpm db:seed && pnpm db:seed:reference`; um redeploy do migrator popula tudo automaticamente. O `escolas_inep.csv.gz` está no repo e é parte do build do migrator.

**Caso especial documentado**: rows do INEP cujo nome é exatamente `"COLEGIO BATISTA MINEIRO"` (sem sufixo de unidade) são renomeadas no insert pra `"COLEGIO BATISTA MINEIRO - UNIDADE FLORESTA"` — desambiguação solicitada pela usuária. Outras variantes (`"...- UNIDADE BETIM"`, etc) passam intactas.

Endpoints `/api/data/{states,cities,schools}` (auth-gated via `proxy.ts`) servem essas tabelas pros comboboxes (`AsyncCombobox` com debounce 200ms + ILIKE+unaccent server-side).

### Hoje (a página do dia, outubro de 2026)

**As telas seguem as pranchas do canvas** (`docs/propostas/agenda-pagina-do-dia-2026-10-17/`), por pedido da Helena em 17/10/2026: "visualmente tem que ficar igual ao canvas". A única diferença aceita é o comportamento da vez da criança (decisão posterior); o resto que ficou diferente está listado, com o motivo, no registro de implementação. O casco: no celular, o topo (símbolo e conta, `MobileTopBar`) só existe em Hoje, e o rodapé tem os quatro destinos e o "+" elevado de 58 px; no computador, a barra de 68 px (`DesktopHeader`) com o nome, os destinos sublinhados, "Adicionar" e a conta, sem rodapé. A conta (`UserMenu`) tem a aparência (clara, escura, como no aparelho). Trazer um recado (`/recados/novo`) e assinar o Pro (`/upgrade`) ocupam a tela inteira, sem rodapé (`data-immersive`).

Ordem de `app/(app)/dashboard/page.tsx`. A primeira tela responde "o que é para hoje?"; configuração e convites vêm depois, ou em uma linha.

1. `TodayHeader`: saudação pela hora e a data ("Segunda, 19").
2. Filtro de criança em pílulas, **um só na página**. O mesmo `?perfil=` vale para a escola, para as folhas e para os destinos.
3. **`FirstStepsSection`** no topo enquanto faltar passo (criança → primeiro recado → turma → horário), calculada do banco a cada render e dispensável (`agenda.family_settings.first_steps_dismissed_at`). **O passo do horário usa `listTurmasNeedingScheduleForUser`, não `findTurmasOfUserMissingSubjects`**: esta última só enxerga turmas criadas pela conta. Sem criança nenhuma, a rotina nem aparece: "nada para hoje" numa conta vazia faria a conta nova parecer resolvida.
4. `WelcomeFlash` e `PendingDraftsSection` ("Um recado ficou sem conferir").
5. **À noite** (`isEveningInApp`, a partir das 18h), `RoutineView` troca a página pela prancha da noite: "A mochila de amanhã", com uma linha por criança que tem aula, material ou qualquer atividade amanhã (os cards de amanhã moram nessa linha, e o "levar sempre" de cada aula embaixo), "Ainda de hoje", o dia fechado e "Ver a semana" quando há dia cheio. Sem "Hoje na escola" e sem o convite do resumo, e a página nem consulta o horário. Com `?perfil=`, uma linha "Só de Clara · Ver todas" diz que a tela está filtrada (`FilteredByChild`, também na Semana).
6. **`RoutineSection`**: a frase de resumo (`routineSummary`), **"Para hoje"** (atrasadas, de hoje e sem data, ou o "Dia fechado"), **"Hoje na escola"** (`TodayScheduleSection`, uma linha por criança, as aulas como pílulas que abrem o "levar sempre", e "A vez de {nome}"), **"Amanhã, {dia}"** com a mochila dentro de dia, e **"A semana"** (`WeekStrip` de sete dias a partir de hoje, aviso de dia cheio e a lista do resto da semana recolhida). No telefone é uma coluna nessa ordem; no computador são duas (o que fazer à esquerda; escola e semana à direita), com `display: contents` e `order` nas colunas. A consulta da escola começa na página (`loadTodaySchedule`) para não esperar a rotina.
7. `CommitmentWidget`: uma linha no fim ("Quer o resumo do dia por e-mail? Escolha a hora."), só para quem já tem rotina e ainda não ligou canal nenhum.
8. `SharedActivitiesSection`: uma linha recolhida ("2 atividades da turma do 3º ano B esperando você"), que abre as linhas com **"Aceitar todas"** (teto de `ACCEPT_ALL_BATCH` por toque; cada item passa pelo mesmo `respondSharedActivity`).

**Saíram e não voltam:** os quatro números do topo (repetiam as listas logo abaixo), o progresso por criança (porcentagens lado a lado são comparação entre irmãos), o rodapé jurídico (o aviso de que Feito não avisa a escola aparece no primeiro Feito) e o botão de PDF (foi para a Semana como "Imprimir a semana"). **`DashboardNavButtons` também não existe mais** (ver §1).

**Uma lista só.** Os buckets e o `doneToday` saem de `getRoutineSnapshot`
(`features/unified-activities/service.ts`), que reusa a MESMA projeção SQL
da lista de `/atividades` (`activityIndexCte`) e a mesma hidratação em segundo
passo. A vez da criança lê a mesma função. Não reintroduzir uma segunda lista
no dashboard: foi daí que veio a duplicação corrigida em setembro de 2026.

**"Imprimir a semana"** (`ExportPdfButton` no pé da Semana, `exportWeekPdfDataAction`, `getWeekPrintout`) monta a semana que está na tela: um bloco por dia, e no fim "Passou do prazo" e "Sem data". Sai das mesmas consultas das telas (`listTasksInDateRange` e `getRoutineSnapshot`). Sem números de resumo e sem tabela por criança.

O card mostra "Mudou depois de salva" pelo `editedAfterSave` da consulta (existe revisão em que a situação ficou igual), e não por `version > 1`: concluir e reabrir também sobem a versão. A gravação de situação devolve a versão nova (`ok({ id, version })`, também no recibo da fila offline), e `useCardToggle` guarda a mais nova que conhece: é isso que deixa o "Desfazer" do aviso funcionar logo depois do Feito.

O detalhe `/atividades/[id]` abre para **ler** (`ActivityRead`, como a prancha): "← Hoje", "Editar" e o "⋮" de mais ações (cancelar, com confirmação, `ActivityMoreMenu`); a criança e a turma, o tipo na cor dele, o título; o quando com de onde veio a data ("A escola disse. Está no recado … enviado em 15/10."); matéria, quem cuida, lembrete ("Quarta, 21, às 19h") e "Cerca de 30 minutos"; **"Dividir o estudo"** já com a proposta (`proposeStudyPlan`, a mesma conta da gravação: "Três sessões de 30 minutos nos dias mais livres até a véspera", os dias em pílulas, "Colocar na rotina" e "Outro jeito"); **"De onde veio"** (`ActivitySource`: o canal, quem mandou, o trecho e até quando a foto fica guardada); o histórico numa linha; e "Feito" fixo no pé. Hoje fica aceso no rodapé, porque a volta é para Hoje. Editar é `?editar=1` (o mesmo `EditNoticeAction`, com o histórico aberto embaixo); `?historico=1#historico` abre o histórico na leitura.

`UnifiedActivityCard` recebe `ActivityOverviewItem` (a tarefa com o contexto que a consulta já traz) e é o único card do app: lista, rotina e vista rápida do mês usam ele (na Semana, a atividade é uma linha que abre a leitura), e a conclusão passa pelo mesmo `useCardToggle`. **O card não tem menu de três pontos**: editar e cancelar moram no detalhe, a um toque, como no canvas.

A folha "O que chegou?" (`AddSheet`) é uma folha de baixo com alça de arrastar (o `Drawer` do vaul, e não a folha do Radix, para a alça ser de verdade): "Para" e as crianças numa linha, um caminho por linha com o ícone num quadrado na cor dele, e no pé "58 de 70 leituras sobrando este mês". "Foto" abre a câmera ali mesmo.

UserMenu (avatar) tem assinatura, conta, aparência e sair. Crianças e turmas vivem na aba Família.

### O que a Agenda planeja sozinha (24/09/2026)

Três coisas que a rotina sabia e não dizia. Nenhuma delas usa IA — todas são aritmética sobre dados que a família já cadastrou, e é isso que as separa da regra de que **a leitura de recado não inventa prazo nem sessão de estudo**.

- **Carga do dia** (`features/unified-activities/load.ts`): `summarizeDayLoad` marca um dia como "cheio" com três entregas OU noventa minutos estimados. Uma fonte só para três consumidores — o bucket "o resto da semana", o resumo de domingo e o plano de estudo —, porque três contagens diferentes de "dia cheio" seriam três respostas para a mesma pergunta.
- **Plano de estudo** (`features/study-plan/`): opt-in, no detalhe de `exam`/`project` com prazo futuro. `planStudySessions` reparte N sessões entre hoje e a véspera, pelos dias mais livres, determinístico. As sessões são `type: "study"` com `dateOrigin: "family"` — a escola marcou uma data só, a prova. `studyForTaskId` liga cada sessão à prova; cancelar a prova cancela as sessões **pendentes** (o que já foi estudado continua feito), e replanejar substitui. **Toda decisão antes de qualquer escrita**: um `return` de dentro de uma transação Drizzle commita, então checar o limite do gratuito depois de cancelar o plano anterior apagaria o plano e devolveria erro. **A leitura de recado não produz `study`**, e isso agora é schema e não promessa: `NOTICE_EXTRACTION_TYPES` tira o tipo da geração estruturada, guardado por um `Record<ActivityType, boolean>` que quebra o typecheck quando um tipo novo entra em `ACTIVITY_TYPES` sem decisão. Foi assim que `study` passou a ser aceito sem ninguém notar — ele nasceu no vocabulário compartilhado e a leitura o herdou de graça. O estreitamento é só na geração: `extractedActionSchema` continua aceitando os oito, porque é ele que abre rascunho guardado e alimenta o formulário, e o formulário precisa editar a sessão de estudo que já existe.
- **Resumo de domingo** (`features/notifications/weekly.ts`): dia e hora escolhidos em Ajustes, fora do silêncio, uma vez por semana (`messageKey = weekly:<data do envio>`, o dia local em que o resumo saiu, e não a segunda-feira da semana). Sai da MESMA `listNoticeActions` do resumo diário e tem o mesmo teto de 20 linhas. Não tem evento de produto próprio: quem conta envio é `agenda.notification_deliveries`. **A semana do resumo são os dias de aula que vêm** (`weeklyWindow`): de segunda a quinta, de hoje até sexta; de sexta a domingo, a segunda a sexta seguinte; o fim de semana entra só quando tem alguma coisa ("De 19 a 23 de outubro: quinta está cheia"). O e-mail é o da prancha "Resumo da semana" (`weekly-email.ts`, puro e testado): o dia cheio e os dias mais livres antes dele para começar a estudar, "Ficou para trás", um dia por linha com a mochila daquele dia (o mesmo `buildBackpack` da noite de Hoje), "sem data", "Abrir a semana na Agenda" e o rodapé com "Mudar dia e hora". É HTML de e-mail, em tabelas, com as cores da paleta escritas por extenso; o símbolo vai como imagem (`/web-app-manifest-192x192.png`), porque cliente de e-mail não carrega SVG.

**"Levar sempre"** (`agenda.subject_kits`, `features/subject-kits/`) é o que vai na mochila toda vez que a matéria tem aula — tênis, flauta, apostila. Não é atividade: não tem prazo, não se conclui e não entra em contagem nenhuma. A chave é `(criança, matéria)`, porque a matéria é compartilhada entre famílias e duas irmãs na mesma turma levam coisas diferentes. Aparece em "Hoje na escola" (onde se edita) e na mochila de amanhã — **nos dois lugares em que a mochila aparece**, de dia dentro do bucket e à noite no topo, senão a mesma tela mostraria conteúdo diferente conforme a hora.

**Lembrete sugerido por padrão** (`notification_preferences.suggest_reminders`, ligado): a importação já preenche o lembrete de `reminder-suggestion.ts` quando a casa é Pro e o prazo existe — dois dias antes para material, prova e trabalho; um para o resto. Nunca um lembrete que já nasceria vencido: a entrega só alcança as últimas 24 horas.

### Prazo calculado pelo horário da matéria

Ao escolher a matéria com a data vazia, os dois formulários (escolar e revisão de recado) preenchem o prazo com a **próxima aula**, via `suggestDueDateFromSchedule` → `nextClassDayIso`, que respeita o revezamento quinzenal. A procedência aparece no campo e um toque altera. `agenda.tasks.date_origin` ganhou o valor `schedule` para isso.

**A IA continua proibida de inventar prazo** (achado R01): `enrich.ts` devolve `dueAt: null` e não tem fallback de "amanhã". A distinção é essa — calcular a próxima aula a partir do horário que a família cadastrou é determinístico; adivinhar uma data a partir de um texto sem prazo não é. Os testes dos dois lados precisam continuar passando juntos.

### Matéria nas providências de recado

`agenda.tasks` carrega `subject_id` (turma) e `profile_subject_id` (extracurricular), nullable e mutuamente exclusivos (CHECK `agenda_task_subject_exclusive_check`), `ON DELETE SET NULL` — apagar a matéria tira o rótulo, nunca a obrigação. `validSubject`, na transação de gravação, exige que a matéria seja da turma em que a criança participa AGORA, ou extracurricular dela. As opções vêm de `listSubjectOptionsByProfile`.

**A IA recebe os nomes das matérias da criança e devolve uma pista (24/09/2026).** `parseNotice` passa ao modelo só os **nomes** das matérias da criança da captura e o ano corrente (`src/ai/notices/prompt.ts`); a saída ganha `subjectHint` por ação, e o prompt manda separar **uma ação por matéria, por entregável e por prazo** — um cartaz com dois blocos de cinco matérias vira dez ações, não duas. Foi o cartaz "Datas finais — Grupos 1 e 2" que expôs o buraco: o prompt só separava por tipo de providência e mandava o resto para a descrição. A pista vira vínculo em **um lugar só**, `features/notices/draft-from-extraction.ts`: `findClosestSubject` (`features/subjects/match-subject.ts`, de volta do histórico — exato, 22 grupos de sinônimos pt-BR, Levenshtein ≤ 3) pré-seleciona `subjectId`/`profileSubjectId`, e, se a leitura não trouxe prazo, `suggestDueDateFromSchedule` preenche a próxima aula com `dateOrigin: "schedule"`. A pessoa continua confirmando na revisão; a pista **nunca entra em `actionFieldsSchema` nem no banco** (`.omit({ subjectHint: true })`), e quando não casa com nada cadastrado a revisão diz isso abaixo do campo. Data escrita sem ano (27/10) recebe o ano da publicação ou o ano corrente, sempre com aviso — regra distinta da proibição de inventar prazo, que continua. Os nomes **não entram no `contentHash`**: um replay devolve as pistas da leitura anterior e o construtor as resolve contra a lista atual. Corpus real: `poster-groups-by-subject`, `two-subjects-one-sentence` e `alias-to-registered-name` em `test/evaluation/notices.eval.ts`.

---

## 7. Design tokens (cores)

**Não inventar token novo — sempre reutilizar os existentes** (mesmo conjunto que cozya: `primary, secondary, destructive, ring, chart-1..5, sidebar-*`). Identidade visual do app vem de **trabalhar bem essas cores**, não de adicionar tokens próprios.

Tokens definidos em `src/app/globals.css` (light + dark):

| Token | Cor (light) | Uso semântico |
|---|---|---|
| `--primary` | Azul #006FFD | CTAs principais, links, logo, headers de feature |
| `--secondary` | Roxo #7C3AED | acentos secundários, banner upgrade |
| `--destructive` | Vermelho #EF4444 | ações destrutivas, "atrasada", erros |
| `--chart-1` | Azul #3B82F6 | **Matemática** + avatar + tom "informação" |
| `--chart-2` | Verde #10B981 | **Português** + avatar + tom "sucesso" (turma ativa) |
| `--chart-3` | Violeta #8B5CF6 | **Ciências** + avatar |
| `--chart-4` | Laranja #F97316 | **História** + avatar + tom "alerta/warning" (perfil sem turma) |
| `--chart-5` | Rosa #EC4899 | **Inglês** + avatar |

**Cores semânticas (sucesso/alerta/info) reaproveitam `chart-N`** — não criar tokens dedicados. Convenções:
- Sucesso/positivo → `chart-2` (verde) — ex: badge "Ativa", check, confirmações
- Alerta/atenção → `chart-4` (laranja) — ex: tarefa "Hoje" pendente, deadlines próximos
- Erro/atrasado → `destructive` — ex: badge "Atrasada", botões destrutivos
- Informação → `chart-1` (azul) ou `primary`
- Premium/elevado → combinar `secondary` + `chart-3` (ambos roxos) — ex: banner upgrade, widget de "vincule estudante a turma"

**Regras pros componentes:**
1. **Sempre token, nunca literal.** Proibido `bg-blue-500`, `text-emerald-600`, `#fff`, `oklch(...)` em código da agenda. Use `bg-primary`, `bg-chart-2`, `border-chart-2/40`.
2. **Preenchimento usa a cor; glifo usa a TINTA.** `chart-N` e `primary` nasceram para fundo, borda e blip. Como cor de **texto** sobre `background` elas reprovam em contraste, medido a partir dos próprios tokens: `text-chart-2` dá 2,43:1, `text-chart-4` dá 2,69:1 e `text-primary` dá 4,29:1, contra o mínimo AA de 4,5:1 para texto e 3:1 para ícone. Para texto e ícone use `text-chart-N-ink` / `text-primary-ink` / `text-destructive-ink`, derivadas por `color-mix` contra o `--foreground` (bloco TINTAS em `app/globals.css`). `destructive-ink` entrou em outubro de 2026 para o "Passou" do chip de prazo e os erros em linha: `text-destructive` sobre `background` não chegava a 4,5:1, a tinta dá 7,02:1 no claro e 8,83:1 no escuro. **Nunca `bg-*-ink` nem `border-*-ink`**, tinta é glifo. Ao mexer nos valores de `chart-N`, refazer a medição.
3. **Nunca `opacity` para apagar um bloco com texto tintado.** A opacidade cai sobre a subárvore e leva a tinta calibrada de volta para ~2,3:1. Estado apagado se faz pela cor (`muted`).
4. **Combinar tokens pra variações ricas.** O design caprichado vem de **misturar** tokens próximos (ex: `from-primary/10 ... to-chart-1/10` no widget de onboarding; `from-secondary/10 ... to-chart-3/10` no widget de turma). Uma cor sozinha fica raso — paleta ganha vida quando tokens irmãos compõem gradients/borders/icons.
5. **Avatar de perfil** consome `chart-1..5` via hash do nome (`getAvatarColorIndex` em `features/students/utils.ts`), e a montagem é única em `features/students/components/student-avatar.tsx` — pastilha (`bg-chart-N/25` + `border-chart-N/50`) com `text-foreground`, em três tamanhos declarados. Havia duas montagens com cores de texto diferentes, cada uma reprovando no tema oposto.
6. **Tinted badges/cards**: `bg-chart-N/15` + `border-chart-N/40` + texto `text-foreground` (ou `text-chart-N-ink`, nunca `text-chart-N`). Opacidade baixa no fundo dá tom suave que combina com o resto da UI.
7. **Matérias** herdam `chart-N` — Matemática=1, Português=2, Ciências=3, História=4, Inglês=5.

Neutros (`background, foreground, card, popover, muted, accent, border, input, sidebar`) vêm do `@informach/ui` e **não** se sobrescreve aqui — são compartilhados entre apps pra consistência cross-app.

---

## 8. Pendências reais (conferido em 15/09/2026)

> A lista anterior listava sete itens; cinco já estavam feitos. Os estados abaixo
> foram **verificados contra o Railway e o Stripe**, não contra a memória de
> quem escreveu. Ao fechar um item, atualize aqui na mesma passada — uma
> pendência falsa custa tanto quanto uma esquecida, porque manda alguém refazer
> o que já existe.

### Aberto

1. **Site header para o app autenticado** — `site-header.tsx` ainda é o mínimo
   das páginas de auth. O `AppHeader` cobre o app; unificar os dois é arrumação,
   não bloqueio.

### Fechado (e por que estava na lista)

- ~~CSP em Report-Only~~ — `CSP_ENFORCE=1` no service desde 15/09/2026, com
  `upgrade-insecure-requests` no header e `content-security-policy` substituindo
  o `-report-only`. A homologação não foi "passou local": as duas únicas
  violações que existiram em quatro meses de Report-Only (`AGENDA-DA-TURMA-1` e
  `-2`, ambas `script-src-elem`, ambas na landing) têm o **mesmo** último
  evento, `2026-09-12T09:01:22Z` — a última carga antes de `98bf0f8`, que passou
  a ler `headers()` no layout raiz e com isso tirou a landing do prerender
  estático, onde nenhum nonce por request poderia valer. Depois dele, três dias
  de tráfego real sem nenhuma violação, de nenhuma diretiva; e com o enforce já
  ligado, `/`, `/login`, `/signup`, `/offline` e `/privacidade` servem 100% dos
  `<script>` com o nonce do header daquele request.

  Manter `strict-dynamic`; **nunca** relaxar `script-src` para contornar um
  nonce ausente. Se voltar a faltar nonce, a causa é uma página ter virado
  estática, não o CSP. `CSP_ENFORCE=0` continua sendo a saída de emergência.

- ~~Checklist cosmético do Stripe~~ — aplicado em 15/09/2026 na forma que o
  cozya já usava (ver §4): `tax_code=txcd_10000000` nos dois products,
  `metadata {app, kind}` no product de créditos, e `nickname` + `metadata` nos
  cinco prices. Valores e `price_id` intocados, conferidos na leitura de volta:
  R$ 19,90, R$ 199,00, R$ 6,90, R$ 12,90 e R$ 17,90, todos `active`, todos BRL.

  Exige uma chave com **Products Write (`product_write`)** e **Prices Write
  (`plan_write`)**. A `rk_live_` da CLI não tinha as duas e a API recusa com
  `more_permissions_required` — que é uma recusa do Stripe, não do agente, e
  não deve ser confundida com ela. Essa chave é **outra** que a de produção
  (`STRIPE_SECRET_KEY` do service), então ampliá-la não mexe no raio de ação
  do app.

- ~~Wiring Railway~~ — o service `@informach/agenda-da-turma` existe, está
  `RUNNING`, é configurado pelo bloco dele em `.railway/railway.ts` e responde em
  `agenda-da-turma.informach.com.br`. Os sete `cron-perapp-*` já têm
  `agenda-da-turma.informach.com.br` em `APP_DOMAINS`.
- ~~Price IDs live~~ — os cinco estão preenchidos em `products.ts` e conferidos
  contra o Stripe live: R$ 19,90/mês, R$ 199,00/ano e os packs de R$ 6,90,
  R$ 12,90 e R$ 17,90, todos ativos. Os únicos `price_TODO_*` que restam no
  arquivo são do **missao-saber**.
- ~~Rate limit anti-script~~ — `lib/rate-limit.ts` existe, com Redis e
  passthrough registrado quando ele falta.
- ~~Pipeline de IA~~ — `src/ai/` e `src/app/api/ai/{activities,subjects,transcribe}`
  existem; ver §2.
- ~~Landing pública~~ — `app/(marketing)/page.tsx` é a página de vendas completa.

---

## 9. PWA (instalável; service worker de push + leitura offline do esqueleto)

Agenda da Turma é instalável como PWA em iOS e Android. O setup é declarativo via Next 16 metadata routes:

- `src/app/manifest.ts` — `display: standalone`, `theme_color: "#006FFD"` (azul `--primary` da agenda), ícones com `purpose: "any"` E `"maskable"` para os mesmos PNGs (Chrome aceita; Lighthouse PWA passa).
- **`start_url: "/dashboard"`**, não `/`. A raiz é a landing de vendas (`app/(marketing)/page.tsx`): com `start_url: "/"` o atalho da tela inicial abria preço e FAQ para quem já assinou. Sem sessão o `proxy.ts` redireciona para `/login` normalmente, então o caminho de quem ainda não entrou continua correto.
- `src/app/layout.tsx` — `viewport` (`themeColor` light+dark, `viewportFit: "cover"`) e `metadata.appleWebApp` (`capable: true`, `statusBarStyle: "black-translucent"`, `title: "Agenda da Turma"`).
- `src/app/{favicon.ico,icon.png,icon.svg,apple-icon.png}` — Next auto-linka.
- `public/web-app-manifest-{192,512}.png` — ícones referenciados pelo `manifest.ts`.

### O service worker que existe

`public/sw.js` faz **quatro** coisas, e o que ele não faz é tão importante quanto:

1. **Push**: `push` mostra a notificação com o título e o texto que vieram na mensagem (até 160 caracteres; contagens e dias, nunca nome de criança nem de atividade, que a política promete fora da tela bloqueada) e `notificationclick` abre a janela, só na própria origem e só em `/dashboard`, `/recados`, `/atividades` e `/calendario`. Opt-in, dependente de VAPID. **Desligado em produção:** o serviço `@informach/agenda-da-turma` no Railway não tem `VAPID_PUBLIC_KEY` nem `VAPID_PRIVATE_KEY` (o bloco do serviço em `.railway/railway.ts` não as declara e o plano zerado confirma que não existem), então a inscrição responde `PUSH_UNAVAILABLE`, o painel mostra a opção como indisponível e os lembretes saem só por e-mail. Para ligar: gerar o par, gravar no serviço e acrescentar as duas como `preserve()` no mesmo dia, senão o próximo apply apaga.
2. **Receber compartilhamento** — o POST do `share_target` em `/recados/compartilhar` é interceptado, guardado no IndexedDB e a navegação segue para a revisão (ver §1). É a única exceção à regra de que o worker só trata `GET`.
3. **Leitura offline do esqueleto** — pré-cacheia `/offline`, o manifesto e o ícone; serve `/_next/static/*` por cache-first (nomes com hash, imutáveis); e, quando uma navegação falha, devolve `/offline` em vez da tela do navegador.
4. **Avisar que a rede voltou** — `sync` com a marca `agenda-flush` manda um recado às janelas abertas. **Ele não envia nada**: enviar daqui obrigaria a repetir no worker a sessão, a chave de idempotência e a leitura da resposta, e duas cópias dessa decisão é o tipo de divergência que faz uma conclusão sumir. Sem janela aberta, a fila espera o app abrir.

**O service worker é registrado para todo mundo** por `components/app-shell/service-worker.tsx`, no layout de `(app)`. Antes quem registrava era só o painel de notificações, ao ligar os lembretes — então a maioria não tinha service worker nenhum. O painel **continua** chamando `register` (`preferences-panel.tsx`); a chamada é idempotente e devolve a registration existente, então são dois pontos de entrada para o mesmo registro. Registrar **não** inscreve em push: a inscrição continua sendo um passo explícito no painel.

**Há interruptor.** `sw.js` começa com `const ENABLED`; publicar com `false` faz o próprio worker limpar os caches e se desregistrar no próximo carregamento. Como ele agora intercepta **toda navegação** de **todos** os usuários, um defeito ali deixou de ser problema de uma minoria opt-in — e sem esse caminho a saída seria pedir "limpar dados do site" para a base inteira.

**HTML autenticado nunca entra no cache.** Navegação é sempre rede, e a resposta não é guardada. A rotina de uma família é dado sensível e o aparelho é compartilhado: uma página em cache sobreviveria ao logout. Só entra no cache o que é idêntico para toda conta.

### A fila de escrita (24/09/2026)

**Concluir e reabrir sobrevivem à falta de rede.** Só isso: editar, cancelar e importar continuam exigindo conexão, porque são decisões que mudam o enunciado e não cabem numa repetição cega.

Os três requisitos que a decisão anterior listava como condição para existir uma fila honesta estão cumpridos, e nenhum deles é dispensável:

- **Endpoint próprio, idempotente** — `POST /api/tasks/[id]/status`, com `Idempotency-Key` no cabeçalho. **Server action não serve**: o identificador dela muda a cada build, e a gravação guardada no aparelho na sexta-feira não teria para onde ir depois do deploy de segunda. O recibo mora em `agenda.idempotent_writes`, chaveado por `(user_id, key)` — fosse `key` sozinha, adivinhar a de outra família devolveria o recibo dela. Titular e plano saem de `resolveTaskWriteContext`, a MESMA função da server action, e a lista de rotas a revalidar sai de `ROUTINE_PATHS`: duas cópias divergiriam na primeira tela nova.
- **Uma vez só, de verdade** — recibo e gravação são a **mesma transação** (`applyTaskStatusOnce` chama `setNoticeActionStatusWithinTx`), sob `pg_advisory_xact_lock` da chave. Gravar primeiro e anotar depois deixa uma janela em que a atividade está concluída e o recibo não existe, e é justamente nessa janela que a retentativa do aparelho lê um conflito de versão por uma gravação que foi dela mesma. A recusa também fica guardada: repetir uma chave recusada recebe a MESMA recusa, nunca uma diferente. **O recibo é lido antes da atividade** — ele não tem FK para `tasks` de propósito, e procurar a atividade primeiro faria a repetição de uma gravação cuja atividade foi apagada responder "não encontrado". Recibo ilegível (de um build anterior) é **regravado**, não ignorado: com `onConflictDoNothing` aquela chave ficaria sem idempotência para sempre.
- **Uma tela que mostra o que não subiu** — a barra conta ("2 mudanças esperando a rede") e abre `PendingWritesSheet`, com "Abrir atividade" e "Descartar" por linha. O card fica com o selo "sobe quando a rede voltar" e **não sai da lista**: sumir seria prometer que subiu.

**O status HTTP é o contrato com o cliente.** `200` é resultado de negócio — inclusive a recusa por versão — e a entrada sai da fila. Transporte mantém a entrada: 401 de sessão expirada, 429, 5xx, rede caída. O `200` com HTML de um redirecionamento para o login conta como transporte, e é por isso que `classifyResponse` recusa corpo ilegível — tratá-lo como sucesso apagaria a conclusão sem ela ter chegado a lugar nenhum. `PERMANENT_STATUSES` (400, 403, 404, 405, 413, 415) é a exceção e precisa ser explícita: um `403` de origem ou um `404` de rota não melhoram com o tempo, e tratá-los como transporte deixaria a entrada reenviando a cada `online` e a cada aba que volta, com a barra prometendo para sempre que aquilo ainda vai subir.

**A fila é da ORIGEM, e a sessão não.** Cada entrada carrega o `userId` de quem decidiu (`QueueOwnerProvider` nos dois shells), e quem lê filtra por `visibleForOwner`. Sem isso, num tablet de casa, uma conclusão feita antes do logout subiria com a sessão de quem entrasse depois, e o título da atividade de uma família apareceria na folha de outra — a mesma razão pela qual o worker nunca guarda HTML autenticado. Sem dono conhecido **não há fila**: a falha volta a ser falha. As entradas também vencem em sete dias, junto com o recibo do servidor — passado esse prazo a repetição viraria uma gravação nova com versão velha, e um conflito abandonado manteria "precisa de você" na tela para sempre.

**Trocar de ideia ainda offline substitui, não empilha.** Duas gravações da mesma atividade levariam a MESMA versão (a tela não se atualizou), e a segunda subiria já vencida — pedindo atenção para uma contradição que a pessoa resolveu sozinha ao tocar de novo. O que já está em conflito nunca é substituído: ali há uma decisão de outra pessoa esperando ser vista.

A decisão de insistir no que foi **recusado** nunca é do app: conflito de versão vira linha na folha, com a atividade a um toque. Reenviar sozinho seria decidir pela pessoa que mudou a atividade do outro lado — que era exatamente a objeção que segurou esta fila.

**O botão de concluir nasce desabilitado e habilita ao hidratar** (`ready` de `useCardToggle`, `useHydrated` de `@informach/ui/hooks/use-hydrated` no card de extracurricular e no modo criança). A lista de `/atividades` fica num Suspense (`loading.tsx`) que hidrata depois do resto, e até lá o card aparece inteiro sem `onClick`. Um toque nesse intervalo sumia sem aviso, e se a rede caísse em seguida a conclusão nem chegava à fila. Medido em 04/10/2026 com a CPU da página a 1/6: cortar a rede antes da hidratação perdia o clique 3 vezes em 3; esperar a hidratação acertava 4 em 4. Era isso que fazia o `offline-queue.spec.ts` oscilar no CI. **Não tirar o `!ready`**: ele é o que torna o defeito visível em vez de silencioso.

A fila vive em `features/offline-queue/`: `queue.ts` é puro (classificação, ordem, contagem, frase) e tem os testes; `store.ts` é o IndexedDB (`agenda-writes`, no mesmo feitio de `share-target.ts`, sem biblioteca e sem lançar para quem chama); `client.ts` envia e esvazia; `OfflineQueueFlusher` mora nos dois shells e escuta montagem, `online`, visibilidade e o recado do worker.

O CSP em `next.config.ts` já libera `manifest-src 'self'` e `worker-src 'self' blob:`. **Ao mexer no que o service worker guarda, atualizar esta seção junto** — foi a divergência entre o texto e o código que se instalou aqui antes.

## 10. Comandos

```bash
# dev
pnpm dev:agenda-da-turma                                                # porta 3001

# verificação
pnpm --filter @informach/agenda-da-turma typecheck
pnpm --filter @informach/agenda-da-turma test                           # vitest
pnpm --filter @informach/agenda-da-turma exec biome check src

# build
pnpm build:agenda-da-turma                                              # produção (standalone output)
pnpm start:agenda-da-turma                                              # serve build local

# E2E
pnpm --filter @informach/agenda-da-turma e2e                            # Playwright (sobe o dev server sozinho)
pnpm --filter @informach/agenda-da-turma e2e:install                    # baixa Chromium 1×
pnpm --filter @informach/agenda-da-turma e2e:ui                         # modo interativo

# teste isolado
pnpm --filter @informach/agenda-da-turma vitest run path/to/file.test.ts -t "test name"
pnpm --filter @informach/agenda-da-turma exec playwright test e2e/auth.signup-and-verify.spec.ts
```

**O CI roda a config default (`playwright.config.ts`), não as dedicadas.**
`review-fixes.spec.ts` e `family-routine.spec.ts` também têm
`playwright.routine.config.ts`, e `sales-page.spec.ts` tem
`playwright.marketing.config.ts`, com orçamentos de tempo bem mais folgados.
Ajustar tempo só nessas configs não chega ao CI: foi assim que
`review-fixes.spec.ts` ficou vermelho por vários commits, estourando 10 s de
`actionTimeout` numa rota que declara `maxDuration = 90`.

O servidor do e2e é `next dev`, que compila cada rota na primeira requisição.
`e2e/warmup.setup.ts` roda como setup project antes da suíte e paga essa
compilação nas rotas pesadas (`/api/recados/parse` e companhia). Ao acrescentar
uma rota de API pesada que a suíte toque poucas vezes, inclua-a lá, senão o
custo volta a cair no timeout do primeiro teste que a tocar.

---

## 11. Regras para agentes

1. **Mudar preço Pro**: editar `listPrice.amountCents` dos 2 produtos em `packages/config/src/products.ts` E atualizar Stripe Dashboard. Os dois lados precisam bater — divergência é bug.
2. **Adicionar nova feature de IA**: ver checklist em §2. Não pular `withCredits` — o gate de Pro+créditos é a única defesa contra Free consumindo IA.
3. **Ajustar cap de créditos**: editar `bonusCreditsPerMonth` nos 2 produtos Pro em `products.ts`. UI auto-reflete via `currentProduct.bonusCreditsPerMonth` no `CreditBalanceCard`.
4. **Stripe API version**: pinned em `2026-04-22.dahlia` no package `@informach/billing`. Bumpar requer validar payloads (ver `packages/billing/CLAUDE.md` §1).
5. **Free não chama IA** (quando IA existir): o gate é `billing.hasProSubscription`. Nunca contornar — Free com IA quebra economia.
6. **Single-user invariant**: `subject.type === "user"` em todo lugar. Não introduzir `organization` subject sem antes flipar `organizationsEnabled: true` no `createAuth` E `createBillingService` (decisão de produto, não code change isolado).
7. **`subject.id` é o `users.id` do `core` schema** (ver `lib/billing.ts:resolveSubjectEmail`). Não usar `users.email` como ID — o subject de billing é estável; email pode mudar.
8. **Webhook dunning** (`/api/jobs/billing-dunning/route.ts`) embute lógica de send inline (não usa wrapper `retryBillingDunningEmails` como cozya). Aceitável hoje; se a função crescer, extrair pra `features/billing/service.ts` igual cozya.
9. **`auth.signup-attempt-on-existing`** dispara para todos os usuários existentes (sem gate Pro). Manter assim — Pro-only gate vazava info via enumeration. Spam fica contido pelo rate limit `/sign-up/email` 5/h.
10. **Cron services no Railway**: NUNCA criar services novos. Editar `APP_DOMAINS` nos 7 cron-perapp existentes (ver §4 + `docs/deploy-runbook.md` Fase 11).
11. **Adicionar nova rota authenticated**: incluir o prefixo em `requireAuth` no `src/proxy.ts`. Default deny não está ligado — só os prefixos listados são gated.
12. **Não importar `@ai-sdk/openai` ou `@ai-sdk/anthropic` direto** quando IA chegar. Usar `createOpenRouter` de `@informach/ai-core/providers` (mesma regra do cozya §10.10). Whisper transcription pode usar `createOpenAI` apontando pra `https://openrouter.ai/api/v1`.
13. **Adicionar nova categoria de email**: ver `packages/emails/CLAUDE.md` §7 regra 3. A Agenda usa `auth.*`, `billing.*` e `agenda.routine`. O corpo de `agenda.routine` não é persistido para retry genérico: o job do app regenera com permissões atuais.
14. **Account deletion (LGPD)**: NÃO remover o hook `accountDeletion.onBeforeDelete` em `lib/auth.ts`. Sem ele, deletar a conta deixa subscriptions Stripe ativas e a cobrança continua.

---

## 12. Histórico relevante

- Commit `cb219f3` (per-app billing isolation): adicionou coluna `app` em `billing.{customers,credit_ledger,credit_reservations}`, UNIQUE composto `(provider, subjectType, subjectId, app)`. Permite que o mesmo `user.id` tenha customers Stripe distintos no cozya e na agenda. Migration `0020_exotic_wither.sql`.
- Commit `381e053` (site header com logo + theme toggle): SiteHeader em `/login` e `/signup`, AgendaLogo SVG inline.
- Sessão atual (replicar billing do cozya): full UX de billing — onboarding step 3, `/settings/billing`, `/upgrade`, dashboard widget Pro/Free, packs Pro-only, server actions e cron routes. Bug fix em `billing-dunning/route.ts` (URL `/admin/billing` que não existia → `/settings/billing`).


## Rotina familiar: limites de arquitetura e dados

- A identidade Informach é compartilhada entre apps. A exclusão informa o alcance global e bloqueia enquanto outro app tiver assinatura ativa/recuperável, antes de cancelar a Agenda. Não remover esse guard nem cancelar outros produtos implicitamente.

- Rotas e componentes não consultam o banco diretamente. Services coordenam autenticação, entitlement e repositórios; transações ficam nos repositórios.
- `features/family/access.ts` define acesso por criança. Convites/alterações/revogação usam lock por família. Não substituir autorização por gating visual de Pro.
- `features/notices` guarda fonte e providências, com `version`, `dateOrigin`, conclusão e responsável. A confirmação é atômica e idempotente por documento/criança (`notice_applications`), sem cobrar novamente pela extração reaproveitada para outro filho. Retificações pedem decisão explícita e versionam a ação existente com identificador e conclusão preservados.
- **Ciclo do recado**: `processing → ready | failed`; `ready → confirmed | discarded`; `discarded → ready` só quando o mesmo conteúdo é importado de novo (replay por `content_hash`, sem nova cobrança, com as ações descartadas restauradas). Cada ação de `parsed_result` tem um `id` (atribuído em `withActionIds` ao persistir; linhas antigas ganham o seu em `loadNoticeDraft`, com FOR UPDATE), e a lixeira da revisão chama `discardDraftActionAction`, que **marca** `discardedAt` — nunca remove — e vira `discarded` quando não sobra nenhuma. Descartar nunca devolve crédito: `TRIAL_COUNTED_STATUSES` (`trial-reserve.ts`) inclui `discarded` e é lido pelos DOIS contadores da franquia (`reserveNoticeParse` e `countTrialImports`). Leitores que alimentam a tela usam `storedExtractionSchema` + `visibleDraftActions`; `noticeExtractionSchema.parse` descartaria `id`/`discardedAt` em silêncio e os itens descartados voltariam.
- O escopo do original (`source_profile_ids`) é confirmado separadamente das ações e inclui crianças mencionadas sem providências. Até essa revisão, só titular e remetente com acesso atual podem ler o original. Permissões para convidados exigem acesso a todo o escopo. Rascunhos antigos mantêm escopo desconhecido; não inferir autorização por ausência de ações.
- Toda alteração de turma ativa revalida participação dentro do bloqueio de turma/perfil usado na revogação. `active_turma_id` sozinho não concede acesso. Histórico escolar autoriza cada snapshot; versões privadas anteriores à publicação não são devolvidas ao destinatário.
- O parser aceita referência de publicação identificada no original, com trecho de evidência. `noticeGenerationSchema` exige o campo nullable para geração estruturada; leitura de rascunhos anteriores aceita sua ausência. O mesmo vale para `subjectHint`, com um detalhe: `.required()` do Zod é raso, então o item de `actions` recebe `extractedActionSchema.required({ subjectHint: true })` à parte — o OpenRouter manda `json_schema.strict: true` e o Mastra não aplica o preparo estrito da OpenAI ao provider "openrouter", logo toda propriedade precisa estar em `required` (nullable serve, optional não). Ausência ou conflito da referência mantém datas relativas em aberto.
- `features/activities/pending-limit.ts` é a contagem única de pendências. As escritas de escola/extras/recados e reabertura usam o mesmo lock. Status de cada família é privado; correção compartilhada não o apaga.
- `features/notifications/delivery.ts` reconstrói a mensagem antes de enviar, respeita consentimento/silêncio/plano/acesso e usa claim idempotente. Resultado `deferred` do pacote de e-mail não cancela a notificação nem esgota tentativas; `unknown` exige reconciliação antes de reenviar. Finalização confere a reserva atual. O cron `cron-agenda-routine` do Railway (imagem `node:24-alpine` fixada por digest, declarado em `.railway/railway.ts`) roda `scripts/run-routine-job.mjs` a cada cinco minutos e percorre os cursores até o fim. Em produção ele entrega só e-mail: sem o par VAPID no serviço, o ramo de push de `delivery.ts` não roda (ver §9). O texto do script entra no start command quando o plano da IaC é montado: mudar o script só vale no cron depois de `railway config apply`. Ele só passou a existir em 17/10/2026: até ali a rotina nunca tinha rodado em produção.
- `features/account/deletion.ts` cancela billing antes de limpar dados; falha preserva a conta. FKs de autoria permitem anonimização de atividades aceitas por outras famílias. Não prometer apagamento de cópias externas ou registros fiscais.
- Migrações 0035/0036 foram geradas pelo Drizzle. Os snapshots fazem parte da mudança. Não executar `db:push` em produção.
- Métricas aceitam somente metadados definidos no schema. Não registrar recado, anexo, nome de criança ou tokens privados. `pilot:report` usa consulta somente de leitura e eventos de fatura para pagamentos.
- Corpus de IA é opt-in (`test:ai-eval`) e usa provedor real; exemplos fictícios não provam precisão em recados reais. Integração e navegador exigem banco local e fixtures sintéticas.

## Página inicial e aquisição (setembro de 2026, refeita em outubro)

**A página do dia (outubro de 2026).** A landing segue a prancha "Página de vendas" do canvas, nas medidas dela (`components/marketing/landing-ui.tsx`: largura de 1200 px com 40 de margem, seções de 112 px, título de seção de 34 a 56 px, o fundo da página alternando com faixas claras e a faixa escura da turma), com o cartaz de provas escrito à mão (a fonte Caveat, carregada só no layout da landing) e os celulares de exemplo desenhados em tamanho real e reduzidos. No celular, como na prancha, o cabeçalho é o símbolo e "Entrar", e o botão de começar flutua no pé. O registro: o canvas da proposta (`docs/propostas/agenda-pagina-do-dia-2026-10-17/`): o recado que chega virando a página do dia, "Como funciona" em três passos, a demonstração com o cartaz de provas, a página do dia, a turma que recebe junto, a vez da criança, por que dá para confiar, "Quem faz", planos, perguntas e o fechamento, com a barra fixa do botão no celular. `LANDING_VARIANT` passou a `pagina-do-dia-v1`, e o contrato ainda aceita `family-routine-v1` de uma aba aberta antes do deploy; `sticky` e o cenário `cartaz` entraram no contrato (o tipo do `landing_context` mudou, a coluna continua a mesma jsonb).

- **"Quem faz" usa a foto e o texto publicados no site da Informach** (`apps/informach-site/src/components/marketing/founders.tsx`), por decisão da Helena em 17/10/2026, adaptados só no que a página pede e sem nenhum fato novo. A foto é uma cópia em `public/helena-julio.webp`, servida por este app. **Não escrever história dos fundadores que não esteja no site.** O contato vem de `@informach/config/contact` (`INFORMACH_CONTACT`), como nos outros apps, e nenhuma página pública mostra e-mail.
- `sales.module.css` ficou com a base herdada (o fundo `app-ground`), as perguntas e o botão flutuante do celular. As regras por elemento fora de camada venciam qualquer utilitário do Tailwind e saíram; as seções usam as peças de `landing-ui.tsx`, em Tailwind e com os tokens do app. Ao juntar uma peça com uma classe que muda a mesma propriedade, use `cn()` (o `tailwind-merge`): concatenar por texto deixa as duas classes e a ordem do CSS decide.
- A demonstração conta as datas a partir de hoje no fuso de São Paulo (a página é renderizada a cada pedido) e mostra o que foi salvo dia a dia, até o último dia do recado.
- `opengraph-image.tsx` é a figura do link no grupo da turma, e o `metadataBase` do layout raiz faz os endereços dela e do canônico saírem absolutos.

O registro de setembro, que continua valendo onde a página de outubro não mudou:

- A home está em `src/app/(marketing)/page.tsx`. A implementação da proposta está documentada em `docs/propostas/agenda-vendas-2026-09-12/IMPLEMENTACAO.md`.
- `components/marketing/sales.module.css` usa a fonte Jakarta e os tokens existentes, com estilos restritos ao layout público. O app autenticado mantém seu layout.
- A demonstração é local, com dados fictícios e estado React. Não recebe arquivos nem chama IA. Prazo escolar e planejamento da família são apresentados separadamente.
- O mensal é o padrão da home; `plans-content.ts` mostra o total anual cobrado, com equivalente mensal secundário. Preços continuam derivados do catálogo. CTA Pro preserva `plan=pro&cycle=mensal|anual` no cadastro.
- `features/metrics/landing-schema.ts` é o contrato público estrito. Visita, CTA e demonstração têm eventos distintos. `qualified_visit` continua significando o primeiro clique de cadastro por montagem da página; não converter silenciosamente em pageview.
- Migração 0039 adiciona `product_events.landing_context` nullable, sem backfill. Aplicar antes do novo código/relatório. Eventos não guardam conteúdo escolar nem identidade do visitante. `pilot:report` apresenta grupos agregados, sem atribuição individual entre visita e pagamento.
- Verificação da home: `pnpm --filter @informach/agenda-da-turma exec playwright test --config playwright.marketing.config.ts` contra o dev server local. O teste intercepta apenas analytics; navegação e interações são reais. Persistência é verificada separadamente na suíte de integração local.
