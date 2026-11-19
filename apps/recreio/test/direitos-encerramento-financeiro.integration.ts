import { randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import {
  checkoutIntents,
  customers,
  recreioDeviceSessions as devices,
  recreioRightsPreparations as preparations,
  sessions,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { VERSAO_DA_COMPRA } from "@/features/cobranca/constantes";
import { comCicloDeCobranca } from "@/features/cobranca/lifecycle";
import {
  iniciarTentativaDeCompraLocked,
  prepararCompraNoBanco,
} from "@/features/cobranca/repository";
import { lerFinanceiroDoEncerramentoLocked } from "@/features/direitos/encerramento-financeiro-repository";
import { prepararEncerramentoNoBanco } from "@/features/direitos/preparacao-repository";
import { VERSAO_DA_DECLARACAO_ADULTA } from "@/features/grupo/convites-constantes";
import { resolverAtor } from "@/features/sessao/service";
import { loginReal, novaConta } from "./apoio";

async function adulto() {
  const conta = await novaConta(),
    login = await loginReal(conta);
  const contexto = await resolverAtor(login);
  const [sessao] = await db.select().from(sessions).where(eq(sessions.id, login.authSessionId));
  if (!contexto || !sessao) throw new Error("Native fixture absent");
  const autor: AutorNativoRecente = {
    ...contexto.ator,
    login: {
      authSessionId: sessao.id,
      criadoEm: sessao.createdAt,
      expiraEm: sessao.expiresAt,
    },
  };
  const consultar = () =>
    comCicloDeCobranca(conta.id, () =>
      db.transaction((tx) => lerFinanceiroDoEncerramentoLocked(tx, autor, "dev")),
    );
  return { conta, autor, consultar };
}
async function cliente(f: Awaited<ReturnType<typeof adulto>>, app = "recreio") {
  const [c] = await db
    .insert(customers)
    .values({
      provider: "stripe",
      app,
      subjectType: "user",
      subjectId: f.conta.id,
      providerCustomerId: `cus_${randomUUID().replaceAll("-", "")}`,
      email: "fiscal-nao-incluir@example.test",
      metadata: { privado: "METADADO_NAO_INCLUIR" },
    })
    .returning();
  if (!c) throw new Error("Customer fixture absent");
  return c;
}
function compra() {
  return {
    pedidoId: randomUUID(),
    produtoId: "recreio_individual_monthly",
    valorCentavos: 5990,
    moeda: "BRL" as const,
    intervalo: "month" as const,
    souAdulto: true as const,
    aceitoCobrancaRecorrente: true as const,
    versaoDaDeclaracao: VERSAO_DA_DECLARACAO_ADULTA,
    versaoDasCondicoes: VERSAO_DA_COMPRA,
    perfis: [],
  };
}

describe("encerramento: origem financeira própria, sem I/O ou cancelamento", () => {
  it("prévia v2 persiste plano privado, conserva resposta perdida e marca mudança de seleção sem substituir o original", async () => {
    const f = await adulto(),
      c = await cliente(f);
    const pedido = { pedidoId: randomUUID(), tipo: "encerrar_conta" as const, perfis: [] };
    const previa = await prepararEncerramentoNoBanco(f.autor, pedido, "dev");
    expect(previa).toMatchObject({
      desatualizada: false,
      plano: {
        formato: "recreio-previa-encerramento-v2",
        revisaoDaParticipacao: 0,
        financeiro: { clientes: 1, comprasNaoEnviadas: 0, trocasNaoEnviadas: 0 },
      },
    });
    expect(await prepararEncerramentoNoBanco(f.autor, pedido, "dev")).toEqual(previa);
    expect(JSON.stringify(previa)).not.toContain(c.providerCustomerId);
    const [gravado] = await db
      .select()
      .from(preparations)
      .where(eq(preparations.id, previa.preparacaoId));
    expect(JSON.stringify(gravado?.plan)).toContain(c.providerCustomerId);
    await prepararCompraNoBanco(f.autor, compra(), "dev");
    expect(await prepararEncerramentoNoBanco(f.autor, pedido, "dev")).toMatchObject({
      preparacaoId: previa.preparacaoId,
      planoSha256: previa.planoSha256,
      desatualizada: true,
    });
    expect(
      (await db.select().from(preparations).where(eq(preparations.id, previa.preparacaoId)))[0],
    ).toEqual(gravado);
    const nova = await prepararEncerramentoNoBanco(
      f.autor,
      { ...pedido, pedidoId: randomUUID() },
      "dev",
    );
    expect(nova.planoSha256).not.toBe(previa.planoSha256);
    expect(nova.plano).toMatchObject({ financeiro: { comprasNaoEnviadas: 1 } });
  });
  it("conta sem jogador ou cliente prepara escopo vazio, sem criar cliente ou cobrança", async () => {
    const f = await adulto();
    expect(await f.consultar()).toMatchObject({
      modo: "dev",
      clientes: [],
      comprasNaoEnviadas: [],
      trocasNaoEnviadas: [],
    });
    expect(await db.select().from(customers).where(eq(customers.subjectId, f.conta.id))).toEqual(
      [],
    );
  });

  it("inclui apenas o cliente Recreio do próprio pagante, sem fiscal, metadados ou outro app/adulto", async () => {
    const a = await adulto(),
      b = await adulto(),
      proprio = await cliente(a),
      alheio = await cliente(b),
      outroApp = await cliente(a, "cozya");
    const resultado = await a.consultar();
    expect(resultado.clientes).toEqual([
      { id: proprio.id, referenciaStripe: proprio.providerCustomerId },
    ]);
    const texto = JSON.stringify(resultado);
    for (const privado of [
      alheio.providerCustomerId,
      outroApp.providerCustomerId,
      "fiscal-nao-incluir@example.test",
      "METADADO_NAO_INCLUIR",
      a.conta.email,
    ])
      expect(texto).not.toContain(privado);
    expect((await db.select().from(customers).where(eq(customers.id, proprio.id)))[0]).toEqual(
      proprio,
    );
  });

  it("distingue aceite ainda não enviado de tentativa admitida com resposta desconhecida", async () => {
    const f = await adulto();
    const pedido = await prepararCompraNoBanco(f.autor, compra(), "dev");
    expect((await f.consultar()).comprasNaoEnviadas).toEqual([pedido.id]);
    await comCicloDeCobranca(f.conta.id, () => iniciarTentativaDeCompraLocked(f.autor, pedido.id));
    await expect(f.consultar()).rejects.toMatchObject({ code: "COBRANCA_EM_CONFERENCIA" });
  });

  it("recusa autorização de outro namespace, sem fingir cancelamento ou ausência no provedor", async () => {
    const f = await adulto();
    await prepararCompraNoBanco(f.autor, compra(), "prod");
    await expect(f.consultar()).rejects.toMatchObject({ code: "COBRANCA_EM_CONFERENCIA" });
  });

  it("Checkout sem autorização nativa correspondente exige conferência, mesmo quando o envio ainda não foi marcado", async () => {
    const f = await adulto(),
      c = await cliente(f);
    await db.insert(checkoutIntents).values({
      customerId: c.id,
      id: randomUUID(),
      userId: f.conta.id,
      productId: "recreio_individual_monthly",
      requestStarted: false,
      request: {
        priceId: "price_fixture",
        successUrl: "https://example.test/voltar",
        cancelUrl: "https://example.test/sair",
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      },
    });
    await expect(f.consultar()).rejects.toMatchObject({ code: "COBRANCA_EM_CONFERENCIA" });
  });

  it("Checkout atribuído a outro adulto não amplia a autoridade do dono do cliente", async () => {
    const f = await adulto(),
      outro = await adulto(),
      c = await cliente(f);
    await db.insert(checkoutIntents).values({
      customerId: c.id,
      id: randomUUID(),
      userId: outro.conta.id,
      productId: "recreio_individual_monthly",
      requestStarted: true,
      request: {
        priceId: "price_fixture",
        successUrl: "https://example.test/voltar",
        cancelUrl: "https://example.test/sair",
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      },
    });
    await expect(f.consultar()).rejects.toMatchObject({ code: "COBRANCA_EM_CONFERENCIA" });
  });

  it("contexto infantil e login revogado não preparam o escopo financeiro", async () => {
    const f = await adulto();
    await db
      .update(devices)
      .set({ minorContextGeneration: randomUUID() })
      .where(eq(devices.id, f.autor.sessaoDeAparelhoId));
    await expect(f.consultar()).rejects.toMatchObject({ code: "AUTH" });
    await db
      .update(devices)
      .set({ minorContextGeneration: null })
      .where(eq(devices.id, f.autor.sessaoDeAparelhoId));
    await db.delete(sessions).where(eq(sessions.id, f.autor.login.authSessionId));
    await expect(f.consultar()).rejects.toMatchObject({ code: "AUTH" });
  });
});
