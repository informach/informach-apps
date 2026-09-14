---
status: resolved
file: apps/missao-saber/src/features/content/commercial-curriculum.ts
line: 1480
severity: high
author: claude-code
provider_ref:
---

# Issue 001: Modelar famílias reais nos bancos reservados

## Review Comment

Os 96 itens reservados são produzidos por `reservedSpec()`, que possui somente um molde por habilidade. Curso, modo e posição mudam o `seed`, os números e alguns nomes, mas preservam enunciado, operação e caminho de solução. `makeAssessmentBank()` ainda acrescenta `index % 4` ao `familyId`, fazendo até quatro variantes do mesmo molde parecerem famílias independentes. O inventário aceita cada variante como atividade distinta porque sua assinatura usa o enunciado e a solução literais; a exposição também compara apenas IDs específicos do banco.

Como resultado, uma troca de trilha pode chamar de `fresh` uma variante do molde que o estudante acabou de ver, e simulados podem acrescentar famílias artificiais ao cálculo de autonomia. A separação `:learn:` versus `:assess:` comprova apenas diferença de rótulo, não a separação semântica exigida por F3.2. Isso também contraria F3.6, que proíbe contar cópias numéricas do mesmo molde como diversidade.

Criar um blueprint de famílias semânticas estáveis, com uma chave de exposição compartilhada entre cursos e versões equivalentes. Diversificar os bancos com problemas realmente distintos em estrutura, representação e raciocínio; variantes da mesma forma devem conservar a mesma família e não aumentar a contagem de diversidade. O inventário precisa detectar equivalência estrutural e sobreposição semântica com treino. Recalcular a meta de 600 depois dessa normalização e acrescentar conteúdo autoral quando necessário.

## Triage

- Decision: `RESOLVED`
- Notes: Os bancos agora usam três estruturas semânticas autorais por habilidade e os simulados usam famílias próprias de verificação. A chave de exposição é estável e compartilhada entre cursos; o inventário rejeita alias estrutural, conflito dentro de família, sobreposição com treino e repetição de família no mesmo banco.
