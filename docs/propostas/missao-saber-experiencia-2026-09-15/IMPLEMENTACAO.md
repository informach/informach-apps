# Missão Saber — implementação da proposta de experiência

Registro do que foi construído a partir da [PROPOSTA-EXPERIENCIA.md](PROPOSTA-EXPERIENCIA.md), na ordem das quatro fases, com os desvios e o que ficou de fora. Data: 15/09/2026.

Os 19 itens da proposta foram implementados. Cinco deles saíram diferentes do que a proposta descrevia; cada desvio está registrado abaixo com o motivo, e todos vieram de restrições que o próprio produto já tinha escrito.

## Fase 1 — perto do acampamento

| Item | Onde |
| --- | --- |
| **B1** Faísca fala na devolutiva | `components/ui/fala-faisca.tsx`, `painel-devolutiva.tsx`, `engine.ts`, campo `misreads` em `content/types.ts` e nas 24 especificações numéricas do catálogo |
| **B2** Faísca abre a missão | `learning/components/player.tsx` |
| **C1** Frase da semana por regras | `learning/relato.ts` + `relato.test.ts`, renderizada em `familia/page.tsx` |
| **D3** Reencontro sem culpa | `hoje/page.tsx`, com `localDaysApart` em `engine.ts` |
| **A2** Progresso do capítulo | `jornada/page.tsx` + `components/ui/barra-progresso.tsx` |

**Desvio 1 — justificativa não recebe "primeiro critério não atendido".** A proposta previa apontar o primeiro item da rubrica ainda não cumprido. Isso exigiria avaliar texto livre automaticamente, que o produto proíbe em três lugares diferentes. Virou autoavaliação: "Compare sua explicação com estes critérios".

**Desvio 2 — o diagnóstico estava incompleto.** A proposta dizia que a Faísca não aparecia na devolutiva. Ela aparecia, mas com `max-sm:hidden` — ou seja, sumia exatamente no celular. Corrigido junto com a falta de voz.

**Efeito colateral obrigatório:** 73 itens do catálogo mudaram de digest no ledger de autoria (`reviewed-catalog.ts`). O ledger existe para forçar essa conferência; cada leitura equivocada foi conferida e os digests foram regravados.

## Fase 2 — primeira trilha

| Item | Onde |
| --- | --- |
| **E3** `/experimentar` refeito | `components/demo.tsx` — abertura da Faísca, passo 1–3, devolutiva falada e o fechamento que **nomeia a estratégia** |
| **E2** Leitura em voz alta | `components/ui/ler-em-voz.tsx`, coluna `sessions.reading_support` (migration `0054`) |
| **C2** Apoio em casa | `content/apoio-em-casa.ts` (duas conversas por habilidade, nenhuma pedindo tela) |
| **A3** `/meu-espaco` com números | `meu-espaco/page.tsx` |
| **C4** Simulado com percurso anterior | `repository.previousAssessment`, coluna extra na tabela de devolutiva |

**Desvio 3 — a leitura em voz alta é registrada, não bloqueada.** Em diagnóstico e simulado ler o enunciado pode alterar o construto medido. Em vez de desligar o recurso onde ele é mais necessário, a sessão declara o apoio e a devolutiva diz que o resultado não representa leitura autônoma.

## Fase 3 — expedição

| Item | Onde |
| --- | --- |
| **A1** Territórios das trilhas | `components/ui/horizonte.tsx` — SVG paramétrico, quatro paisagens, usado em `/jornada` e na landing |
| **B3** Previsão no laboratório | `labs.tsx` (`CicloDeDescoberta`), anotações dentro do `jsonb` do experimento |
| **D2** Pausa do explorador | `content/pausas.ts` + `player.tsx` |
| **E1** Tema escuro | `globals.css`, `components/seletor-tema.tsx`, tokens `--ms-sobre-*` |
| **D1** Desafio da família | tabela `missao_saber.family_challenges` (migration `0056`), `family/desafio.ts` |
| **C3** Resumo semanal por e-mail | categoria `missao.weekly-report`, `family/resumo-semanal.ts`, `api/jobs/weekly-report` |

**Desvio 4 — a preferência de tema fica no navegador, não no perfil.** A proposta dizia "persistido no perfil". Aparelho é informação de aparelho: a mesma criança estuda de dia no computador e de noite no celular. Guardar no `localStorage` evita uma coluna, evita uma migração e guarda um dado a menos sobre uma criança — o que combina com a política do produto.

**O tema escuro não foi invertido, foi medido.** Os tons `-solido` tinham sido calibrados para texto branco sobre fundo claro; invertê-los produziria botão claro com letra branca. O arquivo `src/app/tema.test.ts` lê o `globals.css` de verdade, converte oklch para sRGB e mede **27 pares de contraste em cada tema** — 54 medições —, reprovando qualquer um abaixo de 4,5:1 (3:1 nos dois glifos decorativos de avatar, que são componente de interface e não texto). Foi essa medição que revelou um conflito estrutural: `--ms-lima` não pode ser ao mesmo tempo preenchimento de botão (precisa clarear no escuro) e tinta translúcida de etiqueta (precisa escurecer). Os dois papéis foram separados em `--ms-lima` e `--ms-lima-solido`.

## Fase 4 — além do mapa

| Item | Onde |
| --- | --- |
| **B4** Desafio profundo por habilidade | `content/desafios-profundos.ts` — doze desafios, um por habilidade, com passos e rubrica |
| **E4** Service worker | `public/sw.js`, `components/registrar-sw.tsx`, `app/offline/page.tsx` |

**Desvio 5 — o offline guarda a casca, não as missões.** A proposta falava em "cache das missões já baixadas, para leitura e resposta em fila", e já dizia que isso exigiria uma política de conflito de tentativa. Guardar o HTML autenticado tem um custo que a proposta não tinha pesado: o celular da casa é compartilhado entre irmãos, e o percurso de um perfil ficaria legível a partir de outro. O que entrou foi a casca, os pacotes estáticos e uma página de falha explicativa. **Fila de respostas offline não entrou** — ela precisa de uma decisão sua sobre conflito de tentativa, e o gabarito do simulado é do servidor por decisão de arquitetura.

## Uma regressão encontrada e corrigida

A consulta do desafio da família, adicionada direto em `/hoje`, quebrava a troca de estudante de forma reproduzível nos dois navegadores do E2E. A consulta não era lenta (9 ms com o volume do fixture) nem lançava exceção — o problema era ser um `await` não memoizado no corpo da página, fora do `currentDashboard()` que layout e página compartilham. A leitura foi movida para dentro do `dashboard()`, que já conhece o usuário, e a varredura da semana passou a só acontecer quando existe uma meta aceita. O E2E voltou a passar e ficou mais rápido do que antes da mudança.

Duas coberturas foram acrescentadas por causa disso: `test/family-challenge.integration.ts` para a consulta do desafio e um trecho em `e2e/journey.spec.ts` para `/meu-espaco` e para o tema escuro sobreviver ao recarregamento.

## Uma correção de segurança pelo caminho

O script que aplica o tema antes da primeira pintura seria bloqueado pela CSP do app, que usa `script-src 'self' 'nonce-…' 'strict-dynamic'`. O layout passou a ler o nonce publicado pelo proxy em `x-nonce`. Sem isso, a preferência salva se perderia a cada recarregamento, em silêncio.

## O que o review geral encontrou

Oito achados; sete viraram correção e um não se confirmou.

| # | Achado | Desfecho |
| --- | --- | --- |
| 1 | Religar o resumo semanal não apagava o cancelamento feito pelo link do e-mail | Corrigido: `setWeeklyReportEmail` apaga a linha de `email_unsubscribes`, como o `agenda-da-turma` já fazia |
| 2 | Resumo semanal poderia ser ligado com e-mail não confirmado | **Não procede**: `weeklyReportEmailAction` usa `recentParent`, que já exige `emailVerified` |
| 3 | O desafio da família contava diagnóstico e simulado | Corrigido: nesses modos não existe pista, então toda resposta certa teria zero pistas e um diagnóstico de doze itens encheria a meta sozinho. A consulta passou a filtrar por `mission` e `review` |
| 4 | O campo `misreads` mudava o hash de todo item numérico | Corrigido em `itemHash`: uma lista vazia não é conteúdo autoral e não muda a identidade. Sem isso, reparsear um snapshot congelado injetaria a chave nova e toda atividade numérica retirada por um mantenedor voltaria a contar como evidência no primeiro deploy |
| 5 | Sistema no escuro + escolha "Claro" deixava os controles nativos escuros | Corrigido: `:root[data-theme="light"] { color-scheme: light; }` |
| 6 | Service worker registrava em desenvolvimento | Corrigido: só em produção, porque em `next dev` os pacotes não têm hash de conteúdo |
| 7 | "Último simulado" lia só os trinta percursos mais recentes | Corrigido com consulta própria (`lastExamDate`) |
| 8 | `cache.put` fora de `waitUntil` e `/offline` envelhecendo entre deploys | Corrigido: gravação sob `waitUntil` e a página de falha rebaixada a cada ativação |

O achado 4 é o mais silencioso dos oito: nada quebraria, nenhum teste falharia, e atividades retiradas por engano voltariam a contar como evidência de autonomia. Ele ganhou teste de regressão em `engine.test.ts`, e o achado 3 ganhou um caso em `family-challenge.integration.ts`.

## O que o review de fechamento encontrou

Depois das correções acima, uma segunda leitura completa do que tinha sido escrito achou mais dez pontos. Nove viraram correção; um não se confirmou.

| Achado | Desfecho |
| --- | --- |
| Selo "em construção" ficava com 1,79:1 no tema escuro | Corrigido: `bg-sol-solido text-sobre-sol border-sol-fundo`. O selo usava o tom vivo com `--ms-tinta`, e no escuro os dois clareiam juntos |
| Os oito avatares pintavam glifo branco ou `--ms-tinta` sobre tom vivo | Corrigido: todos passaram a usar os pares `-solido`/`-fundo` com `--ms-sobre-*`, e `tema.test.ts` ganhou os dois pares que faltavam. Nenhum avatar tem mais cor fixa |
| Religar o resumo semanal não era atômico, e a lista de envio não olhava o descadastro | Corrigido: `setWeeklyReportEmail` virou transação, `listFamiliesForWeeklyReport` exclui quem cancelou (`leftJoin` + `isNull`) e a tela mostra o cancelamento feito pelo link em vez de exibir um interruptor ligado que não envia nada |
| A contagem de descobertas em `/meu-espaco` carregava todas as anotações para mostrar um número | Corrigido: `countNotes` com `count()` no banco |
| O cache dos pacotes do Next morava no mesmo cache da casca, sem teto e sem descarte | Corrigido: cache próprio (`missao-pacotes-v1`) com limite de 120 entradas e descarte do mais antigo. O nome da casca nunca muda entre deploys, então os pacotes de todo deploy antigo ficariam lá para sempre |
| Um pacote sem rede e sem cópia rejeitava a promessa do `respondWith` | Corrigido: `.catch` devolvendo 503 com texto, em vez de um erro de rede solto |
| Em desenvolvimento o registro era pulado, mas um worker já instalado continuava lá | Corrigido: em `next dev` o componente desinstala os registros e apaga os caches `missao-*`. Não registrar não é o mesmo que desinstalar, e `localhost` é a mesma origem de um `pnpm start` rodado antes |
| A coluna "percurso anterior" comparava resultados feitos em condições de apoio diferentes | Corrigido: `previousAssessment` passou a carregar o `reading_support` daquele percurso, e a legenda avisa quando um dos dois teve leitura em voz alta. Sem isso, a tabela mostraria como recuo o que é só mudança de apoio — exatamente a leitura que a coluna foi criada para evitar |
| A marca de apoio de leitura era disparada sem espera e seu retorno era descartado | Corrigido: a ação devolve `{ marked }`, o cliente desfaz o sinalizador local quando o servidor recusa, e `submit` espera a marca pendente antes de enviar a resposta — senão a última resposta fecharia a sessão antes do registro e o resultado apareceria como leitura autônoma |
| Leituras equivocadas numéricas eram validadas como distintas, não como separadas | Corrigido: o schema passou a exigir mais de duas tolerâncias entre elas. Duas janelas que se cruzam fariam uma resposta na interseção receber a devolutiva da primeira da lista, nomeando uma etapa que o estudante não trocou |
| Suspeita de leitura de `headers()` sem rota dinâmica no layout | **Não procede**: `src/app/layout.tsx` já declara `export const dynamic = "force-dynamic"` |

Duas coberturas novas: `test/learning.integration.ts` ganhou o ciclo inteiro do apoio de leitura (declaração idempotente, recusa depois do fim e a comparação entre dois percursos), e `engine.test.ts` ganhou o caso das janelas que se cruzam.

## Os reviews por fase

O combinado era um review a cada fase. Na prática a Fase 1 teve o seu, as Fases 2, 3 e 4 tiveram só verificação automatizada na entrega, e o review geral veio no fim. Para fechar essa lacuna, cada conjunto de arquivos das Fases 2, 3 e 4 foi relido depois, com escopo próprio. Um achado novo saiu daí:

| Achado | Desfecho |
| --- | --- |
| Uma exceção em uma família derrubava o cron inteiro do resumo semanal | Corrigido: cada família é processada dentro do seu próprio `try`, a falha é contada e reportada, e o laço segue. Antes, um dado quebrado numa casa deixava sem resumo todas as casas seguintes da lista — em silêncio, porque o endpoint devolvia 503 e o cron só tentaria de novo na semana seguinte |

O envio semanal também ganhou cobertura própria (`test/weekly-report.integration.ts`): quem está na lista, o cancelamento pelo link do e-mail excluindo a família do envio, religar pelo app desfazendo esse cancelamento, e o corpo montado para uma casa com estudante — e nenhum corpo para uma casa sem.

## O review de tudo

Uma terceira leitura, agora do conjunto inteiro — cada arquivo tocado, do schema ao texto autoral. Quatro achados, todos corrigidos.

| Achado | Desfecho |
| --- | --- |
| O grupo de alternativas perdeu o enunciado como nome acessível | Corrigido: o `<legend>` genérico saiu e o `fieldset` passou a se chamar pelo parágrafo do enunciado (`aria-labelledby`). Tirar o enunciado do `legend` foi necessário para o botão de ouvir não herdar o `disabled` do conjunto, mas quem navega por leitor de tela passou a entrar nas opções ouvindo só "sua resposta". Guardado por um passo novo no E2E |
| As duas caixas de previsão do laboratório usavam `id` fixo | Corrigido com `useId`. Numa missão a mesma ferramenta pode aparecer duas vezes na tela — "explorar antes de responder" e a ferramenta de apoio das pistas —, e dois `id` iguais faziam o rótulo de uma cópia apontar para o campo da outra |
| O relato semanal dizia "resolveu N problemas novos … em D dias" com D = dias de prática | Corrigido: D agora conta os dias em que essas descobertas aconteceram. Quem estudou quatro dias e teve as duas descobertas no mesmo dia lia uma frase que espalhava o feito por dias em que ele não aconteceu. Com teste |
| O comentário da janela do desafio dizia usar o mesmo limite de `weeklyEvidence` | Corrigido o comentário: `weeklyEvidence` compara dias locais em JavaScript; a consulta precisa de um instante e assume UTC-3, verdadeiro desde 2019. A suposição agora está escrita onde o próximo leitor a encontra |

Também foi conferida, uma a uma, a matemática das **83 leituras equivocadas autorais** dos 73 itens numéricos do catálogo: em todas, o valor declarado corresponde ao erro que a devolutiva nomeia.

Verificação final: Biome, `tsc --noEmit`, **146 testes unitários**, **54 de integração** em PostgreSQL descartável e **6 E2E** nos dois navegadores — todos passando.

## O que continua fora

- Fila de respostas offline (ver desvio 5).
- Tutor de IA, ranking, moedas, ofensiva com perda, badge por minutos e simulador de investimento — a seção "o que não trazer" da proposta continua valendo inteira.
- O cron do resumo semanal precisa ser agendado no Railway; o endpoint está pronto e documentado em [PRODUCAO.md](../../../apps/missao-saber/PRODUCAO.md).
- As migrations `0054` e `0056` precisam ser aplicadas em produção pelo fluxo normal de deploy.
