# Revisão da implementação — Agenda da Turma

Data: 11/09/2026, horário de São Paulo. Escopo: implementação presente no workspace, incluindo arquivos novos ainda não versionados e alterações nos pacotes compartilhados. Esta é uma revisão posterior à entrega descrita em [IMPLEMENTACAO.md](IMPLEMENTACAO.md).

**Atualização posterior:** os dez achados abaixo foram corrigidos e validados localmente em [CORRECOES.md](CORRECOES.md). Este documento preserva o estado encontrado durante a revisão; suas reproduções registram os defeitos anteriores à correção. Não houve implantação em produção.

**Encontrei 10 achados: seis de prioridade alta (P1) e quatro de prioridade média (P2). Não recomendo liberar esta versão para famílias reais antes de corrigir os P1.** Há falhas de privacidade, revogação de acesso, edição e confiabilidade dos lembretes. Os P2 também devem entrar na correção antes de considerar a proposta integralmente atendida.

As verificações existentes passaram: 478 testes do app, 16 de integração e 507 dos pacotes compartilhados, além de tipos, build e Biome no escopo afetado. Entretanto, dez reproduções adicionais confirmaram os problemas abaixo. Um cenário no navegador também confirmou o bloqueio da segunda edição. **Os testes de reprodução esperam o comportamento defeituoso: passarem confirma o achado, não a correção.**

Na etapa desta revisão foram acrescentados apenas relatório e evidências; os problemas ainda permaneciam no código. O relatório anterior de implementação registra o que havia sido entregue e testado. Consulte a atualização de correções acima para o estado posterior de isolamento, recuperação e edição.

## Achados por prioridade

| ID | Prioridade | Problema | Efeito para a família |
| --- | --- | --- | --- |
| [F02](#f02--histórico-expõe-conteúdo-anteriormente-privado) | P1 — alta | Histórico divulga versões privadas anteriores à publicação | Outra família pode ler uma observação removida antes do compartilhamento. |
| [F04](#f04--anexo-ainda-não-revisado-escapa-do-escopo-por-criança) | P1 — alta | Anexo ainda não revisado passa pela autorização por criança | Convidado de uma criança pode obter documento que contém dados de outra. |
| [F09](#f09--requisição-concorrente-restaura-acesso-após-revogação) | P1 — alta | Seleção de turma concorre com revogação | Participante removido pode recuperar acesso a atividades compartilhadas. |
| [F01](#f01--segunda-edição-de-atividade-escolar-é-recusada) | P1 — alta | Formulários escolares continuam enviando versão 1 | A primeira edição funciona; as seguintes são recusadas, mesmo após recarregar. |
| [F07](#f07--envio-interrompido-pode-cancelar-definitivamente-o-lembrete) | P1 — alta | Disputa transitória de envio é tratada como cancelamento | Um lembrete pode nunca mais ser tentado após interrupção do processo. |
| [F06](#f06--retificação-importada-mantém-dois-prazos-ativos) | P1 — alta | Nova importação de uma retificação não reconcilia a obrigação anterior | Prazos antigo e novo continuam pendentes sem alerta de alteração. |
| [F03](#f03--exclusão-apaga-histórico-de-quem-aceitou-e-depois-recusou) | P2 — média | Preservação considera somente o aceite atual | Histórico individual já criado pode ser apagado pela exclusão do autor. |
| [F05](#f05--recado-confirmado-não-pode-ser-reutilizado-para-outro-filho) | P2 — média | Idempotência do documento bloqueia nova aplicação por criança | Reimportar o mesmo comunicado para o segundo filho não cria suas ações. |
| [F08](#f08--conclusão-antiga-altera-o-estado-da-nova-importação) | P2 — média | Finalização da importação não verifica a tentativa | Um processo antigo pode marcar como falha uma execução nova. |
| [F10](#f10--data-de-publicação-no-original-é-desconsiderada-pelo-validador) | P2 — média | Validador e instruções da IA discordam sobre a referência de data | Prazo relativo fundamentado no original fica sem data e exige retrabalho. |

P1 significa correção necessária antes da liberação; P2 significa defeito funcional ou lacuna que exige correção, com condição mais restrita ou alternativa manual. Nenhum achado foi classificado como crítico. A severidade considera impacto e condições de ocorrência, e não apenas a facilidade da reprodução automatizada.

## F02 — Histórico expõe conteúdo anteriormente privado

**Código:** [history-repository.ts](../../../apps/agenda-da-turma/src/features/activities/history-repository.ts), linha 27; [repository.ts](../../../apps/agenda-da-turma/src/features/activities/repository.ts), linhas 281 e 290; [página de histórico](../../../apps/agenda-da-turma/src/app/(app)/atividades/[id]/historico/page.tsx), linha 46.

O histórico autoriza o acesso pela atividade atual e devolve todas as revisões. Uma revisão contém o objeto anterior completo. O contrato de atualização permite mudar uma atividade individual para compartilhada quando ainda não há aceites.

**Reprodução confirmada em PostgreSQL:** criar atividade individual com uma observação privada; atualizar para compartilhada e substituir a descrição por conteúdo público; outra família aceita a atividade; consultar o histórico como essa família. A resposta contém a observação privada anterior, e a página renderiza a descrição anterior.

**Condição:** a mudança de visibilidade foi feita pelo serviço aceito pela ação do servidor. O formulário atual de edição não oferece esse controle. A falha está no contrato autorizado do backend e na exposição do histórico; não depende de adivinhar um identificador de outra família.

**Correção recomendada:** estabelecer quais versões foram publicadas e autorizar cada versão/campo. O destinatário deve ver somente conteúdo que tenha sido compartilhado com ele. Na revisão que marca a publicação, não expor o objeto privado anterior. Preservar o histórico completo para o proprietário.

**Critério de correção:** destinatário lê o conteúdo público e suas futuras correções; nenhuma descrição, título ou campo privado de versões anteriores aparece na resposta ou na página. Proprietário continua tendo seu histórico.

## F04 — Anexo ainda não revisado escapa do escopo por criança

**Código:** [notices/repository.ts](../../../apps/agenda-da-turma/src/features/notices/repository.ts), linhas 69–79 e 99; [rota de download](../../../apps/agenda-da-turma/src/app/api/recados/[id]/anexo/route.ts), linha 10.

A autorização do documento verifica se a criança selecionada na captura é acessível e se não existe uma ação de criança restrita. Antes da confirmação, não há ações; portanto, essa segunda condição permite acesso mesmo sem revisão do conteúdo integral.

**Reprodução confirmada em PostgreSQL:** convidar um adulto somente para a criança A; salvar um recado pronto para revisão, associado a A, com texto e PDF válido contendo também informação da criança B. O convidado encontra o identificador em `listReadyNotices` e obtém o original e os bytes do PDF por `getNoticeSource`. Essa é a mesma autorização usada na rota autenticada de download. Ao confirmar ações para A e B, o acesso passa a ser negado, mas a exposição anterior já ocorreu.

O teste exercitou a autorização e os bytes do anexo, não uma sessão HTTP de download. A leitura da rota confirma que não existe outra verificação de escopo entre essa consulta e a resposta.

**Correção recomendada:** manter o original não revisado restrito ao proprietário/remetente autorizado até que o escopo do documento seja confirmado. Registrar o escopo do original separadamente das ações extraídas: um documento também pode mencionar uma criança sem gerar uma ação para ela.

**Critério de correção:** convidado de A não lista nem baixa um original com escopo ainda desconhecido ou que inclua B. O acesso às ações autorizadas de A permanece funcional. Cobrir estados de processamento, revisão, confirmação e documento sem ações para B.

## F09 — Requisição concorrente restaura acesso após revogação

**Código:** [turmas/service.ts](../../../apps/agenda-da-turma/src/features/turmas/service.ts), linhas 106–109; [turmas/repository.ts](../../../apps/agenda-da-turma/src/features/turmas/repository.ts), linhas 313–317; [group-access.ts](../../../apps/agenda-da-turma/src/features/turmas/group-access.ts), linhas 68–135.

`setActiveTurma` verifica participação e altera `activeTurmaId` em operações separadas. A remoção elimina a participação e limpa a turma ativa em uma transação. Uma solicitação que já leu a participação antiga pode esperar a remoção terminar e depois restaurar o identificador da turma ativa. Consultas de atividades ainda usam esse identificador como autorização.

**Reprodução confirmada com duas transações em PostgreSQL:** uma transação mantém em aberto a exclusão da participação e a limpeza do perfil; a chamada real de `setActiveTurma` começa durante esse intervalo; a remoção termina; a seleção de turma termina com sucesso. O banco fica sem participação, mas `listPendingSharedActivitiesForUser` volta a retornar atividade compartilhada.

**Limite da reprodução:** a transação de teste modela as duas mutações de participação/perfil da revogação para controlar a ordem. Não executa a função inteira `removeGroupAdult` concorrente. O serviço de seleção e a consulta de atividades são os de produção. O bloqueio da turma na remoção não protege essa seleção, que não usa o mesmo bloqueio.

**Correção recomendada:** serializar seleção e revogação pelo mesmo bloqueio, revalidando a participação dentro da transação antes de gravar. Leituras e escritas devem também exigir participação válida; `activeTurmaId` deve representar preferência de navegação, sem conceder acesso sozinho. Auditar outros pontos que o escrevem.

**Critério de correção:** na mesma ordem concorrente, a solicitação antiga é recusada ou perde a seleção ao término da revogação; nenhuma consulta ou escrita consegue acesso à turma removida. Trata-se de uma lacuna no endurecimento implementado, mesmo havendo funções envolvidas que já existiam antes.

## F01 — Segunda edição de atividade escolar é recusada

**Código:** [activity-card.tsx](../../../apps/agenda-da-turma/src/features/activities/components/activity-card.tsx), linha 249; [activity-detail-dialog.tsx](../../../apps/agenda-da-turma/src/features/calendar/components/activity-detail-dialog.tsx), linha 306; [activity-form-dialog.tsx](../../../apps/agenda-da-turma/src/features/activities/components/activity-form-dialog.tsx), linha 170.

Os dois consumidores montam o objeto entregue ao formulário sem `version`. O formulário envia `activity.version ?? 1`. Depois da primeira edição o banco passa para a versão 2, mas o formulário continua enviando 1. A tipagem opcional permite que essa omissão passe na compilação.

**Reprodução confirmada no serviço e no navegador:** criar atividade, editar o título, recarregar a página e editar novamente. A segunda alteração retorna `VERSION_CONFLICT`, mostra “Esta atividade mudou enquanto você editava…” e mantém o título da versão 2. Nenhum outro usuário editou o registro. Na tela de calendário, a mesma omissão foi confirmada por inspeção do código; o cenário de navegador usou a lista de atividades.

**Correção recomendada:** transportar a versão atual nos dois caminhos e torná-la obrigatória nos tipos de atividades persistidas. Manter o conflito para concorrência real, com recarga explícita dos dados quando necessário.

**Critério de correção:** duas edições consecutivas pela lista e pelo calendário funcionam; dois editores realmente concorrentes continuam recebendo conflito no envio antigo. A [captura do navegador](evidence/revisao-implementacao/second-edit-rejected.png) e o teste correspondente estão preservados.

## F07 — Envio interrompido pode cancelar definitivamente o lembrete

**Código:** [notifications/delivery.ts](../../../apps/agenda-da-turma/src/features/notifications/delivery.ts), linha 214; [emails/dispatch.ts](../../../packages/emails/src/dispatch.ts), linhas 258–280.

O job converte qualquer retorno `skipped` do serviço de e-mail em cancelamento definitivo da notificação. O serviço compartilhado também usa `skipped` quando outra execução detém o envio (`claimed by another process`). Isso é uma condição transitória ou pendente de reconciliação, não necessariamente cancelamento do destinatário.

**Reprodução confirmada com banco real e e-mail em memória:** preparar uma notificação cuja execução foi interrompida, com a reserva externa vencida há mais de dez minutos e o e-mail interno ainda em `sending`. O novo job aceita a reserva externa, recebe `skipped` do envio interno e grava `canceled`. Mesmo depois de o registro interno ser resolvido como `failed`, uma execução posterior não tenta mais o lembrete. A caixa de saída permanece vazia.

A recuperação da camada de e-mail tem outra janela e pode levar um envio incerto para `unknown`. O teste não simula uma resposta de provedor real nem prova que um e-mail já entregue seria perdido; demonstra que o cancelamento externo impede recuperar um envio não concluído.

**Correção recomendada:** distinguir disputa temporária, resultado incerto e supressão definitiva. Coordenar as duas máquinas de estado e suas reservas, mantendo a notificação recuperável até haver um resultado definitivo. Reconciliar resultados incertos com o provedor antes de reenviar, para não introduzir duplicação.

**Critério de correção:** interrupções antes/depois da reserva e do envio não perdem lembretes; uma disputa transitória não vira cancelamento; cancelamento pelo usuário continua definitivo; confirmação de entrega impede reenvio.

## F06 — Retificação importada mantém dois prazos ativos

**Código:** [notices/write-repository.ts](../../../apps/agenda-da-turma/src/features/notices/write-repository.ts), linhas 30–40 e 120–138. Requisito: [proposta, seção 4.4](PROPOSTA.md#44-confiabilidade-como-parte-do-benefício-pago).

A impressão usada para encontrar possíveis duplicatas contém o prazo. Quando a escola muda a data, a nova ação não coincide com a anterior, e o fluxo de confirmação não procura uma obrigação correspondente com prazo diferente. O tratamento de retificação nas instruções da IA alcança o conteúdo da importação atual, sem reconciliar documentos já confirmados.

**Reprodução confirmada em PostgreSQL:** confirmar autorização com prazo em 14/09/2030; importar outro recado que retifica explicitamente esse prazo para 16/09/2030, para a mesma criança e obrigação. Com `allowDuplicates=false`, a confirmação aceita a nova ação sem alerta. As duas datas permanecem pendentes.

Foram usadas extrações válidas preparadas no teste, sem chamar o modelo. Isso isola a falha de reconciliação após a extração. A edição manual de uma ação existente tem versionamento; o problema é a nova importação de uma correção. Não se exige monitoramento automático do Teams ou Batista.

**Correção recomendada:** apresentar candidatas a retificação por criança, contexto e obrigação, sem depender da igualdade da data. Pedir confirmação para atualizar a ação existente, registrar antes/depois e substituir seus lembretes. Se a relação for ambígua, permitir manter ações separadas com decisão explícita.

**Critério de correção:** uma retificação confirmada produz uma obrigação ativa na nova data, com histórico preservado e lembrete anterior desativado. Duas obrigações legítimas parecidas não devem ser fundidas automaticamente.

## F03 — Exclusão apaga histórico de quem aceitou e depois recusou

**Código:** [activities/repository.ts](../../../apps/agenda-da-turma/src/features/activities/repository.ts), linhas 303–315 e 458.

Mudar o aceite para `false` conserva intencionalmente os estados individuais já criados. Porém, a exclusão pelo autor decide entre cancelamento e exclusão física consultando somente aceites atualmente verdadeiros.

**Reprodução confirmada em PostgreSQL:** outra família aceita, depois recusa pelo serviço de resposta; seu estado individual continua no banco. O autor exclui a atividade. Sem outro aceite verdadeiro, a exclusão física apaga também aquele estado e o histórico ligado à atividade.

**Condição:** a reversão do aceite foi exercitada pelo contrato do serviço. O fluxo de navegador não foi usado para essa transição. A falha depende de já ter havido uso por outra família e de não restar aceite verdadeiro.

**Correção recomendada:** decidir a preservação pelo uso/histórico efetivo de destinatários, incluindo estados individuais existentes, e não somente pelo aceite atual. Cancelar a atividade preservando esse histórico.

**Critério de correção:** aceitar, concluir/registrar estado, recusar e depois excluir pelo autor não apaga os dados individuais preservados. Atividades nunca utilizadas por terceiros podem continuar seguindo a política de exclusão definida.

## F05 — Recado confirmado não pode ser reutilizado para outro filho

**Código:** [parse-service.ts](../../../apps/agenda-da-turma/src/features/notices/parse-service.ts), linha 46; [parse-repository.ts](../../../apps/agenda-da-turma/src/features/notices/parse-repository.ts), linhas 70–74; [write-repository.ts](../../../apps/agenda-da-turma/src/features/notices/write-repository.ts), linha 100; [capture-form.tsx](../../../apps/agenda-da-turma/src/features/notices/components/capture-form.tsx), linha 186.

A reutilização da extração identifica o conteúdo por proprietário e hash, sem criança. O recado já confirmado retorna `alreadyConfirmed`, o formulário redireciona para a rotina e o backend não aceita aplicar esse resultado a outra criança.

**Reprodução confirmada em PostgreSQL:** confirmar o recado para A e solicitar a confirmação do mesmo documento com ação para B. A resposta indica sucesso já confirmado, com zero novas ações; B continua sem a obrigação. A inspeção da captura e da reserva confirma como a reimportação normal chega a esse estado.

O fluxo permite incluir ações de vários filhos antes da primeira confirmação. A lacuna é reutilizar o mesmo comunicado posteriormente para outro filho, uma situação comum quando o responsável organiza cada agenda separadamente.

**Correção recomendada:** separar reutilização da extração e idempotência das ações por criança. Permitir aplicar o resultado já revisado a outro perfil autorizado sem nova cobrança de IA e sem duplicar o que já foi criado para A.

**Critério de correção:** reimportar para B oferece sua revisão e salva suas ações; repetir para A não duplica nem cobra de novo; escopos do documento e dos perfis continuam protegidos.

## F08 — Conclusão antiga altera o estado da nova importação

**Código:** [parse-repository.ts](../../../apps/agenda-da-turma/src/features/notices/parse-repository.ts), linhas 167–175; [parse-service.ts](../../../apps/agenda-da-turma/src/features/notices/parse-service.ts), linhas 117 e 137.

Uma tentativa vencida pode ser retomada no mesmo registro com outro `billingRunId`. A persistência da extração confere o identificador da tentativa, mas `finishNoticeParse` atualiza somente pelo identificador do recado. Uma conclusão tardia da tentativa antiga pode alterar o estado da tentativa nova.

**Reprodução confirmada em PostgreSQL:** reservar processamento antigo, iniciar nova reserva após o vencimento de dez minutos e finalizar a tentativa antiga como falha. O registro conserva o identificador da nova tentativa, mas muda para `failed`.

**Condição:** execução antiga precisa continuar ou finalizar tardiamente após a recuperação. Não é o fluxo habitual de uma requisição curta. O teste força essa ordem no repositório e não espera um modelo real exceder a janela. Não foi reproduzida cobrança duplicada.

**Correção recomendada:** exigir identificador da tentativa e estado esperado em toda finalização. Conclusões antigas devem ser inócuas. Aplicar a mesma regra às transições de recuperação e compatibilizá-la com a reserva de cobrança.

**Critério de correção:** finalizar uma tentativa antiga não muda estado, resultado ou identificador da tentativa atual; a nova execução conclui normalmente e a reconciliação de crédito continua idempotente.

## F10 — Data de publicação no original é desconsiderada pelo validador

**Código:** [extraction.ts](../../../apps/agenda-da-turma/src/features/notices/extraction.ts), linha 17; [instruções do agente](../../../apps/agenda-da-turma/src/ai/notices/agent.ts), linha 26.

O agente permite calcular datas relativas quando a publicação foi informada no formulário ou está inequívoca no original. O validador, entretanto, elimina toda data relativa quando o campo separado `publishedAt` está vazio. O contrato da extração não carrega uma referência de publicação identificada no documento para resolver essa diferença.

**Reprodução determinística:** validar uma extração com prazo em 14/09/2030, origem relativa e trecho “Publicado em 13/09/2030. Levar material amanhã.”, com `publishedAt=null`. O resultado remove data e horário.

É uma perda conservadora de informação, e não invenção de prazo. O impacto é exigir preenchimento adicional mesmo quando a referência está no recado. O teste verifica o validador; não mede a precisão com que o modelo reconhece cabeçalhos.

**Correção recomendada:** representar a referência extraída e seu trecho de evidência, submetendo-a à validação e revisão; alternativamente, pedir confirmação explícita dessa referência na interface antes de calcular. Não eliminar a proteção contra datas relativas sem referência, nem voltar a usar a data atual implicitamente.

**Critério de correção:** referências válidas e confirmadas permitem calcular a data; referência ausente, contraditória ou ambígua continua deixando o prazo em aberto com orientação clara.

## Cobertura e confronto com a entrega

| Área implementada | Revisão realizada | Resultado e limite |
| --- | --- | --- |
| Rotina, atividades, calendário e formulários | Leitura dos contratos, consultas, componentes, versões e fluxo real de edição | F01, F03 e F06; histórico exige F02. A navegação nova não elimina falhas nos fluxos escolares anteriores. |
| Família, convites, compartilhamento e revogação | Escopo por criança, originais, participação em grupos e concorrência no banco | F02, F04 e F09 impedem considerar o isolamento concluído. |
| Captura de texto/anexo, IA e cobrança por importação | Entrada, arquivo, instruções, validação, hash, reservas, retomada e confirmação | F05, F06, F08 e F10. Não houve nova execução do corpus com provedor de IA. |
| Lembretes, resumo, push e job | Preferências, autorização, reservas, paginação, cancelamento, entrega e integração com pacote de e-mail | F07. Entrega real em dispositivos/provedor e scheduler de destino continuam sem homologação nesta revisão. |
| Planos, limites e downgrade | Gates do app e testes de autenticação/billing/e-mails afetados | Suites existentes passaram. Não houve checkout, cobrança, cancelamento ou webhook real de produção. |
| Conta, exportação, exclusão e privacidade | Código, autorização e testes existentes do ciclo de conta/dados | Sem novo achado reproduzido além dos escopos acima. Ausência de achado não equivale a auditoria jurídica ou teste de invasão completo. |
| Banco, migrações e pacotes compartilhados | Schema, transações, mudanças nos pacotes e execução em PostgreSQL local | Build/tipos e integração passaram. Não houve ensaio de migração em cópia de uma base de produção. |
| Interface, acessibilidade, CSP e performance | Revisão dos componentes alterados, diretrizes de interface e navegador móvel em desenvolvimento | F01 reproduzido em 390 × 844. Não houve medição de Core Web Vitals, leitor de tela ou matriz completa de navegadores. |
| Landing page, oferta, métricas, piloto e operação | Confronto entre proposta, implementação e documentação entregue | Instrumentos existem, mas não demonstram disposição a pagar, renovação nem qualidade em recados reais. |
| Teams e Batista ID | Conferência do fluxo entregue e da documentação de integração | Entrada manual assistida por texto/anexo. Conectores automáticos não foram implementados nem devem ser anunciados como disponíveis. |

As [diretrizes de interface da Vercel](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) foram consultadas como referência de revisão de interface. Os achados deste documento derivam do código local e das reproduções, não de inferências sobre concorrentes.

## Evidências e limites da conclusão

Os [comandos, resultados e arquivos de reprodução](evidence/revisao-implementacao/EVIDENCIAS.md) preservam a trilha desta revisão. Os testes usaram adultos, crianças, escola, assinatura e conteúdo fictícios em banco local; e-mails ficaram em memória/sandbox. O teste de navegador autenticou uma conta fictícia preparada no banco, sem desabilitar autenticação ou limite de cadastro.

O build de produção passou. O navegador usou o servidor de desenvolvimento existente com CSP ligada; o runtime de produção permanece pendente, conforme já registrado na entrega anterior. Os 15 casos de IA e o fluxo familiar completo executados durante a implementação são evidência anterior, não verificações repetidas nesta revisão.

## Ordem recomendada de correção

1. **Privacidade e acesso:** F02, F04 e F09, com regressões para histórico privado, originais mistos e revogação concorrente.
2. **Uso diário e confiança:** F01, F07 e F06, com duas edições reais, recuperação de envio interrompido e retificação entre importações.
3. **Consistência e esforço de uso:** F03, F05, F08 e F10, preservando histórico, reutilização por filho e segurança das datas.
4. Executar as suites existentes e novos testes que afirmem o comportamento corrigido. As reproduções desta revisão não devem entrar na suite de aceitação esperando o defeito.
5. Homologar runtime de produção, entrega e cobrança nos ambientes apropriados e então iniciar o piloto descrito em [PILOTO.md](PILOTO.md).

A implementação cobre grande parte da estrutura proposta, mas ainda não atende integralmente à confiabilidade prometida. A prioridade comercial imediata é corrigir essas falhas e validar a rotina com famílias; os resultados atuais não sustentam afirmar que o produto está pronto para venda em escala.
