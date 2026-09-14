# Plano da versão comercial do Missão Saber

Data: 13/09/2026. **Estado: concluído; fases 01 a 06 implementadas, revisadas e publicadas.**

Objetivo: deixar o Missão Saber pronto para contratação e estudo em família, com conteúdo autoral suficiente, cobrança real em produção e acompanhamento durante o uso. Helena fará a primeira compra Família e validará o produto com os filhos depois da entrega. Essa compra e a validação pedagógica posterior não são condições para encerrar a implementação.

Este plano incorpora a decisão de remover o fluxo editorial que nunca foi usado e a existência de outra sessão responsável pela identidade visual e pelo design. As regras de aprovação prévia do PRD e da proposta original ficam substituídas pelas decisões abaixo para esta nova etapa.

## Decisões e alcance da entrega

| Tema | Decisão para esta versão |
| --- | --- |
| Público e cursos | 6º e 7º anos; OLITEF N1, OBMEP N1, Canguru E para o 6º e B para o 7º. Quatro trilhas com base comum compartilhada. |
| Conteúdo | Pelo menos 600 atividades autorais únicas, incluindo as atividades atuais que passarem pela conferência. Fontes oficiais servem para pesquisa de competências e formatos. |
| Disponibilidade | Conteúdo incluído na versão fica disponível conforme plano e perfil. Missões com problemas podem ser suspensas pontualmente; publicar não exige aprovação manual. |
| Qualidade | Conferência de autoria, soluções e didática durante a implementação, testes pertinentes, review por fase e full review. Isso não equivale a uma revisão humana realizada pela responsável. |
| Família | Até três estudantes, com progresso próprio e uso simultâneo em dispositivos diferentes. Compra e administração pertencem ao responsável. |
| Planos | Preservar Individual a R$ 29,90/mês ou R$ 299/ano, para um perfil; Família a R$ 44,90/mês ou R$ 449/ano, para até três. Preservar amostra gratuita. |
| Provedores | Reutilizar Railway, PostgreSQL, Redis, Sentry, Stripe e SendGrid já configurados. Stripe de teste no local e real em produção. |
| Identidade visual | A outra sessão é responsável por marca, estilos, componentes visuais e assets. Este plano entrega funcionalidade e sua integração com esse trabalho. |
| Publicação | Preparar e publicar a versão comercial completa, sem campanhas, convites ou divulgação. Manter a preferência atual de não indexar; noindex não restringe acesso ao endereço público. |
| Validação com os filhos | Uso real depois da entrega, com relatos, acompanhamento familiar e correções graduais. Sem fila de aprovação do catálogo. |

Esta entrega conclui o recorte comercial de 6º/7º definido para os próximos passos. Os demais anos e níveis do currículo original, oferta para escolas, funcionamento offline e tutor por IA continuam no roadmap de expansão. Não são necessários para esta versão, nem devem aparecer na oferta como recursos já disponíveis. O motor de correção dos novos exercícios será determinístico; a versão não depende de OpenRouter para avaliar respostas.

## Ponto de partida da implementação

A primeira versão possuía conta do responsável, perfis, quatro trilhas, 24 missões e 144 atividades; pistas, explicações, laboratórios de barras/malha/grupos, revisão espaçada, diagnóstico, simulados, caderno, relatos e relatório familiar. A implementação comercial ampliou essa base para 61 missões e 604 atividades únicas e concluiu a arquitetura de produção.

A inspeção encontrou pontos que mudam a ordem e o alcance do trabalho:

- A exigência editorial está distribuída entre interface, início de sessões, validação transacional e seleção de recomendações/avaliações. Sua remoção precisa preservar as regras de assinatura.
- O modelo de atividade atual oferece alternativas, resposta textual e resultado booleano. Resposta numérica, ordenação e reflexão precisam de contratos próprios e compatibilidade com sessões antigas.
- As avaliações atuais reutilizam itens das aulas. Medir transferência exige problemas e famílias reservados, com controle de exposição.
- A progressão usa associação por habilidade e convenções de identificadores. A biblioteca maior precisa de percursos explícitos.
- Relatos, relatório e controles administrativos já existem. Serão ampliados, evitando uma segunda implementação desses fluxos.
- Há alterações visuais em andamento no mesmo app. Arquivos compartilhados precisam de integração deliberada antes de publicação.

O [relatório de produção](RELATORIO-PRODUCAO.md) documenta a versão comercial publicada e sua verificação remota.

## Sequência das fases

Cada linha abaixo é uma fase de implementação, detalhada em arquivo próprio. São **41 tarefas**, todas concluídas e verificadas.

| Fase | Resultado principal | Dependência | Complexidade | Detalhamento |
| --- | --- | --- | --- | --- |
| 01 | Disponibilidade do catálogo sem aprovação editorial | Estado atual do repositório | Alta | [6 tarefas](fases-comerciais/fase-01.md) |
| 02 | Motor e experiência dos novos formatos didáticos | Fase 01 | Alta | [7 tarefas](fases-comerciais/fase-02.md) |
| 03 | Catálogo comercial autoral e progressão das quatro trilhas | Fase 02 | Muito alta | [7 tarefas](fases-comerciais/fase-03.md) |
| 04 | Assinatura Família e jornada completa de uso | Fase 03 | Alta | [7 tarefas](fases-comerciais/fase-04.md) |
| 05 | Acompanhamento familiar e correção durante o uso | Fase 04 | Alta | [7 tarefas](fases-comerciais/fase-05.md) |
| 06 | Integração comercial, publicação e full review | Fases 01–05 e design integrado | Alta | [7 tarefas](fases-comerciais/fase-06.md) |

A ordem de conclusão é **01 → 02 → 03 → 04 → 05 → 06**. Os novos formatos vêm antes da produção em escala: isso permite criar a biblioteca já no contrato definitivo. Pesquisa curricular, preparação dos testes de cobrança e o trabalho visual podem avançar em paralelo quando não alterarem contratos ainda instáveis; isso não dispensa as dependências para concluir cada fase.

### Fase 01: disponibilidade sem aprovação editorial

Substituir aprovação obrigatória por disponibilidade conforme plano, perfil e suspensão explícita. Centralizar a regra, preservar auditoria e sessões antigas, adaptar mensagens e manutenção administrativa. A compra e o estudo não dependem de Helena revisar uma trilha.

**Entrega verificável:** uma base sem aprovações editoriais permite compra e estudo autorizado; uma suspensão é respeitada mesmo após atualização do conteúdo.

### Fase 02: novos formatos e experiência didática

Adicionar resposta numérica, ordenação acessível e justificativa formativa ao formato de alternativas. Integrar exploração, correção, feedback, persistência, retomada e relatórios. Respostas abertas não recebem acerto ou domínio inventado.

**Entrega verificável:** exemplos de todos os formatos funcionam de ponta a ponta, inclusive por teclado/celular, sem vazamento de solução em avaliações.

### Fase 03: catálogo comercial autoral

Concluir a matriz de competências, produzir e conferir a biblioteca, separar avaliações e definir progressão das quatro trilhas. Publicar pelo software, sem depender de fila editorial.

**Entrega verificável:** inventário auditável de pelo menos 600 atividades, percursos completos, soluções conferidas e problemas de avaliação reservados.

### Fase 04: jornada Família e assinatura

Concluir conta → assinatura → perfis → estudo, validar três estudantes e homologar compra, renovação, falha, mudanças e cancelamento com a Stripe de teste. Conferir entrega de e-mails e preservação dos dados.

**Entrega verificável:** jornada completa com o provedor, além dos testes locais existentes; produção fica preparada para a compra real da responsável.

### Fase 05: acompanhamento e correção durante o uso

Simplificar relatos, ampliar a manutenção administrativa, tratar correções versionadas e oferecer relatório familiar útil. Medir uso e assinatura com definições explícitas e acesso restrito.

**Entrega verificável:** relato → análise → correção → retomada → relatório correto, sem interromper o restante do catálogo ou exigir revisão prévia.

### Fase 06: integração, full review e publicação

Combinar funcionalidade e design, concluir oferta e informações operacionais, revisar tudo, corrigir achados e publicar. Validar a versão efetiva na URL de produção e entregar o relatório final.

**Entrega verificável:** versão comercial saudável, contratos de compra claros, identidade final aplicada também na Stripe e roteiro para Helena começar.

## Biblioteca e critérios didáticos

A meta é de atividades únicas, não de telas, tentativas ou republicações por curso. As 144 atividades atuais entram na contagem apenas se forem adequadas; portanto, se todas forem aproveitadas, a expansão requer pelo menos 456 atividades adicionais.

| Área curricular | Referência de distribuição |
| --- | ---: |
| Base comum de matemática e raciocínio | 300 |
| Educação financeira e estratégias OLITEF | 120 |
| Estratégias Canguru E/B | 90 |
| Preparação OBMEP N1 | 90 |
| Total mínimo | 600 |

A distribuição pode ser ajustada pela matriz de cobertura, preservando o total mínimo e o atendimento das quatro trilhas. Compartilhar a base entre cursos não multiplica a contagem. Trocar apenas nomes e números de um problema não comprova diversidade nem autoria independente.

Dentro desse total, reservar **pelo menos 96 atividades** para oito percursos de 12 questões: diagnóstico e avaliação formativa de cada uma das quatro trilhas. As famílias desses problemas ficam separadas do treino. Exposição em outra trilha deve ser considerada; quando o banco inédito se esgotar, a interface identifica repetição/prática, sem alegar uma nova medição independente.

Organizar aproximadamente **60–80 missões ou desafios de ensino/prática**, além das avaliações, e **pelo menos 24 tarefas de justificativa progressiva**. Esses números se sobrepõem ao total de 600; não são acréscimos ocultos.

Cada percurso deve articular compreensão, exemplo/exploração, prática com apoio, aplicação independente e retomada espaçada. Pistas são graduais e os erros relevantes recebem explicação. Novos problemas devem exigir escolher uma estratégia, e não somente repetir uma conta. As justificativas oferecem rubrica e solução comentada; o registro da reflexão não prova correção sozinho.

A conferência ocorre em seis lotes de cerca de 100 itens. O primeiro lote calibra dificuldade, extensão das missões, formatos e ritmo de produção. Cada lote entrega solução conferida a partir do enunciado, análise de ambiguidade, famílias distintas, inventário e correções. Não estimar prazo fechado antes de medir esse primeiro lote: a autoria é o maior volume de trabalho do plano.

## Acordo com a sessão de identidade visual e design

| Área | Responsabilidade |
| --- | --- |
| Marca, mascote, paleta, fontes, ícones, favicon e ilustrações | Sessão de design |
| Tokens, estilos globais, componentes visuais e composição das telas | Sessão de design |
| Schemas, regras de acesso, correção, aprendizagem, dados, cobrança e métricas | Implementação funcional deste plano |
| Enunciados, pistas, soluções e dados matemáticos dos diagramas | Implementação de conteúdo; aparência segue o design |
| Player, Família, entrada, planos, relatos e administração | Integração coordenada: contratos funcionais aqui, apresentação com a sessão de design |
| Favicon, manifest e imagem dos produtos na Stripe | Publicação dos assets finais entregues pelo design |
| Review e testes finais | Versão que reúne os dois trabalhos |

Antes de começar a implementação, registrar o estado da branch e os arquivos em edição. O app e documentos ainda possuem alterações locais que devem ser preservadas. Se houver isolamento em branch/worktree, partir de uma base que inclua deliberadamente o código necessário, sem perder o trabalho não commitado.

Para telas compartilhadas, combinar propriedades e estados antes das alterações: carregando, vazio, erro, confirmação, acesso restrito, validação, feedback e conclusão. A sessão funcional não fará substituições amplas de TSX, CSS, componentes ou assets que apaguem o trabalho visual. Acessibilidade e responsividade fazem parte da integração.

As fases 01–05 podem ser verificadas em ambiente isolado enquanto o acabamento visual avança. A publicação comercial da fase 06 depende de integrar a entrega visual correspondente. Mudança visual posterior que altere interação exige nova verificação do fluxo afetado.

## Ciclo obrigatório de implementação e review por fase

1. Confirmar o ponto de partida, dependências, dados afetados e arquivos compartilhados com design.
2. Implementar as tarefas da fase, mantendo compatibilidade com dados e sessões existentes. Migrations são geradas pelo Drizzle e verificadas em banco descartável.
3. Rodar os testes que comprovam os comportamentos alterados: unidades para regras, PostgreSQL para transações/isolamento e navegador para jornadas.
4. Fazer review de código e comportamento, incluindo casos negativos, concorrência, permissões, didática e integração visual pertinente.
5. Registrar achados, corrigir todos os defeitos do escopo, repetir os checks afetados e revisar as correções.
6. Salvar evidências e resultado da fase; só então marcá-la concluída e avançar.

Cada fase terá um relatório futuro em `fases-comerciais/evidencias/fase-NN.md`, contendo versão/diff analisado, tarefas entregues, comandos e resultados, achados/correções e limitações. O full review terá relatório próprio em `fases-comerciais/evidencias/full-review.md`. Esses arquivos serão produzidos durante a execução; não são evidências já existentes.

Review técnico e conferência de autoria integram o trabalho de implementação. **Não haverá uma aprovação solicitada à responsável ao final de cada fase nem uma fila de aprovação pedagógica para publicar.**

Os testes atuais são ponto de partida. Usar os scripts existentes do app (`test`, `test:integration`, `e2e`, `typecheck`, `build`) e os testes dos pacotes compartilhados quando seus contratos forem alterados. O check global do monorepo deve ser reportado separadamente de checks focados. Não declarar aprovação global com base somente em um subconjunto limpo.

## Dependências e cuidados de arquitetura

| Ponto | Tratamento no plano |
| --- | --- |
| Trabalho simultâneo de design | Contratos de componentes, preservação dos diffs e integração antes do full review. |
| Novos tipos de resposta | Schema versionado, leitura de snapshots anteriores, migration aditiva e resultado formativo separado de booleano de acerto. |
| Suspensão e correção de conteúdo | Disponibilidade centralizada, decisão persistente, histórico imutável e filtro de evidências compartilhado com relatórios. |
| Banco de avaliações finito | Famílias reservadas, controle de exposição e repetição identificada sem falsa independência. |
| Autoria extensa | Matriz antes de volume, lotes conferidos e inventário automático. |
| Cobrança e e-mail compartilhados | Reaproveitar locks, segregação por app, idempotência e testes de regressão de Agenda/Cozya. Não recriar produtos e webhooks já existentes sem necessidade. |
| Validação externa de provedores | Distinguir fixtures, homologação real em modo de teste e verificação da configuração de produção. |
| Publicação e rollback | Backup, ensaio de migration, executor único e estratégia compatível com snapshots novos; não presumir que o binário anterior entende os novos tipos. |
| Dados e métricas familiares | Permissões no servidor, mínimos dados necessários e exclusão de respostas/caderno da telemetria externa. |
| Condições comerciais | Conferir texto com o comportamento implementado e fontes oficiais atuais quando necessário; não inventar dados da empresa ou decisões comerciais ausentes. |

## Quando a versão estará pronta para vender

Todos os itens abaixo devem estar atendidos na fase 06:

- [x] As seis fases têm entregas e reviews documentados, sem defeitos conhecidos pendentes no escopo.
- [x] Compra, recomendações e estudo funcionam sem aprovação editorial; suspensão e acesso pago continuam protegidos.
- [x] As quatro trilhas do recorte estão completas, com pelo menos 600 atividades únicas, avaliações reservadas e cobertura documentada.
- [x] Alternativas, números, ordenação, reflexão e laboratórios funcionam com correção/feedback apropriados, sem distorcer evidências.
- [x] Três perfis Família conseguem estudar e retomar em dispositivos diferentes, sem misturar progresso.
- [x] Checkout, Portal, renovação, falha, mudança de plano e cancelamento foram homologados com Stripe de teste; configuração real de produção está coerente.
- [x] E-mails críticos têm entrega verificada, links corretos e isolamento do app.
- [x] Relatos, correções versionadas e relatório familiar funcionam; métricas internas têm definições e acesso restrito.
- [x] Oferta, preços, faixa escolar, termos, privacidade e suporte correspondem ao que foi entregue.
- [x] O design da outra sessão está integrado, inclusive estados de erro, celular, teclado e assets de produto na Stripe.
- [x] Dados anteriores sobrevivem à atualização; backup, migrations, compatibilidade e recuperação foram verificados.
- [x] Full review, build/checks relevantes e smoke da versão publicada estão documentados.
- [x] URL pública, serviços, cron, webhooks e monitoramento estão operacionais, sem divulgação automática.
- [x] Relatório final e roteiro da primeira compra estão entregues, distinguindo software validado de aprendizagem ainda a observar.

A compra real da responsável ocorre depois desses critérios. A implementação não faz cobrança com o cartão dela para produzir evidência de teste. Também não depende de observar semanas de uso para ser encerrada.

## Roteiro depois da entrega

Helena entra com sua conta, escolhe Família, conclui a compra real e cria ou seleciona os perfis dos filhos. Cada estudante escolhe seu percurso, faz o diagnóstico e inicia as missões. A responsável acompanha o relatório e registra dificuldades percebidas; os filhos podem relatar problemas no contexto da atividade.

A primeira rodada de uso deve observar clareza dos enunciados, autonomia para operar o app, utilidade das pistas, dificuldade adequada e retomada de estudo. Com uma única família, esses registros são feedback qualitativo; não sustentam promessas de eficácia ou estimativas de conversão. Correções seguem o fluxo da fase 05, sem voltar a exigir aprovação do catálogo.

## Documentos de referência e acompanhamento

- [Proposta original](PROPOSTA.md), [currículo](CURRICULO.md), [estudo do Brilliant](BRILLIANT.md) e [política autoral](POLITICA-AUTORAL.md).
- [Acervo e lacunas de cobertura](ACERVO.md), usado como pesquisa, não como conteúdo a republicar.
- [Relatório da versão comercial](RELATORIO-IMPLEMENTACAO.md), [relatório de produção](RELATORIO-PRODUCAO.md) e [evidências por fase](evidencias/).
- [PRD histórico](../../../.compozy/tasks/missao-saber/_prd.md), [especificação histórica](../../../.compozy/tasks/missao-saber/_techspec.md) e [tarefas da implementação anterior](../../../.compozy/tasks/missao-saber/_tasks.md).
- [Runbook atual](../../../apps/missao-saber/PRODUCAO.md).

As seis fases foram concluídas. A próxima unidade de trabalho é a validação familiar descrita no roteiro, seguida dos ajustes observados durante o uso.
