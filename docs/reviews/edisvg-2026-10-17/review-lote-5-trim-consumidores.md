# Incremento 5.29 — trim nos consumidores amostrados

Estado: implementado e revisado localmente em 20/10/2026 (branch `feat/edisvg-lote-5-restante`). Sem mudança de formato: o trim existe desde o Rig v3 (5.16); o que muda é a saída. Primeira metade do item "draw order e trim em consumidores ainda recusados" do [review integral](full-review-2026-10-18.md); a ordem de desenho animável (item I09 do diagnóstico, ainda inexistente no núcleo) é o 5.30.

## Lacuna

HTML interativo e React já usavam o avaliador com trim. O **SVG/SMIL animado** e a **Lottie** recusavam o trim, porque o recorte muda a topologia a cada quadro: a quantidade de vértices varia, contornos podem esvaziar e um contorno aberto que dá a volta vira duas peças. Nenhum dos dois formatos interpola entre listas de comandos diferentes.

## Perfil

- **SVG animado**: os caminhos recortados entram na amostragem de geometria já usada por morph/skin, com a geometria de base quando o trim é identidade. O `d` é animado com `calcMode="discrete"` e `keyTimes` exatamente nos quadros (SMIL dividiria a duração em intervalos iguais, desalinhados). Caminho vazio vira `M0 0`, que mantém a lista de valores válida e não desenha nada. Exato em cada quadro, sem interpolar entre eles.
- **Lottie**: cada caminho recortado reserva duas formas por contorno de origem (um contorno aberto pode virar duas peças), amostradas com chaves de retenção (`h: 1`). O `lottie-web` mantém a contagem de vértices da primeira chave de uma forma; por isso cada espaço tem tamanho fixo (maior contorno + 1) e peças menores repetem o último vértice, o que não acrescenta comprimento, ponta ou junção. Espaço vazio é um subcaminho de comprimento zero: no início do caminho com extremidade `butt`; com `round`/`square`, que pintariam um ponto, ele fica muito fora da composição (posição calculada pela inversa da matriz da camada) e é recortado pelo viewport. Contornos fechados são recusados: o recorte os abre e o consumidor mantém o fechamento da primeira chave.

## Achados durante a revisão

1. A primeira versão Lottie variava a contagem de vértices entre chaves de retenção; o JSON estava correto, mas o `lottie-web` desenhava só a forma inicial em todos os quadros. O comparador independente de pixels mostrou zero pixels pintados; daí os espaços de tamanho fixo.
2. Uma recusa a extremidades `round` deixaria o trim Lottie inútil, porque é o padrão da caneta e da forma "Caminho" do editor. Foi substituída pelo ponto fora da composição, exato no que é visível.
3. Duas corridas de teste preexistentes apareceram nesta rodada e foram corrigidas na causa: o E2E do adapter React (CI Linux) conferia a prontidão depois de ver o texto restaurado pelo player antigo; o de autoria de comportamento abria o diálogo de clip sobre a marcação que o commit da forma estava substituindo. Ambos esperam agora a condição real.

Depois, o [full review do lote 5](full-review-2026-10-20.md) (C4) achou que o ponto distante usado para esconder pontas de traço aparadas na Lottie podia estourar coordenadas sob escalas pequenas. O ponto agora é calculado pela inversa da transformação global composta, com teto de magnitude e alternativa segura; teste unitário cobre.

## Gates e evidências

- Unitários: Lottie com retenção e contagem constante por espaço (espaço nunca usado fica estático), recusa de contorno fechado; o teste antigo do trim passou a afirmar SVG discreto e ausência de recusa Lottie. App: 269 testes.
- E2E (`tests/e2e/trim-consumers.test.ts`), duas variantes — o desenho original 0→100% (primeiro quadro vazio) e um caminho de dois contornos em modo sequencial com deslocamento de 250°: o SVG exportado, pausado e posicionado com `setCurrentTime` logo depois de cada `keyTime`, comparado por captura de tela com o player compartilhado ao vivo em cinco quadros — zero diferenças nas duas. Lottie desenhado pelo `lottie-web` light contra o player: o desenho original dentro dos limites estritos; no sequencial, peças cúbicas cortadas em parâmetros arbitrários mostram diferenças esparsas de antialiasing em bordas (até 24 amostras, alpha ≤ 14), dentro dos limites por pixel da suíte Lottie (alpha ≤ 20, cor pré-multiplicada ≤ 15, opacos ≤ 2); só a contagem de bordas tem teto 40, sob o consentimento de precisão do renderer.
- Regressão: E2E completo, consumidor Next de produção, tipos e build.

## Limites que permanecem

Os dois formatos são amostrados: exatos nos quadros, sem trim contínuo entre amostras (o SVG troca o `d` em degraus). Lottie aceita apenas caminhos abertos e não usa o modificador nativo `tm` (o comportamento de outros consumidores Lottie com trim nativo não foi homologado). O ponto fora da composição pressupõe que o consumidor recorte pelo tamanho da composição, como o `lottie-web` e os players Lottie usuais fazem.
