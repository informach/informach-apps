import { db, eq } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioSocialPreferences as preferences,
  recreioProfiles as profiles,
  sessions,
} from "@informach/db/schema";
import { ListaSocialSchema } from "@informach/recreio/contrato";
import { describe, expect, it } from "vitest";
import { consultarSupervisao, salvarSupervisao } from "@/features/politicas/service";
import { desconectarTodosDoMenor } from "@/features/protecao/service";
import {
  aceitarAmizade,
  alterarPresencaSocial,
  aprovarAmizade,
  consultarSocial,
  emitirCodigoDeAmigo,
  pedirAmizade,
  protegerContato,
  removerAmizade,
  renovarAprovacaoDeAmizade,
} from "@/features/social/service";
import { novoJogador } from "./apoio";
import { entrarNoJogo } from "./jogo-apoio";
import { familiaSocial, referenciaSocial as ref } from "./social-apoio";

async function entreAdultos(jogar = false) {
  const a = await novoJogador({ comAcesso: false });
  const b = await novoJogador({ comAcesso: jogar });
  const codigo = await emitirCodigoDeAmigo(ref(b));
  const pedido = await pedirAmizade(ref(a), {
    codigo: codigo.codigo,
    pedidoId: crypto.randomUUID(),
  });
  await aceitarAmizade(ref(b), pedido.pedidoId);
  if (jogar) await entrarNoJogo(b);
  return { a, b, pedido };
}

describe("consulta social privada e presença autoritativa", () => {
  it("sem cobertura consulta somente relações conhecidas, sem dados de conta ou de mundo", async () => {
    const r = await entreAdultos();
    const outra = await novoJogador({ comAcesso: false });
    const lista = ListaSocialSchema.parse(await consultarSocial(ref(r.a)));
    expect(lista).toMatchObject({
      presenca: "friends",
      proximo: null,
      contatos: [
        { perfilId: r.b.perfil.id, apelido: r.b.perfil.apelido, amizade: true, online: false },
      ],
    });
    expect(await consultarSocial(ref(outra))).toMatchObject({ contatos: [] });
    const texto = JSON.stringify(lista);
    for (const privado of [r.a.conta.id, r.b.conta.id, r.a.conta.email, r.b.conta.email])
      expect(texto).not.toContain(privado);
  });
  it("presença exige amizade, opção atual, contato recente e login físico válido", async () => {
    const r = await entreAdultos(true);
    expect((await consultarSocial(ref(r.a))).contatos[0]?.online).toBe(true);
    await alterarPresencaSocial(ref(r.b), "invisible");
    expect((await consultarSocial(ref(r.a))).contatos[0]?.online).toBe(false);
    await alterarPresencaSocial(ref(r.b), "online");
    expect((await consultarSocial(ref(r.a))).contatos[0]?.online).toBe(true);
    const outra = await novoJogador({ comAcesso: false });
    expect((await consultarSocial(ref(outra))).contatos).toHaveLength(0);
    await db.delete(sessions).where(eq(sessions.id, r.b.login.authSessionId));
    expect((await consultarSocial(ref(r.a))).contatos[0]?.online).toBe(false);
  });
  it("sessão sem contato recente não informa online", async () => {
    const r = await entreAdultos(true);
    const antigo = new Date(Date.now() - 91_000);
    await db
      .update(games)
      .set({ lastRenewedAt: antigo, controlSeenAt: antigo })
      .where(eq(games.profileId, r.b.perfil.id));
    expect((await consultarSocial(ref(r.a))).contatos[0]?.online).toBe(false);
  });
  it("criança aguarda aprovação sem mostrar nomes e revogação invalida aprovação existente", async () => {
    const r = await familiaSocial();
    const a = await novoJogador({ comAcesso: false });
    const codigo = await emitirCodigoDeAmigo(r.referencia);
    const pedido = await pedirAmizade(ref(a), {
      codigo: codigo.codigo,
      pedidoId: crypto.randomUUID(),
    });
    expect((await consultarSocial(r.referencia)).contatos).toMatchObject([
      {
        apelido: null,
        avatar: null,
        amizade: false,
        online: false,
        pedido: { aguardaAprovacao: true },
      },
    ]);
    const [perfil] = await db.select().from(profiles).where(eq(profiles.id, r.perfil.id));
    if (!perfil) throw new Error("Perfil ausente");
    await aprovarAmizade(r.autor, {
      pedidoId: pedido.pedidoId,
      perfilId: r.perfil.id,
      versao: perfil.policyVersion,
    });
    await aceitarAmizade(r.referencia, pedido.pedidoId);
    expect((await consultarSocial(ref(a))).contatos).toMatchObject([
      { apelido: "Protegido", amizade: true },
    ]);
    await desconectarTodosDoMenor(r.autor, r.perfil.id);
    expect((await consultarSocial(ref(a))).contatos).toMatchObject([
      { apelido: null, avatar: null, amizade: false, online: false },
    ]);
    const [atual] = await db.select().from(profiles).where(eq(profiles.id, r.perfil.id));
    if (!atual) throw new Error("Perfil ausente");
    await renovarAprovacaoDeAmizade(r.autor, {
      pedidoId: pedido.pedidoId,
      perfilId: r.perfil.id,
      versao: atual.policyVersion,
      revisaoDaAmizade: 1,
      confirmoAmizade: true,
    });
    expect((await consultarSocial(ref(a))).contatos).toMatchObject([
      { apelido: "Protegido", amizade: true, online: false },
    ]);
    const supervisao = await consultarSupervisao(r.autor, r.perfil.id);
    await salvarSupervisao(r.autor, {
      perfilId: r.perfil.id,
      versao: supervisao.versao,
      configuracao: { ...supervisao.configuracao, contatos: false },
      reconheco: true,
    });
    expect((await consultarSocial(ref(a))).contatos).toMatchObject([
      { apelido: null, amizade: false, online: false },
    ]);
  });
  it("presença protegida não pode ser alterada pela credencial do jogador", async () => {
    const r = await familiaSocial();
    await expect(alterarPresencaSocial(r.referencia, "online")).rejects.toMatchObject({
      code: "PERMISSAO",
    });
    expect(
      await db.select().from(preferences).where(eq(preferences.profileId, r.perfil.id)),
    ).toHaveLength(0);
  });
  it("paginação limita dez contatos, não repete IDs e não oferece busca de pessoas", async () => {
    const a = await novoJogador({ comAcesso: false });
    for (let n = 0; n < 11; n++) {
      const b = await novoJogador({ comAcesso: false });
      const codigo = await emitirCodigoDeAmigo(ref(b));
      await pedirAmizade(ref(a), { codigo: codigo.codigo, pedidoId: crypto.randomUUID() });
    }
    const primeira = await consultarSocial(ref(a));
    expect(primeira.contatos).toHaveLength(10);
    if (!primeira.proximo) throw new Error("Cursor ausente");
    const segunda = await consultarSocial(ref(a), { apos: primeira.proximo });
    expect(segunda.contatos).toHaveLength(1);
    expect(segunda.proximo).toBeNull();
    expect(new Set([...primeira.contatos, ...segunda.contatos].map((c) => c.perfilId)).size).toBe(
      11,
    );
    await expect(consultarSocial(ref(a), { busca: "Teste" })).rejects.toMatchObject({
      name: "ZodError",
    });
  });
  it("ajuste vazio de proteção não permite distinguir perfil desconhecido existente", async () => {
    const a = await novoJogador({ comAcesso: false }),
      b = await novoJogador({ comAcesso: false });
    for (const perfilId of [b.perfil.id, crypto.randomUUID()]) {
      await expect(
        protegerContato(ref(a), { perfilId, bloqueado: false, silenciado: false }),
      ).rejects.toMatchObject({ code: "CONTATO" });
      await expect(removerAmizade(ref(a), perfilId)).rejects.toMatchObject({ code: "CONTATO" });
    }
  });
});
