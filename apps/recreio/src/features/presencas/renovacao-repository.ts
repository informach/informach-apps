import "server-only";
import { and, eq, sql } from "@informach/db";
import { recreioWorldHostPresences as presences } from "@informach/db/schema";
import { ErroDoRecreio } from "@informach/recreio";
import {
  PRESENCA_DO_ANFITRIAO_TTL_MS,
  type RenovacaoDePresenca,
} from "@informach/recreio/contrato";
import { comEntradaAtualDeMembro, conferirPosse } from "@/features/posse/repository";
import type { Host } from "@/features/posse/service";
import { assertAllowed } from "@/lib/errors";
import { sessaoComSuporteDePresenca } from "./repository";

/** Cada entrada conserva o kernel e a ordem de travas; nenhuma renovação reabre prova vencida. */
export function renovarPresencaNoBanco(host: Host, pedido: RenovacaoDePresenca) {
  const escopo = { ...host, mundoId: pedido.mundoId, cerca: pedido.cerca };
  return comEntradaAtualDeMembro(
    { ...escopo, sid: pedido.sid, perfilId: pedido.perfilId },
    async (tx, entrada, conferirPrazo) => {
      const sessao = await sessaoComSuporteDePresenca(tx, host, pedido.sid);
      if (!sessao) throw new ErroDoRecreio("NAO_ENCONTRADO");
      const { mundo, posse } = await conferirPosse(tx, escopo);
      assertAllowed(mundo.status === "active", "CONFLITO", "O mundo não admite presença.");
      const [p] = await tx
        .select()
        .from(presences)
        .where(
          and(
            eq(presences.id, pedido.presencaId),
            eq(presences.spaceId, pedido.mundoId),
            eq(presences.instanceId, host.instanciaId),
            eq(presences.fence, pedido.cerca),
            eq(presences.hostProfileId, pedido.perfilId),
            eq(presences.hostSessionId, pedido.sid),
            eq(presences.hostMemberId, entrada.membroId),
          ),
        )
        .for("update");
      if (!p) throw new ErroDoRecreio("NAO_ENCONTRADO");
      const agora = await conferirPrazo();
      assertAllowed(
        p.state === "active" && p.closedAt === null && p.expiresAt > agora && p.validUntil > agora,
        "CONFLITO",
        "A presença não está mais ativa.",
      );
      const expiraEm = new Date(
        Math.min(
          agora.getTime() + PRESENCA_DO_ANFITRIAO_TTL_MS,
          p.validUntil.getTime(),
          posse.expiresAt.getTime(),
          sessao.expiraEm.getTime(),
        ),
      );
      const [renovada] = await tx
        .update(presences)
        .set({ updatedAt: agora, expiresAt: expiraEm })
        .where(
          and(
            eq(presences.id, p.id),
            eq(presences.state, "active"),
            sql`${presences.expiresAt}>clock_timestamp()`,
          ),
        )
        .returning({ id: presences.id });
      assertAllowed(
        renovada && expiraEm > (await conferirPrazo()),
        "CONFLITO",
        "O prazo acabou antes da confirmação.",
      );
      return { presencaId: p.id, estado: "ok" as const, expiraEm: expiraEm.toISOString() };
    },
  );
}
