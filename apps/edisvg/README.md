# EdiSVG Desktop

Aplicativo Electron baseado em `edisvg.pen`, com a separação do Ediaula: `main`, `preload`, `renderer` e `shared`. A interface existente foi reaproveitada em JavaScript nativo; não foi reescrita em React.

## Executar e distribuir

Requer Node.js 22+ e Windows x64 para o pacote portátil atual.

```sh
npm install
npm run dev
```

No PowerShell, use `npm.cmd` se scripts estiverem bloqueados. `npm run dev` abre o Electron; `npm run build` compila; `npm start` abre a compilação. Em produção não há servidor web.

```sh
npm run package
npm run shortcut
```

O executável atual é `release/EdiSVG-0.5.3-win32-x64/EdiSVG.exe`. Os pacotes ficam em pastas por versão para permitir uma nova entrega sem sobrescrever uma instalação aberta. Distribua **a pasta inteira**, com DLLs, resources e licenças. O atalho `EdiSVG.lnk` é atualizado na raiz do projeto; cópias antigas desse atalho fora do projeto precisam ser substituídas. O pacote é portátil, sem instalador ou assinatura digital.

## Estrutura

- `src/main`: janela Electron, arquivos, clientes de IA e servidor MCP.
- `src/preload`: API restrita entre Electron e interface.
- `src/renderer/src`: editor, exportações e painel do assistente.
- `src/renderer/public`: mascote vetorial original.
- `src/shared`: animação, validação de projetos e ferramentas de IA.
- `scripts`: verificações, pacote e atalho.

## Claude Code e Codex

**Assistente** abre o chat no editor. Escolha o provedor e, opcionalmente, o modelo. Modelo vazio usa o padrão do cliente. Faça login nos clientes oficiais pelo terminal antes de usar o painel (`claude` ou `codex login`). O aplicativo usa esses logins existentes sem armazenar ou copiar credenciais. A conversa fica em memória; **Nova conversa** limpa o histórico; **Parar** encerra a solicitação.

Claude recebe apenas ferramentas MCP do EdiSVG. Codex roda em diretório separado com sandbox `read-only` e sem configuração global. Isso não é isolamento completo de leitura do computador. Ambos recebem instruções para atuar nas ferramentas do editor, sem flags de bypass de permissões.

Para um agente externo, mantenha o EdiSVG aberto e registre o servidor no cliente desejado:

```sh
claude mcp add --transport http edisvg http://127.0.0.1:47322/mcp
codex mcp add edisvg --url http://127.0.0.1:47322/mcp
```

O editor não altera configurações globais automaticamente. MCP escuta apenas em `127.0.0.1:47322`, recusa Origin de navegador e valida parâmetros. A porta é diferente da usada pelo Ediaula. Programas locais podem acessar o servidor enquanto o editor está aberto.

Ferramentas: `get_overview`, `set_transform`, `set_animation`, `rename_project`, `seek_frame`, `add_keyframe`, `undo`, `redo`. O histórico é compartilhado entre edições manuais e da IA: desfazer atua na última edição do projeto, independentemente de quem a fez. A integração usa CLIs, não chamadas diretas às APIs pagas. Login, conectividade e limites da conta afetam as respostas.

## Projetos e escopo

**Arquivo** abre/salva projetos `.edisvg` com diálogos nativos. Ctrl+O abre, Ctrl+S salva no arquivo atual (ou pede um destino no primeiro salvamento) e Ctrl+Shift+S abre Salvar como. O título mostra o nome do arquivo e um ponto quando há alterações pendentes. Abrir outro projeto ou fechar a janela oferece Salvar, Descartar e Cancelar. Cancelar o diálogo de salvamento também cancela o fechamento/substituição. Falhas de gravação mantêm o documento pendente; a escrita usa um temporário no mesmo diretório, sincroniza seu conteúdo e só então substitui o destino. As exportações HTML, SVG e JSON continuam usando Salvar como.

O `.pen` é a referência de design e permanece intacto; não é o formato de projeto do aplicativo. O editor inclui timeline, reprodução, zoom, propriedades globais, estados e exportação. A cópia local guarda nome, transformações, animação selecionada, marcadores dessa animação, modos de reprodução e inputs. Arquivos antigos continuam aceitos. O histórico em memória guarda até 100 edições; abrir outro projeto limpa esse histórico. Ctrl+Z desfaz, Ctrl+Shift+Z ou Ctrl+Y refaz. Dentro de campos de texto, os atalhos continuam editando o texto.

Ainda faltam desenho vetorial, deformação de malha, IK, edição individual de camadas/transições e blend facial. Chaves são marcadores sem interpolação independente. A curva é uma visualização. Exportações usam movimentos predefinidos; React, Lottie e runtime externo não estão implementados.

## Verificação

```sh
npm run check
npm test
npm run build
```

Os testes cobrem animação, estados, exportações, validação, argumentos/eventos dos clientes e MCP real via HTTP. `--smoke-test`, com `EDISVG_USER_DATA` apontando para uma pasta de teste, verifica preload, painel e edição/desfazer na janela Electron sem consumir créditos de IA.

Nesta máquina a rede bloqueou o npm. As dependências foram copiadas do Ediaula, sem modificá-lo, por `scripts/copy-local-dependencies.mjs`. Esse script serve apenas para recuperação local; instalações normais usam `npm install`.

## Plano de construção

As entregas seguem dependências técnicas. Cada incremento deve ter testes relevantes, build e pacote atualizados. Não marcar uma etapa como concluída apenas porque a tela existe. IA deve chamar as mesmas operações usadas pela interface e respeitar o histórico do projeto.

| Etapa | Entrega | Critério de conclusão | Situação |
| --- | --- | --- | --- |
| 1. Base confiável | Histórico compartilhado, documento versionado, salvar/abrir, recuperação e indicação de alterações | Reabrir sem perda de dados; desfazer/refazer edições manuais e da IA; cancelar operações sem modificar arquivo | Em andamento |
| 2. SVG e camadas | Importação segura de SVG, objetos com IDs, grupos, seleção, visibilidade, bloqueio e transformações por objeto | Importar um SVG real, editar um elemento, salvar/reabrir e exportar preservando os demais | Implementa??o b?sica; valida??o nativa pendente |
| 3. Animação real | Trilhas por propriedade, keyframes com valores, interpolação, duração e múltiplas animações | A timeline calcula a mesma pose no editor e na exportação; cada animação mantém suas próprias chaves | Planejada |
| 4. Estados e interação | Criação de estados/transições, condições, inputs, eventos e prévia | Montar uma interação nova sem alterar código e reproduzi-la no player | Planejada |
| 5. Rig e deformação | Hierarquia de ossos, pivôs, IK e, depois, malha/morph | Manipular um membro sem mover o personagem inteiro e salvar o rig | Planejada |
| 6. IA ampliada | Ferramentas de objetos, trilhas e estados; progresso, cancelamento e edições agrupadas | Claude e Codex completam uma tarefa real por ferramentas, com desfazer e mensagens de erro verificadas | Planejada; integração básica já existe |
| 7. Exportação e distribuição | Player web fiel ao editor, pacote interativo, instalador e revisão de desempenho/acessibilidade | Projeto exportado funciona offline e instalação Windows passa pelos fluxos essenciais | Planejada; pacote portátil básico já existe |

### Incremento 1.1 — implementado

- Desfazer/refazer compartilhado entre interface e IA, com botões, atalhos e menu desktop.
- Limite de 100 edições, isolamento das cópias e descarte de redo ao criar uma nova edição.
- Abertura de projeto limpa o histórico; abertura durante uma resposta da IA é impedida.
- Cópia local e arquivo preservam os campos atuais do documento, incluindo modos e inputs.
- Validação de propriedades antes da edição; falha de armazenamento local é informada.
- Testes de histórico, persistência e compatibilidade, além da suíte existente.

### Incremento 1.2 — implementado; validação nativa pendente

1. Marcadores por animação, preservados na alternância, no histórico e nos arquivos. Projetos anteriores migram ao abrir, sem perder as chaves que já guardavam.
2. A máquina de estados usa sua animação de prévia sem trocar a animação selecionada no documento.
3. Ctrl+S, Salvar como, nome/caminho e indicador de alterações pendentes.
4. Escrita atômica e proteção ao fechar/abrir, incluindo cancelamento e erro de gravação. Operações de arquivo são serializadas; ferramentas MCP são recusadas temporariamente enquanto há diálogo de arquivo. Descartar remove a cópia local pendente para não recuperá-la na próxima abertura.
5. A recuperação local restaura os dados atuais do documento como projeto sem arquivo associado, evitando sobrescrever automaticamente um arquivo de uma sessão anterior. Não é recuperação garantida contra falha do disco nem substitui o salvamento em arquivo.

### Incremento 2.1 — implementado; validação nativa pendente

**Novo projeto (Ctrl+N)** cria um documento vazio de 1080 × 1080, sem vínculo com o arquivo anterior. Alterações pendentes passam pelo diálogo Salvar/Descartar/Cancelar. O painel permite adicionar um retângulo ou usar **Importar SVG (Ctrl+I)**.

A importação substitui a arte atual e pode ser desfeita. Aceita grupos, paths, retângulos, círculos, elipses, linhas, polígonos e texto simples. Camadas importadas possuem seleção, nome, visibilidade, bloqueio e transformações individuais. Grupos bloqueados impedem editar as transformações dos descendentes. O SVG original é preservado como dado no projeto; somente o modelo validado é renderizado.

Scripts, eventos e referências externas são recusados. Gradientes, máscaras, imagens, símbolos/use, estilos complexos e outros recursos ainda não são suportados; nesses casos a importação informa o erro e mantém a arte anterior. A validação automatizada cobre o modelo, persistência, histórico, exportação e rejeições antes do parser; o ciclo completo com o parser XML e os diálogos ainda precisa ser validado na janela Electron.

O formato de projeto agora é versão 2: esta versão abre arquivos da versão 1, mas aplicativos anteriores não abrem o novo formato. As exportações HTML e SVG usam os objetos do documento atual. As animações continuam globais e predefinidas; estados interativos do mascote não são aplicados aos SVGs importados.

### Próximo incremento — 2.2

Ampliar a compatibilidade de importação e implementar manipulação direta no canvas, duplicação e agrupamento. Depois, avançar para trilhas e keyframes por objeto.

### Publicação na web

Hoje é possível exportar HTML independente e SVG animado para hospedagem ou incorporação em uma página. O arquivo `.edisvg` é o projeto editável, não um player web. Um runtime JavaScript que carregue esse arquivo, com animações e estados equivalentes ao editor, pertence à etapa 7. Não há importação/exportação de `.riv` nem compatibilidade com o runtime do Rive.

Antes de considerar a etapa 1 concluída, ainda é necessário testar os diálogos e fechamento na janela Windows e uma solicitação real de cada provedor. Os testes automatizados exercitam o controlador de arquivos com diálogos simulados; a execução Electron e os modelos não foram validados neste ambiente restrito.

A validação visual/nativa continua pendente. A curva de interpolação e os ossos ainda representam o protótipo. O mascote de demonstração mantém sua lista de camadas ilustrativa; projetos novos e SVGs importados usam a hierarquia real descrita acima.

## Ferramentas de objetos (0.4.0)

Em projetos novos ou SVGs importados, o painel de camadas permite adicionar retângulo, círculo, linha e texto. Selecione um objeto para editar preenchimento e contorno (cor hexadecimal ou `none`), espessura, texto e tamanho da fonte. Duplicar (Ctrl+D), excluir (Delete), trazer à frente e enviar ao fundo respeitam os grupos e bloqueios. A ordem muda dentro do mesmo grupo. Todas essas operações participam do histórico e do arquivo de projeto; duplicar grupos gera novos IDs para os descendentes.

Posição, escala e rotação continuam no inspetor. Arrastar/redimensionar no canvas, desenhar paths e criar grupos ainda estão pendentes. Estas ferramentas ainda não estão expostas ao assistente de IA. Suíte: 27 testes; validação visual nativa pendente.


### Edição de caminhos (0.5.1)

Na versão 0.5.3, clique no nome do objeto na hierarquia para renomear diretamente. Enter ou clicar fora confirma; Esc cancela. F2 na linha focada também inicia a edição. O campo de nome foi removido do inspetor; a alteração suporta Desfazer e respeita bloqueios.

A partir da versão 0.5.2, o aplicativo inicia com um documento Sem título em branco, no modo Design. Para continuar um projeto salvo, use Arquivo → Abrir projeto (Ctrl+O); a sessão anterior não é restaurada automaticamente.

O inspetor apresenta quatro botões de tipo de vértice: reto, espelhado, independente e assimétrico. O modo ativo fica destacado; cada botão tem descrição e suporte a teclado.

No desktop, clique em **Design** ou **Editar formas** para disponibilizar os vetores reais do mascote de demonstração. Em um projeto próprio, desenhe uma forma ou importe um SVG. Selecione a forma no canvas ou na hierarquia e pressione **Enter**, dê duplo clique ou use **Editar vértices** no inspetor. Formas primitivas são convertidas em caminhos; a conversão pode ser desfeita.

O painel segue a disposição da prancheta `i0JJ4Q`: hierarquia e animações à esquerda, canvas central, propriedades e opções de vértices à direita e timeline inferior. A hierarquia editável representa os objetos reais do SVG; os nomes e ossos fictícios da demonstração não são usados como objetos editáveis.

Arraste âncoras ou alças Bézier, edite X/Y no inspetor e escolha alças retas, espelhadas, assimétricas ou independentes. Alt durante o arraste desacopla uma alça. Duplo clique próximo de um segmento insere um ponto preservando a curva; os botões do inspetor também inserem e excluem pontos. Delete/Backspace remove o vértice selecionado, setas movem um pixel local (Shift: dez). É possível escolher contornos, abrir/fechar e inverter sua direção. **Concluir**, Enter ou Esc sai da edição; Esc durante um arraste cancela apenas esse arraste.

Cada gesto confirmado gera uma única entrada no histórico. Arrastes cancelados, perda de foco e troca de ferramenta descartam a prévia. Edições respeitam bloqueios dos grupos e são salvas e exportadas como SVG. A conversão preserva IDs, pintura e transformações. Arcos e elipses usam aproximações cúbicas Bézier em segmentos de até 90 graus. Textos não são convertidos em contornos nesta versão. A edição é geométrica; animação independente de vértices, rig e malha continuam fora do escopo implementado.

Referência de interação: [Rive — Edit Vertices](https://rive.app/docs/editor/fundamentals/edit-vertices). Modelo e conversões ficam em `src/shared/pathGeometry.js`; inspetor e gestos em `src/renderer/src/pathEditor.js`, com testes próximos aos módulos. A suíte inclui importação dos caminhos reais do mascote, subdivisão de curvas, gravação/reabertura, histórico, coordenadas sob zoom/rotação e cancelamento de gestos. A versão agora aparece junto à marca EdiSVG para distinguir executáveis antigos. Feche a versão aberta antes de iniciar outra: o bloqueio de instância única pode apenas trazer a janela antiga para frente.

### Ferramentas de desenho

Em um projeto novo ou SVG importado, use **V** para selecionar e arrastar, **R** para retângulo, **O** para círculo, **L** para linha e **T** para inserir texto com um clique. Edite o texto no painel direito. **Shift** mantém proporções iguais ao desenhar; **Esc** cancela o gesto. Cada desenho ou arraste pode ser desfeito com **Ctrl+Z**. Camadas bloqueadas não podem ser movidas.

Use **H** para mover a área de trabalho e **Z** para ampliar (Alt + clique reduz). O botão Centralizar restaura a posição e o zoom. Pan e zoom não alteram a arte exportada.

Na versão 0.4.2, a barra segue o nó `m5eAtQ` do `edisvg.pen`: nove ícones vetoriais extraídos da referência, grupos separados, largura de 56 px, botões de 38 px e ícones de 18 px. **P** ativa a Caneta: clique para segmentos retos, arraste ao criar um ponto para curvas Bézier, pressione Enter para concluir ou clique no primeiro ponto para fechar (mínimo de três pontos). Backspace remove o último ponto; Esc cancela. Caminhos em construção não entram no projeto nem no histórico antes da confirmação.

Osso, Malha e Restrições estão representados conforme o desenho, mas indisponíveis: criação de rig, deformação e IK ainda não existem no motor. O comando Mostrar ossos do canvas permanece uma visualização da demonstração. A barra informa o motivo da indisponibilidade ao receber foco ou clique; não simula uma edição de rig.

A implementação separa a definição e acessibilidade da barra (`toolbar.js`), seus estilos (`toolbar.css`), os ícones exportados (`toolbarIcons.js`), os gestos do canvas (`canvasTools.js`) e a Caneta (`penTool.js`). Operações de criação e movimentação passam por `editScene`, com validação antes de aplicar o novo estado. Testes próximos aos módulos cobrem caminhos, atalhos, disponibilidade, histórico, cancelamento e descarte de ouvintes. O smoke test desktop verifica também a ordem e as dimensões da barra. Sua execução visual permanece pendente neste ambiente devido à restrição de acesso do sandbox do Windows aos binários Electron.
