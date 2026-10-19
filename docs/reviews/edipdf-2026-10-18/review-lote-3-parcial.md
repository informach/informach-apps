# Review intermediário do lote 3 do EdiPDF

18/10/2026. Leitura, busca, perfil local, estrutura documental, anotações e formulários. O lote continua em implementação; este registro verifica o núcleo já executado e mantém os complementos obrigatórios visíveis. Não é full review nem aprovação dos lotes 4 e 5.

## Implementado e verificado

- Busca sobre a revisão efetiva: glyph boxes nativos, Unicode/acentos, frases entre linhas, palavra inteira, comentários e valores atuais dos formulários. Erros parciais e progresso por página são mostrados; substituir uma busca cancela seu worker.
- Visualização contínua, página única e páginas duplas; navegação de ida/volta, posição por aba e retorno da tela inicial. A geometria usa busca binária das linhas visíveis. Miniaturas incluem a revisão salva em memória, em vez de reutilizar a origem sem as alterações.
- Paleta de ações por teclado, menus com setas/Home/End/busca por letra, intervalos/paridade/inversão de páginas e alternativas de menu para movimentos. Atalhos usuais continuam funcionando dentro dos campos.
- Preferências locais validadas, tema claro/escuro/sistema, texto maior, largura dos painéis e letras de ferramentas. Recentes têm busca, fixação, controle de miniaturas e limpeza. Assinaturas gráficas são guardadas apenas por opção e protegidas pelo Windows; a migração verifica a cópia protegida antes de remover o arquivo antigo.
- Recuperação atual e versões incorporam as fontes utilizadas e os caminhos de origem. Versões têm contagem, prazo, intervalo e cota próprios; cópias ilegíveis são preservadas e contabilizadas. Restaurar uma versão cria outra aba. Redação não apaga originais, desfazer ou versões antigas: isso é comunicado na interface de retenção.
- Restauração de sessão é opcional e guarda caminhos e posição, sem senhas. Um reinício real restaurou a sessão, a última recuperação com formulário e a proteção de caminho original, inclusive depois de reabrir a cópia incorporada.
- Marcadores hierárquicos podem ser criados, renomeados, redirecionados e removidos por ramo. Links internos/web podem ser criados e removidos; a página tem camada interativa de links. Endereços externos aceitam HTTP/HTTPS sem credenciais e pedem ação explícita. Anexos podem ser adicionados, extraídos e removidos; nenhum conteúdo é executado.
- Autoria AcroForm de texto, checkbox, radio e listas, rótulos acessíveis, flags obrigatórios/leitura, limites, várias linhas, alinhamento e seleção múltipla. Máscaras locais não inserem JavaScript. Dados podem ser importados/exportados em JSON/CSV com validação de campos e tipos. Sugestões reconhecem linhas com sublinhados em texto selecionável e exigem revisão.
- Anotações têm seleção múltipla, duplicação, cópia/colagem interna, agrupamento, alinhamento, ordem e bloqueio. Autor/estado de comentários são persistidos, com filtros e relatório JSON. Bloqueio não é criptografia. Digitação de um campo ou comentário usa um grupo de desfazer por sessão de foco.
- Prévia tem orçamento de pixels; exportação excedente falha explicitamente em vez de diminuir a resolução sem aviso. Leituras de metadados de páginas têm concorrência limitada. Erros de renderização/seleção são exibidos, com repetição da leitura da página.

## Correções encontradas durante o review

1. O carregador e os destaques antigos não consideravam o texto efetivo de anotações e formulários. O índice agora deriva da revisão completa e usa caixas de caracteres reais, incluindo páginas giradas.
2. A limpeza passiva da posição de leitura capturava um elemento desmontado ou já limitado pela nova altura. A posição é capturada no ciclo de layout, e o pedido de navegação é consumido. PageUp em página única também redefine a rolagem.
3. Ctrl+F dentro de campos ficava preso no editor local. Os controles propagam os comandos de documento e conservam as teclas de digitação.
4. Rótulos `/TU` apenas no campo pai não apareciam em todos os widgets do PDF.js. O loader lê o rótulo do campo e a autoria também o grava nos widgets.
5. A paleta exigia pontuação exata. Agora normaliza acentos/pontuação e exige todas as palavras da consulta, sem exigir uma frase idêntica.
6. Dados locais inválidos não podem virar listas vazias silenciosamente. Reparo é explícito e preserva backup; operações normais recusam corrupção. Assinaturas passam por migração verificada e proteção local.
7. Recuperação após reinício precisava proteger caminhos de origem, e não somente os arquivos abertos no processo atual. Os caminhos são incorporados ao DTO protegido e registrados no main ao recuperar.
8. Gravação da recuperação atual e gravação de versões têm resultados distintos. Uma falha do histórico não declara perda da recuperação já gravada. O fechamento interrompe e drena autosave antes de excluir uma recuperação descartada.
9. O SDK precisava aceitar saídas documentais e aplicar a barreira de recuperação também a `file:write-copy`. A política continua exigindo destino selecionado, recusando executáveis/scripts e impedindo exportações durante recuperação de licença.

## Evidências até este registro

- **63 testes do EdiPDF** aprovados, tipos e build normal aprovados. Novos testes verificam geometria de busca, limites de renderização, layouts grandes, comandos atômicos, marcadores/links/anexos, AcroForm/Unicode/múltipla seleção, formatos de dados, corrupção/migração e retenção.
- **52 testes do SDK** e typecheck aprovados, incluindo capacidades de saídas documentais e restrição de recuperação. Mudanças concorrentes do SDK foram preservadas; isso não substitui a verificação final dos consumidores.
- Jornada em Electron: busca em anotação/campo, glyph highlights, miniatura atual, abas/Home, layouts, comandos, autoria de campo, máscara CEP, marcadores/links, bloqueio de anotações, tema e preferências. Licença offline assinada, expiração e negação de IPC continuam ativas.
- Reinício do processo: sessão reaberta na página 2; recuperação incorporada com `12345-678`; tentativa de gravar cópia sobre o original recusada; original comparado byte a byte; bytes das versões não continham o texto conhecido da fixture.
- Biome focado sem erros, sem supressões. Avisos legados continuam visíveis; a limpeza final de código faz parte da conclusão do lote. Build normal restaurado depois do teste com chaves efêmeras.
- Um runner terminou abruptamente com código Windows `3221226505` antes da jornada. O processo de fixture remanescente foi identificado e encerrado; repetição completou a jornada. Não atribuir essa ocorrência ao código do editor sem diagnóstico reproduzível. A verificação de bytes cifrados também precisou sair do callback VM do Playwright para o host do teste, que possui acesso ao perfil isolado.

## Antes de concluir o lote

Completar edição de destinos/ordem de marcadores, geometria/tabulação de campos e os complementos de assinatura gráfica; consolidar o harness reproduzível do app, revisar contraste/foco/leitor de tela e executar novamente os gates afetados. Há diferenças entre preenchimento HTML e appearances de fontes externas que ainda precisam de corpus. XFA dinâmico e unidades de página não padrão exigem matriz explícita de leitura/preservação, sem declarar edição homologada.

Os complementos do lote 2 permanecem: parágrafos/caixas/fontes personalizadas, grupos internos, recorte de imagens, redação por busca e corpus. OCR, conversão Office, comparação, acessibilidade documental/PDF/A, automação e demais recursos seguem obrigatórios nos próximos lotes. Sem commit, push, deploy, instalador ou publicação.
