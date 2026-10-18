# Incremento 5.14 — conversão vetorial explícita

Data: 18/10/2026. Estado: conversão explícita e contrato de precisão implementados e revisados localmente no perfil documentado. Perfil 5.13 fechado separadamente, com limitação posterior de precisão registrada aqui. Restante do lote 5, lote 6 e full review permanecem obrigatórios.

## Problema e contrato candidato

Nota posterior de revisão (5.15 revisado no perfil documentado): a investigação ampliada corrigiu a interpretação do antigo canário de curva fechada. Conservar os espaços de composição/pintura no emissor fez esse caso passar sem ampliar tolerância. Float32 existe no consumidor, mas o aviso de precisão não substitui essa correção própria. O histórico abaixo registra os resultados efetivos do 5.14; o novo diagnóstico e a limitação externa realmente isolada estão no [review 5.15](review-lote-5-lottie-tracejados.md).

O renderer Lottie trabalha com Bézier cúbica. A prova 5.13 demonstrou que converter automaticamente linha/primitiva pode mudar rasterização, mesmo sem mudar a geometria matemática. A solução não é editar o projeto durante exportação ou afrouxar o teste. Autoria precisa de uma conversão explícita, persistente e reversível, com prévia honesta e consentimento sobre aparência. Ela não substitui o suporte a todo perfil Lottie/SVG.

Adicionar uma operação de normalização de caminhos para C explícito, preservando curvas já cúbicas e representando segmentos retos por alças coincidentes com suas âncoras. Acesso pelo painel de vértices; primitivas podem usar antes a conversão de forma→path já existente. Prévia deve distinguir geometria de aparência final: não inventar reprodução de gradientes, máscaras, fontes, opacidade ou transformações em uma miniatura de contorno isolada. Mostrar aviso de bordas/curvas e exigir confirmação antes de publicar uma única transação.

Não confirmar pela IA em nome do usuário. Preservar ID, attrs não geométricos, hierarquia, basis/TRS, semântica, animações e fonte original; não gravar o arquivo sem Save. Locks/dependências inválidas ou excesso recusam atomicamente. A adição de alças pode alterar topologia usada por morph/skin: recusar incompatibilidade antes da publicação, nunca retargeting silencioso. Não exigir novo formato de projeto se a saída continuar usando dados/contratos existentes.

## Gates previstos

- Geometria aberta/fechada, retas, curvas C/S/Q/A, idempotência e limites; preservação de formas matemáticas dentro da aproximação já declarada do editor.
- Consentimento obrigatório, IDs/attrs/motion/source preservados; locks, referências e morph/skin incompatíveis recusados sem histórico parcial.
- UI real com prévia e confirmação, uma transação, undo/redo/reabertura; exporter continua sem modificar documento.
- Provas de pixels e conversão entre fonte original e resultado sem anunciar igualdade de antialiasing; Lottie independente do resultado C, mantendo a tolerância do perfil existente.
- Tipos, testes, build, regressão/Next e Electron proporcionais antes de fechar.

## Implementação e revisão em andamento

Os parágrafos de andamento abaixo preservam a sequência das provas; o fechamento ao fim consolida o estado atual.

`prepareCubicConversion` usa o parser/serializador compartilhados: alças ausentes tornam-se coincidentes com âncoras; curvas existentes não são simplificadas. Mantém limite de 4000 vértices, coordenadas ±1e7 e 500 mil caracteres de entrada/saída. A operação `path-edit cubicize` exige `confirmAppearanceChange:true`, passa pela transação UI/MCP e pela validação completa do projeto antes da publicação. Não altera formatos v20/v9. Morph com alças incompatíveis recusa inclusive uma transação mista; skin vetorial compatível conserva pesos/matrizes e o locus deformado nos quadros verificados. A fonte SVG original permanece intacta.

Painel React integrado ao inspetor existente: duas miniaturas de geometria, sem markup arbitrário, aviso de aparência/arcos/arredondamento, confirmação e histórico normal. Tokens, tipografia, espaçamento e foco do editor preservados. Captura `.cache/edisvg-review/cubic-conversion.png` inspecionada. Testes iniciais: cinco unidades específicas, 21 unidades conversão/Lottie, tipos e build passaram; a rodada anterior completa do app passou 184 testes, antes do quinto teste de skin e do contrato de precisão abaixo. Não usar esse número como validação final do build corrente.

A primeira prova de reabertura falhou porque o `addInitScript` da fixture reinseria o projeto inicial em toda navegação. Corrigido para semear somente armazenamento ausente; conversão/undo/redo/reabertura/download real passaram, sem alteração de persistência em produção.

### Achado adicional: precisão do consumidor Lottie

O corpus ampliado confirmou pixels de linhas convertidas, mas expôs diferenças nas bordas de uma curva fechada convertida de arco sob matriz fracionária/rotação, no quadro 29. A geometria e a matriz emitidas são matematicamente corretas; o SVG produzido pelo renderer independente usa coordenadas e matrizes float32. Probes temporários trocaram só o d (insuficiente), depois d + pintura em um único elemento (insuficiente), depois também a matriz precisa da referência (passou). O probe de pintura inicialmente reutilizado entre quadros invalidava o diagnóstico ao remover elementos; foi refeito em uma única amostra. Todos os probes foram retirados do teste de entrega e não entraram no runtime.

Fonte primária: [matrizes de lottie-web 5.13.0](https://raw.githubusercontent.com/airbnb/lottie-web/v5.13.0/player/js/3rd_party/transformation-matrix.js) usam `createTypedArray('float32', 16)`; [fábrica de arrays](https://raw.githubusercontent.com/airbnb/lottie-web/v5.13.0/player/js/utils/helpers/arrays.js) cria `Float32Array`. Não é possível prometer identidade universal de pixels ao traduzir para esse consumidor. Não quantizar o desenho do Edi para mascarar isso, nem modificar o renderer de terceiros, nem aumentar a tolerância do corpus já homologado.

Correção do contrato em implementação: relatório explícito `renderer-precision`, flag tipada `requiresRendererPrecisionConsent`, opção `confirmRendererPrecision` inicialmente falsa, validação no compilador antes de progresso/arquivo e checkbox independente na UI. Esse consentimento não transforma diferença de pixels em equivalência: o corpus mantém as provas originais com tolerância de um canal e separa o caso conhecido de precisão, verificando sua diferença e erro geométrico limitado. Curva convertida sob matriz exatamente representável também entra na comparação de pixels. Exige homologação no consumidor de destino; não certifica RN/outros renderizadores. Gates integrados/nativos dessa correção ainda pendentes.

### Resultado integrado anterior ao Electron

185 testes do app, 98 do núcleo, tipos app/núcleo/tooling, 43 testes de tooling, sintaxe/build, 61 E2E seriais e Next produção/Turbopack/SSR/hidratação passaram. Corpus independente ampliado: 20 perfis, dos quais 19 mantêm a tolerância anterior de um canal; o vigésimo é o canário de precisão, com diferença conhecida no quadro 29 e erro geométrico medido menor que 0,001 unidade no desenho 300×200. Esse limite é da fixture, não garantia universal para projetos arbitrários. Nenhum probe altera os SVGs ou o renderer durante a prova de entrega. UI real verifica ambos os consentimentos, download/snapshot, Cancel sem resultado tardio e ausência de vazamento de opções para React ZIP. Captura do diálogo com aviso/checkbox novos inspecionada; footer permanece visível.

A primeira rodada integrada do novo consentimento bloqueou corretamente a exportação, mas a UI não encaminhava a flag ao Worker, causando timeout de download nos testes. Corrigida a composição das opções em `app.js`; repetição focada e regressão completa acima passaram. O compilador não foi relaxado nem recebeu confirmação automática. Uma invocação de tooling usou um nome de tsconfig inexistente; o comando oficial `edi:typecheck:tooling` foi executado depois e passou.

Check focado em 416 arquivos: zero erros, 15 warnings/nove infos legados visíveis. Auditoria dev sem vulnerabilidades conhecidas; produção mantém dois alertas altos `image-size@1.2.1` via `apps/edipdf > pptxgenjs@4.0.1`, fora do grafo EdiSVG e sem exceção. Não alterar a dependência da frente concorrente nem declarar auditoria global limpa. Electron selecionado em andamento; não marcar revisado antes de coletar o resultado e inspecionar as capturas. Nenhum commit/merge/push/release/deploy/cobrança autorizado ou executado nesta frente.

## Fechamento

Jornada Electron selecionada concluída com exit 0: importação real de path L, painel/miniaturas, confirmação de conversão, criação de clip, Worker file/CSP, ambos os consentimentos de exportação, Save/Cancel e JSON completo comparado ao compilador. Destino temporário próprio `edisvg-lottie-conversion-test.lottie.json`, explicitamente permitido pelo helper de PID isolado; os perfis anteriores fill/C e o projeto salvo foram preservados. Todas as edições da fixture foram desfeitas e o draft anterior voltou exatamente. Captura `.cache/edi-native-results/edisvg-lottie-conversion.png` inspecionada com avisos/checkboxes e footer visível.

Também passaram integridade física, abertura visível/licença/expiração/IPC, arquivos/recuperação, React ZIP e jornadas de SVG/fontes/áudio/rig. Nenhum instalador instalado/publicado e nenhuma operação de produção. Gates integrados: 185 testes app, 98 núcleo, 61 E2E, Next produção, tipos app/núcleo/tooling, 43 tooling, sintaxe/build e check focado sem erros. A limitação histórica do launcher comum não voltou nesta rodada, mas não é declarada resolvida.

Revisão de coerência corrigiu duas descrições antigas que diziam que a inspeção não amostrava: ela visita amostras de contornos sob orçamento, mas não gera JSON nem grava; MCP continua somente leitura e todas as confirmações inicialmente falsas. Guia do assistente proíbe inventar consentimento. Conversão mantém v20/v9, fonte, hierarquia, IDs e atributos; os validadores/avaliadores continuam compartilhados. A decisão arquitetural é expor honestamente a precisão do formato/consumidor, não modificar pixels do editor nem remendar código de terceiros.

Próximo incremento: 5.15, tracejados Lottie com parser/densidade/orçamento e corpus próprio antes de homologar. Este fechamento não certifica SVG/Lottie/Rive integral, RN, restantes do lote 5, lote 6 ou full review. Auditoria global de produção segue bloqueada pelos dois alertas concorrentes do EdiPDF, sem exceção.
