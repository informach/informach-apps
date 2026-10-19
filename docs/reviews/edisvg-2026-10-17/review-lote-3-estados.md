# Review incremental — lote 3: estados, dados e eventos

Data: 18/10/2026. Em implementação, não é fechamento do lote 3 nem full review final.

## Implementado até este incremento

- `@informach/edi-motion/behavior`: contratos v1, inputs número/booleano/texto/cor/enum/gatilho, máquinas/camadas/estados/transições, blend 1D, máscaras, pesos e composição override/additive. Estados e instâncias de execução não ficam acoplados ao mascote.
- Avaliação pura/transacional: prioridades e empate por ordem autoral, gatilhos distribuídos uma vez às camadas, saídas temporizadas com divisão do passo, blends e interrupção a partir da pose mista. Ciclos e excesso de trabalho recusam o avanço inteiro. Um passo de 0–10 segundos pode emitir no máximo 512 eventos.
- Bindings tipados, conversão numérica e escrita reversa explícita/invertível; destinos concorrentes são recusados. Sessões independentes mantêm dados fora do documento. Callback não pode iniciar escrita reentrante; atualização normal de props ocorre após a notificação.
- Eventos de timeline com payload tipado e política definida para ida/volta/loop; buscar/reset não representa travessia. Blend 1D emite apenas pela animação dominante; transição emite pelo destino. Ordenação de empates usa comparação ASCII, sem depender do locale da máquina.
- Documento v9 com `artboard.behavior`, transação comum da UI/MCP, referências revalidadas e remapeamento de bindings/listeners/máscaras ao duplicar pranchetas. Excluir objetos/clips referenciados é recusado, não apaga lógica silenciosamente.
- Editor React de grafo, máquinas/camadas/estados/transições/inputs e formulários de bindings/listeners/eventos. Arraste de nó tem rascunho, cancelamento e uma edição; coordenadas também são editáveis por teclado/campos. Coleções de dados paginam em 50 itens. Navegação fica no workspace, não no histórico do conteúdo.
- Testar usa o mesmo runtime SVG público, inputs ao vivo, diagnóstico de estado/transição e janela explícita de 50 eventos. Fechar/resetar o teste não modifica a arte. SVG é renderizado estruturalmente em React, sem inserir HTML arbitrário.
- Runtime interativo público, listeners de ponteiro/teclado/foco, textos via DOM seguro, validação de linhas dinâmicas e lifecycle compartilhado com o player de timeline: pausa/visibilidade/movimento reduzido/descarte. Tráfego de inputs não reinicia o relógio.
- HTML interativo independente e escolha da máquina/encaixe. Formatos somente de animação exigem consentimento ao descartar interação. JSON continua preservando tudo. Conteúdo autoral é escapado e o HTML permanece limitado a 10 MB.
- Adapter React 19 em `/react`, peer opcional: callbacks atualizados via Effect Events, inputs em lote atômicos, handle tipado e descarte. O host fornece geometria JSX imutável/confiável com identidades do compilador; não é um loader de SVG arbitrário nem adapter React Native.
- MCP possui inspeção paginada e leitura de valores em trechos com metadados de sessão/revisão; não há truncamento oculto ou canal privilegiado de edição.

## Verificações e achados

- 119 testes do editor e 25 do núcleo passaram antes do teste adicional de exportação deste incremento; atualizar contagem ao concluir a rodada atual.
- Jornadas reais de navegador passaram separadamente: autoria de estados/dados/eventos + Undo/reabertura, sessão de teste sem editar o documento, download de HTML interativo sem rede, bindings/listeners/eventos/limites/descarte do runtime, e adapter React em StrictMode de desenvolvimento com atualização de props/callbacks sem recriar relógios.
- Corrigidos nomes acessíveis de selects/textarea, roteamento do modo Estados, consentimento de conversão, restauração do workspace e configuração JSX do package. A fixture React usa o define documentado do Vite para compilar a variante de desenvolvimento; não injeta globals/shims no navegador.
- Testes passaram a buscar recursivamente `src/**/*.test.js/ts`, para não deixar a nova organização por funcionalidade fora da regressão.
- Tipos do editor/núcleo e build aprovados nos incrementos; rodada conjunta final, Electron v9, check transversal e review completo do lote ainda necessários.
- Lockfile revisado e instalação congelada aprovada. React é opcional para o núcleo puro; não entra no main ou no bundle SVG por importar o adapter separadamente.

## Ainda em execução

Layouts responsivos, view models compostos/listas/referências, lógica independente em instâncias aninhadas, biblioteca/exportação React pronta para consumo e demais critérios do lote. O compilador recusa lógica de componentes não suportada, em vez de omiti-la. Fontes/assets/semântica avançada continuam ligados ao lote 5. Não há rig/malha, paridade `.riv`, React Native homologado, colaboração, acervo real ou full review final certificado.
