import "server-only";
import { createHash } from "node:crypto";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, gt, isNull, sql } from "@informach/db";
import {
  recreioGameInstances as instances,
  recreioWorldHostPresences as presences,
  recreioGameSessions as sessions,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { ErroDoRecreio, type MundoId, type SessaoDeJogoId } from "@informach/recreio";
import {
  type AtestadoDeEntrada,
  type AtestadoDeSaida,
  JANELA_DA_PRESENCA_MS,
  PRESENCA_DO_ANFITRIAO_TTL_MS,
  RETENCAO_DA_PRESENCA_MS,
  type ReciboDePresenca,
} from "@informach/recreio/contrato";
import { limitarGestao } from "@/features/mundos/gestao-repository";
import { comEntradaAtualDeMembro, conferirPosse } from "@/features/posse/repository";
import type { Host } from "@/features/posse/service";
import { AppError, assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";

type Presenca = typeof presences.$inferSelect;
type Motivo = NonNullable<Presenca["closeReason"]>;
const recibo = (p: Presenca): ReciboDePresenca => ({
  presencaId: p.id,
  estado: p.state,
  expiraEm: p.expiresAt.toISOString(),
  janelaAte: p.validUntil.toISOString(),
});
function hashDoPedido(host: Host, mundoId: MundoId, p: AtestadoDeEntrada) {
  return createHash("sha256")
    .update("recreio:presenca-anfitriao:v1\n")
    .update(
      JSON.stringify({
        jogo: host.jogo,
        instanciaId: host.instanciaId,
        mundoId,
        cerca: p.cerca,
        sid: p.sid,
        perfilId: p.perfilId,
      }),
    )
    .digest("hex");
}
function conferirRepeticao(p: Presenca, hash: string) {
  assertAllowed(
    p.requestHash === hash,
    "CONFLITO",
    "A chave de entrada já foi usada em outro pedido.",
  );
  return recibo(p);
}
/** Só recibo da própria instância/chave, sem nomes e sem renovar ou conceder autoridade. */
export async function recuperarReciboDePresenca(
  host: Host,
  mundoId: MundoId,
  pedido: AtestadoDeEntrada,
) {
  const [linha] = await db
    .select({ presenca: presences })
    .from(presences)
    .innerJoin(spaces, eq(spaces.id, presences.spaceId))
    .where(
      and(
        eq(presences.instanceId, host.instanciaId),
        eq(presences.clientKey, pedido.chaveDeEntrada),
        eq(spaces.gameId, host.jogo),
        gt(presences.retainUntil, sql`clock_timestamp()`),
      ),
    );
  return linha ? conferirRepeticao(linha.presenca, hashDoPedido(host, mundoId, pedido)) : null;
}
async function encerrarSobTrava(tx: Transacao, p: Presenca, agora: Date, motivo: Motivo) {
  if (p.state === "closed") return recibo(p);
  const [fechada] = await tx
    .update(presences)
    .set({ state: "closed", closedAt: agora, updatedAt: agora, closeReason: motivo })
    .where(and(eq(presences.id, p.id), eq(presences.state, "active"), isNull(presences.closedAt)))
    .returning();
  assertAllowed(fechada, "CONFLITO", "A presença mudou. Confira o recibo antes de repetir.");
  await logAuditEventStrict(
    "recreio.host_presence_closed",
    null,
    {
      app: "recreio",
      spaceId: p.spaceId,
      instanceId: p.instanceId,
      profileId: p.hostProfileId,
      sid: p.hostSessionId,
      presenceId: p.id,
      fence: p.fence,
      reason: motivo,
    },
    { writer: tx },
  );
  return recibo(fechada);
}
/** Capacidade imutável de ambos os processos; não substitui a admissão atual do kernel. */
export async function sessaoComSuporteDePresenca(tx: Transacao, host: Host, sid: SessaoDeJogoId) {
  const [sessao] = await tx
    .select({ expiraEm: sessions.expiresAt })
    .from(sessions)
    .innerJoin(
      instances,
      and(
        eq(instances.id, host.instanciaId),
        eq(instances.gameId, host.jogo),
        eq(instances.supportsVisits, true),
      ),
    )
    .where(
      and(eq(sessions.id, sid), eq(sessions.gameId, host.jogo), eq(sessions.supportsVisits, true)),
    );
  return sessao ?? null;
}
export function publicarPresencaNoBanco(host: Host, mundoId: MundoId, pedido: AtestadoDeEntrada) {
  const escopo = { ...host, mundoId, cerca: pedido.cerca },
    hash = hashDoPedido(host, mundoId, pedido);
  return comEntradaAtualDeMembro(
    { ...escopo, sid: pedido.sid, perfilId: pedido.perfilId },
    async (tx, entrada, conferirPrazo) => {
      const sessao = await sessaoComSuporteDePresenca(tx, host, pedido.sid);
      if (!sessao) throw new ErroDoRecreio("INDISPONIVEL");
      const [anterior] = await tx
        .select()
        .from(presences)
        .where(
          and(
            eq(presences.instanceId, host.instanciaId),
            eq(presences.clientKey, pedido.chaveDeEntrada),
          ),
        )
        .for("update");
      if (anterior) {
        assertAllowed(
          anterior.retainUntil > (await conferirPrazo()),
          "CONFLITO",
          "A chave de entrada expirou. Prepare uma nova entrada.",
        );
        return conferirRepeticao(anterior, hash);
      }
      const { mundo, posse } = await conferirPosse(tx, escopo);
      assertAllowed(mundo.status === "active", "CONFLITO", "O mundo não admite novas presenças.");
      const agora = await conferirPrazo();
      const [ativa] = await tx
        .select()
        .from(presences)
        .where(
          and(
            eq(presences.spaceId, mundoId),
            eq(presences.hostProfileId, pedido.perfilId),
            isNull(presences.closedAt),
          ),
        )
        .for("update");
      if (ativa) {
        if (ativa.instanceId !== host.instanciaId || ativa.fence !== pedido.cerca)
          await encerrarSobTrava(tx, ativa, agora, "lease_lost");
        else if (ativa.hostSessionId !== pedido.sid)
          await encerrarSobTrava(tx, ativa, agora, "session_ended");
        else if (ativa.expiresAt <= agora || ativa.validUntil <= agora)
          await encerrarSobTrava(tx, ativa, agora, "expired");
        else
          throw new AppError(
            "CONFLITO",
            "Encerre a presença anterior antes de registrar outra entrada.",
          );
      }
      const [contagem] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(presences)
        .where(and(eq(presences.hostProfileId, pedido.perfilId), gt(presences.retainUntil, agora)));
      assertAllowed(
        contagem && contagem.total < 1000,
        "CONFLITO",
        "Não é possível oferecer visitas neste momento.",
      );
      const janela = new Date(agora.getTime() + JANELA_DA_PRESENCA_MS),
        expiraEm = new Date(
          Math.min(
            agora.getTime() + PRESENCA_DO_ANFITRIAO_TTL_MS,
            posse.expiresAt.getTime(),
            sessao.expiraEm.getTime(),
          ),
        );
      const [criada] = await tx
        .insert(presences)
        .values({
          spaceId: mundoId,
          hostProfileId: pedido.perfilId,
          hostSessionId: pedido.sid,
          hostMemberId: entrada.membroId,
          instanceId: host.instanciaId,
          fence: pedido.cerca,
          clientKey: pedido.chaveDeEntrada,
          requestHash: hash,
          createdAt: agora,
          updatedAt: agora,
          expiresAt: expiraEm,
          validUntil: janela,
          retainUntil: new Date(janela.getTime() + RETENCAO_DA_PRESENCA_MS),
        })
        .returning();
      assertAllowed(criada, "CONFLITO", "Não foi possível registrar a presença.");
      await logAuditEventStrict(
        "recreio.host_presence_started",
        null,
        {
          app: "recreio",
          spaceId: mundoId,
          instanceId: host.instanciaId,
          profileId: pedido.perfilId,
          sid: pedido.sid,
          presenceId: criada.id,
          fence: pedido.cerca,
        },
        { writer: tx },
      );
      assertAllowed(
        criada.expiresAt > (await conferirPrazo()),
        "CONFLITO",
        "O prazo da presença acabou antes da confirmação.",
      );
      return recibo(criada);
    },
  );
}

/** Redução da própria prova permite saída após fim do SID/posse, sem emprestar autoridade à cerca antiga. */
export function encerrarPresencaNoBanco(host: Host, mundoId: MundoId, pedido: AtestadoDeSaida) {
  return db.transaction(async (tx) => {
    await limitarGestao(tx);
    const [mundo] = await tx
      .select({ id: spaces.id })
      .from(spaces)
      .where(and(eq(spaces.id, mundoId), eq(spaces.gameId, host.jogo)))
      .for("update");
    if (!mundo) throw new ErroDoRecreio("NAO_ENCONTRADO");
    const [p] = await tx
      .select()
      .from(presences)
      .where(
        and(
          eq(presences.id, pedido.presencaId),
          eq(presences.spaceId, mundoId),
          eq(presences.instanceId, host.instanciaId),
          eq(presences.fence, pedido.cerca),
        ),
      )
      .for("update");
    if (!p) throw new ErroDoRecreio("NAO_ENCONTRADO");
    const [relogio] = await tx
      .select({ agora: sql<Date>`clock_timestamp()`.mapWith(spaces.createdAt) })
      .from(spaces)
      .where(eq(spaces.id, mundoId));
    assertAllowed(relogio, "CONFLITO", "Não foi possível conferir o prazo da presença.");
    return encerrarSobTrava(
      tx,
      p,
      relogio.agora,
      p.expiresAt <= relogio.agora || p.validUntil <= relogio.agora ? "expired" : "left",
    );
  });
}
