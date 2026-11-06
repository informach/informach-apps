# Bora Treinar: registro da implementação

Branch `feat/bora-proposta`, a partir da `main` local com a correção do microfone (`edeba243`). Uma migração aditiva, `0077_bora_proposta`. Merge `--no-ff` na `main` local, **sem push**: cada push na `main` faz deploy em produção, e a publicação fica com o titular. A proposta e as decisões estão no [PROPOSTA.md](PROPOSTA.md).

## O que entrou

**Correção do microfone** (`edeba243`, direto na `main`): `Permissions-Policy` com `microphone=(self)`.

**Fase 0, não perder treino:**

- Executor:
  - criado uma vez por treino;
  - o início real é gravado;
  - `prev`, `extendRest` e o −1 no AMRAP passam a ser corretos.
- O player pausa sozinho quando a aba fica escondida e volta com 3-2-1.
- Câmera negada ou parada tem saída: "Contar à mão" ou "Tentar de novo".
- Pareamento:
  - reentrada pelo cookie;
  - "Gerar outro código";
  - "Celular desconectado".
- Voz:
  - pedido de permissão pelo `getUserMedia`;
  - ajuda por navegador;
  - voz junto da câmera e no celular pareado, sem contar em dobro.
- Fila offline guarda as recusas que podem mudar.
- No servidor:
  - trava de perfil;
  - conquistas por agregados SQL;
  - estatísticas no fuso da família;
  - a exportação exige acesso recente;
  - o lembrete tolera a hora perdida.
- MediaPipe fixado em 1.2.0 e WASM versionado.
- Acabamento das telas e acessibilidade.

**Fase 1, mostrar antes de cobrar:**

- teste de 7 dias sem cartão (um por e-mail, HMAC);
- tolerância de 7 dias em `past_due`;
- folha de planos em todo cadeado, com o anual pelo valor por mês;
- Aquecimento no grátis;
- landing com "Começar de graça".

**Fase 2, treino que guia** (`6714bb37`):

- Portão "Pronto?":
  - detector com progresso;
  - checagens de luz, corpo inteiro e posição de partida;
  - 3-2-1 automático;
  - teste da voz;
  - cuidados no primeiro treino.
- O detector leve é escolhido pelo fps do aparelho.
- O instrutor tem qualidade baixa e para de desenhar quando a cena fica parada.
- Contador:
  - `spread`;
  - checagem no pico;
  - tempo mínimo de repetição;
  - perda de rastreio;
  - gravações reais como regressão.
- Avisos de forma falados.
- "Como foi?" e "Parar e salvar".
- Progressão honesta: a meta é do servidor, e o nível também desce.
- Intensidade do perfil.
- Aquecimento e volta à calma com 4 alongamentos (regra `timed`).

**Fases 3 e 4, perfis e hábito; treinar junto:**

- Perfis:
  - primeiro acesso com ritmo, tempo e dias;
  - "Quem vai treinar?" com o estado de cada perfil;
  - edição do jeito de treinar.
- Início com o recomendador e o porquê da escolha.
- Navegação Início · Treinos · Exercícios · Progresso, com `/treinos` e filtros.
- Hábito:
  - meta semanal no lugar de dias seguidos;
  - `contaComoTreino`;
  - 5 conquistas novas.
- Desafio pessoal que se renova sozinho, e desafio da família cooperativo, sem ranking.
- Lembrete por perfil e resumo semanal com semanas cumpridas, recordes e próximo nível.
- Treinar junto (`/junto`): rodízio de séries, "Como foi?" de cada um, gravação em grupo numa transação e resumo do grupo.

## Verificação

- **Unitários:** 244 testes.
- **Integração:** 21 testes, num banco descartável:
  - teste grátis;
  - tolerância;
  - meta do servidor;
  - desafio pessoal e da família;
  - lembretes;
  - treinar junto.
- **E2E** (Chromium desktop e Pixel 7): cadastro → primeiro acesso → Início → portão → "Parar e salvar" → "Como foi?" → resumo → Progresso.
- **Typecheck e build:** typecheck da raiz com 27 tarefas, e `pnpm build:bora-treinar`.
- **Capturas** do player (celular em pé, tablet e TV, com câmera falsa) e das telas novas: conferidas.

## Pendências

- **Teste em aparelho de verdade, com o titular** (`pnpm playground:bora-treinar --https` na rede local). A câmera falsa não tem corpo e o microfone precisa de gente. Conferir:
  - Chrome no Android e Safari no iPhone;
  - permissão do microfone, "Diga 'um'", voz sozinha e voz com a câmera;
  - voz no celular pareado;
  - contagem de agachamento, flexão e polichinelo;
  - os limiares novos de forma (joelhos, pernas no polichinelo, tronco no afundo) com gente.
- **Stripe:** atualizar a descrição dos produtos (está em `apps/bora-treinar/PRODUCAO.md`).
- **Migração 0077:** o worktree `feat/dia-de-estrela` tem uma `0077_dia_de_estrela.sql` não commitada. Quem chegar à `main` depois apaga a sua e regenera; nenhuma das duas foi aplicada em produção.
- **Publicação:** o push e o deploy ficam com o titular.
