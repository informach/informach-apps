import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, db, eq, gt, isNull, sql } from "@informach/db";
import {
  estrelaChildren as children,
  estrelaFamilies as families,
  estrelaGuardians as guardians,
  estrelaGuardianInvitations as invitations,
  users,
} from "@informach/db/schema";
import { assertAllowed } from "@/lib/errors";
import { lockOwner } from "../familia/repository";

export const INVITE_LIFETIME_MS = 72 * 3_600_000;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function guardianState(ownerId: string) {
  const [guardian] = await db
    .select({ id: guardians.id, userId: guardians.userId, email: users.email, name: users.name })
    .from(guardians)
    .innerJoin(users, eq(guardians.userId, users.id))
    .where(eq(guardians.ownerUserId, ownerId));
  const [invite] = await db
    .select({ id: invitations.id, email: invitations.email, expiresAt: invitations.expiresAt })
    .from(invitations)
    .where(
      and(
        eq(invitations.ownerUserId, ownerId),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    );
  return { guardian: guardian ?? null, invite: invite ?? null };
}

/** Convite novo revoga o anterior. O link é a única cópia do token. */
export async function createInvitation(ownerId: string, email: string) {
  const token = randomBytes(32).toString("hex");
  return db.transaction(async (tx) => {
    await lockOwner(tx, ownerId);
    const [atual] = await tx
      .select({ id: guardians.id })
      .from(guardians)
      .where(eq(guardians.ownerUserId, ownerId));
    assertAllowed(
      !atual,
      "GUARDIAN",
      "A família já tem um segundo responsável. Remova antes de convidar outro.",
    );
    const [dono] = await tx.select({ email: users.email }).from(users).where(eq(users.id, ownerId));
    assertAllowed(
      dono?.email.toLowerCase() !== email.toLowerCase(),
      "SELF",
      "Convide outra pessoa: este é o seu e-mail.",
    );
    await tx
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(invitations.ownerUserId, ownerId),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      );
    const [row] = await tx
      .insert(invitations)
      .values({
        ownerUserId: ownerId,
        email: email.toLowerCase(),
        tokenHash: hash(token),
        expiresAt: new Date(Date.now() + INVITE_LIFETIME_MS),
      })
      .returning({ id: invitations.id });
    assertAllowed(row, "INVITE", "Não foi possível criar o convite.");
    return { id: row.id, token };
  });
}

export async function revokeInvitation(ownerId: string) {
  await db
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(invitations.ownerUserId, ownerId),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
      ),
    );
}

export async function invitationPreview(token: string) {
  if (!/^[a-f\d]{64}$/.test(token)) return null;
  const [row] = await db
    .select({
      ownerUserId: invitations.ownerUserId,
      email: invitations.email,
      expiresAt: invitations.expiresAt,
      ownerName: users.name,
    })
    .from(invitations)
    .innerJoin(users, eq(invitations.ownerUserId, users.id))
    .where(
      and(
        eq(invitations.tokenHash, hash(token)),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    );
  return row ?? null;
}

/**
 * Aceite: o e-mail confirmado da conta tem de ser o do convite, e a pessoa não
 * pode ter crianças numa família própria (uma família por pessoa).
 */
export async function acceptInvitation(token: string, user: { id: string; email: string }) {
  assertAllowed(/^[a-f\d]{64}$/.test(token), "INVITE", "Este convite não vale mais.");
  return db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.tokenHash, hash(token)),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, new Date()),
        ),
      )
      .for("update");
    assertAllowed(invite, "INVITE", "Este convite não vale mais. Peça um novo.");
    await lockOwner(tx, invite.ownerUserId);
    assertAllowed(
      invite.email === user.email.toLowerCase(),
      "EMAIL",
      "Entre com o e-mail que recebeu o convite.",
    );
    assertAllowed(invite.ownerUserId !== user.id, "SELF", "Este convite é para outra pessoa.");
    const [propria] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(children)
      .where(eq(children.userId, user.id));
    assertAllowed(
      !propria?.n,
      "OWN_FAMILY",
      "Sua conta já tem crianças cadastradas. Use outra conta para ser segundo responsável.",
    );
    const [jaE] = await tx
      .select({ id: guardians.id })
      .from(guardians)
      .where(eq(guardians.userId, user.id));
    assertAllowed(!jaE, "OTHER_FAMILY", "Sua conta já é segundo responsável de outra família.");
    const [ocupada] = await tx
      .select({ id: guardians.id })
      .from(guardians)
      .where(eq(guardians.ownerUserId, invite.ownerUserId));
    assertAllowed(!ocupada, "GUARDIAN", "Esta família já tem um segundo responsável.");
    await tx.delete(families).where(eq(families.userId, user.id));
    await tx.insert(guardians).values({ ownerUserId: invite.ownerUserId, userId: user.id });
    await tx
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(eq(invitations.id, invite.id));
    return invite.ownerUserId;
  });
}

export async function removeGuardian(ownerId: string) {
  const rows = await db
    .delete(guardians)
    .where(eq(guardians.ownerUserId, ownerId))
    .returning({ userId: guardians.userId });
  return rows[0]?.userId ?? null;
}

/** O próprio segundo responsável sai da família. */
export async function leaveFamily(userId: string) {
  const rows = await db
    .delete(guardians)
    .where(eq(guardians.userId, userId))
    .returning({ ownerUserId: guardians.ownerUserId });
  return rows[0]?.ownerUserId ?? null;
}
