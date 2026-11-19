import { AppError } from "@/lib/errors";
import { ofertasParaOAdulto } from "./regras";

export type PerfilParaTroca = {
  id: string;
  groupId: string | null;
  policyVersion: number;
  coverageEnabled: boolean;
  status: "active" | "suspended";
  /** Minimum native participation check, never client input. The game kernel
   * still validates account eligibility and the complete current authority. */
  podeCobrir: boolean;
};
export type SelecaoDaTroca = {
  profileReference: string;
  profileId: string | null;
  groupId: string;
  policyVersion: number;
  coverageEnabled: boolean;
};

export function perfisParaSelecionarNaTroca(
  perfis: readonly (Omit<PerfilParaTroca, "podeCobrir"> & { kind: "adult" | "minor" })[],
  vinculos: readonly { perfilId: string }[],
): PerfilParaTroca[] {
  return perfis.map((p) => ({
    ...p,
    podeCobrir: p.kind === "adult" || vinculos.some((v) => v.perfilId === p.id),
  }));
}

/** Validate the entire selection again when a deferred change takes effect.
 * Returns data only; callers still need the native transaction and SID cut.
 */
export function conferirSelecaoDaTroca(
  grupoId: string,
  produtoDestino: string,
  selecao: readonly SelecaoDaTroca[],
  atuais: readonly PerfilParaTroca[],
) {
  const oferta = ofertasParaOAdulto().find((o) => o.productId === produtoDestino);
  if (!oferta) throw new AppError("OFERTA", "Confira a oferta atual antes de continuar.");
  if (
    selecao.length !== atuais.length ||
    new Set(selecao.map((s) => s.profileReference)).size !== selecao.length ||
    new Set(atuais.map((p) => p.id)).size !== atuais.length ||
    selecao.some((s) => {
      const perfil = atuais.find((p) => p.id === s.profileReference);
      return (
        s.profileId !== s.profileReference ||
        s.groupId !== grupoId ||
        !perfil ||
        perfil.groupId !== grupoId ||
        perfil.policyVersion !== s.policyVersion ||
        !Number.isSafeInteger(s.policyVersion) ||
        s.policyVersion < 1 ||
        s.policyVersion >= 2147483646 ||
        (s.coverageEnabled &&
          (!perfil.coverageEnabled || perfil.status !== "active" || !perfil.podeCobrir))
      );
    })
  )
    throw new AppError("CONFLITO", "Os perfis mudaram. Confira novamente quem continuará jogando.");
  const cobertos = selecao.filter((s) => s.coverageEnabled);
  if (cobertos.length > oferta.perfis)
    throw new AppError("LIMITE_DE_PERFIS", "A seleção excede a cobertura do plano escolhido.");
  return [...selecao].sort((a, b) => a.profileReference.localeCompare(b.profileReference));
}
