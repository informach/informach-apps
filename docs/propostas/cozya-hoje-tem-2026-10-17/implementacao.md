# Cozya "Hoje tem": implementação

Registro de 17/10/2026. Origem: análise de direção de arte, copy e produto entregue no canvas [Cozya, Hoje tem](https://claude.ai/artifact/B6obPPncpx6zjodiNN6T6K), aprovada pela titular com o pedido "aplica a sua proposta, corrige os defeitos e deixa tudo funcionando". Branch `feat/cozya-hoje-tem`, criada de `origin/main` em `0457f0c`, num worktree isolado (`informach-cozya-hoje-tem`) com banco local próprio. Nada foi commitado, publicado ou enviado ao Railway.

## Decisões aplicadas

A titular aprovou a proposta inteira. As decisões que o canvas deixava em aberto ficaram assim:

| Decisão | Como ficou |
| --- | --- |
| Entrada do app | `/hoje` é a casa. `/dashboard` redireciona para lá, e o manifesto PWA abre em `/hoje`. |
| Início do teste | Os 14 dias começam sozinhos na primeira refeição com receita colocada na semana (`ensurePlanning` chama `startKitchenTrial`). Também começam ao escolher um caminho com IA em "Trazer uma receita". Uma refeição sem receita ("Sobras", "Comer fora") nunca gasta o teste, e a receita é conferida como da casa antes. Continua um teste por e-mail verificado. |
| Marmita | Número separado da mesa: `cozya.meals.lunchbox_servings`, entre 0 e `servings`. O almoço do dia seguinte mostra a marmita sem criar outra refeição. |
| Lista para outra pessoa | Texto pelo WhatsApp, só com o que ainda falta, agrupado por corredor. Sem link nem conta. |
| "Como foi?" | Colunas em `cozya.cooking_sessions` (`verdict`, `note`, `noted_at`), não uma tabela nova: a nota pertence à última vez que a receita foi feita. `last_cooked_at` guarda quando a receita foi feita pela última vez e nunca é apagado; `cooked_at` continua sendo o fim do preparo atual. |
| Título da página de vendas | "O que tem pra janta? Já está decidido." |
| Seção "Quem faz" | Fora desta entrega: depende de texto e foto da Helena e do Júlio. |

## O que mudou no app

- **Hoje.** Mostra o que tem hoje com mesa e marmitas, o botão de cozinhar, Trocar e Já cozinhei. Também mostra:
  - a nota da última vez;
  - o que falta comprar para essa refeição;
  - o almoço que vem da marmita de ontem;
  - amanhã, os sete dias da semana com os livres em destaque, e o atalho para a lista.
  
  Depois de cozinhar, mostra "Hoje teve" e passa para amanhã. O aviso de fim de teste aparece nos três últimos dias e depois dele.
- **Primeira semana.** Uma conta sem refeições escolhe três receitas (as suas ou da coleção) e o Cozya as coloca nos próximos dias livres, com o tamanho da casa. Se o e-mail já usou o teste, a tela explica e leva ao Pro.
- **Semana.** Cada dia tem almoço e jantar. O editor mostra:
  - as receitas, com rendimento e quando foram feitas pela última vez;
  - os contadores de mesa e de marmitas, e a conta das porções em texto;
  - as refeições sem receita (Sobras, Comer fora, Pedir comida, Outra coisa).
  
  O botão da lista diz se vai montar, abrir ou atualizar. "Repetir nos dias livres" copia a semana anterior sem sobrescrever nada.
- **Compras.**
  - Duas fases: "Antes de sair" marca o que já está em casa; "No mercado" esconde isso e marca o carrinho. A fase fica na URL.
  - A despensa vem como uma pergunta só, em fichas.
  - A lista avisa quando a semana mudou. Ao atualizar, só voltam para pegar os itens cuja quantidade mudou.
  - Tem envio pelo WhatsApp, impressão e itens avulsos.
- **Modo cozinha** (`/receitas/[id]/cozinhar`, fora do cabeçalho do app):
  - um passo por tela, com o tempo do passo virando botão de timer;
  - ingredientes recolhíveis e escalados;
  - tela ligada quando o navegador permite, e progresso salvo na conta;
  - no fim, "Como foi?" com três respostas e uma nota. `?etapa=fim` (o "Já cozinhei" do Hoje) registra o preparo e vai direto para essa pergunta.
- **Receitas.**
  - Página própria por receita, com contador de porções, favoritar, editar, compartilhar, imprimir, adaptar com IA e apagar.
  - A lista tem capas tipográficas, busca por nome ou ingrediente e os filtros Favoritas, Até 45 min, Rendem 4 ou mais e Faz tempo.
  - "Trazer uma receita" abre uma folha com foto, texto colado, voz, pedir para a IA encontrar e escrever do seu jeito. Cada opção diz se usa crédito.
- **Planos e conta.** Upgrade e cobrança reescritos sem travessão. O selo anual vem do catálogo (17%), e a barra de créditos vazia aparece vazia.
- **Tema.** Os tokens do Cozya (papel, tinta, laranja, sálvia, pêssego), com modo escuro, ficam em `app/globals.css`. O cabeçalho tem abas no computador e barra inferior no celular.

## Página de vendas

A página foi reescrita na ordem do canvas:

1. herói com o celular mostrando o Hoje;
2. a semana contada em quatro momentos;
3. demonstração em três etapas (semana com mesa e marmitas, mercado, cozinha);
4. caderno da família;
5. marmita;
6. mercado com WhatsApp;
7. repetir a semana;
8. planos com os dois preços do Pro e o Free;
9. perguntas;
10. convite final.

O contato é o direct do Instagram. A demonstração continua local, sem IA, billing ou gravação. Ela usa a coleção inicial e as funções reais de porções e consolidação. A imagem social continua a mesma.

## Defeitos corrigidos

- **Lista de compras.**
  - O preparo saía do nome ("alho amassado" e "alho picado" viram uma linha de alho com a nota do preparo).
  - Sal, água de cozimento e outros "a gosto" deixaram de repetir por receita: o que é de despensa vira a pergunta da despensa, e a água de cozimento sai da lista.
  - Unidades legíveis: "9 dentes", "1 kg", "1,5 l".
  - Bacon, mandioca, louro e champignon foram para o corredor certo.
  - A lista passou a ser recalculada pelas regras atuais na leitura, porque o snapshot gravado é anterior a elas.
- **Porções.** `scaleIngredient` devolve a linha original quando não há o que escalar e flexiona o substantivo em unidades.
- **Barra de progresso.** `@informach/ui` `Progress` usava `bg-secondary` na trilha; no Cozya a trilha cheia parecia 50 de 50 créditos com 0. A correção, `bg-primary/20`, é a mesma da branch da Agenda.
- **Selo anual.** O "-20%" fixo virou o percentual do catálogo.
- **Teste e IA.** A IA bloqueada oferece começar o teste quando ele está disponível, em vez de mandar para planos. O cadastro pelo teste não mostra mais o passo "Plano". "← Dashboard" saiu.
- **Copy.** Os travessões visíveis saíram, e o tracking dos títulos da landing foi aberto.
- **Encontrados na verificação desta entrega.**
  - O selo de marmita da semana tinha rótulo, mas estava oculto para leitores de tela.
  - Na fase "Antes de sair", um item já no carrinho aparecia marcado sem ser anunciado como marcado.
  - "1 de 2 item está em casa" virou "1 de 2 itens está em casa".
  - A página de vendas transbordava 34 px em telas de 320 px: o preço anual não podia quebrar, e as colunas não encolhiam.
  - O exemplo do caderno quebrava linha entre 1024 e 1240 px.

## Banco

Migração `0074_cozya_hoje_tem`, só aditiva:

- `cozya.meals.lunchbox_servings integer not null default 0`, com check `between 0 and servings`;
- `cozya.cooking_sessions.verdict`, `note` e `noted_at`, com checks de valores e de 500 caracteres;
- `cozya.cooking_sessions.last_cooked_at`, preenchida a partir de `cooked_at` no próprio arquivo (um `UPDATE` acrescentado ao SQL gerado).

Nenhuma linha existente muda de sentido: refeições antigas ficam sem marmita, sessões antigas ficam sem nota e mantêm a data em que a receita foi feita.

**Numeração.** Gerada primeiro como `0072`, a migração foi regenerada como `0074` depois que o Bastidores entrou na mesma pilha com `0072_happy_patch` (schema `ops`) e `0073_warm_nemesis` (bloqueio de 2FA). O DDL saiu idêntico ao da primeira geração, e o `UPDATE` do histórico foi acrescentado de novo ao SQL gerado.

## Review geral

Três revisores independentes leram a entrega inteira, sem editar, cada um numa área: domínio e dados, telas do app, e página de vendas com cobrança. Cada achado foi conferido no código antes de corrigir. Os confirmados e corrigidos:

- **Dados e regras.**
  - O primeiro toque no modo cozinha num dia novo apagava `cooked_at`, que também era o histórico: a receita voltava a "ainda não fez" e reaparecia em "Faz tempo". Agora o histórico fica em `last_cooked_at`.
  - Um item de despensa marcado como "falta" voltava a "em casa" quando outra receita mudava a quantidade. Agora continua faltando.
  - Uma refeição sem receita, ou com receita de outra conta, gastava o teste.
  - A primeira semana podia ser montada duas vezes num toque duplo. Agora roda com trava por conta e não planeja de novo se a conta já tem refeições. O registro de semana planejada passou a contar cada semana envolvida.
  - O timer lia "1 hora e 30 minutos" e "1h 30min" como 30, e "1 hora e meia" como 60.
  - "Água ou caldo de legumes" sumia da lista como se fosse água de cozimento.
  - A lista mostrava "Cebola 1,25". Agora o que se compra inteiro é arredondado para cima: aparece "2".
- **Hoje e semana.**
  - A marmita de ontem virava "Hoje tem", com "Começar a cozinhar" e "Já cozinhei" para comida já pronta. Agora ela fica em "Também hoje".
  - A marmita do jantar de domingo não aparecia na segunda em `/semana`.
  - Depois do jantar de domingo, o que falta comprar era conferido na lista da semana errada.
  - Para quem já não pode planejar:
    - os botões de planejar levavam a um editor que não abria;
    - a primeira semana aparecia mesmo com o teste usado;
    - "Atualizar a lista" falhava, e agora o botão abre a lista existente.
  - "Seu teste terminou" aparecia também para quem assinou e cancelou. Agora a mensagem é "Novas semanas ficam no Pro."
  - Rótulos por dia de calendário em São Paulo: o teste termina "hoje" no último dia, e o jantar de ontem aparece como "feita ontem" de manhã.
  - O chip "Teste: N dias" levava aos planos desde o primeiro dia. Agora é só texto até os três últimos dias.
- **Impressão e acessibilidade.**
  - "Imprimir" na lista saía sem itens: uma regra global escondia todos os botões, e cada linha da lista é um botão. As linhas e a despensa que falta agora saem no papel; instruções, setas e despensa completa ficam fora.
  - O horário de fim do timer era formatado sem fuso, o que causava erro de hidratação com o servidor em UTC.
  - O ponto de hoje sempre era anunciado como "planejado".
  - Os "+ Almoço", "+ Jantar", fichas da despensa e filtros tinham 40 px. Agora têm 44 px.
  - O check branco sobre sálvia não tinha contraste no modo escuro.
  - Copy: "4 de 3", "nestes 1 dias", "para 1 porções", "ainda falta" com vários itens, e "Enviamos" antes de enviar o código.
- **Página de vendas e cobrança.**
  - "14 dias com tudo" prometia mais que o teste: ele tem 3 créditos e o limite de 15 receitas, e começa na primeira semana planejada, não no cadastro. O passo "Dia 15" e a pergunta do FAQ foram ajustados.
  - O cartão de créditos dizia "Voltam a ser 50 no próximo ciclo", errado para o anual. Agora usa o limite real e diz "liberação mensal".
  - "Sem cartão para começar" aparecia na tela de upgrade, que só tem checkout pago.
  - Ditar uma busca também usa 1 crédito, e isso agora está dito.
  - Na demonstração:
    - o contador de marmitas cruzava o cartão em 320 px, e as abas não cabiam lado a lado no celular;
    - o passo de exemplo pedia um timer que o app não mostraria;
    - "as quantidades se ajustam" aparecia quando a receita já rendia o pedido;
    - a quarta já planejada era igual à da semana passada, então o exemplo não provava nada, e o foco do teclado se perdia ao repetir e ao recomeçar.
  - Entre 768 e 1023 px, o cabeçalho quebrava os links em duas linhas. Agora usa o menu.
  - O E2E da demonstração passou a detectar Server Actions, que são POST na própria página.

## Verificação

Rodada no worktree em 17/10/2026, depois das correções do review:

- `turbo typecheck` em Cozya, Admin, Agenda, Edi, site, Missão Saber, `@informach/ui` e `@informach/db`: 8 de 8.
- `pnpm --filter @informach/cozya test`: 21 arquivos, 111 testes. Inclui as regras de ingredientes com a semana real (16 itens mais a despensa), o arredondamento do que se compra inteiro, o timer com horas e minutos, e o texto da lista.
- `pnpm --filter @informach/cozya test:integration` em banco descartável, com a migração regenerada: 24 de 24. Inclui a despensa que continua faltando e o histórico que sobrevive a um novo preparo.
- Agenda (`vitest`, consumidora do `Progress`): 53 arquivos aprovados.
- E2E contra `next dev` local: 8 de 8.
  - `kitchen.spec.ts` foi reescrito para o fluxo novo: primeira semana, receita escrita e editada, semana com marmitas e refeição sem receita, lista nas duas fases com recarga, lista desatualizada, modo cozinha com timer e recarga, "Como foi?", tema escuro, adaptação com IA simulada, repetir semana, exportação e limpeza.
  - `marketing.spec.ts` cobre a demonstração nova, larguras de 320 a 1440 px e a página sem JavaScript.
- Biome nos 96 arquivos alterados: sem achados.
- `next build` com o ambiente de build do CI: aprovado.
- Capturas de todas as telas do app e da landing em 390 e 1280 px, comparadas com o canvas; sem erros de página.

Uma rodada dos unitários, às 18:25, teve 2 falhas em 1 arquivo, minutos antes de a máquina cair por falta de memória. O arquivo é `src/lib/audit-wiring.test.ts`, o único com dois testes que reimportam do zero o módulo de autenticação inteiro (`vi.resetModules()` e `import("./auth")`). Cada um leva cerca de 0,5 s numa máquina normal e passou dos 5 s do Vitest com a máquina sem memória. O arquivo não mudou nesta entrega. Depois da queda, já com Bastidores e Cozya rebaseados sobre a `main`, a suíte passou seis vezes seguidas com 111 de 111, e a integração passou 24 de 24 num banco novo com a cadeia inteira de migrações até a `0074`.

O build e os testes locais não equivalem a deploy nem a teste com famílias reais.

## Fora desta entrega e pendências

- "Quem faz": texto e foto da Helena e do Júlio.
- Mostrar as telas a cinco casas antes de medir o funil, como o canvas propõe. As métricas novas já estão no job `cozya-metrics`: casas que abrem o Hoje em três dias, quem manda a lista e quem responde "Como foi?".
- Foto do prato em "Como foi?": o monorepo não tem armazenamento de arquivos.
- Termos e Privacidade do Cozya ficaram com o trabalho não commitado da outra sessão no checkout principal.
- Commit, PR, migração em produção e deploy dependem de pedido da titular.
