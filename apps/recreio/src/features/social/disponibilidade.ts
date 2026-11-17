import "server-only";
import { ErroDoRecreio } from "@informach/recreio";
import { env } from "@/lib/env";

export const novosContatosDisponiveis = env.RECREIO_SOCIAL_MODE === "on";
export function exigirNovosContatos() {
  if (env.RECREIO_SOCIAL_MODE !== "on") throw new ErroDoRecreio("INDISPONIVEL");
}
