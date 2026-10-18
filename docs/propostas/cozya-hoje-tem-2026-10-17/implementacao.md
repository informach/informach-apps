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
| Seção "Quem faz" | Decisão da titular em 17/10/2026, na conferência contra o canvas: entra com a mesma foto e o mesmo texto já publicados no site da Informach, adaptados só para nomear o Cozya, e o direct do Instagram. |

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
8. planos: um cartão do Pro com a troca entre mensal e anual, e o Free ao lado;
9. quem faz (desde a conferência contra o canvas);
10. perguntas;
11. convite final.

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

## Conferência contra o canvas

Em 17/10/2026, com o PR #10 aberto, a titular pediu para abrir o canvas e conferir se tudo o que ele propõe estava implementado, sem deixar pendência, e depois que cada tela ficasse visualmente igual à prancha. As 17 pranchas foram lidas de novo, item por item. Cada tela do app e da página de vendas foi capturada em 390 e 1280 px com a casa da prancha (três pessoas, nove receitas, semana com marmitas, lista montada pelo próprio app e a nota da última vez) e comparada com o HTML da prancha: ordem dos blocos, tamanhos, pesos, cores, raios, ícones, imagens e copy.

Estado: **já estava** (implementado na primeira entrega), **feito** (implementado nesta conferência) ou **diferença mantida**, com o motivo.

### Pranchas de direção, diagnóstico, copy e produto

| Item do canvas | Onde | Estado |
| --- | --- | --- |
| Cores: papel, tinta, laranja só no que se toca, terracota, sálvia com check, pêssego da marmita, bancada, noite | `app/globals.css` | Já estava. Feito: token `ink-soft` (#2E4556), o texto corrido de apoio das pranchas, mais escuro que o cinza dos rótulos. |
| Plus Jakarta Sans e títulos com −0,03em | `globals.css` (`tracking-display`), `marketing.css` | Já estava. |
| Assinatura "Hoje tem" em letra grande | `app/(app)/hoje/page.tsx` | Já estava. |
| Selo da marmita, pêssego com o pote | `components/brand/lunchbox-icon.tsx`, Hoje, semana, modo cozinha | Já estava. |
| Capa de receita: a primeira palavra sobre uma cor e, quando houver, a foto do prato | `features/recipes/components/recipe-cover.tsx`, `features/recipes/photos.ts` | Feito: a capa mostra a foto do prato quando o Cozya tem uma, nas receitas da coleção ("Macarrão com tomate e grão-de-bico" com `jantar.webp`, "Arroz com lentilha e cenoura" com `marmitas.webp`, as mesmas fotos da página de vendas e da prancha), no cartão, na primeira semana e na página da receita. No review da noite, a foto do arroz saiu: ela mostra legumes assados que a receita não tem (ver "Review de 17/10 à noite"). A foto de uma receita da casa depende de armazenamento de arquivos (ver pendências). |
| Quatro abas embaixo no celular, abas ao lado do logo no computador | `components/app-shell/app-navigation.tsx`, `app-header.tsx` | Já estava. Feito: no computador as abas são só texto, como na prancha, e o cabeçalho usa o mesmo contêiner de 1200 px do Hoje, da semana e das receitas, alinhando logo e conteúdo (diagnóstico 12). A barra de baixo tem 76 px. |
| Voz: verbo de cozinha, números de mercado, custo antes do toque, sem promessa, "pra" só em fala, sem travessão | copy do app e da página | Já estava. Feito: a busca por voz ainda dizia "acervo" e "conheça o Pro". |
| Diagnóstico 1 a 14 e os defeitos achados no caminho | "Defeitos corrigidos" acima | Já estava, menos três. Feito: a busca por voz trancada levava aos planos e agora oferece começar os 14 dias ("Ativar e continuar"); o computador mostrava um celular esticado e agora tem a grade da semana e o contêiner alinhado; a página não tinha quem faz. |
| Copy, página de vendas | `components/marketing/sections/*` | Já estava. Feito: "Mandar receita pelo WhatsApp" no Free e "Nada é apagado, nem as receitas acima de 15." no FAQ. Diferença mantida: "14 dias com tudo" e "Dia 15" viraram "14 dias para planejar" e "Depois de 14 dias" na revisão geral, porque o teste tem 3 créditos e o limite de 15 receitas e começa na primeira semana planejada. |
| Copy, entrada e cabeçalho | cadastro, etapas, boas-vindas, chip do teste | Já estava. Feito: o chip "Teste: N dias" conta dias de calendário em São Paulo, como o Hoje, e diz "Teste: último dia" no fim. |
| Copy, Hoje, semana e mercado | Hoje, semana, compras | Já estava. Diferença mantida: o resumo da semana diz "1 sem receita", não "1 livre", porque "refeição livre" está na lista do que sai. |
| Copy, cozinha e receitas | modo cozinha, "Como foi?", receitas, trazer | Já estava. |
| Copy, planos e conta | `/upgrade`, cobrança | Feito: créditos "N de 50 este mês" no lugar de "N / 50". Diferença mantida: "Voltam a ser 50 na próxima liberação mensal", sem data, porque a data só valeria para o mensal (revisão geral). |
| Fases 1 a 5 e o critério de pronto de cada uma | registro acima | Já estava. Feito: a primeira semana chega à lista sem passar por Receitas, em três passos (fase 2). |
| Métricas: Hoje aberto, lista no mercado e WhatsApp, três jantares, volta na semana 4, pagamento | `api/jobs/cozya-metrics`, `features/kitchen/metrics.ts` | Já estava. |
| Sete decisões | "Decisões aplicadas" | Todas decididas pela titular. |
| "Antes da fase 3": mostrar Hoje, Semana e a lista a cinco casas reais | não é código | Passo de produto da titular, fora da implementação. |
| "Fica de fora": app nativo, sem internet, alarme com o app fechado, conta compartilhada, nutrição, despensa automática, vídeo ou link, preço | nada disso foi feito | Respeitado. |

### Página de vendas

| Item do canvas | Onde | Estado |
| --- | --- | --- |
| Cabeçalho: logo, quatro links, "Entrar" e "Começar grátis" | `site-header.tsx` | Já estava. Feito: "Entrar" sem ícone e com peso 700, como na prancha. |
| Herói: "O que tem pra janta? Já está decidido.", foto do jantar e o celular com o Hoje | `sections/hero.tsx` | Já estava. Feito: "Ver uma semana de exemplo" sem ícone. |
| A semana em quatro momentos | `sections/week-story.tsx` | Já estava. Feito: o passo 3 usa o texto do modo cozinha da prancha ("junte o champignon, o ketchup e a mostarda e cozinhe por 10 minutos"), que também justifica o "Marcar 10 minutos". |
| Demonstração em três etapas | `sections/kitchen-demo.tsx` | Já estava. |
| Caderno da vó, marmita, mercado com WhatsApp, repetir a semana | `recipe-collection.tsx`, `meal-prep.tsx`, `market.tsx`, `repeat-week.tsx` | Já estava. Diferença mantida: repetir a semana é uma demonstração que se pode tocar, não um cartão parado. |
| Planos: um cartão do Pro com "Mensal" e "Anual · economize 17%", "R$ 149 por ano", a nota do equivalente mensal, a lista e o botão; o Free do mesmo tamanho ao lado | `sections/pricing.tsx`, `marketing.css` | Feito. A troca é um par de rádios nativos com `:has()`: o anual aparece primeiro e o mensal fica a um toque, também sem JavaScript. Preço inteiro sem ",00" (`WHOLE_PRICES` em `plans-content.ts`). |
| Quem faz: foto, título, texto e o direct do Instagram, entre os planos e as perguntas | `sections/founders.tsx`, `public/marketing/helena-julio.webp` | Feito, com a decisão da titular: a mesma foto e o mesmo texto do site da Informach, adaptados só para nomear o Cozya ("o Núcleo de Aprendizagem por trás do Cozya"; "O Cozya segue o mesmo critério dos nossos outros produtos: só sai daqui o que a gente usaria em casa."), e o título "Uma família que faz tecnologia para outras famílias.". Diferença mantida: a foto é quadrada, com até 360 px, no lugar do retângulo 4:3 da prancha, porque o arquivo publicado tem 360 × 360 e esticá-lo deixaria a foto borrada. |
| Perguntas e convite final | `faq.tsx`, `final-cta.tsx` | Já estava. Feito: o parágrafo extra do convite final saiu, como na prancha. |
| Rodapé com CNPJ e "Fale com a gente" | `site-footer.tsx` | Já estava. |

### Telas do app

| Prancha | Onde | Estado |
| --- | --- | --- |
| Hoje tem | `app/(app)/hoje/page.tsx`, `features/kitchen/today.ts` | Já estava: data, "Hoje tem · Jantar", tags, nota da última vez, cozinhar, Trocar e Já cozinhei, o que falta, amanhã, semana e lista. Feito: "Tudo em casa para o jantar de hoje." depois do "Já tenho"; a marmita de amanhã com "pronta hoje"; a frase da semana "Sexta é pedir comida. Domingo ainda está em aberto. Planejar domingo", com a bolinha em bancada para o dia sem receita; o resumo da lista "16 de 17 em casa · falta creme de leite". |
| Hoje à noite (tema escuro) | Hoje | Já estava: "Hoje teve", horário, como foi e a marmita de amanhã. Feito: o prato vira o título da página quando não há próxima refeição. Diferença mantida: "Tudo em casa: 8 ovos e 2 abobrinhas" ficou "Tudo em casa para o jantar de amanhã.", porque o nome do item da lista não flexiona com a quantidade ("2 abobrinha pequena"). |
| Primeiro acesso | `features/kitchen/components/first-week.tsx`, `first-week-steps.tsx` | Já estava. Feito: "Passo 1 de 3" ao lado das boas-vindas; botão "Escolha mais duas" em bancada; "Colocar nos dias" leva à semana com "Passo 2 de 3" e o botão da lista, e a lista abre com "Passo 3 de 3" (`?primeira=1`); a foto do prato nas capas da coleção. Diferença mantida: a nota diz "Confira antes de cozinhar", não "Você confere antes de guardar", porque a receita da coleção é guardada ao ir para os dias, sem tela de conferência. |
| Semana | `features/kitchen/components/week-planner.tsx`, `week-navigation.tsx` | Já estava. Feito: dia vazio com um só botão "Planejar domingo"; contagem de itens no botão da lista; rótulo das refeições com 56 px, que não encosta no nome. Diferença mantida: num dia que já tem uma refeição, o celular mostra "+ Almoço" ou "+ Jantar", único jeito de pôr a outra refeição pelo telefone. |
| Escolher a refeição | `week-planner.tsx`, `features/kitchen/recipe-choices.ts` | Já estava: dia e refeição, receita ou sem receita, mesa, marmitas e a conta. Feito: folha que sobe de baixo no celular, com puxador e "Fechar" de 44 px; busca por nome ou ingrediente; "Favoritas e faz tempo", com favoritas primeiro e depois o que não se faz há mais tempo; "Sem receita, a refeição não entra na lista do mercado." abaixo das fichas; mesa, marmitas e o botão num rodapé só. |
| Lista do mercado em duas fases | `app/(app)/compras/page.tsx`, `shopping-list.tsx` | Já estava. Feito: o cabeçalho da prancha ("Lista do mercado", "17 itens para 5 refeições · 12 a 18 de outubro" e o WhatsApp num botão de ícone), sem as setas de semana, que a prancha não tem (as outras semanas abrem pela Semana); os estados literais ("3 itens já estão em casa", "3 de 14 no carrinho · mais 1 da despensa · 3 já em casa"). "Imprimir a lista" foi para o fim. Diferença mantida: no mercado, o que falta da despensa vira linha que se marca como pega, no lugar das fichas, porque a ficha só diz "falta". |
| Modo cozinha | `cooking-mode.tsx` | Já estava. Feito: passo em 29 px e peso 600, Voltar transparente com borda, botões com 18 px de raio. "Tela ligada" aparece quando o navegador deixa. |
| Como foi? | `cooking-mode.tsx`, `app/(cook)/receitas/[id]/cozinhar/page.tsx` | Já estava. Feito: "Strogonoff de frango, sábado à noite. A marmita de domingo está contada: 1 porção separada." (o Hoje manda `?refeicao=jantar`), as três dicas literais e a nota anterior sem ponto duplo. Sem foto do prato: a prancha não tem esse campo (ver pendências). |
| Suas receitas | `recipe-card.tsx`, `recipes-section.tsx` | Já estava. Feito: o cartão mostra só o nome e "35 min · rende 4"; "feita há…" foi para a página da receita; foto nas receitas da coleção. |
| Trazer uma receita | `new-recipe-method-dialog.tsx`, `recipe-form-dialog.tsx` | Já estava: as cinco formas com o custo, a nota dos créditos e "Retomar…". Feito: folha com "Fechar" de 44 px; na conferência da IA o rendimento é obrigatório ("Responda o rendimento para guardar", com "Outro"), o botão diz "Guardar receita" e o rodapé "1 crédito usado. Organizada com IA: confira as medidas com a foto.". Diferença mantida: a conferência continua no formulário que se edita, porque o que a IA trouxe precisa poder ser corrigido antes de guardar; os créditos dizem "Você tem N créditos de IA", sem "de 50 este mês", porque o saldo soma os pacotes extras. |
| Fim do teste, Pro na hora certa | `app/(app)/upgrade/page.tsx`, `features/billing/components/pro-offer.tsx` | Feito: "Agora não", os quatro números, o cartão do Pro com "Mensal" e "Anual · 17% a menos", "R$ 149 por ano", "Equivale a R$ 12,42 por mês. Os 50 créditos chegam todo mês, também no anual." e "Se não assinar, no dia 1º a conta fica no Free:". O `/choose-plan` do cadastro continua com o `PlanCards`. |
| Semana no computador | `week-planner.tsx`, `app/(app)/semana/page.tsx` | Feito: grade de sete colunas com células de 112 px, rótulo, nome e "3 + 1 marmita"; cabeçalho com o resumo da semana e, à direita, "Repetir a semana passada" e "Montar a lista do mercado" com a contagem; painéis "Para escolher o domingo" (uma que faz tempo, uma que nunca fez e uma favorita, que abrem a escolha já marcada) e "Lista do mercado" com a despensa. |

### Verificação desta conferência

- `pnpm --filter @informach/cozya typecheck`: aprovado.
- Biome nos arquivos tocados: sem achados (os três avisos do app são de arquivos que esta entrega não tocou).
- `pnpm --filter @informach/cozya test`: 23 arquivos, 117 testes. Novos: sugestões e ordem da escolha da refeição (`recipe-choices.test.ts`) e a foto da capa (`photos.test.ts`).
- `pnpm --filter @informach/cozya test:integration` em banco descartável: 24 de 24.
- E2E contra `next dev` local: `marketing.spec.ts` e `kitchen.spec.ts`, 6 de 6 com o aquecimento; os dois de entrada, 3 de 3. Cobrem a oferta sem JavaScript (anual primeiro, mensal pelo rádio), o "Quem faz", a primeira semana nos três passos e o dia vazio da semana no celular.
- 37 capturas em 390 e 1280 px (26 telas e 11 recortes da página de vendas), comparadas com as pranchas, sem erros de página.

## Review de 17/10 à noite

Com o PR #10 em produção, a titular pediu um review completo do Cozya "Hoje tem", a correção do que fosse confirmado e o deploy. Cada achado foi conferido no código antes de mexer. Branch `fix/cozya-review`, criada de `origin/main` em `189d998`, no mesmo worktree, sem migração nova.

### Achados médios

1. **"Tudo em casa" para receita que não está na lista.** O Hoje procurava as chaves da receita na lista e dizia "tudo em casa" quando nada do que achava estava por comprar, sem conferir se a receita inteira estava lá nem se a lista estava em dia. Uma receita colocada na semana depois da lista, com só o sal em comum, recebia "tudo em casa". Agora `checkMealOnList` (`features/kitchen/meal-shopping.ts`) usa as mesmas linhas que a lista monta (`mealShoppingKeys`) e só responde "complete" com a lista em dia, todas as linhas da receita nela e nenhuma por comprar. Fora disso, o Hoje diz a verdade:
   - receita que não está toda na lista: "A lista do mercado ainda não tem tudo para o jantar de hoje.";
   - semana que mudou depois da lista: "A semana mudou depois que a lista foi montada. Confira as quantidades para o jantar de hoje.";
   - nos dois casos, "Atualizar a lista" leva à lista da semana daquela refeição, para quem pode planejar.

   O "Abrir a lista" do aviso do que falta também passou a abrir a semana da refeição: depois do jantar de domingo, a da semana seguinte, de onde os itens vêm.
2. **Teste aparecendo para quem já é Pro.** O chip "Teste: N dias" (link para `/upgrade` nos três últimos dias) e o aviso "Seu teste termina…" só olhavam se o teste estava ativo. `trialDaysLeft` e `trialEnded` (`features/kitchen/trial.ts`) devolvem nada para o Pro, como a prancha de copy pede ("nada (no Pro)"); o cabeçalho e o Hoje usam as duas.
3. **Foto que não é o prato.** `marmitas.webp` mostra legumes assados (brócolis, pimentão, abobrinha, cebola roxa) que o "Arroz com lentilha e cenoura" não leva: a associação saiu. `jantar.webp` foi conferida e é macarrão com tomate e grão-de-bico, com folhas de manjericão por cima como enfeite; ficou. O comentário que falava em "editorial shoot" agora diz que as fotos são imagens geradas por IA para a página de vendas, com o registro de origem.
4. **Marmita do almoço que nunca aparecia.** Decisão: a promessa do editor vale. O canvas tem almoço com marmitas (o feijão da vó de sábado, "3 + 3"), o roteiro diz "O almoço de amanhã mostra a marmita de hoje", e o `CLAUDE.md` falava só do jantar por ser o caso comum, sem proibir o almoço. `lunchboxesFor` (`features/kitchen/lunchbox.ts`) deriva as marmitas do almoço e do jantar do dia anterior, sem gravar refeição, e é a mesma regra no Hoje e na Semana (que, na segunda, lê o domingo anterior inteiro). Um almoço planejado não esconde mais a marmita: os dois aparecem.
5. **Primeira semana começada no sábado ou no domingo.** A lista vai de segunda a domingo. Cobrir dois pedaços de semana numa lista só pediria uma coluna nova na lista (migração) e uma regra para a segunda não entrar em duas listas. Sem migração, os jantares agora cabem numa lista: começam hoje quando cabem até domingo e, quando não cabem (sábado, domingo, ou quatro a partir de sexta), vão para a segunda seguinte, a semana que a casa vai comprar (`firstWeekDays` em `features/kitchen/first-week-days.ts`). A ação devolve a semana, e os passos 2 e 3 abrem essa semana e a lista dela; o aviso diz "a partir de hoje" ou "a partir de segunda". Consequência aceita: no fim de semana, o Hoje fica sem refeição para hoje até a pessoa escolher uma.
6. **"Seu teste terminou" para quem não acabou de sair do teste.** `trialRecap` mostra o resumo durante o teste e até `TRIAL_RECAP_DAYS` (7) dias depois dele, só para quem nunca assinou (`hasEverSubscribed` lê o histórico de assinaturas; checkout que nunca foi pago não conta). Quem assinou e cancelou, ou volta meses depois, vê a oferta sem o resumo. `getTrialSummary` conta só a janela do teste: refeições dos dias do teste, e listas, receitas e preparos entre o começo e o fim.
7. **Singular e plural em duas linhas.** A chave da lista passou a ser o nome no singular (`keyName` em `ingredients.ts`): "1 cebola picada" e "2 cebolas" somam numa linha, como a página promete. A regra cuida de "-ês" ("pão francês" e "pães franceses"), "-ões" e "-ães" escritos sem acento, "-éis" e "-ais"; o nome na lista continua como a receita escreve. Linhas gravadas antes da regra ("cebolas:un") são lidas por `canonicalShoppingKey`: a lista não vira "desatualizada" só por isso e, ao atualizar, o que estava marcado continua marcado.

### Achados baixos

- "Ralado" deixou de apagar o produto: "queijo ralado", "pão ralado" e "coco ralado" ficam com o nome inteiro (`SOLD_GRATED`); cenoura, abobrinha e gengibre continuam com o ralado como preparo.
- Os números da copy vêm de onde a regra mora: `TRIAL_DAYS`, `TRIAL_CREDITS`, `FREE_RECIPE_LIMIT` e `PRO_MONTHLY_CREDITS`, lido do `bonusCreditsPerMonth` do catálogo (o `plans-content.ts` recusa mensal e anual com números diferentes). Além dos lugares do review, entraram os que repetiam os mesmos números: escolha do plano no cadastro, primeira semana, semana, "Trazer uma receita", busca por voz, adaptar com IA, convite final e descrição da página. Termos e Privacidade continuam literais, por serem texto jurídico datado.
- `/upgrade`: "no dia {fim + 1} a conta fica no Free" virou o próprio dia do fim, porque o teste acaba nesse dia, na hora em que começou.
- "Depois", à noite, não aparece mais vazio: a seção some quando amanhã só tem o jantar já mostrado em "Amanhã tem".
- FAQ: o teste começa na primeira receita colocada na semana ou na primeira ajuda da IA, o que vier antes.
- "Pronto: 0 jantares" ao repetir o envio virou "Sua primeira semana já estava montada.", e a tela abre a semana já montada.
- Ao escalar, "2,5 pães francês" virou "2,5 pães franceses", e "brócolis" não vira mais "brócoli".

### Riscos conhecidos, fora desta rodada

- Teste para ex-assinante: quem assinou, cancelou e nunca começou o teste ainda ganha os 14 dias ao colocar uma receita na semana.
- Veredito antigo no "Hoje teve": a linha mostra o "Como foi?" guardado na receita, que antes da resposta de hoje é o da vez anterior.
- `?etapa=fim` reaberto pelo histórico do navegador registra o preparo de novo.
- Receita sem rendimento no "o que falta": com a correção 1, o Hoje passou a achar na lista as linhas "Conferir" dessas receitas (há teste para isso), mas o aviso mostra a linha original, sem dizer que a quantidade é para conferir. O texto não foi revisto.
- O histórico que o `UPDATE` da `0074` não recupera: receitas cujo `cooked_at` foi apagado por um preparo começado em outro dia, antes da migração, ficaram sem `last_cooked_at`, e não há de onde tirar a data.

### Verificação do review

- `pnpm --filter @informach/cozya typecheck`: aprovado.
- Biome no app: sem erros; os 4 avisos são de arquivos que esta rodada não tocou.
- `pnpm --filter @informach/cozya test`: 27 arquivos, 147 testes. Novos: `trial.test.ts` (teste com o Pro, resumo do fim do teste), `meal-shopping.test.ts` ("tudo em casa" só com a receita inteira numa lista em dia), `lunchbox.test.ts` (marmita do almoço e do jantar), `first-week-days.test.ts` (sábado, domingo e sexta com quatro), e em `ingredients.test.ts` singular e plural, ralado, chave antiga e "pães franceses"; em `photos.test.ts`, a foto que mostra outro prato.
- `pnpm --filter @informach/cozya test:integration` em banco descartável: 25 de 25. Novo: o Hoje com banco real, do "falta" ao "tudo em casa", a receita que entra depois da lista, a lista desatualizada e a marmita do almoço no dia seguinte; o resumo do teste passou a ter limite final. Uma primeira rodada, antes do teste novo, caiu com o worker do Vitest encerrado pelo Windows (código 3221226505) em `maintenance.integration.ts`, arquivo que esta rodada não tocou; repetida em seguida, passou 24 de 24.
- E2E e build ficam para o CI: a máquina estava com outro app rodando. `kitchen.spec.ts` foi ajustado para a primeira semana abrir `/semana?week=…&primeira=1` e, no sábado e no domingo, esperar o Hoje sem refeição para hoje.

## Fora desta entrega e pendências

- "Quem faz": resolvido na conferência contra o canvas.
- Mostrar as telas a cinco casas antes de medir o funil, como o canvas propõe: passo de produto da titular, não de implementação. As métricas novas já estão no job `cozya-metrics`: casas que abrem o Hoje em três dias, quem manda a lista e quem responde "Como foi?".
- Foto do prato de uma receita da casa: a capa já mostra a foto quando o Cozya tem uma (as receitas da coleção). A foto tirada ou enviada pela própria casa precisa de armazenamento de arquivos, que o monorepo não tem; o canvas deixa isso fora "até existir armazenamento", e a prancha "Como foi?" não tem campo de foto. O que seria preciso está no relatório da conferência, para decisão da titular.
- Termos e Privacidade do Cozya: resolvido, chegaram à `main` com o contato do Instagram (`d39ee83`, `d59c836`).
- Commit, PR, migração em produção e deploy: feitos a pedido da titular. A entrega subiu no PR #10 (`fb39612`) em 17/10/2026; o migrator aplicou a `0074_cozya_hoje_tem` no deploy desse commit, junto com a `0072` e a `0073` do Bastidores, e o `/api/ready` do Cozya respondeu 200 por volta das 22:00 UTC.
