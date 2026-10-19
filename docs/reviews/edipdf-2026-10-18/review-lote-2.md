# Review do lote 2 do EdiPDF

18/10/2026. Motor PDF local, edição de conteúdo, redação, senha e geometria. O lote passa para a próxima etapa com complementos explícitos de autoria e compatibilidade.

## Resultado

- PDFium `@embedpdf/pdfium@2.15.1` executa em worker descartável. WASM, Noto Sans e avisos de licença são distribuídos localmente. Não há serviço ou CDN no processamento do documento. Fontkit `1.1.1` incorpora fontes e verifica glifos.
- Texto de primeiro nível é substituído no conteúdo original com fonte incorporada; imagens podem ser substituídas e extraídas. Objetos podem ser excluídos, movidos, escalados e girados. A revisão estrutural participa de desfazer/refazer e recuperação, com fonte base própria.
- Redação por área remove caracteres, pixels e desenhos, além de anotações sobrepostas. A regravação integral elimina revisões incrementais. A sanitização complementar remove metadados, anexos, ações externas e estrutura/texto alternativo, e torna formulários estáticos. Primeiro salvamento em cópia, com bloqueio de originais abertos.
- Sanitização tem escolhas explícitas. Recorte altera a área visível; escala proporcional transforma conteúdo e geometria das anotações editáveis. A interface distingue recorte de remoção permanente.
- Criptografia AES-256 com senhas diferentes de abertura e administração. Senha de abertura permite leitura segundo as permissões; edição e remoção de proteção exigem administração. Abertura autorizada mantém texto vetorial e AcroForm, sem fallback em imagem.
- Unicode novo usa fonte local nos casos cobertos e recusa glifos ausentes. Campos de formulário também recebem appearance com fonte compatível. Fontes adicionais/escritas complexas dependem de homologação específica.
- Exclusão de páginas reconcilia elementos de estrutura, ParentTree e IDTree, removendo texto alternativo da página excluída e preservando tags da página restante. Estruturas cíclicas são recusadas.

## Defeitos encontrados no review e corrigidos

1. A função nativa de redação de baixo nível reescrevia o conteúdo da página, mas mantinha comentário sobreposto com o segredo em `/Contents`. A etapa agora remove anotações intersectadas e referências inválidas antes da gravação. O teste procura o segredo nos objetos e streams descomprimidos da saída.
2. A classe de erro de criptografia publicada pelo pdf-lib não preserva `instanceof` no runtime observado. O carregador usa o fato `isEncrypted`, sem interpretar o texto de uma exceção nem tentar editar bytes cifrados.
3. Edição estrutural precisava salvar sua fonte base no conteúdo do histórico. `baseSource` evita que desfazer monte páginas antigas sobre metadados/árvore de outra revisão. A recuperação remapeia e valida essa fonte e os índices reais de páginas.
4. Cópias salvas precisam entrar no controle de revisão em disco. O main registra seu digest para detectar alterações externas na gravação seguinte.
5. Cancelar pelo diálogo estava bloqueado pelo bloqueio global da interface. O diálogo permanece operável e aborta o worker; controles próprios impedem publicação de operação cancelada.
6. O nome acessível do campo de texto foi explicitado. O runner também foi corrigido para escolher o botão do diálogo, aguardar a camada de texto efetiva e encerrar somente o processo de teste isolado.

## Evidências

- 42 testes Node aprovados; tipos e build de produção aprovados. Os casos acrescentados verificam texto antigo ausente, páginas/campos preservados, erros sem retorno parcial, pixels realmente alterados, senha incorreta/permissões, Unicode, recorte/escala em página girada, caixas com origem diferente de zero, destinos escalados e tags após exclusão.
- Electron real: edição pela interface, desfazer/refazer estrutural, marcação e aplicação de redação, salvamento por diálogo nativo em cópia, repetição de senha incorreta, leitura com senha de abertura e edição com senha de administração. Texto e valor do formulário foram conferidos após abertura.
- Licença offline assinada, expiração e negação de IPC passaram. Build normal restaurado depois do harness com chaves efêmeras. Nenhuma instalação, publicação ou operação remota.
- Capturas verificadas: [editor](lote2-editor.png), [marcação de redação](lote2-redacao.png), [leitura protegida](lote2-protegido.png). Dados das capturas são fixtures sintéticas.
- Biome focado sem erros; avisos de código legado não foram ocultados. Documentação e comandos pnpm atualizados.

## Complementos obrigatórios

Continuam para os lotes seguintes: parágrafos e caixas de texto, fontes personalizadas/idiomas adicionais, edição interna de grupos, recorte de imagens, redação por busca e corpus maior de PDFs complexos. Busca/seleção/miniaturas precisam incorporar as anotações novas. O histórico local pode conter versões anteriores à redação: retenção e gestão dessas cópias são parte do lote de preferências/versões. OCR, conversões, acessibilidade documental e demais funcionalidades do plano não são aprovados por este review. Full review final pendente.
