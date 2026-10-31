# Bora Treinar: guia do app

Leia antes o `AGENTS.md` da raiz, o [README](README.md) (como rodar e verificar) e o [PRODUCAO.md](PRODUCAO.md) (o que falta para publicar). Este guia guarda as regras do produto e as decisões que não aparecem só lendo o código.

## Produto

Calistenia guiada para a família, portada do EdiBody (PWA local em Vite). A aparência é a do EdiBody: `src/app/globals.css` é o CSS original, sem mudanças. Telas novas usam as mesmas classes e o que faltar entra em `src/app/bora.css`. Não há Tailwind nem `@informach/ui` neste app, de propósito.

- **Conta do titular, perfis só de apelido e cor.** Nada de data de nascimento, peso, altura, foto ou dado de saúde.
- **Plano gratuito:** 1 perfil, o "Primeiro treino" (`FREE_WORKOUT_IDS`), a biblioteca com o instrutor 3D e a prática de cada exercício contando à mão.
- **Assinatura:** os demais treinos, câmera, celular pareado, níveis, editor, desafios e histórico completo. Individual (1 perfil) ou Família (4).
- A política fica toda em `features/acesso/policy.ts`. Telas e servidor consultam as mesmas funções. O servidor recusa salvar um treino ou modo que o plano não libera, mesmo que a tela tenha deixado passar.

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
- Exercícios alternados (`alternating`) trocam de lado pelo `cycle` do `PoseState`.
- Em desenvolvimento, `/dev/poses?ex=<id>&d=<0..1>` mostra o instrutor parado numa profundidade, para conferir poses. Em produção essa rota é 404.
- **Trilhas:** o nível do perfil é um índice em `CHAINS[].levels`. Inserir um nível no meio muda o exercício de quem já está na trilha. Prefira acrescentar no fim ou faça migração de dados. O import do EdiBody converte níveis pelo exercício (`EDIBODY_CHAINS`).

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
