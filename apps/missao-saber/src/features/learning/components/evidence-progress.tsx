import { type Evidence, independenceProgress } from "../engine";

export function EvidenceProgress({ evidence, skillId }: { evidence: Evidence[]; skillId: string }) {
  const progress = independenceProgress(evidence, skillId);
  return (
    <p className="mt-2 text-sm text-tinta-suave">
      Observado: {progress.families} {progress.families === 1 ? "estratégia" : "estratégias"} e{" "}
      {progress.days} {progress.days === 1 ? "dia" : "dias"} com primeiro acerto sem pistas.
      {progress.missingFamilies || progress.missingDays
        ? ` Para reunir a base de autonomia, ainda é preciso observar ${progress.missingFamilies} ${progress.missingFamilies === 1 ? "estratégia nova" : "estratégias novas"} e ${progress.missingDays} ${progress.missingDays === 1 ? "dia adicional" : "dias adicionais"} com novas questões resolvidas sem pistas.`
        : " A variedade e os dias já foram observados; a leitura atual também considera a última resposta e suas pistas."}
    </p>
  );
}
