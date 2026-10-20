# Incremento 5.30 — ordem de desenho animável

Estado: implementado e revisado localmente em 20/10/2026 (branch `feat/edisvg-lote-5-restante`). Segunda metade do item "draw order e trim em consumidores ainda recusados" do [review integral](full-review-2026-10-18.md) (o trim foi o [5.29](review-lote-5-trim-consumidores.md)); fecha o item I09 do diagnóstico, que não existia no núcleo. Entra no projeto v23 e no blueprint v12, ainda não publicados; o formato de movimento não muda de versão.

## Contrato

- **Modelo** (`@informach/edi-motion`): `animation.drawOrders` (até 256) com `{id, scopeId, keys}`. `scopeId` é o grupo cujos filhos diretos são empilhados; `null` é a raiz da prancheta. Cada chave tem quadro inteiro e `order` (filhos do fundo para a frente, sem repetição, até 2000). `parseMotion` valida IDs, ordem e duração das chaves, objetos existentes e o orçamento agregado de chaves (cada chave custa 1 + itens), inclusive antes do parse do Zod.
- **Avaliação em degraus**: vale a última chave até o quadro; antes da primeira, a primeira. Filhos não listados (criados depois da chave) ficam à frente, na ordem das camadas. Sem chave, vale a ordem das camadas.
- **Relógios**: `evaluatePlaybackFrame` devolve `orders` com as ordens do clip e as de cada relógio de componente na própria fase (o mesmo `driverFrames` dos canais). No motor de comportamento a pose leva `orders`; blends escolhem a pose mais próxima (troca a partir de metade do peso, como canais discretos) e camadas aplicam a partir de peso 0,5. Camadas mascaradas só reordenam grupos dentro da máscara; a raiz pertence às camadas sem máscara.
- **DOM**: `createDrawOrderBinding` (exportado em `graphics/dom`) move o elemento externo de cada filho, incluindo o invólucro de base, dentro do contêiner do grupo. Nós que não são objetos ficam antes do bloco empilhado. Só observa escopos citados pelas animações do documento e devolve a marcação autoral no `destroy`. É usado pelo player interativo/visual (HTML, React, vídeo e Testar), pelo player de timeline (HTML do clip) e pela prévia do editor no modo Animar. O Design continua mostrando a ordem das camadas.
- **Projeto**: uma ordem só lista filhos diretos do grupo, todos na mesma prancheta. Um clip compartilhado pode empilhar a raiz de várias pranchetas, uma vez cada; documentos de runtime aceitam uma ordem de raiz por clip. Projeto anterior a v23 e blueprint anterior a v12 com ordens são recusados.
- **Compilação**: a ordem pertence ao escopo cujos objetos lista. Na composição achatada, a raiz de um componente vira o viewport da instância e anda no relógio dela. Ordens de outras pranchetas são descartadas, como as trilhas.
- **Comandos** (UI e MCP via `edit_document`): `set-draw-order` cria ou substitui a chave do quadro (com raiz `null`, a ordem existente é a que lista esses irmãos) e `delete-draw-order-key` remove pela identidade da ordem. Duplicar animação gera identidades novas.
- **Manutenção**: excluir tira o objeto das chaves (e descarta a ordem de um grupo excluído); duplicar põe cada cópia logo acima da fonte e clona as ordens internas do grupo copiado; duplicar prancheta clona a ordem da raiz. Mudar de grupo, agrupar, desagrupar e vincular a osso são recusados para objetos citados, com mensagem para remover as chaves antes. Reordenar dentro do mesmo pai continua livre.
- **Consumidores amostrados**: SVG/SMIL animado recusa (o SVG empilha pela ordem do documento e o SMIL não reordena elementos) e a Lottie recusa com o código `draw-order` (a ordem das camadas é fixa no arquivo). Nenhum dos dois descarta a ordem em silêncio.
- **Interface**: no modo Animar, o inspetor mostra a pilha do grupo do objeto selecionado no quadro atual, com Subir/Descer (grava uma chave no quadro atual) e Remover chave de ordem. O painel acompanha a agulha sem reconstruir a tela.

## Achados durante a revisão

1. Uma única ordem de raiz por clip não basta para projetos com várias pranchetas: o mesmo clip pode empilhar a raiz de cada uma. A unicidade passou a ser por prancheta no projeto. O comando de raiz encontra a ordem pelos irmãos listados, e a exclusão de chave usa a identidade da ordem. Documentos compilados mantêm uma raiz por clip.
2. Sem a regra de cópia, duplicar um objeto empilhado faria a cópia saltar para a frente de todos os irmãos listados. Agora ela fica logo acima da fonte, como na cena.
3. O vínculo a osso (`bind-rest`) muda o pai sem a política de preservar movimento, então também passou a recusar objetos citados. Antes, a falha só apareceria na validação do commit, com mensagem genérica.
4. Relógios de componente só podem empilhar grupos próprios e cada escopo tem um único dono; uma ordem de raiz num relógio é recusada no documento de runtime.

## Gates e evidências

- Núcleo: 150 testes (6 novos): validação e orçamento bruto, degraus, relógios de componente com deslocamento de fase, comandos, blend na metade do peso e camadas mascaradas.
- App (6 novos): testes de projeto e versão, compilação timeline/interativa (blueprint v12), componente achatado (viewport e relógio), exclusão/duplicação/cópia de prancheta, recusas de reagrupamento e recusas de SVG/Lottie.
- E2E (`tests/e2e/draw-order.test.ts`): o player interativo sobre a marcação do host troca o objeto pintado no centro nos quadros esperados (`elementFromPoint`), mantém a ordem interna do grupo e devolve a marcação autoral ao encerrar. No editor, Descer grava a chave salva no projeto, a prévia mostra o grupo por cima, a lista de chaves acompanha a agulha e o Design volta à ordem das camadas.
- Regressão: app 275/275, E2E completo 103/103, consumidor Next de produção 1/1, tipos de app e núcleo, Biome sem erros (avisos legados).

## Limites que permanecem

A ordem é discreta, sem interpolação. Retemporizar chaves (mover, copiar ou escalar a seleção) não move as chaves de ordem; edite-as no quadro. Mover um elemento que tem o foco do teclado tira o foco no navegador, e a ordem de tabulação acompanha a pilha. Use ordem animada em grupos sem controles focáveis. A cebola (onion skin) desenha os fantasmas sem a ordem animada. SVG/SMIL e Lottie seguem recusando, e a alternativa é HTML, React ou vídeo.
