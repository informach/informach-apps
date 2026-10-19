# Análise funcional do EdiPDF para substituir o Acrobat

Data: 18/10/2026. Escopo: checkout local de `informach-apps`, app `apps/edipdf`, SDK desktop consumido e referência pública do Acrobat. O HEAD consultado foi `88c1163d9ca32f3310da77ac853dc71012d3fe7b`, com alterações locais anteriores, principalmente no EdiSVG e no SDK. A análise usa o estado efetivo dos arquivos; não representa uma release desse commit.

O EdiPDF tem uma base útil para leitura, organização de páginas e anotações simples, mas ainda não substitui o Acrobat para edição profissional, digitalizações, proteção, assinaturas digitais e fluxos empresariais. Há defeitos de integridade a corrigir antes da expansão. A principal mudança necessária é passar de páginas de origem com sobreposições para operações PDF que preservem e modifiquem o conteúdo e a estrutura corretamente.

O objetivo informado pelo titular é substituir o Acrobat de forma mais eficiente, simples, facilitada, melhor e inteligente. Isso exige cobertura dos trabalhos reais e redução de esforço, além de uma lista de ferramentas. O roteiro abaixo é uma proposta de evolução; esta tarefa não autoriza sua implementação, migração de motor, novos serviços ou publicação.

## Evidência e limites da análise

- Leitura de main, preload, modelo, geração, compactação, ações, estado, visualizador, formulários, menus, painéis, diálogos e testes do EdiPDF; consulta dos contratos compartilhados de arquivos, recuperação e licença.
- Node `24.15.0`, pnpm `9.15.0`, pdf-lib `1.17.1`, PDF.js `6.4.299`, Electron `44.8.0`, React `19.3.1`, conforme ambiente, manifest e lockfile. Nenhuma dependência foi atualizada.
- `pnpm --filter @informach/edipdf test`: **22 testes aprovados**. `pnpm --filter @informach/edipdf typecheck` e build: aprovados. O build comum foi restaurado depois da jornada efêmera. Warnings de detecção de módulo dos testes continuam visíveis.
- Probes com PDFs sintéticos: sobreposição e extração de texto, Unicode, exclusão com marcador, exclusão com widget compartilhado e duas modalidades de mesclagem com formulários. Resultados em [integridade.json](integridade.json).
- Jornada no Electron real, com o harness nativo existente adaptado apenas em uma cópia de investigação, chaves efêmeras e perfis isolados. Exercitou abertura por argumento, edição por interface, busca, assinatura, salvamento/reabertura, recuperação, janela de 1100 px, licença offline, expiração e negação de IPC. Resultados em [electron.json](electron.json), com [tela do documento](documento.png) e [rascunho indicado como salvo](rascunho.png).
- A primeira execução também passou na verificação compartilhada de inventário ASAR físico, rejeição de alterações e abertura de uma ferramenta portátil assinada. A segunda repetiu somente o app e os probes adicionais de recuperação/janela. Não foi instalado nem publicado um instalador.
- Não houve impressão física, benchmark com documentos grandes, certificação PDF/A/PDF/UA, assinatura com certificado real ou teste de compatibilidade com um corpus extenso. Os casos de PDF protegido, conflitos externos de gravação e algumas divergências de aparência abaixo são achados de código, identificados como tais. Dados pessoais e produção não foram usados.

**Como ler:** R = reproduzido com saída observável; C = confirmado no fluxo do código, sem reprodução específica; L = limitação explícita do produto. P0 = exposição/integridade prioritária; P1 = bloqueia confiança ou uso central; P2 = produtividade/usabilidade; P3 = especialização posterior. As prioridades são propostas, não um cronograma aprovado.

### Reproduzir a investigação

Na raiz do repositório, com as dependências do lockfile já instaladas:

```powershell
node docs/reviews/edipdf-2026-10-18/reproduzir-integridade.mts
node docs/reviews/edipdf-2026-10-18/preparar-electron.mts
pnpm --dir .cache/edipdf-analysis run native edipdf
pnpm --filter @informach/edipdf build
```

O segundo comando cria uma cópia do harness e uma jornada específica em `.cache/edipdf-analysis`; não altera o runner oficial. O terceiro requer Windows e usa os mecanismos de fixture/isolamento do runner original, com verificação de acesso ativa. O último restaura o build local comum depois do build com configuração efêmera. Os probes registram o comportamento observado, inclusive defeitos; sucesso do processo não significa aprovação funcional. Não integram o CI. Os resultados originais desta análise estão nos JSON ao lado; novos resultados ficam em `.cache`.

## Cobertura atual

| Trabalho | Estado observado |
| --- | --- |
| Abrir vários documentos, selecionar texto, navegar e buscar | Implementado; busca tem lacunas de conteúdo e geometria |
| Reordenar, girar, duplicar, excluir e inserir páginas | Implementado; exclusão não remove sempre os dados do arquivo |
| Extrair, dividir por quantidade e juntar PDFs/imagens | Implementado; estruturas de formulários não são preservadas integralmente |
| Adicionar texto, formas, desenho, marcações e comentários | Implementado por sobreposições; só comentários são gravados como anotações PDF nativas |
| Editar texto original | Cobertura do original e nova linha por cima; não substitui o conteúdo original |
| Editar imagens já existentes no PDF | Ausente; há inserção de novas imagens |
| Preencher formulário existente | Parcial; depende da fonte primária e de tipos básicos de campo |
| Assinar | Aparência gráfica por imagem; sem assinatura com certificado |
| Compactar | Implementado, com níveis e lote; cobertura limitada de formatos e qualidade |
| Imprimir | Implementado por páginas rasterizadas a 200 dpi e diálogo do sistema |
| OCR, senha de saída, redação segura, Office, comparação, acessibilidade documental e IA | Ausentes |
| Salvamento atômico, nomes exclusivos e proteção de acesso da suíte | Implementados; há lacunas em recuperação e tarefas longas |

O catálogo oficial da [Adobe](https://www.adobe.com/br/acrobat/features.html) serve como referência de amplitude: edição, conversão, organização, formulários, proteção e colaboração. OCR também tem [fluxo próprio documentado](https://helpx.adobe.com/acrobat/desktop/create-documents/scan-documents-to-pdfs/recognize-text.html). A análise não equipara todos os planos e serviços da Adobe nem presume que cada item deva entrar na primeira versão do EdiPDF.

## 1 Funcionalidades que precisam de ajustes ou correções

### C01 Exclusão, extração e divisão podem manter conteúdo de páginas removidas — P0, R

Em duas fixtures de duas páginas, foi mantida apenas a primeira. O resultado abriu com uma página, mas ainda continha **dois objetos de página e o stream do texto `SEGREDO_REMOVIDO`**. Um caso usou marcador para a segunda página; o outro, um campo com widgets nas duas páginas.

**Causa:** `buildPdf` remove páginas da árvore, mas preserva referências do catálogo e widgets restantes. `dropOrphanFields` só remove o campo quando todos os widgets pertencem às páginas removidas. `pruneUnreachable` conserva qualquer objeto ainda referenciado. Remover objetos órfãos não resolve referências vivas para conteúdo excluído.

**Ajuste:** reconciliar marcadores, destinos, links, widgets, árvores estruturais e demais referências ao criar a saída; revisar também extração e divisão, que usam o mesmo gerador. Preservar a navegação das páginas que ficam. **Aceite:** além da contagem visual, os objetos/streams das páginas excluídas não podem continuar recuperáveis por referências indevidas. Originais permanecem preservados.

Evidência: `src/shared/build.ts:405`, `:475`, `:521`; `src/shared/compress.ts:58`.

### C02 Editar texto e Cobrir mantêm o conteúdo original — P0 para uso de ocultação, R/L

A fixture salva após cobrir e adicionar uma substituição extraiu `ORIGINAL_CONFIDENCIAL NOVO_TEXTO`. O conteúdo visualmente coberto continua pesquisável/extraível. A interface explica a cobertura, mas o tooltip também usa “apagar”, expressão inadequada para uma ação que deixa o conteúdo no PDF.

**Ajuste imediato:** comunicar consistentemente que Cobrir é cobertura visual e não remoção de dados; evitar “apagar”. A edição real e a redação segura exigem operações próprias no conteúdo, descritas em I01 e I03. **Aceite:** nenhuma operação deve prometer remoção quando só acrescenta um retângulo. A função segura precisa eliminar texto, imagem e conteúdo oculto da região.

Evidência: `src/renderer/src/lib/editing.ts:170`; `src/shared/build.ts:506`; `src/renderer/src/ui/Toolbar.tsx`.

### C03 Recuperação confirma salvamento sem incluir rascunho — P1, R

Após salvar e reabrir, foi digitado texto novo sem concluir a edição. A barra continuou indicando **Salvo**. `window.ediSuite.recover()` concluiu com sucesso, mas os bytes do arquivo não mudaram e o rascunho continuou aberto.

**Causa:** a recuperação verifica `isDirty(document)` antes de `finishDraft(document.id)`; `isDirty` compara somente o conteúdo confirmado com o snapshot salvo. **Ajuste:** incluir o rascunho no estado de trabalho pendente e confirmá-lo antes de decidir o que precisa ser gravado. Confirmar sucesso só depois da gravação efetiva. **Aceite:** recuperação de documento salvo com rascunho deve preservar o texto digitado; cancelamento/falha deve ser comunicado sem declarar sucesso.

Evidência: `src/renderer/src/App.tsx:258`; `src/renderer/src/state/store.ts`; [electron.json](electron.json).

### C04 Juntar e inserir PDFs deixam formulários incompletos — P1, R/C

Ao juntar um PDF com campo `nome` e outro com `empresa` pelo gerador do documento, só `nome` permaneceu na árvore de campos, embora a segunda página conservasse um widget. Pelo caminho “Juntar e salvar”, a lista final de campos ficou vazia. O renderer só oferece preenchimento para páginas da fonte primária.

**Ajuste:** importar a árvore AcroForm, associar widgets, tratar nomes iguais entre documentos e atualizar valores com identidade por fonte/campo. Duplicação e extração também precisam de política explícita para compartilhar ou tornar independente o campo. **Aceite:** ambos os campos continuam preenchíveis após salvar/reabrir e em outro leitor compatível; homônimos não cruzam dados de forma involuntária.

Evidência: `src/shared/build.ts:449`, `:472`, `:550`; `src/renderer/src/viewer/PageView.tsx:127`.

### C05 Comentários e anotações existentes não entram no modelo editável — P1, R/L

Uma fixture com comentário PDF nativo abriu com zero anotações na lista. Depois de editar, salvar e reabrir, as novas sobreposições também deixaram de aparecer como objetos editáveis. A aparência de certos objetos pode continuar no canvas; isso não oferece leitura, resposta, seleção ou edição do comentário original.

**Ajuste:** importar anotações suportadas e persistir representações PDF interoperáveis, com IDs e propriedades. Indicar tipos não suportados e preservá-los. **Aceite:** criar, salvar, fechar, reabrir e editar comentário, destaque e texto sem perda de autoria/propriedades suportadas. Não duplicar a mesma anotação a cada ciclo.

Evidência: `makeDoc` em `lib/actions.ts:97`; `Painter.draw` em `shared/build.ts`; `PropsPanel.tsx` e [electron.json](electron.json).

### C06 Busca não acompanha o documento editado — P1, R/C

No Electron, a busca de `SUBSTITUICAO_NOVA` retornou **Nada encontrado**, e a do texto coberto retornou **1 de 1**. O índice é calculado a partir das fontes originais; textos novos, comentários e valores editados não são integrados.

**Ajuste:** indexar o documento efetivo e atualizar por revisão. Separar, quando necessário, busca no conteúdo visível, comentários e campos. **Aceite:** texto inserido entra imediatamente na busca; desfazer/refazer atualiza os resultados; uma substituição real remove o original do índice. Enquanto houver apenas cobertura, o produto deve tratar explicitamente a presença do original.

Evidência: `src/renderer/src/lib/pdf.ts:303`; `viewer/SearchBar.tsx`.

### C07 Caracteres suportados na tela viram interrogações ao salvar — P1, R

`Olá Ω 中文 ✓ 😀` passa por `toWinAnsi` como `Olá ? ?? ? ?`. Isso afeta texto novo, marca d'água e numeração personalizada; campos de formulário têm outro caminho e também precisam de cobertura tipográfica.

**Ajuste:** usar fontes embutidas com cobertura adequada e tratamento de escrita/ligaduras; validar glifos sem substituir silenciosamente. **Aceite:** texto, busca e extração permanecem equivalentes ao digitado em português, símbolos matemáticos e idiomas homologados; glifos indisponíveis recebem orientação antes da gravação.

Evidência: `src/shared/model.ts:394`; `src/shared/build.ts:266`, `:287`, `:315`.

### C08 Salvar PDFs protegidos perde estrutura e pode perder valores recém-preenchidos — P1, C/L

O fallback rasteriza **todas as fontes** quando há fonte protegida no build, inclusive as não protegidas. Renderiza a origem, não os valores atuais de `content.forms`, e depois limpa `forms`. Texto selecionável, links, formulários e estrutura deixam de existir nessa cópia; os valores novos não têm um caminho de aplicação antes da rasterização.

**Ajuste:** preservar conteúdo usando um motor capaz de abrir/salvar com a senha autorizada. Até isso existir, a conversão deve informar todas as perdas, incorporar o estado editado corretamente e tratar só as fontes necessárias. **Aceite:** PDF misto e protegido com formulário não perde valores; escolha de cópia preserva os arquivos originais; não remover proteção silenciosamente.

Evidência: `src/renderer/src/lib/actions.ts:234`, `:250`.

### C09 Compactar e salvar cópia permite escolher o original — P1, C

`compressDoc` sugere outro nome, mas aceita o caminho original e chama `writeFile` sem a comparação usada em `saveDoc` para arquivos protegidos. A confirmação de substituição do diálogo nativo não cumpre a promessa de que a operação salva uma cópia e preserva o original.

**Ajuste:** política central para original/cópia e comparação dos destinos de todas as fontes. **Aceite:** operações apresentadas como cópia não sobrescrevem fontes, inclusive PDFs protegidos e documentos combinados; o usuário recebe uma alternativa de nome.

Evidência: `src/renderer/src/lib/compress.ts:104`, comparado com `lib/actions.ts:287`.

### C10 Ordem visual de objetos pode divergir da saída — P1, C

O renderer separa destaques, formas SVG e texto/imagens HTML em camadas. O gerador percorre a ordem do array de anotações. Por exemplo, um retângulo adicionado depois de um texto é desenhado depois no PDF, enquanto o HTML do texto fica depois do SVG na tela. A cobertura e o texto substituto também são objetos independentes; mover ou girar apenas um pode desfazer a aparência da edição.

**Ajuste:** estabelecer uma ordem e uma transformação comuns à prévia e à saída, com operações compostas quando necessário. **Aceite:** composição de texto, forma, imagem, destaque e cobertura tem a mesma aparência antes e depois de salvar/imprimir/exportar, inclusive com rotação.

Evidência: `src/renderer/src/viewer/PageView.tsx`; `src/shared/build.ts:506`; `model.ts:243`.

### C11 Trocar a cor da assinatura apaga o desenho — P2, R

O desenho tinha 1.518 pixels com alpha; ao selecionar Azul, caiu para zero. `DrawPad key={ink}` remonta o canvas.

**Ajuste:** armazenar os traços fora do canvas e manter o desenho ao mudar estilo, modo ou tamanho. **Aceite:** mudar cor preserva o trabalho, com comportamento definido para traços anteriores e próximos; Limpar continua sendo uma ação explícita.

Evidência: `src/renderer/src/dialogs/SignatureDialog.tsx`; [electron.json](electron.json).

### C12 Miniaturas e recentes mostram a origem, não as edições — P2, R/C

A miniatura permaneceu idêntica após alterar o texto. `thumbnail` depende da fonte/página/rotação, sem revisão do conteúdo. O recente salvo também é gerado pela fonte primária, não pelo resultado.

**Ajuste:** gerar miniaturas do estado efetivo e invalidar por revisão. **Aceite:** páginas duplicadas com anotações diferentes, formulários preenchidos e primeira página reorganizada têm prévias corretas, sem renderização completa desnecessária.

Evidência: `src/renderer/src/lib/pdf.ts`; `lib/actions.ts:140`, `:329`; `viewer/ThumbGrid.tsx`.

### C13 Juntar para revisar pode produzir resultado parcial — P1, C

`sourceFromFile` retorna `null` em falha/cancelamento, e `combineFiles`/`insertFilesAt` seguem com as fontes válidas. Há toast de erro em falhas, mas não uma decisão explícita nem relatório final de quais entradas ficaram fora. O resultado incompleto pode ser salvo como se a seleção inteira tivesse sido processada.

**Ajuste:** escolher entre operação integral ou continuidade parcial confirmada com lista de exclusões e ordem final. **Aceite:** nenhum arquivo é omitido sem indicação persistente; cancelar a senha tem efeito previsível sobre o conjunto.

Evidência: `src/renderer/src/lib/actions.ts:207`, `:654`.

### C14 Tarefas longas não usam o ciclo compartilhado de jobs — P1, C

Exportação, impressão, compactação e conversão usam `busy`, sem `desktopJobs.begin`, cancelamento real ou checkpoints. A autorização é verificada no IPC de gravação; uma operação que começou autorizada pode chegar ao final já restrita, sem o contrato de preservação da tarefa. `busy` bloqueia grande parte da interface, mas não fornece cancelamento.

**Ajuste:** conectar tarefas ao SDK e a workers/processos apropriados, com progresso, cancelamento e commit seguro. **Aceite:** expiração de licença durante o processamento respeita a janela já autorizada, novas tarefas ficam bloqueadas e cancelamento não gera arquivos incompletos nem substitui originais. Exercitar expiração durante a tarefa, não apenas no editor ocioso.

Evidência: main e `src/renderer/src/lib/{actions,compress}.ts`; contrato em `docs/desenvolvimento-edi.md`.

### C15 Salvar não detecta alteração externa do arquivo — P1, C

As fontes permanecem em memória e a gravação substitui atomicamente o destino, sem comparar versão/hash/estado em disco. Atomicidade protege contra arquivo truncado; não protege contra sobrescrever uma mudança feita depois da abertura.

**Ajuste:** detectar conflito e oferecer comparar, recarregar ou salvar cópia. **Aceite:** mudanças por outro aplicativo, sincronização ou outra aba com destino coincidente não desaparecem sem decisão explícita.

Evidência: `src/renderer/src/lib/actions.ts:287`; `src/main/files.ts:6`.

### C16 Limitações e falhas precisam de mensagens corretas — P2, C

Falhas de escrita em compactação podem ser apresentadas como “Não foi possível ler o arquivo”; falha de renderização pode ficar só no console, e a busca transforma erro de página em resultado vazio. JSON inválido de recentes/assinaturas é tratado como lista vazia. O README ainda orienta `npm install` apesar do monorepo pnpm.

**Ajuste:** erros por etapa com recuperação útil, distinção entre “nenhum resultado” e “página não processada”, preservação de JSON corrompido para recuperação e documentação alinhada aos comandos reais. Validar payloads próprios de recentes, assinaturas e impressão além das proteções de origem/capabilities já existentes no SDK. **Aceite:** falhas não se apresentam como sucesso ou ausência de conteúdo; diagnóstico técnico não expõe o documento.

## 2 Funcionalidades existentes que precisam de melhorias

| ID / prioridade | Funcionalidade | Melhoria e resultado desejado |
| --- | --- | --- |
| M01 / P1 | Fluxos principais | Organizar a entrada por tarefas: ler/revisar, editar, organizar, preencher/assinar e preparar para envio. Mostrar ações próximas à seleção e reduzir alternâncias entre barra, lateral e diálogo. Medir conclusão sem ajuda e erros de operação. |
| M02 / P2 | Descoberta e atalhos | Paleta pesquisável de comandos com termos do usuário, rótulos acessíveis, estados selecionados anunciados e ajuda curta contextual. Em 1100 px a barra coube ao esconder rótulos; preservar descoberta das ferramentas nessa apresentação. |
| M03 / P1 | Leitura e navegação | Preservar página, posição e zoom ao alternar abas/Home; modo leitura, página única e duas páginas, navegação voltar/avançar e atalhos consistentes. O `Viewer key={doc.id}` remonta o visualizador e não persiste scrollTop. |
| M04 / P1 | Busca | Geometria por glifo em vez da aproximação `largura/quantidade de caracteres`; frases entre linhas, texto girado, colunas, palavras inteiras e opções de acentos/caixa. Informar páginas com falha de indexação. |
| M05 / P1 | Texto e seleção | Quebra automática, caixas ajustáveis, alinhamento, listas e parágrafos; fontes consistentes entre prévia/saída, colar preservando texto e revisão ortográfica opcional. Não confundir essas melhorias com edição estrutural I01. |
| M06 / P2 | Anotações | Seleção múltipla, copiar/colar, duplicar, alinhamento, agrupamento, ordem e bloqueio; comentários filtráveis por página/tipo/autor. Histórico deve agrupar gesto ou edição de campo em uma ação compreensível. |
| M07 / P1 | Formulários | Navegação por Tab, campos obrigatórios, limites, máscaras e listas com rótulo/valor separados. Preservar múltiplas seleções e propriedades suportadas. Hoje `FormValue` é apenas `string | boolean`, e escolhas usam o primeiro valor. Tratar XFA explicitamente como capacidade a homologar. |
| M08 / P2 | Organizar/juntar/dividir | Entrada de intervalos como `1-3, 7, 10-12`, pares/ímpares, inverter seleção/ordem, inserir somente páginas escolhidas e dividir por intervalos/marcadores/tamanho. Prévia do resultado e contagem antes de gravar. |
| M09 / P1 | Compactação | Meta “até 5 MB”, comparação de qualidade, estimativa e explicação de imagens que não puderam ser tratadas. Calcular resolução pela dimensão real de uso da imagem; hoje o limite deriva sempre do lado longo A4. Preservar perfis de cor ou convertê-los corretamente. |
| M10 / P1 | Desempenho | Carregamento progressivo, limites de canvas/pixels, caches com orçamento e trabalho pesado fora da thread da interface. O canvas fora da visão já é liberado, mas há elementos por página, carregamento inicial de proxies por `Promise.all` e geração pdf-lib no renderer. Medir antes de prometer velocidade. |
| M11 / P1 | Processamento em lote | Fila com progresso por arquivo/etapa, cancelamento, retomada/repetição dos que falharam, relatório final e destino consistente. Evitar acumular todas as páginas/imagens/partes em memória antes de escrever. |
| M12 / P1 | Impressão | Preferir saída vetorial, prévia, intervalos, escala real, ajuste, frente e verso, livreto e tamanho misto. Hoje todas as páginas são rasterizadas em JPEG a 200 dpi e acumuladas antes do diálogo. Qualidade, memória e funcionalidades da impressora precisam de homologação real. |
| M13 / P2 | Marca d'água/numeração | Intervalos, exceção para capa, margens, cabeçalho/rodapé e rótulos de página distintos do índice físico. Mostrar prévia por página antes de aplicar. |
| M14 / P2 | Acessibilidade da interface | Teclado completo nos menus e ações de organização, nomes de inputs/botões sem depender só de tooltip, `aria-pressed`/`checked` adequados, anúncio de progresso/erros, contraste de texto auxiliar e redução de movimento. Há foco visível e diálogos nativos; preservar essas bases. |
| M15 / P2 | Assinatura gráfica | Preservação de traços, ajuste de recorte/rotação/limpeza de fundo, iniciais/data e colocação direta onde o usuário clicar. Oferecer salvar para reutilizar como escolha explícita, gerenciar/excluir e explicar que se trata de aparência gráfica. |
| M16 / P2 | Preferências e recentes | Temas claro/escuro/sistema, tamanho de interface, atalhos, painéis redimensionáveis, busca/fixação/limpeza de recentes e restauração de sessão. Miniaturas de documentos sensíveis e imagens de assinatura devem ter controles locais de retenção. |

## 3 Funcionalidades que precisam ser implementadas

| ID / prioridade | Funcionalidade ausente | Escopo mínimo útil e critério de conclusão |
| --- | --- | --- |
| I01 / P1 | Edição real de texto e objetos | Alterar/remover conteúdo original, parágrafos, fontes e imagens; preservar o restante do layout e eliminar o texto substituído. Recortar, substituir, mover e girar imagens existentes. Matriz de casos suportados e limite explícito para PDFs complexos. |
| I02 / P1 | OCR e preparação de digitalização | Português e idiomas homologados; detectar documento sem texto, corrigir inclinação/orientação e gerar camada pesquisável alinhada. Revisão de reconhecimento incerto e lote. Não depender de IA paga para o OCR básico. |
| I03 / P1 | Redação segura e sanitização | Marcar/aplicar remoção definitiva por área ou busca; eliminar conteúdo sob a região e revisar metadados, anexos, comentários e conteúdo oculto. Mostrar o que será removido e salvar resultado separado. Validar por extração e inspeção estrutural. |
| I04 / P1 | Criptografia e permissões PDF | Abrir/salvar com senha autorizada, aplicar/trocar/remover senha e preservar texto/estrutura; apresentar restrições e compatibilidade. Não prometer que permissões de PDF tornam impossível copiar conteúdo. |
| I05 / P1 | Detectar e validar assinaturas digitais existentes | Painel com assinante, integridade, certificado, validade e resultado de validação; aviso antes de operação que invalide assinatura. Preservar revisões quando o formato/operação permitir. Não confundir aparência com verificação criptográfica. |
| I06 / P2 | Assinar com certificado | Assinatura PDF criptográfica com certificado local, múltiplas assinaturas e carimbo do tempo. Homologar separadamente PFX/A1, token/A3 e eventuais perfis brasileiros; não declarar validade jurídica universal. |
| I07 / P1 | Recuperação após falha e versões | Salvamento automático de trabalho em formato versionado, cópia de recuperação, recuperação após encerramento abrupto e fonte ausente. Originais referenciados precisam continuar disponíveis ou estar incorporados em snapshot seguro. Histórico de sessão e retenção limitada. |
| I08 / P1 | Conversões de documentos | PDF para DOCX e extração de tabelas para XLSX/CSV; criação de PDF a partir de Office com fidelidade declarada. Começar por casos de maior uso e informar limitações. TXT e imagens não substituem conversão editável. Avaliar distribuição/licenças dos motores antes de escolher implementação. |
| I09 / P1 | Comparar versões | Diferenças de texto e aparência, inclusive páginas reordenadas e digitalizações com OCR; navegação por alteração e relatório exportável. IA pode explicar diferenças, mas a comparação básica deve ser determinística. |
| I10 / P2 | Criar/editar formulários | Campo de texto, checkbox, radio, lista, assinatura, validação, tabulação e exportação/importação de dados; detecção assistida de campos em formulários estáticos, com revisão humana. |
| I11 / P1 | Marcadores, links e anexos | Ler/navegar/editar sumário e hyperlinks, destinos internos e anexos. Hoje o visualizador customizado não monta uma camada interativa de links; a fixture abriu com zero links clicáveis. A abertura externa deve manter as regras HTTP/HTTPS e ação explícita. |
| I12 / P2 | Cortar, redimensionar e substituir páginas | CropBox/MediaBox, margens, medidas/papel personalizados, substituição preservando referências quando possível. Distinguir ocultar por recorte de remover conteúdo: recorte visual não é redação segura. |
| I13 / P2 | Acessibilidade documental | Ler/preservar tags e ordem de leitura; definir idioma, títulos, descrições alternativas e campos acessíveis; verificar e corrigir casos suportados. Testar com leitor de tela. Um verificador sozinho não certifica conformidade. |
| I14 / P2 | PDF/A e validação técnica | Exportação de perfis suportados e relatório de conformidade; detectar fontes ausentes, páginas problemáticas e estruturas inválidas. Preservação de PDF/X, perfis de cor e preflight gráfico entram depois conforme demanda. |
| I15 / P2 | Digitalização por scanner | Integração com scanners homologados no Windows, múltiplas páginas, limpeza, recorte, orientação e OCR. Não assumir que importar PNG/JPG cobre scanner ou imagem TIFF multipágina. |
| I16 / P1 | Automação por intenção | Comandos como “separe as páginas 2 a 5”, “junte estes arquivos nesta ordem” e “reduza para 5 MB”, com prévia, validação e desfazer. Regras determinísticas para executar; interpretação de linguagem pode ser opcional. |
| I17 / P2 | Assistente de leitura com evidências | Resumir, perguntar, traduzir trecho e explicar tabela com citações clicáveis de página/região; informar insuficiência de evidência. Índice baseado no documento efetivo, revisão das edições e conteúdo OCR. |
| I18 / P2 | Extração estruturada e conferência | Converter tabelas e extrair campos de documentos com origem por célula/campo, confiança e revisão. Conferir consistência de valores/datas e exportar dados. Não apresentar inferência como fato do documento. |
| I19 / P2 | Preparar arquivo para uma finalidade | Fluxos “enviar por e-mail”, “protocolar”, “arquivar” e “revisar”: combinar metadados, OCR, tamanho, organização e proteção como receita salva, com prévia e relatório. Requisitos de cada destino precisam ser configuráveis. |
| I20 / P3 | Revisão compartilhada e solicitação de assinatura | Comentários com respostas/status, convite, controle de versão e acompanhamento de assinatura. Planejar somente quando o uso justificar backend, retenção e consentimentos; não criar nuvem documental como dependência da edição local. |
| I21 / P3 | Recursos especializados | Medições, carimbos personalizados/Bates, camadas opcionais, portfólios, objetos complexos, multimídia e compatibilidade XFA avançada. Priorizar conforme corpus e público; registrar suporte/leitura/preservação separadamente. |

O Acrobat documenta [assinaturas digitais baseadas em certificado](https://helpx.adobe.com/acrobat/desktop/e-sign-documents/learn-about-signatures/digital-sign-overview.html), [acessibilidade](https://experienceleague.adobe.com/en/docs/document-cloud-learn/acrobat-learning/accessibility-tutorials/accessible-acrobat) e [assistente de IA](https://www.adobe.com/br/acrobat/generative-ai-pdf.html). Esses são sistemas distintos de inserir uma imagem de assinatura, exibir texto no canvas ou adicionar um chat genérico.

## 4 Arquitetura necessária para cumprir o objetivo

### Capacidade PDF antes de uma escolha de motor

O modelo atual (`DocContent`) representa referências de páginas e sobreposições, sem identidade de texto/imagem original, redação, estrutura de campos importados, revisões de assinatura ou tags. Adicionar botões não resolve essas lacunas.

PDF.js pode continuar como visualizador se cumprir os testes; pdf-lib pode continuar em operações adequadas. A [documentação do pdf-lib](https://github.com/Hopding/pdf-lib#limitations) informa a ausência de APIs para editar/remover texto de página, e a seção de criptografia informa que documentos criptografados não são suportados. Usar `ignoreEncryption` não descriptografa o arquivo. A combinação atual, sem ampliar o motor, não atende I01/I03/I04/I05.

Antes de trocar dependências, criar uma matriz de capacidades e um conjunto de PDFs sintéticos/redistribuíveis. Comparar motores por fidelidade, edição estrutural, redação, senha, assinaturas, OCR, manutenção, licença de distribuição e custo. Não há escolha de fornecedor aprovada nesta análise, nem necessidade de alterar Railway/banco para funções locais.

### Contrato de documento e operações

Separar identidade da origem, revisão de trabalho, conteúdo PDF e estado de visualização. Comandos devem ser validados, transacionais e agrupáveis, com resultados iguais para UI, automação e eventual MCP. Manter seleção, busca, miniaturas, histórico e recuperação associados à revisão correta. Snapshot de recuperação não deve depender só de caminhos que possam desaparecer.

Preservar o SDK para conta, licença, integridade e atualização. Main/preload controlam arquivos e capacidades; processamento pesado tem cancelamento e limites. Fazer commit atômico depois de validar a saída. Não mover banco, segredos ou providers para o renderer.

### IA útil e controlável

Não foi encontrada integração de IA no EdiPDF, nem rota dedicada de IA no portal Edi consultado. Os recursos I16–I18 exigem implementação de domínio, contratos e composição do backend, reutilizando infraestrutura compatível do repositório.

O caminho básico deve continuar local: ler, editar, organizar, OCR e buscar. Para IA remota, o usuário precisa ver qual conteúdo será enviado e o custo estimado; usar os contratos existentes de reserva/confirmação/liberação de créditos e preservar `runId`. Minimizar contexto, não registrar documentos em telemetria e tratar instruções dentro do PDF como conteúdo sem autorização para ações. Ferramentas operam por comandos validados com prévia; o modelo não recebe acesso genérico ao filesystem.

O diferencial deve ser a tarefa concluída com segurança: “extraia esta tabela mantendo a página de origem” ou “prepare este conjunto para envio”. Chat e resumo isolados já existem no concorrente. Sugestões de dados pessoais para redação devem ser revistas pelo usuário e aplicadas pelo motor determinístico.

## 5 Sequência recomendada e critérios de aceite

| Etapa | Entrega | Gate antes de avançar |
| --- | --- | --- |
| 0 Integridade | C01–C04, C07–C10, C13–C15; corrigir também os defeitos pequenos reproduzidos | Exclusão estrutural, recuperação com rascunho, fonte/cópia, roundtrip de formulários e prévia/saída sem perda silenciosa |
| 1 Motor e persistência | Prova de capacidade de I01/I03/I04/I05; I07; fechamento de C05/C06 | Corpus com texto real substituído, remoção segura, arquivos protegidos e assinados; decisão fundamentada de motor/distribuição |
| 2 Substituição cotidiana | OCR, imagens existentes, conversões prioritárias, comparação, navegação e fluxos M01–M08 | Trabalhos reais de usuários concluídos sem recorrer ao Acrobat nos casos homologados |
| 3 Eficiência | Compressão por meta, lote/cancelamento, impressão e I16/I19 | Benchmark reproduzível de tempo, memória, qualidade e passos contra baseline, com original preservado |
| 4 Inteligência | I17/I18 e assistência aos fluxos | Respostas rastreáveis ao documento, custo transparente, isolamento e confirmação de alterações; nenhum efeito autorizado apenas pelo texto do PDF |
| 5 Cobertura profissional | Certificados, formulários autorais, acessibilidade, arquivamento e colaboração conforme demanda | Matriz pública de suporte e homologação específica; sem prometer equivalência para sistemas ainda parciais |

As etapas podem ter entregas incrementais; segurança/integridade e contratos não devem ficar para depois. Assinatura gráfica e certificado, OCR e IA, leitura e preservação de formato precisam de critérios separados.

### Matriz mínima de verificação

1. PDFs com texto latino, Unicode, fontes embutidas/subset, colunas, ligaduras, texto girado, CropBox deslocado, páginas de tamanhos mistos e anotações sobrepostas.
2. Formulários com campos iguais em fontes diferentes, múltiplos widgets, listas com valor diferente do rótulo, listas multisseleção e campos somente leitura. Reabrir também em leitor independente.
3. Exclusão/extração/divisão com marcadores, links, anexos, tags e campos apontando para páginas removidas. Inspecionar objetos e extrair conteúdo; a contagem de páginas não basta.
4. PDFs protegidos, assinados, digitalizados, malformados e entradas muito grandes. Definir leitura, edição, preservação e erro por classe.
5. Falta de espaço, destino bloqueado, conflito externo, cancelamento, encerramento abrupto, fonte ausente, expiração durante diálogo/processamento e recuperação de rascunho em documento salvo.
6. Corpus de 10/100/1.000 páginas e tamanhos/complexidades definidos; medir abertura até primeira página utilizável, busca, scroll, salvamento, impressão, compactação, memória de pico e qualidade. São cenários propostos, não benchmarks executados.
7. Teclado, leitor de tela, escala do Windows, janela menor, alternância entre abas e preferência de movimento. Janelas modais e acesso da suíte devem continuar funcionando.

**Conclusão de produto:** primeiro tornar confiável o que o usuário já consegue fazer; depois cobrir edição real, OCR, proteção e conversão; em seguida integrar automação e IA aos trabalhos frequentes. O EdiPDF pode aproveitar a interface e a integração da suíte, mas precisa ampliar seu núcleo documental para sustentar a promessa de substituir o Acrobat.
