import { randomBytes } from "node:crypto";
import { SessaoAbertaSchema } from "@informach/recreio/contrato";
import { expect, it } from "vitest";
import { emitirIngresso, sessaoDeJogoDoToken } from "@/features/sessao-de-jogo/service";
import { novoJogador } from "./apoio";
import { pedir } from "./rotas";

it("a mesma prova recupera a abertura cuja primeira resposta já foi confirmada", async () => {
  const pessoa = await novoJogador();
  const ingresso = await emitirIngresso(pessoa.ator, { jogo: "morada" });
  const corpo = {
    ingresso: ingresso.ingresso,
    chaveDeTroca: randomBytes(32).toString("base64url"),
  };
  const primeira = await pedir("POST", "/api/sdk/v1/sessao", { corpo });
  expect(primeira.status).toBe(200);
  const aberta = SessaoAbertaSchema.parse(primeira.corpo);
  const original = await sessaoDeJogoDoToken(aberta.token);
  const repetida = await pedir("POST", "/api/sdk/v1/sessao", { corpo });
  expect(repetida.status).toBe(200);
  const recuperada = SessaoAbertaSchema.parse(repetida.corpo);
  expect((await sessaoDeJogoDoToken(recuperada.token)).sid).toBe(original.sid);
  expect(recuperada.expiraEm).toBe(aberta.expiraEm);
});
