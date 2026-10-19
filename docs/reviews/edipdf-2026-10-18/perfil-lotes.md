# Divisão e exportação de páginas — lote 4

18/10/2026. Perfil inicial com jornada Electron aprovada; os limites abaixo e demais complementos permanecem explícitos. O [review intermediário](review-lote-4-parcial.md) registra os gates e as correções.

## Fluxo implementado

Complemento vigente: divisão por nível de marcadores e tamanho real máximo passou pela jornada integrada; planos resolvidos são protegidos na retomada. [Review do complemento](review-senhas-escolhas-divisao.md). A frase de pendência no registro inicial de intervalos abaixo pertence ao marco anterior.

“Dividir documento” prepara PDFs com uma quantidade de páginas por arquivo. “Exportar páginas como imagens” prepara PNG/JPEG das páginas selecionadas, atual ou todas. A revisão atual é capturada antes do processamento; a tarefa recebe autorização do SDK antes de compor o PDF em worker. As fontes abertas são clonadas, sem transferir/desanexar seus buffers.

Complemento revisado: divisão por intervalos explícitos, separados por ponto e vírgula, por exemplo `1-3; 7, 5; 10-8`. A ordem interna informada é preservada; páginas omitidas ficam fora das partes. O manifesto registra cada página da origem na ordem efetiva. Teste confere ordem descendente, campos vinculados à página correta e ausência dos campos de páginas omitidas, além de recusa de índices inválidos/repetidos dentro de uma parte antes do checkpoint. Tipos, build, teste e jornada nativa completa desse seletor aprovados. Divisão por marcadores/tamanho continua pendente.

O processamento permite interrupção e segundo plano. Cada arquivo completo é protegido antes de gerar o seguinte. A retomada usa o PDF capturado e os arquivos já protegidos; não relê uma origem possivelmente modificada nem refaz arquivos concluídos. Checkpoints posteriores atualizam pacote/manifesto sem enviar novamente todo o PDF de origem ao main.

A interface oferece a lista dos arquivos completos e a prévia do arquivo escolhido. Para imagens, mostra o PNG/JPEG produzido, incluindo a qualidade do JPEG; para divisão, mostra as páginas do PDF da parte. Arquivos incompletos não são oferecidos para exportação como lote concluído. O salvamento exige revisão explícita e escolhe a pasta pelo diálogo nativo. Fechar/interromper conserva checkpoints; descartar apaga o resultado protegido, preservando fontes e cópias exportadas.

## Gravação e integridade

O estado protegido usa pacote ZIP limitado e manifesto com configurações, páginas, ordem, tamanhos e SHA-256. Não é extraído diretamente no filesystem. Nomes aceitos são gerados pelo app: `parte-001.pdf`, `pagina-0001.png`/`.jpg` e `manifest.json`; entradas extras, caminhos ou hashes incompatíveis são recusados.

Depois da revisão e da escolha de destino, os arquivos são gravados/sincronizados em uma subpasta temporária da pasta escolhida. Uma função nativa fixa publica o diretório com nome exclusivo. Uma pasta anterior nunca é substituída. A cópia pública não aparece sob o nome final enquanto o conjunto não estiver completo. Essa pasta temporária de saída contém arquivos em claro autorizados para exportação; não equivale ao armazenamento protegido das tarefas. Cancelamento antes do commit limpa apenas arquivos conhecidos criados pela chamada; erro de limpeza é reportado, sem ocultar a falha principal ou remover arquivos inesperados.

Windows usa `MoveFileExW`, Linux usa `renameat2` com exclusividade. O teste de diretórios foi executado neste Windows; Linux não foi homologado em runtime. Outros sistemas recebem erro explícito. A tarefa continua sob o prazo/checagens do SDK; o fluxo não cria um canal de escrita sem licença.

## Fidelidade e limites

Divisão conserva anotações nativas, valores de formulários nas páginas correspondentes, metadados e anexos globais. A interface avisa sobre os dados globais antes de compartilhar. Rótulos personalizados de página são reiniciados por parte com aviso; números impressos no conteúdo permanecem. Referências a páginas excluídas e estruturas de campos/tags são reconciliadas antes de descartar objetos inacessíveis.

O teste de retomada reproduziu um cache obsoleto de `getPages()` em pdf-lib 1.17.1 depois de `removePage()`. A limpeza agora percorre a árvore efetiva, com limites, detecção de ciclos e conferência de contagens. Não modifica internamente a biblioteca. O teste confere que um campo da primeira página não permanece na segunda parte e que cada arquivo contém somente sua página efetiva.

Imagens usam a aparência atual, inclusive anotações/campos, CropBox, giro e unidade física. Texto pesquisável, campos e links viram pixels. PNG conserva pixels sem perdas; JPEG usa qualidade 0,92. O DPI escolhido entra nos metadados pHYs/JFIF, além de definir as dimensões em pixels. PNG/JPEG passam por decodificação independente de pixels nos testes de densidade.

Limites: revisão PDF até 64 MB/mil páginas, até cem arquivos, 32 MB por arquivo, pacote de saída até 64 MB e conteúdo expandido até 128 MB. A reserva da composição conta fontes, fontes tipográficas e metadados, até 512 MB. Imagens aceitam 72/150/300 dpi, 8192 pixels por lado, 24 megapixels por página e 512 megapixels no lote. Entrada com restrição de leitura ainda exige o caminho de permissões apropriado; este perfil usa a composição editável já autorizada, sem ignorar senhas.

## Verificação atual

Tipos, build, testes e jornada Electron ampliada completa aprovados. O fluxo real gerou/revisou/retomou duas partes, gravou pastas exclusivas e exportou PNG/JPEG das duas páginas. Formulários permaneceram somente na parte correspondente. Pillow abriu os quatro arquivos reais, confirmou 600×800/72 dpi e diferença média PNG/JPEG menor que 0,3/255. Os testes também cobrem integridade do pacote, fonte imutável, retomada do restante, checkpoint sem retrocesso, lote parcial impedido de salvar e cancelamento antes do commit. As rodadas anteriores localizaram nome interno sem extensão e rótulo acessível incompleto; a repetição após correção passou. Detalhes/capturas no review intermediário. A legenda da imagem e a posição da confirmação receberam ajuste posterior de review, a incluir na próxima jornada integrada.

Rodada ampliada posterior aprovada: interrupção real após oito arquivos protegidos de uma origem de cem páginas, retomada dos 92 restantes, conferência de prefixo idêntico e publicação da pasta completa com 101 arquivos, incluindo manifesto. Salvar permaneceu indisponível enquanto o lote estava parcial. A legenda e a confirmação no rodapé também foram exercitadas. [Revisão retomada](lote4-batch-resume.png). A jornada inteira, incluindo junção, conversões, reinício e gates, passou.

Comandos: `pnpm --filter @informach/edipdf test`, `pnpm --filter @informach/edipdf typecheck`, `pnpm --filter @informach/edipdf build` e `pnpm edi:test:native edipdf`. Os testes de imagens usam o decoder nativo independente disponível com PDF.js; não há serviço externo nem dependência Python no app.
