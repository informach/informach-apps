---
status: resolved
file: apps/missao-saber/scripts/provision-stripe.mjs
line: 97
severity: high
author: claude-code
provider_ref:
---

# Issue 002: Impedir o Portal de contornar a política de planos

## Review Comment

O Portal é provisionado com `subscription_update` para os quatro preços e `proration_behavior: "always_invoice"`. Esse caminho altera preço diretamente na Stripe, enquanto `changePlan()` agenda reduções de capacidade e anual para mensal no fim do período e, no downgrade para Individual, exige a escolha do perfil que continuará ativo. Como a tela também oferece o botão do Portal, o responsável pode trocar Família por Individual fora dessa regra: a mudança pode entrar imediatamente e nenhum `retainedProfileId` é registrado. Quando o webhook projeta o Individual, `allowedProfileIds()` escolhe o primeiro perfil habilitado, não necessariamente o escolhido pela família.

Deixar as trocas de preço sob uma única política. A opção mais segura é desabilitar `subscription_update` no Portal e manter nele pagamento, faturas e cancelamento, usando os controles do app para todas as mudanças. Se a troca pelo Portal for mantida, ela precisa respeitar o mesmo agendamento e coletar uma seleção durável antes do webhook efetivar a redução. Reprovisionar as configurações de teste e produção e homologar que o Portal não oferece um atalho para o downgrade.

## Triage

- Decision: `RESOLVED`
- Notes: O Portal Stripe não permite trocar preços. Toda mudança de plano passa pelo app, que aplica momento da troca, proporcionalidade e escolha do perfil mantido; as configurações de teste e produção foram reprovisionadas.

