import type { ActivityOverviewItem } from "./overview-types";

// Buckets da rotina do dashboard.
//   attention — o que precisa de atenção hoje: vencidas, de hoje e as que
//               ainda estão com prazo a confirmar
//   tomorrow  — o que preparar para amanhã (mochila, prova, autorização)
//   week      — os próximos sete dias, para se organizar com folga
export const ROUTINE_BUCKETS = ["attention", "tomorrow", "week"] as const;
export type RoutineBucketKey = (typeof ROUTINE_BUCKETS)[number];

// Teto defensivo do que a rotina carrega de uma vez. Uma família com muitas
// pendências antigas ainda vê os contadores corretos (contados à parte, sem
// teto) e chega ao resto por /atividades.
export const ROUTINE_MAX_ITEMS = 200;

export type RoutineBuckets = Record<RoutineBucketKey, ActivityOverviewItem[]>;
