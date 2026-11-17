import { db, eq } from "@informach/db";
import { recreioGameSessions as games } from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { sairDaSessao } from "@/features/sessao-de-jogo/service";
import { aposentarInstancias, novoJogador } from "./apoio";
import { abrirPelaRota, entrarNoJogo, mundoDe, novaInstancia } from "./jogo-apoio";

async function preparar() {
  await aposentarInstancias();
  const pessoa = await novoJogador();
  const a = await mundoDe(pessoa, "morada", "Mundo A");
  const b = await mundoDe(pessoa, "morada", "Mundo B");
  const sessao = await entrarNoJogo(pessoa);
  const host = await novaInstancia();
  for (const mundo of [a, b]) expect((await abrirPelaRota(sessao, mundo)).status).toBe(200);
  const posseA = await host.cliente.reivindicarPosse(a);
  const posseB = await host.cliente.reivindicarPosse(b);
  const entrada = (mundoId: typeof a, cerca: number) =>
    host.cliente.verificarEntrada({
      mundoId,
      cerca,
      sid: sessao.sid,
      perfilId: pessoa.perfil.id,
    });
  return { pessoa, a, b, sessao, host, posseA, posseB, entrada };
}

describe("uma partida não mantém conexões em dois mundos", () => {
  it("o SID vinculado ao primeiro mundo não é reatribuído; sair e abrir outra partida permite mudar", async () => {
    const r = await preparar();
    await r.entrada(r.a, r.posseA.cerca);
    await expect(r.entrada(r.b, r.posseB.cerca)).rejects.toMatchObject({
      codigo: "SESSAO_ENCERRADA",
    });
    expect((await abrirPelaRota(r.sessao, r.b)).status).toBe(403);
    expect((await abrirPelaRota(r.sessao, r.a)).status).toBe(200);
    expect((await db.select().from(games).where(eq(games.id, r.sessao.sid)))[0]?.spaceId).toBe(r.a);
    await sairDaSessao(r.sessao.token);
    const outra = await entrarNoJogo(r.pessoa);
    expect((await abrirPelaRota(outra, r.b)).status).toBe(200);
    expect(
      await r.host.cliente.verificarEntrada({
        mundoId: r.b,
        cerca: r.posseB.cerca,
        sid: outra.sid,
        perfilId: r.pessoa.perfil.id,
      }),
    ).toMatchObject({ papel: "steward" });
    expect((await db.select().from(games).where(eq(games.id, outra.sid)))[0]?.spaceId).toBe(r.b);
  });
  it("entradas simultâneas em mundos distintos admitem só um vínculo", async () => {
    const r = await preparar();
    const resultados = await Promise.allSettled([
      r.entrada(r.a, r.posseA.cerca),
      r.entrada(r.b, r.posseB.cerca),
    ]);
    expect(resultados.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const recusa = resultados.find((x) => x.status === "rejected");
    if (recusa?.status !== "rejected") throw new Error("Segunda conexão deveria ser recusada");
    expect(recusa.reason).toMatchObject({ codigo: "SESSAO_ENCERRADA" });
    const vencedor = resultados[0]?.status === "fulfilled" ? r.a : r.b;
    expect((await db.select().from(games).where(eq(games.id, r.sessao.sid)))[0]?.spaceId).toBe(
      vencedor,
    );
  });
});
