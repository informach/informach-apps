# Bora Treinar: guia do app

Leia antes o `AGENTS.md` da raiz, o [README](README.md) (como rodar e verificar) e o [PRODUCAO.md](PRODUCAO.md) (o que falta para publicar). Este guia guarda as regras do produto e as decisões que não aparecem só lendo o código.

## Produto

Calistenia guiada para a família. A aparência das telas de treino está em `src/app/globals.css`; telas novas usam as mesmas classes e o que faltar entra em `src/app/bora.css`. Não há Tailwind nem `@informach/ui` neste app, de propósito.

**Portão "Pronto?"** (`telas/pronto.tsx`): o treino não começa no primeiro passo. O portão mostra o primeiro exercício e confere, com a câmera, o detector baixado (barra de progresso), a luz, o corpo inteiro na imagem e a posição de partida (`vision/enquadramento.ts`, funções puras testadas); no pareado, o celular manda as mesmas checagens no `sinal`. Com tudo certo por 1 s, começa sozinho com 3-2-1; "Começar" e "Começar sem câmera" ficam à mão. No portão também ficam a voz (aviso de privacidade e o teste "Diga 'um'"), o aquecimento e o alongamento (ajustes do aparelho, ligados por padrão) e, no primeiro treino de cada perfil, os cuidados antes de começar. Não existe mais o "Prepare-se" de 8 s no começo dos passos (`buildSteps`).

O fim do treino pergunta "Como foi?" (fácil, na medida, difícil ou pular) antes de salvar; a resposta vai no próprio envio e funciona offline. "Parar e salvar" (no X do player) grava `ended_early`, sem motivo nem dado de saúde, e não pesa a trilha.

O player tem três arranjos no mesmo componente, escolhidos só por CSS: TV e computador (instrutor e contador lado a lado), celular deitado (o mesmo, compacto) e celular em pé (`@media (orientation: portrait)`, desenho "Player — Mobile"). Em pé, o cabeçalho mostra o passo embaixo do nome e a barra de progresso em largura total, sem o botão de tela cheia; o contador põe o número à esquerda e a série à direita; e, com câmera ou celular pareado, as parciais da série viram um card no lugar de "Repetições no treino".

- **O centro é o treino individual; a família é a mesma assinatura** (decisão do titular em 06/11/2026, "como na Netflix"): cada pessoa da casa tem o seu perfil e treina no próprio ritmo, onde tiver (celular, tablet, computador ou TV). Treinar junto é um modo a mais, não o centro.
- **Conta do titular, perfis com apelido, cor e preferências de treino** (jeito de treinar, tempo, dias por semana). Nada de data de nascimento, peso, altura, foto ou dado de saúde.
- **Plano gratuito:** 1 perfil, o "Primeiro treino" e o "Aquecimento" (`FREE_WORKOUT_IDS`), a biblioteca com o instrutor 3D e a prática de cada exercício contando à mão ou pela voz.
- **Teste de 7 dias, sem cartão** (`features/teste`): tudo liberado e até 4 perfis. Começa sozinho ao criar o primeiro perfil, com o e-mail confirmado; quem já tinha conta no grátis tem "Testar 7 dias grátis" na folha de planos e em Conta. Um por e-mail: `bora_treinar.trial_claims` guarda o HMAC do e-mail e segura o pedido mesmo depois que a conta é apagada. No fim vale o grátis, e os perfis extras ficam guardados e bloqueados, como num downgrade. Os números saem de `teste/regras.ts` (`TRIAL_DAYS`).
- **Assinatura:** os demais treinos, câmera, celular pareado, níveis, editor, desafios e histórico completo. Individual (1 perfil) ou Família (4). Com o pagamento atrasado (`past_due`), tudo continua liberado por 7 dias depois do fim do período (`GRACE_DAYS`); a regra mora no app (`pastDueSubscription`), não em `PRO_STATUSES` do pacote compartilhado.
- A política fica toda em `features/acesso/policy.ts`, e as regras leem `access.unlocked` (assinante ou em teste). `access.subscribed` diz se há assinatura e é o que as telas de cobrança leem. Telas e servidor consultam as mesmas funções. O servidor recusa salvar um treino ou modo que o plano não libera, mesmo que a tela tenha deixado passar.
- **Perfis como na Netflix** (`telas/perfis.tsx`): "Quem vai treinar?" é a porta, com o estado de cada perfil na semana (calculado no servidor). Perfil novo faz o **primeiro acesso** (`/perfis/[id]/comecar`, `features/perfil`): ritmo (→ intensidade e níveis de partida, `niveisIniciais`), tempo por treino e dias por semana; o Início manda para lá quem ainda não fez (`onboarded_at`). "Gerenciar" edita apelido, cor e o jeito de treinar sem mexer nos níveis.
- **Início do perfil:** "Hoje é dia de" sai do recomendador (`engine/recomendar.ts`, puro e testado: alterna o foco do último treino, respeita tempo, intensidade e plano, e diz o porquê), "Outro" leva a Treinos. Depois vêm a semana contra a meta, "Pronta para subir" com aceite ali mesmo (`telas/sugestoes.tsx`), o desafio e os níveis.
- **Navegação:** Início · Treinos · Exercícios · Progresso. `/treinos` junta os prontos e "Meus treinos" (`/meus-treinos` redireciona), com filtros de tempo, foco e "sem pulo". O desafio mora no Progresso e no Início (`features/desafios/cartao.tsx`); `/desafios` configura o da família e mostra o histórico.
- **Desafio da semana** (`features/desafios`): o pessoal se renova sozinho toda segunda (meta cumprida +10%, duas semanas sem cumprir −10%, padrão pela intensidade); o da família é opcional e cooperativo, com a parte de cada um pela intensidade e sem ranking.
- **Treinar junto** (`/junto`, o extra): 2 a 4 perfis liberados e prontos, só treinos de séries (`soSeries`). `buildGroupSteps` intercala as séries em rodízio ("Vez de Ana"), cada um com o seu nível, intensidade e meta; a vez de um é o descanso do outro. O fim pergunta "Como foi?" a cada um e grava um treino por perfil com o mesmo `group_id` numa transação só (`saveGroupSession`, perfis travados em ordem de id); na fila offline o grupo é um item só. O resumo do grupo (`/resumo/grupo/[id]`) mostra cada um, sem placar.
- **Folha de planos** (`features/billing/planos.tsx`): mora no layout das telas logadas e qualquer cadeado a abre com o motivo (`Cadeado`, `usePlanos`). Individual primeiro; o anual aparece pelo valor por mês e pelos meses grátis, calculados do catálogo (`ofertas.ts`). Assinar não pede login recente (o pagamento é no Stripe); o login recente fica para Portal, troca de plano, exportação, limpeza e exclusão. Sair da conta nunca pede.

**Música de fundo** (`engine/musica.ts`): sintetizada no aparelho pelo Web Audio, sem arquivo de áudio nem licença de terceiros, e funciona offline. Banda inteira na série, fundo calmo sem bateria no descanso; para na pausa, no fim e no diálogo de sair, abaixa enquanto a voz fala e silencia com a aba em segundo plano. Tem botão próprio no player (`music` nos ajustes do aparelho) e só toca com o som ligado. O padrão musical é uma função pura testada (`test/musica.test.ts`); se trocar por faixas gravadas, confira a licença de uso comercial e o cache offline do `sw.js`.

## Câmera e privacidade

- A contagem roda no aparelho (`features/treino/vision`, `engine/counter.ts`). Nenhum quadro de vídeo vai ao servidor, nem no pareamento.
- No pareamento, o celular manda só eventos (`features/pareamento/protocolo.ts`).
- **Contagem pela voz** (`engine/voz.ts`, decisão do titular em 02/11/2026, ampliada em 06/11/2026): usa o reconhecimento do navegador, então o áudio vai ao Google (Chrome) ou à Apple (Safari) enquanto o microfone estiver ligado. Por isso a primeira ativação mostra o aviso e pede aceite (`vozAceita` nos ajustes), e a política de privacidade tem a seção "Contagem pela voz". O app não grava nem guarda áudio ou texto. Não trocar por envio de áudio a um servidor próprio nem ligar o microfone sem o aviso.
  - **A permissão:** o cabeçalho é `Permissions-Policy: microphone=(self)`. Até 06/11/2026 era `microphone=()`, que proíbe o microfone na origem inteira: o navegador negava sem perguntar e a voz nunca ligava em produção. O toque em "Ligar o microfone" chama primeiro `pedirMicrofone()` (`getUserMedia`, o pedido que todo navegador mostra) e só depois abre o reconhecimento. Cada falha (`negado`, `servico` = Ditado desligado no iPhone, `sem-rede`, `sem-microfone`, `indisponivel`) tem título e caminho por navegador em `features/treino/permissoes.ts`.
  - **Em qualquer modo:** sozinha no manual (o aviso aparece uma vez ao abrir o treino; depois vale `vozAoIniciar`), e completando a câmera e o celular pareado pelo botão do microfone. `JuntaContagem` evita contar duas vezes: a câmera soma +1, a voz diz o número, e uma repetição da câmera logo depois de a voz se adiantar é a mesma. No pareado, quem ouve é o celular (perto da pessoa); o sinal dele leva `ouvindo` e a TV cala os números.
  - **O que entende:** números por extenso e em algarismo, variações do reconhecedor ("treis", "meia"), "mais um" como +1, e "um/uma" como artigo ("uma vez", "só um") não conta. A contagem só avança, no máximo 3 de uma vez. Com o microfone ligado, a voz do app e a música calam (os bipes continuam). O reconhecimento é reaberto sozinho a cada silêncio, com espera crescente quando encerra seguido.
- **Isometrias** contam os segundos em voz alta (evento `hold-second` do executor), só enquanto a pessoa está na posição, com o mesmo ajuste de contar as repetições.
- O código de pareamento vale 10 minutos e é de uso único. A credencial do celular é um HMAC do `BETTER_AUTH_SECRET` preso ao código e vale 3 horas.
- Em produção o barramento é o Redis (pub/sub). Sem Redis, só fora de produção, ele roda em memória.
- WASM e modelos do MediaPipe são servidos pela própria origem (`scripts/fetch-assets.mjs`, modelos conferidos por SHA-256). O WASM fica em `public/mediapipe/wasm/<versão>/`, com a versão em `vision/assets.ts` (`MEDIAPIPE_VERSION`, conferida contra o pacote instalado por teste; o pacote é fixado na versão exata): o service worker guarda o detector para sempre, e um caminho fixo servia WASM velho com JS novo depois de uma atualização. Daí `'wasm-unsafe-eval'` na CSP e `camera=(self)` na Permissions-Policy. Não troque por CDN.

## Exercícios, poses e contagem

Cada exercício (`catalog/catalog.ts`) tem uma pose procedural (`body/poses.ts`) e uma regra de contagem (ângulo ou inclinação com histerese).

- **Os testes provam que a regra conta o movimento do próprio instrutor.** `test/counter.test.ts` exige 10 de 10 com ruído, parcial com amplitude incompleta, e isometria reconhecida na pose e recusada em pé. Exercício novo precisa passar nesses testes sem afrouxar os limiares.
- Para calibrar, meça o ângulo da pose em profundidade 0 e 1 e deixe pelo menos 5° de folga para `rest` e `peak`.
- **Folga para gente de verdade.** `peak` é calibrado no instrutor, que vai sempre até o fim. A câmera mede o corpo real com erro de alguns graus, então a repetição conta a partir de `full` (padrão 85%) do caminho até `peak`. Abaixo disso e acima de `partial` (45%) vira parcial ("Quase!"). Os testes fixam os dois lados: 93% conta, 75% é parcial.
  - A profundidade sai do valor bruto (mediana de 3 quadros), não do filtrado, que atrasa e achata o fundo.
  - Durante o movimento a visibilidade mínima cai de 0,5 para 0,3, porque no fundo da flexão ou do agachamento o detector baixa a confiança de cotovelo, punho e joelho.
  - A barra de acompanhamento e o instrutor que segue a pessoa chegam ao fundo no ponto em que a repetição já conta.
- O modelo é o `pose_landmarker_full` (≈9 MB), mais preciso que o lite, principalmente na profundidade (eixo z), de que dependem os agachamentos vistos de frente. O `lite` existe como modo reduzido: o portão mede os quadros por segundo e, abaixo de 14 com o completo, troca para o leve e guarda a escolha no aparelho (`modelo` nos ajustes). Ao trocar ou acrescentar modelo, mude também o nome do cache `DETECTOR` em `public/sw.js` e confira o SHA-256 a partir de um download real.
- **Avisos de forma** (`Check`): a métrica `spread` compara a distância horizontal entre os lados de uma parte com a de outra (joelhos contra tornozelos no agachamento, tornozelos contra quadril no polichinelo), e `at: "peak"` confere só o quadro mais fundo da repetição. Os avisos aparecem na tela e são falados no máximo a cada 10 s, na frente do número.
- **Tempo mínimo de repetição:** `minRepMsFor(cadência)` (38% de descida + subida) vai aos três lugares que criam o `RepCounter` (player, celular pareado, laboratório): um pico de 2 quadros não conta. Sem a pessoa por mais de 0,5 s, a repetição pela metade zera; por mais de 3 s numa série, o player sugere a voz.
- **Gravações reais** (`test/gravacoes/`): sequências de pontos exportadas pelo laboratório viram testes de regressão do contador. O formato está no README da pasta.
- **Alongamentos** (regra `timed`): só cronômetro, na volta à calma. Não geram registro de série e ficam fora da prática, dos desafios e das trilhas (`contavel` em `catalog.ts`). Cada lugar que olha `rule.kind` precisa tratar os três tipos.
- **Instrutor 3D:** em aparelho fraco (`aparelhoFraco()`: até 4 núcleos ou até 3 GB) desenha sem sombra e antialias, a 30 fps; parado ou com a aba escondida, para de desenhar.
- Exercícios alternados (`alternating`) trocam de lado pelo `cycle` do `PoseState`.
- Em desenvolvimento, `/dev/poses?ex=<id>&d=<0..1>` mostra o instrutor parado numa profundidade, para conferir poses. Em produção essa rota é 404.
- **Playground** (`pnpm playground:bora-treinar`, `/dev/playground`, 404 em produção): laboratório de calibração da câmera e o player sem conta nem banco (`features/playground`). O player recebe `onFinish` para entregar o treino em vez de salvar; só o playground usa. Para recalibrar um exercício com gente de verdade, meça no laboratório e leve a regra copiada ao catálogo, sem quebrar os testes do instrutor.
- **Trilhas:** o nível do perfil é um índice em `CHAINS[].levels`. Inserir um nível no meio muda o exercício de quem já está na trilha. Prefira acrescentar no fim ou faça migração de dados.

## Dados

- O schema é `bora_treinar` (`packages/db/src/schema/bora-treinar.ts`). Tudo cai em cascata com `core.users`: a exclusão da conta não precisa de limpeza em outro app.
- Sessões têm o id gerado no aparelho, para que a fila offline (`features/sessoes/fila.ts`, IndexedDB) reenvie sem duplicar.
- O nome do treino é decidido no servidor a partir da referência (`catalogo:`, `meu:`, `pratica:`).
- Sugestões de avanço não ficam guardadas: elas derivam de `chain_progress` (`pendingSuggestions`). Aceitar reconfere no servidor.
- **Progressão honesta:** o servidor remonta os passos com `buildSteps(treino, níveis, intensidade do perfil)` e confere cada série contra o planejado: a meta de cada série é a do servidor (a do aparelho é descartada) e série que faltou num exercício começado é meta não batida (exercício pulado inteiro não conta). "Fácil" com a meta batida avança mais rápido; "difícil" e metas não batidas somam `struggle`, e a partir de 3 o app sugere descer (primeiro o bônus, depois o nível).
- **Intensidade do perfil** (`leve`/`normal`/`forte`): "leve" troca o que tem salto por versões sem impacto (`SEM_IMPACTO`) e reduz as metas a 70%; "forte" aumenta 15%.
- **Datas** ("hoje", "semana", "sequência") seguem o fuso da família (`lib/datas.ts`), nunca o UTC do servidor.
- **O que conta como treino e a meta semanal** (`treino/engine/habito.ts`): uma sessão só vale para o hábito, as conquistas, os desafios e a meta se tiver pelo menos 5 repetições (segundos de isometria contam 1 por 1) ou 1 minuto (`contaComoTreino`); um toque em "salvar" fica gravado, mas não vira dia de treino. O hábito é a meta de dias por semana de cada perfil (`profiles.weekly_goal`, 1 a 7, padrão 3; semana de segunda a domingo no fuso da família): `semanaAtual` e `historicoDeSemanas` (semanas seguidas, total). Conquistas de semanas usam a maior sequência do histórico e a meta lida no `lockProfile` do save; o histórico vem somado no banco (`resumosDoPerfil`, `melhoresAnteriores`), nunca sessão por sessão dentro da transação.

## E-mails e rotinas

- `bora.reminder` e `bora.weekly-summary` são montados no app (`features/lembretes`) e não têm o corpo persistido.
- Ligar ou desligar em Conta grava também o descadastro (`setPreferences`). Sem isso, um descadastro feito pelo link do e-mail bloquearia para sempre.
- A rotina `/api/jobs/lembretes` roda de hora em hora e é idempotente pela chave da mensagem (família + dia, família + semana).
- **Lembrete do dia** (`montarLembrete`): lista cada perfil liberado pelo plano que ainda não treinou hoje (só sessão que conta como treino), com a meta da semana ("Helena: 1 de 3 dias nesta semana."). Se todos já treinaram, não sai. O plano gratuito só ouve falar dos treinos gratuitos (`FREE_WORKOUT_IDS`); com a assinatura ou o teste, `SUGESTOES_LIBERADAS`.
- **Resumo de segunda** (`habitoDoPerfil`, `montarResumo`): por perfil, treinos, minutos e repetições da semana que terminou, a meta da semana com as semanas seguidas cumpridas (histórico de até 52 semanas, somado no banco), os recordes da semana (contra as melhores marcas de antes, `melhoresAntesDe`) e os níveis novos esperando aceite (`pendingSuggestions`, só com a assinatura). Sessões que não contam como treino ficam fora, inclusive do desafio.
- `/api/jobs/billing` roda a cada 5 minutos, como no Missão Saber.

## Camadas

- Ações (`actions.ts`) chamam serviços.
- Serviços (`service.ts`) não importam Next, React nem o banco: persistência e transações (`inTransaction`) ficam em `repository.ts`.
- Contexto de requisição (cookie do perfil, sessão) fica em `features/familia/view.ts`.
- O Biome da raiz verifica essas fronteiras.
