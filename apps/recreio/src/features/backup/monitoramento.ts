export type EvidenciaDoMonitor = {
  idadeCapturaSegundos: number | null;
  idadeExecucaoSegundos: number | null;
  execucaoTerminada: boolean;
  execucaoOk: boolean | null;
  pendencias: boolean;
};

/** Publication/retry timestamps never renew the age of the source snapshot. */
export function backupEstaAtual(e: EvidenciaDoMonitor, idadeMaximaSegundos: number) {
  const idadeValida = (v: number | null) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= idadeMaximaSegundos;
  return (
    Number.isInteger(idadeMaximaSegundos) &&
    idadeMaximaSegundos >= 60 &&
    idadeMaximaSegundos <= 86400 &&
    idadeValida(e.idadeCapturaSegundos) &&
    idadeValida(e.idadeExecucaoSegundos) &&
    !e.pendencias &&
    (e.execucaoTerminada
      ? e.execucaoOk === true
      : e.execucaoOk === null && e.idadeExecucaoSegundos !== null && e.idadeExecucaoSegundos <= 900)
  );
}
