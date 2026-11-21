export type EvidenciaDaRotinaDeDireitos = {
  idadeExecucaoSegundos: number | null;
  execucaoTerminada: boolean;
  execucaoOk: boolean | null;
  resumo: unknown;
};
export type FilaMonitoradaDeDireitos = {
  publishing: number;
  processing: number;
  review: number;
  processingOverdue: number;
  retained: number;
  purgeDue: number;
  purgeOverdue: number;
};

/** Availability/backlog evidence only, not an effect or erasure capability.
 * Retention in its original term and recent in-flight work remain legitimate. */
export function processamentoDeDireitosEstaAtual(
  e: EvidenciaDaRotinaDeDireitos,
  fila: FilaMonitoradaDeDireitos,
  maxAge: number,
) {
  if (
    !Number.isInteger(maxAge) ||
    maxAge < 60 ||
    maxAge > 86400 ||
    typeof e.idadeExecucaoSegundos !== "number" ||
    !Number.isFinite(e.idadeExecucaoSegundos) ||
    e.idadeExecucaoSegundos < 0 ||
    e.idadeExecucaoSegundos > maxAge ||
    !Object.values(fila).every((n) => Number.isSafeInteger(n) && n >= 0) ||
    fila.review > 0 ||
    fila.processingOverdue > 0 ||
    fila.purgeOverdue > 0
  )
    return false;
  if (!e.execucaoTerminada)
    return e.execucaoOk === null && e.idadeExecucaoSegundos <= Math.min(900, maxAge);
  if (
    e.execucaoOk !== true ||
    typeof e.resumo !== "object" ||
    e.resumo === null ||
    Array.isArray(e.resumo)
  )
    return false;
  const resumo = e.resumo;
  const campos = [
    "publishing",
    "processing",
    "review",
    "processingOverdue",
    "retained",
    "purgeDue",
    "purgeOverdue",
    "leiturasLivro",
    "escritasLivro",
  ];
  return campos.every(
    (nome) =>
      nome in resumo &&
      Number.isSafeInteger(Reflect.get(resumo, nome)) &&
      Reflect.get(resumo, nome) >= 0,
  );
}
