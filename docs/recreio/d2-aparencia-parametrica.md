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
