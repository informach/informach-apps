import { and, db, eq } from "@informach/db";
import { recreioSpaceMembers as members, recreioProfiles as profiles } from "@informach/db/schema";
import { expect, it } from "vitest";
import { painelDaResponsabilidade } from "@/features/mundos/responsabilidade";
import { proporResponsabilidade } from "@/features/mundos/responsabilidade-repository";
import { type Jogador, novoJogador } from "./apoio";
import { mundoDe } from "./jogo-apoio";

const autor = (p: Jogador) => ({
  contaId: p.conta.id,
  perfilId: p.perfil.id,
  sessaoDeAparelhoId: p.ator.sessaoDeAparelhoId,
});
async function cenario() {
  const lia = await novoJogador();
  const bruno = await novoJogador({ comAcesso: false });
  const id = await mundoDe(lia);
  const [dona] = await db.select().from(members).where(eq(members.spaceId, id));
  if (!dona) throw new Error("Responsável ausente na bancada.");
  const [membro] = await db
    .insert(members)
    .values({
      spaceId: id,
      profileId: bruno.perfil.id,
      role: "member",
      state: "away",
      invitedByMemberId: dona.id,
      participation: "valor-interno",
    })
    .returning();
  if (!membro) throw new Error("Participação ausente na bancada.");
  const proposta = await proporResponsabilidade(
    {
      ...autor(lia),
      login: {
        authSessionId: lia.login.authSessionId,
        criadoEm: new Date(),
        expiraEm: lia.login.expiraEm,
      },
    },
    id,
    membro.id,
  );
  return { lia, bruno, id, membro, proposta };
}

it("o destinatário lê a própria proposta sem cobertura, sem conteúdo ou lista de outros membros", async () => {
  const c = await cenario();
  const painel = await painelDaResponsabilidade(autor(c.bruno), c.id);
  expect(painel).toEqual({
    mundo: { id: c.id, nome: "Casa de teste" },
    responsavel: false,
    podeTransferir: true,
    candidatos: [],
    proposta: {
      id: c.proposta.pedidoId,
      recebida: true,
      destinatario: null,
      expiraEm: expect.any(Date),
      vigente: true,
    },
  });
});

it("só o responsável recebe os adultos elegíveis do próprio mundo", async () => {
  const c = await cenario();
  const [menor] = await db
    .insert(profiles)
    .values({ nickname: "Perfil menor", kind: "minor" })
    .returning();
  if (!menor) throw new Error("Perfil ausente na bancada.");
  await db
    .insert(members)
    .values({ spaceId: c.id, profileId: menor.id, role: "member", state: "active" });
  const painel = await painelDaResponsabilidade(autor(c.lia), c.id);
  expect(painel.candidatos).toEqual([{ id: c.membro.id, apelido: c.bruno.perfil.apelido }]);
  expect(painel.proposta).toMatchObject({ recebida: false, destinatario: c.bruno.perfil.apelido });
});

it("vínculo alheio ou encerrado não revela o painel", async () => {
  const c = await cenario();
  const outra = await novoJogador();
  await expect(painelDaResponsabilidade(autor(outra), c.id)).rejects.toMatchObject({
    code: "MUNDO",
  });
  await db
    .update(members)
    .set({ state: "former", leftAt: new Date() })
    .where(and(eq(members.spaceId, c.id), eq(members.profileId, c.bruno.perfil.id)));
  await expect(painelDaResponsabilidade(autor(c.bruno), c.id)).rejects.toMatchObject({
    code: "MUNDO",
  });
});
