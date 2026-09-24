import { randomUUID } from "node:crypto";
import { db, eq, inArray } from "@informach/db";
import { agendaInboxMessages, agendaProductEvents, users } from "@informach/db/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DOMAIN = "recados.teste.local";
vi.stubEnv("INBOUND_EMAIL_DOMAIN", DOMAIN);

const {
  findInboxMessage,
  listNewInboxMessages,
  MAX_NEW_MESSAGES,
  purgeExpiredInboxMessages,
  setInboxMessageStatus,
} = await import("@/features/inbox/repository");
const { createInboxAddress, receiveInboundEmail, revokeInboxAddress } = await import(
  "@/features/inbox/service"
);

function value<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

let owner: string;
let other: string;

const email = (to: string, subject = "Comunicado da escola") => ({
  to,
  from: '"Profa. Marina" <marina@colegio.com.br>',
  subject,
  text: "Prova de Ciências em 02/10/2026.",
  attachment: null,
});

beforeEach(async () => {
  owner = `inbox-owner-${randomUUID()}`;
  other = `inbox-other-${randomUUID()}`;
  await db.insert(users).values(
    [owner, other].map((id) => ({
      id,
      name: "Adulto fictício",
      email: `${id}@e2e.local`,
      emailVerified: true,
    })),
  );
});
afterEach(async () => {
  await db.delete(agendaProductEvents).where(inArray(agendaProductEvents.userId, [owner, other]));
  await db.delete(users).where(inArray(users.id, [owner, other]));
});

describe("recado por e-mail", () => {
  it("delivers to the family that owns the address, and to nobody else", async () => {
    const address = value(await createInboxAddress(owner)).address;
    expect(address.endsWith(`@${DOMAIN}`)).toBe(true);

    expect(value(await receiveInboundEmail(email(address)))).toMatchObject({
      id: expect.any(String),
    });
    const inbox = await listNewInboxMessages(owner);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({
      subject: "Comunicado da escola",
      fromDomain: "colegio.com.br",
    });
    // Do remetente fica o domínio; o endereço completo é dado de terceiro.
    const [stored] = await db
      .select()
      .from(agendaInboxMessages)
      .where(eq(agendaInboxMessages.ownerUserId, owner));
    expect(stored?.fromHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain("marina@colegio.com.br");
    expect(await listNewInboxMessages(other)).toHaveLength(0);
  });
  it("refuses an address that is not ours, and one that was revoked", async () => {
    const address = value(await createInboxAddress(owner)).address;
    expect(await receiveInboundEmail(email(`recados+NAOEXISTE23@${DOMAIN}`))).toMatchObject({
      ok: false,
      error: { code: "UNKNOWN_ADDRESS" },
    });
    expect(await receiveInboundEmail(email("outro@dominio.com"))).toMatchObject({
      ok: false,
      error: { code: "UNKNOWN_ADDRESS" },
    });
    value(await revokeInboxAddress(owner));
    expect(await receiveInboundEmail(email(address))).toMatchObject({
      ok: false,
      error: { code: "UNKNOWN_ADDRESS" },
    });
  });
  it("rotating the address retires the previous one immediately", async () => {
    const first = value(await createInboxAddress(owner)).address;
    const second = value(await createInboxAddress(owner)).address;
    expect(second).not.toBe(first);
    expect(await receiveInboundEmail(email(first))).toMatchObject({
      ok: false,
      error: { code: "UNKNOWN_ADDRESS" },
    });
    expect(value(await receiveInboundEmail(email(second)))).toMatchObject({
      id: expect.any(String),
    });
  });
  it("caps the box so it stays a step, not an archive", async () => {
    const address = value(await createInboxAddress(owner)).address;
    for (let i = 0; i < MAX_NEW_MESSAGES; i += 1)
      value(await receiveInboundEmail(email(address, `Comunicado ${i}`)));
    expect(await receiveInboundEmail(email(address))).toMatchObject({
      ok: false,
      error: { code: "INBOX_FULL" },
    });
    // Organizar ou descartar libera espaço.
    const inbox = await listNewInboxMessages(owner);
    const first = inbox[0];
    if (!first) throw new Error("fixture");
    expect(await setInboxMessageStatus(owner, first.id, "discarded")).toBe(true);
    expect(value(await receiveInboundEmail(email(address)))).toMatchObject({
      id: expect.any(String),
    });
  });
  it("only the owning family can open or discard a message", async () => {
    const address = value(await createInboxAddress(owner)).address;
    const { id } = value(await receiveInboundEmail(email(address)));
    expect(await findInboxMessage(other, id)).toBeNull();
    expect(await setInboxMessageStatus(other, id, "discarded")).toBe(false);
    expect(await findInboxMessage(owner, id)).not.toBeNull();
  });
  it("forgets what nobody organised within the retention window", async () => {
    const address = value(await createInboxAddress(owner)).address;
    const { id } = value(await receiveInboundEmail(email(address), new Date(Date.now() - 1000)));
    await db
      .update(agendaInboxMessages)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(agendaInboxMessages.id, id));
    await purgeExpiredInboxMessages(new Date());
    expect(await listNewInboxMessages(owner)).toHaveLength(0);
  });
});
