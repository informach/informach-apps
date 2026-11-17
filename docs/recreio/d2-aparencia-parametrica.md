# D2: aparência e prévia da família

Continuação autorizada, ainda em implementação. Núcleo/recibo V2 aprovado em candidato; produção permanece no formato anterior até completar esta frente e os gates privados. Não prometer que uma combinação de aparência exista só porque passou na validação sintática.

## Contrato visual

O empacotador atual assa corpo, cabelo e roupas num personagem completo. A fonte já conserva a semântica das cores: paleta/fator da pele e do rosto, cor lisa do cabelo e textura/máscara/luminância da roupa. A continuação deve transportar essa semântica até o material do navegador, mantendo a mesma fórmula `comCorLivre`. Não descobrir pele ou roupa comparando RGB dos vértices.

1. **Cor parametrizada.** Transportar cor original, máscara, peso e canal dos vértices. Na roupa com textura, conservar a textura original e máscara e aplicar a fórmula por fragmento, preservando estampas e regiões sem máscara. Slots têm identidade e limites; valores são dados, nunca código GLSL fornecido pelo cliente. Testar a igualdade com a função CPU usando imagens sintéticas e cores variadas, inclusive bordas da máscara.
2. **Pacote e manifesto.** Novo perfil aditivo do manifesto, mantendo V1/V2. Declarar canais, valores iniciais e elegibilidade das opções. Preservar recorte, camadas, pesos dobrados, gravidez, esqueleto e expressões existentes. Reutilizar geometria e bibliotecas; somente materiais/uniformes da instância podem mudar. Gerar pares de penteado/conjunto elegíveis para cada corpo/fase oferecido; o catálogo expõe só combinações efetivamente empacotadas. Começar com um catálogo fechado e medido, expansível sem alterar a identidade dos moradores.
3. **Cliente.** Shader fixo e materiais por instância, com geometria/texturas compartilhadas e descarte explícito. Atualizar cores sem reconstruir o esqueleto a cada movimento do seletor. Catálogo ampliado exige orçamento de cache e liberação de pacotes sem instâncias vivas; não acumular indefinidamente cada prévia visitada. Conservar os pacotes legados para mundos antigos. Conferir precisão de cor, máscaras, pose, gravidez e chamadas de desenho no GitHub; imagens com arte ficam exclusivamente no repositório privado.
4. **Servidor.** O catálogo do pacote validado na inicialização limita corpo/fase/linha, cabelo, conjunto e canais de cor. A simulação recebe somente dados de elegibilidade. O navegador não amplia esse catálogo. Aparência nova e adaptação no nascimento/crescimento têm contrato explícito; moradores antigos não são convertidos silenciosamente. Famílias/recibos continuam determinados por IDs, nunca por nome.
5. **Editor.** Início com escolha real de criação ou família de exemplo, depois moradores, relações e revisão de casa/saldo do jogo. Prévia somente visual no renderer existente, sem alterar o espelho autoritativo ou abrir outro contexto WebGL. Teclado/foco, mensagens junto dos campos, espera da confirmação durável e saída cooperativa. Quem não tem capacidade de criar aguarda ou sai. Conservar os tokens noturnos/âmbar, tipografia e escala de espaço do HUD existente.
6. **Aceite.** Gates públicos e pacote privado completo, combinações prometidas com arte real, criação/retomada por duas contas, queda e repetição, CSP/CORS e limpeza de recursos. Atualizar as jornadas para escolher a família de exemplo por uma ação real do produto, sem flags de produção feitas para fixtures. Só então considerar a ativação sequencial. Medição de GPU real e diversão permanecem separadas e obrigatórias; o notebook integrado está adiado pelo titular.

## Estado de 15/11, 15h32 UTC

Portal e Morada conferidos em produção `116939f6`, saúde pública 200, com a arte D1. `b666611b` existe somente na branch de verificação; editor e perfil visual novo não foram ativados. Arte e capturas licenciadas continuam fora do repositório público.

Preparação seguinte: coeficientes por vértice, textura RGB original e máscara linear em arquivo separado, declarados em metadados V3. O shader amostra as duas grades originais e mantém opacidade. Perfis V1/V2 continuam aceitos e o escritor padrão conserva seu formato. Nenhum pacote V3 com arte real foi homologado, publicado ou ativado.

## Candidato de canais e shader

`a0fcf8d8` liga o perfil V3 ao empacotador: canais explícitos na montagem, coeficientes float32 preservados pela compressão, textura RGB original com máscara no alpha e materiais opacos. A opção é explícita; a montagem padrão continua V2. O perfil não redimensiona texturas parametrizadas. O orçamento do catálogo real ainda deve ser medido antes de publicá-lo.

`b6c562ff` acrescenta materiais/uniformes por morador e validação dos atributos, sem modificar geometria ou textura compartilhadas. A bancada sintética `cores.html` compara a fórmula calculada com pixels após GLTFLoader e WebGL, em materiais basic/standard, máscaras 0/parcial/1 e fatores maiores que 1. O teste também confere que mudar a cor não recompila programas. Implementação e ensaio ainda aguardam aprovação remota; não são prova de aparência, orçamento ou FPS em hardware real.

A rodada `43733570905` revelou uma comparação prematura na jornada de duas páginas: espelho atualizado pela rede e posições do último quadro da outra página. A conferência passou a trazer a página à frente e aguardar a convergência da cena para a mesma tolerância de cinco centímetros. Não foram ampliados tolerância, prazo ou tentativas da suíte. A rodada seguinte deve confirmar a jornada completa; a falha anterior permanece registrada.

Continuam necessários: aplicação das escolhas de aparência aos uniformes, catálogo fechado validado no servidor, limite de cache das prévias, editor de família e pacote/jornadas com arte real no repositório privado. A produção não recebeu esses candidatos.

## Correção encontrada na arte real

`43734076099` e `43734562394` aprovaram os cinco gates públicos dos respectivos candidatos, incluindo 20 jornadas do cliente. A primeira homologação privada V3 (`43734603723`) recusou Marcos porque textura e máscara têm resoluções diferentes. A tentativa de usar alpha de uma única imagem só atende grades iguais; não foi ativada em produção.

A correção conserva RGB no GLB e a máscara em PNG separado com hash. Manifesto V3 declara bytes/dimensões e todos os arquivos são autenticados/validados pelo servidor. O shader usa amostragens independentes, sem mudar a resolução ou inferir máscara. A regressão sintética passa a incluir textura 4×4/máscara 2×1 no empacotador e textura 1×1/máscara 3×1 no navegador. Esses novos casos aguardam a rodada remota posterior à alteração.

O cache em implementação limita somente os pacotes **ociosos** a quatro e 32 MiB estimados de buffers/imagens decodificados; não é teto de memória total nem medição de VRAM. Empréstimos mantêm pacotes vivos, inclusive durante download. Saída libera materiais/uniformes e esqueletos da instância. Geometrias que trocam pesos de saia levam buffers próprios e descarte próprio, pois descartar uma geometria que compartilha atributos pode liberar buffers usados por outra instância. Esse custo adicional exige medição no catálogo real.

`eb5afe0c` aprovado nos cinco gates públicos em `43735689617`. Artefato sintético `14170542252` conferido: 16 comparações basic/standard, vértices/textura, erro máximo **0 níveis**, sem erro de shader nem recompilação por troca de cor. [Evidência preservada](evidencias/cores-sinteticas-2026-11-15.json). A homologação privada repetida em `43735713723` **aprovou as cinco jornadas** com a arte real e máscaras independentes (8,8 minutos de navegador). Empacotamento: 76,2 s; cerca de 12,44 MiB de arquivos originais no perfil registrado. Pacote e capturas continuam privados. Não foi ativado.

## Contrato do catálogo e do mundo (candidato seguinte)

O catálogo de aparência é conteúdo puro, recebido do host na criação e copiado para o mundo V2 ainda não publicado. A fotografia preserva as combinações admitidas; restaurar não substitui esse catálogo pelo pacote atual. A visão expõe os mesmos dados ao editor, sem criar autoridade para enviá-los em comandos. O rascunho contém somente escolhas: fase/linha, cabelo/conjunto, RGB da pele/cabelo e cores dos slots admitidos. Canais extras, omitidos ou combinações inexistentes são recusados antes de alocar IDs.

A continuidade exige a mesma combinação de cabelo/conjunto e as mesmas partes coloríveis nas seis fases e duas linhas. Crescimento conserva a receita e troca o corpo canônico. Nascimento mantém o caminho legado quando nenhum genitor tem receita nova; quando há receita admitida, herda uma receita visual nova disponível, sem acrescentar sorteios nem converter os pais. Integridade confere receita/corpo contra o catálogo persistido. O contrato ainda aguarda gates, ligação ao manifesto real e catálogo completo; o servidor de produção continua na arte D1 e no mundo V1.

## Coleção inicial em preparação

`--criacao` descreve 48 combinações: seis fases × duas linhas × cabelo natural/sem cabelo × camiseta/calça ou macacão. É uma coleção inicial fechada, sem alegação de disponibilizar todos os penteados e roupas da biblioteca. Os oito personagens legados permanecem no perfil anterior; só os descritores de criação ativam cores parametrizadas nesse modo. O empacotador passa a consumir `corpoDaFase` da simulação por dependência interna `workspace:*`, mantendo uma única definição dos corpos do jogo. O lockfile mudou apenas nesse vínculo; nenhuma versão externa foi alterada.

O manifesto leva rótulos e cores iniciais reais dos canais montados. O host deriva a lista permitida desse manifesto, confere a matriz completa e fornece o catálogo somente aos mundos novos. Abrir um mundo com catálogo persistido exige que o pacote instalado ainda atenda às receitas gravadas. O cliente exige a combinação exata para receitas novas e aplica pele/rosto/cabelo/roupa pelos uniformes. O editor, a prévia e a prova das 48 combinações com arte real ainda estão pendentes. Gates não concluídos para esta coleção.

### Pacote da coleção conferido

`763be2da` aprovado nos cinco gates públicos em `43738642612`, incluindo nascimento com receita nova e continuidade de aparência. O artefato privado da execução `43738068686` (workflow `73fc07828`, código `c005537a`, anterior apenas ao ajuste de duração do teste) aprovou o empacotamento e cinco jornadas. Conferência local somente de metadados/arquivos baixados, sem build ou testes: manifesto V3, 56 personagens, 48 descritores de criação, 240 arquivos com as cópias Brotli, **24.723.634 bytes originais / 37.810.510 bytes incluindo Brotli**, uma máscara distinta. Os oito personagens legados preservam exatamente os nomes/hash dos GLBs do pacote D1. Artefato baixado fora do checkout público, em `.work` do repositório privado.

Essa prova cobre a geração integral e a entrada do servidor com o catálogo; não significa que as 48 prévias já foram inspecionadas no editor. Esse aceite continua pendente, assim como FPS em hardware real.

## Editor em implementação

Fluxo novo para mundo sem família: escolha entre criar e conhecer a família de exemplo; moradores com nomes/traços/cores; relações fictícias; revisão da casa e saldo; confirmação pelo comando durável existente. Nomes iguais não definem identidade. Chaves locais mantêm os vínculos durante edição/remoção e viram índices apenas no pedido; o servidor continua criando IDs e saldo.

Prévia visual separada do espelho, no renderer existente, com montagem dentro do quadro admitido. Cores atualizam uniformes; mudança de modelo conserva somente o pedido mais recente enquanto carrega. Estado de carregamento/falha e nova tentativa ficam visíveis. A câmera se adapta à altura e ao painel em computador/celular e volta para a casa ao concluir. O HUD aguarda o estado autoritativo da família, e a sessão reenvia o mesmo comando pendente após reconexão.

As jornadas passam a escolher a família de exemplo por botões reais. Não há configuração de produção feita para fabricar a criação nos testes. Novas contas entram na criação; fotografias de mundos existentes continuam sendo restauradas. Este editor ainda não passou pelos gates nem foi implantado.

`270118cb` aprovado nos cinco gates públicos em `43740892015`, incluindo as jornadas que escolhem a família de exemplo. A continuação vincula “Assim vai ficar” ao quadro da receita atual **confirmado pela GPU**, reutilizando o único fence existente, sem espera bloqueante ou renderer adicional. Confirmação de quadro antigo não libera uma seleção nova.

Jornada privada `@personalizacao`, em preparação: percorrer 48 combinações, capturar as 12 fases/linhas, testar largura de celular, repetir ciclos de modelos e conferir contagem estável de buffers/texturas e um contexto WebGL2; criar dois moradores com vínculo, jogar, sair e reabrir. O ensaio mede alocação de recursos, não VRAM ou FPS. Capturas com arte somente no repositório privado. Ainda aguarda execução dessa jornada.

`e5f2fd9a` aprovado nos cinco gates públicos em `43741966085`. A execução privada
`43742109628` aprovou as cinco jornadas existentes (8,9 min), mas o caso novo
parou no primeiro seletor: o campo existia e sua captura mostrava a prévia correta;
o seletor por texto integral do label também incluía as opções. O candidato seguinte
usa o papel acessível `combobox` e o nome do campo, preservando prazo e asserções.
Também invalida a confirmação da prévia ao mudar a projeção da câmera, para exigir
um quadro confirmado no tamanho novo. Nenhum desses candidatos foi implantado.

`9c8cd9a5`: cinco gates públicos aprovados em `43743637255` e homologação
privada `43743680982` aprovada: 48 combinações/criação personalizada em 3 min
12 s e cinco jornadas gerais em 8 min 34 s. A inspeção das capturas encontrou
o bebê sentado baixo demais no quadro: a câmera usava a altura nominal em pé.
Ainda sem implantação. A correção mede vértices visíveis depois de ossos/morphs,
no referencial da raiz, e conserva a medida enquanto a pose-base não muda.
Não mede todos os vértices a cada quadro. Troca de clipe/postura invalida a
medida, inclusive se a biblioteca chega depois do corpo. A confirmação da GPU
também passa a distinguir a medida usada no quadro.

O candidato seguinte conserva as contagens numéricas em JSON junto das capturas
privadas. O anexo inline do primeiro ensaio não sobreviveu à limpeza dos
resultados de testes bem-sucedidos; as asserções passaram, mas esses números
ainda não têm arquivo preservado. Nenhum número de memória foi inferido delas.
