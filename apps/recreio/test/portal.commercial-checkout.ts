import { db, eq } from "@informach/db";
import { sessions } from "@informach/db/schema";
import { VERSAO_DA_RESPONSABILIDADE } from "@informach/recreio";
import { describe, expect, it } from "vitest";
import { criarExecutorDeCompra } from "@/features/cobranca/execucao-service";
import { criarAberturaDoPortal } from "@/features/cobranca/portal-service";
import { cadastrarPerfilMenor, prepararPerfilMenor } from "@/features/familia/service";
import {
  definirPinDaConta,
  definirPinDoMenor,
  trocarPerfilComPin,
} from "@/features/protecao/service";
import { fixtureDeCheckout } from "./compra-stripe-apoio";
import { adultoDoTeste } from "./teste-apoio";

/** Real native/PG/SDK path; closed Stripe transport, never external billing. */
async function fixture() {
  const f = await fixtureDeCheckout();
  await criarExecutorDeCompra(() => f.runtime)(f.adulto.autor, f.recibo.id);
  const runtime = {
    conferirCatalogo: f.runtime.conferirCatalogo,
    criarPortal: (paganteId: string) =>
      f.billing.createPortalSession({
        subject: { type: "user" as const, id: paganteId },
        returnUrl: "https://recreio.example.test/conta/assinatura",
      }),
  };
  return { ...f, runtimeDoPortal: runtime, abrir: criarAberturaDoPortal(() => runtime) };
}

describe("portal financeiro do próprio adulto", () => {
  it("pagante sem jogador abre apenas o próprio customer e a configuração restrita", async () => {
    const f = await fixture();
    expect(f.adulto.jogador).toBeNull();
    const resultado = await f.abrir(f.adulto.autor);
    expect(resultado.destino).toMatch(/^https:\/\/billing\.stripe\.com\/p\/session\//);
    expect(f.portais).toMatchObject([
      { customer: f.providerCustomerId, configuration: "bpc_recreio" },
    ]);
    expect(f.sessions).toHaveLength(1);
  });
  it("outro adulto não usa o runtime do pagante nem recebe seu link", async () => {
    const f = await fixture(),
      outro = await adultoDoTeste();
    await expect(f.abrir(outro.autor)).rejects.toMatchObject({ code: "COBRANCA" });
    expect(f.portais).toEqual([]);
  });
  it("login antigo recusa antes de criar sessão financeira", async () => {
    const f = await fixture();
    await expect(
      f.abrir({
        ...f.adulto.autor,
        login: { ...f.adulto.autor.login, criadoEm: new Date(Date.now() - 11 * 60_000) },
      }),
    ).rejects.toMatchObject({ code: "LOGIN_RECENTE" });
    expect(f.portais).toEqual([]);
  });
  it("logout durante catálogo impede POST do portal", async () => {
    const f = await fixture();
    const abrir = criarAberturaDoPortal(() => ({
      ...f.runtimeDoPortal,
      conferirCatalogo: async () => {
        await f.runtimeDoPortal.conferirCatalogo();
        await db.delete(sessions).where(eq(sessions.id, f.adulto.autor.login.authSessionId));
      },
    }));
    await expect(abrir(f.adulto.autor)).rejects.toMatchObject({ code: "AUTH" });
    expect(f.portais).toEqual([]);
  });
  it("logout após POST não devolve a URL financeira", async () => {
    const f = await fixture();
    f.aposCriarPortal(async () => {
      await db.delete(sessions).where(eq(sessions.id, f.adulto.autor.login.authSessionId));
    });
    await expect(f.abrir(f.adulto.autor)).rejects.toMatchObject({ code: "AUTH" });
    expect(f.portais).toHaveLength(1);
  });
  it("catálogo divergente bloqueia a criação do portal", async () => {
    const f = await fixture();
    for (const preco of f.prices) preco.unit_amount = 1;
    await expect(f.abrir(f.adulto.autor)).rejects.toThrow();
    expect(f.portais).toEqual([]);
  });
  it("troca para perfil infantil durante POST não entrega autoridade financeira", async () => {
    const f = await fixture(),
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
    f.aposCriarPortal(async () => {
      await trocarPerfilComPin(p.autor, {
        destino: { tipo: "perfil", perfilId: perfil.id },
        pin: "396175",
      });
    });
    await expect(f.abrir(p.autor)).rejects.toMatchObject({ code: "AUTH" });
    expect(f.portais).toHaveLength(1);
  });
});
