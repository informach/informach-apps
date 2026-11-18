import { db, eq } from "@informach/db";
import {
  customers,
  recreioPurchaseAuthorizations as purchases,
  recreioEntitlements,
  sessions,
} from "@informach/db/schema";
import { VERSAO_DA_RESPONSABILIDADE } from "@informach/recreio";
import { describe, expect, it } from "vitest";
import { criarExecutorDeCompra } from "@/features/cobranca/execucao-service";
import { consultarMinhaCompra } from "@/features/cobranca/service";
import { cadastrarPerfilMenor, prepararPerfilMenor } from "@/features/familia/service";
import {
  definirPinDaConta,
  definirPinDoMenor,
  trocarPerfilComPin,
} from "@/features/protecao/service";
import { fixtureDeCheckout } from "./compra-stripe-apoio";
import { adultoDoTeste } from "./teste-apoio";

describe("executor financeiro nativo com PostgreSQL e SDK Stripe por transporte fechado", () => {
  it("registra a sessão externa e devolve o destino sem conceder acesso", async () => {
    const f = await fixtureDeCheckout();
    const executar = criarExecutorDeCompra(() => f.runtime);
    const resultado = await executar(f.adulto.autor, f.recibo.id);
    expect(resultado).toMatchObject({
      tipo: "checkout",
      destino: f.sessions[0]?.url,
      recibo: { id: f.recibo.id, emConferencia: false, resolucao: null },
    });
    expect(f.sessions).toHaveLength(1);
    const [linha] = await db.select().from(purchases).where(eq(purchases.id, f.recibo.id));
    expect(linha?.providerSessionId).toBe(f.sessions[0]?.id);
    if (!linha) throw new Error("Native purchase absent");
    expect(
      await db
        .select()
        .from(recreioEntitlements)
        .where(eq(recreioEntitlements.groupId, linha.groupId)),
    ).toEqual([]);
    const repetida = await executar(f.adulto.autor, f.recibo.id);
    expect(repetida).toEqual(resultado);
    expect(f.sessions).toHaveLength(1);
  });
  it("resposta perdida recupera por leitura e conserva a mesma sessão e validade", async () => {
    const f = await fixtureDeCheckout();
    f.perderProximaResposta();
    const resultado = await criarExecutorDeCompra(() => f.runtime)(f.adulto.autor, f.recibo.id);
    expect(resultado.tipo).toBe("checkout");
    expect(f.sessions).toHaveLength(1);
    expect(f.sessions[0]?.expires_at).toBe(f.authorization.expiresAt);
  });
  it("indisponibilidade após criação mantém revisão e recuperação não duplica a tentativa", async () => {
    const f = await fixtureDeCheckout();
    f.aposPersistir(async () => f.indisponibilizarInspecao());
    const executar = criarExecutorDeCompra(() => f.runtime);
    await expect(executar(f.adulto.autor, f.recibo.id)).rejects.toMatchObject({
      code: "COBRANCA_EM_CONFERENCIA",
    });
    expect(await consultarMinhaCompra(f.adulto.autor)).toMatchObject({
      emConferencia: true,
      resolucao: null,
    });
    expect(f.sessions).toHaveLength(1);
    f.restaurarInspecao();
    expect((await executar(f.adulto.autor, f.recibo.id)).tipo).toBe("checkout");
    expect(f.sessions).toHaveLength(1);
    expect(f.sessions[0]?.expires_at).toBe(f.authorization.expiresAt);
  });
  it.each(["open", "complete", "expired"])(
    "logout durante I/O captura %s sem devolver dados financeiros",
    async (status) => {
      const f = await fixtureDeCheckout();
      f.aposPersistir(async () => {
        const session = f.sessions[0];
        if (!session) throw new Error("Fixture external session absent");
        session.status = status;
        if (status === "complete") session.subscription = "sub_test_native";
        await db.delete(sessions).where(eq(sessions.id, f.adulto.autor.login.authSessionId));
      });
      await expect(
        criarExecutorDeCompra(() => f.runtime)(f.adulto.autor, f.recibo.id),
      ).rejects.toMatchObject({ code: "AUTH" });
      const [linha] = await db.select().from(purchases).where(eq(purchases.id, f.recibo.id));
      expect(linha?.providerSessionId).toBe(f.sessions[0]?.id);
      expect(linha?.resolution).toBe(status === "expired" ? "expired_unpaid" : null);
      expect(linha?.reviewRequired).toBe(status === "complete");
    },
  );
  it("troca real para PIN infantil durante o I/O captura a sessão e recusa sua devolução", async () => {
    const f = await fixtureDeCheckout(),
      p = f.adulto;
    const intencao = await prepararPerfilMenor(p.autor);
    const { perfil } = await cadastrarPerfilMenor(p.autor, {
      intencaoId: intencao.id,
      perfil: { apelido: "Protegido", avatar: "padrao" },
      nascimento: { ano: new Date().getUTCFullYear() - 8, mes: 1 },
      assumoResponsabilidade: true,
      versaoDaDeclaracao: VERSAO_DA_RESPONSABILIDADE,
    });
    await definirPinDaConta(p.autor, { pin: "593871" });
    await definirPinDoMenor(p.autor, { perfilId: perfil.id, pin: "396175" });
    f.aposPersistir(async () => {
      await trocarPerfilComPin(p.autor, {
        destino: { tipo: "perfil", perfilId: perfil.id },
        pin: "396175",
      });
    });
    await expect(
      criarExecutorDeCompra(() => f.runtime)(p.autor, f.recibo.id),
    ).rejects.toMatchObject({ code: "AUTH" });
    const [linha] = await db.select().from(purchases).where(eq(purchases.id, f.recibo.id));
    expect(linha?.providerSessionId).toBe(f.sessions[0]?.id);
    await expect(consultarMinhaCompra(p.autor)).rejects.toMatchObject({ code: "AUTH" });
  });
  it("catálogo divergente recusa antes da marca de envio e do customer", async () => {
    const f = await fixtureDeCheckout();
    for (const preco of f.prices) preco.unit_amount = 1;
    await expect(
      criarExecutorDeCompra(() => f.runtime)(f.adulto.autor, f.recibo.id),
    ).rejects.toThrow();
    expect((await consultarMinhaCompra(f.adulto.autor))?.tentativaIniciadaEm).toBeNull();
    expect(
      await db.select().from(customers).where(eq(customers.subjectId, f.adulto.conta.id)),
    ).toEqual([]);
    expect(f.sessions).toEqual([]);
  });
  it("destino adulterado mantém revisão e não sai do portal", async () => {
    const f = await fixtureDeCheckout();
    f.aposPersistir(async () => {
      const s = f.sessions[0];
      if (s) s.url = "https://foreign.example.test/pay";
    });
    await expect(
      criarExecutorDeCompra(() => f.runtime)(f.adulto.autor, f.recibo.id),
    ).rejects.toThrow("Invalid billing destination");
    expect((await consultarMinhaCompra(f.adulto.autor))?.emConferencia).toBe(true);
  });
  it("UUID alheio recusa antes de obter o runtime externo", async () => {
    const f = await fixtureDeCheckout(),
      outro = await adultoDoTeste();
    let abriu = false;
    await expect(
      criarExecutorDeCompra(() => {
        abriu = true;
        return f.runtime;
      })(outro.autor, f.recibo.id),
    ).rejects.toMatchObject({ code: "COBRANCA" });
    expect(abriu).toBe(false);
  });
});
