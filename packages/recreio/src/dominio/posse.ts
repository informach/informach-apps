/**
 * Posse (SpaceLease): quem executa um mundo agora. Um mundo aberto tem
 * exatamente um executor. Toda escrita leva a cerca da posse atual, e uma
 * instância com cerca velha é recusada.
 */

/** Quanto vale uma posse sem batimento. É também o tempo máximo de retomada. */
export const POSSE_TTL_MS = 30_000;
/** Intervalo do batimento de uma instância. Três batimentos cabem em um TTL. */
export const BATIMENTO_MS = 10_000;
/** A instância para de escrever esta folga antes do prazo, por conta própria. */
export const FOLGA_DE_AUTOCERCA_MS = 3_000;

export const ESTADOS_DE_POSSE = ["assigned", "held", "released"] as const;
/**
 * `assigned`: o Recreio escolheu a instância e espera ela reivindicar.
 * `held`: a instância carregou o mundo e está executando.
 */
export type EstadoDePosse = (typeof ESTADOS_DE_POSSE)[number];

export const MOTIVOS_DE_FIM_DE_POSSE = [
  "empty",
  "drain",
  "error",
  "expired",
  "taken_over",
] as const;
export type MotivoDeFimDePosse = (typeof MOTIVOS_DE_FIM_DE_POSSE)[number];

export const TIPOS_DE_FOTOGRAFIA = ["checkpoint", "hibernate", "pinned"] as const;
/** `pinned` é o ponto antigo guardado para incidentes; não entra na retenção. */
export type TipoDeFotografia = (typeof TIPOS_DE_FOTOGRAFIA)[number];

/** Piso de fotografias guardadas por mundo, sem contar as fixadas. */
export const FOTOGRAFIAS_GUARDADAS = 5;

export type PosseAberta = {
  cerca: number;
  estado: Exclude<EstadoDePosse, "released">;
  expiraEm: Date;
};

export function posseVigente(posse: PosseAberta | null, agora: Date): posse is PosseAberta {
  return posse !== null && posse.expiraEm.getTime() > agora.getTime();
}

/** A instância deve parar de simular e de escrever a partir deste instante. */
export function deveSeCercar(expiraEmMs: number, agoraMs: number): boolean {
  return agoraMs >= expiraEmMs - FOLGA_DE_AUTOCERCA_MS;
}
