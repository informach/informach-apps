# Pendências após a entrega do EdiPDF

18/10/2026. O titular determinou concluir o lote em andamento, documentar o restante, fazer o full review e publicar. Este registro substitui a expectativa de implementar todo o diagnóstico antes desta publicação. A [matriz de requisitos](cobertura-requisitos.md) conserva o vínculo com cada item da análise original. Implementado, testado localmente e publicado são estados distintos.

## Melhorias ainda necessárias

| Área | O que falta | Critério para encerrar |
| --- | --- | --- |
| Edição do PDF original | Ampliar edição de Form XObjects para conteúdo misto, aninhamento, matrizes próprias, grupos de transparência e documentos marcados. O perfil atual isola ocorrências compatíveis e recusa estruturas sem suporte. | Corpus com instâncias compartilhadas, edição de uma ocorrência, pares intactos, salvar/reabrir e comparação de pixels. |
| Texto e fontes | Fluxo de parágrafos entre páginas, seleção/redimensionamento múltiplo, revisão ortográfica local e corpus de scripts complexos, CFF/TTC/fontes variáveis. | Preservar conteúdo, glifos, geometria e fontes após edição e reabertura; recusar limites explicitamente. |
| Formulários (M07) | Ampliar corpus de rotação própria dos widgets, cores/alinhamentos, múltiplas aparências e campos herdados. Não há suporte completo a XFA. | Preenchimento e Tab corretos, valores/exportações/aparências preservados em leitores independentes. |
| Organização (M08) | Substituir páginas preservando referências internas, marcadores e campos conforme a intenção escolhida. | Nenhum destino órfão nem conteúdo retirado retido indevidamente na saída. |
| Assinatura gráfica (M15) | Corpus de caneta/toque, cancelamento por dispositivo, imagens fotografadas e fontes manuscritas disponíveis no sistema. | Traços, recorte, cor, rotação e posicionamento fiéis após salvar/reabrir. A assinatura é gráfica, sem certificado. |
| Área de transferência | Homologação nativa em estação Windows exclusiva. O isolamento necessário foi negado pelo sistema neste ambiente; o clipboard pessoal não foi acessado. | Copiar/colar formatos reais em estação descartável, incluindo erros, permissões e mudança de documento. |
| Conversões Office | Documentos complexos, tabelas mescladas, fórmulas, herança de apresentações, layouts de múltiplas colunas e matriz completa de permissões de documentos em leitura. | Corpus externo com fidelidade medida; o perfil editável atual não equivale à fidelidade universal do Office. |
| Extração de tabelas | Correção direta das células e ampliação do reconhecimento de estruturas difíceis. | Origem verificável por célula, revisão antes de exportar e preservação de valores literais. |
| Desempenho e diagnóstico (M10/M11) | Medições reproduzíveis de tempo/memória em corpus grande; falhas dirigidas, relatórios locais e maior cobertura de interrupções. | Orçamentos publicados, cancelamento responsivo e recuperação sem perda silenciosa. |
| Marcas/Bates (M13/I21) | Corpus amplo além das rotações, CropBox, intervalos/exceções e tipos de sequência já exercitados. | Prévia e arquivo final equivalentes em leitores independentes e documentos de grande porte. |

## Funcionalidades locais ainda não implementadas

| Requisitos | Funcionalidade | Limite da entrega atual |
| --- | --- | --- |
| I09 | Comparação textual e visual entre PDFs, correspondência de páginas, diferenças de OCR e relatório exportável. | Não existe um comparador completo. |
| I16 | Assistente de comandos determinísticos com plano visível, prévia e desfazer. | A paleta de comandos existente não substitui esse assistente. |
| I17 | Perguntas, resumos extrativos e referências de evidência locais, com indicação de informação insuficiente. | Busca e OCR não são apresentados como IA generativa ou resposta documental. |
| I18 | Extração estruturada de campos, confiança, correção de células e consistência de datas/valores. | Extração de tabelas atual cobre somente parte desse objetivo. |
| I19 | Receitas salvas, preflight e execução de rotinas locais em lote. | As tarefas locais existentes não constituem um editor geral de receitas. |
| I13 | Tags de acessibilidade, idioma, ordem de leitura, textos alternativos e homologação com leitor de tela. | Não há declaração de conformidade PDF/UA. |
| I14 | Conversão e validação PDF/A com validador local real e relatório. | Metadados e compactação não comprovam PDF/A; não publicar essa alegação. |
| I21 | Carimbos especializados, medições/calibração, camadas OCG, portfólios, multimídia e formulários avançados. | Bates é um primeiro perfil; os demais recursos especializados continuam pendentes. |

## Homologações dependentes de equipamento

- Digitalização WIA: adaptador, interface, checkpoints e enumeração estão implementados. A enumeração real encontrou zero scanners. Aquisição física, alimentador e duplex ainda precisam de dispositivo compatível.
- Impressão: preparação vetorial/restrita, intervalos, livreto e retomada foram exercitados. Envio real ao driver, frente e verso e conferência em papel permanecem sem homologação.
- Instalação/atualização: os gates Windows do workflow de release devem aprovar os seis instaladores e o ciclo A→B do commit publicado; um build de desenvolvimento não substitui esses gates.

## Exclusões mantidas pelo titular

Assinatura com certificado A1/A3, validação de cadeia de confiança, carimbo do tempo e verificação online; IA e tradução por API, revisão hospedada, convites/envios, solicitação e acompanhamento remoto de assinaturas e armazenamento documental em nuvem. Não contratar serviços nem solicitar chaves para esses recursos. Bibliotecas e modelos locais distribuíveis continuam sujeitos a licença, limites e empacotamento. Os serviços comerciais já existentes da suíte seguem seus contratos.

O [full review](full-review-entrega.md) registra as verificações da entrega. Estas pendências não devem reaparecer como funcionalidades concluídas em notas de versão ou material comercial.
