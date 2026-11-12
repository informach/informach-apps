import { randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import {
  recreioDeviceSessions as deviceSessions,
  recreioGroups as groups,
  recreioProfiles as profiles,
} from "@informach/db/schema";
import {
  type ContaId,
  ContaIdSchema,
  ehErroDoRecreio,
  type PerfilId,
  PerfilIdSchema,
  SessaoDeAparelhoIdSchema,
} from "@informach/recreio";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { avaliarAcesso } from "@/features/acesso/service";
import {
  criarPerfilProprio,
  perfisSelecionaveis,
  selecionarPerfil,
} from "@/features/perfis/service";
import { definirPerfilAtivo } from "@/features/sessao/repository";
import { encerrarSessaoDeAparelho, resolverAtor } from "@/features/sessao/service";
import { AppError } from "@/lib/errors";
import { conceder } from "../scripts/concessoes";
import { CHECAGEM, codigoDoBanco, loginDe, novaConta, UNICO } from "./apoio";

async function atorDe(login: ReturnType<typeof loginDe>) {
  const contexto = await resolverAtor(login);
  if (!contexto) throw new Error("A sessão de aparelho deveria existir");
  return contexto.ator;
}

/** O que uma recusa do app diz a quem pediu: o código e a mensagem, nada mais. */
async function recusa(operacao: Promise<unknown>) {
  const erro = await operacao.then(
    () => null,
    (motivo: unknown) => motivo,
  );
  if (!(erro instanceof AppError)) throw new Error("Esperava uma recusa do app");
  return { code: erro.code, message: erro.message };
}

describe("perfil da própria conta", () => {
  it("cria o perfil adulto e o grupo da conta de uma vez", async () => {
    const conta = await novaConta();
    const { perfil, criado } = await criarPerfilProprio(conta.id, {
      apelido: "  Lia  ",
      avatar: "sol",
    });
    expect(criado).toBe(true);
    expect(perfil).toMatchObject({
      tipo: "adult",
      apelido: "Lia",
      avatar: "sol",
      status: "active",
      versaoDaPolitica: 1,
    });
    const [grupo] = await db.select().from(groups).where(eq(groups.ownerUserId, conta.id));
    expect(perfil.grupoId).toBe(grupo?.id);
    expect(await perfisSelecionaveis(conta.id)).toEqual([perfil]);
  });

  it("oito criações ao mesmo tempo dão um perfil e um grupo", async () => {
    const conta = await novaConta();
    const resultados = await Promise.all(
      Array.from({ length: 8 }, (_, n) =>
        criarPerfilProprio(conta.id, { apelido: `Perfil ${n}`, avatar: "mar" }),
      ),
    );
    expect(resultados.filter((resultado) => resultado.criado)).toHaveLength(1);
    expect(new Set(resultados.map((resultado) => resultado.perfil.id)).size).toBe(1);
    expect(await db.select().from(profiles).where(eq(profiles.userId, conta.id))).toHaveLength(1);
    expect(await db.select().from(groups).where(eq(groups.ownerUserId, conta.id))).toHaveLength(1);
  });

  it("pedir de novo devolve o perfil que já existe, sem mudar o apelido", async () => {
    const conta = await novaConta();
    const primeiro = await criarPerfilProprio(conta.id, { apelido: "Lia", avatar: "sol" });
    const segundo = await criarPerfilProprio(conta.id, { apelido: "Outra", avatar: "lua" });
    expect(segundo).toEqual({ perfil: primeiro.perfil, criado: false });
  });

  it("aproveita o grupo que a equipe criou ao conceder antes do perfil existir", async () => {
    const conta = await novaConta();
    const concessao = await conceder({
      email: conta.email,
      tier: "individual",
      dias: 30,
      motivo: "alfa_equipe",
    });
    const { perfil } = await criarPerfilProprio(conta.id, { apelido: "Lia", avatar: "ceu" });
    expect(perfil.grupoId).toBe(concessao.grupoId);
    expect(await avaliarAcesso({ profileId: perfil.id })).toMatchObject({
      estado: "ATIVO",
      podeJogar: true,
    });
  });

  it("recusa apelido fora dos limites e avatar fora do conjunto, sem gravar nada", async () => {
    const conta = await novaConta();
    await expect(
      criarPerfilProprio(conta.id, { apelido: "L", avatar: "sol" }),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      criarPerfilProprio(conta.id, { apelido: "Lia", avatar: "dragao" }),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      criarPerfilProprio(conta.id, { apelido: "Lia", avatar: "sol", userId: conta.id }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(await db.select().from(profiles).where(eq(profiles.userId, conta.id))).toHaveLength(0);
    expect(await db.select().from(groups).where(eq(groups.ownerUserId, conta.id))).toHaveLength(0);
  });

  it("o banco recusa um segundo perfil de login e um adulto sem conta", async () => {
    const conta = await novaConta();
    const { perfil } = await criarPerfilProprio(conta.id, { apelido: "Lia", avatar: "sol" });
    expect(
      await codigoDoBanco(
        db.insert(profiles).values({
          userId: conta.id,
          groupId: perfil.grupoId,
          kind: "adult",
          nickname: "Segundo",
        }),
      ),
    ).toBe(UNICO);
    expect(
      await codigoDoBanco(
        db
          .insert(profiles)
          .values({ groupId: perfil.grupoId, kind: "adult", nickname: "Sem conta" }),
      ),
    ).toBe(CHECAGEM);
    expect(
      await codigoDoBanco(
        db.insert(profiles).values({ groupId: perfil.grupoId, kind: "minor", nickname: "L" }),
      ),
    ).toBe(CHECAGEM);
    // Perfil sem login cabe no modelo: é o que os próximos lotes usam.
    expect(
      await codigoDoBanco(
        db.insert(profiles).values({ groupId: perfil.grupoId, kind: "minor", nickname: "Filha" }),
      ),
    ).toBeUndefined();
  });
});

describe("ids trocados", () => {
  it("o que não tem a forma de um id de perfil não passa da fronteira", async () => {
    const conta = await novaConta();
    const ator = await atorDe(loginDe(conta));
    for (const entrada of [conta.email, "", "1", `${randomUUID()}x`, null, { id: conta.id }]) {
      expect(PerfilIdSchema.safeParse(entrada).success).toBe(false);
      await expect(selecionarPerfil(ator, entrada)).rejects.toBeInstanceOf(ZodError);
    }
  });

  it("o tipo impede passar a conta onde se espera o perfil", async () => {
    const conta = await novaConta();
    // A conta e o perfil são UUIDs, então a forma não os separa: a marca do
    // tipo, sim. As duas linhas abaixo só compilam por causa do `expect-error`.
    // @ts-expect-error ContaId não é PerfilId
    const comoPerfil: PerfilId = conta.id;
    const { perfil } = await criarPerfilProprio(conta.id, { apelido: "Lia", avatar: "sol" });
    // @ts-expect-error PerfilId não é ContaId
    const comoConta: ContaId = perfil.id;
    expect(comoPerfil).not.toBe(comoConta);
  });

  it("o id da conta no lugar do id do perfil é recusado como perfil inexistente", async () => {
    const conta = await novaConta();
    const { perfil } = await criarPerfilProprio(conta.id, { apelido: "Lia", avatar: "sol" });
    const ator = await atorDe(loginDe(conta));
    await expect(selecionarPerfil(ator, conta.id)).rejects.toMatchObject({ code: "PERFIL" });
    const erro = await avaliarAcesso({ profileId: PerfilIdSchema.parse(conta.id) }).catch(
      (motivo: unknown) => motivo,
    );
    expect(ehErroDoRecreio(erro, "SEM_PERFIL")).toBe(true);
    // E o id do perfil não abre nada como conta.
    expect(await perfisSelecionaveis(ContaIdSchema.parse(perfil.id))).toEqual([]);
  });

  it("escolher o perfil de outra conta é recusado e não revela que ele existe", async () => {
    const [lia, bia] = await Promise.all([novaConta(), novaConta()]);
    const perfilDaLia = (await criarPerfilProprio(lia.id, { apelido: "Lia", avatar: "sol" }))
      .perfil;
    const perfilDaBia = (await criarPerfilProprio(bia.id, { apelido: "Bia", avatar: "mar" }))
      .perfil;
    const ator = await atorDe(loginDe(lia));

    const deOutraConta = await recusa(selecionarPerfil(ator, perfilDaBia.id));
    const inexistente = await recusa(selecionarPerfil(ator, randomUUID()));
    // A mesma resposta nos dois casos: nada nela diz qual é qual.
    expect(deOutraConta).toEqual({ code: "PERFIL", message: "Perfil não encontrado." });
    expect(inexistente).toEqual(deOutraConta);

    // A escrita também recusa por conta própria, sem depender do serviço.
    expect(
      await definirPerfilAtivo({
        sessaoDeAparelhoId: ator.sessaoDeAparelhoId,
        contaId: lia.id,
        perfilId: perfilDaBia.id,
      }),
    ).toBe(false);
    const [linha] = await db
      .select()
      .from(deviceSessions)
      .where(eq(deviceSessions.id, ator.sessaoDeAparelhoId));
    expect(linha?.activeProfileId).toBeNull();

    // O próprio perfil continua podendo ser escolhido.
    expect(await selecionarPerfil(ator, perfilDaLia.id)).toEqual(perfilDaLia);
  });

  it("a sessão de aparelho de outra conta não aceita escolha", async () => {
    const [lia, bia] = await Promise.all([novaConta(), novaConta()]);
    await criarPerfilProprio(lia.id, { apelido: "Lia", avatar: "sol" });
    const perfilDaBia = (await criarPerfilProprio(bia.id, { apelido: "Bia", avatar: "mar" }))
      .perfil;
    const atorDaLia = await atorDe(loginDe(lia));
    // Bia tenta gravar o próprio perfil na sessão de aparelho da Lia.
    await expect(
      selecionarPerfil(
        { contaId: bia.id, sessaoDeAparelhoId: atorDaLia.sessaoDeAparelhoId },
        perfilDaBia.id,
      ),
    ).rejects.toMatchObject({ code: "PERFIL" });
    const [linha] = await db
      .select()
      .from(deviceSessions)
      .where(eq(deviceSessions.id, atorDaLia.sessaoDeAparelhoId));
    expect(linha).toMatchObject({ userId: lia.id, activeProfileId: null });
  });
});

describe("sessão de aparelho e perfil ativo", () => {
  it("a mesma sessão de login tem uma sessão de aparelho só, mesmo em paralelo", async () => {
    const conta = await novaConta();
    const login = loginDe(conta);
    const contextos = await Promise.all(Array.from({ length: 6 }, () => resolverAtor(login)));
    const ids = new Set(contextos.map((contexto) => contexto?.ator.sessaoDeAparelhoId));
    expect(ids.size).toBe(1);
    expect(
      await db
        .select()
        .from(deviceSessions)
        .where(eq(deviceSessions.authSessionId, login.authSessionId)),
    ).toHaveLength(1);
    // Outro login da mesma conta é outro aparelho.
    expect((await atorDe(loginDe(conta))).sessaoDeAparelhoId).not.toBe([...ids][0]);
  });

  it("sem perfil o ator não tem perfil; depois de escolher, tem", async () => {
    const conta = await novaConta();
    const login = loginDe(conta);
    expect(await resolverAtor(login)).toMatchObject({ ator: { perfil: null }, perfis: [] });
    const { perfil } = await criarPerfilProprio(conta.id, { apelido: "Lia", avatar: "sol" });
    // O perfil existe, mas ninguém o escolheu neste aparelho.
    expect(await resolverAtor(login)).toMatchObject({ ator: { perfil: null }, perfis: [perfil] });
    await selecionarPerfil(await atorDe(login), perfil.id);
    expect((await atorDe(login)).perfil).toEqual(perfil);
    // A escolha é do aparelho: outro login da conta começa sem perfil.
    expect((await atorDe(loginDe(conta))).perfil).toBeNull();
  });

  it("larga o perfil ativo que deixou de estar na lista da conta", async () => {
    const [lia, bia] = await Promise.all([novaConta(), novaConta()]);
    const perfilDaLia = (await criarPerfilProprio(lia.id, { apelido: "Lia", avatar: "sol" }))
      .perfil;
    const perfilDaBia = (await criarPerfilProprio(bia.id, { apelido: "Bia", avatar: "mar" }))
      .perfil;
    const login = loginDe(lia);
    const ator = await atorDe(login);
    await selecionarPerfil(ator, perfilDaLia.id);
    // A linha passa a apontar para um perfil que a conta não pode escolher,
    // como ficaria se o perfil saísse da lista depois da escolha.
    await db
      .update(deviceSessions)
      .set({ activeProfileId: perfilDaBia.id })
      .where(eq(deviceSessions.id, ator.sessaoDeAparelhoId));

    const depois = await resolverAtor(login);
    expect(depois?.ator.perfil).toBeNull();
    expect(depois?.perfis).toEqual([perfilDaLia]);
    const [linha] = await db
      .select()
      .from(deviceSessions)
      .where(eq(deviceSessions.id, ator.sessaoDeAparelhoId));
    expect(linha).toMatchObject({ activeProfileId: null, profileSelectedAt: null });
  });

  it("perfil apagado deixa a sessão sem perfil ativo", async () => {
    const conta = await novaConta();
    const login = loginDe(conta);
    const { perfil } = await criarPerfilProprio(conta.id, { apelido: "Lia", avatar: "sol" });
    await selecionarPerfil(await atorDe(login), perfil.id);
    await db.delete(profiles).where(eq(profiles.id, perfil.id));
    expect(await resolverAtor(login)).toMatchObject({ ator: { perfil: null }, perfis: [] });
  });

  it("sair encerra a sessão de aparelho, e ela não volta", async () => {
    const conta = await novaConta();
    const login = loginDe(conta);
    const { perfil } = await criarPerfilProprio(conta.id, { apelido: "Lia", avatar: "sol" });
    const ator = await atorDe(login);
    await selecionarPerfil(ator, perfil.id);

    const encerrada = await encerrarSessaoDeAparelho(login);
    expect(encerrada).toBe(ator.sessaoDeAparelhoId);
    const [linha] = await db
      .select()
      .from(deviceSessions)
      .where(eq(deviceSessions.id, ator.sessaoDeAparelhoId));
    expect(linha?.revokedAt).toBeInstanceOf(Date);

    // Com o mesmo login ainda de pé, não há mais ator nem escolha de perfil.
    expect(await resolverAtor(login)).toBeNull();
    await expect(selecionarPerfil(ator, perfil.id)).rejects.toMatchObject({ code: "PERFIL" });
    // Encerrar de novo não encontra linha viva.
    expect(await encerrarSessaoDeAparelho(login)).toBeNull();
    // Um novo login cria outra sessão de aparelho, sem perfil escolhido.
    const novo = await atorDe(loginDe(conta));
    expect(novo.sessaoDeAparelhoId).not.toBe(ator.sessaoDeAparelhoId);
    expect(novo.perfil).toBeNull();
  });

  it("uma conta não encerra nem recebe a sessão de aparelho de outra", async () => {
    const [lia, bia] = await Promise.all([novaConta(), novaConta()]);
    const login = loginDe(lia);
    const ator = await atorDe(login);
    expect(await encerrarSessaoDeAparelho({ ...login, contaId: bia.id })).toBeNull();
    expect(await resolverAtor({ ...login, contaId: bia.id })).toBeNull();
    expect((await atorDe(login)).sessaoDeAparelhoId).toBe(ator.sessaoDeAparelhoId);
  });

  it("os ids que saem do ator têm a forma e a marca dos esquemas do domínio", async () => {
    const conta = await novaConta();
    const ator = await atorDe(loginDe(conta));
    expect(SessaoDeAparelhoIdSchema.parse(ator.sessaoDeAparelhoId)).toBe(ator.sessaoDeAparelhoId);
    expect(ator.contaId).toBe(conta.id);
  });
});
