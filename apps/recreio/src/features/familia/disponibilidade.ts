import "server-only";
import { env } from "@/lib/env";
import { assertAllowed } from "@/lib/errors";

export const novosPerfisProtegidosDisponiveis = env.RECREIO_FAMILY_MODE !== "off";
export const jogosProtegidosDisponiveis = env.RECREIO_FAMILY_MODE === "play";
/** Não bloqueia retorno por PIN, revogação, saída ou gestão de vínculos existentes. */
export function exigirCadastroProtegidoDisponivel() {
  assertAllowed(
    novosPerfisProtegidosDisponiveis,
    "FAMILIA_INDISPONIVEL",
    "Novos perfis protegidos ainda não estão disponíveis neste acesso.",
  );
}
