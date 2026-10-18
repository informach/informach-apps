# Review incremental 5.7 — descrição gráfica portátil

Data: 18/10/2026. Estado: implementado e revisado no perfil documentado. Não encerra lote 5, lote 6 ou full review final.

## Contrato e implementação

Projeto permanece v17; blueprint interativo emitido passa a v6. Cena e conteúdo carregam descrições visuais tipadas, com playback espacial v3 completo. PNG/fontes/PCM usados ficam uma vez no catálogo raiz `assets`; recursos sem referência não são exportados. O campo histórico `audioAssets` permanece aceito nos blueprints antigos, não é emitido em v6. Escopos independentes não misturam versões.

`/visual` centraliza descrição e serialização segura; Canvas, Testar, HTML interativo e React usam esse desenho. O HTML novo não embute uma segunda cópia dos bytes no SVG. `VisualArtwork` constrói elementos React; `createVisualSvgPlayerAsync` constrói SVG nativo a partir do documento validado, sem innerHTML de projeto. Fontes/imagens são carregadas antes de publicar a cena, cancelamento é propagado e descarte restaura os nós exatos/viewBox do host e libera recursos próprios.

Parser SVG limitado foi compartilhado com o editor. Arcos originais permanecem arcos nativos quando não há deformação; sua geometria espacial deve corresponder à sintaxe autoral. Recortes usam a mesma política, sem alterar os pixels para uma aproximação Bézier desnecessária. XML inválido, atributos ativos/URLs/expressões CSS dinâmicas, referências e hierarquias inválidas são recusados. Orçamentos de 4 MB do catálogo, 16 milhões de pixels PNG e 2.880.000 amostras PCM permanecem; um preflight antecipado não substitui validação de bytes/hash/dimensões.

## Evidências até aqui

- Tipos do editor/núcleo/tooling passaram; 150 testes do editor e 78 do núcleo passaram na rodada deste incremento. Sintaxe e check focado de 361 arquivos passaram sem erros, mantendo 15 warnings/9 infos legados visíveis. Não é declaração de check global aprovado.
- Quatro jornadas portáteis passaram em Edge: arco e recorte com pixels idênticos ao SVG original; cancelamento anterior à montagem preservando host; recusa de montagens concorrentes ativas/pendentes no mesmo SVG, cancelamento liberando posse/fontes e remontagem após descarte; catálogo com recurso não usado omitido; PNG/nine-slice/fonte efetivamente carregados; legenda de áudio sem som habilitado; descarte com liberação da fonte/restauração dos nós; execução histórica v1–v5, incluindo perfil v5 com fonte CSS/PCM/nine-slice/efeitos.
- Onze jornadas focadas de áudio/gradientes/nine-slice/ReactZIP/recortes passaram após a integração do renderer compartilhado. Não substituem a rodada completa final.

## Review integrado

Build final e rodada completa de 46 E2E passaram, incluindo React ZIP em consumidor isolado. Next 16.4.2 em produção/Turbopack, SSR e hidratação real passaram novamente. Aviso do bundler sobre a diretiva use client continua visível; os artefatos recebem a diretiva na entrada e o teste Next verifica o efeito real.

Jornada Electron completa passou: integridade física ASAR/EXE/receipt, startup/gerenciador, seis gates de licença/expiração/IPC e jornadas de arquivos/recuperação. O helper de pixels nativo agora parte de SVG vazio e usa o novo loader no ESM distribuído, sob file/CSP, para gradientes/nine-slice/recortes/máscaras; verifica pixels e restauração exata dos nós/viewBox. PNG/fontes/PCM, rig/IK/skin/morph/solo e exportação ZIP continuam aprovados. Captura `.cache/edi-native-results/edisvg-rig-runtime.png` inspecionada. A rodada nativa precedeu os últimos refinamentos de recusa de hierarquia ambígua, unificação do schema textual/escape e correção da mensagem de fontes; esses refinamentos passaram posteriormente em tipos, unitários, build, 46 E2E e Next. Não foram ocultados como uma nova repetição nativa.

Auditoria de produção não encontrou vulnerabilidades conhecidas. Não há homologação de hardware React Native, benchmark comparativo com Rive, publicação ou operação comercial.

Achados corrigidos: arcos SVG desnecessariamente convertidos em Bézier na renderização sem deformação; duplicação de bytes em HTML/React; recursos não usados exportados; montagem concorrente disputando o mesmo host; aquisição de nós/imagens antes da espera cancelável; atribuição ambígua de filhos na fronteira de um componente independente; schema/layout/escape textual concorrentes e mensagem antiga dizendo que fontes não eram incorporadas. Testes confirmam bytes únicos e recusas antes da publicação.

## Continuidade obrigatória

Demais pinturas/efeitos, importação avançada, tipografia/glyph coverage, rastermesh, joystick/timeline, formatos adicionais, semântica e scripting continuam no lote 5. Adapter React Native, bibliotecas/colaboração/acervo/desempenho e full review permanecem obrigatórios. Carregar fontes não comprova cobertura de glifos. O contrato portátil é uma fundação compartilhada, não uma alegação de suporte nativo já entregue.

Referências: [XML 1.0 — caracteres válidos](https://www.w3.org/TR/xml/#charsets), SVG 2 e CSS Masking consultados nos reviews gráficos anteriores; schemas conferidos na documentação oficial Zod/Context7 e na versão instalada.
