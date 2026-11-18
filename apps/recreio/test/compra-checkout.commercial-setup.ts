import { randomUUID } from "node:crypto";
import { CheckoutPendingError } from "@informach/billing";
import { db, eq } from "@informach/db";
import { checkoutIntents, customers } from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { comCicloDeCobranca } from "@/features/cobranca/lifecycle";
import { fixtureDeCheckout as fixture } from "./compra-stripe-apoio";

describe("Checkout vinculado a aceite financeiro durável", () => {
  it("resposta perdida é lida do provedor; recibo, chave e prazo não se renovam", async () => {
    const f = await fixture();
    f.perderProximaResposta();
    await expect(f.enviar()).rejects.toThrow();
    expect(f.sessions).toHaveLength(1);
    const [cliente] = await db
      .select()
      .from(customers)
      .where(eq(customers.subjectId, f.adulto.conta.id));
    if (!cliente) throw new Error("Cliente local ausente");
    const [antes] = await db
      .select()
      .from(checkoutIntents)
      .where(eq(checkoutIntents.customerId, cliente.id));
    expect(antes).toMatchObject({ id: f.recibo.id, requestStarted: true, providerSessionId: null });
    expect(antes?.request.expiresAt).toBe(f.authorization.expiresAt);
    const inspeccionado = await f.inspect();
    expect(inspeccionado?.state).toMatchObject({ id: f.sessions[0]?.id, status: "open" });
    const recuperada = await f.enviar();
    expect(recuperada.sessionId).toBe(f.sessions[0]?.id);
    expect(f.sessions).toHaveLength(1);
    const [depois] = await db
      .select()
      .from(checkoutIntents)
      .where(eq(checkoutIntents.customerId, cliente.id));
    expect(depois?.id).toBe(antes?.id);
    expect(depois?.request).toEqual(antes?.request);
    expect(f.sessions[0]?.expires_at).toBe(f.authorization.expiresAt);
    expect(await f.inspect(randomUUID())).toBeNull();
  });
  it("tentativa expirada não é substituída sob o aceite antigo", async () => {
    const f = await fixture();
    await f.enviar();
    const primeira = f.sessions[0];
    if (!primeira) throw new Error("Sessão ausente");
    primeira.status = "expired";
    await expect(f.enviar()).rejects.toBeInstanceOf(CheckoutPendingError);
    expect(f.sessions).toHaveLength(1);
    expect((await f.inspect())?.state?.status).toBe("expired");
  });
  it("outro aceite ou prazo não toma uma tentativa ainda pendente", async () => {
    const f = await fixture();
    await f.enviar();
    for (const managedAuthorization of [
      { ...f.authorization, id: randomUUID() },
      { ...f.authorization, expiresAt: f.authorization.expiresAt + 60 },
    ])
      await expect(
        comCicloDeCobranca(f.adulto.conta.id, () =>
          f.billing.createSubscriptionCheckout({ ...f.entrada, managedAuthorization }),
        ),
      ).rejects.toBeInstanceOf(CheckoutPendingError);
    expect(f.sessions).toHaveLength(1);
    expect((await f.inspect())?.state?.id).toBe(f.sessions[0]?.id);
  });
  it("autorização inválida ou vencida é recusada antes de criar cliente externo", async () => {
    const f = await fixture();
    for (const managedAuthorization of [
      { ...f.authorization, id: "outra" },
      { ...f.authorization, expiresAt: 1 },
    ])
      await expect(
        f.billing.createSubscriptionCheckout({ ...f.entrada, managedAuthorization }),
      ).rejects.toThrow("authorization");
    await expect(
      f.billing.createSubscriptionCheckout({ ...f.entrada, actorId: randomUUID() }),
    ).rejects.toThrow("own payer");
    expect(
      await db.select().from(customers).where(eq(customers.subjectId, f.adulto.conta.id)),
    ).toEqual([]);
    expect(f.sessions).toEqual([]);
  });
});
