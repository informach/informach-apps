import { randomUUID } from "node:crypto";
import { AuditPersistenceError } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import {
  customers,
  recreioGroups as groups,
  recreioBillingReconciliations as jobs,
  sessions,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import {
  confirmarConciliacaoLocked,
  iniciarConciliacaoLocked,
  registrarFalhaDaConciliacaoLocked,
  reservarProximaConciliacao,
  type TrabalhoDeConciliacao,
} from "@/features/cobranca/conciliacao-fila-repository";
import { comCicloDeCobranca } from "@/features/cobranca/lifecycle";
import { prepararMinhaCompra } from "@/features/cobranca/service";
import { pedidoDaCompra } from "./compra-apoio";
import { adultoDoTeste } from "./teste-apoio";

/** Queue-only SQL facts in the unused prod fixture partition. No provider is
 * called and successful callbacks do not represent invoice/payment evidence.
 */
async function fixture(comCliente = true) {
  const p = await adultoDoTeste();
  await prepararMinhaCompra(p.autor, pedidoDaCompra());
  const [grupo] = await db.select().from(groups).where(eq(groups.ownerUserId, p.conta.id));
  if (!grupo) throw new Error("Fixture group absent");
  if (comCliente)
    await db
      .insert(customers)
      .values({
        provider: "stripe",
        app: "recreio",
        subjectType: "user",
        subjectId: p.conta.id,
        email: p.conta.email,
        providerCustomerId: `cus_fixture_${randomUUID().replaceAll("-", "")}`,
      });
  await db
    .insert(jobs)
    .values({ payerUserId: p.conta.id, groupId: grupo.id, providerMode: "prod" });
  const linha = async () =>
    (
      await db
        .select()
        .from(jobs)
        .where(and(eq(jobs.payerUserId, p.conta.id), eq(jobs.providerMode, "prod")))
    )[0];
  const ciclo = <T>(op: () => Promise<T>) => comCicloDeCobranca(p.conta.id, op);
  const reservar = async () => {
    const prova = await reservarProximaConciliacao("prod");
    if (!prova || prova.payerUserId !== p.conta.id) throw new Error("Unexpected due fixture payer");
    return prova;
  };
  return { p, grupo, linha, ciclo, reservar };
}

describe("fila recuperável de conciliação financeira", () => {
  it("reserva uma vez e mantém tentativa distinta de confirmação", async () => {
    const f = await fixture();
    const reservas = await Promise.all([
      reservarProximaConciliacao("prod"),
      reservarProximaConciliacao("prod"),
    ]);
    const admitidas = reservas.filter((p): p is TrabalhoDeConciliacao => p !== null);
    expect(admitidas).toHaveLength(1);
    const prova = admitidas[0];
    if (!prova) throw new Error("Missing fixture lease");
    expect(prova.payerUserId).toBe(f.p.conta.id);
    await f.ciclo(async () => {
      const tentativa = await iniciarConciliacaoLocked(prova);
      expect(await f.linha()).toMatchObject({ attemptCount: 1, lastConfirmedAt: null });
      expect(tentativa.customer).not.toBeNull();
      await registrarFalhaDaConciliacaoLocked(tentativa, "provider_unavailable");
    });
    const linha = await f.linha();
    expect(linha).toMatchObject({
      reviewRequired: true,
      reviewReason: "provider_unavailable",
      lastConfirmedAt: null,
      leaseToken: null,
      leaseUntil: null,
    });
    expect(linha?.lastAttemptAt).toBeInstanceOf(Date);
    expect(linha?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 240_000);
  });
  it("o primeiro pagante que falha não impede o próximo", async () => {
    const a = await fixture(false),
      b = await fixture();
    const primeira = await a.reservar();
    await a.ciclo(async () => {
      const tentativa = await iniciarConciliacaoLocked(primeira);
      expect(tentativa.customer).toBeNull();
      await registrarFalhaDaConciliacaoLocked(tentativa, "customer_unconfirmed");
    });
    const segunda = await b.reservar();
    await b.ciclo(async () => {
      const tentativa = await iniciarConciliacaoLocked(segunda);
      await confirmarConciliacaoLocked(tentativa, async () => {});
    });
    expect((await a.linha())?.lastConfirmedAt).toBeNull();
    expect(await b.linha()).toMatchObject({
      reviewRequired: false,
      reviewReason: null,
      leaseToken: null,
    });
    expect((await b.linha())?.lastConfirmedAt).toBeInstanceOf(Date);
  });
  it("login encerrado não impede a captura técnica de uma operação financeira", async () => {
    const f = await fixture(),
      prova = await f.reservar();
    await f.ciclo(async () => {
      const tentativa = await iniciarConciliacaoLocked(prova);
      await db.delete(sessions).where(eq(sessions.id, f.p.autor.login.authSessionId));
      await confirmarConciliacaoLocked(tentativa, async () => {});
    });
    expect((await f.linha())?.lastConfirmedAt).toBeInstanceOf(Date);
  });
  it("falha posterior não apaga nem renova uma confirmação anterior", async () => {
    const f = await fixture(),
      primeira = await f.reservar();
    await f.ciclo(async () =>
      confirmarConciliacaoLocked(await iniciarConciliacaoLocked(primeira), async () => {}),
    );
    const confirmada = (await f.linha())?.lastConfirmedAt;
    await db
      .update(jobs)
      .set({ nextAttemptAt: new Date(Date.now() - 1000) })
      .where(eq(jobs.payerUserId, f.p.conta.id));
    const segunda = await f.reservar();
    await f.ciclo(async () =>
      registrarFalhaDaConciliacaoLocked(
        await iniciarConciliacaoLocked(segunda),
        "provider_unavailable",
      ),
    );
    expect((await f.linha())?.lastConfirmedAt).toEqual(confirmada);
    expect((await f.linha())?.attemptCount).toBe(2);
  });
  it("lease retomada impede resultado do executor anterior", async () => {
    const f = await fixture(),
      primeira = await f.reservar();
    const tentativa = await f.ciclo(() => iniciarConciliacaoLocked(primeira));
    await db.execute(
      sql`update recreio.billing_reconciliations set lease_until=clock_timestamp()-interval '1 microsecond' where payer_user_id=${f.p.conta.id}`,
    );
    const segunda = await f.reservar();
    await expect(
      f.ciclo(() => confirmarConciliacaoLocked(tentativa, async () => {})),
    ).rejects.toMatchObject({ code: "CONFLITO" });
    expect((await f.linha())?.lastConfirmedAt).toBeNull();
    await f.ciclo(async () =>
      registrarFalhaDaConciliacaoLocked(
        await iniciarConciliacaoLocked(segunda),
        "provider_unavailable",
      ),
    );
  });
  it("falha da persistência não confirma e permite registrar a pendência", async () => {
    const f = await fixture(),
      prova = await f.reservar();
    await f.ciclo(async () => {
      const tentativa = await iniciarConciliacaoLocked(prova);
      await expect(
        confirmarConciliacaoLocked(tentativa, async () => {
          throw new Error("Fixture evidence conflict");
        }),
      ).rejects.toThrow("Fixture evidence conflict");
      expect((await f.linha())?.lastConfirmedAt).toBeNull();
      await registrarFalhaDaConciliacaoLocked(tentativa, "evidence_mismatch");
    });
    expect((await f.linha())?.reviewReason).toBe("evidence_mismatch");
  });
  it("falha da auditoria reverte confirmação e evidência na mesma transação", async () => {
    const f = await fixture(),
      prova = await f.reservar();
    const tentativa = await f.ciclo(() => iniciarConciliacaoLocked(prova));
    const clienteId = tentativa.customer?.id;
    if (!clienteId) throw new Error("Fixture financial customer absent");
    await db.execute(sql`create function audit.recusar_conciliacao_recreio() returns trigger language plpgsql as $$
      begin if new.event_type='recreio.billing_reconciled' then raise exception 'fixture audit failure'; end if; return new; end $$`);
    await db.execute(
      sql`create trigger recusar_conciliacao_recreio before insert on audit.events for each row execute function audit.recusar_conciliacao_recreio()`,
    );
    try {
      await expect(
        f.ciclo(() =>
          confirmarConciliacaoLocked(tentativa, async (tx) => {
            await tx
              .update(customers)
              .set({ email: "evidence-rollback@example.test" })
              .where(eq(customers.id, clienteId));
          }),
        ),
      ).rejects.toBeInstanceOf(AuditPersistenceError);
      expect((await f.linha())?.lastConfirmedAt).toBeNull();
      const [cliente] = await db
        .select()
        .from(customers)
        .where(eq(customers.subjectId, f.p.conta.id));
      expect(cliente?.email).toBe(f.p.conta.email);
    } finally {
      await db.execute(sql`drop trigger recusar_conciliacao_recreio on audit.events`);
      await db.execute(sql`drop function audit.recusar_conciliacao_recreio()`);
      await f.ciclo(() => registrarFalhaDaConciliacaoLocked(tentativa, "evidence_mismatch"));
    }
  });
});
