# Incremento 5.35 — fórmulas declarativas (scripting/procedural com política e orçamento)

Estado: implementado e revisado localmente em 20/10/2026 (branch `feat/edisvg-lote-5-restante`). Cobre o item "scripting/procedural declarativo com política e orçamento" do [review integral](full-review-2026-10-18.md). Entra no projeto v23 e no blueprint v12, ainda não publicados.

## Decisão

Scripting com código (como o Luau do Rive) traria execução de programas do autor dentro do player exportado, com riscos de segurança, de tempo e de portabilidade que o perfil do EdiSVG não aceita. O incremento entrega o que esse scripting costuma resolver em animação interativa (valores derivados, condições, texto composto e movimento procedural) como **fórmulas declarativas**: uma árvore de expressão tipada, guardada no documento e avaliada pelo motor. Nada é executado como código.

## Contrato

- **Modelo** (`behavior.formulas`, até 64): `{id, inputId, expression}`. A expressão é uma árvore com literais (número, texto, booleano), `input`, `time` (relógio da sessão em segundos), aritmética, `min`/`max`, `abs`/`floor`/`ceil`/`round`/`sin`/`cos`/`sqrt`/`negate`, `clamp`, comparações, `and`/`or`/`not`, `if`, `concat` e `noise` (ruído suave determinístico por semente, em [−1, 1]).
- **Política**: sem rede, arquivos, laços ou recursão além da árvore limitada. A semântica é total: divisão ou módulo por zero e raiz de negativo dão 0; números são limitados ao intervalo do input; resultado não finito é recusado. Textos concatenados usam o formato brasileiro de números e sim/não para booleanos, como a semântica dinâmica do 5.34.
- **Orçamento**: até 256 nós e profundidade 16 por fórmula, 4096 nós no total. A varredura estrutural prévia da lógica recusa documentos com profundidade acima de 96 antes da validação recursiva do schema, de modo que um documento hostil não esgota a pilha.
- **Tipos e ordem**: a verificação estática garante que uma fórmula aceita não falha por tipo em execução, e o tipo do resultado precisa ser o do input (número, booleano ou texto para texto/lista/cor; lista e cor ainda são validadas no valor). As fórmulas rodam em ordem de dependência, e ciclos são recusados.
- **Escritor único**: o input calculado é somente leitura. `setInput` (inclusive overrides de componente), listeners de escrita, bindings bidirecionais e links de dados nele são recusados.
- **Avaliação**: o motor recalcula ao criar a sessão, a cada escrita de input ou edição de dados e a cada passo do relógio, antes de as transições lerem os inputs. Por isso condições, blends, bindings e semântica veem os valores calculados.
- **Autoria**: aba *Fórmulas* em Dados, com uma sintaxe textual compilada pelo parser do núcleo (`parseFormulaText`/`formatFormula`): `clamp($input-pontos * 2, 0, 100)`, `se($input-fim, "Acabou", "Jogando")`, `sen(tempo * 2)`, `ruido(7, tempo)`. O texto formatado volta exatamente à mesma árvore. MCP: `get_behavior` com a coleção `formulas` e `behavior replace` com a árvore.

## Achados durante a revisão

1. O Biome recusou `then` como campo do `if`: um objeto com `then` é "thenable" e quebraria se passasse por `await`. Os ramos viraram `ifTrue`/`ifFalse` antes do primeiro commit.
2. Sem um limite de profundidade anterior ao Zod, uma fórmula com milhares de níveis estouraria a pilha da validação recursiva antes do limite de 16. Agora a varredura estrutural recusa antes.
3. Literais negativos eram lidos como `negate(número)`, e o texto formatado não voltava à mesma árvore. O parser passou a guardar o número negativo como literal.

## Gates e evidências

- Núcleo: 168 testes (5 novos): ida e volta texto ↔ árvore, recusas do parser (função desconhecida como `eval`, aridade, símbolo inesperado, semente não inteira), semântica total, ruído limitado e determinístico, dependências fora de ordem de declaração, limite ao intervalo, relógio, somente leitura, tipos, ciclos, limites de nós e profundidade estrutural, listener sobre input calculado.
- App: gate v23/v12, inspeção MCP e compilação interativa.
- E2E (`tests/e2e/formulas.test.ts`): no player, o texto ligado a uma fórmula mostra "Pontos: 6", vira "Recorde!" quando o input passa de 10, a escrita direta no input calculado é recusada e a onda `sen(tempo)·100` move o retângulo para x=100 em π/2 s. A aba Fórmulas compila o texto e salva a árvore no projeto.
- Regressão: app 282/282, E2E completo 114/114, consumidor Next 1/1, tipos de app e núcleo, Biome sem erros (avisos legados).

## Limites que permanecem

Não há funções definidas pelo autor, variáveis locais, listas, laços nem acesso ao documento além dos inputs e do relógio, e isso é intencional. O ruído é unidimensional. Fórmulas não escrevem em objetos diretamente: elas alimentam inputs, e os bindings/estados aplicam os valores.
