/**
 * O teste de 7 dias, sem cartão: tudo liberado (câmera, todos os treinos, níveis, desafios, até
 * 4 perfis), um por e-mail. Os números da copy saem daqui, nunca escritos à mão nas telas.
 */
export const TRIAL_DAYS = 7;
/** Perfis no teste: o mesmo do plano Família, para a casa experimentar como ela é. */
export const TRIAL_PROFILE_LIMIT = 4;
/** Dias de tolerância com o pagamento atrasado (past_due), contados do fim do período pago. */
export const GRACE_DAYS = 7;

const DIA = 86_400_000;

export interface Teste {
  active: boolean;
  /** quando termina (ms); nulo se nunca começou */
  endsAt: number | null;
  /** já começou alguma vez (para oferecer começar, ou dizer que acabou) */
  started: boolean;
}

/** O estado do teste a partir de quando ele começou. */
export function estadoDoTeste(startedAt: Date | number | null, agora = Date.now()): Teste {
  if (startedAt === null) return { active: false, endsAt: null, started: false };
  const endsAt = new Date(startedAt).getTime() + TRIAL_DAYS * DIA;
  return { active: endsAt > agora, endsAt, started: true };
}

/** Dias que faltam, arredondado para cima (no último dia, 1). Zero quando acabou. */
export function diasRestantes(teste: Teste, agora = Date.now()) {
  if (!teste.active || teste.endsAt === null) return 0;
  return Math.max(1, Math.ceil((teste.endsAt - agora) / DIA));
}

/** O pagamento atrasado ainda está dentro da tolerância? */
/** Até quando a tolerância do pagamento atrasado mantém tudo liberado. */
export const fimDaTolerancia = (fimDoPeriodo: Date | number) =>
  new Date(new Date(fimDoPeriodo).getTime() + GRACE_DAYS * 86_400_000);

export function emTolerancia(fimDoPeriodo: Date | number, agora = Date.now()) {
  return new Date(fimDoPeriodo).getTime() + GRACE_DAYS * DIA > agora;
}
