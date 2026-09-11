# Agentes de IA do Cozya

Use `src/ai/index.ts` e os contratos em `apps/cozya/CLAUDE.md` como referência atual.

O runtime Cozya usa Mastra **sem storage de conversa, memória automática ou traces contendo material do usuário**. As factories compartilhadas continuam disponíveis para outros apps; não copiar exemplos que ativam memória neste app.

Toda operação externa passa por guards, idempotência e uma reserva de crédito. Fluxos de áudio/pesquisa com múltiplas etapas compartilham essa reserva; `runRecordedAiCall` registra cada etapa com UUID próprio e `reservationId` em metadados. Conteúdo não vai para logs. Prévia recuperável por 24h fica em `cozya.ai_operations`, com proprietário e retenção explícitos.

Schema Mastra legado pertence ao migrator (`pnpm db:migrate`), não ao Drizzle. Limpeza e recuperação são descritas no runbook do review de 11/09/2026.
