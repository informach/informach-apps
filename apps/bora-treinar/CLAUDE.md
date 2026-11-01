# Bora Treinar: guia do app

Leia antes o `AGENTS.md` da raiz, o [README](README.md) (como rodar e verificar) e o [PRODUCAO.md](PRODUCAO.md) (o que falta para publicar). Este guia guarda as regras do produto e as decisões que não aparecem só lendo o código.

## Produto

Calistenia guiada para a família. A aparência das telas de treino está em `src/app/globals.css`; telas novas usam as mesmas classes e o que faltar entra em `src/app/bora.css`. Não há Tailwind nem `@informach/ui` neste app, de propósito.

O player tem três arranjos no mesmo componente, escolhidos só por CSS: TV e computador (instrutor e contador lado a lado), celular deitado (o mesmo, compacto) e celular em pé (`@media (orientation: portrait)`, desenho "Player — Mobile"). Em pé, o cabeçalho mostra o passo embaixo do nome e a barra de progresso em largura total, sem o botão de tela cheia; o contador põe o número à esquerda e a série à direita; e, com câmera ou celular pareado, as parciais da série viram um card no lugar de "Repetições no treino".

- **Conta do titular, perfis só de apelido e cor.** Nada de data de nascimento, peso, altura, foto ou dado de saúde.
- **Plano gratuito:** 1 perfil, o "Primeiro treino" (`FREE_WORKOUT_IDS`), a biblioteca com o instrutor 3D e a prática de cada exercício contando à mão.
- **Assinatura:** os demais treinos, câmera, celular pareado, níveis, editor, desafios e histórico completo. Individual (1 perfil) ou Família (4).
- A política fica toda em `features/acesso/policy.ts`. Telas e servidor consultam as mesmas funções. O servidor recusa salvar um treino ou modo que o plano não libera, mesmo que a tela tenha deixado passar.

**Música de fundo** (`engine/musica.ts`): sintetizada no aparelho pelo Web Audio, sem arquivo de áudio nem licença de terceiros, e funciona offline. Banda inteira na série, fundo calmo sem bateria no descanso; para na pausa, no fim e no diálogo de sair, abaixa enquanto a voz fala e silencia com a aba em segundo plano. Tem botão próprio no player (`music` nos ajustes do aparelho) e só toca com o som ligado. O padrão musical é uma função pura testada (`test/musica.test.ts`); se trocar por faixas gravadas, confira a licença de uso comercial e o cache offline do `sw.js`.

## Câmera e privacidade

- A contagem roda no aparelho (`features/treino/vision`, `engine/counter.ts`). Nenhum quadro de vídeo vai ao servidor, nem no pareamento.
- No pareamento, o celular manda só eventos (`features/pareamento/protocolo.ts`).
- O código de pareamento vale 10 minutos e é de uso único. A credencial do celular é um HMAC do `BETTER_AUTH_SECRET` preso ao código e vale 3 horas.
- Em produção o barramento é o Redis (pub/sub). Sem Redis, só fora de produção, ele roda em memória.
- WASM e modelo do MediaPipe são servidos pela própria origem (`scripts/fetch-assets.mjs`, modelo conferido por SHA-256). Daí `'wasm-unsafe-eval'` na CSP e `camera=(self)` na Permissions-Policy. Não troque por CDN.

## Exercícios, poses e contagem

Cada exercício (`catalog/catalog.ts`) tem uma pose procedural (`body/poses.ts`) e uma regra de contagem (ângulo ou inclinação com histerese).

- **Os testes provam que a regra conta o movimento do próprio instrutor.** `test/counter.test.ts` exige 10 de 10 com ruído, parcial com amplitude incompleta, e isometria reconhecida na pose e recusada em pé. Exercício novo precisa passar nesses testes sem afrouxar os limiares.
- Para calibrar, meça o ângulo da pose em profundidade 0 e 1 e deixe pelo menos 5° de folga para `rest` e `peak`.
- **Folga para gente de verdade.** `peak` é calibrado no instrutor, que vai sempre até o fim. A câmera mede o corpo real com erro de alguns graus, então a repetição conta a partir de `full` (padrão 85%) do caminho até `peak`. Abaixo disso e acima de `partial` (45%) vira parcial ("Quase!"). Os testes fixam os dois lados: 93% conta, 75% é parcial.
  - A profundidade sai do valor bruto (mediana de 3 quadros), não do filtrado, que atrasa e achata o fundo.
  - Durante o movimento a visibilidade mínima cai de 0,5 para 0,3, porque no fundo da flexão ou do agachamento o detector baixa a confiança de cotovelo, punho e joelho.
  - A barra de acompanhamento e o instrutor que segue a pessoa chegam ao fundo no ponto em que a repetição já conta.
- O modelo é o `pose_landmarker_full` (≈9 MB), mais preciso que o lite, principalmente na profundidade (eixo z), de que dependem os agachamentos vistos de frente. Ao trocar o modelo, mude também o nome do cache `DETECTOR` em `public/sw.js`.
- Exercícios alternados (`alternating`) trocam de lado pelo `cycle` do `PoseState`.
- Em desenvolvimento, `/dev/poses?ex=<id>&d=<0..1>` mostra o instrutor parado numa profundidade, para conferir poses. Em produção essa rota é 404.
- **Playground** (`pnpm playground:bora-treinar`, `/dev/playground`, 404 em produção): laboratório de calibração da câmera e o player sem conta nem banco (`features/playground`). O player recebe `onFinish` para entregar o treino em vez de salvar; só o playground usa. Para recalibrar um exercício com gente de verdade, meça no laboratório e leve a regra copiada ao catálogo, sem quebrar os testes do instrutor.
- **Trilhas:** o nível do perfil é um índice em `CHAINS[].levels`. Inserir um nível no meio muda o exercício de quem já está na trilha. Prefira acrescentar no fim ou faça migração de dados.

## Dados

- O schema é `bora_treinar` (`packages/db/src/schema/bora-treinar.ts`). Tudo cai em cascata com `core.users`: a exclusão da conta não precisa de limpeza em outro app.
- Sessões têm o id gerado no aparelho, para que a fila offline (`features/sessoes/fila.ts`, IndexedDB) reenvie sem duplicar.
- O nome do treino é decidido no servidor a partir da referência (`catalogo:`, `meu:`, `pratica:`).
- Sugestões de avanço não ficam guardadas: elas derivam de `chain_progress` (`pendingSuggestions`). Aceitar reconfere no servidor.
- **Datas** ("hoje", "semana", "sequência") seguem o fuso da família (`lib/datas.ts`), nunca o UTC do servidor.

## E-mails e rotinas

- `bora.reminder` e `bora.weekly-summary` são montados no app (`features/lembretes`) e não têm o corpo persistido.
- Ligar ou desligar em Conta grava também o descadastro (`setPreferences`). Sem isso, um descadastro feito pelo link do e-mail bloquearia para sempre.
- A rotina `/api/jobs/lembretes` roda de hora em hora e é idempotente pela chave da mensagem (família + dia, família + semana).
- `/api/jobs/billing` roda a cada 5 minutos, como no Missão Saber.

## Camadas

- Ações (`actions.ts`) chamam serviços.
- Serviços (`service.ts`) não importam Next, React nem o banco: persistência e transações (`inTransaction`) ficam em `repository.ts`.
- Contexto de requisição (cookie do perfil, sessão) fica em `features/familia/view.ts`.
- O Biome da raiz verifica essas fronteiras.
