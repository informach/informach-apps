import { describe, expect, it } from "vitest";
import { fixtureDeFinanciamento as fixture } from "../../../test/financiamento-stripe-apoio";
import { conferirMarcaFinanceira } from "./financiamento-stripe";

describe("conferência privada do saldo e da origem das faturas", () => {
  it("reuses captured facts and proves annual credit/zero-paid renewal without changing ordinary coverage", async () => {
    const f = fixture(),
      result = await f.read();
    expect(result?.snapshot.periods).toHaveLength(1);
    expect(result?.snapshot.periods[0]?.priceId).toBe("price_annual");
    expect(result?.financiamento.periodos).toHaveLength(3);
    expect(
      result?.financiamento.periodos.every(
        (p) => p.estado === "comprovado" && p.capturasDeOrigem.join() === "ch_funding",
      ),
    ).toBe(true);
    expect(
      result?.financiamento.periodos.find((p) => p.linhaId === "il_original")?.cobertoAte,
    ).toBe(1795032000);
    expect(result?.financiamento.ultimaMovimentacaoId).toBe("cbtxn_renewal");
    expect(f.paths.filter((p) => p === "/v1/payment_intents/pi_funding")).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("not-returned@example.test");
  });
  it("a fully refunded origin revokes every dependent proof without rewriting own invoice flags", async () => {
    const f = fixture();
    f.charge.amount_refunded = 59900;
    f.charge.refunded = true;
    const result = await f.read();
    expect(result?.financiamento.periodos.every((p) => p.estado === "revogado")).toBe(true);
    expect(result?.snapshot.periods[0]?.fullyRefunded).toBe(true);
    expect(result?.fatos.invoices.find((i) => i.id === "in_renewal")?.amountPaidCents).toBe(0);
  });
  it("detects a balance change or a new same-balance ledger head before returning proof", async () => {
    for (const kind of ["balance", "head"]) {
      const f = fixture();
      if (kind === "balance") f.changeBalance();
      else f.changeHead();
      await expect(f.read()).rejects.toMatchObject({ motivo: "saldo_alterado_durante_a_leitura" });
    }
  });
  it("bounds duplicate ledger pagination without creating any remote resource", async () => {
    const f = fixture();
    f.repeatLedger();
    await expect(f.read()).rejects.toMatchObject({ motivo: "ledger_repetido_ou_excessivo" });
    expect(f.paths.filter((p) => p.endsWith("/balance_transactions"))).toHaveLength(2);
  });
  it("refuses another customer/mode/currency in the ledger", async () => {
    for (const change of [
      (f: ReturnType<typeof fixture>) => {
        const m = f.ledger[0];
        if (m) m.customer = "cus_foreign";
      },
      (f: ReturnType<typeof fixture>) => {
        const m = f.ledger[0];
        if (m) m.livemode = true;
      },
      (f: ReturnType<typeof fixture>) => {
        const m = f.ledger[0];
        if (m) m.currency = "usd";
      },
    ]) {
      const f = fixture();
      change(f);
      await expect(f.read()).rejects.toMatchObject({ motivo: "movimento_fora_do_escopo" });
    }
  });
  it("final contract read rejects a concurrent price change", async () => {
    const f = fixture();
    f.changeContract();
    await expect(f.read()).rejects.toMatchObject({ motivo: "contrato_alterado_durante_a_leitura" });
  });
  it("caller customer identity is a boundary, not an inference from provider responses", async () => {
    const f = fixture();
    await expect(
      f.conference.conferir(
        { ...f.input, clienteId: "cus_foreign" },
        { deadlineMs: Date.now() + 90_000 },
      ),
    ).rejects.toMatchObject({ motivo: "fatos_fora_do_escopo" });
    expect(f.paths.some((p) => p.startsWith("/v1/customers/"))).toBe(false);
  });
  it("an expired deadline refuses even the initial provider request", async () => {
    const f = fixture();
    await expect(
      f.conference.conferir(f.input, { deadlineMs: Date.now() - 1 }),
    ).rejects.toMatchObject({ motivo: "prazo_da_leitura" });
    expect(f.paths).toEqual([]);
  });
  it("composes canceled and current contracts before tracing a carried customer credit", async () => {
    const f = fixture(),
      following = f.followingContract();
    await expect(f.read()).rejects.toMatchObject({ motivo: "ledger_sem_origem_unica" });
    const result = await f.conference.conferirCliente(
      {
        clienteId: f.input.clienteId,
        paganteId: "payer_fixture",
        assinaturaIds: [f.input.assinaturaId, following.id],
        precosAceitos: f.input.precosAceitos,
      },
      { deadlineMs: Date.now() + 90_000 },
    );
    conferirMarcaFinanceira(result);
    expect(result.leituras).toHaveLength(2);
    expect(result.leituras.map((l) => l.snapshot.status)).toEqual(["canceled", "active"]);
    expect(result.financiamento.periodos).toHaveLength(4);
    expect(result.financiamento.periodos.find((p) => p.faturaId === "in_following")).toMatchObject({
      estado: "comprovado",
      capturasDeOrigem: ["ch_funding"],
    });
    expect(result.leituras[1]?.snapshot.periods).toEqual([]);
  });
  it("an old source refund also revokes credit used by a later contract", async () => {
    const f = fixture(),
      following = f.followingContract();
    f.charge.amount_refunded = 59900;
    f.charge.refunded = true;
    const result = await f.conference.conferirCliente(
      {
        clienteId: f.input.clienteId,
        paganteId: "payer_fixture",
        assinaturaIds: [f.input.assinaturaId, following.id],
        precosAceitos: f.input.precosAceitos,
      },
      { deadlineMs: Date.now() + 90_000 },
    );
    expect(result.financiamento.periodos.find((p) => p.faturaId === "in_following")?.estado).toBe(
      "revogado",
    );
  });
  it("another adult's metadata never becomes a native source merely by sharing a customer response", async () => {
    const f = fixture(),
      following = f.followingContract();
    following.metadata.subject_id = "foreign_payer";
    await expect(
      f.conference.conferirCliente(
        {
          clienteId: f.input.clienteId,
          paganteId: "payer_fixture",
          assinaturaIds: [f.input.assinaturaId, following.id],
          precosAceitos: f.input.precosAceitos,
        },
        { deadlineMs: Date.now() + 90_000 },
      ),
    ).rejects.toMatchObject({ motivo: "origem_comercial_de_outro_pagante" });
    expect(f.paths.some((p) => p.endsWith("/balance_transactions"))).toBe(false);
  });
  it("duplicate or omitted contract inventory cannot create a complete funding proof", async () => {
    const f = fixture(),
      input = {
        clienteId: f.input.clienteId,
        paganteId: "payer_fixture",
        assinaturaIds: [f.input.assinaturaId, f.input.assinaturaId],
        precosAceitos: f.input.precosAceitos,
      };
    await expect(
      f.conference.conferirCliente(input, { deadlineMs: Date.now() + 90_000 }),
    ).rejects.toMatchObject({ motivo: "inventario_de_contratos_invalido" });
    expect(f.paths).toEqual([]);
    await expect(
      f.conference.conferirCliente(
        { ...input, assinaturaIds: [] },
        { deadlineMs: Date.now() + 90_000 },
      ),
    ).rejects.toMatchObject({ motivo: "ledger_sem_origem_unica" });
  });
});
