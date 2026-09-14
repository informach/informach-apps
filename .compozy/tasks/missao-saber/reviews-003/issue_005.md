---
status: resolved
file: apps/missao-saber/src/app/design.css
line: 962
severity: medium
author: claude-code
provider_ref:
---

# Issue 005: Manter as barras proporcionais quando o rótulo é maior

## Review Comment

As barras representam as quantidades por `width` percentual, mas `.bar { min-width: fit-content; padding: 12px; }` impõe a largura intrínseca do rótulo monetário. Com dois descontos de 60%, a barra final deveria ocupar 16% da largura inicial. Em telas estreitas, esse valor é menor que o texto e seu padding; a largura mínima vence a proporção e a figura ensina uma comparação visual errada, embora os números textuais estejam corretos.

Separar o preenchimento proporcional do rótulo: deixar o preenchimento seguir exatamente a porcentagem e colocar o valor fora dele ou numa camada que não determine sua largura mínima. Verificar em viewport de 320/360 px e descontos altos que a largura final corresponde a 16% da referência, com rótulos legíveis e sem overflow. Não corrigir apenas escondendo o texto que serve de alternativa acessível.

## Triage

- Decision: `VALID`
- Notes: Barras têm preenchimentos vazios, rótulos fora do gráfico e `min-width: 0`. E2E executado pelo implementador em desktop/Pixel 7 move os dois controles por teclado a 60% e mede largura final/largura total com `getBoundingClientRect`, exigindo 0,16 com precisão de duas casas, além de ausência de overflow horizontal. Seis cenários passaram; teste e `.last-run.json` conferidos pelo revisor em 13/09/2026.
