# Incremento 5.15 — tracejados Lottie

Estado: perfil numérico de tracejados e espaços locais de pintura implementado e revisado localmente. Gates integrados/nativos concluídos abaixo. Restantes do lote 5, lote 6 e full review continuam obrigatórios.

## Contrato candidato e referências

Ampliar o emissor do perfil C/conformal para `stroke-dasharray` numérico absoluto já permitido no documento. Não liberar unidades relativas, CSS dinâmico, dash offset ou campos novos de projeto por acidente. Mesma herança/pintura/transformações do desenho, sem mudar fonte e sem converter durante exportação. O aviso/consentimento de precisão 5.14 permanece obrigatório; não prometer identidade universal de pixels nem outros consumidores/RN.

[Lottie shapes — Stroke Dashes](https://lottie.github.io/lottie-spec/latest/specs/shapes/#stroke-dashes) define ordem alternada de traço/espaço e offset final. [SVG 2 — dashing](https://www.w3.org/TR/SVG2/painting.html#StrokeDashing) repete listas ímpares e trata soma zero como traço contínuo. Context7 resolveu `/airbnb/lottie-web` e confirmou uso de attrs SVG no renderer. [DashProperty 5.13.0](https://raw.githubusercontent.com/airbnb/lottie-web/v5.13.0/player/js/utils/shapes/DashProperty.js) reserva `data.length - 1` no array e usa item `o` para deslocamento; emitir offset explícito zero no fim, sem omitir um campo necessário ao consumidor homologado.

## Gates antes de implementar

- Parser limitado de lista: reutilizar a gramática numérica do documento; `none`, valores não negativos, listas pares/ímpares/zero, sem descarte silencioso. Propor máximo de 32 valores de origem, com normalização ímpar limitada a 64.
- Preflight e visita amostrada devem limitar densidade de traços em relação ao comprimento da curva, não somente quantidade de itens da lista. Usar limite superior do polígono de controle e período do padrão, debitando orçamento compartilhado inclusive após morph/skin; evitar novo avaliador/tesselação concorrente.
- Tipos reais de Lottie, crédito de bytes antes da gravação, preservação de opacidade/ordem e traços no espaço local. Não duplicar fórmulas de largura/matriz/herança.
- Unidades adversariais, inspeção e geração idênticas, projeto intacto e recusa atômica por orçamento.
- Pixels independentes para padrões pares/ímpares/zero, caps/joins e transformações conformes; limitação de precisão explicitamente separada, sem aumentar tolerâncias históricas.
- UI/Worker/download/Cancel e Electron proporcionais, regressão/Next, tipos/check/auditoria e documentação antes do fechamento.

## Implementação atual e achados

Os parágrafos de andamento registram a sequência da investigação; o fechamento consolida o estado atual.

Parser reutiliza `validateSvgNumbers`, com 4096 caracteres, separadores ASCII e até 32 valores; lista ímpar repete e soma zero vira contínuo conforme SVG. Saída Lottie `d/g/o`, offset zero explícito, valores locais, crédito de bytes antes de guardar. Orçamento usa limite superior do polígono de controle/período do padrão, incluindo pontos de traço zero; recusa densidade excessiva no preflight e reavalia geometria deformada em todas as amostras com o contador agregado. Cinco unidades específicas passaram, incluindo herança real, projeto intacto e morph que excede densidade só no último quadro inclusivo.

### Causa própria de composição e correção estrutural

O corpus tracejado expôs diferenças de bordas que não desapareciam ao trocar só matriz precisa, pintura combinada, rgba original ou hierarquia de transformações sob a opacidade antiga. Remover opacidade global fazia passar. Um probe, isolando a transformação global na mesma camada da opacidade e compensando o espaço dos filhos, passou. Portanto não era correto atribuir todo esse caso somente à precisão externa. O emissor agora conserva o espaço global de pintura na camada das composições com contorno. Composição somente de preenchimentos mantém seu perfil afim-baked já revisado.

Essa correção também fez passar a curva fechada do antigo canário 5.14, sem aumentar tolerância: a primeira interpretação estava incompleta. O teste agora exige zero diferenças acima de um canal para essa curva. O aviso/consentimento de precisão continua legítimo para outros consumidores/casos, mas não substitui correção do compilador.

Ampliar a matriz para escala global anisotrópica compensada por basis local revelou que conservar só o global era insuficiente: cada limite de coordenadas com opacidade deve continuar local. Composições com contorno agora emitem todos os grupos/folhas no espaço local, usando as poses efetivas do avaliador compartilhado e basis/attrs já validados, sem inversão de pai singular. Fatoração afim do núcleo (`factorAffine`, SVD 2×2 com reescala) preserva reflexão/skew/rank-one/colapso sem shear infinito; 99 testes do núcleo passaram na rodada inicial, incluindo recomposição de 232 matrizes e extremos de magnitude. O emissor não ganha um segundo avaliador de rig/tempo. Transformações/quads/bytes têm orçamento e limites próprios, mantendo projeto v20/blueprint v9.

### Precisão restante realmente isolada

Após conservar os limites de composição, restou uma borda da curva aberta sob a compensação anisotrópica, no ponto de amostragem (188,93). Trocar somente os dois fatores locais emitidos pela matriz local precisa da referência — sem mover opacidade ou trocar pintura — fez a prova passar. A fatoração é matematicamente correta/recomposta nas unidades; o consumidor converte os fatores/curvas/matrizes para float32. Essa é a limitação de precisão isolada, distinta do defeito próprio corrigido acima. O probe foi retirado; a entrega mantém um canário explícito dessa combinação, com diferença observável, erro geométrico medido em todas as curvas menor que 0,001 unidade nessa fixture e consentimento obrigatório. Demais perfis continuam com a tolerância histórica de um canal. Não generalizar esse limite geométrico para documentos arbitrários nem anunciar igualdade universal de pixels.

Corpus em expansão: 29 perfis (20 anteriores + seis tracejados e três combinações globais/viewBox), incluindo o canário acima. UI também verifica padrão excessivo e anisotropia tardia bloqueando download sem mutar o draft. Primeira rodada de UI densa tinha três diagnósticos corretos, mas locator pressupunha um; corrigido para aguardar o primeiro e manter o botão bloqueado. Uma fixture tentou usar skew global fora do schema do projeto; foi corrigida para compensação de escala permitida, sem liberar campos/formato novos. Aviso/control de precisão 5.14 permanece separado da amostragem. Gates finais/nativo e atualização coerente dos índices ainda pendentes.

## Fechamento

192 testes do app, 99 do núcleo, 23 unidades focadas Lottie, tipos app/núcleo/tooling, 43 tooling, sintaxe/build, 61 E2E seriais e Next produção/Turbopack/SSR/hidratação passaram. Corpus independente: 29 perfis; 28 com tolerância de um canal nos pontos/quadros verificados, um canário externo de compensação anisotrópica com erro geométrico medido/consentimento, sem remendar o renderer. Curva 5.14 anteriormente divergente agora exige pixels dentro da tolerância normal. Fonte original, projeto e histórico permanecem preservados.

Electron selecionado concluiu com exit 0: fill e C anteriores preservados; terceiro perfil importa path L com padrão ímpar `8 4 2`, converte explicitamente pela UI, cria clip e exporta no Worker file/CSP com confirmações separadas. Save/Cancel e JSON completo foram comparados ao compilador; destino temporário exato e todos os undo restauraram o draft anterior. Captura `.cache/edi-native-results/edisvg-lottie-conversion.png` inspecionada. Passaram também licença/expiração/IPC, integridade/abertura visível, arquivos/recuperação, React ZIP e jornadas de SVG/fontes/áudio/rig. Nenhum instalador instalado/publicado nem operação de produção.

Revisão de arquitetura manteve apenas os avaliadores/operadores compartilhados, sem inversão de pai singular, campos secretos, casts/supressões ou delays. `paintTransforms`/`paintAngles` identificam transformações de todas as células, não somente contornos. O unwrap é compartilhado por visita, matrizes de contorno/validação são preparadas uma vez por objeto; preenchimento sem contorno mantém seu custo de seis operações por vértice, sem duplicar validação mundial idêntica. Todos os perfis retêm o teto agregado de dois milhões.

Check em 429 arquivos sem erros após corrigir duas formatações (opções readonly próprias e captura de falha concorrente no harness, sem mudar seu comportamento). Permanecem 15 warnings/nove infos legados visíveis e avisos de diretiva/module type no build/runner. Auditoria dev sem vulnerabilidades conhecidas; produção falha com os mesmos dois alertas altos do EdiPDF, fora do grafo SVG e sem exceção. Instalação congelada passou antes desta etapa; não houve dependência nova no 5.15. Limitação histórica do launcher comum continua registrada para full review, não declarada resolvida por passar nesta rodada.

Próxima frente 5.16: trim paths, começando por medição/inversão de arclength e contrato versionado para topologia transitória. Candidato em [review 5.16](review-lote-5-trim-paths.md). Gradientes/outros formatos, gráficos/tipografia/rig avançados, semântica/scripting, lote 6 e full review continuam obrigatórios. Este fechamento não certifica SVG/Lottie/Rive/RN integral.

Nota posterior, 18/10/2026: o [incremento 5.21](review-lote-5-lottie-gradientes.md) ampliou o corpus com transparência e gradientes sob transformação global/viewBox não zero. Esse perfil expôs e corrigiu uma divergência de composição: a normalização do viewBox passou para a layer, fora das fronteiras locais de pintura/opacidade. O corpus anterior foi repetido com a mesma tolerância, mantendo isolado seu canário float32. Esta nota não altera as evidências históricas acima; os gates atuais e o estado das auditorias devem ser consultados no review vigente.
