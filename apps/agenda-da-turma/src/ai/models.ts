/**
 * Modelo de execução por feature de IA da Agenda da Turma.
 *
 * Fonte de verdade do *modelo de execução* — qual ID o caller passa para o
 * gateway (`openrouter("openai/gpt-4o-mini")`). Distinto de
 * `billing.credit_pricing`, que é a fonte de verdade do *modelo de billing*
 * — qual `(feature, model)` está ativo para cobrança. Em produção os dois
 * devem bater.
 *
 * Para trocar de modelo: (1) inserir nova row em `credit_pricing` com
 * `effective_to=null` na antiga + (2) atualizar este map num PR só.
 *
 * `satisfies Record<AgendaFeature, string>` garante que se uma feature nova
 * for adicionada à union sem mapear aqui, o build falha. `as const`
 * preserva os literais para uso direto em `withCredits({ model })`.
 *
 * Ver `packages/billing/src/seeds/credit-pricing.ts`
 * (`AGENDA_PRICING_SEED`) para a tabela espelhada de pricing.
 */

export type AgendaFeature =
  | "agenda.notices.parse"
  | "agenda.subjects.parse_image"
  | "agenda.subjects.transcribe_audio"
  | "agenda.subjects.parse_voice"
  | "agenda.activities.transcribe_audio";

export const AGENDA_MODELS = {
  "agenda.notices.parse": "openai/gpt-4o",
  "agenda.subjects.parse_image": "openai/gpt-4o",
  "agenda.subjects.transcribe_audio": "openai/gpt-4o-transcribe",
  "agenda.subjects.parse_voice": "openai/gpt-4o-mini",
  "agenda.activities.transcribe_audio": "openai/gpt-4o-transcribe",
} as const satisfies Record<AgendaFeature, string>;

export type AgendaModel = (typeof AGENDA_MODELS)[AgendaFeature];
