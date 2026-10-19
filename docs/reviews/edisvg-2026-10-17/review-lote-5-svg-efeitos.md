# Incremento 5.12 — importação SVG de recortes e máscaras

Data: 18/10/2026. Estado: perfil inicial implementado e revisado localmente, com gates abaixo. Não é cobertura integral de SVG nem encerramento do lote 5/6 ou full review. A auditoria global de produção tem uma pendência concorrente do EdiPDF registrada abaixo.

## Problema e contrato de aceite

O modelo atual já possui referências locais de silhueta vetorial e máscaras alpha, mas o importador recusa `clipPath`/`mask`. Não basta permitir os atributos: SVG e o editor precisam concordar sobre coordenadas, herança, composição, região de máscara e referências. Importação é atômica; qualquer recurso fora do perfil deve ter diagnóstico por elemento, sem arte parcial ou descarte silencioso. Fontes externas, scripts, imagens raster e CSS externo não entram por esse caminho.

Perfil inicial candidato: referências locais a uma única geometria suportada por definição, clip em userSpaceOnUse e máscara alpha explícita com coordenadas/região absolutas verificáveis. Suportar transformação, regra de preenchimento/recorte, transparência e reutilização sem compartilhar estado editável. ObjectBoundingBox, múltiplos desenhos compostos, texto/use, máscaras de luminância/gradientes, recortes recursivos e regiões que cortem a silhueta ficam recusados até implementação/prova específica. Não converter luminância em alpha por aproximação.

## Arquitetura e decisões verificadas

O contrato permite fonte descendente do objeto recortado. O grupo editável contém a arte original e uma geometria-fonte oculta: a mesma transformação move arte e fonte, e a referência tipada usa o avaliador compartilhado. Para uma folha, a conversão cria grupo portador e geometria filha, preservando nome/semântica/identidade principal no grupo e avisando sobre a organização editável. Para grupo existente, acrescenta fontes locais ocultas. A estrutura passou nas provas de pixels e movimento, sem segundo motor ou permissões de URL nos attrs.

A região original de máscara é verificada como não restritiva para a silhueta importada, não preservada como recorte regional animável: depois da importação, edições usam a regra de silhueta alpha do editor, cujo retângulo acompanha os limites calculados. A fonte SVG original permanece no projeto. Regiões inicialmente restritivas são recusadas; esta conversão não importa animações SVG ou promete conservar futuras edições realizadas no arquivo externo.

Os testes estáticos e animados verificaram attrs.transform nos wrappers e nas definições, opacidade da máscara separada da composição do alvo, curvas/arcos e fontes reutilizadas independentes. A região suportada precisa conter a silhueta inteira, incluindo margem conservadora; regiões menores são recusadas. A necessidade de preservar primitivas nativas exigiu projeto v20/blueprint v9: a capacidade não é aceita sob cabeçalhos antigos. Playback permanece v3, derivando as primitivas do desenho portátil tipado.

Validação de definições/estilos deve ser reutilizável com o importador de gradientes, evitando parsers CSS divergentes. Referências locais usam gramática fechada; IDs duplicados, IDs ausentes, namespaces/attrs desconhecidos, ciclos e excesso devem recusar o arquivo. Limites de fonte/árvore/defs/referências e objetos gerados são agregados antes da publicação. Metadados não convertidos permanecem no SVG fonte com diagnóstico.

## Gates previstos

Dependência corrigida no início: o importador e o catálogo de gradientes eliminavam a anotação `!important` e depois usavam somente ordem textual, mudando a pintura quando uma declaração normal vinha depois da prioritária. `svg-inline-style.ts` centraliza o perfil fechado, limite de texto/256 declarações e precedência de importância. Todas as declarações continuam disponíveis para validação, inclusive as que não substituem o valor efetivo; não usar precedência para esconder referências/valores inseguros. Comentários, escapes e sintaxe fora do perfil são recusados explicitamente. Dois testes próprios e tipos passaram; prova de pixels/regressão ainda em execução. Fonte normativa: [CSS Cascade — importância](https://www.w3.org/TR/css-cascade-5/#importance).

- DOMParser real: referência reutilizada, inline/style, transformações do alvo e da definição, regra evenodd, alpha, herança e limites.
- Comparação com SVG original no navegador: pixels, composição, máscara regional e transformações; animação do grupo portador mantém fonte e desenho coerentes.
- Adversariais: URL externa, scripts/eventos, namespaces, entidades, IDs duplicados/ausentes, definições recursivas, objectBoundingBox e recursos fora do perfil recusados integralmente.
- UI: arquivo real, relatório, nova prancheta, undo/redo, persistência/reabertura, edição/duplicação das referências e Testar isolado.
- Player/HTML/React, Next e Electron file/CSP proporcionais, preservando o projeto original e a matriz de exportação Lottie.

## Regressão integrada — 18/10

Gates finais: 174 testes do app e 98 do núcleo, tipos app/núcleo/tooling, 43 testes de tooling, sintaxe, build, 59 E2E seriais e Next 16.4.2 produção/Turbopack/SSR/hidratação passaram. Biome verificou 415 arquivos sem erros; 15 warnings e nove infos legados continuam visíveis. O build mantém aviso de diretiva `use client` no bundle, sem suprimir o aviso; o consumidor Next real passou. Captura de Testar `.cache/edisvg-review/svg-effect-import.png` inspecionada: os dois círculos e controles estão visíveis.

Electron selecionado passou com quatro importações reais via arquivo, inspetor, Testar e undo exato sob file/CSP. A jornada também verificou Worker, Yoga/WASM, fonts/PNG/áudio, efeitos, rig, semântica, Save/Open, cancelamento, recuperação, ZIP React, Lottie Save/Cancel, integridade/licença/expiração/IPC. Usa chaves e perfis efêmeros; não instalou/publicou produto, não fez commit/merge/push/deploy/cobrança. A fragilidade histórica do launcher comum permanece rastreada no full review; esta rodada não a reproduziu nem comprova sua correção.

As duas falhas integradas intermediárias estão registradas no histórico abaixo: consumidor de composição sem primitivas e fixture que tentou selecionar camada mantendo a aba Artboards. A correção de produção foi verificada por teste unitário e E2E de arraste/Escape; a fixture passou a navegar explicitamente para Hierarquia. Rodada completa foi executada depois das correções, sem alterar fontes/build enquanto os gates estavam ativos.

A auditoria atual de desenvolvimento passou sem alertas conhecidos. A auditoria de produção do workspace deixou de estar limpa: duas vulnerabilidades altas de `image-size@1.2.1` chegam por `apps/edipdf > pptxgenjs@4.0.1`, em mudanças concorrentes preservadas; `pnpm --filter @informach/edisvg why image-size` e `why pptxgenjs` não apresentam esses pacotes no EdiSVG. Não alterar essa frente concorrente nem ocultar o resultado; a aprovação global permanece pendente de correção/revalidação. Referências: [JXL/HEIF](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq), [ICNS](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr). O resultado histórico limpo de 5.11 não descreve o grafo atual.

### Achado da primeira prova de efeitos

Marco intermediário, anterior ao fechamento acima: `svgPrimitive` centralizou primitivas tipadas, attrs nativos e modelo de caminho, substituindo as fórmulas do editor. O avaliador deriva a geometria, conserva a primitiva e recusa deformação implícita; metadados nativos de frame são imutáveis. O probe foi removido e a comparação passou sem relaxar tolerância. Testes de versões, imutabilidade/colapso e backup exato v19→v20 passaram. Rodada intermediária: 173 testes do app e 98 do núcleo; a regressão posterior da prévia passou isoladamente. UI/HTML/React/Next e Electron estavam abertos nessa etapa, depois aprovados no fechamento.

Histórico da primeira falha: converter círculo para path com arcos nativos manteve geometria, mas alterou antialiasing no navegador: uma amostra retornou alpha 127 contra 163. Um probe real trocou somente o elemento de definição por circle, preservando a matriz, e recuperou exatamente alpha 163. A evidência isolou rasterização da primitiva, não coordenadas. Esse probe já foi retirado; o código de produção preserva circle.

Prova animada aprovada: circle, ellipse com alpha, rect arredondado, polygon e path com arcos, comparados ao SVG original em pixels com tolerância de um canal. Dois players com relógios independentes, reset, IDs isolados e restauração exata do host passaram. A prova estática contém quatro composições, incluindo transformações/evenodd/reutilização/recortes aninhados. A prova adversarial recusa 25 perfis inválidos e expansão acima de 2000 objetos; erros fatais continuam visíveis mesmo após mais de 100 avisos.

Achado de recursos: o custo de compartilhar uma fonte não limita os bytes repetidos nas definições emitidas. A avaliação agora debita também cada definição expandida no orçamento agregado compartilhado entre scopes, antes de hash/DOM. Um alvo colapsado não pode contaminar o cache de custo de outro alvo expandido. Ambos os casos têm testes sem modificar o documento. A política de recursos vale também para contratos históricos; não acrescenta campos silenciosos.

Primeira regressão integrada: React ZIP e importação pela UI falharam na abertura/renderização do editor. Um diagnóstico real isolou `compositionPreview`: o consumidor chamava o contexto de playback sem dados nativos. A correção passa as mesmas fontes tipadas do núcleo; a prévia transitória de arrastes também lê primitivas nativas, sem conversão para path. A regressão unitária e a repetição de ponta a ponta passaram, conforme fechamento acima. A expectativa da fixture de duplicação foi corrigida para o nome existente “(cópia)”, sem alterar o produto.

Validação preliminar da dependência: pixels reais confirmaram importância em fill sólido, paradas de gradiente e referências tipadas; declarações inseguras sobrescritas continuam recusadas. Seis E2E focados, build e tipos passaram. Foram centralizados alpha numérico em `parseSvgOpacity` e namespace/attrs de definições; Lottie reutiliza o parser. Naquele marco, 93 testes do núcleo e dois de estilo passaram, ainda antes da integração clip/mask na UI. O fechamento acima registra o perfil completo deste incremento.

## Fontes primárias e limites da pesquisa

Context7 retornou bibliotecas de manipulação/render, não a especificação normativa procurada; a fonte de contrato é [CSS Masking 1 — fontes SVG](https://www.w3.org/TR/css-masking-1/#svg-clipping-path-sources) e [máscaras SVG](https://www.w3.org/TR/css-masking-1/#svg-masks). A especificação distingue coordenadas do elemento de referência de bounding box; fill-rule não substitui automaticamente clip-rule. Define também composição, região e alpha/luminância. As decisões do editor foram verificadas no perfil e nas amostras registrados, sem equivalência integral à especificação.
