# Retomada de encerramentos com mudança de escopo

Implementação local em curso em 10/11/2026. A interface e os jobs estão integrados localmente; não houve alteração de produção.

O coordenador já recusa uma seleção que mudou depois da confirmação, mas a repetição automática não resolve esse caso. A família pode alterar vínculos enquanto o titular permanece com a participação congelada. Depois de qualquer efeito irreversível, voltar a permitir uso ou reaplicar passos concluídos seria incorreto.

Plano desta etapa:

1. Classificar a mudança de escopo durante a execução e pausar a operação inteira. Invalidar concessões de execução pendentes; efeitos transacionais tardios não podem confirmar.
2. Conservar recibos concluídos, revisões dos planos e cada consentimento. Uma nova preparação consulta somente os domínios ainda não concluídos; a participação continua congelada.
3. Exigir sessão central recente e confirmação explícita do novo resumo. A revisão integra o digest, impedindo reutilização do aceite anterior mesmo quando as contagens coincidirem.
4. Retomar apenas passos restantes, com cobrança antes dos apps e família por último. A desistência com retorno ao uso continua permitida somente antes do primeiro consentimento irreversível.
5. Preservar recibos financeiros por seleção confirmada. Cancelamentos já efetivados no provedor não são desfeitos; efeitos externos admitidos pelo consentimento anterior permanecem sujeitos à seleção e autoridade do domínio.
6. Verificar em PostgreSQL isolado a interrupção, recibos anteriores, novas confirmações, trabalhadores tardios, repetição e conclusão. Gerar DDL pelo Drizzle; registrar compatibilidade e limites no runbook.

As rotinas autenticadas e a interface foram conectadas localmente. Ainda é necessário ensaiar a jornada conjunta dos cinco serviços e revisar a duração total das chamadas externas sob falhas do provedor.

## Evidência local

A 0150 foi gerada pelo Drizzle, sem edição do SQL: revisão do plano, histórico de consentimentos, estados de pausa/repreparação e recibo financeiro por impressão de seleção. O núcleo interrompe a fila inteira ao detectar mudança, invalida concessões antigas e conserva passos concluídos. `reprepareWebClosureRemainder` consulta somente o restante; não reabre participação e não permite desistir depois do consentimento. Mesmo com indicadores iguais, outra revisão exige outro digest.

`pnpm compasso:test:integration --account-only --billing-only` passou com **78 testes financeiros em 14 arquivos e 27 do coordenador em quatro arquivos**, exit 0; PostgreSQL descartável removido. Log `.codex-compasso-reconsent-pg.log`. Os casos novos cobrem execução parcial, autenticação recente, outro titular, resposta tardia, bloqueios familiares, revisões repetidas, confirmação antiga, histórico imutável de autorizações e provas financeiras de duas seleções. Tipos de db/billing passaram; o primeiro typecheck de account apontou um import inexistente na fachada db, corrigido para o módulo Drizzle usado pelo package. A repetição de account passou (`.codex-compasso-reconsent-account-types.log`). Biome passou nos arquivos modificados.

Efeitos externos já admitidos pela autorização anterior não são desfeitos por pausar; o domínio continua exigindo a seleção/autoridade exatas. O coordenador recusa seu commit tardio, e a nova preparação pode exigir outra revisão se uma mudança posterior ocorrer. Bloqueios de responsabilidade continuam explícitos; o sistema não assume custódia nem amplia consentimento automaticamente.
