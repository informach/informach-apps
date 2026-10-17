# Plano de implementação do EdiSVG

Data: 16/10/2026. Base de planejamento: código 0.5.4 e quatro pranchetas de `edisvg.pen`.

Atualização de execução — Etapa 01: inventário de 90 requisitos e baseline automatizada realizados (check, 59 testes e build aprovados). Referência visual principal: `i0JJ4Q`. A etapa permanece **em validação**, pois a inicialização Electron falhou sem relatório e a instância no navegador exibe 0.5.3. Homologação nativa e capacidade de equipe ainda pendentes. Entregáveis, evidências, decisões e backlog E02.1: [Relatório da etapa 01](audits/etapa-01/RELATORIO.md).

## Objetivo e limites

Transformar os recursos apresentados nas pranchetas em funcionalidades editáveis, persistentes e reproduzíveis no player. A presença de uma tela, botão ou demonstração não significa conclusão funcional.

Referências inspecionadas pelo MCP pen.dev:

- `i0JJ4Q`: EdiSVG — Animar.
- `uHqQn`: EdiSVG — Máquina de estados.
- `gbxz9`: EdiSVG — Exportar para web.
- `zg8Qe`: EdiSVG — Animar · modelo padronizado.

As duas pranchetas de animação apresentam o mesmo conjunto de textos funcionais. Consolidar seus requisitos; decidir na etapa 1 qual composição visual será a referência de cada área. Não implementar duas interfaces independentes.

Este documento é planejamento, não certificação do produto. Foram lidos o documento de design, README, manifesto e trechos do modelo, animação, interface, ferramentas de IA e exportação. Não foram executados testes nem homologação visual/nativa nesta atividade. Itens descritos como existentes ainda precisam de validação.

## Diagnóstico inicial

| Área | Evidência atual | Trabalho restante |
| --- | --- | --- |
| Desktop e arquivos | Electron, projeto versão 2, abrir/salvar, histórico e testes existentes | Homologação nativa, política de recuperação e migrações futuras |
| Design | Importação SVG limitada, objetos, transformações, ferramentas e vértices | Completar seleção/manipulação, grupos, recursos e artboards |
| Animação | Três animações fixas, poses globais calculadas e marcadores | Animações livres, trilhas e interpolação por objeto/propriedade |
| Rig | Sobreposição visual e ferramentas indisponíveis | Ossos, vínculos, restrições, IK e malha reais |
| Estados | Fluxos predefinidos para o mascote | Grafo editável, camadas, blends, condições e listeners configuráveis |
| Exportação | HTML, SVG animado e dados do projeto | Player compartilhado, pacote, React, Lottie e equivalência de execução |
| Assistente | Integração básica e ferramentas limitadas | Operações de objetos, animações, rig, estados e exportação com validação |

O README contém descrições históricas que se contradizem com incrementos posteriores. O diagnóstico da etapa 1 deve prevalecer sobre status antigos. O código atual confirma que `poseAt` usa movimentos predefinidos e que o formato restringe as animações a Parado, Acenar e Pular.

## Regras de execução

1. Trabalhar em uma etapa ativa por vez, dividida em incrementos demonstráveis. Investigações futuras podem ser registradas sem expandir a entrega atual.
2. Cada tarefa terá ID, referência de design, responsável, dependência, critério de aceite, evidência e situação.
3. Situações: A fazer → Em andamento → Em validação → Concluído; usar Bloqueado com motivo e ação necessária.
4. Preservar os recursos existentes. Toda alteração de formato exige migração, arquivos de exemplo e testes de leitura/gravação.
5. UI e IA devem usar as mesmas operações do documento, com validação e histórico. Reprodução e seleção não devem poluir o histórico de edição.
6. Editor e player devem compartilhar a avaliação da cena. Construir essa base antes das exportações avançadas.
7. Fechar cada etapa com demonstração, testes relevantes, registro de limitações e revisão do plano restante. Empacotar marcos homologáveis.
8. Aprovação de produto valida decisões e resultado; atividades técnicas reversíveis dentro da etapa não precisam parar a cada operação.

## Etapas sequenciais

### 01 — Inventário, baseline e decisões de produto

- Mapear todos os comandos das pranchetas, incluindo ícones, menus e abas sem comportamento especificado.
- Classificar cada requisito como existente a validar, parcial, demonstrativo ou ausente, vinculando evidências de código e de execução.
- Comparar visualmente as duas pranchetas Animar e fixar referência de layout, espaçamentos, seleção e estados de controles.
- Rodar verificações existentes e registrar falhas anteriores ao trabalho; homologar abrir, salvar, fechar, cancelar, desfazer e refazer no Windows.
- Definir projetos de referência: desenho simples, SVG importado, Zezé completo e documento com múltiplas pranchetas.
- Definir equipe, capacidade, plataformas/navegadores de aceite e orçamento de desempenho antes de assumir datas.

Dependência: nenhuma. Aceite: backlog rastreável, baseline verificável e decisões pendentes com responsável. Primeira entrega: relatório de lacunas e tarefas do próximo incremento.

### 02 — Documento extensível e integridade dos projetos

- Definir entidades e IDs estáveis para artboards, objetos, recursos, animações, trilhas, chaves, rig, máquinas, inputs, bindings e eventos.
- Separar dados persistentes de estado de sessão e de reprodução.
- Introduzir migrações incrementais a partir das versões 1 e 2; preservar poses/movimentos antigos quando possível e explicitar conversões sem equivalência.
- Consolidar operações reversíveis, edição agrupada, cancelamento de gestos e validação de referências.
- Validar escrita atômica, proteção contra perda de alterações, erros de disco e recuperação optativa. Manter a abertura em branco como comportamento atual até decisão explícita.

Dependência: 01. Aceite: documentos antigos e novos reabrem sem perda; ações manuais e por IA são reversíveis; nenhuma referência quebrada passa silenciosamente.

### 03 — Completar edição vetorial e hierarquia

- Validar seleção, Caneta, formas, texto, edição de vértices, pintura, contorno, duplicação, exclusão, ordenação, visibilidade e bloqueio existentes.
- Completar seleção múltipla, agrupamento/desagrupamento e movimentação na hierarquia preservando a pose mundial.
- Completar alças de escala/rotação, pivôs e sincronização entre canvas e inspetor; respeitar transformações e bloqueios herdados.
- Definir matriz de SVG aceito, ampliar importação conforme os projetos de referência e mostrar incompatibilidades sem destruir a arte atual.
- Consolidar modos Design/Animar, navegação, zoom, mão, menus, atalhos e Ajuda com comportamento real.

Dependência: 02. Aceite: criar e importar arte, editar um membro isoladamente, desfazer e reabrir preservando geometria e hierarquia.

### 04 — Artboards, recursos e composição aninhada

- Implementar abas Artboards e Recursos, criação/renomeação/duplicação/remoção de artboards e configuração de dimensões.
- Definir catálogo inicial de recursos com importação, referências, uso e política de exclusão.
- Instanciar artboards aninhados, como o Balão, com transformações locais, recorte e referências estáveis.
- Impedir ciclos de composição; definir propriedade dos dados, sincronização temporal e seleção da instância versus origem.

Dependência: 03. Aceite: dois artboards e um Balão aninhado persistem corretamente; alterações e exclusões têm efeitos previsíveis.

### 05 — Motor de animação por objeto

- Criar, renomear, duplicar e remover animações livres; configurar duração, FPS e reprodução loop, ping-pong e uma vez.
- Criar trilhas por objeto/propriedade e chaves com tempo e valor: X, Y, rotação, opacidade, escala X/Y.
- Definir comportamento entre chaves, fora do intervalo, em tempo fracionário e nos limites de ciclo.
- Implementar avaliação determinística compartilhável com o player, sem dependência da interface.

Dependência: 04. Aceite: duas animações de nomes novos movimentam objetos diferentes; uma mesma amostra temporal sempre produz a mesma pose; salvar/reabrir mantém resultados.

### 06 — Timeline, curvas e recursos de visualização

- Implementar seleção e edição de chaves, mover/copiar/excluir, zoom temporal, régua, playhead e área de trabalho.
- Integrar transporte, navegação quadro a quadro, timecode, duração e gravação por chave automática e diamantes no inspetor.
- Implementar Linear, Suave, Elástico e Degrau; curva Bézier editável e cópia da representação quando aplicável.
- Integrar modos Chaves/Curvas a dados reais; curva elástica deve ter representação coerente com o motor, sem fingir equivalência com uma única Bézier.
- Implementar onion skin com poses reais, prévia limpa e controles de sobreposição de ossos/malha conforme disponibilidade.

Dependência: 05. Aceite: editar uma curva altera o movimento; alternar animações mantém chaves independentes; autochave, undo e cancelamento são consistentes.

### 07 — Ossos, pivôs e vínculos

- Criar, selecionar, nomear e remover ossos, hierarquias e pose de referência.
- Vincular objetos aos ossos e animar transformações locais, distinguindo ajuste do rig e pose animada.
- Mostrar ossos reais e integrar seleção na hierarquia, canvas, inspetor e timeline.

Dependência: 06. Aceite: animar Braço D e Antebraço D move apenas a cadeia esperada; rig, vínculos e pose de referência sobrevivem ao salvamento.

### 08 — Restrições e IK

- Implementar alvo de mão, cadeia IK, limites, força/influência e comportamento para alvos inalcançáveis.
- Implementar restrições Distância, Transformar e Seguir caminho, definindo espaço local/global e ordem de avaliação.
- Detectar dependências circulares e definir quais parâmetros serão animáveis.

Dependência: 07. Aceite: arrastar o alvo move o membro; 0%, 80% e 100% de força têm efeitos corretos; restrições convivem com animação sem instabilidade.

### 09 — Malha e deformação

- Provar primeiro a abordagem de deformação/renderização e seu custo em cena representativa.
- Criar/editar malha, vínculos e pesos, pose de referência e visualização da malha.
- Integrar deformação aos ossos, animação, seleção e persistência; prever tratamento de topologia inválida.

Dependência: 08. Aceite: torso e braços deformam de forma controlada; reabrir mantém pesos; resultados são reproduzíveis pelo núcleo de execução.

### 10 — Morph, solo e eventos de timeline

- Animar vértices, inclusive alças, para morph da boca; validar compatibilidade de topologia entre chaves.
- Implementar grupos solo de expressões e trilha discreta de filho ativo.
- Criar eventos nomeados, como `acenou`, posicionados na timeline e com dados de evento definidos.
- Especificar disparo ao avançar, retroceder, buscar, repetir e fazer ping-pong; evitar duplicações acidentais.

Dependência: 09. Aceite: boca faz morph, expressão solo muda no quadro esperado e eventos chegam uma vez conforme a política definida.

### 11 — Máquina de estados editável

- Criar/remover/renomear máquinas, estados e transições; desenhar e reorganizar o grafo.
- Implementar Entry e Any State; associar animações livres aos estados.
- Criar inputs booleanos, numéricos e gatilhos; editar condições, prioridade, duração, easing, saída e interrupção.
- Suportar saída imediata e ao terminar, com transição de 200 ms suave no exemplo.
- Definir consumo de gatilhos e conflitos de transições; persistir o grafo e sua disposição visual.

Dependência: 10. Aceite: criar uma máquina diferente da demonstração sem editar código; testar transições, interrupção e retorno após uma animação única.

### 12 — Camadas simultâneas e blend 1D

- Executar Corpo, Rosto e Piscar simultaneamente, com escopo de objetos/propriedades definido.
- Implementar blend 1D de expressões Triste/Feliz pelo input humor de 0 a 1.
- Definir prioridade, composição e pesos quando duas camadas atuam sobre a mesma propriedade.
- Garantir loop independente de Piscar e comportamento consistente durante transições do Corpo.

Dependência: 11. Aceite: Zezé acena, pisca e muda expressão simultaneamente sem sobrescritas inesperadas.

### 13 — Dados, listeners e teste de interação

- Criar view model com número, booleano e texto, valores iniciais, bindings e validação de tipos.
- Separar nome do projeto do campo textual `nome` do personagem; ligar humor e acenando aos destinos apropriados.
- Configurar listeners: entrar/sair do Corpo, clique que dispara clicar e movimento no Artboard para olhos seguirem cursor.
- Definir coordenadas sob zoom/escala e hit testing; oferecer operação equivalente por teclado/toque onde aplicável.
- Implementar Testar com reset, inputs ao vivo, destaque de estado/transição e log temporal de eventos, isolado da edição.

Dependência: 12. Aceite: os quatro listeners são configurados pelo usuário e funcionam com bindings; encerrar teste não modifica a arte original.

### 14 — Runtime web e pacote interativo

- Extrair a camada pública de execução usando o mesmo núcleo de avaliação do editor.
- Carregar `.edisvg`, selecionar artboard/máquina, reproduzir e destruir instâncias sem vazamentos.
- Implementar o componente `edisvg-player`, acesso a inputs e inscrição/remoção de callbacks de eventos.
- Entregar pacote com documento, player, recursos e página de exemplo opcional; documentar carregamento via servidor local e hospedagem.
- Comparar poses, morph, malha, ossos, estados, blends, listeners, artboards aninhados e eventos com a prévia do editor.

Dependência: 13. Aceite: pacote funciona em hospedagem estática sem serviços remotos; testes de equivalência passam nos navegadores definidos. Funcionamento sem rede não implica abertura direta por `file://`; este fluxo será atendido pelo HTML único.

### 15 — Modal de exportação, HTML único e componente React

- Implementar opções de máquina inicial, ajuste proporcional, texto alternativo e página de exemplo.
- Respeitar reduzir movimento: usar Parado quando disponível e fallback configurado para projetos sem esse estado. Pausar fora da tela e definir retomada.
- Mostrar resumo real de animações/listeners, destino, progresso, cancelar, falhas e tamanhos medidos.
- Gerar HTML único com recursos embutidos e o mesmo runtime, validado sem conexão e por abertura direta.
- Gerar componente React com props ligadas a inputs, callbacks de eventos e limpeza de recursos ao desmontar.
- Produzir pacote interativo, React e HTML a partir de um projeto real, sem dependência oculta do mascote de demonstração.

Dependência: 14. Aceite: três formatos reproduzem o mesmo projeto; opções têm efeito observável; exportações canceladas/falhas são tratadas corretamente.

### 16 — SVG animado e Lottie JSON

- Definir matriz de compatibilidade por propriedade e técnica; identificar conversões diretas, amostragem e limitações.
- Gerar SVG animado por CSS, sem JavaScript ou estados, usando a animação selecionada e movimentos reais.
- Gerar Lottie JSON válido, uma animação por arquivo e sem máquina de estados; verificar em renderizador independente.
- Investigar antecipadamente a viabilidade de converter malha, rig e morph. Quando necessário, oferecer conversão explícita ou recusar a exportação com diagnóstico claro.
- Nunca omitir silenciosamente um recurso nem considerar um JSON de projeto uma exportação Lottie.

Dependência: 15. Aceite: exemplos suportados reproduzem o resultado esperado; incompatibilidades são identificadas antes da conclusão. Cobertura parcial exige decisão explícita de escopo e pendência registrada.

### 17 — Assistente integrado às novas capacidades

- Evoluir ferramentas para objetos, artboards, recursos, animações, chaves, rig, estados, bindings e exportação.
- Implementar leitura antes de editar, operações agrupadas, progresso, cancelamento, erros claros e histórico compartilhado.
- Atualizar instruções do assistente conforme capacidades efetivas; verificar pedidos reais com cada provedor disponível.
- Preservar o isolamento e limites existentes da integração.

Dependência: 16. Aceite: assistente executa uma tarefa completa sobre projeto criado pelo usuário, com resultado verificável e desfazer. Integrar operações pequenas durante etapas anteriores; esta etapa faz a homologação completa.

### 18 — Homologação final e entrega

- Comparar as telas implementadas com as quatro pranchetas; conferir menus, ícones, tooltips, foco, atalhos e estados vazios/de erro.
- Executar regressão de documentos antigos, edição, persistência, IA e cinco formatos de exportação.
- Medir desempenho em cenas pequenas/médias/grandes, estabilidade de memória e responsividade; definir limites publicados a partir dos resultados.
- Validar acessibilidade, contraste, leitura por teclado e reduzir movimento no editor e nas saídas.
- Atualizar Ajuda, exemplos, matriz de compatibilidade e notas de versão; gerar pacote desktop e validar em ambiente Windows limpo.

Dependência: 17. Aceite: matriz de requisitos sem itens prometidos silenciosamente ausentes, zero defeitos críticos conhecidos e evidências de homologação anexadas. Instalador e assinatura são decisões adicionais de distribuição, não requisitos expressos nas pranchetas.

## Rastreabilidade das pranchetas

| Origem | Conjunto funcional | Etapas |
| --- | --- | --- |
| Animar + modelo padronizado | Menus, modos, arquivo, ferramentas, seleção, transformação, hierarquia | 01–03, 18 |
| Animar + modelo padronizado | Artboards, Recursos, Balão aninhado | 04, 14 |
| Animar + modelo padronizado | Animações, FPS, transporte, chaves, curvas, autochave e onion skin | 05–06 |
| Animar + modelo padronizado | Ossos, alvo, IK/força, distância, transformar e seguir caminho | 07–08 |
| Animar + modelo padronizado | Malha, morph de vértices, solo e eventos | 09–10 |
| Animar + modelo padronizado | View model, Testar, Assistente e Exportar | 13–17 |
| Máquina de estados | Grafo, Entry, Any State, inputs e transições | 11 |
| Máquina de estados | Corpo/Rosto/Piscar e blend 1D | 12 |
| Máquina de estados | Quatro listeners, olhos seguem cursor, teste e log | 13 |
| Máquina de estados | Componente web, API de inputs e callbacks | 14 |
| Exportar para web | Pacote, React, HTML, SVG CSS e Lottie | 14–16 |
| Exportar para web | Máquina inicial, ajuste, movimento reduzido, pausa, texto alternativo, exemplo, destino e tamanho | 15–16 |

## Marcos de produto

| Marco | Após etapa | Demonstração obrigatória |
| --- | --- | --- |
| M1 — Editor estruturado | 04 | Criar/importar arte, organizar objetos e artboards, salvar e reabrir |
| M2 — Animação real | 06 | Criar movimento com chaves e curvas por objeto |
| M3 — Personagem articulado | 10 | Rig, IK, malha, boca, expressões e evento de timeline |
| M4 — Interação configurável | 13 | Corpo, Rosto e Piscar simultâneos com os quatro listeners |
| M5 — Publicação web | 16 | Cinco formatos disponíveis com compatibilidade explícita |
| M6 — Entrega homologada | 18 | Assistente, documentação e pacote final validados |

## Prazos e responsabilidades

Não assumir data de conclusão antes do inventário e da capacidade da equipe. Estimar cada incremento após detalhar critérios de aceite, usando cenário otimista, provável e pessimista. Reestimar ao final de cada marco. Malha, composição de animações e exportação Lottie exigem investigação técnica antes de prazo comprometido.

- Produto/usuário: prioridades, decisões de comportamento e aceite dos marcos.
- Gestão do projeto: backlog, dependências, riscos, evidências e atualização de previsão.
- Desenvolvimento: contratos de dados, implementação, migrações e testes.
- Design e qualidade: fidelidade visual, usabilidade, acessibilidade e homologação.

Uma mesma pessoa pode acumular papéis. Os nomes e a disponibilidade serão registrados na etapa 01. Planejar incrementos de poucos dias quando possível, sem converter essa preferência em promessa de prazo.

## Riscos e ações

| Risco | Ação de controle |
| --- | --- |
| UI demonstrativa confundida com recurso pronto | Critérios baseados em criar, editar, salvar e reproduzir dados novos |
| Migração perde dados ou altera movimentos antigos | Fixtures de cada versão, migrações explícitas e testes de equivalência |
| Editor e player divergem | Núcleo compartilhado desde a etapa 05 e comparação temporal automatizada |
| Custo ou inviabilidade de malha/Lottie | Provas de viabilidade antes da entrega; matriz pública de suporte |
| Camadas, bindings e restrições entram em conflito | Ordem determinística, escopos e validação de ciclos |
| Crescimento indefinido do escopo | Registrar solicitações novas com impacto; não incluí-las silenciosamente |
| Tamanhos 22 KB/38 KB da prancheta viram promessa | Tratar como valores ilustrativos até medição; revisar orçamento real |
| Importação SVG executa conteúdo externo | Manter validação, sanitização e rejeições explícitas |
| Testes automatizados substituem homologação nativa | Exigir evidência Windows e navegador nos marcos pertinentes |

## Checklist de conclusão de cada etapa

- [ ] Requisitos e dependências identificados por ID.
- [ ] Fluxo funciona com projeto novo e com arquivo importado aplicável.
- [ ] Interface e comportamento conferidos com a referência.
- [ ] Persistência, desfazer/refazer e cancelamento verificados.
- [ ] Testes pertinentes, check e build aprovados para alterações de código.
- [ ] Verificação visual/nativa realizada ou pendência explícita; etapa não marcada concluída prematuramente.
- [ ] Migrações e compatibilidade verificadas quando houver mudança de formato.
- [ ] Editor e player equivalentes para recursos já expostos no runtime.
- [ ] Limitações, erros conhecidos e evidências registrados.
- [ ] Próximo incremento delimitado e previsão atualizada.

## Modelo de tarefa

`E05-01 — Criar animação com nome e duração livres`

- Situação: A fazer.
- Responsável: a atribuir.
- Origem: painel ANIMAÇÕES das pranchetas Animar.
- Dependências: documento extensível e artboard selecionável.
- Entrega: operação de criação, interface e persistência.
- Aceite: criar duas animações, alternar entre elas, desfazer/refazer e reabrir sem perda.
- Evidências: teste relevante e demonstração no aplicativo.
- Estimativa e riscos: preencher após detalhamento.

## Próxima ação

Concluir as pendências de homologação registradas no relatório E01 e iniciar o incremento E02.1 de contrato de documento e migrações, já detalhado naquele relatório. A parte documental de E02.1 pode avançar; E01 e E02 não devem ser declaradas homologadas enquanto os fluxos nativos estiverem pendentes. O restante permanece planejado até sua vez.
