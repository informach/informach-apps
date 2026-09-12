# Acesso a para casa, trabalhos e provas — 12/09/2026

O acesso à agenda escolar havia ficado escondido na rotina, na barra principal e nos grupos recolhidos de criação. A correção restaura **Atividades** na navegação, mostra um atalho escolar no início da rotina e deixa **Nova atividade** visível no calendário.

Em Atividades, os botões **Para casa**, **Trabalho**, **Prova** e **Lembrete** abrem o formulário com o tipo correspondente. O acesso pela rotina preserva a criança filtrada e pré-seleciona sua turma quando disponível. A edição conserva o tipo da atividade existente.

O campo Matéria agora encaminha ao botão do combobox os atributos de identificação e acessibilidade recebidos do formulário, associando corretamente seu rótulo, descrição e erros.

```text
VERIFICATION REPORT
-------------------
Claim: Correção de navegação e cadastro escolar validada no Agenda da Turma.
Command: biome check .
         pnpm --filter @informach/agenda-da-turma typecheck
         pnpm --filter @informach/agenda-da-turma test
         pnpm --filter @informach/agenda-da-turma exec playwright test --config tmp/release/school-default-e2e.config.mts
         pnpm --filter @informach/agenda-da-turma build
         git diff --cached --check
Executed: 2026-09-12, na sessão desta correção
Exit code: 0
Output summary: Biome: Checked 911 files. No fixes applied.
                Unitários: Test Files 37 passed (37); Tests 498 passed (498).
                Navegador: 14 passed (1.1m).
                Build: Compiled successfully in 29.1s; Finished TypeScript in 41s.
                Páginas estáticas: 50/50.
                Typecheck e diff: nenhum erro.
Warnings: none nas execuções finais
Errors: none nas execuções finais
Verdict: PASS
```

O lint verificou uma exportação do índice Git com finais de linha LF em diretório separado. A configuração temporária de navegador herda a configuração padrão do app e seus limites, usando Edge/Chromium instalado, servidor local e banco local. O servidor foi iniciado com o modo de limites de autenticação específico de E2E já usado pelo CI, e com e-mails em sandbox. A primeira execução da suíte completa contra o servidor anterior encontrou o limite normal de criação de contas; a execução final com a configuração de teste correta passou sem aumentar timeouts ou remover verificações.

A jornada de regressão confirma o acesso escolar visível na rotina, preservação do filtro de criança, ausência de rolagem horizontal em 360 e 1280 px, cadastro real dos três tipos com conferência no banco, criação pelo calendário e edições consecutivas. As capturas dessas telas foram inspecionadas visualmente. A fixture escolar passou a criar e remover seu próprio estado e cidade, eliminando a dependência de tabelas de referência já preenchidas, que havia causado uma falha no CI anterior.

Logs completos desta sessão: `apps/agenda-da-turma/tmp/release/school-navigation-*.log` (locais, ignorados pelo Git). Esta correção não contém migrações de banco. O relatório registra a verificação antes do commit; o estado do deploy deve ser conferido no Railway após o push.
