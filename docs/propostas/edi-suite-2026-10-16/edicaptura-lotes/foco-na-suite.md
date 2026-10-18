# Foco do EdiCaptura dentro da suíte

Decisão do titular em 18/10/2026, durante a implementação da fase 5a. Após solicitar a comparação com EdiAula e EdiPDF e questionar a complexidade, o titular escolheu explicitamente **“Enxuto com vídeo rápido (recomendado)”**. Esta decisão substitui os requisitos futuros conflitantes do diagnóstico e do plano original; não remove funcionalidades já entregues nem transforma requisitos retirados em implementados.

Na mensagem seguinte, o titular determinou que **não é necessária passagem direta entre apps por enquanto**: a pessoa conhece as ferramentas e escolhe qual abrir. Isso retira botões de passagem, descoberta/lançamento de outro app e contratos de recebimento desta entrega. “Encaminhar” neste registro indica responsabilidade de produto, não integração automática.

## Responsabilidade de cada app

| App | Trabalho principal | Limite no fluxo do Captura |
| --- | --- | --- |
| EdiCaptura | Capturar, explicar visualmente, proteger dados e enviar rapidamente | Imagens, rolagem, anotações, OCR, biblioteca, guias simples e vídeo rápido |
| EdiAula | Produzir e editar vídeo/aula | Múltiplos clipes/faixas, composição de câmera, cursor editável, narração elaborada, transcrição e legendas |
| EdiPDF | Trabalhar com documentos PDF | Organizar/mesclar páginas, editar/anotar PDFs, formulários, assinatura e compactação |
| EdiFoto | Tratar imagens com camadas | Edição geral de imagem e reconstrução elaborada; não ampliar o Captura para um segundo editor de fotos |

Compartilhar mecanismos de arquivo, mídia, licença e IA em packages evita duplicar infraestrutura. Isso, sozinho, não reduz a quantidade de controles, escolhas e manutenção de produto: o limite também deve aparecer nas funcionalidades e na interface.

## Evidência examinada

Comparação de código e documentação do checkout, sem nova homologação funcional dos outros apps:

- [EdiAula](../../../../apps/ediaula/README.md): gravação com câmera/microfone, pausa, cursor, zoom, timeline, cortes, narração, transcrição e legendas. A implementação está em `src/main/recorder.ts`, `whisper.ts`, `ffmpeg.ts`, `export-lesson.ts` e `src/shared/{captions,exportPlan,cursor}.ts`. Esses recursos já têm superfícies próprias; levá-los integralmente ao Captura repetiria um fluxo de produção de vídeo.
- [EdiPDF](../../../../apps/edipdf/README.md): páginas, imagens em PDF, mesclagem, anotações, formulários e compactação, com implementação em `src/shared/{build,model,compress}.ts`. Gerar um PDF simples de capturas é uma saída do Captura; oferecer edição e organização desse documento seria sobreposição.
- [Catálogo da suíte](../../../../packages/config/src/edi-tools.ts): papéis atuais dos produtos. Não criar catálogo paralelo na implementação.
- A comparação também examinou abertura por argumentos/segunda instância. EdiPDF recebe arquivos; o handler atual do EdiAula apenas traz a janela à frente. O titular dispensou implementar passagem direta nesta frente; nenhum desses mecanismos será ampliado para esse fim.

## Escopo vigente

**Manter no Captura:**

- Captura de região/janela/monitor, temporizada e rolável; precisão, presets, anotações e composição simples já entregues. O titular reforçou a escolha por captura: selecionar um monitor, todos juntos, uma região de um monitor ou uma região entre monitores. Preservar o seletor e esses modos explícitos de imagem; não transformar todos os monitores em comportamento obrigatório. O gravador simples atual usa uma região do monitor selecionado; não declarar gravação conjunta de monitores implementada por associação aos modos de imagem.
- OCR local de imagens, copiar/corrigir texto, busca opcional por conteúdo, detecção assistida de dados sensíveis e máscaras opacas revisadas. OCR de uma captura é uma tarefa distinta de selecionar texto já existente num PDF. A comparação inicial descrevia o checkout daquele momento; o titular informou uma grande melhoria paralela de OCR no EdiPDF. Não usar a descrição antiga para duplicar um motor: examinar o PDF atualizado antes da base comum.
- Vídeo rápido: gravação recuperável em disco, microfone/áudio do sistema opcionais, contagem regressiva, pausa, limite por espaço disponível, aparar início/fim, extrair quadro e exportar MP4/GIF. Sem timeline de múltiplas faixas. As fases 5a e 5b foram aprovadas no escopo controlado; aquisição de áudio e pausa manual permanecem adiadas em 5c.
- Guia simples: capturar/revisar/reordenar passos, título, descrição e texto alternativo, imagens saneadas, projeto editável do próprio guia e saídas HTML/PDF simples. Tutorial e comparação são layouts limitados; não construir uma plataforma de documentos/modelos.
- Biblioteca/backup, copiar/exportar/compartilhar, IA opcional pela assinatura do usuário exclusivamente para tarefas da captura e do guia. Preservar a decisão de Claude Code/Codex, revisão do conteúdo e operações com preview/desfazer.

**Encaminhar ao EdiAula, sem implementar uma segunda interface no Captura:** transcrição/Whisper, revisão e gravação de legendas, webcam composta, edição de caminho de cursor/zoom, desenho durante gravação, narração de sequências, união de clipes, remoção de intervalos internos, composição de áudio/faixas e máscaras por intervalo. Não afirmar que todos esses recursos estão implementados no EdiAula: a comparação confirma os mecanismos listados acima; capacidades adicionais continuam sujeitas à implementação e validação do app responsável. Se um vídeo contiver dados sensíveis, o Captura deve orientar revisão antes de compartilhar, sem prometer ocultação temporal que não oferece.

**Encaminhar ao EdiPDF:** editar/organizar/mesclar o PDF gerado, formulários, assinatura, compactação e alterações de páginas. O Captura não terá visualizador/editor geral de PDF. A saída PDF simples continua útil sem abrir outro app.

**Aplicação do foco aprovado aos detalhes da entrega:** retirar DOCX/Word e editor amplo de documentos, checklist/ficha de problema com mecanismo de templates próprio, reconstrução/movimentação/remoção semântica de componentes e edição geral de fotos. Essa delimitação é uma interpretação de implementação do foco enxuto, não uma escolha individual expressa pelo titular sobre cada subrecurso. Anotações, recorte, máscaras, numeração e correções de OCR permanecem. O custo, caso essa delimitação fique estreita demais, é retomar esses recursos numa decisão posterior e revalidar os critérios de paridade; a retirada não representa implementação nem defeito resolvido.

## Arquivos independentes e critérios

O Captura salva/exporta arquivos concretos em formatos comuns: imagem, MP4/GIF e HTML/PDF simples. A pessoa escolhe abrir o arquivo na ferramenta desejada. Sem botões “Editar no EdiAula”/“Abrir no EdiPDF”, descoberta de instalação, lançamento, contrato de recebimento ou alteração dos outros apps para esse fim. Não trocar o programa padrão do sistema nem iniciar gravação, transcrição ou IA em outro app.

Testar fidelidade dos arquivos, Unicode, cancelamento, preservação de originais e trabalho aberto. Infraestrutura compartilhada estritamente necessária continua em packages, com contratos e consumidores verificados; isso não exige integração de interface. Apps não importam apps.

O objetivo passa a ser concluir os fluxos cotidianos de captura no Captura e continuar tarefas avançadas na suíte. Não prometer paridade individual com cada recurso do Snagit após retirar recursos deliberadamente. A revisão final confrontará o escopo vigente e listará diferenças, pendências físicas e recursos encaminhados.

## Execução revisada

Oito lotes principais permanecem como organização. A previsão passa de dezesseis para **quinze fases**: 1, 2, 3, 4a, 4b1, 4b2, 4b3, 4c, 4d, 5a, 5b, 5c, 6, 7 e 8. Onze fases aprovadas: lotes 1–4 e fases 5a/5b. As revisões 007 e 008 tiveram seus achados corrigidos e aceitos em re-review. Por decisão posterior do titular, este checkpoint encerra o desenvolvimento atual; 5c e lotes 6–8 ficam adiados. O lote 5 integral permanece incompleto.

- **5a:** gravação incremental, recuperação e reprodução autorizada; escopo e baseline preservados.
- **5b:** mídia compartilhada mínima, metadados, MP4/GIF, quadro e aparar início/fim. Não importar um editor geral de vídeos.
- **5c:** áudio opcional, pausa e controles simples; integração interna e revisão completa do lote 5 vigente, sem passagem a outro app.
- **5d:** não será executada no Captura; transcrição/legendas/máscaras temporais foram retiradas por decisão do titular. Briefs antigos ficam como histórico, explicitamente substituídos.
- **6:** OCR, ocultação assistida, numeração e comandos locais delimitados.
- **7:** guias simples e arquivos HTML/PDF; sem DOCX/editor geral ou passagem a outro app.
- **8:** compartilhar e assistência de captura/guia, auditoria de plataforma e medições; full review ao final.

Gates independentes continuam obrigatórios. A decisão posterior de encerramento autoriza commit, push e integração na main após integrar o remoto, revisar o checkpoint e verificar o resultado. Não autoriza release desktop, tag, deploy, alteração operacional ou testes com dados pessoais. Baselines e relatórios anteriores permanecem históricos e imutáveis. Ver [continuidade com o EdiPDF](continuidade-edicaptura-edipdf.md).

O titular exigiu integrar o remoto antes de qualquer push. O remoto consultado foi incorporado localmente até `27ac84cf`, preservando os quatro commits EdiFoto e as mudanças do Captura. A integração foi aceita após corrigir e reavaliar 009/001, que deixava de tentar fechar o filho se Pictures falhasse após launch. Ver [preservação e verificações](integracao-remoto.md). O full review do checkpoint e os gates finais precedem commit/push/main; reconsultar o remoto perto do push. Integração local não equivale a publicação.
