import { db, eq } from "@informach/db";
import { recreioSafetyReports as reports, users } from "@informach/db/schema";
import { emitirProvaDeModeracao } from "@informach/recreio/emissor";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/moderacao/v1/comandos/route";
import { denunciarContato } from "@/features/moderacao/denuncias-service";
import { emitirCodigoDeAmigo, pedirAmizade } from "@/features/social/service";
import { env } from "@/lib/env";
import { loginReal, novaConta, novoJogador } from "./apoio";
import { referenciaSocial as ref } from "./social-apoio";

async function preparar() {
  const alvo = await novoJogador({ comAcesso: false }),
    origem = await novoJogador({ comAcesso: false });
  const codigo = await emitirCodigoDeAmigo(ref(alvo));
  await pedirAmizade(ref(origem), { codigo: codigo.codigo, pedidoId: crypto.randomUUID() });
  const caso = await denunciarContato(ref(origem), {
    perfilId: alvo.perfil.id,
    denunciaId: crypto.randomUUID(),
    categoria: "ameaca",
  });
  const staff = await novaConta(),
    login = await loginReal(staff);
  await db
    .update(users)
    .set({ role: "admin", twoFactorEnabled: true })
    .where(eq(users.id, staff.id));
  const comando = {
    comandoId: crypto.randomUUID(),
    protocolo: caso.protocolo,
    versaoDoCaso: 1,
    operacao: "analisar",
  };
  if (!env.RECREIO_MODERATION_SECRET) throw new Error("Credencial isolada ausente");
  const token = await emitirProvaDeModeracao(env.RECREIO_MODERATION_SECRET, {
    contaId: staff.id,
    authSessionId: login.authSessionId,
    comando,
    agora: new Date(),
  });
  const enviar = (body: unknown = comando, authorization = `Bearer ${token}`) =>
    POST(
      new Request("http://localhost:3009/api/moderacao/v1/comandos", {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
          "X-Staff-Id": staff.id,
        },
        body: JSON.stringify(body),
      }),
    );
  return { staff, comando, token, enviar };
}
describe("API de moderação só admite prova própria com corpo exato e equipe atual", () => {
  it("confirma recibo sem cache e nega replay depois da retirada das duas etapas", async () => {
    const r = await preparar(),
      primeira = await r.enviar();
    expect(primeira.status).toBe(200);
    expect(primeira.headers.get("cache-control")).toBe("no-store");
    expect(await primeira.json()).toMatchObject({
      comandoId: r.comando.comandoId,
      versaoDoCaso: 2,
      repetido: false,
    });
    expect(await (await r.enviar()).json()).toMatchObject({ repetido: true });
    await db.update(users).set({ twoFactorEnabled: false }).where(eq(users.id, r.staff.id));
    expect((await r.enviar()).status).toBe(403);
  });
  it("segredo do jogo e identidade em cabeçalho não concedem autoridade", async () => {
    const r = await preparar();
    const host = Object.values(env.RECREIO_HOST_SECRETS)[0];
    if (!host) throw new Error("Segredo do jogo isolado ausente");
    expect((await r.enviar(r.comando, `Bearer ${host}`)).status).toBe(403);
    expect((await r.enviar(r.comando, "")).status).toBe(403);
    expect(
      (await db.select().from(reports).where(eq(reports.id, r.comando.protocolo)))[0]?.revision,
    ).toBe(1);
  });
  it("recusa alteração do corpo, campos de ator e excesso de tamanho sem mudar o caso", async () => {
    const r = await preparar();
    expect((await r.enviar({ ...r.comando, versaoDoCaso: 2 })).status).toBe(403);
    expect((await r.enviar({ ...r.comando, actorUserId: r.staff.id })).status).toBe(400);
    expect((await r.enviar({ ...r.comando, conteudo: "x".repeat(5000) })).status).toBe(413);
    expect(
      (await db.select().from(reports).where(eq(reports.id, r.comando.protocolo)))[0]?.revision,
    ).toBe(1);
  });
});
