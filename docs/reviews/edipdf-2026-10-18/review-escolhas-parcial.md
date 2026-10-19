# Review de listas com rótulos e valores

Estado vigente: perfil aprovado após correção da validação de coordenadas fracionárias; [review consolidado](review-senhas-escolhas-divisao.md). O registro abaixo conserva a investigação e as rodadas anteriores.

18/10/2026. Correção implementada; testes/tipos passaram. A primeira jornada encontrou uma espera ambígua no harness; corrigida e em nova rodada integrada, sem aceite antecipado.

O renderer descartava `displayValue` do PDF.js, exibindo códigos internos. A investigação também confirmou que `pdf-lib` 1.17.1 seleciona/valida valores por rótulos; usar essa operação para códigos exportados podia rejeitar o preenchimento ou habilitar edição livre. Configurar o campo com `setOptions` também substituía pares por textos simples.

A correção mantém rótulo e valor desde a leitura até a edição, a exportação de dados e a gravação. `/V` recebe códigos, `/I` recebe índices ordenados e `/Opt` conserva os pares. Seleções desconhecidas, ambíguas, repetidas ou incompatíveis com seleção simples são recusadas. Editar apenas o rótulo conserva o código selecionado. A autoria oferece campos separados e admite rótulos iguais com códigos distintos, recusando códigos duplicados. Opções no renderer recebem identidade estável na leitura em cache.

Um provider próprio, usando a extensão pública de aparências, desenha os rótulos e destaca as opções pelos valores; não modifica métodos da biblioteca nem troca provisoriamente os valores do documento. Preserva rotação ortogonal, fonte/tamanho/cor comuns, borda/fundo e índice de rolagem. Fontes dos controles continuam integrais e compartilhadas; campos limpos conservam suas aparências. Perfis incomuns, escritas complexas, rótulos com controles e matriz ampla de widgets continuam como complementos, sem promessa universal.

Referências: [extensão pública de aparências](https://pdf-lib.js.org/docs/api/classes/pdfdropdown#updateappearances) e [ISO 32000-1, §12.7.4.4 e tabela 231](https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf). APIs conferidas também no código/types instalados de `pdf-lib` 1.17.1.

Quatro testes novos conferem build e releitura por PDF.js, `/Opt`/`/V`/`/I`, seleção múltipla, flags sem edição livre acidental, dados exportados, pares/rótulos configurados e origem/aparência dos pares intactas. Uma cópia exclusiva de teste é achatada sem regenerar aparências para extrair o texto efetivamente desenhado, em vez de inferir aparência a partir de `/V`. **260 testes do app passaram nesse marco**, tipos do app e do harness/testes passaram. Biome foi corrigido e passou na rodada seguinte (`biome-split-reviewed.txt`).

`native-choices.txt` passou pela seleção de rótulos/códigos, lista múltipla e controle somente leitura, mas o teste fechou o diálogo antes do fim da autoria: encontrou o botão “Novo campo”, em vez do título posterior ao commit. Fechar aborta corretamente a operação pendente. O harness agora espera explicitamente o heading; não houve aumento de timeout ou alteração no produto para antecipar um commit. Também foi corrigida a limpeza das linhas de opções ao acionar “Novo campo”. O build normal foi restaurado (`build-choices-normal.txt`). A rodada `native-split-strategies.txt` repete o perfil com essa correção e os novos modos de divisão; reinício/encerramento continuam obrigatórios.

Evidências: `.cache/edipdf-analysis/test-choices.txt`, `test-choices-all.txt`, `typecheck-choices.txt`, `types-choices.txt`, `biome-choices-reviewed.txt`. A jornada `native-choices.txt` acrescenta seleção por rótulo, múltiplos códigos, controle somente leitura, edição de rótulo, cópia relida, aparência independente e origem exata. Também repete o gate de reinício que falhou na rodada de senhas.

Pendências: resultado da jornada e restauração do build normal, corpus de rotação/cor/alinhamento/aparições e demais complementos do [mapa](cobertura-requisitos.md). Sem commit/push/deploy/publicação.
