import "server-only";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, gt, isNotNull, isNull, or, sql } from "@informach/db";
import {
  recreioPairedCredentials as credentials,
  recreioDeviceSessions as devices,
  recreioGameSessions as games,
  recreioNativePins as pins,
  recreioMinorProtection as protection,
  recreioPairingRequests as requests,
} from "@informach/db/schema";
import {
  ContaIdSchema,
  type PerfilId,
  PerfilIdSchema,
  type SessaoDeAparelhoId,
  SessaoDeAparelhoIdSchema,
} from "@informach/recreio";
import {
  type AutorNativoRecente,
  autorizarContaNativa,
  type IdentidadeNativa,
} from "@/features/account/autoridade-repository";
import {
  invalidarIngressosDoAparelho,
  invalidarIngressosDoPerfil,
} from "@/features/sessao-de-jogo/ingressos-repository";
import { encerrarSessoesAbertas } from "@/features/sessao-de-jogo/repository";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { agoraDoBanco, autoridadeDoMenor, protecaoAtual } from "./autoridade-repository";
import { codigoDoSegredo, credencialDoSegredo, hashDoSegredo } from "./segredos";

export const VALIDADE_DO_PAREAMENTO_MS = 5 * 60_000;
export const VALIDADE_DO_APARELHO_MS = 30 * 24 * 60 * 60_000;
export const APARELHOS_POR_MENOR = 10;
async function limites(tx: Transacao) {
  await tx.execute(sql`set local statement_timeout='5s'`);
  await tx.execute(sql`set local lock_timeout='2s'`);
  await tx.execute(sql`set local transaction_timeout='15s'`);
}

export async function admitirRetornoNativo(autor: AutorNativoRecente) {
  await db.transaction(async (tx) => {
    await limites(tx);
    const nativo = await autorizarContaNativa(tx, autor);
    await nativo.conferirPrazo(autor.login);
  });
}

export async function lerEstadoDoPinNativo(autor: IdentidadeNativa) {
  return db.transaction(async (tx) => {
    await limites(tx);
    const nativo = await autorizarContaNativa(tx, autor);
    const [pin] = await tx
      .select({ updatedAt: pins.updatedAt })
      .from(pins)
      .where(eq(pins.userId, autor.contaId));
    await nativo.conferirPrazo();
    return { definido: !!pin, atualizadoEm: pin?.updatedAt.toISOString() ?? null };
  });
}

export async function aparelhosDoMenor(autor: IdentidadeNativa, perfilId: PerfilId) {
  return db.transaction(async (tx) => {
    await limites(tx);
    const nativo = await autorizarContaNativa(tx, autor);
    const menor = await autoridadeDoMenor(tx, perfilId, autor.contaId);
    const [atual] = await tx
      .select()
      .from(protection)
      .where(eq(protection.profileId, perfilId))
      .for("share");
    assertAllowed(
      !atual || atual.guardianLinkId === menor.vinculo.id,
      "PERFIL",
      "Perfil não disponível.",
    );
    if (!atual) {
      await nativo.conferirPrazo();
      return { perfil: menor.perfil, pinDefinido: false, aparelhos: [] };
    }
    const linhas = await tx
      .select({
        id: devices.id,
        criadoEm: devices.createdAt,
        expiraEm: devices.expiresAt,
        revogadoEm: devices.revokedAt,
        generation: credentials.accessGeneration,
        confirmado: sql<boolean>`${credentials.tokenHash} is not null`.mapWith(Boolean),
      })
      .from(credentials)
      .innerJoin(devices, eq(devices.id, credentials.deviceSessionId))
      .where(
        and(
          eq(credentials.profileId, perfilId),
          eq(credentials.guardianUserId, autor.contaId),
          eq(credentials.accessGeneration, atual.accessGeneration),
          isNull(devices.revokedAt),
          sql`${devices.expiresAt} > clock_timestamp()`,
        ),
      )
      .orderBy(sql`${devices.createdAt} desc`, devices.id)
      .limit(APARELHOS_POR_MENOR);
    const agora = await nativo.conferirPrazo();
    return {
      perfil: menor.perfil,
      pinDefinido: !!atual?.pinHash,
      aparelhos: linhas.map((linha) => ({
        id: linha.id,
        criadoEm: linha.criadoEm.toISOString(),
        expiraEm: linha.expiraEm.toISOString(),
        estado:
          linha.revogadoEm ||
          linha.expiraEm <= agora ||
          linha.generation !== atual?.accessGeneration
            ? ("encerrado" as const)
            : linha.confirmado
              ? ("ativo" as const)
              : ("aguardando" as const),
      })),
    };
  });
}

export async function revogarUmAparelhoDoMenor(
  autor: AutorNativoRecente,
  perfilId: PerfilId,
  aparelhoId: SessaoDeAparelhoId,
) {
  await db.transaction(async (tx) => {
    await limites(tx);
    const nativo = await autorizarContaNativa(tx, autor);
    const menor = await autoridadeDoMenor(tx, perfilId, autor.contaId);
    await protecaoAtual(tx, perfilId, menor.vinculo.id, "update");
    const [aparelho] = await tx
      .select()
      .from(devices)
      .where(
        and(
          eq(devices.id, aparelhoId),
          eq(devices.kind, "paired_device"),
          eq(devices.activeProfileId, perfilId),
          sql`exists(select 1 from ${credentials} c where c.device_session_id=${devices.id} and c.profile_id=${perfilId} and c.guardian_user_id=${autor.contaId})`,
        ),
      )
      .for("update");
    const agora = await nativo.conferirPrazo(autor.login);
    assertAllowed(aparelho, "APARELHO", "Aparelho não encontrado.");
    if (aparelho.revokedAt) return;
    await tx.update(devices).set({ revokedAt: agora }).where(eq(devices.id, aparelho.id));
    await invalidarIngressosDoAparelho(tx, aparelhoId);
    await encerrarSessoesAbertas(
      tx,
      sql`${games.deviceSessionId}=${aparelho.id} and ${games.profileId}=${perfilId}`,
      "signed_out",
      { porQuem: "conta" },
    );
    await logAuditEventStrict(
      "recreio.device_session_revoked",
      autor.contaId,
      { app: "recreio", profileId: perfilId, deviceSessionId: aparelho.id },
      { writer: tx },
    );
  });
}

/** Encerrar a própria capacidade não concede acesso a outra identidade. */
export async function encerrarAparelhoPareado(aparelhoId: SessaoDeAparelhoId, token: string) {
  await db.transaction(async (tx) => {
    await limites(tx);
    const [aparelho] = await tx
      .select()
      .from(devices)
      .where(
        and(
          eq(devices.id, aparelhoId),
          eq(devices.kind, "paired_device"),
          isNull(devices.userId),
          isNull(devices.authSessionId),
          isNull(devices.revokedAt),
          sql`exists(select 1 from ${credentials} c where c.device_session_id=${devices.id} and c.token_hash=${hashDoSegredo("credencial", `${aparelhoId}.${token}`)})`,
        ),
      )
      .for("update");
    if (!aparelho) return;
    await tx
      .update(devices)
      .set({ revokedAt: await agoraDoBanco(tx) })
      .where(eq(devices.id, aparelho.id));
    await invalidarIngressosDoAparelho(tx, aparelhoId);
    await encerrarSessoesAbertas(tx, sql`${games.deviceSessionId}=${aparelho.id}`, "signed_out", {
      porQuem: "conta",
    });
    await logAuditEventStrict(
      "recreio.device_session_revoked",
      null,
      { app: "recreio", profileId: aparelho.activeProfileId, deviceSessionId: aparelho.id },
      { writer: tx },
    );
  });
}

export async function gravarPinNativo(autor: AutorNativoRecente, hash: string) {
  return db.transaction(async (tx) => {
    await limites(tx);
    const nativo = await autorizarContaNativa(tx, autor);
    const agora = await nativo.conferirPrazo(autor.login);
    const generation = randomUUID();
    await tx
      .insert(pins)
      .values({ userId: autor.contaId, hash, generation, updatedAt: agora })
      .onConflictDoUpdate({ target: pins.userId, set: { hash, generation, updatedAt: agora } });
    await logAuditEventStrict(
      "recreio.protection_pin_changed",
      autor.contaId,
      { app: "recreio", scope: "native", generation },
      { writer: tx },
    );
    return { generation };
  });
}

export async function gravarPinDoMenor(
  autor: AutorNativoRecente,
  perfilId: PerfilId,
  hash: string,
) {
  return db.transaction(async (tx) => {
    await limites(tx);
    const nativo = await autorizarContaNativa(tx, autor);
    const menor = await autoridadeDoMenor(tx, perfilId, autor.contaId);
    await tx
      .insert(protection)
      .values({ profileId: perfilId, guardianLinkId: menor.vinculo.id })
      .onConflictDoNothing({ target: protection.profileId });
    await protecaoAtual(tx, perfilId, menor.vinculo.id, "update");
    const agora = await nativo.conferirPrazo(autor.login);
    const generation = randomUUID();
    await tx
      .update(protection)
      .set({ pinHash: hash, pinGeneration: generation, updatedAt: agora })
      .where(eq(protection.profileId, perfilId));
    await logAuditEventStrict(
      "recreio.protection_pin_changed",
      autor.contaId,
      { app: "recreio", scope: "minor", profileId: perfilId, generation },
      { writer: tx },
    );
    return { generation };
  });
}

/** O segredo só é entregue ao aparelho iniciador pelo adapter de cookie. */
export async function iniciarPedidoDePareamento(segredo: string) {
  const codigo = codigoDoSegredo(segredo);
  return db.transaction(async (tx) => {
    await limites(tx);
    const agora = await agoraDoBanco(tx);
    const expiraEm = new Date(agora.getTime() + VALIDADE_DO_PAREAMENTO_MS);
    const [criado] = await tx
      .insert(requests)
      .values({
        pollHash: hashDoSegredo("consulta", segredo),
        codeHash: hashDoSegredo("codigo", codigo),
        createdAt: agora,
        expiresAt: expiraEm,
      })
      .returning({ id: requests.id });
    assertAllowed(criado, "PAREAMENTO", "Não foi possível preparar o aparelho.");
    return { codigo, expiraEm: expiraEm.toISOString() };
  });
}

export async function aprovarPedidoDePareamento(
  autor: AutorNativoRecente,
  perfilId: PerfilId,
  codigo: string,
) {
  return db.transaction(async (tx) => {
    await limites(tx);
    const nativo = await autorizarContaNativa(tx, autor);
    const menor = await autoridadeDoMenor(tx, perfilId, autor.contaId);
    await tx
      .insert(protection)
      .values({ profileId: perfilId, guardianLinkId: menor.vinculo.id })
      .onConflictDoNothing({ target: protection.profileId });
    const atual = await protecaoAtual(tx, perfilId, menor.vinculo.id, "update");
    const [pedido] = await tx
      .select()
      .from(requests)
      .where(eq(requests.codeHash, hashDoSegredo("codigo", codigo)))
      .for("update");
    const agora = await nativo.conferirPrazo(autor.login);
    assertAllowed(
      pedido && pedido.expiresAt > agora,
      "PAREAMENTO",
      "Código indisponível ou vencido.",
    );
    if (pedido.approvedAt) {
      assertAllowed(
        pedido.profileId === perfilId &&
          pedido.guardianLinkId === menor.vinculo.id &&
          pedido.deviceSessionId,
        "PAREAMENTO",
        "Código indisponível ou vencido.",
      );
      return { aparelhoId: SessaoDeAparelhoIdSchema.parse(pedido.deviceSessionId) };
    }
    const ativos = await tx
      .select({ id: devices.id })
      .from(credentials)
      .innerJoin(devices, eq(devices.id, credentials.deviceSessionId))
      .where(
        and(
          eq(credentials.profileId, perfilId),
          eq(credentials.accessGeneration, atual.accessGeneration),
          eq(credentials.guardianUserId, autor.contaId),
          isNull(devices.revokedAt),
          gt(devices.expiresAt, agora),
        ),
      )
      .limit(APARELHOS_POR_MENOR);
    assertAllowed(
      ativos.length < APARELHOS_POR_MENOR,
      "LIMITE_DE_APARELHOS",
      "Desconecte um aparelho deste perfil antes de parear outro.",
    );
    const [aparelho] = await tx
      .insert(devices)
      .values({
        kind: "paired_device",
        userId: null,
        authSessionId: null,
        activeProfileId: perfilId,
        profileSelectedAt: agora,
        createdAt: agora,
        lastSeenAt: agora,
        expiresAt: new Date(agora.getTime() + VALIDADE_DO_APARELHO_MS),
      })
      .returning({ id: devices.id });
    assertAllowed(aparelho, "PAREAMENTO", "Não foi possível parear o aparelho.");
    await tx.insert(credentials).values({
      deviceSessionId: aparelho.id,
      profileId: perfilId,
      guardianUserId: autor.contaId,
      accessGeneration: atual.accessGeneration,
      createdAt: agora,
    });
    await tx
      .update(requests)
      .set({
        approvedAt: agora,
        profileId: perfilId,
        guardianLinkId: menor.vinculo.id,
        deviceSessionId: aparelho.id,
      })
      .where(eq(requests.id, pedido.id));
    await logAuditEventStrict(
      "recreio.device_paired",
      autor.contaId,
      { app: "recreio", profileId: perfilId, deviceSessionId: aparelho.id },
      { writer: tx },
    );
    return { aparelhoId: SessaoDeAparelhoIdSchema.parse(aparelho.id) };
  });
}

export async function consultarPedidoDePareamento(segredo: string) {
  const pollHash = hashDoSegredo("consulta", segredo);
  const [referencia] = await db.select().from(requests).where(eq(requests.pollHash, pollHash));
  assertAllowed(referencia, "PAREAMENTO", "Pareamento indisponível ou vencido.");
  if (!referencia.approvedAt) {
    return db.transaction(async (tx) => {
      await limites(tx);
      const [pedido] = await tx
        .select()
        .from(requests)
        .where(eq(requests.id, referencia.id))
        .for("share");
      const agora = await agoraDoBanco(tx);
      assertAllowed(
        pedido && pedido.expiresAt > agora,
        "PAREAMENTO",
        "Pareamento indisponível ou vencido.",
      );
      // Aceite que ocorreu entre as leituras será observado na próxima consulta.
      return { estado: "aguardando" as const, expiraEm: pedido.expiresAt.toISOString() };
    });
  }
  assertAllowed(
    referencia.profileId && referencia.guardianLinkId && referencia.deviceSessionId,
    "PAREAMENTO",
    "Pareamento indisponível.",
  );
  const [vinculo] = await db
    .select({ guardianUserId: credentials.guardianUserId })
    .from(credentials)
    .where(eq(credentials.deviceSessionId, referencia.deviceSessionId));
  assertAllowed(vinculo, "PAREAMENTO", "Pareamento indisponível.");
  const perfilId = PerfilIdSchema.parse(referencia.profileId);
  const responsavelId = ContaIdSchema.parse(vinculo.guardianUserId);
  return db.transaction(async (tx) => {
    await limites(tx);
    const menor = await autoridadeDoMenor(tx, perfilId, responsavelId);
    const atual = await protecaoAtual(tx, perfilId, menor.vinculo.id, "share");
    const [pedido] = await tx
      .select()
      .from(requests)
      .where(eq(requests.id, referencia.id))
      .for("update");
    assertAllowed(
      pedido?.deviceSessionId &&
        pedido.profileId === perfilId &&
        pedido.guardianLinkId === menor.vinculo.id &&
        pedido.pollHash === pollHash,
      "PAREAMENTO",
      "Pareamento indisponível.",
    );
    const [aparelho] = await tx
      .select()
      .from(devices)
      .where(eq(devices.id, pedido.deviceSessionId))
      .for("share");
    const [credencial] = await tx
      .select()
      .from(credentials)
      .where(eq(credentials.deviceSessionId, pedido.deviceSessionId))
      .for("update");
    const agora = await menor.conferirPrazo();
    assertAllowed(
      pedido.expiresAt > agora &&
        aparelho?.kind === "paired_device" &&
        aparelho.userId === null &&
        aparelho.authSessionId === null &&
        aparelho.activeProfileId === perfilId &&
        aparelho.revokedAt === null &&
        aparelho.expiresAt > agora &&
        credencial?.profileId === perfilId &&
        credencial.guardianUserId === responsavelId &&
        credencial.accessGeneration === atual.accessGeneration,
      "PAREAMENTO",
      "Pareamento indisponível ou vencido.",
    );
    const segredoFinal = credencialDoSegredo(segredo, aparelho.id);
    const tokenHash = hashDoSegredo("credencial", segredoFinal);
    assertAllowed(
      !credencial.tokenHash || credencial.tokenHash === tokenHash,
      "PAREAMENTO",
      "Pareamento indisponível.",
    );
    if (!credencial.tokenHash) {
      await tx
        .update(credentials)
        .set({ tokenHash })
        .where(eq(credentials.deviceSessionId, aparelho.id));
      await tx.update(requests).set({ claimedAt: agora }).where(eq(requests.id, pedido.id));
    }
    return {
      estado: "pareado" as const,
      credencial: segredoFinal,
      expiraEm: aparelho.expiresAt.toISOString(),
      perfil: menor.perfil,
    };
  });
}

/** Conferência usada por cada pedido do aparelho, nunca uma autorização de gestão. */
export async function lerAparelhoPareado(aparelhoId: SessaoDeAparelhoId, token: string) {
  const [pista] = await db
    .select({ profileId: credentials.profileId, guardianUserId: credentials.guardianUserId })
    .from(credentials)
    .where(eq(credentials.deviceSessionId, aparelhoId));
  if (!pista) return null;
  return db.transaction(async (tx) => {
    await limites(tx);
    const menor = await autoridadeDoMenor(
      tx,
      PerfilIdSchema.parse(pista.profileId),
      ContaIdSchema.parse(pista.guardianUserId),
    );
    const atual = await protecaoAtual(tx, menor.perfil.id, menor.vinculo.id, "share");
    const [aparelho] = await tx
      .select()
      .from(devices)
      .where(eq(devices.id, aparelhoId))
      .for("share");
    const [credencial] = await tx
      .select()
      .from(credentials)
      .where(eq(credentials.deviceSessionId, aparelhoId))
      .for("share");
    const recebido = Buffer.from(hashDoSegredo("credencial", `${aparelhoId}.${token}`), "hex");
    const esperado = credencial?.tokenHash
      ? Buffer.from(credencial.tokenHash, "hex")
      : Buffer.alloc(32);
    const confere = esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
    const agora = await menor.conferirPrazo();
    if (
      !credencial?.tokenHash ||
      !confere ||
      credencial.profileId !== menor.perfil.id ||
      credencial.guardianUserId !== pista.guardianUserId ||
      credencial.accessGeneration !== atual.accessGeneration ||
      aparelho?.kind !== "paired_device" ||
      aparelho.userId !== null ||
      aparelho.authSessionId !== null ||
      aparelho.activeProfileId !== menor.perfil.id ||
      aparelho.revokedAt ||
      aparelho.expiresAt <= agora
    )
      return null;
    return { sessaoDeAparelhoId: aparelhoId, perfil: menor.perfil, expiraEm: aparelho.expiresAt };
  });
}

/** O chamador já admitiu sua autoridade e trava perfil/proteção. Não concede acesso novo. */
export async function revogarAparelhosDoMenorSobTrava(
  tx: Transacao,
  perfilId: PerfilId,
  agora: Date,
) {
  const generation = randomUUID();
  await tx
    .update(protection)
    .set({ accessGeneration: generation, updatedAt: agora })
    .where(eq(protection.profileId, perfilId));
  await tx
    .update(devices)
    .set({ revokedAt: agora })
    .where(
      and(
        isNull(devices.revokedAt),
        or(
          sql`${devices.id} in (select ${credentials.deviceSessionId} from ${credentials} where ${credentials.profileId}=${perfilId})`,
          and(
            eq(devices.kind, "account"),
            eq(devices.activeProfileId, perfilId),
            isNotNull(devices.minorContextGeneration),
          ),
        ),
      ),
    );
  return { generation };
}

export async function revogarAcessoDoMenor(autor: AutorNativoRecente, perfilId: PerfilId) {
  return db.transaction(async (tx) => {
    await limites(tx);
    const nativo = await autorizarContaNativa(tx, autor);
    const menor = await autoridadeDoMenor(tx, perfilId, autor.contaId);
    const atual = await protecaoAtual(tx, perfilId, menor.vinculo.id, "update");
    const agora = await nativo.conferirPrazo(autor.login);
    const { generation } = await revogarAparelhosDoMenorSobTrava(tx, perfilId, agora);
    await invalidarIngressosDoPerfil(tx, perfilId);
    await encerrarSessoesAbertas(tx, sql`${games.profileId}=${perfilId}`, "signed_out", {
      porQuem: "conta",
    });
    await logAuditEventStrict(
      "recreio.minor_access_revoked",
      autor.contaId,
      {
        app: "recreio",
        profileId: perfilId,
        previousGeneration: atual.accessGeneration,
        generation,
      },
      { writer: tx },
    );
    return { generation };
  });
}
