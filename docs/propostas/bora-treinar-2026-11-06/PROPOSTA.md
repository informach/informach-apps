# Bora Treinar: treino individual que guia, perfis como na Netflix

Pedido do titular em 06/11/2026: análise profunda do app e proposta de melhorias de funcionalidade, design, telas e experiência. Canvas da proposta: [Bora Treinar, proposta](https://claude.ai/artifact/TTwpbSCTHYdYsqUfw6bMme) (privado), com Perfis, Primeiro acesso, Início do perfil, Paywall, Fim do treino, Progresso, os players de celular, tablet e TV, Roadmap e Diagnóstico.

## Diagnóstico

Três bloqueios:

- o treino começava antes da câmera e não guiava o enquadramento;
- o treino não se ajustava à pessoa;
- a câmera nunca era provada no grátis, e cada cadeado pedia login de novo.

O titular relatou ainda que **a contagem pela voz não funcionava**. A causa era o cabeçalho `Permissions-Policy: microphone=()`, que proibia o microfone no site inteiro. A correção saiu antes, direto na `main` local (`edeba243`).

## Decisões do titular (06/11/2026)

| Decisão | Escopo |
|---|---|
| **O centro é o treino individual** | A família é a mesma assinatura com vários perfis, "como na Netflix": cada pessoa no seu perfil, no seu ritmo. Treinar junto é um extra. |
| **Qualquer tela** | O treino funciona no celular em pé, no tablet, no computador e na TV, não só na TV. |
| **Teste de 7 dias sem cartão** | Controlado pelo app, um por e-mail; libera tudo, câmera inclusive. |
| **Preferências no perfil** | Ritmo, tempo e dias por semana. Nada de idade, peso ou saúde. |
| **Aquecimento no grátis** | `FREE_WORKOUT_IDS` ganha `aquecimento-5`. |
| **Entrega** | Branch própria, um commit por fase, merge na `main` local sem push (cada push na `main` faz deploy). |

O que foi feito, como foi verificado e o que ficou para depois estão no [registro da implementação](IMPLEMENTACAO.md).
