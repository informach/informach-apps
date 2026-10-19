# Review incremental de autoria e remoção por busca

18/10/2026. Complemento dos lotes 2/3, posterior ao lote 4. Perfil inicial abaixo revisado localmente; não encerra os complementos nem o full review. Histórico de falhas/correções no [registro parcial](review-autoria-parcial.md).

## Implementado e conferido

- Fonte TrueType estática escolhida no diálogo nativo, validada em worker e efetivamente incorporada na substituição do texto original. Unicode, campo e origem preservados; desfazer/refazer estrutural passou. Limites/direitos e exclusões tipográficas no registro parcial. [Captura](autoria-fonte-local.png).
- Caixas ajustáveis por diálogo com quebra, entrelinhas/espaço interno, quatro alinhamentos, listas simples, Noto e fonte local. Prévia e saída usam composição comum; overflow/composição complexa fora do perfil são recusados. Salvar/reabrir conserva texto, quadro, fonte, alinhamento e lista. Fontes sem subsetting são incorporadas integralmente nesse caminho. Envelope v2 comprimido corrige metadados grandes e mantém leitura v0/v1; recuperação continua v1. [Caixa reaberta](autoria-paragrafos-reabertos.png).
- Alt + clique seleciona um membro de grupo de anotações sem desagrupar; Shift alterna/combina. Comandos sobre um membro conservam pares e agrupamento. Teste verifica seleção/movimento; a interação adicional com Alt ainda entra na repetição nativa final. Não equivale a edição interna de Form XObjects arbitrários.
- Recorte intrínseco de imagem conserva pixels inteiros e posição afim, sem esticar nem alterar instâncias de outras páginas. Máscara alfa e opacidade simples foram corrigidas na extração e conferidas por pixels; não há dupla aplicação de opacidade. Cópia salva conserva parágrafo, formulário e origem. Reconverte para RGB; não sanitiza OCR/metadados/cópias anteriores. [Prévia inicial](autoria-recorte-imagem.png).
- Remoção por busca literal, palavra inteira/acentos/maiúsculas, lista de ocorrências e áreas, seleção e confirmação. Aplica redação/sanitização em revisão única com cópia obrigatória. Índices sem Unicode/geometria confiáveis são recusados. A saída remove a ocorrência selecionada, conserva texto público/não selecionado, remove metadados e torna formulários estáticos. Origem continua idêntica. [Revisão](autoria-remocao-busca.png).

## Evidência e correções do review

**233 testes do app aprovados**, tipos app/tooling e build normal aprovados. `.cache/edipdf-analysis/test-authoring-search.txt`, `build-authoring-search.txt` e `native-authoring-search.txt` registram a rodada. A jornada completa passou com SDK/gates/integridade ativos, OCR/compactação/lotes, interrupção e retomada de cem imagens, junção, autoria/recorte/remoção, impressão restrita de oitenta páginas com aba fechada, Office/tabelas/TIFF/WIA, impressão vetorial, busca/formulários/preferências e recuperação após reinício.

Não foram aumentados timeouts para ocultar falhas. A jornada passou após selecionar explicitamente a caixa após redo, aguardar o fim do processamento antes de atalhos e corrigir os nomes acessíveis dos seletores. A última rodada produziu/conferiu os arquivos reais. Capturas foram inspecionadas. A inspeção visual do recorte motivou retirar o destaque geral da imagem para deixar somente a área conservada em azul. Após a captura nativa, também foi acrescentada recusa explícita de páginas com grupos/máscaras de estado gráfico e funções de transferência fora do corpus, com teste e limite de revisão de 64 MB. Esses refinamentos têm tipos/testes/build atuais; entram novamente na jornada final, sem atribuir a captura anterior ao novo visual.

A [correção de dependência de apresentações](review-dependencia-apresentacoes.md) passou em exportações reais na mesma jornada. Auditoria de produção: zero vulnerabilidades conhecidas. Lockfile conservou resoluções anteriores/concorrrentes; instalação congelada foi verificada. O build normal foi restaurado depois do teste com chaves efêmeras. Não houve instalador instalado, commit/push/deploy ou publicação.

## Continuidade obrigatória

Form XObjects, fontes nos widgets/preservação de aparências e ordem arbitrária de tabulação, clipboard do sistema, corpus e complementos de lotes/digitalização/Office. Depois lote 5 (comparação, consulta/extração/automações locais, preparação por finalidade, acessibilidade/PDF-A e recursos documentais) e full review. Alças/fluxo multipágina e suporte tipográfico amplo também não foram concluídos. Scanner/papel dependem de hardware ausente. Certificados e serviços externos permanecem excluídos.
