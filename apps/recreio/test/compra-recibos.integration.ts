import { randomUUID } from "node:crypto";
import { db, eq, sql } from "@informach/db";
import {
  recreioGroups as groups,
  recreioPurchaseAuthorizations as purchases,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { AceiteDaCompraSchema, conferirOfertaDaCompra } from "@/features/cobranca/regras";
import { codigoDoBanco, novaConta } from "./apoio";
import { pedidoDaCompra } from "./compra-apoio";

/** Linhas SQL sintéticas; não representam aceite nativo, Stripe ou pagamento. */
async function fixture() {
  const conta = await novaConta();
  const [grupo] = await db.insert(groups).values({ ownerUserId: conta.id }).returning();
  if (!grupo) throw new Error("Grupo ausente");
  const pedido = AceiteDaCompraSchema.parse(pedidoDaCompra());
  const valores = {
    id: pedido.pedidoId,
    payerUserId: conta.id,
    groupId: grupo.id,
    ...conferirOfertaDaCompra(pedido),
    policyVersion: pedido.versaoDasCondicoes,
    adultDeclarationVersion: pedido.versaoDaDeclaracao,
    acceptedAt: new Date(),
  };
  const [linha] = await db.insert(purchases).values(valores).returning();
  if (!linha) throw new Error("Recibo ausente");
  return { conta, grupo, valores, linha };
}

describe("integridade da autorização financeira", () => {
  it("vincula exatamente o titular e o grupo e restringe exclusão/reatribuição", async () => {
    const f = await fixture(),
      outro = await novaConta();
    expect(
      await codigoDoBanco(
        db.update(purchases).set({ payerUserId: outro.id }).where(eq(purchases.id, f.linha.id)),
      ),
    ).toBe("23503");
    expect(
      await codigoDoBanco(
        db.update(groups).set({ ownerUserId: outro.id }).where(eq(groups.id, f.grupo.id)),
      ),
    ).toBe("23503");
    expect(["23001", "23503"]).toContain(
      await codigoDoBanco(db.delete(groups).where(eq(groups.id, f.grupo.id))),
    );
  });
  it("mantém uma autorização ativa; encerrar uma nunca reabre o mesmo recibo", async () => {
    const f = await fixture();
    expect(
      await codigoDoBanco(db.insert(purchases).values({ ...f.valores, id: randomUUID() })),
    ).toBe("23505");
    await db
      .update(purchases)
      .set({ resolvedAt: new Date(), resolution: "not_started" })
      .where(eq(purchases.id, f.linha.id));
    const [segunda] = await db
      .insert(purchases)
      .values({ ...f.valores, id: randomUUID() })
      .returning();
    expect(segunda?.resolvedAt).toBeNull();
  });
  const invalidas = [
    ["resolução sem resultado", sql`resolved_at=accepted_at`],
    ["resultado sem horário", sql`resolution='not_started'`],
    ["resultado desconhecido", sql`resolved_at=accepted_at, resolution='inventado'`],
    ["revisão sem tentativa", sql`review_required=true`],
    ["sessão sem tentativa", sql`provider_session_id='cs_test_sem_tentativa'`],
    ["envio antes do aceite", sql`request_started_at=accepted_at-interval '1 second'`],
    [
      "fechamento antes do aceite",
      sql`resolved_at=accepted_at-interval '1 second',resolution='not_started'`,
    ],
    [
      "não enviado com marca de envio",
      sql`request_started_at=accepted_at,resolved_at=accepted_at,resolution='not_started'`,
    ],
    [
      "concluído sem sessão",
      sql`request_started_at=accepted_at,resolved_at=accepted_at,resolution='checkout_completed'`,
    ],
    ["expirado sem envio", sql`resolved_at=accepted_at,resolution='expired_unpaid'`],
    [
      "revisão de resolvido",
      sql`review_required=true,request_started_at=accepted_at,provider_session_id='cs_test_resolvido',resolved_at=accepted_at,resolution='checkout_completed'`,
    ],
    ["preço zero", sql`amount_cents=0`],
    ["moeda alheia", sql`currency='USD'`],
    ["intervalo alheio", sql`interval='week'`],
    ["tier alheio", sql`tier='admin'`],
    ["modo alheio", sql`provider_mode='desconhecido'`],
    ["versão ausente", sql`policy_version=''`],
  ];
  it.each(invalidas)("recusa %s", async (_nome, alteracao) => {
    const f = await fixture();
    expect(
      await codigoDoBanco(
        db.execute(
          sql`update recreio.purchase_authorizations set ${alteracao} where id=${f.linha.id}`,
        ),
      ),
    ).toBe("23514");
  });
  it("a mesma sessão externa não pode pertencer a dois recibos", async () => {
    const a = await fixture(),
      b = await fixture();
    await db.execute(sql`update recreio.purchase_authorizations set request_started_at=accepted_at,
      provider_session_id='cs_test_compartilhada',resolved_at=accepted_at,resolution='checkout_completed'
      where id=${a.linha.id}`);
    expect(
      await codigoDoBanco(
        db.execute(sql`update recreio.purchase_authorizations set request_started_at=accepted_at,
      provider_session_id='cs_test_compartilhada' where id=${b.linha.id}`),
      ),
    ).toBe("23505");
  });
});
