# Incremento 5.21 — gradientes na exportação Lottie

Estado: perfil inicial implementado e revisado localmente em 18/10/2026. Este fechamento não conclui o lote 5, o lote 6 ou o full review.

## Lacuna e direção

O editor/runtime já têm gradientes tipados lineares/radiais, herança, stops/alpha e transforms. O emissor Lottie ainda recusa qualquer gradiente e gera somente fills/strokes sólidos no perfil publicado. Não basta trocar fl por gf: pintura e geometria precisam conservar seu espaço local, units, transform, spread, alpha e composição; bake de vértices em coordenadas globais não transforma automaticamente a pintura.

Implementar primeiro um contrato explícito de pintura Lottie e sua compatibilidade, reutilizando o avaliador/transformações já existentes. Verificar o consumidor lottie-web 5.13.0 instalado, o formato de cores/opacidades dos stops e a semântica de gradientUnits/gradientTransform. Derivações sem equivalência segura ou ainda sem prova devem produzir diagnóstico bloqueante, nunca cor sólida substituta ou perda silenciosa.

Preservar consentimentos separados de amostragem, precisão float32 do consumidor e perda de lógica/áudio/semântica. Units objectBoundingBox, transforms gerais e pintura de contorno exigem provas próprias; não inferir suporte a partir de um preenchimento userSpaceOnUse simples. Gradientes de stroke continuam sujeitos também ao perfil de curvas/contornos e à inspeção de todas as amostras.

## Critérios de revisão

### Implementação e evidências parciais

ShapeGradientFill gf é saída Lottie tipada, com arrays RGB e alpha separados, preenchimento/regra/opacidade próprios e coordenadas estáticas de pintura. prepareLottie usa a mesma resolução de aparência/herança do editor: índice único por snapshot e mergeGradientPaints compartilhado, sem inventar uma segunda política de overrides. Paints sólidos mantêm o conteúdo anterior; gradiente efetivo ganha prioridade sobre o sólido e um stroke com gradiente é recusado, não convertido em cor sólida.

Perfil inicial: userSpaceOnUse, spread pad, 2–32 stops com offsets em centésimos; linear aceita gradientTransform afim invertível, e radial aceita sua transformação própria conforme e foco até 99% do raio. A inspeção do código instalado GradientProperty.js confirmou arredondamento de offsets para porcentagens inteiras; este emissor recusa offsets mais precisos, sem arredondá-los. objectBoundingBox/repeat/reflect e gradientes de stroke ainda são recusados. Coordenadas precisam ser finitas, limitadas e não colapsar nos endpoints float32.

No linear, a transformação conserva o campo escalar: v=P1−P0, n=M^-T v/|v|², S=M P0 e E=S+n/|n|². A implementação normaliza os vetores antes dos produtos/divisões. Transformar apenas os dois endpoints sob skew/anisotropia produziria um gradiente diferente. No radial conforme, centro/raio/foco são transformados e h/a representam o foco sem aceitar o clamp externo do consumidor.

Pintura conserva cada fronteira local, reutilizando a fatoração afim/relógios do emissor existente, sem outro evaluator. Todos os gradientes debitam custo compartilhado por amostra; preflight inclui esse custo, e inspeção visita também o último frame para bounds globais. Geometria/matrizes/fontes/assets e formatos de projeto/blueprint não mudaram. Os consentimentos existentes continuam inicialmente falsos e separados.

O corpus inicial de oito perfis passou; ampliação com transformação global/transparência expôs divergência real. Em probe de frame zero, havia 118 pixels fora da tolerância de um canal. Substituir somente a matriz por alta precisão não corrigiu: o problema não era apenas float32. Normalizar o viewBox na layer, conservando âncora absoluta e coordenadas locais da pintura em vez de transladar dentro do grupo de opacidade, reduziu esse probe a zero. A correção foi feita no emissor comum; diagnóstico em clones não entrou no código de produção/testes homologatórios, nem se aumentou a tolerância.

Após corrigir, os 12 perfis reais passaram em ida e reset/avanço reverso: linear, matriz própria geral, radial, foco, reflexão própria, hierarquia/alpha, sólido sobrescrevendo gradiente, gradiente com stroke sólido, transformação global linear/radial, transformação animada com reflexão/colapso/skew e paradas coincidentes. Os 29 perfis Lottie anteriores passaram com a mesma tolerância e o canário anterior de precisão permaneceu isolado. A função de comparação independente foi extraída para um helper de testes compartilhado, preservando consumidor real e asserções anteriores.

Quatro unidades puras de gradientes, seis de integração/limites do emissor e uma de cache/herança foram acrescentadas. Tipos e 229 testes do app passaram após a correção estrutural; 123 testes e tipos do núcleo também passaram. UI real de exportação cobre relatório de perfil, consentimentos, download gf real, recusa de offset .333 e de hierarquia profunda, sem alterar o projeto. Nova jornada NativeLottieExport usa fonte tipada por objeto de cenário e inclui SVG real com gradiente, Save/Cancel e undo do rascunho; a homologação completa passou, conforme os gates abaixo.

Context7 resolveu /airbnb/lottie-web e /lottiefiles/lottie-docs; detalhes foram confrontados com a versão instalada 5.13.0, não assumidos a partir do master. Especificação de shapes/values e código SVGGradientFillStyleData/SVGElementsRenderer/GradientProperty sustentam o contrato. Nenhuma dependência foi atualizada.

### Achados adicionais e fechamento

Achado estrutural corrigido: cadeias com profundidade 29–31 passavam no relatório, mas o JSON gerado excedia a profundidade máxima 128. A expansão de grupos necessária ao espaço local de pintura aumenta a profundidade do output. O preflight agora deriva do mesmo teto do writer a profundidade máxima 28 para esse perfil, reservando a estrutura de geometria animada. Testes aceitam 26/28 e recusam 29/31 antes de iniciar progresso, tanto em gradientes quanto em strokes; um morph real na profundidade 28 gera JSON válido na fronteira 128. Não se aumentou o limite nem se achataram grupos/alpha. A regressão completa foi repetida após a correção: 78 E2E, Next de produção e Electron passaram.

A primeira jornada Electron ampliada passou pelos três perfis Lottie anteriores e chegou ao Save do gradiente, mas falhou na proteção do auxiliar de testes: o novo nome de arquivo não estava na lista exata de destinos temporários permitidos. Foi acrescentado somente o literal edisvg-lottie-gradient-test.lottie.json, preservando a verificação de PID/perfil e da pasta temporária. Um novo teste lê a guarda real via AST PowerShell e verifica doze nomes permitidos/recusados, inclusive caminhos pessoais, traversal e extensão executável. Os 44 testes de tooling passaram. Tipos do tooling continuam bloqueados pelos mesmos 11 erros concorrentes em apps/edipdf/src/shared/pdf-annotations.ts, sem alteração dessa frente. A repetição Electron via pnpm edi:test:native edisvg concluiu com exit 0, incluindo os quatro perfis Lottie Save/Cancel, JSON completo e undo exato, licença/expiração/IPC, integridade e abertura visível, arquivos/recuperação, React ZIP e demais jornadas gráficas/fontes/áudio/rig.

A captura nativa edisvg-lottie-gradient.png revelou uma descrição fixa desatualizada: dizia recusar todos os gradientes, contradizendo o relatório real. Corrigida para distinguir fills admitidos e contornos/units/spreads ainda recusados, sem dizer que anisotropia de preenchimento é proibida. Após essa última alteração somente textual, tipos/build e cinco E2E Lottie foram repetidos e passaram, incluindo asserção da descrição atual. Captura atual do mesmo painel no navegador (lottie-export.png) e captura nativa foram inspecionadas; a captura nativa antecede a correção textual, não é evidência visual da cópia final. O comportamento do emissor não mudou após a jornada nativa aprovada.

| Gate | Resultado local |
| --- | --- |
| App/núcleo | 229 testes do app e 123 do núcleo passaram; tipos de ambos passaram |
| Sintaxe/build | Passaram; tipos/build repetidos após a correção textual |
| Navegador | 78 E2E passaram após a correção estrutural; cinco Lottie repetidos após a correção textual |
| React/Next | Host React independente/StrictMode na regressão; Next 16.4.2 produção, SSR e hidratação passaram |
| Electron/Windows | Jornada completa exit 0, com quatro perfis Lottie reais |
| Tooling | 44 testes passaram; tipos bloqueados por 11 erros concorrentes EdiPDF |
| Biome específico | 473 arquivos; zero erros, 14 warnings e nove infos legados visíveis |
| Auditorias | Produção e desenvolvimento passaram sem vulnerabilidades conhecidas, muted vazio |
| Documentação/diff | Sete guias/reviews com links locais conferidos; diff sem whitespace inválido |

Auditoria limpa não certifica compatibilidade do override major de image-size introduzido pela frente EdiPDF. Avisos de diretiva use client/module type e warnings legados não foram ocultados. A fragilidade histórica de prazos dos fixtures comuns de launcher continua para o full review; passar nesta rodada não a resolve. Não houve dependência, versão de app ou formato de projeto/blueprint novo neste incremento.

Domínio com inputs próprios, sem mutação; herança/override e paints efetivos; coordenadas/unidades/transforms e opacidades; preflight de todas as amostras; orçamento compartilhado de trabalho/bytes; JSON Lottie real, consumidor independente, pixels/poses em ida e busca reversa e comparação com os perfis sólidos anteriores. UI/MCP devem usar o mesmo relatório e preservar captura/cancelamento/consentimentos. Verificar exportação/download e jornada Electron Save/Cancel, sem alterar o original.

Context7 confirmou suporte geral a gradient fill/stroke; isso não certifica o perfil deste emissor. A implementação foi confrontada com a especificação primária e o código da versão fixada, sem atualizar dependências: [Shapes](https://lottie.github.io/lottie-spec/latest/specs/shapes/), [Values](https://lottie.github.io/lottie-spec/dev/specs/values/), [SVG gradientUnits](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/gradientUnits).

Próximo incremento: [5.22 — limites reais de geometria e gradientes relativos](review-lote-5-lottie-bounding-box.md). Demais gráficos/tipografia/raster/joystick, formatos, semântica/scripting do lote 5, React Native/lote 6 e full review final continuam obrigatórios. Sem commit/push/release/deploy, operações comerciais ou certificação de substituição integral do Rive.
