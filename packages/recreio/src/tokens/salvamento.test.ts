import { describe, expect, it } from "vitest";
import { TIPO_DO_SALVAMENTO } from "../contrato/tokens";
import { PerfilIdSchema, SessaoDeAparelhoIdSchema, SessaoDeJogoIdSchema } from "../dominio/ids";
import {
  chavesLocais,
  verificarIngresso,
  verificarSalvamentoEmitido,
  verificarSessaoEmitida,
} from "../emissor";
import { criarEmissorDeTeste } from "../testing";

const agora = new Date("2026-11-17T12:00:00Z");
const dados = {
  jogo: "morada",
  perfilId: PerfilIdSchema.parse("3f2b6c1e-8a4d-4c7b-9e21-5d0f6a7b8c9d"),
  sid: SessaoDeJogoIdSchema.parse("9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d"),
  versaoDaPolitica: 1,
  reciboId: "70f84de0-1d87-470a-9d9f-e505f593e3cd",
  agora,
  fimDaConcessao: new Date(agora.getTime() + 60_000),
};

describe("token restrito de salvamento", () => {
  it("tem escopo exclusivo e conserva o prazo assinado sem identidade da conta", async () => {
    const r = await criarEmissorDeTeste();
    const emitido = await r.emissor.salvamento(dados);
    const [cabecalho, payload] = emitido.token
      .split(".")
      .slice(0, 2)
      .map((parte) => JSON.parse(Buffer.from(parte, "base64url").toString()));
    expect(cabecalho.typ).toBe(TIPO_DO_SALVAMENTO);
    expect(payload.scp).toEqual(["salvar"]);
    expect(Object.keys(payload).sort()).toEqual(
      ["iss", "aud", "sub", "sid", "jti", "pv", "scp", "iat", "nbf", "exp"].sort(),
    );
    expect(emitido.expiraEm).toEqual(new Date(agora.getTime() + 90_000));
    expect(
      await verificarSalvamentoEmitido(emitido.token, {
        chaves: chavesLocais(r.jwks),
        emissor: r.emissor.emissor,
        jogo: "morada",
        agora: () => agora,
      }),
    ).toEqual({
      reciboId: dados.reciboId,
      perfilId: dados.perfilId,
      sid: dados.sid,
      jogo: dados.jogo,
      versaoDaPolitica: 1,
      expiraEm: emitido.expiraEm.getTime(),
    });
  });
  it("salvamento nunca abre ingresso, sessão emitida ou entrada no host", async () => {
    const r = await criarEmissorDeTeste();
    const { token } = await r.emissor.salvamento(dados);
    const opcoes = { chaves: chavesLocais(r.jwks), emissor: r.emissor.emissor, agora: () => agora };
    await expect(verificarIngresso(token, opcoes)).rejects.toMatchObject({
      codigo: "INGRESSO_INVALIDO",
    });
    await expect(verificarSessaoEmitida(token, opcoes)).rejects.toMatchObject({
      codigo: "SESSAO_INVALIDA",
    });
    await expect(r.verificador("morada", () => agora).verificar(token)).rejects.toMatchObject({
      codigo: "SESSAO_INVALIDA",
    });
  });
  it("sessão e ingresso normais não substituem a capacidade restrita", async () => {
    const r = await criarEmissorDeTeste();
    const sessao = await r.sessao(dados);
    const ingresso = await r.emissor.ingresso({
      ...dados,
      jti: dados.reciboId,
      sessaoDeAparelhoId: SessaoDeAparelhoIdSchema.parse("7c6b5a49-3827-4615-a403-f2e1d0c9b8a7"),
    });
    for (const token of [sessao, ingresso.token])
      await expect(
        verificarSalvamentoEmitido(token, {
          chaves: chavesLocais(r.jwks),
          emissor: r.emissor.emissor,
          agora: () => agora,
        }),
      ).rejects.toMatchObject({ codigo: "SESSAO_INVALIDA" });
  });
  it("recusa audiência, emissor e chave diferentes e vence exatamente no prazo", async () => {
    const r = await criarEmissorDeTeste();
    const outro = await criarEmissorDeTeste();
    const { token, expiraEm } = await r.emissor.salvamento(dados);
    const opcoes = {
      chaves: chavesLocais(r.jwks),
      emissor: r.emissor.emissor,
      jogo: "morada",
      agora: () => new Date(expiraEm.getTime() - 1),
    };
    await expect(verificarSalvamentoEmitido(token, opcoes)).resolves.toMatchObject({
      reciboId: dados.reciboId,
    });
    for (const recusada of [
      { ...opcoes, jogo: "outro-jogo" },
      { ...opcoes, emissor: "https://outra.test" },
      { ...opcoes, chaves: chavesLocais(outro.jwks) },
      { ...opcoes, agora: () => expiraEm },
    ])
      await expect(verificarSalvamentoEmitido(token, recusada)).rejects.toMatchObject({
        codigo: "SESSAO_INVALIDA",
      });
  });
  it("não emite margem para uma concessão vencida ou acima do teto", async () => {
    const r = await criarEmissorDeTeste();
    await expect(r.emissor.salvamento({ ...dados, fimDaConcessao: agora })).rejects.toThrow();
    await expect(
      r.emissor.salvamento({ ...dados, fimDaConcessao: new Date(agora.getTime() + 901_000) }),
    ).rejects.toThrow();
  });
});
