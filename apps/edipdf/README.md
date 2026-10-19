# EdiPDF

Entrega atual: [full review](../../docs/reviews/edipdf-2026-10-18/full-review-entrega.md) e [pendências documentadas](../../docs/reviews/edipdf-2026-10-18/pendencias-pos-release.md). Por orientação final do titular, a publicação encerra o lote atual; os demais recursos do diagnóstico ficam registrados para evolução posterior. O aceite do código e a publicação dos instaladores são registrados separadamente.

Assinatura gráfica: desenho, texto ou imagem, rotação, data opcional e biblioteca privada com armazenamento somente por opção explícita. Imagens oferecem limpeza do fundo branco, limite ajustável, recorte manual e prévia dos pixels preparados. É possível escolher o centro na prévia da página com mouse ou setas e definir a largura; assinatura e data são ajustadas para permanecer na página. Documentos alterados durante a preparação exigem reabrir a ferramenta. Não utiliza certificado digital.

“Digitalizar com scanner” usa WIA/driver do Windows para mesa e alimentador, no perfil de uma face por folha. A preparação roda em thread local e cada página completa é protegida antes da próxima folha. Cancelar pode exigir nova aquisição da folha em andamento; confira o dispositivo. Resultados podem ser revistos, abertos, encaminhados ao OCR ou salvos em PDF. O adaptador/ASAR e a ausência real de scanner foram verificados; aquisição física e duplex permanecem pendentes. Limites e estados no [perfil de digitalização](../../docs/reviews/edipdf-2026-10-18/perfil-digitalizacao.md).

Conversões locais: “Converter arquivo para PDF” aceita DOCX, XLSX, RTF, TIFF, ODT, ODS, PPTX e ODP; “Exportar documento” oferece DOCX/RTF/ODT/TXT, PPTX/ODP por fluxo e TIFF multipágina a 150/200/300 dpi. TIFF tem perfil explícito de cores/compressões, cem páginas/64 MB, limite de resolução e rejeição integral de perfis não suportados. Exportar TIFF transforma texto/campos/links em pixels; mantenha o PDF original. Confira todas as páginas e os avisos, usando página inteira/largura/150% e rolagem por teclado; resultados preparados ficam protegidos em Tarefas. Perfis, fidelidade e evidências no [review intermediário](../../docs/reviews/edipdf-2026-10-18/review-lote-4-parcial.md) e na [matriz de conversões](../../docs/reviews/edipdf-2026-10-18/perfil-conversoes.md). Scanner físico permanece pendente.

Tabelas: em “Exportar documento”, escolha XLSX/ODS/CSV ou mapa JSON, defina a página, área e divisões X das colunas e gere a prévia. Confira as linhas e selecione cada célula para destacar sua origem. XLSX/ODS incluem abas de proveniência e identificação da revisão PDF; CSV contém somente valores e o JSON permite compartilhar a origem. Números permanecem texto, sem recalcular fórmulas. Ajuste área/colunas e gere novamente quando necessário. A revisão preparada pode ser retomada em Tarefas; o perfil inicial ainda exige revisão de tabelas complexas e não inclui edição direta dos valores extraídos.

Preparação de impressão: intervalos/pares/ímpares/ordem inversa, papel/escala/margens, várias páginas por folha e livreto têm composição vetorial em worker, prévia paginada e retomada protegida. Formulários e anotações passam pela aparência de impressão do Chromium antes da composição. A cópia transitória é servida somente em memória por uma sessão isolada, com rede e acesso a arquivos bloqueados. “Salvar PDF preparado” conserva texto/vetores e permite conferir a saída sem usar papel. O envio ao driver, duplex, cores/cópias e a impressão física continuam em verificação; não confundir a prévia/PDF gerado com confirmação de papel impresso. Documentos restritos mantêm a impressão como imagens a 200 dpi quando a senha permite. Probe local sem papel: `pnpm exec node apps/edipdf/scripts/test-print-pipeline.mts`.

Compactação e tarefas: entradas de documentos abertos são protegidas localmente antes do processamento; arquivos escolhidos ficam vinculados ao caminho, tamanho e SHA-256. Uma interrupção permite retomar pelo painel Tarefas, com nova autorização. O arquivo interrompido recomeça do início, e uma origem alterada não é usada silenciosamente. Resultados prontos podem ser revisados e salvos sem reler a origem. “Continuar depois” conserva a cópia preparada; “Descartar esta cópia” a remove. A retomada sempre solicita um novo destino nativo. Entradas/lotes têm limite de 512 MB/100 arquivos; cópias de entrada incorporadas têm limite de 128 MB, e resultados seguem a quota protegida de tarefas. Meta não atingida conserva o melhor resultado para uma decisão explícita em Tarefas.

As cópias com nomes exclusivos usam `koffi` 3.3.3/MIT para uma função fixa do sistema, sem sobrescrita e sem gravar parcialmente no nome final. O componente e suas licenças acompanham o app; não há serviço externo. Verificação isolada do addon no ASAR: `pnpm exec node apps/edipdf/scripts/test-native-files.mts`. Esse probe não instala nem publica o produto.

Evolução autorizada por lotes: [plano e estado atual](PLANO-DE-IMPLEMENTACAO.md), a partir da [análise funcional](../../docs/reviews/edipdf-2026-10-18/analise-funcional.md). Serviços externos e assinaturas com certificado estão fora do escopo. Reviews [0](../../docs/reviews/edipdf-2026-10-18/review-lote-0.md), [1](../../docs/reviews/edipdf-2026-10-18/review-lote-1.md), [2](../../docs/reviews/edipdf-2026-10-18/review-lote-2.md) e [3](../../docs/reviews/edipdf-2026-10-18/review-lote-3.md). Os perfis iniciais do lote 4 foram revisados. A orientação final encerra o lote atual para publicação; os complementos de compatibilidade e o lote 5 ficam nas pendências pós-release, com critérios de aceite. A distribuição da suíte não significa conclusão dessa cobertura. Execução e perfis isolados: [guia Edi](../../docs/desenvolvimento-edi.md).

Editor de PDF para o dia a dia: organizar, anotar, preencher, assinar e salvar. O essencial do Acrobat.
O design de referência está em `edipdf.pen`.

Divisão e imagens: prepare um lote, confira os PDFs/PNG/JPEG gerados e salve em uma nova subpasta. Tarefas permite retomar arquivos completos após interrupção e continuar em segundo plano. O perfil inicial passou na verificação nativa; [perfil, limites e evidências](../../docs/reviews/edipdf-2026-10-18/perfil-lotes.md).

Junção de arquivos: seleção ordenada de PDFs/PNG/JPEG, compactação opcional em worker e revisão protegida do resultado, com abertura em nova aba ou salvamento de cópia. Tipos, build, testes e jornada nativa ampliada aprovados. [Perfil e limites](../../docs/reviews/edipdf-2026-10-18/perfil-juncao.md).

Impressão restrita: preparação como imagens a 200 dpi, cancelamento e revisão/retomada protegida, com exportação bloqueada quando a senha só autoriza imprimir. Tipos, testes, build e jornada nativa ampliada aprovados no perfil documentado; driver/papel ainda pendentes. [Perfil e evidências](../../docs/reviews/edipdf-2026-10-18/perfil-impressao.md).

Tarefas: a barra superior mostra a fila e o progresso das operações autenticadas. OCR e conversões oferecem “Continuar em segundo plano”; você pode usar o editor e revisar o resultado protegido em Tarefas quando terminar. Nenhuma alteração é aplicada automaticamente ao documento. Interromper conserva checkpoints já completos; fechar o aplicativo não garante a retomada de conversões ainda sem resultado. Demais operações longas continuam em integração.

## Rodar

```bash
pnpm install --frozen-lockfile                    # na raiz do monorepo
pnpm --filter @informach/edipdf dev                # abre o editor
```

**Atalho local:** `pnpm --filter @informach/edipdf shortcut` compila o app, cria o atalho **EdiPDF** na Área de Trabalho e no Menu Iniciar
e adiciona o EdiPDF em **Abrir com** para arquivos `.pdf` (só para o seu usuário, sem trocar o aplicativo padrão).
Para abrir PDFs com dois cliques: botão direito num PDF › Abrir com › Escolher outro aplicativo › EdiPDF › Sempre.
Depois de mudar o código, rode `pnpm --filter @informach/edipdf build` (ou `shortcut` de novo).

| Comando | O que faz |
|---|---|
| `pnpm --filter @informach/edipdf test` | Testes do gerador, persistência, motor local e integridade |
| `pnpm --filter @informach/edipdf typecheck` | Verificação de tipos |
| `pnpm --filter @informach/edipdf build` | Build de produção em `out/` |
| `pnpm edi:test:native edipdf` | Jornada Electron com fixture, licença offline, expiração, foco e recuperação após reinício |

## O que faz

**Abrir e ver**
- Abas para vários documentos; abrir por botão, Ctrl+O, arrastar para a janela ou "Abrir com" do Windows
- Recentes com miniatura, busca, fixação e limpeza; gravação da lista e de miniaturas pode ser desativada
- Rolagem contínua, página única/dupla, modo leitura, zoom (Ctrl+roda, Ctrl+= / Ctrl+-, ajustar à largura / página inteira), ferramenta Mão e navegação de ida/volta
- Busca na revisão atual (Ctrl+F), incluindo anotações e valores preenchidos, com posições reais, opções de acentos/maiúsculas/palavras/frases e erros parciais visíveis
- Marcadores hierárquicos, links internos/web interativos e anexos locais; links externos pedem confirmação, anexos não são executados
- Preferências (tema claro/escuro/sistema, texto maior, painéis redimensionáveis e atalhos); paleta de ações (Ctrl+K)
- Recuperação e versões protegidas pelo Windows, retenção/cota e restauração opcional da sessão sem guardar senhas
- Seleção e cópia de texto
- PDFs com senha

**Organizar páginas** (painel lateral ou a visão Organizar)
- Arrastar para reordenar, Ctrl/Shift+clique para selecionar várias
- Girar, excluir, duplicar, inserir página em branco, inserir páginas de outro PDF ou imagem (inclusive arrastando do Explorer)
- Extrair páginas; dividir por quantidade, intervalos, nível de marcadores ou tamanho real máximo; exportar páginas como PNG/JPG. Os planos resolvidos entram na retomada protegida e conservam arquivos completos. [Perfil revisado](../../docs/reviews/edipdf-2026-10-18/review-senhas-escolhas-divisao.md).
- **Juntar PDFs**: vários PDFs e imagens em um só, na ordem escolhida; "Juntar e salvar" grava direto (com compactação opcional) e "Abrir para revisar" abre o resultado para editar antes
- Criar PDF a partir de fotos

**Compactar**
- **Compactar PDF** na tela inicial (um ou vários arquivos; cópias na pasta escolhida, com "nome (compactado).pdf") ou no painel do documento aberto (salva uma cópia com as edições)
- Três níveis: Leve (imagens até 200 dpi), Equilibrada (150 dpi, recomendada) e Forte (100 dpi)
- Meta em MB, piso de qualidade e aviso de meta impossível; prévia de uma página antes de salvar cada cópia e cancelamento
- Reduz e recodifica as imagens em JPEG e remove objetos que não são usados; texto, links e formulários não mudam. O resultado nunca fica maior que o original
- A resolução considera o uso físico de cada imagem; perfis de cor/transparências sem conversão segura são preservados e informados
- Salvar normalmente também já descarta o conteúdo de páginas excluídas

**Reconhecer texto (OCR local)**
- Ferramentas → Reconhecer texto: lotes de páginas, português/inglês/espanhol e modelos distribuídos com o app, sem envio de documentos
- Compara orientações, estima inclinação e permite ajuste manual; mostra imagem, confiança e revisão por palavra antes de aplicar
- Gera camada pesquisável/selecionável, preservando a aparência e exigindo cópia; páginas com texto são ignoradas por padrão
- Guarda o progresso ao concluir cada página; Ctrl+K → Tarefas permite retomar as páginas pendentes e revisar o texto. Retomadas usam a cópia protegida da tarefa e abrem o resultado em uma nova aba
- Para preservação/retomada, o PDF de entrada deve ter até 64 MB e mil páginas, com até cem páginas por lote e 200 mil palavras; compacte uma cópia ou extraia um intervalo para documentos maiores
- Limites e evidências no [review intermediário do lote 4](../../docs/reviews/edipdf-2026-10-18/review-lote-4-parcial.md); conversões, impressão e digitalização ainda estão em evolução

**Conversões locais**
- Ctrl+K → Converter arquivo para PDF: escolher DOCX/XLSX/RTF/TIFF/ODT/ODS, conferir avisos e todas as páginas da prévia, salvar cópia ou abrir como novo PDF sem alterar o Office original
- Ferramentas → Exportar documento: PDF para DOCX/RTF/ODT/PPTX/ODP por fluxo com linhas de texto, estilos básicos e imagens de primeiro nível; TXT usa o texto pesquisável da revisão atual. PDFs digitalizados precisam de OCR para texto editável
- DOCX/XLSX/RTF/ODT/ODS são lidos em um worker local, sem Word/Excel instalado. Fórmulas usam apenas resultados salvos; macros/ActiveX são recusados e conteúdo externo não é acessado
- O perfil atual reconstrói fluxo/tabelas, não garante fidelidade de paginação. Cabeçalhos/rodapés Word, numeração complexa, caixas/desenhos ancorados, gráficos Excel, mesclagens e formatos numéricos especiais precisam de revisão; avisos aparecem antes de aceitar. XLSX/CSV a partir de regiões do PDF e demais formatos seguem em implementação
- Ctrl+K → Tarefas e resultados preparados: retomar conversões concluídas cuja revisão foi fechada. Resultados ficam protegidos no computador até salvar ou descartar; abrir um PDF convertido mantém essa cópia preparada. Essas cópias podem conter dados removidos posteriormente do documento

**Editar e anotar**
- Texto novo (fonte, tamanho, cor, negrito, itálico)
- **Ferramentas → Caixa de texto e parágrafos**: ajustar quadro, quebra automática, entrelinhas, alinhamento e listas simples; escolher Noto Sans ou uma fonte TrueType local. A prévia recusa texto que não cabe. Duplo clique permite reeditar; desfazer/refazer conserva a revisão anterior.
- **Editar texto** do próprio PDF: clique numa linha para escolher e substituir o objeto original com fonte local incorporada, preservando tamanho, posição e cor. O texto antigo é removido do conteúdo; o restante da página é preservado
- **Ferramentas → Editar conteúdo original**: escolher, excluir, mover, escalar e girar objetos; substituir/extrair imagens
- Imagens originais: recorte por percentuais com área conservada na prévia. Não estica a imagem; reconverte pixels para RGB e mantém a instância na posição correspondente. Não serve para apagar informação confidencial de OCR/metadados/outras cópias. Perfil: revisão até 64 MB, imagem até 50 megapixels.
- **Remover conteúdo permanentemente**: marcar uma área na prévia e remover texto, pixels, desenhos e anotações sobrepostos. A revisão sanitiza metadados/anexos/texto alternativo e torna os formulários estáticos; o primeiro salvamento exige cópia
- **Remover conteúdo por busca**: pesquisar texto literal, selecionar ocorrências, conferir áreas e confirmar a remoção. Até cem páginas/64 MB, mil ocorrências e dez mil áreas. Índices sem Unicode/geometria confiáveis são recusados; use OCR ou remoção por área. Anotações sobrepostas são removidas por inteiro; formulários tornam-se estáticos e o salvamento exige cópia.
- **Sanitizar documento**: escolher a remoção de metadados, anexos, comentários, ações externas e dados de estrutura
- **Recortar/redimensionar**: recorte da área visível ou escala proporcional da página e de suas anotações. Recorte conserva conteúdo externo e não serve para ocultar informações confidenciais
- **Proteger cópia por senha**: criptografia AES-256 com senhas de abertura e administração e permissões de impressão/cópia/edição/preenchimento
- Novas senhas são conferidas sem truncamento: até 127 bytes UTF-8, com recusa de caracteres inválidos e pares que o motor reconhece como equivalentes. A proteção também exige autorização administrativa para alterações quando o arquivo abre com senha vazia. [Review e estado](../../docs/reviews/edipdf-2026-10-18/review-senhas-parcial.md).
- Realçar, sublinhar e tachar texto selecionado
- Desenho à mão livre, retângulo, elipse, linha e seta
- Comentários (viram notas de verdade no PDF, visíveis no Acrobat e no navegador)
- Imagens e **assinaturas gráficas** (traços vetoriais no desenho, digitação ou foto com fundo removido, giro e data opcional; guardar para reusar é opcional, com proteção local)
- Cobrir: retângulo branco para esconder conteúdo
- Marca d'água com intervalos/exceções, nove posições, margens e ajuste para caber; cabeçalhos/rodapés com estilos, prefixos Bates, capa, contagem e rótulos de navegação opcionais. Prévia real por página antes de aplicar, com desfazer/refazer. [Estado da validação](../../docs/reviews/edipdf-2026-10-18/review-marcas-numeracao-parcial.md).
- Preencher formulários (texto, caixas, opções, listas)
- Listas conservam rótulos e valores internos separados na edição, seleção múltipla, dados exportados e aparência salva; configuração aceita coordenadas fracionárias importadas.
- Preparar campos AcroForm, configurar rótulos/obrigatoriedade/limites/máscaras locais/seleção múltipla, sugerir campos em linhas de preenchimento e importar/exportar dados JSON/CSV
- Formulários: ordenar manualmente os controles por página e escolher uma fonte TrueType local para texto/listas. A fonte completa fica no PDF e é preservada ao preencher novamente. A prévia reconhece famílias padrão ou programas TrueType suportados; quando usa uma alternativa, mostra aviso. Perfil e validação no [complemento de formulários](../../docs/reviews/edipdf-2026-10-18/review-formularios-complemento.md).
- Gerenciar anotações em seleção múltipla: duplicar, copiar/colar dentro do EdiPDF, agrupar, alinhar, ordenar e bloquear; comentários têm autor/estado, filtros e exportação JSON
- Propriedades do documento (título, autor, assunto, palavras-chave)
- Desfazer/refazer de tudo (Ctrl+Z / Ctrl+Y)

**Salvar e imprimir**
- Salvar (Ctrl+S) e Salvar como (Ctrl+Shift+S); aviso de alterações não salvas ao fechar aba ou janela
- Imprimir (Ctrl+P) pela caixa de impressão do Windows
- O arquivo salvo mantém o texto selecionável, os metadados e os campos de formulário do original

### Atalhos de ferramenta

V selecionar · H mão · T texto · E editar texto · R realçar · D desenhar · C comentário · Delete exclui a anotação
selecionada · setas movem (Shift = 10 pt) · Esc volta para Selecionar.

## Limites conhecidos

- Anotações novas são gravadas como objetos PDF nativos com appearance vetorial. O envelope de edição v1 continua legível; caixas de texto e modelos grandes usam v2 em stream UTF-8 comprimido. Recuperação permanece v1. O EdiPDF reabre seus objetos editáveis; comentários/formas/marcações externos suportados são importados. Anotações achatadas por versões anteriores não recuperam automaticamente a estrutura perdida.
- O editor de conteúdo edita objetos de primeiro nível e tem um perfil inicial de edição interna de Form XObjects com isolamento da ocorrência selecionada. “Editar elementos do grupo” abre prévia/coordenadas internas; wrappers simples, Matrix identidade e grupos sem tags/transparência têm testes e jornada nativa aprovados no perfil declarado. Páginas mistas, matrizes e grupos aninhados ainda precisam de ampliação; [estado e limites](../../docs/reviews/edipdf-2026-10-18/review-form-content.md). Imagens podem ser recortadas por pixels, conservando a matriz de posicionamento; grupos/máscaras complexas de estado gráfico ou funções de transferência são recusados nesse perfil. Grupos de anotações do EdiPDF permitem selecionar um membro com Alt + clique, sem desagrupar.
- Texto novo usa fontes padrão quando todos os glifos são representáveis; Noto Sans local cobre os casos homologados de português, grego e cirílico. Glifos ausentes provocam erro explícito e preservam o trabalho. Fontes TrueType estáticas locais são aceitas nas caixas e na substituição estrutural, após verificar limites e direitos de incorporação. Coleções, fontes variáveis/coloridas/bitmap e contornos CFF ficam fora desse perfil. Caixas exigem composição horizontal simples da esquerda para a direita; scripts complexos e outros idiomas precisam de homologação.
- Caixas têm até 100 mil caracteres e 10 mil trechos/linhas, sem fluxo automático entre páginas. Dimensões são ajustáveis pelo diálogo e pelas alças com mouse/setas (Shift: dez pontos), com validação antes de confirmar e cancelamento por Esc. Autoria/redimensionamento, gestos e preparação dos campos passaram na jornada completa; [review integrado](../../docs/reviews/edipdf-2026-10-18/review-gestos-e-campos.md). A fonte da caixa fica no modelo (8 MB por fonte, 64 MB Base64 no conjunto). Fontes que proíbem subsetting são incorporadas integralmente nas caixas e recusadas na substituição estrutural por PDFium. O app não altera direitos de fonte.
- PDFs protegidos podem ser lidos com a senha de abertura. Edição/remoção de proteção exige a senha de administração e salva cópia com texto/estrutura preservados, sem rasterização. Para aplicar ou trocar a senha, use Proteger cópia. Senhas não são armazenadas nas preferências.
- XFA fica somente para leitura. Assinaturas existentes são detectadas para aviso de alteração e preservação do original; não há verificação de certificados.
- Campos podem ser movidos entre páginas e tabulados por linhas/colunas. Ordem manual/fontes TrueType nos widgets têm perfil local revisado; fontes em subconjunto, estilos diferentes entre aparições e XFA dinâmico ainda precisam de corpus; não declarar compatibilidade universal. PDFs com `UserUnit` diferente de 1 ficam em leitura para preservar suas medidas.
- Miniaturas representam a última revisão confirmada; o rascunho de texto ainda aberto não entra na prévia até ser finalizado. Clipboard do sistema está implementado para anotações editáveis/texto e PNG, com revisão do texto colado e limites de payload; a homologação nativa isolada permanece pendente por permissão Windows. Estado e comando de teste no [review parcial](../../docs/reviews/edipdf-2026-10-18/review-clipboard-parcial.md).
- Redação remove o conteúdo da revisão exportada. Originais, desfazer, cópias anteriores e snapshots locais continuam existindo até serem gerenciados pelo usuário; não equivale a apagar todas as cópias do dispositivo.
- OCR está disponível localmente; manuscritos, fotos degradadas e tabelas complexas ainda precisam de corpus. Conversões Office têm limites explícitos de perfil e exigem revisão da prévia.
- A compactação não mexe em imagens CMYK, com paleta, JPEG 2000 ou JBIG2 (comuns em digitalizações em preto e branco), nem em fontes embutidas.

## Como funciona

- `src/shared/document-format.ts`: schemas e recuperação v1; `document-commands.ts`: transações validadas.
- `src/shared/local-engine.ts` e `engine-contracts.ts`: PDFium local para objetos, pixels e criptografia. `engine-worker.ts` executa o motor fora da interface e pode ser terminado no cancelamento. WASM e fontes são empacotados; não usam CDN no runtime.
- `src/shared/pdf-sanitize.ts`, `pdf-structure.ts` e `page-geometry.ts`: sanitização, reconciliação de tags após exclusão e geometria de páginas/anotações. Árvores cíclicas ou inválidas são recusadas.
- `resources/fonts/sources.json` registra origem e digest das fontes; `resources/licenses/` acompanha os recursos distribuídos. API e licença dos motores: [PDFium/EmbedPDF](https://www.embedpdf.com/docs/pdfium/introduction), [fontkit](https://github.com/Hopding/fontkit), [Noto](https://github.com/notofonts/noto-fonts).
- `src/shared/pdf-annotations.ts` e `pdf-forms.ts`: anotações interoperáveis, dados de edição e campos importados por fonte.
- `src/main/recovery-store.ts`: cópias locais atômicas protegidas pelo Windows; `file-revisions.ts`: conflitos externos de gravação. Rascunhos são preservados; a recuperação abre outro destino. A janela anterior ao autosave (750 ms) não equivale a gravação já concluída.
- `src/main/version-store.ts`, `validated-store.ts` e `signature-store.ts`: retenção, validação, reparo com backup e proteção local. Recuperação atual tem limite de 160 MB por trabalho; a cota configurável vale para versões anteriores.
- `src/shared/text-search.ts`, `page-layout.ts`, `render-budget.ts`, `pdf-navigation.ts`, `form-authoring.ts` e `annotation-commands.ts`: busca, geometria da leitura, orçamento de pixels e operações locais validadas. Exportação acima do limite não reduz a resolução silenciosamente.

- `src/shared/model.ts`: o documento editável (lista de páginas que apontam para os PDFs de origem + anotações em coordenadas da página).
- `src/shared/build.ts`: monta o PDF final com pdf-lib ao salvar e junta arquivos.
- `src/shared/compress.ts`: compactação (extrai imagens, limpa objetos órfãos); a recodificação JPEG usa o canvas do app.
- `src/renderer/src/lib/pdf.ts`: renderização com pdf.js (páginas, miniaturas, camada de texto, campos de formulário).
- `src/renderer/src/viewer/`: visualizador, interações de anotação, miniaturas e Organizar.
- `src/main/index.ts`: janela, arquivos, recentes, assinaturas salvas, impressão.

Verificação automática da interface: configure `EDIPDF_SNAPSHOT` e `EDIPDF_SNAPSHOT_JS` em um perfil de teste isolado e execute `pnpm --filter @informach/edipdf dev -- arquivo.pdf`.
roda o script na janela (em dev há `window.__edipdf` com store e ações), salva um print e fecha.
