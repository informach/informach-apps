# Implementação: a página do dia

Registro do que foi construído a partir da [proposta](./PROPOSTA.md), fase por fase, na branch `feat/agenda-pagina-do-dia` (worktree separado, sem push). Cada fase teve uma revisão de código própria antes do commit; os achados e o que foi feito com eles estão no fim de cada fase.

## Fase 1: consertar e falar a mesma língua

Commits `971c9ec` e `838dfff` (os hashes são os de depois do rebase sobre a `main` de 17/10/2026).

- **Datas pelo dia da semana**, num módulo só (`features/dashboard/day-labels.ts`): "qui, 22", "Quinta, 22 de outubro", "Hoje", "Amanhã", "8h30". O e-mail, o card, o detalhe e a semana deixaram de escrever `22/10` ou `2026-10-22`.
- **Resumo diário honesto**: o assunto diz o que traz ("Na Agenda: 2 para hoje, 1 atrasada e 1 para amanhã"), atrasadas e sem data não são mais chamadas de "para hoje", e o corpo tem uma linha por atividade com a criança e a matéria.
- **Push com conteúdo, sem nomes**: contagens e dias ("1 para hoje e 1 para amanhã."), porque a política de privacidade publicada promete texto genérico na tela bloqueada. Teste de integração confere o que chegaria ao serviço de push.
- Barra de progresso com trilho neutro; peso 800 da fonte carregado; mensagens de erro do login em português (`lib/auth-errors.ts`); glossário aplicado (criança, recado lido, Hoje, Feito).

## Fase 2: Hoje em uma tela e meia

Commit `7a8261c`.

- **Hoje reorganizado** como a página do dia: data e frase de resumo, "Para hoje", "Hoje na escola", "Amanhã" com a mochila, "A semana" numa faixa de sete dias. Saíram os quatro números do topo, o progresso por criança e o rodapé jurídico. Primeiros passos no topo enquanto faltarem, com o primeiro recado logo depois da criança. A ordem e o raciocínio estão em `apps/agenda-da-turma/CLAUDE.md`, seção "Hoje".
- **Card em linha** (`UnifiedActivityCard`): ponto da cor da matéria, criança, quem cuida e o chip de prazo (`describeDue`: "Passou · sex, 16", "Hoje · 8h", "Amanhã", "qua, 21"). Feito com "Desfazer" no aviso; a explicação de que a escola não recebe aviso aparece no primeiro Feito.
- **Detalhe para ler** (`ActivityRead`): o quê, quando e de onde veio a data, quem cuida, com "Marcar como feito" fixo no pé. Editar é `?editar=1`.
- **"Imprimir a semana"** no Calendário: a semana que está na tela, um bloco por dia, sem números de resumo nem tabela por criança, pelo plano da família.
- Tinta nova `destructive-ink` no bloco TINTAS (7,02:1 no claro, 8,83:1 no escuro). Evento `today_viewed`, um por adulto por dia, sem nada além do dia.
- Convite do resumo virou uma linha no fim; atividades da turma viraram uma linha recolhida.

### O que a revisão da fase 2 achou

- **"Desfazer" nunca funcionava**: o aviso mandava a versão de antes do Feito e o servidor respondia conflito. A gravação de situação passou a devolver a versão nova (também no recibo da fila offline) e o card guarda a mais nova que conhece. Teste E2E novo em `offline-queue.spec.ts` e de integração em `family-routine.test.ts`.
- **O PDF ainda era o painel antigo**, com a tabela de progresso por criança. Foi refeito como a semana do calendário.
- No telefone, "Hoje na escola" vinha depois de "Amanhã", e só começava a carregar depois da rotina. Ordem corrigida e consulta iniciada na página.
- À noite, "Amanhã está livre por enquanto" aparecia embaixo de uma mochila cheia.
- Alvos de toque abaixo de 44 px, iniciais do avatar entrando no nome dos links, `today_viewed` contado duas vezes com duas abas (trava por adulto, teste de integração), "o recado não deu data" em atividade que não veio de recado, histórico que não abria, "Mudou depois de salva" depois de só concluir e reabrir (agora vem das revisões), e a lista da semana mostrando um dia que a faixa não tinha.
- As contagens que só os cards usavam saíram da consulta da rotina; as funções que só o PDF antigo usava foram removidas.

### Verificação da fase 2

Typecheck e Biome limpos; testes unitários e de integração passando; E2E da configuração padrão passando com o `.next` limpo, depois de consertar o aquecimento: ele compilava só a página de login, porque o proxy redireciona as rotas protegidas sem sessão. Agora uma conta sintética entra e aquece as rotas e as páginas que a suíte visita.

## Fase 3: trazer um recado em três toques

Commit `1fb3bcc`.

- **"O que chegou?"** (`AddSheet`): a criança no topo, lembrando a última deste aparelho (`notices/last-child.ts`), e os quatro caminhos (Foto, Mensagem, Falar, Escrever). O rodapé diz quantas leituras sobram no saldo de quem assina, ou quantos recados de teste faltam; quando acabam, o adulto convidado lê que quem assina pode comprar mais, em vez de cair na própria assinatura vazia.
- **"Trazer um recado"** (`/recados/novo`): o caminho escolhido vem primeiro (a câmera, o campo de colar, o microfone), e origem, observação, data e link moram em "Mais opções". Enquanto a Agenda lê, a tela diz o que ela está fazendo.
- **Revisão em cartões curtos**: título, matéria, data e de onde veio a data. O cartão abre sozinho quando precisa da pessoa (sem título, matéria que não casou, correção de prazo, lembrete que já passou, e quando vai para a turma, porque essa caixa não pode ser marcada sem ninguém ver). "Tirar" chega ao servidor na hora e tem "Desfazer" enquanto a revisão está aberta.
- **Privacidade do original** num interruptor, "O recado fala só de Clara", com a mesma regra de antes: desligado por padrão.
- **"Pronto"** no lugar do redirecionamento: o que entrou na semana, a primeira data, "Ver na semana", "Trazer outro recado". Escrever à mão continua voltando para Atividades.
- Copy dos campos: "Mandar para a turma", "Toda semana, depois de feita", "Na próxima aula de Matemática", "(fora da escola)", e "ainda sem data" quando a atividade não veio de recado. Saiu o caminho morto do anexo por e-mail.

### O que a revisão da fase 3 achou

Consertado: a caixa "Mandar para a turma" marcada dentro de um cartão fechado; o lembrete vencido escondido e contado como "chega no horário"; o aviso de rascunho vencido aparecendo em cima do "Pronto" de quem acabou de salvar, e a URL que não limpava; a folha guardando a escolha de criança de uma abertura para a outra; o cadastro à mão trocando de criança depois da primeira atividade; o erro de validação apontando para um campo escondido; a conversa do WhatsApp sumindo dentro de "Mais opções" na Foto; a ordem das crianças instável no rodapé; nomes acessíveis ("Tirar a atividade 1"), foco depois de salvar e textos que diziam mais do que a regra garante.

### Verificação da fase 3

Typecheck e Biome limpos; unitários (578) e integração (88) passando; E2E dos fluxos de captura passando. O aquecimento passou a pedir também os scripts de cada página: sem isso, o primeiro teste que abria a página pagava a compilação do lado do navegador e o `next dev` recarregava a tela no meio do clique. Com a máquina a 100% de CPU por outras sessões, uma rodada ainda falhou por tempo e passou na seguinte.

## Fase 4: página de vendas e primeiro acesso

Commit `2315e2a`. A sessão que começou esta fase caiu por falta de memória da máquina com os rascunhos instalados e sem revisão; eles foram conferidos contra o canvas e os testes, e o que não batia foi refeito.

- **A landing do canvas**: o recado que chega (o cartaz de provas e a mensagem do grupo) virando a página do dia no celular, os canais de onde o recado já vem, "Como funciona" em três passos, a demonstração, a página do dia (de manhã e à noite, e o resumo de domingo), a turma que recebe junto, a vez da criança, "Por que dá para confiar", "Quem faz", planos, perguntas e o fechamento, com a barra fixa do botão no celular e a figura do link para o grupo da turma (`opengraph-image.tsx`, com `metadataBase` no layout raiz).
- **A demonstração** começa no cartaz de provas, conta as datas em dias de aula a partir de hoje (no fuso de São Paulo), diz de onde veio cada data ("a escola disse", "a confirmar", "planejado por vocês"), tem Tirar e Manter, e o salvo mostra cada atividade no seu dia.
- **"Quem faz" sem texto inventado**: só o fato (a Agenda é um app da Informach) e o direct do Instagram, de `@informach/config/contact`, como nos outros apps. No mesmo dia a Helena decidiu usar o texto e a foto do site institucional (ver a fase 5).
- **O cadastro em quatro passos**: conta (uma senha só, com "Mostrar"), código, o nome da criança e o primeiro recado (foto, mensagem ou falar, já com a criança escolhida). O passo a passo diz "Passo 2 de 4: Código".
- **Plano fora do cadastro.** O grátis vale por padrão. Quem escolheu o Pro na landing vai ao pagamento na confirmação do código, no ciclo escolhido. O anual não se perde mais em nenhum caminho de quem já tem conta (login, recarga depois do código, pagamento cancelado, sessão vencida na oferta), porque todos passam por `proOfferHref`. `/choose-plan` virou uma rota que redireciona para a oferta, para os links antigos.
- **O Pro na hora certa** (`/upgrade`, `UpgradeOffer`): a página responde ao motivo de quem chegou ("A semana em PDF faz parte do Pro.", a segunda criança, o segundo adulto, os lembretes, os recados de teste que acabaram). O botão "Seja Pro" saiu do cabeçalho.
- Os números do plano saem do catálogo e dos limites (`plans-content.ts`), inclusive na mensagem de franquia esgotada, que dizia "5" e "70" à mão.

### O que a revisão da fase 4 achou

Consertado:

- **Um `next` qualquer pulava a criança.** O proxy põe `?next=` em toda rota protegida, inclusive Hoje e o início do aplicativo instalado, e o "Criar conta" do login repassava sempre o seu. A conta nova saía sem criança e sem primeiro recado. Agora só o convite de outro adulto vai direto; a oferta do Pro com ciclo vira pagamento; qualquer outro destino vem depois da criança (`afterVerification`, com testes).
- **Redirecionamento aberto** em `safeInternalPath`: `next` com barra invertida ou tab antes da segunda barra virava `//outro-site` na navegação. O caminho agora recusa os dois e confere a origem.
- O cabeçalho da landing passava da largura em 320 px, e a barra fixa cobria a última linha do rodapé.
- Na demonstração, as datas caíam no fim de semana em seis dias de cada sete, e o salvo mostrava uma das quatro provas do cartaz (era uma grade de sete dias); o foco ia para o começo da página ao salvar e ao recomeçar, e "Nada para salvar" parecia um botão ativo.
- O passo a passo dizia "Pagamento" depois de "Seguir no grátis"; o passo da criança não tinha saída e escondia o motivo do erro.
- `/upgrade` trancava quem cuida junto numa casa Pro e tem os próprios filhos no grátis: era a única porta do pagamento e dizia que o Pro já valia.
- A seção da vez da criança prometia o que só a fase 5 entrega; o texto entrou com a fase 5.
- `/choose-plan` como página respondia 200 com refresh dentro do Suspense da raiz; virou rota com 307. Números escritos à mão, código morto (`PlanCards`, `selectFreePlanAction`, `ANNUAL_SAVINGS_PCT`) e o guia do app que não batia com o código.

Fica registrado, sem mudança: a métrica "primeiro recado salvo por variante" não tem como sair dos eventos, porque eles não ligam a visita ao cadastro (de propósito, ver o guia do app); e quem paga o Pro pela landing volta para Hoje sem passar pela criança, que aparece nos primeiros passos.

### Verificação da fase 4

Typecheck e Biome limpos; unitários (588) e integração (88) passando; `playwright test --list` coleta 24 testes em 13 arquivos. O E2E não rodou nesta fase: a máquina estava com 1 a 4 GB de memória livre por causa de outras sessões, abaixo dos 5 GB combinados para subir o `next dev`. Ele roda inteiro, com o `.next` limpo, depois da conferência com o canvas, e o resultado está lá.

## Fase 5: semana, família e criança

- **A aba Calendário vira Semana** (a rota continua `/calendario`, que é o que e-mails, notificações e links guardados usam). Abre na semana; o mês fica a um toque. A semana começa na segunda em todo o calendário (`WEEK_STARTS_ON`), como a página da agenda da mochila: a semana na tela, a grade do mês e a semana impressa.
- **A semana como a agenda de papel**: uma linha por dia, o dia da semana e o número à esquerda, o que vence à direita, hoje marcado e "dia cheio" pela mesma conta do resumo de domingo. A atividade é uma linha que abre a leitura ("Matemática · Clara · na próxima aula · cerca de 30 min"); o dia vazio tem "+" com a data e a criança; o que está sem data fica em "Sem data marcada · 2", saído da rotina de Hoje; no pé, "Lista de todas as atividades" e "Imprimir a semana". A barra é toda de links, e o filtro de criança são as mesmas pílulas de Hoje (`ChildFilter`). A vista do dia saiu (a semana já mostra cada dia inteiro), e a faixa da semana de Hoje leva ao dia dentro da semana.
- **Família › Crianças**: uma folha por criança com "A vez de Clara" à vista, "Horário da turma" (ou "Vincular a turma") e "Atividades extras"; "Adicionar criança (1 de 1)" tracejado; "Quem cuida junto"; e uma linha por turma ativa com "Convidar" (o convite de `TurmaCard`, agora em `share-invite.ts`). O adulto convidado vê a folha das crianças que acompanha, com "Ver as atividades", sem horário, extras, adultos nem código da turma.
- **A vez da criança vai até a próxima aula** (a decisão posterior da proposta): `splitKidTurn` recorta os mesmos buckets de `getRoutineSnapshot` em `todo` ("Para hoje" mais o que vence até `nextSchoolDayIso`) e `ahead` (o resto dos próximos dias, até onde vai "A semana" de Hoje). "Oi, Clara!", "É para hoje", "É para amanhã", "É para segunda". Feito fica na tela com "Desfazer" até "Próxima" ou "Terminar", e no fim "Quer adiantar?".
- **"Quem faz" com a foto e o texto do site da Informach**, por decisão da Helena em 17/10/2026: o título "Uma família que faz tecnologia para outras famílias.", o parágrafo de Helena e Júlio e o critério "só sai daqui o que a gente usaria em casa", adaptados só no que a página pede (lá o texto fala dos produtos "desta página" e do Sistema Zero). A foto foi copiada para `public/helena-julio.webp` deste app, e o contato continua o direct do Instagram.
- A landing passa a dizer que a vez da criança mostra o que é para o próximo dia de aula, agora que isso é verdade.

### O que a revisão da fase 5 achou

Consertado:

- **Um refresh trocava a lista embaixo da criança.** A tela lia as listas das props, e o refresh (o de um conflito, ou o do `OfflineQueueFlusher` quando a fila sobe) traz só o pendente: o que ela acabou de fazer sumia com o "Desfazer", e a posição apontava para outra atividade. As listas agora são da sessão; das props novas vêm só as versões e o que segue pendente no servidor, e depois de um conflito é o servidor que decide se a atividade está feita.
- A versão guardada vencia a do servidor e repetia o conflito sem fim; um duplo toque sem rede pulava o "Desfazer" ("Próxima" nasce no mesmo lugar e agora espera um instante); o "Quer adiantar?" ia um dia além do que Hoje mostra e dizia "esta semana" numa sexta; o anúncio para leitor de tela nascia junto com o conteúdo (agora é uma região viva fixa).
- O link do resumo de domingo e o "Ver tudo" de Hoje abriam, no fim de semana, a semana que estava terminando: com a semana na segunda, eles levam à semana que vem (`upcomingWeekAnchorIso`).
- Os controles da Semana eram botões que só agiam depois de hidratar; viraram links montados no servidor. O "Adicionar criança" tracejado também espera a hidratação, e voltou a aparecer para quem cuida junto, que pode cadastrar os próprios filhos.
- A regex do `review-fixes.spec.ts` tinha perdido as barras e nunca casaria; o teste novo procura a atividade pela criança da execução, e ganhou o caso de quem cuida junto em Família.
- Do mês para a semana, a semana de hoje quando o mês é o de hoje. Guia do app com um travessão e com a vista do dia que não existe mais.

Fica registrado: na Semana, as atividades sem data saem de `getRoutineSnapshot` inteiro (até 200 linhas) para que nunca discordem de Hoje, o que custa uma consulta maior que a necessária; e o teste da criança desfazendo um Feito sem rede não existe (o da fila offline cobre o card do adulto).

### Verificação da fase 5

Typecheck e Biome limpos; unitários (595) e integração (88) passando. O E2E roda depois da conferência com o canvas, pelo mesmo motivo da fase 4 (memória da máquina), e o resultado está lá.
