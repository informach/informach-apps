# Execução nativa e roteiro de homologação

Em 16/10/2026, a ferramenta de automação do Browser falhou antes do bootstrap: `codex/sandbox-state-meta: missing field sandboxPolicy`. A captura somente leitura do pen.dev funcionou e mostrou 0.5.3. Nenhuma interação com o documento aberto do usuário foi feita.

Tentativa desktop 1: Start-Process falhou por chave de ambiente duplicada `Path`/`PATH`. Tentativa 2: invocação direta não produziu relatório nem código útil. Tentativa 3: System.Diagnostics.Process com UseShellExecute=false, CreateNoWindow=true e WindowStyle=Hidden conseguiu iniciar e observar a saída **-2147483645**, sem `smoke-result.json`. Não há evidência para atribuir esse código a uma causa específica. Não foram alteradas permissões, removidos sandboxes ou encerrados processos do usuário.

Comando alvo: `node_modules/electron/dist/electron.exe . --smoke-test`, após build, com `EDISVG_USER_DATA` apontando para `audits/etapa-01/desktop-profile` para não usar os dados normais. Os logs vazios dessa tentativa não comprovam sucesso. A suite smoke também precisa ser atualizada: a primeira verificação busca `.mascot`, incompatível com o início vazio atual.

## Roteiro pendente

Executar na versão 0.5.4 identificada no cabeçalho, usando cópias das fixtures e pasta temporária de homologação. Registrar versão, resolução, resultado e arquivo/captura por caso. Todos os casos abaixo estão **Não executados na janela nativa nesta auditoria**.

| ID | Procedimento | Resultado esperado |
| --- | --- | --- |
| N01 | Iniciar sem projeto anterior | Design vazio; nenhuma arte/sessão anterior restaurada silenciosamente |
| N02 | Abrir 01-formas-v2.edisvg | Grupo e formas corretos, sem erros |
| N03 | Alterar X do retângulo, Ctrl+Z, Ctrl+Shift+Z | Apenas a alteração correspondente é desfeita/refeita |
| N04 | Salvar como uma cópia; fechar/reabrir | Geometria, nomes, visibilidade e transformações preservados |
| N05 | Modificar e Ctrl+S | Atualiza arquivo atual sem pedir novo nome |
| N06 | Salvar como e cancelar | Mantém caminho anterior e indicador pendente |
| N07 | Modificar; abrir outro; escolher Cancelar | Documento atual permanece intacto |
| N08 | Modificar; fechar; escolher Salvar e cancelar diálogo de destino | Janela continua aberta e documento pendente |
| N09 | Modificar; fechar; escolher Descartar | Fecha sem gravar mudanças nem recuperar cópia descartada |
| N10 | Modificar; fechar; escolher Salvar e concluir | Fecha; reabrir confirma os dados |
| N11 | Tentar gravar em destino sem escrita | Erro claro, original intacto, documento continua pendente |
| N12 | Abrir fixture v1 e salvar como v2 | Migração preserva inputs/modos/marcadores; original v1 não sobrescrito |
| N13 | Importar 02-importacao.svg, editar e salvar | DOMParser real aceita elementos; arte reabre corretamente |
| N14 | Importar SVG incompatível em cópia de teste | Mensagem clara; arte anterior e histórico preservados |
| N15 | Desenhar, arrastar, cancelar, bloquear e editar vértices | Gestos atômicos, cancelamento sem alteração, bloqueio efetivo |
| N16 | Conferir 1920×1080, 1600×960 e 980×680 | Ações essenciais acessíveis; documentar recortes/rolagem |

Chamadas reais dos provedores de IA pertencem à homologação da integração; os testes de argumentos e MCP aprovados nesta etapa não comprovam resposta autenticada de modelos.
