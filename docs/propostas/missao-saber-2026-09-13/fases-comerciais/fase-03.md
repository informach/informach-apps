# Fase 03: Catálogo comercial autoral e progressão das quatro trilhas

[Voltar ao plano completo](../PLANO-VERSAO-COMERCIAL.md)

**Estado:** concluída e revisada.  
**Complexidade:** Muito alta; maior volume de produção de conteúdo.  
**Dependências:** Fases 01 e 02 concluídas. Reutilizar o acervo e a proposta existentes; verificar documentação oficial na implementação quando uma afirmação depender de regra ou edição vigente.

## Objetivo

Entregar uma biblioteca que sustente várias semanas de estudo, com progressão, prática e avaliações separadas. A meta mínima é 600 atividades autorais únicas, com cobertura demonstrável e sem exigir aprovação editorial da responsável.

## Tarefas de implementação

### F3.1: Fechar matriz curricular e cobertura

- [x] Implementar e verificar.

Mapear competências, pré-requisitos, dificuldade e estratégia para OLITEF N1, Canguru E/B e OBMEP N1 no 6º/7º ano. Auditar as 144 atividades existentes: conservar as adequadas, corrigir as insuficientes e preservar seus IDs/histórico. Trocar a associação apenas por habilidade por percursos ordenados e contextualizados para cada curso, com compartilhamento explícito da base comum. Diferenciar Canguru E para o 6º ano e B para o 7º no recorte atual, mantendo as faixas visíveis na oferta e sem anunciar cobertura de todos os anos.

### F3.2: Separar ensino, prática e avaliação

- [x] Implementar e verificar.

Cada item e família recebe finalidade explícita. Reservar pelo menos 96 itens inéditos para oito percursos de 12 questões: um diagnóstico e uma avaliação formativa por trilha. Manter famílias de avaliação distintas das famílias treinadas; controlar exposição entre trilhas e registrar quando já não há forma inédita disponível, sem simular uma medida nova.

### F3.3: Produzir a base comum

- [x] Implementar e verificar.

Meta inicial de 300 atividades no total curricular de base: representação numérica, frações, medidas, proporcionalidade, contagem e raciocínio. Distribuir entre descoberta guiada, aplicação independente e revisão. As missões devem ter objetivo, pré-requisitos, introdução, pistas graduais, explicação e tratamento dos erros pertinentes ao tipo.

### F3.4: Produzir os núcleos por olimpíada

- [x] Implementar e verificar.

Referência de distribuição adicional: 120 atividades contextualizadas de educação financeira/OLITEF, 90 de estratégias Canguru E/B e 90 de preparação OBMEP. Cobrir conexões e justificativas; não publicar questões oficiais com nomes ou números alterados. As cotas incluem os itens reservados atribuídos ao domínio e somam 600 IDs únicos, sem duplicar a base compartilhada.

### F3.5: Organizar missões e revisões

- [x] Implementar e verificar.

Organizar aproximadamente 60–80 missões/desafios de ensino e prática, além das avaliações. Descrever tempo estimado como estimativa, definir progressão explícita sem depender de nomes como sufixo -2, recuperar pré-requisitos e selecionar outras famílias nas revisões. Dar um próximo passo útil ao concluir, trocar de trilha ou esgotar conteúdo novo. Dosar o apoio do exemplo resolvido à tentativa independente, intercalar estratégias já estudadas e manter revisão espaçada, sem corações punitivos ou ranking público.

### F3.6: Conferir os lotes de autoria

- [x] Implementar e verificar.

Trabalhar em seis lotes aproximados de 100 itens, cada um com relatório de cobertura e conferência independente da solução antes de consolidar. Validar resposta a partir do enunciado, ambiguidade, distratores, pistas, unidades, rubricas, matemática das figuras e semelhança entre problemas. Checagens automatizadas não serão registradas como revisão humana da responsável. As 144 atividades existentes entram nessa contagem somente depois da auditoria; a expansão não exige descartar conteúdo válido nem contar seis cópias do mesmo molde como diversidade.

### F3.7: Validar o catálogo como produto

- [x] Implementar e verificar.

Gerar inventário por curso, habilidade, família, formato, finalidade e dificuldade; comprovar contagem única e ausência de vazamento entre treino e avaliação. Navegar todos os percursos, conferir exercícios gratuitos, enlaces, versões e disponibilidade. Corrigir problemas encontrados no review antes de concluir a fase.

## Áreas existentes a modificar

Os caminhos abaixo são pontos de partida da inspeção atual. A implementação deve confirmar o estado dos arquivos e preservar alterações da sessão de design.

| Arquivo | Motivo |
| --- | --- |
| [apps/missao-saber/src/features/content/catalog.ts](<../../../../apps/missao-saber/src/features/content/catalog.ts>) | cursos, seleção de missões e avaliação atual |
| [apps/missao-saber/src/features/content/finance.ts](<../../../../apps/missao-saber/src/features/content/finance.ts>) | conteúdo financeiro existente |
| [apps/missao-saber/src/features/content/geometry.ts](<../../../../apps/missao-saber/src/features/content/geometry.ts>) | geometria existente |
| [apps/missao-saber/src/features/content/combinatorics.ts](<../../../../apps/missao-saber/src/features/content/combinatorics.ts>) | contagem existente |
| [apps/missao-saber/src/features/content/reasoning.ts](<../../../../apps/missao-saber/src/features/content/reasoning.ts>) | raciocínio existente |
| [apps/missao-saber/src/features/content/feedback.ts](<../../../../apps/missao-saber/src/features/content/feedback.ts>) | devolutivas atuais |
| [apps/missao-saber/src/features/learning/recommendation.ts](<../../../../apps/missao-saber/src/features/learning/recommendation.ts>) | progressão e escolha de revisão |
| [docs/propostas/missao-saber-2026-09-13/ACERVO.md](<../../../../docs/propostas/missao-saber-2026-09-13/ACERVO.md>) | cobertura e limites das referências já baixadas |

Novos módulos e artefatos previstos, sujeitos à organização final da implementação:

- Matriz curricular e blueprint das avaliações.
- Módulos de conteúdo por curso/finalidade, evitando arquivos monolíticos.
- Validador e inventário do catálogo.
- Relatórios dos seis lotes de autoria.

## Integração com a sessão de design

Diagramas matemáticos são parte do conteúdo e precisam de dados corretos e descrição acessível. Seu estilo e os componentes básicos de desenho seguem as convenções da sessão de design. Mascote, ilustrações de marca e identidade não serão recriados aqui.

## Validação necessária

- [x] Pelo menos 600 atividades autorais únicas, com distribuição justificada por cobertura; atividades compartilhadas não contam duas vezes.
- [x] Todos os IDs, pré-requisitos e caminhos de curso resolvem, sem ciclos ou dependência de missão suspensa.
- [x] Conjuntos de famílias de ensino/prática e de avaliação são disjuntos; troca de curso não reapresenta item visto como inédito.
- [x] Todas as soluções objetivas são verificadas com cálculo independente; alternativas sem duplicação e respostas numéricas com unidade/tolerância coerentes.
- [x] Todas as atividades têm suporte compatível com seu tipo; justificativas têm rubrica e exemplo de solução.
- [x] Cada curso tem diagnóstico, percurso de estudo, revisão e avaliação final funcionais; diagnóstico orienta sem conceder domínio.
- [x] Retorno dias depois propõe revisão adequada; repetição de variante não infla a evidência de independência.
- [x] Nenhum PDF ou enunciado oficial do acervo é empacotado como conteúdo comercial.

Executar os testes pertinentes sobre a versão que contém a fase e registrar seus resultados. Usar banco descartável para cenários de integração; não modificar dados reais para simular estados de teste. A verificação com provedores da fase 04 e a publicação da fase 06 seguem as condições específicas do plano mestre.

## Review da fase

Revisar a implementação depois dos testes, incluindo caminhos de erro, autorização, concorrência, preservação de dados e consequências didáticas. Conferir também os estados de interface alterados em conjunto com os componentes de design.

Registrar cada achado, sua correção e a verificação correspondente. Não encerrar a fase com defeitos do escopo transferidos silenciosamente para a próxima. Esse review é parte da execução e não exige aprovação editorial da responsável.

O relatório será criado em `evidencias/fase-03.md`, com versão/diff, tarefas entregues, comandos/resultados, achados/correções e limitações. Não registrar revisão automática como revisão humana realizada por Helena.

## Critérios de conclusão

- [x] Matriz cobre o recorte contratado das quatro trilhas e explicita a base compartilhada.
- [x] Pelo menos 600 atividades autorais únicas, com contagem auditável; ajustes de distribuição são justificados pela cobertura, sem reduzir a meta total.
- [x] Pelo menos 96 atividades reservadas, 24 tarefas de justificativa progressiva e variedade de contextos/famílias.
- [x] Seis lotes conferidos, erros conhecidos corrigidos e review F3 sem achados pendentes.
- [x] Catálogo publicado pela versão do software, sem fila de aprovação manual.

## Entregáveis

- Biblioteca autoral comercial.
- Matriz e inventário de cobertura.
- Oito percursos de avaliação reservada.
- Progressão explícita das quatro trilhas.
- Relatórios de lotes e review F3.

Concluídos os critérios e o review, avançar para a [fase 04](fase-04.md).

