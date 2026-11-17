import "server-only";
import { contatoDisponivel, ErroDoRecreio, type PerfilSocial } from "@informach/recreio";
import { env } from "@/lib/env";

export const novosContatosDisponiveis = env.RECREIO_SOCIAL_MODE === "on";
export function exigirNovosContatos() {
  if (env.RECREIO_SOCIAL_MODE !== "on") throw new ErroDoRecreio("INDISPONIVEL");
}
export function podeCriarContatos(perfil: PerfilSocial) {
  return (
    env.RECREIO_SOCIAL_MODE === "on" &&
    contatoDisponivel(perfil) &&
    (perfil.tipo === "adulto" || env.RECREIO_FAMILY_MODE === "play")
  );
}
