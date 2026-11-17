import "server-only";
import { ErroDoRecreio, MundoIdSchema } from "@informach/recreio";
import { SalvamentoDoHostSchema } from "@informach/recreio/contrato";
import { jogoDoCatalogo } from "@/features/jogos/config";
import type { Host } from "@/features/posse/service";
import { env } from "@/lib/env";
import { limitarTentativas } from "@/lib/rate-limit";
import { salvarSessaoDoMundoNoBanco } from "./mundo-repository";

export async function salvarSessaoDoMundo(host: Host, mundoId: unknown, entrada: unknown) {
  if (env.RECREIO_CHECKPOINT_MODE !== "on") throw new ErroDoRecreio("SEM_PERMISSAO");
  const manifesto = jogoDoCatalogo(host.jogo);
  if (!manifesto.capacidades.mundos || manifesto.capacidades.checkpoint !== "servidor")
    throw new ErroDoRecreio("SEM_PERMISSAO");
  const id = MundoIdSchema.safeParse(mundoId);
  if (!id.success) throw new ErroDoRecreio("NAO_ENCONTRADO");
  await limitarTentativas({
    chave: `salvamento-host:${host.instanciaId}`,
    max: 60,
    janelaEmSegundos: 60,
  });
  return salvarSessaoDoMundoNoBanco(host, id.data, SalvamentoDoHostSchema.parse(entrada));
}
