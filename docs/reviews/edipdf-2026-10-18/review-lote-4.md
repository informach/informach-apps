# Review do lote 4 — perfis locais implementados

18/10/2026. Os perfis abaixo estão implementados e revisados. Os complementos continuam obrigatórios para a entrega completa; este marco permite seguir aos complementos de autoria e ao lote 5, sem declarar equivalência universal ao Acrobat ou full review aprovado.

## Resultado e evidências

OCR local português/inglês/espanhol, revisão de palavras, orientação/inclinação, camada pesquisável e retomada parcial após reinício. Conversões DOCX/XLSX/RTF/TXT/ODT/ODS/PPTX/ODP e TIFF multipágina têm perfis de fidelidade declarados, workers e leitores independentes. Tabelas têm região/colunas, origem por célula e saídas XLSX/ODS/CSV/JSON. Compactação tem meta, prévia, limites de qualidade e cópias protegidas.

A fila autenticada oferece progresso, interrupção e segundo plano, com reserva de entrada/CPU e resultados protegidos. Divisão por quantidade/intervalos e PNG/JPEG protegem cada arquivo completo e publicam diretórios exclusivos. O teste interrompeu um lote real e retomou até cem arquivos conservando o prefixo. Junção com compactação opcional preservou quatro páginas e dois campos independentes, sem alterar as origens.

Impressão vetorial/livreto teve aparência de campos, revisão/retomada e PDF salvo conferidos. Impressão restrita a 200 dpi verifica a senha/permissão e bloqueia salvar a tarefa. Sua seleção de páginas, geometria e recusa de impressão proibida passaram. Oitenta páginas terminaram em segundo plano depois de fechar a aba de origem; a tarefa conservou `printOnly`. A confirmação de revisão permanece visível no rodapé. O caminho antigo de HTML temporário/IPC foi removido.

WIA tem descoberta real, estado vazio, aquisição por página com checkpoint antes da próxima folha e worker verificado em ASAR. Nenhum scanner físico está disponível. O adapter WIA 2 passou a usar FRONT_ONLY conforme a documentação, com conferência do valor aceito pelo driver.

Gates deste marco: **218 testes aprovados**, tipos app/tooling, Biome dos 17 arquivos do complemento e build normal aprovados. Jornada Electron ampliada completa aprovada, incluindo os fluxos anteriores, reinício, recuperação e gates de licença. Build normal restaurado após chaves efêmeras. Uma rodada anterior falhou no evento de fechamento antes do reinício; duas repetições conservaram o limite de espera e passaram, sem ocultar a falha. Não houve instalação, publicação, commit/push ou serviço documental externo.

O [registro intermediário](review-lote-4-parcial.md) conserva marcos, correções, capturas, referências e verificações independentes. Perfis: [conversões](perfil-conversoes.md), [lotes](perfil-lotes.md), [junção](perfil-juncao.md), [impressão](perfil-impressao.md) e [digitalização](perfil-digitalizacao.md).

## Complementos e limites

- Divisão por marcadores/tamanho e ampliação das matrizes de conversão; não há promessa de reproduzir qualquer arquivo Office.
- Aquisição física/duplex de scanner e impressão em driver/papel continuam pendentes. Enumeração vazia e mocks de contrato não comprovam essas operações.
- Tabelas precisam dos complementos de edição/confiança/extrator do lote 5.
- Corpus externo, consumidores compartilhados, acessibilidade e a checagem adicional de índices do grafo legado pertencem à revisão geral.
- Autoria, recorte de objetos, redação por busca, comparação, automação/consulta local, preparação por finalidade, acessibilidade documental/PDF/A e recursos especializados seguem no escopo autorizado.

Próxima frente: complementos de autoria/compatibilidade dos lotes 2/3, com review próprio, antes da conclusão do lote 5 e full review. Certificados e serviços externos permanecem excluídos.
