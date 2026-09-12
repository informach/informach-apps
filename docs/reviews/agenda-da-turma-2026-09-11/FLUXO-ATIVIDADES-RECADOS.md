# Atividades, recados e fotos da agenda — 12/09/2026

Atividades passa a ser a lista de execução da família. Recados e originais guarda o documento de origem, com acesso às atividades que foram confirmadas a partir dele. Rotina e Calendário são outras visões dos mesmos registros.

## Fluxo dos responsáveis

1. **Cadastro direto:** abrir Atividades → Nova atividade → escolher o tipo (para casa, trabalho, prova etc.). O cadastro por turma/matéria continua disponível. Sem turma, o formulário solicita a criança e o título; o prazo pode ficar a confirmar. Também é possível escolher o cadastro sem matéria no formulário escolar.
2. **Mensagem da escola:** abrir Importar mensagem ou foto → escolher a criança e a origem → colar a publicação e/ou enviar o anexo → identificar atividades → conferir → salvar.
3. **Anotações do aluno:** usar Tirar foto da agenda ou do caderno, ou selecionar um arquivo. A origem passa a ser Agenda ou caderno. O texto digitado é opcional. A prévia ajuda a conferir se a página está enquadrada. Uma foto pode gerar várias atividades de tipos diferentes.
4. **Revisão:** conferir criança, atividade, detalhes e prazo. A IA recebe instruções para indicar trechos ilegíveis e evitar adivinhar datas. Datas relativas dependem de referência de publicação/escrita; a data da fotografia não é essa referência. Sem referência confirmada, o prazo permanece vazio.
5. **Acompanhamento:** o salvamento abre Atividades, preservando a criança quando o lote pertence a um único perfil. Os filtros de criança, tipo e situação alcançam todas as origens e são aplicados antes da paginação. Concluir ou editar atualiza os mesmos registros consultados na rotina e no calendário.
6. **Consulta:** Recados e originais mostra documentos confirmados e importações que aguardam revisão. Consultar original abre o documento e permite baixar o arquivo enquanto estiver disponível. Ver atividades mostra os itens vinculados àquele documento, inclusive concluídos e cancelados.

## Requisitos conferidos

- Um único botão Nova atividade; para casa/trabalho/prova são tipos e filtros.
- Atividades de turma, extras, importações e planejamento manual na mesma listagem.
- Cadastro sem turma ou matéria; selecionar uma criança sem turma não abre o cadastro da turma de outro filho.
- Importação de foto sem transcrever manualmente seu conteúdo, câmera no celular e seleção de arquivo no computador.
- Conferência antes de gravar; suporte a múltiplas atividades e prazos ausentes.
- Originais consultáveis e vinculados; ausência de uma segunda fila de conclusão em Recados.
- Permissões por criança nas atividades; acesso ao original exige permissão sobre seu escopo completo.
- Atualização das visões após mudanças; arquivos originais mantêm retenção de 30 dias.

## Implementação e limites da validação

A listagem usa uma projeção SQL das três fontes existentes, sem copiar atividades ou criar uma segunda situação de conclusão. As consultas de detalhe verificam novamente o acesso. A paginação retorna até 30 itens por página, com ordenação estável por situação, prazo, criação, origem e ID.

Foi corrigida também a precisão do cursor da consulta escolar anterior: PostgreSQL preserva microssegundos, enquanto JavaScript Date preserva milissegundos. Comparação e ordenação agora usam a mesma precisão para evitar repetir a última atividade da página anterior.

`notebook` é um valor adicional nos tipos da coluna textual de origem; o gerador Drizzle confirmou: `No schema changes, nothing to migrate`. Não há migração SQL nesta entrega.

O teste de navegador envia um PNG sintético pelo campo de câmera, recupera uma extração previamente persistida pelo endpoint real, confirma duas atividades, preserva o prazo desconhecido, consulta e baixa o original e conclui a tarefa. Ele verifica o fluxo e a persistência; **não mede a precisão da leitura de caligrafias reais**. Não foram enviados dados de crianças a um provedor de IA durante estes testes. A qualidade da foto e da letra continuam exigindo conferência humana.

## Verificação

VERIFICATION REPORT
-------------------
Claim: Fluxo integrado implementado e verificado localmente, após as alterações finais.
Command: `pnpm --filter @informach/agenda-da-turma typecheck`; `pnpm --filter @informach/db typecheck`; `pnpm --filter @informach/agenda-da-turma test`; `pnpm --filter @informach/agenda-da-turma test:integration`; `pnpm --filter @informach/agenda-da-turma exec playwright test --config tmp/release/school-default-e2e.config.mts`; `pnpm --filter @informach/agenda-da-turma build`; `pnpm --filter @informach/db db:generate`; `biome check .` na exportação limpa do índice Git.
Executed: 12/09/2026, após as alterações finais e antes do commit.
Exit code: 0 em todos os comandos.
Output summary: TypeScript do app e do banco sem erros; `Tests 505 passed (505)` em 37 arquivos unitários; `Tests 37 passed (37)` em 4 arquivos de integração; `14 passed (1.3m)` no navegador; `Compiled successfully in 43s` e build Next.js concluído, incluindo `/atividades/nova` e `/recados/[id]`; `Checked 918 files in 1131ms. No fixes applied.`; Drizzle: `No schema changes, nothing to migrate`.
Warnings: Nenhum aviso de lint, compilação ou testes. A indicação informativa do Next.js sobre `clientTraceMetadata` já faz parte da configuração existente.
Errors: Nenhum na rodada final.
Verdict: PASS

O navegador usou os mesmos testes, timeouts e asserções da configuração padrão, com Edge/Chromium local e servidor existente na porta 3001, e-mail em sandbox e CSP aplicada. O adaptador temporário apenas carrega as variáveis locais e seleciona o navegador instalado. Os testes não fazem cobrança Stripe ou chamada ao provedor de IA. Os testes de navegação aguardam a mudança de URL e o evento real de download, evitando confundir compilação inicial do servidor de desenvolvimento com falha de interface. O lint foi executado sobre os arquivos versionados com finais de linha LF em `C:/Users/tocha/projects/agenda-release-tree-20260912`, sem os arquivos temporários ignorados do workspace.

O teste do cursor escolar falhou antes da correção (a primeira atividade reaparecia na segunda página) e passou depois. As verificações de acesso cobrem responsável convidado limitado a uma criança, original com informações de dois irmãos, filtros antes da paginação e conclusão refletida na consulta compartilhada.
