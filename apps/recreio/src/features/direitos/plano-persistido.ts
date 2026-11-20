import "server-only";
import { createHash } from "node:crypto";
import { assertAllowed } from "@/lib/errors";
import { type PlanoDeDireitos, PlanoDeDireitosSchema } from "./preparacao-contrato";

export type FontePersistidaDoPlano = {
  requesterUserId: string;
  kind: "retirar_perfil" | "encerrar_conta";
  planSha256: string;
  plan: unknown;
};
export function resumirPlanoDeDireitos(plano: PlanoDeDireitos) {
  return createHash("sha256").update(JSON.stringify(plano)).digest("hex");
}
/** Same canonical parser/hash for native and historical persistence. Checking
 * a plan is not authority to execute it or to impersonate its original actor. */
export function lerPlanoDeDireitos(linha: FontePersistidaDoPlano, contaId: string) {
  const plano = PlanoDeDireitosSchema.parse(linha.plan);
  assertAllowed(
    linha.requesterUserId === contaId &&
      plano.contaId === contaId &&
      plano.tipo === linha.kind &&
      resumirPlanoDeDireitos(plano) === linha.planSha256,
    "DIREITOS",
    "Preparação não disponível. Faça uma nova prévia.",
  );
  return plano;
}
