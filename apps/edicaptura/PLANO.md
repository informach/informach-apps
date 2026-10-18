# EdiCaptura — plano de implementação

## Diagnóstico posterior — 18/10/2026

Decisão posterior do titular: [Captura enxuto com vídeo rápido](../../docs/propostas/edi-suite-2026-10-16/edicaptura-lotes/foco-na-suite.md). Preservar entregas atuais; vídeo avançado pertence ao EdiAula, trabalho geral de PDF ao EdiPDF. Requisitos futuros conflitantes abaixo e no diagnóstico original foram substituídos; não contar recursos encaminhados como implementados.

A [análise de substituição do Snagit](../../docs/propostas/edi-suite-2026-10-16/analise-edicaptura-snagit.md) registra a base do diagnóstico. A implementação autorizada e seus gates atuais estão no [plano de execução](../../docs/superpowers/plans/2026-10-18-edicaptura-snagit.md) e no [registro de lotes](../../.compozy/tasks/edicaptura-snagit/_tasks.md); as etapas e limitações antigas abaixo são históricas. A [decisão de IA](../../docs/propostas/edi-suite-2026-10-16/edicaptura-lotes/decisao-ia-assinatura.md) limita a assistência remota à assinatura do usuário no Claude Code ou Codex, seguindo o EdiAula. Testes sintéticos e integração licenciada não homologam todas as combinações físicas.

## Objetivo
Aplicativo Electron para Windows baseado no protótipo edicaptura.pen: editor, seleção de região e barra flutuante de captura.

## Etapas
1. Base Electron: janela isolada, preload restrito, IPC validado e arquivos locais.
2. Captura: monitor sob o cursor, seleção por arraste, oito alças, tamanho em pixels, Enter/Esc, Print Screen.
3. Editor: importar PNG/JPEG/WebP, seta, texto, retângulo, destaque, caneta, passos, pixelização, recorte, mover/remover anotações, desfazer/refazer.
4. Persistência: biblioteca no diretório de dados do usuário, edição recuperável, copiar PNG, exportar PNG/JPEG e vídeo WebM.
5. Vídeo: região selecionada, sem áudio nesta versão, parada por janela de controle ou Ctrl+Shift+F10, limite de cinco minutos.
6. Rolagem assistida: capturar trechos após rolagem manual com Ctrl+Shift+PageDown, ajustar sobreposição em pixels, juntar em uma imagem; sem automação do scroll de outros aplicativos.
7. Verificação: testes de geometria/DPI e integração Electron; empacotamento portátil Windows.

## Organização
- src/main: ciclo de vida, janelas, segurança, persistência e IPC.
- src/capture: geometria testável, seleção e captura nativa.
- src/editor: interface, canvas, histórico e biblioteca.
- src/recording: gravação e controles de vídeo/rolagem.
- src/shared: estilos e ícones usados pelas janelas.

## Critérios de aceite
- A seleção recorta a imagem real, respeitando o DPI do monitor.
- Cancelar restaura o editor e encerra a sessão de captura.
- Exportar e copiar incluem as anotações visíveis.
- A biblioteca persiste entre execuções e mantém o projeto editável.
- Vídeo e rolagem têm controles explícitos de encerramento e erros visíveis.
- Nenhuma página remota é carregada; o renderer não tem acesso direto ao Node.js.

## Limites da primeira versão
Windows é a plataforma alvo. A região fica restrita a um monitor por captura. Vídeo é WebM sem áudio, com até cinco minutos por gravação. Rolagem é assistida, com união vertical e ajuste manual da sobreposição. Não há OCR, captura automática de janelas longas nem efeitos de IA.

## Estado da validação — 16/10/2026
- Implementadas as etapas 1 a 6 e os scripts de empacotamento.
- Nove testes Node de geometria, DPI, persistência, concorrência e validação de caminhos passaram.
- Treze verificações do canvas passaram no navegador: anotações, passos, coordenadas com zoom, recorte, exportação, seleção, exclusão e histórico.
- A interface foi renderizada e revisada no navegador integrado.
- O teste E2E nativo está escrito em `tests/smoke.cjs`, mas NÃO passou neste ambiente: os processos gráficos do Electron encerram com erro de DLL/permissões da sandbox do ambiente. Nenhuma opção `--no-sandbox` foi usada. É necessário executá-lo em uma sessão Windows normal para validar captura real, seleção por DPI, vídeo e rolagem nativos.
- Electron fixado em 42.0.1. O runtime local veio do cache disponível, pois o acesso ao registro npm foi bloqueado. Em outra máquina, use `npm.cmd install`.

## Atualização 0.2.0 — monitor e moldura
- Seletor de monitor com nome, resolução e indicação da tela principal; escolha persistida e aplicada aos atalhos.
- Quatro janelas estreitas formam uma moldura laranja permanente, sem foco e com passagem dos cliques. São excluídas da captura pelo Windows 10 2004+.
- Bordas posicionadas fora da seleção quando possível e dentro dos limites ao capturar o monitor inteiro.
- Controles posicionados fora da região ou no segundo monitor, mostrando o monitor e a resolução da captura.
- Tratamento de desconexão, mudança de resolução, escala e rotação durante a captura.
- Testes adicionados para coordenadas negativas, DPI fracionário, escolha explícita, posição dos controles e ciclo de vida das quatro janelas. Validação física com dois monitores permanece necessária.

## Correções 0.2.1 — moldura, rolagem e vídeo
- Moldura azul de 1 DIP (a espessura física acompanha a escala do monitor), inclusive na seleção de vídeo.
- Permissão de vídeo aceita a solicitação legada media com tipos vazios do Electron 42 e display-capture, limitada ao controlador local durante a gravação solicitada. Câmera e microfone continuam negados.
- Rolagem vertical: captura automática de trechos estáveis, detecção de sobreposição por trecho e união no processo principal antes de encerrar a sessão. Duplicatas são ignoradas; conteúdo sem alinhamento seguro exige voltar um pouco.
- Erro de salvamento preserva os trechos para tentar novamente. A finalização aguarda capturas pendentes.
- 29 testes Node passaram. Teste E2E nativo ainda bloqueado por Target crashed na inicialização do renderer; não validado fisicamente.

## Correções 0.2.2 — linha física e confirmação da foto
- Janelas da moldura transparentes, com uma linha desenhada em canvas de um pixel físico; tamanho da janela deixa de definir a espessura visível.
- Captura automática tolera pequenas mudanças de renderização. Foto manual deixa de ser bloqueada pela falta de alinhamento; preserva o trecho e informa possível repetição.
- Clique de câmera local e confirmação visual a cada novo trecho, sem som para duplicatas ou falhas.
- 36 testes passaram. E2E nativo ainda encerra com Target crashed; sem confirmação física neste ambiente.
