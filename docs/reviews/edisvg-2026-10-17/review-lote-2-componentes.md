# Review intermediário — componentes reutilizáveis

18/10/2026. Lote 2 continua aberto; este incremento não encerra os lotes seguintes nem substitui o full review final.

## Contratos implementados

Documento v6, com migração de v1–v5. Uma instância referencia uma prancheta original e conserva tamanho, encaixe (`contain`/`cover`/`stretch`), clip opcional, velocidade, deslocamento de tempo e overrides de pose-base/pintura/texto. Alterações na origem se propagam; overrides não modificam a origem. Prancheta ou clip referenciados não podem ser excluídos sem remover as referências. Desagrupar não apaga silenciosamente uma instância.

O painel React de artboards insere componentes; o inspector React configura a instância e prepara overrides num rascunho, aplicado em uma única transação reversível. Locks herdados impedem alteração também nesse painel. UI e MCP compartilham os comandos `component/create` e `component/update`. Leituras MCP de overrides são paginadas e indicam truncamento/comprimento; valores completos usam chunks explícitos.

O compilador produz uma cena SVG com viewports aninhados e um blueprint runtime v2. IDs de autoria e caminhos de instâncias permanecem estáveis em `sources`; os símbolos expandidos são locais ao bundle. `findObject(objectId, instancePath)` resolve a identidade de autoria. O runtime continua aceitando o blueprint v1. Relógios aninhados seguem a fase do pai e respeitam FPS, modos, velocidade e offset; o mesmo `evaluatePlayback` atende editor, HTML e amostragem SVG. Instâncias estáticas não possuem relógio próprio. O tempo da composição pertence à timeline externa; exportar componentes animados exige selecionar uma animação por objeto, sem inventar uma duração oculta.

## Achados corrigidos

1. CSS genérico de `svg` afetava dimensões/clipping dos viewports internos. Agora os estilos de tamanho/overflow do host ficam restritos ao SVG externo; E2E mede a transformação real e o clipping, não apenas atributos declarados.
2. Um DAG pequeno podia replicar geometria ou chaves excessivas antes da validação. O preflight memoizado calcula custo expandido e deltas exatos dos overrides antes de clonar; limites: 2000 objetos, 32 níveis estruturais, 8 referências aninhadas, 4 milhões de caracteres de atributos, 100 mil vértices, 1 milhão de caracteres de texto, 12000 trilhas e 100 mil chaves. Testes induzem excesso e verificam atomicidade.
3. O compilador clonava subárvores e clips inteiros antes de filtrar. Passou a copiar apenas campos/nós/canais necessários, sem modificar a origem.
4. Profundidade de relógios dependia da ordem de visita. O loader agora memoriza a profundidade real e recusa nove níveis em ambas as ordens, além de ciclos e donos de tempo concorrentes.
5. `get_object` poderia devolver overrides grandes implicitamente. A inspeção foi limitada, paginada e ligada a leitura explícita de chunks.
6. Replacement string do atributo de acessibilidade interpretava `$&`, `$\`` e `$'` como metassintaxe de `String.replace`. O export usa callback e há regressão para preservar esses caracteres escapados literalmente.
7. Campos numéricos não podem substituir o rascunho textual a cada tecla. O controle conserva a fase de edição e só o schema autoriza o commit; labels usam IDs React únicos, sem supressões do linter.

## Evidências e alcance

97 testes do editor, 12 do núcleo, typecheck geral (23 tarefas + tooling), build, 3 E2E e jornada nativa passaram. O navegador verificou criação, rascunho de override sem mutação, persistência, animação em HTML independente, escala 0,5 do componente 320→160 e clipping. Testes do núcleo cobrem aninhamento, fases, identidade e limites. A jornada Electron repetiu arquivos/recuperação/licença com perfis/chaves efêmeros; nenhum instalador foi instalado ou publicado. A primeira asserção de tamanho usava `getComputedStyle(width)`, que retorna `auto` para esse viewport SVG; foi substituída pela razão entre matrizes reais, sem flexibilizar o tamanho esperado.

Ainda não é homologação React Native, `.riv`, desempenho comparado ao Rive ou suporte aos sistemas de estados/rig/assets avançados. Faltam os demais itens de manipulação/timeline/vetores do lote 2 e os lotes 3–6. O renderer local não comprimido está em aproximadamente 1,03 MB; o runtime IIFE, 97 kB. Esses tamanhos não são prova de FPS, latência ou ganho de CPU.
