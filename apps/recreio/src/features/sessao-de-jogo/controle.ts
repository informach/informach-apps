import "server-only";
import { limitarTentativas } from "@/lib/rate-limit";
import { lerControleDaSessao } from "./controle-repository";
import type { SessaoDeJogoAtiva } from "./service";

export async function consultarControleDaSessao(sessao: SessaoDeJogoAtiva) {
  await limitarTentativas({
    chave: `controle-sessao:${sessao.perfilId}`,
    max: 60,
    janelaEmSegundos: 60,
  });
  return lerControleDaSessao(sessao);
}
