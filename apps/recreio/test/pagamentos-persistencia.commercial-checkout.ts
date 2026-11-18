import { randomUUID } from "node:crypto";
import type { SubscriptionPaymentSnapshot } from "@informach/billing/payment-facts";
import { persistUserPaymentSnapshots } from "@informach/billing/user-payment-snapshots";
import { and, db, eq } from "@informach/db";
import {
  customers,
  subscriptionPaymentPeriods as periods,
  subscriptions,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { comCicloDeCobranca } from "@/features/cobranca/lifecycle";
import { fixtureDeCheckout } from "./compra-stripe-apoio";

/** Native admission/customer creation are exercised through the real SDK HTTP
 * fixture. Payment snapshots below are explicit SQL test evidence, not sandbox
 * communication, settlement, production entitlement or a real charged invoice.
 */
async function fixture() {
  const f = await fixtureDeCheckout();
  await f.enviar();
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.app, "recreio"), eq(customers.subjectId, f.adulto.conta.id)));
  if (!customer) throw new Error("Fixture customer absent");
  const now = new Date();
  const start = new Date(now.getTime() - 60_000),
    end = new Date(now.getTime() + 86_400_000);
  const product = f.products.find((p) => p.id === f.entrada.productId);
  if (!product) throw new Error("Fixture product absent");
  const snapshot: SubscriptionPaymentSnapshot = {
    customerId: customer.providerCustomerId,
    subscriptionId: `sub_fixture_${randomUUID()}`,
    priceId: product.stripePriceId.dev,
    status: "active",
    start,
    end,
    trialEnd: null,
    canceledAt: null,
    cancelAtPeriodEnd: false,
    observedAt: now,
    periods: [
      {
        invoiceId: `in_fixture_${randomUUID()}`,
        lineId: `il_fixture_${randomUUID()}`,
        priceId: product.stripePriceId.dev,
        start,
        end,
        paidAt: new Date(start.getTime() + 1000),
        fullyRefunded: false,
        disputed: false,
      },
    ],
  };
  const input = {
    app: "recreio",
    payerId: f.adulto.conta.id,
    customerId: customer.id,
    providerCustomerId: customer.providerCustomerId,
    mode: "dev" as const,
    products: f.products,
    snapshots: [snapshot],
  };
  const persistir = (snapshots: readonly SubscriptionPaymentSnapshot[] = [snapshot]) =>
    comCicloDeCobranca(f.adulto.conta.id, () =>
      persistUserPaymentSnapshots(db, { ...input, snapshots }),
    );
  const ler = () =>
    db.select().from(subscriptions).where(eq(subscriptions.customerId, customer.id));
  return { f, snapshot, input, persistir, ler };
}

describe("persistência atômica de observações financeiras por app e pagante", () => {
  it("preserva identidade e replays; fatos adversos posteriores atualizam apenas a fatura exata", async () => {
    const f = await fixture();
    const atual = f.snapshot.periods[0];
    if (!atual) throw new Error("Fixture paid period absent");
    const anterior = {
      ...atual,
      invoiceId: `in_history_${randomUUID()}`,
      lineId: `il_history_${randomUUID()}`,
      start: new Date(atual.start.getTime() - 86_400_000),
      end: atual.start,
      paidAt: new Date(atual.paidAt.getTime() - 86_400_000),
    };
    f.snapshot.periods.unshift(anterior);
    const ids = await f.persistir();
    const id = ids[0];
    if (!id) throw new Error("Fixture subscription absent");
    expect(await f.persistir()).toEqual(ids);
    expect(await f.ler()).toHaveLength(1);
    const next = {
      ...f.snapshot,
      observedAt: new Date(f.snapshot.observedAt.getTime() + 1000),
      periods: f.snapshot.periods.map((p) => ({
        ...p,
        disputed: p.invoiceId === anterior.invoiceId,
      })),
    };
    await f.persistir([next]);
    const facts = await db.select().from(periods).where(eq(periods.subscriptionId, id));
    expect(facts).toHaveLength(2);
    expect(facts.find((p) => p.providerInvoiceId === anterior.invoiceId)?.disputed).toBe(true);
    expect(facts.find((p) => p.providerInvoiceId === atual.invoiceId)?.disputed).toBe(false);
  });
  it.each(["app", "pagante", "customer"])(
    "escopo alheio de %s recusa antes da escrita",
    async (tipo) => {
      const f = await fixture();
      const other =
        tipo === "app"
          ? { app: "edi" }
          : tipo === "pagante"
            ? { payerId: randomUUID() }
            : { providerCustomerId: "cus_foreign_fixture" };
      await expect(persistUserPaymentSnapshots(db, { ...f.input, ...other })).rejects.toThrow(
        "payer and app",
      );
      expect(await f.ler()).toEqual([]);
    },
  );
  it("colisão de assinatura externa não move nem altera o contrato de outra conta", async () => {
    const a = await fixture(),
      b = await fixture();
    await a.persistir();
    await expect(
      b.persistir([{ ...b.snapshot, subscriptionId: a.snapshot.subscriptionId, status: "paused" }]),
    ).rejects.toThrow("another commercial account");
    expect((await a.ler())[0]?.status).toBe("active");
    expect(await b.ler()).toEqual([]);
  });
  it("observação incompleta conserva assinatura, período e confirmação anteriores", async () => {
    const f = await fixture(),
      ids = await f.persistir();
    const id = ids[0];
    if (!id) throw new Error("Fixture subscription absent");
    const before = await f.ler();
    await expect(
      f.persistir([
        {
          ...f.snapshot,
          status: "paused",
          periods: [],
          observedAt: new Date(f.snapshot.observedAt.getTime() + 1000),
        },
      ]),
    ).rejects.toThrow("requires reconciliation");
    expect(await f.ler()).toEqual(before);
    expect(await db.select().from(periods).where(eq(periods.subscriptionId, id))).toHaveLength(1);
    await expect(f.persistir([])).rejects.toThrow("requires reconciliation");
    expect(await f.ler()).toEqual(before);
  });
  it("identidade imutável divergente reverte a observação inteira", async () => {
    const f = await fixture();
    await f.persistir();
    const before = await f.ler();
    await expect(
      f.persistir([
        {
          ...f.snapshot,
          status: "paused",
          observedAt: new Date(f.snapshot.observedAt.getTime() + 1000),
          periods: f.snapshot.periods.map((p) => ({
            ...p,
            paidAt: new Date(p.paidAt.getTime() + 1000),
          })),
        },
      ]),
    ).rejects.toThrow("immutable period changed");
    expect(await f.ler()).toEqual(before);
  });
  it("observação antiga ou contraditória no mesmo instante não renova a evidência", async () => {
    const f = await fixture();
    await f.persistir();
    const before = await f.ler();
    await expect(
      f.persistir([
        { ...f.snapshot, observedAt: new Date(f.snapshot.observedAt.getTime() - 1000) },
      ]),
    ).rejects.toThrow("requires reconciliation");
    await expect(f.persistir([{ ...f.snapshot, status: "paused" }])).rejects.toThrow(
      "requires reconciliation",
    );
    expect(await f.ler()).toEqual(before);
  });
  it("falha no segundo contrato desfaz os fatos novos do primeiro", async () => {
    const a = await fixture(),
      b = await fixture();
    await b.persistir();
    await expect(
      a.persistir([a.snapshot, { ...a.snapshot, subscriptionId: b.snapshot.subscriptionId }]),
    ).rejects.toThrow("another commercial account");
    expect(await a.ler()).toEqual([]);
    expect((await b.ler())[0]?.status).toBe("active");
  });
});
