# EdiPDF

Editor de PDF para o dia a dia: organizar, anotar, preencher, assinar e salvar. O essencial do Acrobat.
O design de referência está em `edipdf.pen`.

## Rodar

```bash
npm install
npm run dev        # abre o app em modo de desenvolvimento
```

**Sem terminal:** `npm run shortcut` compila o app, cria o atalho **EdiPDF** na Área de Trabalho e no Menu Iniciar
e adiciona o EdiPDF em **Abrir com** para arquivos `.pdf` (só para o seu usuário, sem trocar o aplicativo padrão).
Para abrir PDFs com dois cliques: botão direito num PDF › Abrir com › Escolher outro aplicativo › EdiPDF › Sempre.
Depois de mudar o código, rode `npm run build` (ou `npm run shortcut` de novo).

| Comando | O que faz |
|---|---|
| `npm test` | Testes do gerador de PDF (ordem, rotação, mesclagem, anotações, formulários, compactação) |
| `npm run typecheck` | Verificação de tipos |
| `npm run build` | Build de produção em `out/` |

## O que faz

**Abrir e ver**
- Abas para vários documentos; abrir por botão, Ctrl+O, arrastar para a janela ou "Abrir com" do Windows
- Recentes com miniatura na tela inicial
- Rolagem contínua, zoom (Ctrl+roda, Ctrl+= / Ctrl+-, ajustar à largura / página inteira), ferramenta Mão
- Busca no documento (Ctrl+F) com todas as ocorrências marcadas
- Seleção e cópia de texto
- PDFs com senha

**Organizar páginas** (painel lateral ou a visão Organizar)
- Arrastar para reordenar, Ctrl/Shift+clique para selecionar várias
- Girar, excluir, duplicar, inserir página em branco, inserir páginas de outro PDF ou imagem (inclusive arrastando do Explorer)
- Extrair páginas para um novo documento, dividir a cada N páginas, exportar páginas como PNG/JPG
- **Juntar PDFs**: vários PDFs e imagens em um só, na ordem escolhida; "Juntar e salvar" grava direto (com compactação opcional) e "Abrir para revisar" abre o resultado para editar antes
- Criar PDF a partir de fotos

**Compactar**
- **Compactar PDF** na tela inicial (um ou vários arquivos; cada cópia é salva ao lado do original como "nome (compactado).pdf") ou no painel do documento aberto (salva uma cópia com as edições)
- Três níveis: Leve (imagens até 200 dpi), Equilibrada (150 dpi, recomendada) e Forte (100 dpi)
- Reduz e recodifica as imagens em JPEG e remove objetos que não são usados; texto, links e formulários não mudam. O resultado nunca fica maior que o original
- Salvar normalmente também já descarta o conteúdo de páginas excluídas

**Editar e anotar**
- Texto novo (fonte, tamanho, cor, negrito, itálico)
- **Editar texto** do próprio PDF: clique numa linha, o original é coberto (com a cor de fundo detectada) e você digita a nova versão, na mesma fonte, tamanho e cor
- Realçar, sublinhar e tachar texto selecionado
- Desenho à mão livre, retângulo, elipse, linha e seta
- Comentários (viram notas de verdade no PDF, visíveis no Acrobat e no navegador)
- Imagens e **assinaturas** (desenhar, digitar ou foto com fundo removido; ficam salvas para reusar)
- Cobrir: retângulo branco para esconder conteúdo
- Marca d'água e numeração de páginas
- Preencher formulários (texto, caixas, opções, listas)
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

- Anotações são gravadas no conteúdo da página ao salvar (comentários continuam notas). Ao reabrir, elas não são mais editáveis como objetos separados.
- "Editar texto" substitui uma linha inteira por texto novo nas fontes padrão (Helvetica, Times, Courier); fontes especiais do arquivo são aproximadas.
- PDFs protegidos por senha abrem normalmente, mas só podem ser salvos como cópia com as páginas em imagem (sem a proteção).
- Não aplica senha nem faz OCR.
- A compactação não mexe em imagens CMYK, com paleta, JPEG 2000 ou JBIG2 (comuns em digitalizações em preto e branco), nem em fontes embutidas.

## Como funciona

- `src/shared/model.ts`: o documento editável (lista de páginas que apontam para os PDFs de origem + anotações em coordenadas da página).
- `src/shared/build.ts`: monta o PDF final com pdf-lib ao salvar e junta arquivos.
- `src/shared/compress.ts`: compactação (extrai imagens, limpa objetos órfãos); a recodificação JPEG usa o canvas do app.
- `src/renderer/src/lib/pdf.ts`: renderização com pdf.js (páginas, miniaturas, camada de texto, campos de formulário).
- `src/renderer/src/viewer/`: visualizador, interações de anotação, miniaturas e Organizar.
- `src/main/index.ts`: janela, arquivos, recentes, assinaturas salvas, impressão.

Verificação automática da interface: `EDIPDF_SNAPSHOT=saida.png EDIPDF_SNAPSHOT_JS=script.js npm run dev -- arquivo.pdf`
roda o script na janela (em dev há `window.__edipdf` com store e ações), salva um print e fecha.
