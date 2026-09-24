# Agenda da Turma — de app que guarda recado a app indispensável

24/09/2026 · Diagnóstico, pesquisa e programa de implementação. Escrito depois de executado: o que está aqui foi construído, não proposto para depois.

---

## 1. O pedido

Três coisas, na ordem em que a Helena as colocou.

**Primeira.** Um cartaz do 6º ano — "Datas finais — Grupos 1 e 2", Colégio Batista Mineiro, 3ª etapa — listava dez linhas: cinco matérias com capítulos no Grupo 1, com prazo em 27/10, e as mesmas cinco no Grupo 2, com prazo em 24/11. A importação gerou **duas** atividades genéricas, "Datas Finais - Grupo 1" e "- Grupo 2", com todas as matérias empilhadas na descrição. O esperado eram dez, uma por matéria por grupo, cada uma ligada à matéria cadastrada da criança.

**Segunda.** A lixeira do rascunho só apagava na tela. O card "Falta conferir antes de salvar" continuava no painel e a atividade voltava ao retomar. Nas palavras dela: "parece que está funcionando só na interface, mas não no servidor".

**Terceira.** Uma análise geral, com proposta, para o app ficar mais inteligente, mais intuitivo e mais útil — "realmente indispensável para os pais e responsáveis conseguirem organizar a rotina escolar dos filhos".

A revisão da primeira versão desta proposta acrescentou a instrução que define a forma do trabalho: **implementar tudo**, sem deixar boas ideias para depois, dividido em lotes, com revisão de código entre lotes e uma revisão geral no fim.

---

## 2. Diagnóstico

### 2.1 Por que o cartaz virou duas atividades

Não foi o modelo que errou. Foi o que ele recebeu e o que lhe foi pedido.

- O prompt tinha **um único eixo de separação**: o tipo de providência. "Uma ação por providência" separa uma prova de uma autorização, e não separa cinco matérias que compartilham o mesmo prazo. Pior: uma das regras mandava os detalhes de uma entrega para a descrição, que é exatamente onde as cinco matérias foram parar.
- A leitura **nunca recebeu as matérias da criança**. Não havia como o modelo escrever "Matemática" sabendo que Matemática existe cadastrada, com horário e cor.
- A saída **não tinha campo de matéria**, e o cliente zerava o vínculo ao montar o rascunho. Ainda que o modelo acertasse, o resultado era descartado no caminho.
- O casador de nomes de matéria (exato → sinônimos pt-BR → distância de edição) **existia e tinha sido removido** duas semanas antes. Estava no histórico do git, intacto.
- "27/10" e "24/11" chegam **sem ano**. Só o ditado recebia a data de hoje como contexto, então o ano virava chute silencioso.

### 2.2 Por que a lixeira não apagava

- O rascunho vive num campo JSON do recado, e o ciclo tinha quatro estados: em processamento, pronto, falho e confirmado. **Não havia "descartado"**, nem exclusão, nem rota de remoção.
- A lixeira era um filtro no estado do React, nada mais. O campo do rascunho nunca era reescrito depois da leitura.
- As ações do rascunho **não tinham identidade**: sem um identificador por ação, não havia o que marcar no servidor.
- Esvaziar era um beco: a confirmação exigia pelo menos uma ação, então quem removesse a última ficava com um recado que não dava para salvar nem para descartar.

### 2.3 O que o app já fazia bem, e o que faltava

O inventário encontrou uma base sólida: lista única de atividades, um card e um detalhe para qualquer origem, folha "Adicionar" como gesto único de entrada, horário com revezamento quinzenal, prazo calculado pela próxima aula, "Hoje na escola", "Na mochila de amanhã", modo criança, segundo adulto com escopo por filho, publicação na turma, feed de calendário, resumo diário, lembretes, push, exportação em PDF e leitura offline do esqueleto.

As lacunas eram de **fluxo**, não de recurso:

| Lacuna | O que acontecia |
| --- | --- |
| Matéria sem saída | "Nenhuma matéria cadastrada" era um campo desabilitado, sem link para cadastrar. |
| Compartilhar desmarcado | A caixa "compartilhar com a turma" nascia vazia; na prática ninguém compartilhava. |
| Só resumo diário | Nada dizia "o que vem nesta semana" — a hora em que uma família se organiza. |
| Entrada só por cópia | Sem alvo de compartilhamento do sistema, sem importar conversa do WhatsApp. |
| Começo sem trilha | Três avisos apareciam e sumiam sozinhos, sem dizer quantos passos faltavam. |
| Sem planejamento | Lembrete só sob toque, nenhum plano de estudo, nenhuma noção de dia cheio. |
| Sem fila offline | Marcar "feito" sem rede simplesmente falhava, e a intenção era descartada. |

---

## 3. A pesquisa que orientou as escolhas

**Agendas digitais brasileiras são B2B.** ClipEscola, Agenda Edu, HUB Agenda e Kid Note vendem para a escola, e quem publica é a escola. A família recebe. Isso define o espaço: a Agenda da Turma não compete com elas — ela existe porque a escola de muita gente **não** usa nenhuma delas, e o recado chega por WhatsApp, Teams, papel e foto.

**Organizadores familiares com IA convergiram em duas coisas.** Sense, Nori, Calendara, Skylight e Nuet chegaram, por caminhos diferentes, à mesma dupla: **entrada sem digitação** e **um momento de planejamento no domingo**. Não é coincidência; é o formato que a rotina familiar impõe.

**Mas convergência de mercado não é evidência de campo.** Esses produtos apostam em "encaminhe o e-mail", e foi daí que saiu um lote inteiro desta proposta. Na escola real das famílias que usam a Agenda, tarefa não chega por e-mail: o canal serve a assunto administrativo e financeiro, e quem trata de tarefa não usa e-mail. O recurso foi construído e removido, e a lição fica registrada aqui.

**O grupo de WhatsApp da escola é o problema por baixo do problema.** A literatura de 2026 sobre grupos escolares — no Brasil e o trabalho de Marc Rodríguez — descreve sempre o mesmo quadro: mensagem de última hora, checagem compulsiva, carga mental distribuída de forma desigual dentro de casa. O que os pais pedem não é mais notificação. É **uma fonte confiável que se olha uma vez por dia**.

Daí a promessa que orientou todo o programa:

> **Você olha uma vez por dia e nada escapa.**

Cada item abaixo foi medido contra ela. O que não ajuda a olhar uma vez e confiar, não entrou.

---

## 4. O que foi construído

Sete lotes, cada um fechado com verificação, revisão de código e correções antes do commit.

### Lote 1 — As duas correções do pedido

**A leitura separa por matéria.** A leitura passou a receber os **nomes** das matérias da criança escolhida e o ano corrente. A saída ganhou uma pista de matéria por ação, e o prompt passou a separar uma ação por **matéria × entregável × prazo**: um cartaz com dois blocos de cinco matérias vira dez ações, não duas. A pista vira vínculo num lugar só, e o casador de nomes voltou do histórico com uma correção — dois grupos de sinônimos conhecidos e diferentes nunca mais casam por distância de edição, que era como "Física" virava "Ed. Física". Data sem ano recebe o ano da publicação, ou o corrente, **sempre com aviso**.

A prova foi feita com o cartaz real: dez rascunhos, matéria pré-selecionada em cada um, prazos 27/10/2026 e 24/11/2026, e o aviso de que o ano foi assumido.

**A lixeira apaga de verdade.** Cada ação do rascunho ganhou um identificador estável, o ciclo do recado ganhou o estado "descartado", e a lixeira passa pelo servidor. Descartar **marca**, não remove: reimportar o mesmo conteúdo recupera a leitura já paga, sem cobrar de novo. Descartar nunca devolve crédito nem libera vaga da franquia — senão a franquia de cinco importações seria infinita.

### Lote 2 — Entrada sem beco, turma como rede, primeiros passos

Matéria vazia virou link para cadastrar, pela foto do horário, ou para vincular a turma. A caixa de compartilhar passa a **nascer marcada** quando há matéria da turma, prazo da escola e assinatura Pro — nunca com prazo calculado pelo horário, que é planejamento desta casa, e nunca com origem de caderno, que é a letra de uma criança. "Aceitar todas" resolve a fila de compartilhadas num toque. O código da turma virou **link de convite**. E uma trilha de quatro passos, criança → turma → horário → primeiro recado, substituiu os três avisos que apareciam e sumiam sem explicar nada.

### Lote 3 — O app passa a pensar antes do responsável

Três coisas que a rotina sabia e não dizia, **todas determinísticas, nenhuma com IA**:

- **Carga do dia** — três entregas ou noventa minutos marcam o dia como cheio. Uma fonte para três consumidores, porque três contagens de "dia cheio" seriam três respostas para a mesma pergunta.
- **Plano de estudo** — opcional, no detalhe de prova ou trabalho com prazo futuro. Reparte as sessões pelos dias mais livres até a véspera. Cancelar a prova cancela as sessões pendentes; o que já foi estudado continua feito.
- **Resumo de domingo** — dia e hora escolhidos em Ajustes, fora do silêncio, uma vez por semana, saindo da mesma lista do resumo diário.

Mais **"Levar sempre"** por matéria, tênis na educação física e flauta na música, que não é atividade e por isso não tem prazo nem conclusão; e **lembrete sugerido por padrão** no Pro, dois dias antes para material, prova e trabalho.

### Lote 4 — Entrada sem copiar

O manifesto passou a declarar alvo de compartilhamento: compartilhar do sistema abre a revisão com o conteúdo já lá, guardado no aparelho pelo service worker. Exportação do WhatsApp em texto, com seletor de mensagens — **só o que a pessoa marca vai para a leitura**, porque a conversa tem coisas de outras famílias. Várias fotos viram um PDF no navegador, e não três importações cobradas em separado. E um aviso quando o documento identifica claramente a série de outra criança da casa.

### Lote 5 — Recado por e-mail, construído e removido

A família ganharia um endereço só dela para encaminhar o e-mail da escola. Existiu inteiro, com endereço em hash, webhook, caixa no painel e retenção, e saiu antes de ser ligado.

**A premissa estava errada.** A ideia veio da convergência do mercado, não da escola destas famílias. Ali tarefa não chega por e-mail, e o recurso cobraria um registro MX, um serviço externo e uma superfície de entrada nova para resolver um problema que ninguém tem. O código está no histórico do git; o que falta para repor não é implementação, é uma escola que mande tarefa por e-mail.

### Lote 6 — Fila offline de conclusão

Marcar como feito parou de exigir rede. A decisão fica no aparelho e sobe sozinha, com o card dizendo, enquanto isso, que ainda não subiu. Os três requisitos que o próprio código listava como condição para uma fila honesta foram cumpridos: endpoint idempotente próprio, gravação e recibo na mesma transação, e uma tela que mostra o que não subiu. O que o servidor **recusa** nunca é reenviado sozinho — reenviar seria decidir pela pessoa que mudou a atividade do outro lado.

### Lote 7 — Documentação e revisão geral

Esta proposta, o registro de implementação, a atualização do guia do app e uma revisão de código sobre todo o branch.

---

## 5. O que deliberadamente não foi feito

**Conectores automáticos para Teams e Batista ID.** Dependem de conta institucional autorizada, aplicação Microsoft registrada e credenciais que não existem. Não há como construir sem esse acesso, e prometer sincronização que não acontece é pior do que não prometer. O compartilhamento do sistema e a exportação do WhatsApp cobrem o caminho até lá.

**Recado por e-mail.** Construído e removido no mesmo dia, pelo motivo acima. Fica na lista porque a decisão vale mais registrada do que esquecida.

**Escrita no Railway, no DNS e no SendGrid.** Fora do alcance do agente por decisão registrada. Ficaram documentadas como passos operacionais.

**Fila offline para editar, cancelar e importar.** Só concluir e reabrir entraram. As outras mudam o enunciado, e repetir uma edição cega depois que outra pessoa mexeu não é "tentar de novo".

**IA inventando prazo.** Continua proibida, e a distinção importa: calcular a próxima aula a partir do horário que a família cadastrou é determinístico; adivinhar uma data a partir de um texto sem prazo não é. Completar o **ano** de uma data escrita sem ano é a única concessão, e ela vem com aviso.

**Placar, competição entre irmãos, e prazo em vermelho na tela da criança.** Para quem tem oito anos, "atrasada" não é informação, é susto.

---

## 6. Como saber se funcionou

Nenhuma destas métricas guarda conteúdo escolar, nome de criança ou identidade de visitante.

| Pergunta | Sinal |
| --- | --- |
| A leitura chega com a matéria certa? | Casamento automático de matéria sobre o total de ações da importação, contra as pistas que não casaram. |
| A pessoa conserta menos à mão? | Queda na edição de matéria logo após a confirmação de um recado. |
| A entrada ficou mais fácil? | Uso do compartilhamento do sistema e da exportação do WhatsApp, contra a digitação à mão. |
| O começo deixou de ser deserto? | Conclusão dos quatro primeiros passos, contra quantas famílias dispensam a trilha. |
| A rotina passou a ser planejada? | Planos de estudo criados e entregas do resumo semanal. |
| A fila serve para alguma coisa? | Conclusões que só chegaram depois, quando a rede voltou. |
| A promessa se cumpre? | Frequência de abertura por dia. **Uma vez por dia é o alvo; mais não é melhor.** |

O último item é o mais importante e o mais fácil de ler ao contrário. Um app que a família abre oito vezes por dia não venceu a checagem compulsiva do grupo de WhatsApp — virou mais um lugar para checar.

---

## 7. Premissas assumidas

1. Data com dia e mês sem ano recebe o ano da publicação, ou o corrente, sempre com aviso.
2. Reimportar conteúdo descartado recupera o rascunho sem nova cobrança.
3. As dez atividades do cartaz são todas desejadas — "Grupo 1" e "Grupo 2" são lotes sequenciais válidos para toda criança.
4. Compartilhar por padrão só no Pro, com matéria da turma, prazo da escola, nunca origem de caderno.
5. Plano de estudo e carga da semana são determinísticos, sem IA e sem crédito.
