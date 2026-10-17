> Atualização de 16/10/2026: projeto consolidado em `APPS/EDIFOTO`, com o design em `edifoto.pen`. As referências a Documents e à separação das cópias abaixo são históricas. Consulte o README para executar a versão atual. O patch em `entrega/` é um registro anterior e não deve ser reaplicado.

# EdiFoto — levantamento de pendências do projeto no pen

Data: 15/10/2026. Escopo: Editor, Assistente, Configurar IA, Caneta, Formas e componentes do arquivo `edifoto.pen`, comparados com o código original, a cópia em Documentos e a captura enviada pelo usuário.

## Conclusão

A atualização não foi entregue como aplicativo desktop validado. O projeto original em `C:\Users\julio\Desktop\CRIECOMHELENAEJULIO\APPS\EDIFOTO` continua separado do código novo em `C:\Users\julio\Documents\EdiFoto`. A captura é compatível com a interface original: não mostra Caneta, Formas, seleções, Carimbo, Desfoque nem o menu Filtro. Uma imagem sozinha não identifica o executável em execução.

Mesmo a cópia nova não reproduz integralmente o projeto no pen. Código compilado, teste com ponte nativa simulada e atalho criado não comprovam entrega no Electron.

Legenda: **novo** = existe na cópia de Documentos, falta entrega/validação desktop; **parcial** = há implementação, mas falta parte do fluxo projetado; **ausente** = não encontrado no código revisado; **existente** = já presente, não deve ser reimplementado.

## 1. Entrega e inicialização — prioridade máxima

| Pendência | Situação | Critério de conclusão |
|---|---|---|
| Aplicativo atualizado acessível pelo atalho | Pendente | Abrir pelo atalho e confirmar caminho do processo, versão/build e presença das ferramentas novas. |
| Inicialização do Electron no Windows | Não validada | Resolver a falha de acesso do runtime e abrir uma janela utilizável, sem desativar a sandbox. A tentativa de ACL não comprovou resolução. |
| Definição da cópia principal | Duas árvores de código | Integrar a versão aprovada ao destino de uso; evitar que o atalho abra silenciosamente a versão antiga. |
| Perfil, preferências e documentos | Novo perfil separado | Verificar acesso aos documentos existentes e às configurações; preservar os dados do usuário. |
| Testes nativos e revisão visual | Pendentes | Validar diálogos de arquivo, salvar/reabrir, exportar e provedores reais dentro do Electron. |

O patch em `entrega/edifoto-recursos.patch` é uma entrega de código, não uma atualização instalada. Conferir sua sincronização com as alterações posteriores do inicializador antes de aplicá-lo.

## 2. Editor e ferramentas

| Recurso projetado | Situação | O que falta |
|---|---|---|
| Caneta e Formas na barra lateral | Novo | Entregar na versão aberta; completar os itens das seções 3 e 4. |
| Seleção retangular, Laço e Varinha | Novo | Validar interação, tolerância, inversão, máscaras, exclusão e restrição de pintura no desktop. |
| Carimbo | Novo | Validar Alt+clique de origem, pintura, bloqueios e desfazer no desktop. |
| Pincel de desfoque | Novo | Validar pintura e histórico no desktop. |
| Menu Filtro | Novo | Entregar o menu e validar seus comandos. O pen mostra o menu fechado; não especifica um catálogo completo de filtros. |
| Remover fundo no dock | Parcial | Existe remoção por cor conectada aos cantos. Falta recorte automático que funcione em fotos com fundos complexos; não apresentar a heurística como segmentação por IA. |
| Buscar camadas | Ausente | Implementar a busca representada pelo ícone no cabeçalho de camadas. |
| Filtrar camadas | Ausente | Implementar o controle representado pelo ícone de filtro; o pen não define suas opções, que precisam ser concretizadas. |
| Status RGB · 8 bits | Ausente na interface | Exibir informação coerente com o documento/motor. O desenho não pede edição de perfis ou profundidade. |
| Status contextual de Caneta/Formas | Parcial | Mostrar traçado/forma ativa e instruções no local projetado; hoje parte das dicas está na barra superior. |
| Aba Ajustes | Diferença de organização | Ajustes existem em Propriedades. Alinhar nome e organização sem tratar os ajustes como funcionalidade ausente. |

## 3. Caneta

Já existe na cópia nova: criar pontos e curvas, concluir, fechar, cancelar, editar pontos de traçados finalizados, Canto/Suave, preenchimento, contorno, conversão em seleção e máscara, persistência e histórico.

| Pendência | Situação atual / conclusão esperada |
|---|---|
| Seletor de modo “Traçado” | Não existe o seletor mostrado no topo e no painel. O pen não abre suas opções; definir os modos antes de implementar alternativas. |
| Controle explícito “Alças: Vinculadas” | Existe comportamento associado a pontos suaves/Alt, mas não o controle de vincular/desvincular com estado visível. |
| Ctrl para mover ponto | A dica existe no pen; o tratamento de Ctrl no código não implementa esse movimento. Implementar o gesto e validá-lo. |
| Editar pontos durante o desenho | A edição completa está concentrada no traçado finalizado. Completar o fluxo de mover pontos/alças do traçado ainda em construção. |
| Aparência da seleção na barra superior | Os controles usam os padrões de criação, não a camada vetorial selecionada. Sincronizar os valores e aplicar a alteração ao alvo correto. |
| Painel contextual junto das camadas | Hoje os controles estão na aba Propriedades. Reproduzir o painel de Caneta com nome, modo, pontos, alças e conversão, mantendo a lista de camadas acessível como no pen. |
| Nome do traçado no painel | Renomear já é possível na lista; falta o campo no painel contextual projetado. |
| Destino de “Criar máscara” | Hoje aplica à camada abaixo. Tornar esse destino explícito e validar a operação, inclusive sem camada abaixo. |

## 4. Formas

Já existem na cópia nova: retângulo arredondado, elipse, triângulo, polígono, estrela e linha; criação por arraste; Shift/Alt; dimensões, raio, rotação, cores e alinhamento do contorno.

| Pendência | Situação atual / conclusão esperada |
|---|---|
| Seis botões visuais de formas | Hoje é uma lista suspensa. Implementar a grade de ícones com estado selecionado do painel projetado. |
| Barra superior completa | Falta apresentar raio, opacidade, rotação e alinhamento do contorno como no pen; parte já existe em Propriedades. |
| Opacidade própria do preenchimento | Falta permitir preenchimento a 80% com contorno opaco, como desenhado. A opacidade/preenchimento da camada não substitui esse controle. |
| Oito alças de transformação | Há quatro alças de canto na ferramenta Mover. Faltam alças laterais para redimensionar largura/altura independentemente. |
| Transformação com Formas ativa | A transformação final depende da ferramenta Mover; o pen mostra a forma selecionada com alças dentro do fluxo de Formas. |
| Posição X/Y consistente | O código usa o centro da camada. Conferir e padronizar a referência dos campos com o desenho, deixando claro o ponto de origem. |
| Painel contextual junto das camadas | Reunir formas, transformação e aparência no painel projetado, com camadas abaixo. |
| Edição pela barra superior | Corrigir a mesma separação entre padrões de criação e aparência do objeto selecionado existente na Caneta. |

## 5. Assistente

| Recurso projetado | Situação | O que falta |
|---|---|---|
| Selecionar céu / máscara automática | Ausente como seleção semântica | Implementar identificação real do céu e máscara correspondente. Máscara de gradiente ou seleção por cor não equivale ao fluxo desenhado. |
| Remoção automática de fundo | Parcial | Conectar uma segmentação adequada e permitir refinar a máscara. |
| “Comparar lado a lado” na mensagem | Parcial | Há diálogo/comando de comparação na cópia nova; falta o botão contextual na resposta e sua ligação ao resultado daquela ação. |
| “Desfazer tudo” na mensagem | Parcial | O turno já agrupa alterações em um passo do histórico, mas falta o botão contextual com vínculo seguro ao turno. Não deve desfazer edições posteriores sem critério. |
| Camada de Curvas no exemplo | Parcial/novo | Há ajuste de luminosidade por cinco valores e interpolação linear. Validar o fluxo real solicitado ao agente; não afirmar que existe um editor completo de curvas não desenhado. |
| Execução real via agentes | Não validada nesta entrega | Verificar solicitação, execução, logs, erros, cancelamento e undo dentro do Electron com os provedores configurados. |

Chat, caixa de mensagem, ações rápidas, nova conversa, interrupção e registros de ferramentas já existem. A recomendação de mesclagem depende da resposta do agente, não de um texto de demonstração fixo.

## 6. Configuração de IA

| Recurso projetado | Situação | O que falta |
|---|---|---|
| Claude Desktop: “Conectar” | Parcial | Hoje fornece configuração para copiar; falta o fluxo guiado e retorno de estado equivalente ao desenho. Não prometer conexão automática sem suporte verificado. |
| Configuração manual JSON / TOML | Parcial | Há JSON e comandos CLI; falta apresentar o trecho TOML anunciado no projeto. |
| Estado “Conectado” | Parcial | A detecção local verifica registros de configuração. Validar conexão operacional e distinguir configurado de efetivamente conectado. |
| Code/Codex/API no chat | Existente, validação pendente | Confirmar execução real e mensagens úteis para ausência de cliente, autenticação e falhas. |
| Confirmação de exclusão e permissão de salvar/exportar | Existente, validação pendente | Testar a aplicação das opções nas ferramentas reais. |
| Chave criptografada localmente | Existente | `safeStorage` já cifra a chave e recusa gravar quando a criptografia não está disponível; falta validar no desktop em uso. |

## 7. Recursos existentes que não precisam ser refeitos

- Mover, recortar, girar, pincel, borracha, texto, conta-gotas, mão, zoom e ajuste à tela.
- Camadas, visibilidade, bloqueio, renomeação, duplicação, ordenação e máscaras básicas.
- Mesclagem com 27 modos, grupos, prévias, opacidade e preenchimento da camada.
- Histórico, desfazer/refazer, ajustes básicos, antes/depois, abertura, salvamento e exportação.
- Estrutura do Assistente, servidor MCP e configurações de IA.

Isso registra presença no código, não certifica ausência de bugs. Os componentes Layer Row e Slider do pen são estruturas de interface, não funcionalidades adicionais. A foto de praia e os textos de exemplo também não são recursos faltantes.

## 8. Ordem de implementação e aceite

1. **Entrega:** abrir e identificar a versão nova no Electron, corrigir o inicializador/atalho e preservar documentos/configurações.
2. **Caneta e Formas:** completar os controles e gestos acima; validar criar → editar → desfazer/refazer → salvar → reabrir → exportar.
3. **Editor:** busca/filtro de camadas, status contextual e organização fiel dos painéis; validar seleções, Carimbo e Desfoque.
4. **IA:** segmentação de céu/fundo, ações na mensagem, configuração manual e conexão operacional.
5. **Aceite visual e nativo:** comparar cada tela com o pen em tamanhos de janela diferentes, verificar conteúdo cortado, foco, atalhos e exportação; só então marcar como entregue.

Não há necessidade de redesenhar mais telas antes de resolver essas pendências.

## Evidências e limites

Canvas consultado via MCP: `bi8Au` (Editor), `rBzuF` (Assistente), `C4d2iN` (IA), `rYvXS` (Caneta), `d3Labk` (Formas), componentes `y7tkKz` e `Fknq8`.

Código principal: `src/renderer/src/editor/ToolRail.tsx`, `DrawingTools.tsx`, `VectorControls.tsx`, `Viewport.tsx`, `LayersList.tsx`, `RightPanel.tsx`, `StatusBar.tsx`, `BlendSection.tsx`; `src/renderer/src/state/assistant.ts`; `src/renderer/src/lib/vector.ts` e `selection.ts`; `src/main/aiSettings.ts` e inicializador Electron.

Este levantamento é uma inspeção do desenho/código e da captura. Não é um novo teste completo do aplicativo. Os testes anteriores com integração simulada e a compilação não substituem o aceite nativo. Este relatório atualiza a situação de entrega descrita em `IMPLEMENTACAO.md`, inclusive a tentativa posterior de ajuste de permissões que não confirmou a abertura do Electron.
