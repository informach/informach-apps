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

Preparação seguinte: coeficientes por vértice e transporte da textura RGB original com máscara linear no alpha de um material **opaco**, declarados em metadados V3. Sem redimensionar as grades; o shader precisa ler a máscara e restaurar a opacidade. Esse contrato ainda exige prova WebGL de RGB preservado inclusive em texels com alpha zero, além dos testes sintéticos da fórmula. Perfis V1/V2 continuam aceitos e o escritor atual conserva seu formato. Nenhum pacote V3 foi produzido, publicado ou ativado.

## Candidato de canais e shader

`a0fcf8d8` liga o perfil V3 ao empacotador: canais explícitos na montagem, coeficientes float32 preservados pela compressão, textura RGB original com máscara no alpha e materiais opacos. A opção é explícita; a montagem padrão continua V2. O perfil não redimensiona texturas parametrizadas. O orçamento do catálogo real ainda deve ser medido antes de publicá-lo.

`b6c562ff` acrescenta materiais/uniformes por morador e validação dos atributos, sem modificar geometria ou textura compartilhadas. A bancada sintética `cores.html` compara a fórmula calculada com pixels após GLTFLoader e WebGL, em materiais basic/standard, máscaras 0/parcial/1 e fatores maiores que 1. O teste também confere que mudar a cor não recompila programas. Implementação e ensaio ainda aguardam aprovação remota; não são prova de aparência, orçamento ou FPS em hardware real.

A rodada `43733570905` revelou uma comparação prematura na jornada de duas páginas: espelho atualizado pela rede e posições do último quadro da outra página. A conferência passou a trazer a página à frente e aguardar a convergência da cena para a mesma tolerância de cinco centímetros. Não foram ampliados tolerância, prazo ou tentativas da suíte. A rodada seguinte deve confirmar a jornada completa; a falha anterior permanece registrada.

Continuam necessários: aplicação das escolhas de aparência aos uniformes, catálogo fechado validado no servidor, limite de cache das prévias, editor de família e pacote/jornadas com arte real no repositório privado. A produção não recebeu esses candidatos.
