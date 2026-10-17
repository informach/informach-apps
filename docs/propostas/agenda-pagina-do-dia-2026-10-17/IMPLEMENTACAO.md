# Implementação: a página do dia

Registro do que foi construído a partir da [proposta](./PROPOSTA.md), fase por fase, na branch `feat/agenda-pagina-do-dia` (worktree separado, sem push). Cada fase teve uma revisão de código própria antes do commit; os achados e o que foi feito com eles estão no fim de cada fase.

## Fase 1: consertar e falar a mesma língua

Commits `012ec6d` e `c7a8c21`.

- **Datas pelo dia da semana**, num módulo só (`features/dashboard/day-labels.ts`): "qui, 22", "Quinta, 22 de outubro", "Hoje", "Amanhã", "8h30". O e-mail, o card, o detalhe e a semana deixaram de escrever `22/10` ou `2026-10-22`.
- **Resumo diário honesto**: o assunto diz o que traz ("Na Agenda: 2 para hoje, 1 atrasada e 1 para amanhã"), atrasadas e sem data não são mais chamadas de "para hoje", e o corpo tem uma linha por atividade com a criança e a matéria.
- **Push com conteúdo, sem nomes**: contagens e dias ("1 para hoje e 1 para amanhã."), porque a política de privacidade publicada promete texto genérico na tela bloqueada. Teste de integração confere o que chegaria ao serviço de push.
- Barra de progresso com trilho neutro; peso 800 da fonte carregado; mensagens de erro do login em português (`lib/auth-errors.ts`); glossário aplicado (criança, recado lido, Hoje, Feito).

## Fase 2: Hoje em uma tela e meia

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
