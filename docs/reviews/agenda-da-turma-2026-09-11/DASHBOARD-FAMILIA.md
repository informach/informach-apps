# Dashboard para responsáveis e crianças — 12/09/2026

O card Atividades reúne **Ver atividades**, **Ver calendário** e **Importar mensagem ou foto**. Os atalhos repetidos abaixo da rotina foram removidos. Os três destinos preservam a criança selecionada.

A direção visual retoma a agenda escolar: superfícies suaves em azul, verde, lilás, rosa e laranja; etiquetas com ícone e nome do tipo; títulos e controles fáceis de reconhecer. A tipografia e as cores vêm dos tokens existentes do app. O mapa de apresentação é compartilhado pelos cards de atividades para manter os tipos reconhecíveis nas outras visões.

A linguagem considera a criança realizando as atividades e o responsável acompanhando: “Vamos organizar o dia e fazer juntos?”, “Para a criança fazer, com a família por perto” e “Acompanhamento”. As seções organizam o que cuidar hoje, preparar para amanhã e planejar nos próximos sete dias. A cor complementa os nomes e ícones, sem ser a única indicação de tipo ou situação.

O carregamento usa um esqueleto com a estrutura da rotina. O conteúdo escolar complementar carrega dentro do painel recolhido, evitando exibir seu esqueleto como uma seção adicional da tela.

## Critérios de revisão

- Os três atalhos aparecem uma única vez, dentro do card Atividades, com o filtro de criança preservado.
- Para casa, trabalho, prova e os demais tipos continuam sendo atividades, com a mesma navegação e conclusão.
- Cards e controles se adaptam às larguras de 360, 768 e 1280 px, nos temas claro e escuro.
- Textos auxiliares sobre os cards coloridos têm contraste reforçado; os controles principais têm pelo menos 44 px.
- As permissões, os prazos, os registros e o fluxo de importação permanecem nos serviços existentes. Esta entrega não altera o esquema do banco.

O teste de navegador existente foi ampliado com verificações de unicidade, agrupamento e destinos dos atalhos, ausência de rolagem horizontal e seis capturas do dashboard com atividades sintéticas de hoje e amanhã. As capturas ficam em `apps/agenda-da-turma/test-results/`, ignoradas pelo Git. A revisão visual considera que a barra de navegação é fixa no rodapé da janela e, por isso, aparece sobre a posição do primeiro viewport nas capturas de página inteira.

A execução anterior do GitHub Actions (`34691541440`, commit `391cacc`) apresentou falhas ao procurar o resultado da importação e ao verificar a URL da página de privacidade. Os testes agora aguardam o evento correspondente: resposta HTTP real da importação, com status 200, e conclusão da navegação. As asserções visuais permanecem. Os limites de tempo e as permissões do app não foram alterados.

## Verificação local

VERIFICATION REPORT
-------------------
Claim: Dashboard atualizado conforme os critérios acima e verificado localmente, após todas as alterações de código e testes.
Command: `pnpm --filter @informach/agenda-da-turma typecheck`; `pnpm --filter @informach/agenda-da-turma test`; `pnpm --filter @informach/agenda-da-turma test:integration`; `pnpm --filter @informach/agenda-da-turma exec playwright test --config tmp/release/school-default-e2e.config.mts`; `pnpm --filter @informach/agenda-da-turma build`; `biome check .` na exportação limpa do índice Git; `git diff --cached --check`.
Executed: 12/09/2026, após as alterações finais e antes do commit.
Exit code: 0 em todos os comandos.
Output summary: TypeScript sem erros; `Tests 505 passed (505)` em 37 arquivos unitários; `Tests 37 passed (37)` em 4 arquivos de integração; `14 passed (2.2m)` no navegador; `Compiled successfully in 41s` e `Generating static pages using 11 workers (51/51)`; `Checked 919 files in 1458ms. No fixes applied.`; diff sem erros. As seis combinações de largura e tema foram conferidas visualmente, sem rolagem horizontal, e os três atalhos foram encontrados uma única vez no card correto.
Warnings: Nenhum aviso na rodada final. A indicação informativa de `clientTraceMetadata` pertence à configuração existente do Next.js.
Errors: Nenhum na rodada final.
Verdict: PASS

O navegador usou Edge/Chromium local, servidor na porta 3001, PostgreSQL local, e-mail em sandbox e CSP aplicada. O adaptador temporário mantém os testes e limites de tempo padrão, selecionando o navegador instalado e as variáveis locais. O build usou credenciais fictícias de CI e nenhuma chamada de cobrança ou extração por IA. O lint usou os arquivos versionados com finais de linha LF em `C:/Users/tocha/projects/agenda-release-tree-20260912`. Estes resultados são locais; o novo GitHub Actions e o deploy são verificados após o push.
