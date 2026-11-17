import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, desc, eq, gt, isNull, ne, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioGameSessions as games,
} from "@informach/db/schema";
import {
  type ContaId,
  type SessaoDeAparelhoId,
  SessaoDeAparelhoIdSchema,
} from "@informach/recreio";
import {
  autorizarContaNativa,
  serializarContaNativa,
} from "@/features/account/autoridade-repository";
import { encerrarSessoesAbertas } from "@/features/sessao-de-jogo/repository";
import { assertAllowed } from "@/lib/errors";
import { AGORA, type Transacao } from "@/lib/repository";

export type DonoDosAparelhos = { contaId: ContaId; sessaoDeAparelhoId: SessaoDeAparelhoId };
export type CursorDeAparelhos = SessaoDeAparelhoId;
export const APARELHOS_POR_PAGINA = 20;
const campos = {
  id: devices.id,
  criadoEm: devices.createdAt,
  vistoEm: devices.lastSeenAt,
};
type LinhaDeAparelho = { id: string; criadoEm: Date; vistoEm: Date };
export type AparelhoDaConta = Omit<LinhaDeAparelho, "id"> & { id: SessaoDeAparelhoId };
function aparelho(linha: LinhaDeAparelho): AparelhoDaConta {
  return {
    id: SessaoDeAparelhoIdSchema.parse(linha.id),
    criadoEm: linha.criadoEm,
    vistoEm: linha.vistoEm,
  };
}

async function limitarEspera(tx: Transacao) {
  await tx.execute(sql`set local statement_timeout = '5s'`);
  await tx.execute(sql`set local lock_timeout = '1s'`);
  await tx.execute(sql`set local transaction_timeout = '15s'`);
}

async function autorizar(tx: Transacao, ator: DonoDosAparelhos) {
  const contexto = await autorizarContaNativa(tx, ator);
  return {
    perfilId: contexto.perfilId,
    atual: aparelho(contexto.aparelho),
    conferirPrazo: contexto.conferirPrazo,
  };
}

export async function listarAparelhosDaConta(
  ator: DonoDosAparelhos,
  apos: CursorDeAparelhos | null,
) {
  return db.transaction(async (tx) => {
    await limitarEspera(tx);
    const { atual } = await autorizar(tx, ator);
    const linhas = await tx
      .select(campos)
      .from(devices)
      .where(
        and(
          eq(devices.userId, ator.contaId),
          eq(devices.kind, "account"),
          ne(devices.id, ator.sessaoDeAparelhoId),
          isNull(devices.revokedAt),
          gt(devices.expiresAt, AGORA),
          // A âncora é lida no banco: converter seu timestamp para Date perderia microssegundos.
          apos
            ? sql`(${devices.createdAt}, ${devices.id}) < (
        select base.created_at, base.id from recreio.device_sessions base
        where base.id = ${apos}::uuid and base.user_id = ${ator.contaId} and base.kind = 'account'
      )`
            : undefined,
        ),
      )
      .orderBy(desc(devices.createdAt), desc(devices.id))
      .limit(APARELHOS_POR_PAGINA + 1);
    const outros = linhas.slice(0, APARELHOS_POR_PAGINA).map(aparelho);
    const ultimo = outros.at(-1);
    return {
      atual,
      outros,
      proximo: linhas.length > APARELHOS_POR_PAGINA && ultimo ? ultimo.id : null,
    };
  });
}

export async function revogarOutroAparelho(ator: DonoDosAparelhos, alvo: SessaoDeAparelhoId) {
  return db.transaction(async (tx) => {
    await limitarEspera(tx);
    // Antes de travar aparelhos: dois chamadores não revogam um ao outro em círculo.
    await serializarContaNativa(tx, ator.contaId);
    const { perfilId, conferirPrazo } = await autorizar(tx, ator);
    const [encontrado] = await tx
      .select({ id: devices.id, revogado: devices.revokedAt })
      .from(devices)
      .where(
        and(
          eq(devices.id, alvo),
          eq(devices.userId, ator.contaId),
          eq(devices.kind, "account"),
          ne(devices.id, ator.sessaoDeAparelhoId),
        ),
      )
      .for("update");
    assertAllowed(encontrado, "APARELHO", "Aparelho não disponível.");
    await conferirPrazo();
    if (encontrado.revogado !== null) return { revogado: false };
    await tx
      .update(devices)
      .set({ revokedAt: AGORA })
      .where(
        and(eq(devices.id, alvo), eq(devices.userId, ator.contaId), isNull(devices.revokedAt)),
      );
    await encerrarSessoesAbertas(tx, sql`${games.deviceSessionId} = ${alvo}`, "signed_out", {
      porQuem: "conta",
    });
    await logAuditEventStrict(
      "recreio.device_session_revoked",
      ator.contaId,
      { app: "recreio", deviceSessionId: alvo, ...(perfilId ? { profileId: perfilId } : {}) },
      { writer: tx },
    );
    return { revogado: true };
  });
}
