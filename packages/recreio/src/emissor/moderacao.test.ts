import { decodeJwt, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { emitirProvaDeModeracao, verificarProvaDeModeracao } from "./moderacao";

const segredo = "1".repeat(64),
  agora = new Date("2026-11-17T12:00:00.000Z");
const comando = () => ({
  comandoId: crypto.randomUUID(),
  protocolo: crypto.randomUUID(),
  versaoDoCaso: 1,
  operacao: "suspender_perfil" as const,
  perfilId: crypto.randomUUID(),
  versaoDoPerfil: 2,
  motivo: "medida_preventiva" as const,
});
async function preparar() {
  const pedido = comando(),
    contaId = crypto.randomUUID(),
    authSessionId = crypto.randomUUID();
  const token = await emitirProvaDeModeracao(segredo, {
    contaId,
    authSessionId,
    comando: pedido,
    agora,
  });
  return { pedido, contaId, authSessionId, token };
}
describe("prova restrita de comando vincula sessão, corpo e prazo", () => {
  it("mantém a referência real da sessão e devolve o comando canônico", async () => {
    const r = await preparar();
    expect(await verificarProvaDeModeracao(segredo, r.token, r.pedido, agora)).toMatchObject({
      contaId: r.contaId,
      authSessionId: r.authSessionId,
      comando: r.pedido,
      emitidaEm: agora,
      expiraEm: new Date(agora.getTime() + 30000),
    });
    // Ordem de propriedades do transporte não muda o mesmo comando.
    const { perfilId, ...restante } = r.pedido;
    expect(
      (await verificarProvaDeModeracao(segredo, r.token, { perfilId, ...restante }, agora)).comando,
    ).toEqual(r.pedido);
  });
  it("alterar alvo, revisão, caso, operação ou motivo não reaproveita a assinatura", async () => {
    const r = await preparar();
    for (const mudanca of [
      { perfilId: crypto.randomUUID() },
      { versaoDoPerfil: 3 },
      { protocolo: crypto.randomUUID() },
      { versaoDoCaso: 2 },
      { motivo: "risco_confirmado" },
      { operacao: "reativar_perfil" },
      { comandoId: crypto.randomUUID() },
    ])
      await expect(
        verificarProvaDeModeracao(segredo, r.token, { ...r.pedido, ...mudanca }, agora),
      ).rejects.toMatchObject({ codigo: "SEM_PERMISSAO" });
  });
  it("chave errada, formato inventado e campos de autoridade no corpo são recusados", async () => {
    const r = await preparar();
    await expect(
      verificarProvaDeModeracao("2".repeat(64), r.token, r.pedido, agora),
    ).rejects.toMatchObject({ codigo: "SEM_PERMISSAO" });
    await expect(
      verificarProvaDeModeracao(segredo, "x".repeat(4097), r.pedido, agora),
    ).rejects.toMatchObject({ codigo: "SEM_PERMISSAO" });
    await expect(
      verificarProvaDeModeracao(segredo, r.token, { ...r.pedido, role: "owner" }, agora),
    ).rejects.toMatchObject({ codigo: "SEM_PERMISSAO" });
  });
  it("prazo exato de trinta segundos e relógio anterior à emissão são recusados", async () => {
    const r = await preparar();
    for (const instante of [new Date(agora.getTime() - 1), new Date(agora.getTime() + 30000)])
      await expect(
        verificarProvaDeModeracao(segredo, r.token, r.pedido, instante),
      ).rejects.toMatchObject({ codigo: "SEM_PERMISSAO" });
  });
  it("mesma chave não mistura audiência, tipo, emissor ou duração", async () => {
    const r = await preparar(),
      payload = decodeJwt(r.token),
      chave = new TextEncoder().encode(segredo);
    for (const mudanca of [
      { aud: "morada" },
      { iss: "jogo" },
      { exp: Math.floor(agora.getTime() / 1000) + 3600 },
    ]) {
      const token = await new SignJWT({ ...payload, ...mudanca })
        .setProtectedHeader({ alg: "HS256", typ: "recreio-moderacao+jwt" })
        .sign(chave);
      await expect(
        verificarProvaDeModeracao(segredo, token, r.pedido, agora),
      ).rejects.toMatchObject({ codigo: "SEM_PERMISSAO" });
    }
    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .sign(chave);
    await expect(verificarProvaDeModeracao(segredo, token, r.pedido, agora)).rejects.toMatchObject({
      codigo: "SEM_PERMISSAO",
    });
  });
});
