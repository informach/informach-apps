# Laboratório do Missão Saber — implementação e revisão final

03/10/2026. Base anterior: `718f3e4`. Trabalho integrado a partir de `feat/missao-saber-laboratorio-completo`, com commit, merge, push e produção expressamente autorizados pelo usuário.

O laboratório tem experiências ligadas às perguntas, selecionadas pelo ano escolar exato, trilha, acesso e disponibilidade do conteúdo. O aluno pode prever, construir, observar, explicar e tentar outro caso, ou explorar livremente. A expansão conserva o motor de autonomia e os dados anteriores.

## Cobertura entregue

**19 famílias, 379 modos, 1.522 associações entre missão e modo, 58 competências, 291 missões, 116 retomadas e 14 trilhas.** A [matriz por item](./cobertura-implementada.csv) cobre os 2.972 itens de ensino/retomada, pertencentes a 888 famílias. As 540 famílias concretas têm vínculos explícitos em `concept-links.ts`; as 348 famílias de método e argumentação mantêm o roteiro da missão. Os 336 itens reservados não entram no laboratório. O catálogo original e seus hashes de revisão permanecem preservados.

O [inventário JSON](./cobertura-implementada.json) é reproduzível com `pnpm --filter @informach/missao-saber laboratory:coverage`. Relação conceitual não significa reprodução literal do enunciado: os cenários do laboratório são autorais e separados da avaliação.

## Implementação e revisão por fase

| Fase | Entrega e revisão |
| --- | --- |
| Fundação | Catálogo versionado, elegibilidade no servidor, recomendação da missão pausada/pendente e até três alternativas, investigação guiada/livre, teclado matemático incremental, transferência com apoio reduzido, rascunhos, concorrência, caderno e integração com a missão. Gate intermediário: 24 unitários de infraestrutura/catálogo, oito integrações do laboratório e dez fluxos desktop/mobile com build. |
| Anos iniciais | L01–L07 e L19: fichas e bandejas, faixas/regiões/reta de frações, dupla reta proporcional, unidades não convencionais, linha do tempo, figuras, transformações, caminhos e sólidos. Revisões corrigiram contagem, conservação, unidades, rotas e linguagem por faixa. |
| Fundamental intermediário | Porcentagens, compras/orçamento, contagem organizada, gavetas, probabilidade, tabelas e lógica. Revisão cruzada verificou construções alternativas, gráficos, escalas, taxas e modelos. Importação das montagens antigas mantém o original. |
| Anos finais | Equações, proporção, semelhança, coordenadas, Pitágoras, invariantes e finanças. Revisão de hipóteses, equivalência, impossibilidades e casos limites. |
| Ensino médio | Funções, composição/inversa, sequências, estruturas numéricas, polinômios, provas, combinatória, cartas e probabilidade condicional, trigonometria, espaço e finanças. Revisão matemática e de renderização seguida de revisão cruzada da infraestrutura. |
| Revisão integrada | Correções residuais aplicadas antes da rodada final completa: edição/reversão do caderno, resposta de salvamento perdida, logout concorrente, enumeração obrigatória, passos dados de uma prova, distribuição manual de metades e vocabulário de sólidos básicos. |

## Achados corrigidos

| Área | Problema e correção |
| --- | --- |
| Missão → laboratório → caderno | Remontar o componente criava outra investigação. A identidade inclui a origem da missão; novas solicitações concorrentes retomam a mesma execução, e cópias explícitas continuam independentes. A resposta ainda não enviada da missão é preservada. O botão de retorno nomeia o destino real, mesmo quando a execução da missão é aberta pela biblioteca. |
| Lista de investigações | Voltar após editar uma montagem antiga podia mostrar a data anterior. A lista recebe a revisão e a data confirmadas pelo salvamento no servidor, sem depender de recarregar a página nem acrescentar uma requisição para fechar o editor. |
| Snapshots do caderno | Perder a resposta de uma gravação e depois editar podia reutilizar a chave antiga. A intenção agora considera documento, avaliação e revisão confirmada; retries da mesma intenção são idempotentes. Editar A→B→A também permite guardar nova revisão. Anexos preservam versão e ano de lançamento, inclusive após mudança do perfil. |
| Rascunhos e logout | Falha de autorização podia impedir sair; logout SPA concorria com uma resposta RSC privada anterior. Há descarte explícito, encerramento dos escritores/guardas, limpeza dos dois armazenamentos e navegação completa após revogar a sessão. Outras abas recebem o encerramento. Escritas assíncronas atrasadas não recriam dados locais. |
| Relatório familiar | Ordenar pela última edição podia ocultar uma descoberta recente atrás de experiências antigas. A consulta filtra e ordena pela data do marco antes de limitar resultados. O texto distingue investigação com apoio de autonomia. |
| Frações e unidades | Campos aceitam frações e decimal com ponto/vírgula; a unidade fixa no rótulo é implícita. Partições proporcionais não são tratadas como divisões diferentes. Unidades incompatíveis são recusadas. Faixa, região e reta mantêm a mesma referência. |
| Contagem e metades | Em duas etapas, as retiradas eram limitadas à coleção anterior à chegada. `5 + 3 − 7 = 1` agora é permitido e representado. Metades exige distribuir todas as fichas em duas bandejas iguais; digitar apenas o número correto não substitui a construção. |
| Porcentagens e moeda | Corrigida escala de porcentagem, diferença entre percentual e ponto percentual e interpretação de moeda formatada, inclusive `R$ 1.234,56` e negativos. Aumento e desconto iguais usam a mesma taxa; receita distingue somar e multiplicar, incluindo a exceção 1:1. |
| Medidas, caminhos e sólidos | Tempo atravessa meia-noite; unidades variáveis e parciais são representadas. Enumeração 4×4 conserva todas as 70 rotas. Sólidos usam vértices/arestas/faces coerentes, rotação e cortes; o modo básico remove fórmulas e unidades avançadas inadequadas ao objetivo. |
| Álgebra e funções | Identidades usam coeficientes racionais exatos, PG aceita resultados grandes, intervalos equivalentes preservam extremos abertos. Composição e inversa sincronizam domínio, tabela e curva. Gráficos incluem fronteiras naturais e domínios de um ponto; controles sem efeito foram removidos. |
| Enumeração e probabilidade | Modos que pedem lista exigem a construção completa. Subconjuntos e anagramas não aceitam bypass por resposta numérica; distribuições ótimas alternativas são válidas. Cartas tornam explícitos eventos, união, interseção e condição, com seleção e denominador corretos. |
| Dados, finanças e provas | Recorte do gráfico conserva a geometria; orçamento impossível difere de margem zero. Cenários financeiros declaram os parâmetros. Provas abertas usam rubrica; na transferência, os passos dados continuam visíveis e somente as indicações da solução são ocultadas. |
| Apoio e carregamento | As 19 famílias ocultam resultados derivados na transferência até pedido explícito, preservando dados e construções. Família matemática e interface são carregadas separadamente sob demanda. Comparação permanece desabilitada para edição. |

## Conferência dos requisitos

| Critério da proposta | Evidência e limite |
| --- | --- |
| Todas as competências, missões, retomadas e famílias de ensino | Matriz por item, catálogo validado e testes de vínculos/representações; ausência de itens reservados. |
| Separação exata por faixa escolar e trilha | Testes percorrem as 14 trilhas nos anos elegíveis; servidor confere propriedade, plano, curso, ano e suspensão ao abrir, ler e gravar. |
| Enunciado, controle, desenho e corretor coerentes | Casos independentes de matemática, renderização de todos os modos/variantes e revisão por grupo, incluindo equivalência, soluções múltiplas e impossibilidades. |
| Ciclo de aprendizagem e exploração livre | Previsão, construção, observação, explicação, comparação, desfazer/reiniciar e novo caso. Escrita é opcional nos menores; há leitura em voz alta. |
| Transferência e autonomia separadas | Apoio reduzido com pedido explícito persistido. Ajuda na missão é registrada antes de expor a ferramenta. Laboratório não concede domínio nem reutiliza avaliação reservada. |
| Persistência, concorrência e versões | Banco isolado e E2E verificam retry, conflito entre abas, cópia, perda de conexão, reabertura e snapshots imutáveis, incluindo resposta perdida após commit. |
| Continuidade e dados antigos | Missão/caderno/execução conservam identidade e resposta pendente. Barras, malha e grupos anteriores são importados em cópia quando elegíveis e preservados na exportação da família. |
| Celular, teclado e acessibilidade | HTML/SVG com nomes e alternativas textuais, símbolos não dependem só de cor, controles sem arrastar, foco e testes em desktop/Pixel 7 sem overflow. Inspeção visual de frações, funções e probabilidade. Leitor de tela com usuário real permanece validação complementar. |
| Aprendizagem observada | Não houve sessão com alunos reais. Está preparado o [roteiro do piloto](./roteiro-piloto.md); compreensão dos controles, transferência autônoma e retenção não são comprovadas por testes de software. |

O escopo matemático é delimitado: expressões usam gramática própria, sem execução de JavaScript; divisão de polinômios até grau 5, potências inteiras até expoente 100 e Hanoi até seis discos. Irracionais e limites numéricos são identificados no roteiro. Simulação de frequência não substitui probabilidade teórica.

## Verificação final do software

```text
VERIFICATION REPORT
-------------------
Claim: Software da expansão revisado e verificado após as últimas correções.
Command:
pnpm exec biome lint .
biome format . (árvore completa do índice Git exportada em LF)
pnpm exec turbo test --concurrency=1 --force
pnpm exec turbo typecheck --concurrency=1 --force
pnpm --filter @informach/missao-saber test:integration
pnpm --filter @informach/missao-saber e2e
pnpm exec turbo build --concurrency=1 (ambiente de build equivalente ao CI)
pnpm --filter @informach/missao-saber laboratory:coverage
git diff --cached --check
Executed: 03/10/2026, rodada final após as alterações de código.
Exit code: 0 em todos os comandos.
Output summary:
- Lint: Checked 1445 files. No fixes applied.
- Formatação: Checked 1443 files. No fixes applied.
- Unitários: 2.689 aprovados em sete pacotes; Missão Saber: 36 arquivos, 1.440 testes.
- TypeScript: 12 successful, 12 total; nenhum resultado em cache.
- Integração: Test Files 24 passed (24); Tests 92 passed (92).
- Navegador: 52 passed; desktop e Pixel 7; retries: 0.
- Build: cinco aplicações compiladas; 5 successful, 5 total.
- Cobertura: families=19, modes=379, experiences=1522, items=2972.
- Diff: nenhum erro de whitespace.
Warnings: sem avisos de lint/tipos/build. PostgreSQL emitiu NOTICE de extensões existentes e truncamento de identificador em migração anterior. Cenários negativos de e-mail geraram os logs de erro esperados com transporte em memória, sem envio externo.
Errors: nenhum diagnóstico ou teste reprovado na rodada final.
Verdict: PASS para o software; não comprova aprendizagem com participantes reais.
```

A formatação usou a árvore do índice exportada porque este checkout antigo contém CRLF, apesar de `.gitattributes` exigir LF. O lint foi executado sobre os fontes reais com dependências instaladas. Diretórios temporários gerados foram excluídos do Biome; uma regra CSS sem efeito num protótipo antigo foi removida. Nenhuma regra de código foi desligada para obter aprovação.

Rodadas anteriores identificaram falhas e não são apresentadas como verdes. A falha de logout teve trace preservado e motivou o encerramento explícito da sessão no cliente. A primeira execução simultânea de todos os unitários com os typechecks saturou os workers e excedeu o timeout existente de importação em testes de autenticação; a execução final completa foi serializada por pacote, sem mudar timeouts ou retries. Os novos casos matemáticos foram exercitados antes e depois das respectivas correções. Não houve remoção de asserções para aprovar a entrega.

Evidências locais: `.cache/lab-final-{lint-native,format,unit-serial,types,integration,e2e-accepted,build,coverage}.log`. Capturas em `apps/missao-saber/tmp/laboratory/` e traces de falha em `apps/missao-saber/tmp/verification/`. São artefatos ignorados; os resultados duráveis estão registrados acima.

## Publicação e recuperação

As migrations `0065`–`0067` são aditivas: tabela de execuções, anexo opcional no caderno, marcos e origem da criação. O verificador de schema exige as novas estruturas e o journal completo. Nenhum dado antigo é apagado pela migração.

Antes do push, um dump de produção foi restaurado em PostgreSQL local descartável: origem e restauração coincidiram em 65 migrations, 103 tabelas e 13 usuários; 15.836.517 bytes, SHA-256 `533cf70bca9c153e06ea0371651ae0a42ca94fa2fbb842d58d031d1656e21a9d`. O banco temporário e o dump local foram removidos após a verificação. Isso testa o procedimento de restauração, não representa um dump local retido como backup.

Após o merge/push, a publicação exige acompanhar CI, migrador no commit novo, deployments do Missão Saber/Cozya/Agenda e seus endpoints de readiness e health, além de `production:verify-schema` com 68 migrations. Os IDs e o resultado efetivo dessa etapa são registrados no CI/Railway e na resposta de entrega, pois a verificação de produção ocorre depois deste commit. Não executar `db:push` nem restaurar automaticamente o banco compartilhado para reverter código.
