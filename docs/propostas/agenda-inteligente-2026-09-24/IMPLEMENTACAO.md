# Implementação: Agenda inteligente, setembro de 2026

Registro do que foi construído no branch `feat/agenda-inteligente-2026-09`, por lote, com as decisões que não são óbvias no código e as pendências que ficaram fora do alcance do agente.

Companheiro da [PROPOSTA.md](./PROPOSTA.md), que explica o porquê. Este arquivo explica o quê e o como.

---

## Forma do trabalho

Sete lotes. Cada um terminou com a mesma sequência, sem pular etapa:

1. `typecheck` + `biome check` + testes de unidade;
2. testes de integração quando o lote tocou o banco, e o teste de navegador do lote;
3. **revisão de código do lote**, esforço médio, sobre a árvore de trabalho;
4. correção de **todos** os achados;
5. commit em pt-BR, sem push.

O lote 7 fecha com a revisão geral sobre `main..HEAD`.

A regra de não deixar achado para depois foi seguida à risca: nenhum lote foi commitado com achado aberto. O custo apareceu no lote 1 (oito achados) e no lote 5 (nove), e em ambos os casos o mais grave era invisível em teste feliz.

---

## Lote 1: matéria na leitura, e a lixeira que apaga

**Migração 0057.** O estado `discarded` no ciclo do recado, com o CHECK refeito.

**A pista de matéria.** A leitura passou a receber, em `src/ai/notices/prompt.ts`, os **nomes** das matérias da criança da captura e o ano corrente. A saída ganhou `subjectHint` por ação.

Duas armadilhas de schema valem registro:

- `noticeGenerationSchema` precisa do campo em `required`, e **`.required()` do Zod é raso**. O item de `actions` recebe `extractedActionSchema.required({ subjectHint: true })` à parte, porque o OpenRouter manda `json_schema.strict: true` e o Mastra não aplica o preparo estrito da OpenAI ao provider "openrouter", então toda propriedade precisa estar em `required`, e `nullable` serve enquanto `optional` não.
- `actionFieldsSchema` faz `.omit({ subjectHint: true })`. A pista **nunca** entra no banco: ela é entrada para resolver o vínculo, não um dado da atividade.

**O vínculo nasce num lugar só.** `features/notices/draft-from-extraction.ts` é puro e é onde a pista vira `subjectId` ou `profileSubjectId`, via `findClosestSubject`. Havia dois blocos duplicados no formulário de captura fazendo trabalho parecido; sobrou um caminho.

**O casador voltou com uma correção.** `findClosestSubject` estava no histórico do git. Ao restaurar, ganhou uma guarda na terceira passada: dois nomes que pertencem a **grupos de sinônimos conhecidos e diferentes** nunca casam por distância de edição. Sem ela, "Física" casava com "Ed. Física" a três edições de distância.

**O descarte é marcação, não remoção.** Cada ação de `parsed_result` ganhou um `id` (atribuído ao persistir; linhas antigas ganham o seu em `loadNoticeDraft`, sob `FOR UPDATE`). A lixeira marca `discardedAt`; quando não sobra nenhuma, o recado vira `discarded`. Reimportar o mesmo conteúdo restaura as descartadas, sem nova cobrança.

**A franquia conta o descartado.** `TRIAL_COUNTED_STATUSES` inclui `discarded` e é lido pelos **dois** contadores que existiam em duplicata. Sem isso, descartar zeraria o teto de cinco importações.

### Achados da revisão do lote 1 (oito, todos corrigidos)

O mais grave: um `return` de erro de dentro de uma transação Drizzle **commita**. O caminho de replay gravava antes de checar o acesso. A lixeira ficava morta num replay já confirmado. `listSubjectOptionsByProfile` estava fora do `try`. O casamento cruzado de Levenshtein (acima). Um closure velho em `removeDraft`. E `discarded` respondendo com o código errado na confirmação.

---

## Lote 2: entrada sem beco, turma como rede, primeiros passos

**Migração 0058.** `agenda.family_settings`, com a dispensa da trilha.

**O passo do horário usa a consulta certa.** `listTurmasNeedingScheduleForUser`, e não `findTurmasOfUserMissingSubjects`: esta última só enxerga turmas **criadas** pela conta, e quem entrou por código ficava com um passo que nunca fechava e um botão que não levava a lugar nenhum. O critério é a matéria **com dias de aula**, porque é isso que sugere prazo e monta a mochila.

**`hasTurma` exige zero crianças sem turma**, não "alguma turma existe", senão a segunda criança ficava invisível na trilha.

**Compartilhar por padrão** entrou em `draftFromExtractedAction`, com a condição inteira: Pro, matéria da turma, prazo presente, e origem escolar (`school` ou `relative`). Prazo `schedule` **não** compartilha: é planejamento desta casa, e publicá-lo espalharia uma data que a escola não marcou.

**`?modo=foto` passou a nascer com origem `notebook`.** É a agenda ou o caderno de uma criança, não o enunciado da escola.

### Achados da revisão do lote 2 (oito, todos corrigidos)

O passo inalcançável para quem entrou por código, o `hasTurma` frouxo, a origem padrão do modo foto, um teto por toque no "aceitar todas", as turmas não passadas ao formulário de edição, o `AbortError` do compartilhamento tratado como falha, a turma órfã no convite, e uma consulta duplicada.

---

## Lote 3: o que a Agenda planeja sozinha

**Migração 0059.** Preferências de resumo semanal e de sugestão de lembrete, `tasks.study_for_task_id`, e `agenda.subject_kits`.

**Uma definição de "dia cheio", não três.** `summarizeDayLoad` em `features/unified-activities/load.ts` serve o bucket da semana, o resumo de domingo e o plano de estudo.

**A ordem das decisões no plano de estudo.** `replaceStudyPlan` decide **antes** de escrever: cancelar o plano anterior e só então recusar por limite do gratuito apagaria o plano da família e devolveria erro, porque um `return` de dentro da transação commita. Foi o achado de maior severidade da revisão do lote.

**A janela do resumo cobre a janela do plano.** Com teto fixo, uma prova distante deixava todos os dias além dele parecendo livres, e a regra de evitar dias cheios se desligava em silêncio.

**"Levar sempre" não é atividade.** Sem prazo, sem conclusão, fora de qualquer contagem. A chave é `(criança, matéria)`, porque a matéria é compartilhada entre famílias e duas irmãs na mesma turma levam coisas diferentes. Aparece nos **dois** lugares em que a mochila aparece, senão a mesma tela mostraria conteúdo diferente conforme a hora.

**O resumo semanal não ganhou evento de produto próprio**: quem conta envio é `agenda.notification_deliveries`, com a chave `weekly:<data do envio>`. Um segundo contador discordaria dele no primeiro reenvio.

### Achados da revisão do lote 3 (sete, todos corrigidos)

Além do plano destruído antes da recusa: a janela do resumo, e cinco de menor alcance.

---

## Lote 4: trazer o recado sem copiar

Sem migração. Três entradas novas e um aviso.

**O alvo de compartilhamento do sistema** é atendido pelo **service worker**, que guarda título, texto, URL e um arquivo de até 5 MB no IndexedDB e devolve 303 para a revisão. A rota de app é a rede de segurança para a primeira vez e para o worker desligado: ela redireciona com o texto na URL e **descarta o arquivo**, porque guardá-lo no servidor seria subir um anexo que ninguém conferiu.

**A exportação do WhatsApp** lê os formatos iOS e Android, com continuação de linha e ano de dois dígitos, e descarta o que o WhatsApp escreve sozinho. O seletor mostra as mensagens e **só o marcado vai para a leitura**. Cada mensagem leva a própria data, e a mais recente vira a referência de publicação. Sem isso, um "entregar amanhã" de terça viraria prazo de hoje.

**Várias fotos, um recado.** O PDF é montado no navegador, com reencodificação para caber em 5 MB. Antes, cada página da agenda era uma importação separada, e uma cobrança separada.

**O aviso de turma trocada** leva ao modelo a série da criança escolhida e a das outras da casa, **só a série, nunca o nome**. Ele não troca a criança: quem escolhe é quem revisa.

### Achados da revisão do lote 4 (sete, mais quatro menores, todos corrigidos)

A turma errada escolhida por ordem de ano em vez do `activeTurmaId` do perfil. Adultos convidados vendo a listagem pelo dono errado. Fotos compartilhadas nascendo como Teams e com compartilhamento automático. Ordem de mensagens invertida. Um filtro de ruído que casava por substring e engolia mensagem legítima. Linhas de continuação de mensagens já descartadas. Perda de payload no duplo-mount do StrictMode. AM/PM. `publishedAt` sobrescrito. E o fatiamento do base64.

---

## Lote 5: recado por e-mail, construído e removido

Feito inteiro e retirado no mesmo dia, antes de ser ligado. Fica registrado porque a lição é sobre a pesquisa, não sobre o código.

**O que existia.** Migração 0060 com `agenda.inbox_addresses` e `agenda.inbox_messages`, endereço `recados+<token>@...` com token em hash, girável e revogável, webhook do SendGrid Inbound Parse com Basic Auth, caixa no painel, retenção de 30 dias, e a regra de que nada é lido por IA nem cobrado até a pessoa escolher a criança. A revisão do lote encontrou nove achados e todos foram corrigidos.

**Por que saiu.** A ideia veio da convergência do mercado: Sense, Nori, Calendara e afins apostam em "encaminhe o e-mail". Na escola real das famílias que usam a Agenda, **tarefa não chega por e-mail**. O canal serve a assunto administrativo e financeiro, como atestado, boleto e secretaria, e quem trata de tarefa não usa e-mail. O recurso resolvia um problema que essas famílias não têm, e cobrava por isso um registro MX, um serviço externo e uma superfície de entrada nova.

**Como saiu.** Migração 0062 derruba as duas tabelas, e o código foi removido por inteiro: feature, webhook, seções do painel, variáveis de ambiente e as duas métricas. Para a frente, como toda migração daqui: a 0060 fica no histórico. A queda é segura porque as tabelas nunca receberam linha: a feature dependia de um MX que nunca existiu.

**Não repor sem evidência de campo.** O código está nos commits `86d79e2` e `86530bf`. O que falta não é implementação, é uma escola que mande tarefa por e-mail.

---

## Lote 6: fila offline de conclusão

**Migração 0061.** `agenda.idempotent_writes`, chaveada por `(user_id, key)`.

Escopo estreito de propósito: **só concluir e reabrir**, a partir dos cards, do detalhe e do modo criança. Editar, cancelar e importar continuam exigindo rede.

**Os três requisitos que o código já listava** como condição para uma fila honesta foram cumpridos, e nenhum é dispensável.

**Endpoint próprio.** `POST /api/tasks/[id]/status`, com `Idempotency-Key` no cabeçalho. Server action não serve: o identificador dela muda a cada build, e a gravação guardada no aparelho na sexta-feira não teria para onde ir depois do deploy de segunda.

**Uma vez só, de verdade.** `applyTaskStatusOnce` abre **uma** transação: trava a chave por advisory lock, lê o recibo e, quando não há recibo, chama `setNoticeActionStatusWithinTx` e grava o recibo ali mesmo. A extração dessa função do meio de `setNoticeActionStatusAtomically` foi a única mudança na gravação existente. Gravar primeiro e anotar depois deixaria uma janela em que a atividade está concluída e o recibo não existe, que é justamente a janela em que o aparelho tenta de novo.

A chave é composta com o dono porque, fosse `key` sozinha a chave primária, adivinhar a de outra família devolveria o recibo dela. `task_id` fica sem chave estrangeira: o recibo precisa sobreviver à atividade que descreve, senão apagar a atividade reabriria a porta para a mesma gravação acontecer de novo. E a **recusa também é guardada**: repetir uma chave recusada recebe a mesma recusa, nunca uma diferente.

**O status HTTP é o contrato com o cliente.** 200 é resultado de negócio, inclusive a recusa, e a entrada sai da fila. Qualquer outra coisa é transporte e a entrada fica: 401 de sessão expirada, 429, 5xx, rede caída. O **200 com HTML** de um redirecionamento para o login conta como transporte, porque tratá-lo como sucesso apagaria a conclusão sem ela ter chegado a lugar nenhum. As exceções são 400 e 413: um pedido que o servidor não entende hoje não vai entender amanhã.

**O que foi recusado nunca é reenviado sozinho.** Conflito de versão vira linha na folha de pendências, com a atividade a um toque. Reenviar seria decidir pela pessoa que mudou a atividade do outro lado. É a objeção exata que segurou esta fila até agora.

**O service worker avisa, não envia.** O evento `sync` com a marca `agenda-flush` manda um recado às janelas abertas. Enviar dali obrigaria a repetir no worker a sessão, a chave e a leitura da resposta, e duas cópias dessa decisão é o tipo de divergência que faz uma conclusão sumir. O preço é conhecido: sem janela aberta, a fila espera o app abrir.

**Retenção de sete dias** para os recibos, no mesmo job que já varre os anexos vencidos.

---

## Pendências operacionais

Nenhuma delas bloqueia o resto do branch.

**1. Aplicar as migrações antes do deploy do app.** As migrações 0057 a 0061 são aditivas e a 0062 derruba duas tabelas que nunca receberam linha, e o `/api/ready` já é o portão: banco atrás do build devolve 503 e a instância nova não recebe tráfego. O migrator é um service separado e não tem `watchPatterns`, então ele redeploya a cada push.

**2. Nenhum cron novo.** A retenção dos recibos entrou no job que já existe.
