# Junção local de arquivos — lote 4

18/10/2026. Perfil inicial implementado e revisado, com testes, tipos, build e jornada Electron ampliada aprovados. Não equivale à aprovação final do lote inteiro.

“Juntar PDFs” seleciona arquivos pelo diálogo nativo, permite adicionar, remover e reordenar PDFs/PNG/JPEG e preparar um PDF com compactação opcional. A seleção corresponde aos arquivos de disco; alterações ainda não salvas em abas abertas não entram nessa operação. “Abrir origens para editar” conserva o caminho de importação integral, inclusive o pedido de senha quando necessário.

A preparação recebe autorização e reserva de entrada antes de iniciar o worker. Junção e compactação compartilham a mesma etapa de CPU da fila local. Interromper encerra o worker e conserva as origens; antes de haver resultado completo, a junção precisa ser reiniciada. Segundo plano permite continuar usando o editor. O resultado completo é protegido, oferecido para revisão paginada e retomável em Tarefas. Abrir o resultado cria uma nova aba sem substituir documentos abertos; salvar escolhe um novo destino pelo diálogo nativo.

Limites: cem arquivos, 512 MB somados de entrada, mil páginas e 64 MB de resultado. Uma seleção adicional que ultrapasse o orçamento é recusada inteira, com mensagem; não há omissão silenciosa de arquivos. Arquivos criptografados precisam ser abertos com a senha e preparados como cópias editáveis antes da junção direta. Este worker não ignora criptografia nem permissões.

Formulários de origens diferentes recebem espaços de nomes para evitar colisões. A reconciliação usa a árvore efetiva de páginas e descarta objetos inacessíveis. Duas regressões conferem campos de mesmo nome em duas origens, ausência de objetos de páginas removidas, contagens de árvore inválidas e orçamento de páginas recusado antes da cópia. A compactação conserva os limites e avisos de qualidade do perfil já documentado; não garante uma redução mínima.

Marco da integração: 215 testes do app, tipos e build aprovados. A jornada integrada completa passou: seleção duplicada da origem, compactação equilibrada, prévia da primeira/última página, fechamento/retomada, abertura em nova aba e salvamento com leitura dos campos e páginas da cópia. Os quatro lados/páginas e os dois nomes de campos independentes foram conferidos; bytes da origem permaneceram idênticos. [Prévia real da última página](lote4-merge-review.png). Reinício e gates também passaram; build normal restaurado antes da próxima extensão de impressão.
