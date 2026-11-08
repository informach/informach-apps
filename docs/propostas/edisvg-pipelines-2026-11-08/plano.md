# Pipelines no EdiSVG: plano aprovado em 08/11/2026

Pedido do titular: cadastrar pipelines (receitas) no EdiSVG para não repetir o mesmo trabalho, já com
duas receitas prontas. Plano aprovado em 08/11/2026, com todos os lotes e um commit por lote.

## Decisões do titular

- **Formato:** receita com etapas fixas, cadastrada uma vez com nome, instruções de estilo para o
  assistente e paleta de texto padrão. Ao rodar, o EdiSVG pede só as entradas daquela vez.
- **Áudio:** aceita um arquivo solto (MP3/WAV/M4A), transcrito no EdiSVG pela mesma transcrição
  local do EdiAula, ou uma aula do EdiAula (`.ediaula`), usando a transcrição pronta dela.
- **Narração:** o trecho toca na prévia do EdiSVG para ajuste; a exportação sai sem som, com o tempo
  de início na aula.
- **Entrega:** rascunho completo feito pelo assistente (Claude Code/Codex), revisável; um Ctrl+Z
  desfaz o pipeline inteiro.
- **Receitas prontas:**
  1. **Cena animada do jogo:** projeto do Estúdio (`.szproject.json`) → imagens e paleta; paleta de
     texto; roteiro do trecho; áudio da aula inteira → acha o trecho e os tempos de cada frase →
     o assistente anima a Cena com as imagens no tempo da narração.
  2. **Demonstração passo a passo:** vídeo gravado na tela; áudio da aula inteira; roteiro do
     trecho → setas, balões, destaques e textos de ênfase por cima do vídeo, sincronizados com a
     voz.
     - Entrega uma **camada transparente** (WebM com alfa) para uma faixa acima do vídeo no EdiAula.
     - **Onde apontar:** cursor e cliques reais quando a gravação é do EdiAula/EdiCaptura; senão, o
       assistente olha os quadros do vídeo.
     - **Sincronia:** o vídeo começa junto com o trecho do roteiro.

## Lotes

1. **Transcrição compartilhada:** Whisper local, downloads verificados, leitura do resultado,
   fala em português, glossário, roteiro e alinhador saem do EdiAula para `@informach/edi-speech`.
   O EdiAula mantém os mesmos imports por arquivos que reexportam; o executor recebe caminhos e
   FFmpeg por parâmetro. Gate: suíte do EdiAula verde.
2. **Receitas:** modelo versionado no perfil do EdiSVG, as duas receitas prontas, cadastro,
   edição, duplicação e execução com andamento e cancelamento.
3. **Parte comum:** achar o trecho do roteiro no áudio (arquivo transcrito ou aula do EdiAula),
   tempos por frase, corte do áudio do trecho, narração na prévia com forma de onda e marcadores;
   frase não encontrada para o pipeline e é dita.
4. **Receita 1:** importação do Estúdio (já feita), paleta das imagens, paleta de texto, rascunho
   pelo assistente como uma edição só, exportação sem som com o tempo de início na aula.
5. **Receita 2:** vídeo de referência por baixo na prévia (fora da exportação), cursor e cliques
   no tempo do trecho, quadros do vídeo para o assistente, formas prontas de seta/balão/destaque,
   rascunho e exportação da camada transparente (quadros PNG com alfa + FFmpeg da suíte).
6. **Review final e documentação.**

## Riscos

- Mexer na transcrição do EdiAula: o lote 1 só fecha com a suíte dele verde.
- O rascunho depende do Claude Code/Codex (assinatura da pessoa) e pode variar; o relatório por
  frase ajuda a revisar.
- Vídeos sem cursor salvo: as setas dependem do assistente acertar pelo quadro.

## Andamento

| Lote | Estado | Commit |
| --- | --- | --- |
| 0. Importar projeto do Estúdio | feito, base da receita 1 | |
| 1. Transcrição compartilhada | em andamento | |
| 2. Receitas | | |
| 3. Parte comum | | |
| 4. Receita 1 | | |
| 5. Receita 2 | | |
| 6. Review final | | |
