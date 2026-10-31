# EdiSVG Desktop

Aplicativo Electron baseado em `edisvg.pen`, com `main`, `preload`, `renderer` e `shared`. O canvas e os painéis existentes permanecem em JavaScript; interfaces novas, como o painel de pranchetas, usam React/TypeScript integrado sem reescrita visual integral.

## Recursos em evolução

### Fontes WOFF/coleções e imagens na Lottie — incremento 5.36

A importação de recursos aceita fontes WOFF e uma face de coleções TTC/OTC, convertidas sem perda para uma fonte avulsa (WOFF2 continua recusado). Na Lottie, imagens PNG sem nine-slice e sem malha viram camadas de imagem com o PNG incorporado, posição, escala, rotação e opacidade amostradas. [Contrato e gates 5.36](../../docs/reviews/edisvg-2026-10-17/review-lote-5-fontes-externas-lottie-imagens.md).

### Fórmulas — incremento 5.35

Inputs podem ser calculados por fórmulas, na aba *Fórmulas* de Dados: `clamp($input-pontos * 2, 0, 100)`, `se($input-fim, "Acabou", "Jogando")` ou `sen(tempo * 2)` para movimento procedural. As fórmulas são declarativas e tipadas, com limites de tamanho, e nada é executado como código. O input calculado fica somente leitura. [Contrato e gates 5.35](../../docs/reviews/edisvg-2026-10-17/review-lote-5-formulas.md).

### Semântica dinâmica — incremento 5.34

O nome e a descrição acessíveis de um objeto podem seguir um input: em Dados, crie um binding *Semântico* com um modelo como "Placar: {valor} pontos". No painel de semântica, *Anunciar mudanças* transforma o objeto numa região viva para leitores de tela. [Contrato e gates 5.34](../../docs/reviews/edisvg-2026-10-17/review-lote-5-semantica-dinamica.md).

### Malha raster — incremento 5.33

Imagens PNG agora deformam pelo rig. No painel da imagem, *Malha raster* cria uma grade de triângulos (até 16×16). Depois, em Restrições → Malha vetorial, vincule a imagem aos ossos, e os vértices da grade seguem o esqueleto como os de um caminho. HTML, React, Testar e vídeo mostram a deformação; SVG animado e Lottie recusam a malha deformada. [Contrato e gates 5.33](../../docs/reviews/edisvg-2026-10-17/review-lote-5-malha-raster.md).

### Texto em caminho — incremento 5.32

Um texto pode seguir uma curva: em *Texto em caminho*, no painel de texto, escolha uma forma do mesmo grupo e o início em porcentagem. O texto guarda uma cópia do contorno no próprio espaço, então mover o texto leva a curva junto, e editar a forma depois não muda o texto. SVGs importados com `<textPath>` local viram texto em caminho editável, com o mesmo desenho do navegador. Tem uma linha por texto; Lottie continua recusando texto. [Contrato e gates 5.32](../../docs/reviews/edisvg-2026-10-17/review-lote-5-texto-em-caminho.md).

### Shaping complexo e direção automática — incremento 5.31

Textos em árabe, nos scripts índicos e em outros sistemas de escrita com formas contextuais passam a exigir uma fonte que aplique as substituições OpenType desse script (por exemplo `init`/`medi`/`fina` no árabe). Sem elas, as letras sairiam isoladas ou fora de ordem, e Testar/exportar recusa com a explicação. O painel de texto ganha a direção **Automática (primeiro caractere forte)**, que também acompanha texto trocado por dados. [Contrato e gates 5.31](../../docs/reviews/edisvg-2026-10-17/review-lote-5-shaping-bidi.md).

### Ordem de desenho animável — incremento 5.30

Uma animação agora pode trocar a ordem de empilhamento dos filhos de um grupo, ou da raiz da prancheta, em degraus por quadro. No modo Animar, selecione um objeto e use **Subir/Descer neste quadro** em *Ordem de desenho*: cada clique grava uma chave no quadro atual. Estados, blends, camadas e relógios de componente usam a mesma ordem. HTML, React e vídeo preservam o empilhamento; SVG animado e Lottie recusam, sem descartá-lo. Mudar de grupo um objeto citado exige remover as chaves antes. [Contrato e gates 5.30](../../docs/reviews/edisvg-2026-10-17/review-lote-5-ordem-de-desenho.md).

### Trim no SVG animado e na Lottie — incremento 5.29

O recorte animável (5.16) agora chega também ao **SVG animado**, com o caminho trocado exatamente a cada quadro, e à **Lottie**, com formas de retenção por quadro para caminhos abertos. Os dois são amostrados: exatos nos quadros, sem interpolar entre eles. Contornos fechados com trim continuam exigindo HTML/React/SVG na Lottie. [Perfil e gates 5.29](../../docs/reviews/edisvg-2026-10-17/review-lote-5-trim-consumidores.md).

### Máscaras de luminância e pintadas — incremento 5.28

Em **Recortes e máscaras**, escolha o **Modo da máscara**: silhueta da forma (como antes), alpha da pintura ou luminância da pintura. Nos modos pintados a fonte entra com sua cor, gradiente ou padrão e contorno, herdados dos grupos. A importação SVG passa a aceitar máscaras de luminância (o padrão do SVG), gradientes, padrões e contornos na fonte. [Perfil e gates 5.28](../../docs/reviews/edisvg-2026-10-17/review-lote-5-mascaras-pintadas.md).

### Filtros — incremento 5.27

Na seção **Filtros** do painel de efeitos, aplique sombra projetada, desfoque, brilho externo, saturação, escala de cinza ou rotação de matiz; o resumo mostra o filtro atual e **Remover filtro** o retira, sempre com desfazer. O filtro trabalha dentro da transformação do objeto e antes do recorte/máscara, como no SVG. A importação aceita `<filter>` locais com desfoque, deslocamento, sombra, matriz de cor, cor sólida, mistura, composição e junção; funções CSS e entradas de fundo são recusadas. Lottie recusa filtros. [Perfil e gates 5.27](../../docs/reviews/edisvg-2026-10-17/review-lote-5-filtros.md).

### Padrões (tiles) — incremento 5.26

Em **Gradientes e padrões**, escolha **Padrão (tile)** no preenchimento ou no contorno: aplique um modelo (listras, pontos, xadrez, grade) com cores, tamanho, espessura e ângulo, ou ajuste o retângulo e a matriz de um padrão importado. O tile repete formas vetoriais de cor sólida e aparece igual no canvas, Testar, HTML, React, SVG e imagens; Lottie recusa padrões. A importação SVG aceita `<pattern>` locais, inclusive templates `href` e grupos transformados. Projeto v23/blueprint v12; arquivos anteriores migram com backup. [Perfil, achados e gates 5.26](../../docs/reviews/edisvg-2026-10-17/review-lote-5-padroes.md).

### `use` e `symbol` na importação — incremento 5.25

SVGs com sprites e ícones reutilizados agora importam: cada `use` local vira um grupo com uma cópia editável e independente do alvo; `symbol` ganha o ajuste de viewBox (`meet`, `slice`, `none`) e, quando o overflow é oculto, um recorte retangular editável. A revisão da importação informa quantas cópias e recortes foram criados. Referências externas, ciclos, porcentagens e mais de 8 níveis são recusados sem importar nada. Para reutilização viva, use componentes. [Perfil e gates 5.25](../../docs/reviews/edisvg-2026-10-17/review-lote-5-svg-use-symbol.md).

### Imagens e vídeo — incremento 5.24

Em **Exportar**, com uma animação por objeto selecionada, escolha **Sequência PNG · ZIP**, **GIF animado**, **Vídeo MP4 · H.264** ou **Vídeo WebM · VP9**. Cada quadro é desenhado pelo mesmo player do Testar/HTML/React e rasterizado no tamanho e FPS escolhidos (16–3840 px, até 60 FPS e 3600 quadros). PNG preserva alpha; GIF usa até 256 cores por quadro, transparência total ou nenhuma e até 50 FPS; vídeo é opaco, com cor de fundo e dimensões pares. É preciso confirmar a conversão em imagens e, em composições interativas, a exportação somente da timeline. Sem áudio, sem vídeo transparente e sem repetição embutida no vídeo. Projeto continua v22. [Perfil, achados e gates 5.24](../../docs/reviews/edisvg-2026-10-17/review-lote-5-exportacao-raster.md).

### Joysticks 2D — incremento 5.23

Rig v4/projeto v22/blueprint v11 vinculam um pad 2D a um alvo raiz. Eixos X/Y solicitados, envelope local quadrado/circular, canais e bindings compartilham o avaliador de IK/skin. O painel React permite arraste com prévia sem histórico, campos e teclado; cancelar restaura a cena, soltar confirma uma transação. Arquivos anteriores mantêm migração/backup e versões antigas recusam a capability nova. App/núcleo, 82 E2E, Next de produção, comparação independente Lottie e jornada Electron/ASAR passaram; veja o [review 5.23](../../docs/reviews/edisvg-2026-10-17/review-lote-5-joysticks.md) para os limites exatos. O [review integral](../../docs/reviews/edisvg-2026-10-17/full-review-2026-10-18.md) separa o entregue das pendências de lotes 5–6. Não é paridade Rive nem compatibilidade `.riv`.

### Gradientes relativos — incremento 5.22 revisado no perfil publicado

Preenchimentos lineares objectBoundingBox usam limites reais da geometria por quadro após morph/skin, com o mesmo avaliador e registrador amostrado. Bounds degenerados desativam apenas o fill; stroke sólido permanece. Perfil requer fonte path cúbica explícita; linhas/primitivas precisam de conversão autorável com prévia/consentimento. Move-only composto, radial relativo e demais perfis sem prova continuam recusados. Unidades/tipos/build, regressão completa, Next e Electron passaram no perfil documentado. [Contrato e evidências 5.22](../../docs/reviews/edisvg-2026-10-17/review-lote-5-lottie-bounding-box.md). O perfil seguinte é o 5.23 acima.

### Gradientes Lottie — incremento 5.21 revisado no perfil publicado

Perfil inicial 5.21 revisado para preenchimentos userSpaceOnUse/pad, RGB/alpha, transformações próprias e hierarquia local. ObjectBoundingBox, repeat/reflect, paradas mais precisas que porcentagens inteiras e stroke em gradiente são recusados. Composição viewBox/alpha e limites estruturais corrigidos; corpus independente, UI/consentimento/download, regressão completa, Next e Electron passaram no perfil documentado. [Contrato e evidências 5.21](../../docs/reviews/edisvg-2026-10-17/review-lote-5-lottie-gradientes.md). Extensão relativa revisada no 5.22 acima.

### Timeline unificada — incremento 5.20 revisado no perfil publicado

Projeção tipada, timeline virtual e comandos mistos distinguem motion/rig e pranchetas sem proibir IDs históricos válidos. Operador de tempo compartilhado mantém limites/colisões/IDs/hold; locks e falha parcial não publicam alterações. Editor React de curvas preserva draft/teclado/cancelamento e unidades reais. Scroll/foco e agrupamento de chaves densas foram corrigidos; app/núcleo, regressão completa, Next e Electron passaram no perfil documentado. [Contrato, evidências e limites 5.20](../../docs/reviews/edisvg-2026-10-17/review-lote-5-timeline-rig.md).

### Ciclo de animações e rig — incremento 5.19 revisado no perfil publicado

Duplicar um clip conserva seus canais de rig, eventos e vínculos de áudio com IDs novos, sem reconfigurar máquinas/componentes que usam a origem. Excluir remove apenas as dependências pertencentes ao clip, preserva assets/controladores e recusa referências externas/locks. A confirmação permite cancelar. Gates do app/núcleo, 73 E2E, Next produção e Electron completo passaram no perfil publicado, incluindo Cancel/Confirm e histórico exato. Tipos do tooling têm bloqueio concorrente registrado no review. [Contrato e progresso 5.19](../../docs/reviews/edisvg-2026-10-17/review-lote-5-ciclo-animacoes-rig.md).

### Proteção da entrada SVG — incremento 5.18 revisado no perfil publicado

Soltar arquivos sobre campos ou diálogos cancela a ação padrão sem importar; seletores de arquivo habilitados preservam sua seleção nativa. Editabilidade herdada/plaintext-only e fieldsets desabilitados são tratados. Abrir a revisão não aplica o SVG: cancelar preserva o projeto e confirmar cria uma edição reversível. Gates do app/núcleo, tipos/build, 71 E2E, Next produção e Electron passaram no perfil publicado; cursor físico do Explorer não homologado. [Contrato, evidências e limites 5.18](../../docs/reviews/edisvg-2026-10-17/review-lote-5-entrada-svg.md).

### Duplicação de rig — incremento 5.17 revisado no perfil publicado

Duplicar objeto/grupo agora copia trim/morph/solo e seus canais, bindings/listeners e máscaras de camadas. Ossos/skin/restrições exigem um subtree fechado contendo as referências: matrizes de bind são conservadas, não recapturadas automaticamente. Solo exige copiar o grupo inteiro, sem deslocar índices dos canais antigos. Inputs e dados da mesma prancheta continuam compartilhados; use componentes para estado independente. Tipos do app/núcleo, testes unitários, regressão completa de navegador, UI/histórico/reabertura, teclado, ZIP React, Next produção e Electron passaram no perfil documentado. Writers de recursos antigos preservam Rig v3; bloqueios transversais concorrentes estão no review. [Contrato e progresso 5.17](../../docs/reviews/edisvg-2026-10-17/review-lote-5-duplicacao-rig.md).

### Recorte animável — incremento 5.16 revisado no perfil publicado

Selecione um path e abra Restrições para configurar início/fim (%), offset (graus), tolerância de comprimento local e modos por contorno/caminho inteiro. O avaliador aplica o recorte após morph/skin, sem modificar a fonte salva; parâmetros usam os relógios/blends/bindings existentes. O código emite projeto v21/Rig v3/blueprint v10 e preserva a leitura/migração/backup dos formatos anteriores. Arcos nativos exigem conversão explícita com confirmação de aparência. HTML/React usam o runtime real; desde o 5.29 SVG/SMIL animado e Lottie (caminhos abertos) amostram o trim por quadro. No marco 5.16, a duplicação parcial era recusada; o 5.17 acima permite deformadores locais/subrigs fechados, mantendo recusa de referências incompletas. Núcleo, transações, UI, players, regressão completa de navegador/Next e Electron passaram; o review do perfil foi fechado. Demais recursos dos lotes 5/6 e full review continuam pendentes. [Contrato e progresso 5.16](../../docs/reviews/edisvg-2026-10-17/review-lote-5-trim-paths.md).

### Tracejados Lottie e composição — incremento 5.15 revisado

O emissor aceita listas numéricas locais limitadas, repetição de listas ímpares e padrão zero contínuo, com recusa por densidade inicial ou introduzida por deformação. Composições com contorno agora preservam espaços locais de pintura/grupos/transformação global, corrigindo bordas sob transparência; composições somente de preenchimento mantêm seu perfil afim-baked. O antigo caso de curva fechada 5.14 passou após essa correção estrutural. Uma combinação de compensação anisotrópica ainda tem diferença de precisão do consumidor explicitamente verificada, sem aumentar tolerância dos outros perfis. 192 testes do app/99 núcleo, 61 E2E, Next produção e Electron passaram no perfil documentado. [Contrato, diagnóstico e gates 5.15](../../docs/reviews/edisvg-2026-10-17/review-lote-5-lottie-tracejados.md).

### Conversão cúbica e precisão Lottie — incremento 5.14 revisado

O painel de vértices oferece conversão explícita para Bézier cúbica, com miniaturas de geometria, confirmação e uma edição reversível. Não muda o arquivo até salvar, não converte durante exportação e recusa dependências incompatíveis. Arcos usam a aproximação já declarada do editor. A comparação ampliada identificou uma limitação do consumidor Lottie float32: até curvas C sob matriz conforme podem apresentar diferenças nas bordas em quadros amostrados. O novo contrato exige consentimento independente de precisão, além da amostragem; não promete identidade universal de pixels. Gates integrados e Electron passaram no perfil documentado; os limites permanecem explícitos. [Provas, achados e limites 5.14](../../docs/reviews/edisvg-2026-10-17/review-lote-5-conversao-vetorial.md).

### Contornos Lottie — incremento 5.13 revisado no perfil inicial

O compilador mantém geometria e transformação juntas para contornos de paths Bézier cúbicos explícitos, preservando largura local, cap/join, alpha e composição. Inspeção verifica todas as amostras, inclusive anisotropia tardia, com orçamento/cancelamento compartilhados. Renderer independente, UI/download, regressão completa, Next e Electron Save/Cancel passaram. Linhas/primitivas com contorno, tracejados e matrizes não conformes permanecem recusados; não são convertidos silenciosamente. Cores RGB legadas normalizam alpha no parser comum, conforme o navegador de referência. Não representa suporte integral a contornos/Rive/RN. [Achados, limites, gates e pendências 5.13](../../docs/reviews/edisvg-2026-10-17/review-lote-5-lottie-contornos.md).

### Importação clip/mask — incremento 5.12 revisado no perfil inicial

O marco 5.12 introduziu projeto v20/blueprint v9 para permitir primitivas nativas como fontes de recorte/máscara, sem convertê-las silenciosamente em path com rasterização diferente. Pixels estáticos/animados, adversariais, UI/arrastes/duplicação/recuperação, HTML offline, ZIP React, regressão completa, Next e Electron passaram. Arquivos v1–v19 mantêm migração/backup; blueprints v1–v8 mantêm seus contratos. O perfil de importação é local, de uma geometria por definição, userSpaceOnUse e máscara alpha explícita com região absoluta inicialmente não restritiva para a silhueta. Depois de importar, a máscara segue as regras de silhueta do editor, não um recorte regional animável do SVG original. Não é cobertura integral de SVG. [Contrato, achados, gates e pendência de auditoria global 5.12](../../docs/reviews/edisvg-2026-10-17/review-lote-5-svg-efeitos.md).

### Exportação Lottie — incremento 5.11 revisado no perfil inicial

O diálogo oferece Lottie JSON real por animação selecionada, com relatório no Worker, consentimentos explícitos, amostragem limitada e cancelamento. Perfil inicial de grupos/formas com preenchimento sólido; contornos, gradientes, texto/imagens, recortes/componentes/layout são recusados, não descartados. O endpoint inclusivo de once requer um quadro de retenção adicional; loop/ping-pong dependem da política de repetição do consumidor. Não é arquivo de projeto, runtime interativo ou `.riv`. Comparação independente no renderer SVG light 5.13.0, download, Save/Cancel nativo e regressão navegador/Next passaram; isso não homologa outros renderizadores Lottie ou React Native. [Contrato, evidências e pendências 5.11](../../docs/reviews/edisvg-2026-10-17/review-lote-5-lottie.md).

### Importação semântica SVG — incremento 5.10 revisado

Nomes e descrições simples (`title`/`desc`, `aria-label`, referências locais `aria-labelledby`/`aria-describedby`) passam ao modelo editável dentro do perfil publicado. Group/img e elementos decorativos são preservados; controles sem ações, idiomas ainda não modelados, markup rico, IDs ambíguos e referências não suportadas são recusados. Descrição sem nome e metadados fora da conversão recebem aviso e ficam na fonte original; títulos convertidos não recriam o tooltip SVG. O texto visível não incorpora title/desc. Semântica isolada pode ser conferida em Testar. [Gates e limites 5.10](../../docs/reviews/edisvg-2026-10-17/review-lote-5-svg-semantica.md).

### Semântica acessível — incremento 5.9 revisado

O inspetor permite marcar elementos como decorativos, grupos, imagens ou botões com nome/descrição próprios. O marco 5.9 introduziu projeto v19/blueprint v8; o código v21/v10 em desenvolvimento preserva essa semântica. Botões precisam de listener de ativação; elementos decorativos/imagens não podem esconder controles descendentes, inclusive em componentes. Configurações incompletas podem ser salvas; Testar/export interativo recusa contradições antes de assumir o SVG. Export estático não anuncia botões inativos. [Perfil e gates 5.9](../../docs/reviews/edisvg-2026-10-17/review-lote-5-semantica.md). Não representa acessibilidade integral ou homologação por leitor de tela/dispositivo.

### Cobertura e fontes alternativas — incremento 5.8 revisado

O painel de texto permite ordenar até sete fontes incorporadas alternativas e mostra diagnóstico de cobertura cmap por grupo de caracteres. Novos testes/exports portáteis exigem cobertura na cadeia; você pode continuar editando e salvando o projeto para corrigir o texto/fontes. No marco 5.8 o formato passou a projeto v18/blueprint v7, com backup de migração e contratos históricos preservados. Cobertura não comprova shaping/ligaturas nem substituição do Rive. [Review e gates do 5.8](../../docs/reviews/edisvg-2026-10-17/review-lote-5-tipografia.md).

### Desenho portátil — incremento 5.7 revisado

Canvas, Testar, HTML interativo e React usam a descrição gráfica compartilhada de `edi-motion`. No marco 5.7, o compilador passou a emitir blueprint v6 com dados visuais tipados e catálogo raiz só dos recursos usados; o projeto permaneceu v17. O HTML constrói o desenho a partir desses dados validados, sem repetir os bytes das fontes/imagens no markup. O novo loader libera seus recursos e restaura o SVG original ao encerrar. Blueprints anteriores v1–v5 permanecem aceitos pelo loader histórico. [Review, verificações e pendências](../../docs/reviews/edisvg-2026-10-17/review-lote-5-visual-portatil.md). Não equivale a homologação de React Native ou conclusão do lote 5.

### Recortes e máscaras alpha — incremento 5.6

O inspetor associa recorte e máscara a outro caminho da mesma prancheta, com regra não zero/par-ímpar e intensidade alpha. A fonte acompanha transformações e geometria deformada, mesmo oculta. Máscara de silhueta usa sua própria opacidade TRS; não representa pintura/luminância nem opacidade dos pais. Canvas, Testar, HTML interativo e React compartilham o cálculo; cada player possui definições mutáveis isoladas. Projeto canônico v17 aceita v1–v16 pelo migrador/backup existente; blueprint v5 mantém v1–v4. O exportador antigo de clips recusa este perfil; importação de defs clip/mask continua pendente. [Perfil e revisão 5.6](../../docs/reviews/edisvg-2026-10-17/review-lote-5-recortes.md).

### Gradientes — incremento 5.5

O inspetor permite gradientes lineares/radiais em preenchimento/contorno de formas, textos e grupos: 2–32 paradas, alpha, coordenadas, spread e matriz local. Estilos, herança, reparenting e overrides preservam o contrato; aplicar cor sólida troca o canal correspondente. SVG/HTML/React usam definições deduplicadas por conteúdo. A importação SVG preserva gradientes/templates locais dentro do perfil publicado e recusa referências externas/defs não suportados. [Perfil, review e evidências](../../docs/reviews/edisvg-2026-10-17/review-lote-5-gradientes.md). Múltiplas pinturas/efeitos adicionais continuam no lote 5; recortes e máscaras alpha seguem o perfil 5.6 acima.

### Nine-slice visual — incremento 5.4

Selecione uma imagem para editar dimensões e ativar **Preservar bordas com nine-slice**. Informe as quatro bordas em pixels da origem; centro/faixas esticam e cantos conservam tamanho quando possível. Layout responsivo usa as mesmas células em Testar/HTML/React. No marco 5.4, o formato passou a v16/blueprint v4; o formato atual v21/v10 em desenvolvimento mantém essa extensão e o backup existente. A imagem permanece deduplicada, e pintura vetorial não é oferecida como edição de raster. Perfil, filtragem e limites no [review 5.4](../../docs/reviews/edisvg-2026-10-17/review-lote-5-imagens-slice.md). Ainda não encerra lotes 5–6/full review.

### Áudio por eventos — incremento 5.3

Na aba Recursos, importe WAV PCM16 e associe a um evento existente da timeline, com volume e alternativa textual. A prévia Testar e as exportações HTML interativo/React começam sem som, oferecem ativação/volume e mostram alternativas também desativadas. API/ref inclui `enableAudio`, `disableAudio`, `setAudioVolume`, `inspectAudio`, `onAudioCue` e `onAudioStateChange`; a API do player também oferece `destroyAsync`. Há um mixer por cena, 32 vozes e cache por hash. São efeitos pontuais, não trilha sonora contínua. SVG/HTML de timeline exigem confirmação explícita pela perda. Contratos, evidências e limitações no [review 5.3](../../docs/reviews/edisvg-2026-10-17/review-lote-5-audio.md). Restante do lote 5, lote 6 e full review permanecem em execução.

## Executar e distribuir

Requer Node.js 24.15.0, pnpm 9.15.0 e o workspace da raiz. O alvo homologado da suíte é Windows x64.

```sh
pnpm install --frozen-lockfile
pnpm --filter @informach/edisvg dev
```

Execute a instalação na raiz. `dev` abre o Electron; `build` compila main/preload/renderer e `start` abre a compilação. Login e licença vêm do SDK compartilhado; use o [guia de desenvolvimento Edi](../../docs/desenvolvimento-edi.md) para preparar um ambiente local, sem credenciais de produção.

```sh
pnpm --filter @informach/edisvg build
pnpm --filter @informach/edisvg start
```

Distribuição comercial usa o pipeline comum da suíte, NSIS e GitHub Releases público `informach/edi-releases`. Manifestos e inventários têm assinatura Ed25519 própria; isso não é Authenticode. Os scripts legados de pacote portátil não substituem esse pipeline. Builds locais não publicam nem atualizam os clientes. Consulte o [padrão desktop](../../docs/arquitetura-desktop.md).

## Estrutura

- `src/main`: janela Electron, arquivos, clientes de IA e servidor MCP.
- `src/preload`: API restrita entre Electron e interface.
- `src/renderer/src`: editor, exportações e painel do assistente.
- `src/renderer/public`: mascote vetorial original.
- `src/shared`: animação, validação de projetos e ferramentas de IA.
- `scripts`: verificações, pacote e atalho.

## Claude Code e Codex

**Assistente** abre o chat no editor. Escolha o provedor e, opcionalmente, o modelo. Modelo vazio usa o padrão do cliente. Faça login nos clientes oficiais pelo terminal antes de usar o painel (`claude` ou `codex login`). O aplicativo usa esses logins existentes sem armazenar ou copiar credenciais. A conversa fica em memória; **Nova conversa** limpa o histórico; **Parar** encerra a solicitação.

Claude recebe apenas ferramentas MCP do EdiSVG. Codex roda em diretório separado com sandbox `read-only` e sem configuração global. Isso não é isolamento completo de leitura do computador. Ambos recebem instruções para atuar nas ferramentas do editor, sem flags de bypass de permissões.

Use o botão de conexão do assistente para registrar o MCP no cliente escolhido; essa ação explícita configura a autenticação limitada à ferramenta. Não copie tokens para prompts, projetos ou logs. MCP escuta apenas em `127.0.0.1:47322`, exige token e licença, recusa Origin de navegador e valida parâmetros. Estar no mesmo computador não autoriza acesso. A porta é diferente da usada pelo EdiAula.

Ferramentas: `get_overview`, `get_objects`, `get_object`, `get_attribute`, `get_animation`, `get_track`, `edit_document`, `select_clip`, `select_artboard`, `get_component`, `get_component_value`, `set_transform`, `set_animation`, `rename_project`, `seek_frame`, `add_keyframe`, `undo`, `redo`. `edit_document` usa a mesma transação da interface, exigindo projeto, sessão e revisão recém-inspecionados; leituras grandes têm paginação explícita. O histórico é compartilhado entre edições manuais e da IA: desfazer atua na última edição do projeto, independentemente de quem a fez. A integração usa CLIs, não chamadas diretas às APIs pagas. Login, conectividade e limites da conta afetam as respostas.

## Projetos e escopo

Fontes TTF/OTF de face única exigem consentimento explícito de incorporação, fontAssetId tipado, carga efetiva e preservação de avisos nas exportações ([perfil 5.2](../../docs/reviews/edisvg-2026-10-17/review-lote-5-fontes.md)). WOFF2/coleções não são aceitos. O [perfil 5.8](../../docs/reviews/edisvg-2026-10-17/review-lote-5-tipografia.md) acrescentou cobertura por cluster e fallback incorporado verificável; carga da fonte e cobertura são validações diferentes. Shaping avançado, texto em caminho e conversão em contornos ainda não estão homologados. Áudio por eventos consta no perfil 5.3 acima.

Na aba Recursos, importe PNG estático, WAV PCM16 limitado ou TTF/OTF do perfil descrito acima; renomeie/exclua recursos, insira imagens ou aplique fontes ao texto. Conteúdo idêntico compartilha identidade e bytes; excluir recurso ainda usado é recusado. Normalização de PNG fora do perfil requer consentimento por perda de metadados/perfil de cor e não altera o original. SVG/HTML/React levam imagens e fontes offline uma vez por conteúdo. WAV PCM16 é reproduzido por eventos no perfil 5.3 descrito acima; formatos adicionais e áudio contínuo não estão certificados.

Estado em 18/10: projeto v22 com `artboards[{id,name,scene}]`, `defaultArtboardId` e catálogo raiz `assets`; blueprint emitido v11/Rig v4 para joystick. Não existe `project.scene` na persistência: `state.scene` é apenas a referência de workspace para a prancheta aberta. Use `artboardScene` na leitura do documento e `bindActiveArtboard`/`replaceActiveScene` no canvas. Arquivos v1–v21 preservam migração/validação e backup exato no primeiro salvamento. Preferências ficam separadas em `edisvg-workspace`, nunca no histórico do conteúdo. O [review 5.23](../../docs/reviews/edisvg-2026-10-17/review-lote-5-joysticks.md) registra os gates do perfil atual; o [review integral](../../docs/reviews/edisvg-2026-10-17/full-review-2026-10-18.md) documenta o que falta nos lotes 5–6. Não confundir o formato vigente com os marcos históricos abaixo.

**Artboards** cria, dimensiona, renomeia, duplica, define a prancheta inicial e exclui com confirmação/Undo. HTML e SVG usam a prancheta aberta; JSON conserva o projeto inteiro. Na hierarquia, Shift/Ctrl/Meta + clique seleciona várias camadas; **Agrupar**, **Desagrupar** e **Grupo pai** usam comandos atômicos, conservando IDs/trilhas e o espaço das transformações. Reorganização que alteraria transparência composta ou atravessaria grupos animados é recusada explicitamente, não aproximada.

**Arquivo** abre/salva projetos `.edisvg` com diálogos nativos. Ctrl+O abre, Ctrl+S salva no arquivo atual (ou pede um destino no primeiro salvamento) e Ctrl+Shift+S abre Salvar como. O título mostra o nome do arquivo e um ponto quando há alterações pendentes. Abrir outro projeto ou fechar a janela oferece Salvar, Descartar e Cancelar. Cancelar o diálogo de salvamento também cancela o fechamento/substituição. Falhas de gravação mantêm o documento pendente; a escrita usa um temporário no mesmo diretório, sincroniza seu conteúdo e só então substitui o destino. As exportações HTML, SVG e JSON continuam usando Salvar como.

O `.pen` é a referência de design e permanece intacto; não é o formato de projeto do aplicativo. Projetos v22 preservam identidade, pranchetas, animações por objeto, recursos e Rig v4, além dos presets legados. Arquivos v1–v21 são migrados em memória; no primeiro salvamento sobre o original, o app cria antes uma cópia byte a byte `.v<versão>.<uuid>.bak` no mesmo diretório. Falha de backup impede a substituição. Para restaurar, copie esse backup para outro nome `.edisvg` e abra-o; não substitua o original sem conferir ambas as versões. Alteração externa bloqueia o salvamento comum e orienta Salvar como. Versões/campos futuros são recusados sem remoção silenciosa. O histórico guarda até 100 edições e 32 MB, contando metadados dos checkpoints e corpos únicos de recursos referenciados (não um teto exato da memória do processo); abrir outro projeto limpa o histórico. Ctrl+Z desfaz, Ctrl+Shift+Z ou Ctrl+Y refaz. Navegação/seleção não é edição; desfazer mantém o contexto da timeline quando possível.

Desenho vetorial, caneta Bézier, edição de vértices e propriedades por objeto funcionam. Em **Nova animação**, defina nome, FPS e duração; selecione um objeto, grave a pose e use Autochave para editar transformações em outros quadros. A timeline apresenta trilhas reais de x/y/rotação/escala/opacidade/pivô/skew. Shift/Ctrl seleciona várias chaves; **Mover / copiar** aplica deslocamento e escala temporal de uma vez. Zoom temporal virtualiza linhas/glifos; chaves próximas indicam agrupamento e podem ser separadas ampliando o zoom. Onion skin e área de trabalho são contexto de prévia, não alteram o export. Arraste uma chave para reposicioná-la ou use **Editar chave** (também Enter) para quadro, valor e interpolação linear/degrau/Bézier; a prévia gráfica usa o avaliador real, com alças Bézier arrastáveis/teclado e elástico oscilatório. No canvas, alças de escala/rotação, pivô local, espelhamento, alinhamento/distribuição, posição global e grade são operações reais e reversíveis. Escape, cancelamento de ponteiro, perda de foco e descarte da interface cancelam o arraste sem modificar o projeto. Colisões não substituem outras chaves. **Duplicar** conserva conteúdo com IDs novos. Os presets globais continuam separados como legado: seus marcadores não guardam poses. O [motor tipado](../../packages/edi-motion/README.md) é compartilhado pelo editor e pelo HTML offline; SVG é amostrado no FPS do documento (60 Hz para presets), com diagnóstico e limite de recursos. Interação fixa pertence somente à demonstração.

O [review de vetores/importação/workspace](../../docs/reviews/edisvg-2026-10-17/review-lote-2-vetores.md) registra o núcleo de autoria. O [review de layouts/dados/React](../../docs/reviews/edisvg-2026-10-17/review-lote-3-layout-dados.md) registra layout responsivo local, modelos/listas/links, ZIP React e prova Next.js. O catálogo seguro de assets e os perfis vetoriais de rig/morph/solo/skin/joystick já estão integrados nos reviews 4 e 5. Tipografia/SVG avançados, malha raster, scripts, colaboração, formatos adicionais e React Native continuam pendentes no [review integral](../../docs/reviews/edisvg-2026-10-17/full-review-2026-10-18.md).

A recuperação nativa fica em `userData/recovery-v1.json`, fora da instalação, com formato versionado, validação e escrita atômica. Ao iniciar, o app oferece recuperar ou descartar o rascunho antes de substituí-lo. Recuperar cria uma cópia sem associação ao arquivo original. Um marcador de limpeza impede recuperar novamente um autosave antigo após salvar/descartar. Cópia inválida ou erro de leitura bloqueia a edição e preserva os bytes. A cópia anterior do navegador é migrada apenas se ainda não houver registro nativo. No modo navegador, a recuperação usa a cópia local e confirmação explícita.

## Rig e deformação em execução

Perfil vetorial implementado e revisado nos [reviews 4.2](../../docs/reviews/edisvg-2026-10-17/review-lote-4-canais-deformacao.md) e [4 integrado](../../docs/reviews/edisvg-2026-10-17/review-lote-4-integrado.md): Design edita a referência; Animar/Testar usam FK/IK limitado, distância/cópia/caminho, skin de âncoras/alças, morph e solo. Canais/bindings compartilham clocks, blends e interrupções com TRS. Rig v1/v2 permanecem aceitos; v3 acrescenta trim no [perfil 5.16](../../docs/reviews/edisvg-2026-10-17/review-lote-5-trim-paths.md), v4 acrescenta o [joystick 2D limitado 5.23](../../docs/reviews/edisvg-2026-10-17/review-lote-5-joysticks.md), sem rebaixar a versão nas edições. A [duplicação 5.17](../../docs/reviews/edisvg-2026-10-17/review-lote-5-duplicacao-rig.md) conserva subrigs fechados e matrizes de bind. O projeto atual é v22; malha raster/triangulação permanece pendente. A timeline mista 5.20 foi revisada no perfil publicado, sem concluir o lote 5.

## Verificação

Para reutilizar uma prancheta, abra **Artboards → Reutilizar outra prancheta como componente** na prancheta de destino. O inspector configura tamanho/encaixe/clip e overrides; **Adicionar ao rascunho** não grava o documento, **Aplicar instância** grava tudo como uma edição. Instâncias sem lógica/layout próprio mantêm o perfil de pose-base ou animação sincronizada à fase externa. Componentes com lógica/layout têm sessões independentes por instância, uma única coordenação temporal da cena, inputs iniciais locais e máquina inicial configurável. Offset não se aplica a esse perfil; referências incompatíveis são recusadas. O painel Testar expõe componentes, modelos e listas sem modificar o projeto. HTML/SVG animados com componentes exigem uma animação por objeto selecionada. Referências cíclicas, exclusão de origens em uso e excesso de custo expandido são recusados atomicamente.

```sh
pnpm --filter @informach/edisvg check
pnpm --filter @informach/edisvg typecheck
pnpm --filter @informach/edisvg test
pnpm --filter @informach/edisvg build
pnpm --filter @informach/edisvg test:e2e
pnpm edi:test:native edisvg
```

Os testes cobrem geometria, animação predefinida, exportações, arquivos reais, recuperação, validação e MCP HTTP. `check` verifica sintaxe, não tipos. `typecheck` verifica TypeScript novo e dependências; JavaScript legado ainda não possui `checkJs` integral. E2E exige Chromium do Playwright (`pnpm --filter @informach/edisvg exec playwright install chromium`) ou o canal instalado `EDISVG_TEST_BROWSER_CHANNEL=msedge`/`chrome`; usa perfis descartáveis, renderer compilado, download real e execução do HTML produzido. Não usa arquivos pessoais, conta real ou IA paga. O harness nativo cobre licença/expiração/IPC e preservação; não deve ser confundido com homologação completa de autoria ou de todos os diálogos.

Não copie `node_modules` entre apps; dependências e lockfile são geridos pelo workspace pnpm.

## Plano de construção

O estado atual dos lotes aprovados em 17/10 está no [plano de implementação](PLANO-DE-IMPLEMENTACAO.md#execução-autorizada-em-17102026). A análise e os 90 requisitos anteriores continuam preservados. As seções abaixo são histórico de incrementos anteriores à evolução atual; números de testes, versões, pendências e instruções históricas não substituem o estado acima nem os gates do plano.

As entregas seguem dependências técnicas. Cada incremento deve ter testes relevantes, build e pacote atualizados. Não marcar uma etapa como concluída apenas porque a tela existe. IA deve chamar as mesmas operações usadas pela interface e respeitar o histórico do projeto.

| Etapa | Entrega | Critério de conclusão | Situação |
| --- | --- | --- | --- |
| 1. Base confiável | Histórico compartilhado, documento versionado, salvar/abrir, recuperação e indicação de alterações | Reabrir sem perda de dados; desfazer/refazer edições manuais e da IA; cancelar operações sem modificar arquivo | Em andamento |
| 2. SVG e camadas | Importação segura de SVG, objetos com IDs, grupos, seleção, visibilidade, bloqueio e transformações por objeto | Importar um SVG real, editar um elemento, salvar/reabrir e exportar preservando os demais | Implementa??o b?sica; valida??o nativa pendente |
| 3. Animação real | Trilhas por propriedade, keyframes com valores, interpolação, duração e múltiplas animações | A timeline calcula a mesma pose no editor e na exportação; cada animação mantém suas próprias chaves | Planejada |
| 4. Estados e interação | Criação de estados/transições, condições, inputs, eventos e prévia | Montar uma interação nova sem alterar código e reproduzi-la no player | Planejada |
| 5. Rig e deformação | Hierarquia de ossos, pivôs, IK e, depois, malha/morph | Manipular um membro sem mover o personagem inteiro e salvar o rig | Planejada |
| 6. IA ampliada | Ferramentas de objetos, trilhas e estados; progresso, cancelamento e edições agrupadas | Claude e Codex completam uma tarefa real por ferramentas, com desfazer e mensagens de erro verificadas | Planejada; integração básica já existe |
| 7. Exportação e distribuição | Player web fiel ao editor, pacote interativo, instalador e revisão de desempenho/acessibilidade | Projeto exportado funciona offline e instalação Windows passa pelos fluxos essenciais | Planejada; pacote portátil básico já existe |

### Incremento 1.1 — implementado

- Desfazer/refazer compartilhado entre interface e IA, com botões, atalhos e menu desktop.
- Limite de 100 edições, isolamento das cópias e descarte de redo ao criar uma nova edição.
- Abertura de projeto limpa o histórico; abertura durante uma resposta da IA é impedida.
- Cópia local e arquivo preservam os campos atuais do documento, incluindo modos e inputs.
- Validação de propriedades antes da edição; falha de armazenamento local é informada.
- Testes de histórico, persistência e compatibilidade, além da suíte existente.

### Incremento 1.2 — implementado; validação nativa pendente

1. Marcadores por animação, preservados na alternância, no histórico e nos arquivos. Projetos anteriores migram ao abrir, sem perder as chaves que já guardavam.
2. A máquina de estados usa sua animação de prévia sem trocar a animação selecionada no documento.
3. Ctrl+S, Salvar como, nome/caminho e indicador de alterações pendentes.
4. Escrita atômica e proteção ao fechar/abrir, incluindo cancelamento e erro de gravação. Operações de arquivo são serializadas; ferramentas MCP são recusadas temporariamente enquanto há diálogo de arquivo. Descartar remove a cópia local pendente para não recuperá-la na próxima abertura.
5. A recuperação local restaura os dados atuais do documento como projeto sem arquivo associado, evitando sobrescrever automaticamente um arquivo de uma sessão anterior. Não é recuperação garantida contra falha do disco nem substitui o salvamento em arquivo.

### Incremento 2.1 — implementado; validação nativa pendente

**Novo projeto (Ctrl+N)** cria um documento vazio de 1080 × 1080, sem vínculo com o arquivo anterior. Alterações pendentes passam pelo diálogo Salvar/Descartar/Cancelar. O painel permite adicionar um retângulo ou usar **Importar SVG (Ctrl+I)**.

A importação substitui a arte atual e pode ser desfeita. Aceita grupos, paths, retângulos, círculos, elipses, linhas, polígonos e texto simples. Camadas importadas possuem seleção, nome, visibilidade, bloqueio e transformações individuais. Grupos bloqueados impedem editar as transformações dos descendentes. O SVG original é preservado como dado no projeto; somente o modelo validado é renderizado.

Scripts, eventos e referências externas são recusados. Gradientes, máscaras, imagens, símbolos/use, estilos complexos e outros recursos ainda não são suportados; nesses casos a importação informa o erro e mantém a arte anterior. A validação automatizada cobre o modelo, persistência, histórico, exportação e rejeições antes do parser; o ciclo completo com o parser XML e os diálogos ainda precisa ser validado na janela Electron.

O formato de projeto agora é versão 2: esta versão abre arquivos da versão 1, mas aplicativos anteriores não abrem o novo formato. As exportações HTML e SVG usam os objetos do documento atual. As animações continuam globais e predefinidas; estados interativos do mascote não são aplicados aos SVGs importados.

### Próximo incremento — 2.2

Ampliar a compatibilidade de importação e implementar manipulação direta no canvas, duplicação e agrupamento. Depois, avançar para trilhas e keyframes por objeto.

### Publicação na web

Hoje é possível exportar HTML independente e SVG animado para hospedagem ou incorporação em uma página. O arquivo `.edisvg` é o projeto editável, não um player web. Um runtime JavaScript que carregue esse arquivo, com animações e estados equivalentes ao editor, pertence à etapa 7. Não há importação/exportação de `.riv` nem compatibilidade com o runtime do Rive.

Antes de considerar a etapa 1 concluída, ainda é necessário testar os diálogos e fechamento na janela Windows e uma solicitação real de cada provedor. Os testes automatizados exercitam o controlador de arquivos com diálogos simulados; a execução Electron e os modelos não foram validados neste ambiente restrito.

A validação visual/nativa continua pendente. A curva de interpolação e os ossos ainda representam o protótipo. O mascote de demonstração mantém sua lista de camadas ilustrativa; projetos novos e SVGs importados usam a hierarquia real descrita acima.

## Pintura no inspetor (27/10/2026)

No modo Design, selecione uma forma e clique na amostra de **Preenchimento** ou **Contorno** no painel direito. O seletor flutuante permite escolher a cor pela área de saturação/luminosidade, ajustar matiz e opacidade, amostrar a tela ou usar uma cor da paleta da prancheta. O hexadecimal continua disponível como entrada opcional. **Aplicar cor** cria uma única edição desfeita pelo histórico; os rascunhos no seletor não alteram a arte. Os botões `+` e `−` ativam ou removem cada pintura, e a espessura do contorno fica logo abaixo. Gradientes e padrões, estilos e paleta ficam em seções expansíveis. Organização, efeitos, acessibilidade e layout também começam recolhidos; pintura e transformação permanecem à vista. Foram removidos textos explicativos do inspetor, sem retirar os controles dessas seções. O formato do projeto e os contratos de pintura permanecem os mesmos: uma pintura por canal, sem camadas múltiplas de fills/strokes como no Rive.

O ajuste foi integrado à `main` local, sem push. Build, typecheck, teste de conversão de cor, 290 testes do app e 119 E2E passaram. A inspeção visual foi feita por captura do renderer compilado. Ainda falta validação manual na janela Electron com mouse e teclado.

## Inspetor da prancheta (27/10/2026)

Sem objeto selecionado, o painel direito configura a prancheta ativa. Nome, largura e altura são editados diretamente; o vínculo de proporção ajusta a outra dimensão na mesma edição. O painel apresenta layout dos filhos com fluxo horizontal, vertical ou grade, alinhamento, distribuição, espaços, direção, quebra de linha, padding por lado e recorte. Essas alterações usam os comandos de prancheta e layout existentes, entram no histórico e são preservadas no projeto e nos consumidores compatíveis.

Posição, origem, escala, rotação e opacidade nesse painel afetam somente a disposição da prancheta no editor, conforme decisão do titular. Elas são preferências locais por prancheta, recuperadas no workspace, sem mudar o SVG ou o arquivo `.edisvg` exportado. O modo Design mantém a timeline compacta para dar espaço ao canvas e ao inspetor; Animar preserva a timeline completa. A lista de pranchetas à esquerda mantém criação, seleção, duplicação, definição inicial e exclusão, sem repetir os campos de nome e tamanho.

Modelo, instância e margem do artboard mostrados na referência do Rive não têm uma propriedade equivalente na raiz do documento atual; não foram apresentados como controles sem efeito. Os modelos e instâncias de dados existentes continuam no modo Estados, e margens dos itens continuam no editor de layout avançado. A captura do renderer e o E2E do inspetor cobrem aparência, persistência local, edição do documento e Desfazer; a suíte E2E completa passou com 119 testes. Ainda falta avaliação manual na janela Electron.

Na segunda passagem, os campos ficaram no padrão do Rive: valor junto do eixo, unidade colada ao número (`%`, `°`, `px`) e contorno só ao passar o mouse ou editar. Arrastar o rótulo curto (X, Y, W, H, ângulo, opacidade, espaços e padding) altera o valor 1 por pixel, com Shift ×10 e Alt ×0,1. Nos campos de disposição a prancheta acompanha o arraste; nos campos do documento o valor é aplicado uma vez ao soltar, numa única entrada de histórico. Origem e escala ganharam vínculo de eixos, que preserva a proporção do momento da edição. O recorte subiu para o bloco da prancheta, desabilitado enquanto o layout dos filhos estiver desligado, porque o recorte pertence ao contêiner de layout. A linha do Rig segue o mesmo estilo das seções recolhíveis, com a contagem à direita. Typecheck, os 290 testes do app e os 120 E2E passaram; a avaliação manual na janela Electron continua pendente.

O tamanho da prancheta ganhou modo por eixo (projeto v24, blueprint v13), abaixo de W/H: **Fixo** usa o tamanho de design, **Conteúdo** ajusta a prancheta aos filhos e **Preencher** ocupa o contêiner do player. Os modos exigem o layout dos filhos; sem layout, a prancheta é sempre fixa e o seletor fica desabilitado. Ao ligar o layout, os dois eixos começam em Preencher, que é o comportamento dos layouts anteriores ao campo. Em Conteúdo, W/H aparecem atenuados porque passam a valer só como tamanho de design, e a moldura do editor acompanha a proporção calculada. Conteúdo recusa filho direto em fluxo que preencha ou use porcentagem no mesmo eixo; filhos absolutos não entram na medida e são aceitos. SVG animado e Lottie continuam sem layout responsivo: recusam ou pedem confirmação da conversão, como antes. Arquivos com o campo exigem esta versão; arquivos v23 abrem e migram sem mudança. Passaram typecheck, 291 testes do app, 179 do `edi-motion` e os 121 E2E; falta a avaliação manual na janela Electron.

Modelo e instância da prancheta (projeto v24, blueprint v13) ficam no topo do inspetor, como no Rive. **Modelo** liga um dos modelos de dados da prancheta (ou Nenhum) e **Instância** escolhe qual instância desse modelo a prancheta usa ao iniciar; ambos entram no histórico. Modelos e instâncias continuam sendo criados no modo Estados. Lá, ao criar um link para um campo do modelo da prancheta, o alvo padrão passa a ser **Instância da prancheta**: o link segue a instância ligada em vez de uma instância fixa. Links existentes continuam fixos. Links da prancheta não atravessam listas, porque os itens de lista são próprios de cada instância. Um link de duas vias da prancheta recusa outro link de duas vias fixo no mesmo campo do modelo. Trocar de modelo com links da prancheta é recusado até refazê-los. No diálogo Testar, **Instância ligada à prancheta** simula a troca em execução; HTML e React expõem `bindDataInstance(id)`, `getDataInstance()` e `getData()` sem id para a instância ligada. Escolher a instância de dados de um componente e ligar componentes a dados da prancheta pai ficam para etapas seguintes.

Os campos do inspetor (prancheta e transformação do objeto) mostram e gravam no máximo duas casas decimais. Um valor diferente de zero que viraria 0 é recusado com aviso; valores antigos menores que 0,01 aparecem com dois algarismos significativos. Sair de um campo sem alterá-lo não grava nada. Os demais formulários, como gradientes, curvas, rig e inputs do Testar, mantêm a precisão completa. O [full review de 27/10](../../docs/reviews/edisvg-2026-10-17/full-review-2026-10-27-inspetor.md) registra os 13 achados desta frente e as correções.

## Pintura e efeitos de caminho no padrão do Rive (29/10/2026)

As linhas de **Preenchimentos e contornos** seguem o Rive: amostra (abre o seletor de cor), hexadecimal editável, opacidade em % com arraste no rótulo, olho para ocultar e − para remover. Pinturas ausentes não ocupam linha; o **+** do cabeçalho adiciona a que falta, ou oferece as duas. A espessura do contorno fica abaixo das linhas, em px. Ocultar grava opacidade 0: a cor e o gradiente continuam no projeto e mostrar de novo devolve a opacidade anterior na mesma sessão (depois disso, 100%). O formato do projeto não mudou nesse primeiro passo.

Formas e caminhos aceitam **camadas extras** de preenchimento e contorno (projeto v25, blueprint v14). Com a pintura base já presente, o **+** acrescenta uma camada daquele tipo; sem ela, cria primeiro a base. As linhas aparecem na ordem do desenho: as camadas extras por cima (a última adicionada no topo), depois o contorno e o preenchimento do próprio objeto. Cada camada extra tem cor sólida, opacidade, olho (visibilidade própria, sem mexer na opacidade) e −; as de contorno têm espessura. São até 16 por objeto. No documento, a camada é `paintLayers` no objeto e aceita também gradiente ou padrão tipado (pelo assistente; o painel edita cor sólida, e escolher uma cor troca o gradiente da camada por ela).

Cada camada visível é desenhada como uma cópia da geometria logo depois da forma, no mesmo grupo do objeto. Assim ela acompanha transformações, deformações do rig, layout, recortes e máscaras, e todos os pontos que reescrevem o caminho (player, runtime de clips, layout, prévias do editor, edição de vértices, papel vegetal, SVG animado) atualizam as cópias junto. Canvas, Testar, HTML interativo, React, imagens/vídeo e SVG (estático e animado) desenham as camadas. Limites: as camadas não são animáveis nem ligáveis a dados (cores animadas ou ligadas continuam no preenchimento/contorno base); não se reordenam no painel; não combinam com filtro nem com fonte de máscara pintada (recusados com aviso); texto e grupos não as aceitam; a Lottie recusa camadas visíveis sem descartá-las; estilos de aparência não as guardam. [Review das camadas de pintura](../../docs/reviews/edisvg-2026-10-17/review-camadas-de-pintura.md).

**Opções e efeitos por linha.** Como no Rive, o ícone de ajustes à esquerda de cada linha abre **Opções** e **Efeitos** (efeitos de caminho). Em Opções ficam o nome da camada (as camadas extras aceitam nome, `paintLayers[].name`; a pintura do próprio objeto aparece como "Contorno do objeto"/"Preenchimento do objeto") e, nos contornos, ponta (reta, arredondada, quadrada) e junção (em ponta, arredondada, chanfrada) em botões com ícone. Mistura (blend), "aplicar transformação" e feather do Rive ainda não existem: precisam de suporte nos players e exportadores. Em Efeitos, **+** adiciona o trim e × o remove. Modo (Sequencial = comprimento total do caminho; Simultâneo = cada contorno), Início, Fim e Deslocamento usam %. O deslocamento é gravado em graus, como antes (100% = 360°). O ícone fica verde quando a linha tem trim.

O trim vale **por linha**: o trim de uma camada extra recorta só aquela cópia (`rig.trims[].layerId`, projeto v25/blueprint v14), e as linhas sem trim próprio continuam com o caminho inteiro. Assim um único caminho com três contornos, cada um com seu trim, desenha mão, braço e ombro. O preenchimento e o contorno do próprio objeto são o mesmo elemento SVG e dividem um único trim, que recorta a forma inteira; para recortar só um contorno, use um contorno extra. Remover uma camada remove o trim dela na mesma ação (desfazer traz os dois de volta). São os mesmos dados do recorte animável do Rig, então start/end/offset de cada trim são canais de Parâmetros; Rig › Restrições edita o trim da forma, com a tolerância. O modo Design mostra os trims no canvas, sem alterar o `d` gravado; durante a edição de vértices o caminho aparece inteiro. Formas (retângulo, círculo etc.) precisam ser convertidas em caminho antes; caminhos com arcos SVG nativos pedem a conversão Bézier, como no Rig. HTML, React, Testar e SVG animado desenham cada cópia no próprio caminho, e o SVG animado amostra um `d` por cópia; a Lottie já recusa camadas visíveis.

## Animação de vértices (29/10/2026)

Como no Rive, os vértices de um caminho podem ser animados. No **Animar**, com uma animação aberta, **Editar vértices** (ou Enter) continua no Animar: arrastar pontos e alças, ou movê-los com as setas, grava uma **chave de vértices** no quadro atual da animação. Uma chave no mesmo quadro é substituída. Entre duas chaves o caminho se move de forma linear, com a curva da chave anterior; antes da primeira e depois da última ele fica parado. O caminho do Design não muda, e o Design continua mostrando o desenho original.

Na timeline, cada caminho animado ganha a linha **"Nome · Vértices"**. As chaves dessa linha se movem, copiam e excluem como as outras, e o diálogo de chave edita quadro e curva. Para mudar o caminho de uma chave, vá ao quadro dela e edite os vértices.

No Animar só se movem pontos e alças. Acrescentar ou excluir pontos, abrir ou fechar o contorno e trocar o tipo de vértice são edições do Design. Enquanto o caminho tiver chaves de vértices, o Design também recusa essas mudanças de topologia, porque as chaves deixariam de corresponder ao caminho. Caminhos já deformados por ossos ou morphs não recebem chaves de vértices: anime-os por eles.

No projeto (v25), as chaves ficam em `artboards[].vertexClips` (uma lista por caminho e animação, com o caminho inteiro em cada chave). Excluir o caminho ou a animação leva as chaves junto; duplicar copia. Ao compilar, cada chave vira um morph do rig com um canal de peso que vale 1 no quadro dela e 0 nas vizinhas, então HTML, React, Testar, vídeo, SVG animado, Lottie e as transições da máquina de estados tocam a animação de vértices sem mudança de formato no runtime. Limites: as chaves contam no limite de 256 morphs por prancheta; curvas que passam de 0–1 (elástico, Bézier com overshoot) são limitadas a 0–1 entre as duas chaves.

## Réguas e guias (30/10/2026)

O canvas tem réguas no topo e à esquerda, nas unidades da prancheta. Elas acompanham o zoom e o pan, e o passo das marcas (1, 2 ou 5 × 10ⁿ) se ajusta para os números não se sobreporem. **Réguas** e **Guias**, na barra do canvas, ou Shift+R e Shift+G, mostram e ocultam cada uma. A preferência fica no editor, não no arquivo.

Arrastar a partir da régua de cima cria uma guia horizontal; da régua da esquerda, uma vertical. A guia mostra a posição enquanto é arrastada e fica em unidades inteiras. Arrastar uma guia a move. Soltá-la de volta sobre a régua, ou fora do palco, a remove. Com a guia focada (Tab), as setas a movem 1 unidade (Shift: 10) e Delete a remove. **Remover guias da prancheta** (paleta de comandos, grupo Exibir) apaga todas. Cada mudança é uma entrada do histórico.

Ao mover objetos, a caixa da seleção encaixa nas guias pela borda ou pelo centro, a até 6 pixels de tela. A guia em que encaixou fica destacada. O encaixe nas guias vale depois da grade, e só no eixo que está se movendo. Guias ocultas não encaixam.

As guias ficam no projeto, por prancheta, em `artboards[].guides` (projeto v25, até 200). Elas só servem ao editor: HTML, React, SVG, Lottie, vídeo e imagens não as desenham. Duplicar a prancheta copia as guias.

## Prancheta ao abrir um projeto (30/10/2026)

Um projeto abre na prancheta padrão. Se ela estiver vazia e outra prancheta tiver objetos, o editor abre na primeira prancheta com objetos, para o arquivo não aparecer em branco. A prancheta padrão salva no projeto não muda. Isso acontecia em projetos cujo desenho foi importado numa prancheta nova enquanto a "Prancheta 1" ficou vazia.

## Excluir um caminho com trim (30/10/2026)

O trim é um efeito da linha de pintura, como no Rive. Ao excluir um caminho (ou o grupo que o contém), seus trims e as chaves animadas deles saem junto, na mesma ação desfazível. Antes, a exclusão falhava com "Trim requer ID único e um caminho local por controlador.". Um binding de lógica ligado ao trim continua sendo uma dependência explícita: o editor pede para removê-lo antes de excluir.

## Imagens de referência no assistente (30/10/2026)

O painel ✧ Assistente aceita até 4 imagens por mensagem: botão **Imagem**, Ctrl+V no campo de mensagem ou arrastar para o painel. São aceitos PNG, JPEG, GIF e WebP. Uma imagem com lado maior que 1568 px é reduzida antes do envio, porque os modelos não olham além disso; acima de 3,5 MB vira JPEG. As miniaturas aparecem antes do envio (com × para remover) e na conversa. Dá para mandar só a imagem: o pedido padrão é "Use a imagem anexada como referência.".

A imagem é só referência visual: o assistente recria formas, cores e proporções com as ferramentas de edição, e ela não entra no projeto. As perguntas seguintes da conversa continuam levando as imagens mais recentes (até 4, nas últimas 8 mensagens). Assim, "deixe mais parecido" ainda tem a referência. **Nova conversa**, **Novo projeto** e **Abrir** esquecem as imagens.

O processo principal confere tipo, tamanho e quantidade de novo (`panelImages` em `src/main/engines.js`). O Claude Code recebe as imagens pela entrada padrão em `stream-json`. O Codex recebe arquivos temporários, apagados ao fim da resposta. Os dois caminhos foram conferidos com os clientes instalados (Claude Code 2.1.314 e Codex 0.164.0), que identificaram a cor de uma imagem de teste.

## Atividade do assistente em palavras (31/10/2026)

O painel não lista mais "Ferramenta: get_overview" e "Aplicado: edit_document" a cada chamada. Cada resposta tem uma única linha de atividade em português, com um ponto pulsando: "Pensando…", depois "Lendo o projeto…", "Editando o desenho…", e assim por diante. A linha some enquanto o texto da resposta chega e volta na próxima ferramenta. No fim, se a resposta alterou o projeto, a linha fica como resumo: "3 alterações aplicadas ao projeto · Ctrl+Z desfaz". Uma resposta que só leu o projeto não deixa linha. Os textos ficam em `toolActivity` (`src/shared/aiTools.js`); uma ferramenta nova sem texto próprio aparece como "Consultando o projeto" ou "Trabalhando no projeto", e um teste exige texto próprio para cada ferramenta do editor.

## Ferramentas de objetos (0.4.0)

Em projetos novos ou SVGs importados, o painel de camadas permite adicionar retângulo, círculo, linha e texto. Selecione um objeto para editar preenchimento e contorno (cor hexadecimal ou `none`), espessura, texto e tamanho da fonte. Duplicar (Ctrl+D), excluir (Delete), trazer à frente e enviar ao fundo respeitam os grupos e bloqueios. A ordem muda dentro do mesmo grupo. Todas essas operações participam do histórico e do arquivo de projeto; duplicar grupos gera novos IDs para os descendentes.

Posição, escala e rotação continuam no inspetor. Arrastar/redimensionar no canvas, desenhar paths e criar grupos ainda estão pendentes. Estas ferramentas ainda não estão expostas ao assistente de IA. Suíte: 27 testes; validação visual nativa pendente.


### Edição de caminhos (0.5.1)

Na versão 0.5.3, clique no nome do objeto na hierarquia para renomear diretamente. Enter ou clicar fora confirma; Esc cancela. F2 na linha focada também inicia a edição. O campo de nome foi removido do inspetor; a alteração suporta Desfazer e respeita bloqueios.

A partir da versão 0.5.2, o aplicativo inicia com um documento Sem título em branco, no modo Design. Para continuar um projeto salvo, use Arquivo → Abrir projeto (Ctrl+O); a sessão anterior não é restaurada automaticamente.

O inspetor apresenta quatro botões de tipo de vértice: reto, espelhado, independente e assimétrico. O modo ativo fica destacado; cada botão tem descrição e suporte a teclado.

No desktop, clique em **Design** ou **Editar formas** para disponibilizar os vetores reais do mascote de demonstração. Em um projeto próprio, desenhe uma forma ou importe um SVG. Selecione a forma no canvas ou na hierarquia e pressione **Enter**, dê duplo clique ou use **Editar vértices** no inspetor. Formas primitivas são convertidas em caminhos; a conversão pode ser desfeita.

O painel segue a disposição da prancheta `i0JJ4Q`: hierarquia e animações à esquerda, canvas central, propriedades e opções de vértices à direita e timeline inferior. A hierarquia editável representa os objetos reais do SVG; os nomes e ossos fictícios da demonstração não são usados como objetos editáveis.

Arraste âncoras ou alças Bézier, edite X/Y no inspetor e escolha alças retas, espelhadas, assimétricas ou independentes. Alt durante o arraste desacopla uma alça. Duplo clique próximo de um segmento insere um ponto preservando a curva; os botões do inspetor também inserem e excluem pontos. Delete/Backspace remove o vértice selecionado, setas movem um pixel local (Shift: dez). É possível escolher contornos, abrir/fechar e inverter sua direção. **Concluir**, Enter ou Esc sai da edição; Esc durante um arraste cancela apenas esse arraste.

Cada gesto confirmado gera uma única entrada no histórico. Arrastes cancelados, perda de foco e troca de ferramenta descartam a prévia. Edições respeitam bloqueios dos grupos e são salvas e exportadas como SVG. A conversão preserva IDs, pintura e transformações. Arcos e elipses usam aproximações cúbicas Bézier em segmentos de até 90 graus. Textos não são convertidos em contornos nesta versão. A edição é geométrica; animação independente de vértices, rig e malha continuam fora do escopo implementado.

Referência de interação: [Rive — Edit Vertices](https://rive.app/docs/editor/fundamentals/edit-vertices). Modelo e conversões ficam em `src/shared/pathGeometry.js`; inspetor e gestos em `src/renderer/src/pathEditor.js`, com testes próximos aos módulos. A suíte inclui importação dos caminhos reais do mascote, subdivisão de curvas, gravação/reabertura, histórico, coordenadas sob zoom/rotação e cancelamento de gestos. A versão agora aparece junto à marca EdiSVG para distinguir executáveis antigos. Feche a versão aberta antes de iniciar outra: o bloqueio de instância única pode apenas trazer a janela antiga para frente.

### Ferramentas de desenho

Em um projeto novo ou SVG importado, use **V** para selecionar e arrastar, **R** para retângulo, **O** para círculo, **L** para linha e **T** para inserir texto com um clique. Edite o texto no painel direito. **Shift** mantém proporções iguais ao desenhar; **Esc** cancela o gesto. Cada desenho ou arraste pode ser desfeito com **Ctrl+Z**. Camadas bloqueadas não podem ser movidas.

Use **H** para mover a área de trabalho e **Z** para ampliar (Alt + clique reduz). **Ctrl + roda do mouse** (ou pinça no touchpad) amplia e reduz em torno do ponteiro, de 10% a 800%; o seletor de zoom mostra o valor livre. O botão Centralizar restaura a posição e o zoom. Pan e zoom não alteram a arte exportada.

Na versão 0.4.2, a barra segue o nó `m5eAtQ` do `edisvg.pen`: nove ícones vetoriais extraídos da referência, grupos separados, largura de 56 px, botões de 38 px e ícones de 18 px. **P** ativa a Caneta: clique para segmentos retos, arraste ao criar um ponto para curvas Bézier, pressione Enter para concluir ou clique no primeiro ponto para fechar (mínimo de três pontos). Backspace remove o último ponto; Esc cancela. Caminhos em construção não entram no projeto nem no histórico antes da confirmação.

Osso, Malha e Restrições estão representados conforme o desenho, mas indisponíveis: criação de rig, deformação e IK ainda não existem no motor. O comando Mostrar ossos do canvas permanece uma visualização da demonstração. A barra informa o motivo da indisponibilidade ao receber foco ou clique; não simula uma edição de rig.

A implementação separa a definição e acessibilidade da barra (`toolbar.js`), seus estilos (`toolbar.css`), os ícones exportados (`toolbarIcons.js`), os gestos do canvas (`canvasTools.js`) e a Caneta (`penTool.js`). Operações de criação e movimentação passam por `editScene`, com validação antes de aplicar o novo estado. Testes próximos aos módulos cobrem caminhos, atalhos, disponibilidade, histórico, cancelamento e descarte de ouvintes. O smoke test desktop verifica também a ordem e as dimensões da barra. Sua execução visual permanece pendente neste ambiente devido à restrição de acesso do sandbox do Windows aos binários Electron.
