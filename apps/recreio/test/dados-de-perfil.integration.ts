import { AuditPersistenceError } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioProfileAchievements as achievements,
  recreioDeviceSessions as devices,
  recreioProfileDataKeys as keys,
  recreioProfiles as profiles,
  sessions,
  recreioProfileDataVersions as versions,
} from "@informach/db/schema";
import { bytesParaBase64 } from "@informach/recreio/contrato";
import { criarRecreio } from "@informach/recreio/sdk";
import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";
import { alterarDados, consultarDados } from "@/features/dados-de-perfil/service";
import { emitirIngresso, sessaoDeJogoDoToken } from "@/features/sessao-de-jogo/service";
import { revogar } from "../scripts/concessoes";
import { CHECAGEM, codigoDoBanco, eventosCom, novoJogador, sinal } from "./apoio";
import { entrarNoJogo } from "./jogo-apoio";
import { despachar, ORIGEM } from "./rotas";

// Catálogo real mais um jogo sem mundos. Nenhuma autoridade de persistência é simulada.
vi.mock("@informach/config/jogos", async (original) => {
  const real = await original<typeof import("@informach/config/jogos")>();
  const jogos = [
    ...real.JOGOS,
    {
      ...real.JOGOS[0],
      id: "perfil-integracao",
      nome: "Progresso",
      rota: "/jogar/perfil-integracao",
      capacidades: {
        ...real.JOGOS[0].capacidades,
        mundos: null,
        posse: [],
        dadosDePerfil: true,
        conquistas: true,
      },
      conquistas: ["primeiro-ponto", "segundo-ponto"],
    },
  ];
  return {
    ...real,
    JOGOS: jogos,
    jogoPorId: (id: string) => jogos.find((jogo) => jogo.id === id) ?? null,
  };
});

const JOGO = "perfil-integracao";
const bytes = (texto: string) => new TextEncoder().encode(texto);
const texto = (dados: Uint8Array | undefined) => new TextDecoder().decode(dados);
async function abrir() {
  const jogador = await novoJogador();
  const sdk = await criarRecreio({
    baseUrl: ORIGEM,
    jogo: JOGO,
    fetch: despachar,
    obterIngresso: async () => (await emitirIngresso(jogador.ator, { jogo: JOGO })).ingresso,
    agendar: () => () => {},
  });
  return { jogador, sdk, sessao: await sessaoDeJogoDoToken(sdk.sessao.token()) };
}

describe("SDK sem mundos: progresso privado com PostgreSQL real", () => {
  it("dez escritas usam a conexão transacional para validar o login sem esgotar o pool", async () => {
    const url = process.env.DATABASE_URL;
    if (!url || process.env.RECREIO_ISOLATED_TEST !== "1") throw new Error("Banco não isolado");
    const controle = postgres(url, { max: 1, prepare: false });
    const contextos: Awaited<ReturnType<typeof abrir>>[] = [];
    for (let i = 0; i < 10; i++) contextos.push(await abrir());
    let operacoes: Promise<number>[] = [];
    try {
      await controle.begin(async (tx) => {
        await tx.unsafe("lock table recreio.profiles in exclusive mode");
        operacoes = contextos.map(({ sdk }) => sdk.dados.gravar("progresso", bytes("confirmado")));
        await expect
          .poll(
            async () => {
              const [linha] =
                await tx`select count(*)::int as esperando from pg_stat_activity where datname=current_database() and backend_type='client backend' and pg_backend_pid()=any(pg_blocking_pids(pid))`;
              return linha?.esperando;
            },
            { interval: 20 },
          )
          .toBe(10);
      });
      expect(await Promise.all(operacoes)).toEqual(Array(10).fill(1));
    } finally {
      await Promise.allSettled(operacoes);
      await controle.end();
    }
  });
  it("grava, recupera a confirmação perdida e reabre sem criar mundo", async () => {
    const { sdk } = await abrir();
    expect(await sdk.dados.ler("progresso")).toBeNull();
    expect(await sdk.dados.gravar("progresso", bytes("privado"))).toBe(1);
    expect(await sdk.dados.gravar("progresso", bytes("privado"), 0)).toBe(1);
    expect(texto((await sdk.dados.ler("progresso"))?.dados)).toBe("privado");
    await expect(sdk.mundos.criar({ nome: "Inexistente" })).rejects.toMatchObject({
      codigo: "SEM_PERMISSAO",
    });
  });

  it("isola por perfil e recusa a capacidade no Morada", async () => {
    const a = await abrir();
    const b = await abrir();
    await a.sdk.dados.gravar("privado", bytes("segredo"));
    expect(await b.sdk.dados.ler("privado")).toBeNull();
    const morada = await entrarNoJogo(a.jogador, "morada", { continuarAqui: true });
    await expect(
      consultarDados(await sessaoDeJogoDoToken(morada.token), "privado", false),
    ).rejects.toMatchObject({ codigo: "SEM_PERMISSAO" });
  });

  it("duas escritas da mesma revisão preservam vencedor e conflito", async () => {
    const { sdk } = await abrir();
    const resultados = await Promise.allSettled([
      sdk.dados.gravar("progresso", bytes("A")),
      sdk.dados.gravar("progresso", bytes("B")),
    ]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(resultados.filter((r) => r.status === "rejected")).toHaveLength(1);
    const historico = await sdk.dados.versoes("progresso");
    expect(historico.revisaoAtual).toBe(1);
    expect(historico.versoes.map((v) => texto(v.dados)).sort()).toEqual(["A", "B"]);
    const conflito = historico.versoes.find((v) => v.estado === "conflict");
    if (!conflito) throw new Error("Conflito não preservado");
    expect(await sdk.dados.resolver("progresso", conflito.id, 1)).toBe(2);
    expect(texto((await sdk.dados.ler("progresso"))?.dados)).toBe(texto(conflito.dados));
    expect(
      (await sdk.dados.versoes("progresso")).versoes.every((v) => v.estado === "accepted"),
    ).toBe(true);
  });

  it("nunca elimina conflito para aceitar outro; descarte é explícito e isolado", async () => {
    const { sdk } = await abrir();
    await sdk.dados.gravar("progresso", bytes("base"));
    for (let i = 0; i < 3; i++)
      await expect(sdk.dados.gravar("progresso", bytes(`conflito${i}`), 0)).rejects.toMatchObject({
        codigo: "REVISAO_DIVERGENTE",
      });
    await expect(sdk.dados.gravar("progresso", bytes("quarto"), 0)).rejects.toMatchObject({
      codigo: "LIMITE_DE_DADOS",
    });
    const { versoes } = await sdk.dados.versoes("progresso");
    const conflito = versoes.find((v) => v.estado === "conflict");
    if (!conflito) throw new Error("Conflito ausente");
    const outro = await abrir();
    await expect(outro.sdk.dados.descartar("progresso", conflito.id)).rejects.toMatchObject({
      codigo: "NAO_ENCONTRADO",
    });
    await sdk.dados.descartar("progresso", conflito.id);
    expect((await sdk.dados.versoes("progresso")).versoes).toHaveLength(3);
  });

  it.each(["revogado", "politica", "login", "suspenso", "aparelho", "token"] as const)(
    "revalida autoridade antes de gravar: %s",
    async (motivo) => {
      const { jogador, sessao } = await abrir();
      if (motivo === "revogado") await revogar({ email: jogador.conta.email, motivo: "teste" });
      if (motivo === "politica")
        await db
          .update(profiles)
          .set({ policyVersion: 2 })
          .where(eq(profiles.id, jogador.perfil.id));
      if (motivo === "suspenso")
        await db
          .update(profiles)
          .set({ status: "suspended" })
          .where(eq(profiles.id, jogador.perfil.id));
      if (motivo === "login")
        await db.delete(sessions).where(eq(sessions.id, jogador.login.authSessionId));
      if (motivo === "aparelho")
        await db
          .update(devices)
          .set({ activeProfileId: null })
          .where(eq(devices.id, jogador.ator.sessaoDeAparelhoId));
      const credencial = motivo === "token" ? { ...sessao, expiraEm: 0 } : sessao;
      await expect(
        alterarDados(credencial, {
          operacao: "gravar",
          chave: "progresso",
          revisao: 0,
          conteudo: bytesParaBase64(bytes("recusado")),
        }),
      ).rejects.toBeDefined();
      expect(await db.select().from(keys).where(eq(keys.profileId, jogador.perfil.id))).toEqual([]);
    },
  );

  it("limita histórico e chaves sem registrar conteúdo na auditoria", async () => {
    const { jogador, sdk } = await abrir();
    for (let revisao = 0; revisao < 7; revisao++)
      await sdk.dados.gravar("chave-privada", bytes(`conteudo-privado${revisao}`), revisao);
    expect((await sdk.dados.versoes("chave-privada")).versoes.map((v) => v.revisao)).toEqual([
      7, 6, 5, 4,
    ]);
    for (let i = 0; i < 15; i++) await sdk.dados.gravar(`outra${i}`, new Uint8Array());
    await expect(sdk.dados.gravar("excedente", bytes("x"))).rejects.toMatchObject({
      codigo: "LIMITE_DE_DADOS",
    });
    const eventos = await eventosCom("profileId", jogador.perfil.id);
    const auditoria = JSON.stringify(eventos);
    expect(auditoria).not.toContain("chave-privada");
    expect(auditoria).not.toContain("conteudo-privado");
    expect(auditoria).not.toContain(jogador.conta.email);
  });

  it("conquista repete o mesmo recibo, recusa IDs livres e reutilização da chave", async () => {
    const { jogador, sdk } = await abrir();
    const primeira = await sdk.conquista("primeiro-ponto", "tentativa1");
    expect(await sdk.conquista("primeiro-ponto", "tentativa1")).toEqual(primeira);
    await expect(sdk.conquista("segundo-ponto", "tentativa1")).rejects.toMatchObject({
      codigo: "FATO_DUPLICADO",
    });
    await expect(sdk.conquista("inventada", "tentativa2")).rejects.toMatchObject({
      codigo: "SEM_PERMISSAO",
    });
    expect(
      await db.select().from(achievements).where(eq(achievements.profileId, jogador.perfil.id)),
    ).toHaveLength(1);
  });

  it("o banco recusa versão aceita sem revisão, bytes excessivos e FK de outro perfil", async () => {
    const a = await abrir();
    const b = await abrir();
    await a.sdk.dados.gravar("progresso", bytes("A"));
    const [chave] = await db.select().from(keys).where(eq(keys.profileId, a.jogador.perfil.id));
    if (!chave) throw new Error("Chave ausente");
    const base = {
      dataId: chave.id,
      profileId: a.jogador.perfil.id,
      gameId: JOGO,
      baseRevision: 1,
      revision: 2,
      kind: "accepted" as const,
      bytes: Buffer.from("B"),
      digest: "a".repeat(64),
    };
    expect(await codigoDoBanco(db.insert(versions).values({ ...base, revision: null }))).toBe(
      CHECAGEM,
    );
    expect(
      await codigoDoBanco(db.insert(versions).values({ ...base, bytes: Buffer.alloc(65537) })),
    ).toBe(CHECAGEM);
    expect(
      await codigoDoBanco(db.insert(versions).values({ ...base, profileId: b.jogador.perfil.id })),
    ).toBe("23503");
    expect(await codigoDoBanco(db.insert(versions).values({ ...base, gameId: "outro-jogo" }))).toBe(
      "23503",
    );
    expect((await a.sdk.dados.versoes("progresso")).versoes).toHaveLength(1);
  });

  it("corrupção dos bytes é recusada na leitura e não é normalizada por nova gravação", async () => {
    const { jogador, sdk } = await abrir();
    await sdk.dados.gravar("progresso", bytes("original"));
    await db
      .update(versions)
      .set({ bytes: Buffer.from("corrompido") })
      .where(eq(versions.profileId, jogador.perfil.id));
    await expect(sdk.dados.ler("progresso")).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
    await expect(sdk.dados.gravar("progresso", bytes("novo"), 1)).rejects.toMatchObject({
      codigo: "INDISPONIVEL",
    });
    expect(
      (await db.select().from(keys).where(eq(keys.profileId, jogador.perfil.id)))[0]?.revision,
    ).toBe(1);
  });

  it("auditoria indisponível reverte chave, versão e progresso juntos", async () => {
    const { jogador, sessao } = await abrir();
    await db.execute(
      sql`create function audit.recusar_dados_em_teste() returns trigger language plpgsql as $$ begin if new.event_type = 'recreio.profile_data_updated' then raise exception 'auditoria indisponível'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger recusar_dados_em_teste before insert on audit.events for each row execute function audit.recusar_dados_em_teste()`,
    );
    try {
      await expect(
        alterarDados(sessao, {
          operacao: "gravar",
          chave: "progresso",
          revisao: 0,
          conteudo: "YQ==",
        }),
      ).rejects.toBeInstanceOf(AuditPersistenceError);
      expect(await db.select().from(keys).where(eq(keys.profileId, jogador.perfil.id))).toEqual([]);
      expect(
        await db
          .select()
          .from(versions)
          .where(and(eq(versions.profileId, jogador.perfil.id), eq(versions.gameId, JOGO))),
      ).toEqual([]);
    } finally {
      await db.execute(sql`drop trigger recusar_dados_em_teste on audit.events`);
      await db.execute(sql`drop function audit.recusar_dados_em_teste()`);
    }
  });

  it("token que vence esperando a trava não grava mesmo com sessão renovada no banco", async () => {
    const { jogador, sessao } = await abrir();
    const pronto = sinal<number>();
    const liberar = sinal<void>();
    const trava = db.transaction(async (tx) => {
      await tx.execute(sql`set local transaction_timeout='15s'`);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`dados-perfil:${sessao.perfilId}:${sessao.jogo}`}, 0))`,
      );
      const [conexao] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
      if (!conexao) throw new Error("Conexão ausente");
      pronto.concluir(conexao.pid);
      await liberar.promessa;
    });
    void trava.catch(pronto.recusar);
    const pid = await pronto.promessa;
    const expiraEm = Date.now() + 600;
    const resultado = alterarDados(
      { ...sessao, expiraEm },
      { operacao: "gravar", chave: "progresso", revisao: 0, conteudo: "YQ==" },
    ).then(
      (valor) => ({ ok: true, valor }),
      (erro: unknown) => ({ ok: false, erro }),
    );
    try {
      await expect
        .poll(
          async () => {
            const [linha] = await db.execute<{ esperando: boolean }>(
              sql`select exists(select 1 from pg_stat_activity where ${pid}=any(pg_blocking_pids(pid))) as esperando`,
            );
            return linha?.esperando;
          },
          { interval: 20 },
        )
        .toBe(true);
      await expect.poll(() => Date.now() >= expiraEm, { interval: 20 }).toBe(true);
      liberar.concluir(undefined);
      await trava;
      expect(await resultado).toMatchObject({ ok: false, erro: { codigo: "SESSAO_INVALIDA" } });
      expect(await db.select().from(keys).where(eq(keys.profileId, jogador.perfil.id))).toEqual([]);
    } finally {
      liberar.concluir(undefined);
      await trava;
      await resultado;
    }
  });
});
