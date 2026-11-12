import { exportPKCS8, exportSPKI, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import {
  ALGORITMO_DOS_TOKENS,
  sessaoVencida,
  TIPO_DA_SESSAO,
  TOLERANCIA_DE_RELOGIO_S,
  VALIDADE_DA_SESSAO_S,
  VALIDADE_DO_INGRESSO_S,
} from "../contrato/tokens";
import type { PerfilId, SessaoDeAparelhoId, SessaoDeJogoId } from "../dominio/ids";
import {
  chavesLocais,
  criarEmissor,
  importarChavePrivada,
  importarChavePublica,
  montarJwks,
  verificarIngresso,
} from "../emissor";
import { criarVerificadorDeSessao } from "../host/verificador";
import { criarEmissorDeTeste } from "../testing";

const perfilId = "3f2b6c1e-8a4d-4c7b-9e21-5d0f6a7b8c9d" as PerfilId;
const sid = "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d" as SessaoDeJogoId;
const aparelho = "7c6b5a49-3827-4615-a403-f2e1d0c9b8a7" as SessaoDeAparelhoId;
const agora = new Date("2026-11-11T12:00:00Z");
const mais = (segundos: number) => () => new Date(agora.getTime() + segundos * 1000);

async function recusa(promessa: Promise<unknown>, codigo: string) {
  await expect(promessa).rejects.toMatchObject({ codigo });
}

describe("sessão de jogo", () => {
  it("é conferida pelo servidor do jogo com a chave pública", async () => {
    const recreio = await criarEmissorDeTeste();
    const token = await recreio.sessao({ perfilId, sid, agora });
    const sessao = await recreio.verificador("morada", mais(10)).verificar(token);
    expect(sessao).toEqual({
      perfilId,
      sid,
      jogo: "morada",
      escopos: ["perfil", "mundos"],
      versaoDaPolitica: 1,
      expiraEm: agora.getTime() + VALIDADE_DA_SESSAO_S * 1000,
    });
  });

  it("não carrega nada além do perfil e da política", async () => {
    const recreio = await criarEmissorDeTeste();
    const token = await recreio.sessao({ perfilId, sid, agora });
    const corpo = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString());
    expect(Object.keys(corpo).sort()).toEqual(
      ["aud", "exp", "iat", "iss", "jti", "nbf", "pv", "scp", "sid", "sub"].sort(),
    );
  });

  it("nunca passa do fim conhecido do acesso", async () => {
    const recreio = await criarEmissorDeTeste();
    const validoAte = new Date(agora.getTime() + 120_000);
    const { expiraEm } = await recreio.emissor.sessao({
      jogo: "morada",
      perfilId,
      sid,
      versaoDaPolitica: 1,
      jti: crypto.randomUUID(),
      agora,
      validoAte,
    });
    expect(expiraEm).toEqual(validoAte);
    await expect(
      recreio.emissor.sessao({
        jogo: "morada",
        perfilId,
        sid,
        versaoDaPolitica: 1,
        jti: crypto.randomUUID(),
        agora,
        validoAte: agora,
      }),
    ).rejects.toThrow();
  });

  it("vence no mesmo instante para quem confere o token e para quem guarda o prazo dele", async () => {
    const recreio = await criarEmissorDeTeste();
    const token = await recreio.sessao({ perfilId, sid, agora });
    const { expiraEm } = await recreio.verificador("morada", mais(1)).verificar(token);
    expect(expiraEm).toBe(agora.getTime() + VALIDADE_DA_SESSAO_S * 1000);

    // Em volta do vencimento e do fim da tolerância, de meio em meio segundo.
    for (let ms = -2000; ms <= (TOLERANCIA_DE_RELOGIO_S + 2) * 1000; ms += 500) {
      const instante = expiraEm + ms;
      const aceita = await recreio
        .verificador("morada", () => new Date(instante))
        .verificar(token)
        .then(
          () => true,
          () => false,
        );
      expect(sessaoVencida(expiraEm, instante), `${ms} ms depois do vencimento`).toBe(!aceita);
    }
    // O token vale pela tolerância inteira e nem um segundo a mais.
    expect(sessaoVencida(expiraEm, expiraEm + TOLERANCIA_DE_RELOGIO_S * 1000 - 1)).toBe(false);
    expect(sessaoVencida(expiraEm, expiraEm + TOLERANCIA_DE_RELOGIO_S * 1000)).toBe(true);
  });

  it("é recusada vencida, de outro jogo, de outro emissor ou adulterada", async () => {
    const recreio = await criarEmissorDeTeste();
    const token = await recreio.sessao({ perfilId, sid, agora });

    await recusa(
      recreio.verificador("morada", mais(VALIDADE_DA_SESSAO_S + 6)).verificar(token),
      "SESSAO_INVALIDA",
    );
    await recusa(recreio.verificador("outro-jogo", mais(10)).verificar(token), "SESSAO_INVALIDA");

    const outroEmissor = criarVerificadorDeSessao({
      emissor: "https://outro.test",
      jogo: "morada",
      jwks: recreio.jwks,
      agora: mais(10),
    });
    await recusa(outroEmissor.verificar(token), "SESSAO_INVALIDA");

    const [cabecalho, corpo, assinatura] = token.split(".");
    const trocado = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(corpo ?? "", "base64url").toString()),
        sub: "00000000-0000-4000-8000-000000000000",
      }),
    ).toString("base64url");
    await recusa(
      recreio.verificador("morada", mais(10)).verificar(`${cabecalho}.${trocado}.${assinatura}`),
      "SESSAO_INVALIDA",
    );
    await recusa(recreio.verificador("morada", mais(10)).verificar("lixo"), "SESSAO_INVALIDA");
  });

  it("é recusada quando assinada por chave desconhecida", async () => {
    const recreio = await criarEmissorDeTeste();
    const impostor = await criarEmissorDeTeste();
    const token = await impostor.sessao({ perfilId, sid, agora });
    await recusa(recreio.verificador("morada", mais(10)).verificar(token), "SESSAO_INVALIDA");
  });

  it("recusa claims a mais ou fora da forma, mesmo com assinatura válida", async () => {
    const par = await generateKeyPair(ALGORITMO_DOS_TOKENS, { extractable: true });
    const jwks = await montarJwks([{ kid: "k", chave: par.publicKey }]);
    const verificador = criarVerificadorDeSessao({
      emissor: "https://recreio.test",
      jogo: "morada",
      jwks,
      agora: mais(10),
    });
    const base = Math.floor(agora.getTime() / 1000);
    const assinar = (claims: Record<string, unknown>) =>
      new SignJWT({ sid, scp: ["perfil"], pv: 1, ...claims })
        .setProtectedHeader({ alg: ALGORITMO_DOS_TOKENS, typ: TIPO_DA_SESSAO, kid: "k" })
        .setIssuer("https://recreio.test")
        .setAudience("morada")
        .setSubject(perfilId)
        .setJti(crypto.randomUUID())
        .setIssuedAt(base)
        .setNotBefore(base)
        .setExpirationTime(base + 60)
        .sign(par.privateKey);

    await expect(verificador.verificar(await assinar({}))).resolves.toMatchObject({ perfilId });
    await recusa(verificador.verificar(await assinar({ email: "a@b.c" })), "SESSAO_INVALIDA");
    await recusa(verificador.verificar(await assinar({ sid: "nao-uuid" })), "SESSAO_INVALIDA");
    await recusa(verificador.verificar(await assinar({ scp: ["admin"] })), "SESSAO_INVALIDA");
  });
});

describe("ingresso", () => {
  it("vale 60 s e identifica perfil, aparelho e jogo", async () => {
    const recreio = await criarEmissorDeTeste();
    const jti = crypto.randomUUID();
    const { token, expiraEm } = await recreio.emissor.ingresso({
      jogo: "morada",
      perfilId,
      sessaoDeAparelhoId: aparelho,
      versaoDaPolitica: 2,
      jti,
      agora,
    });
    expect(expiraEm.getTime()).toBe(agora.getTime() + VALIDADE_DO_INGRESSO_S * 1000);

    const chaves = chavesLocais(recreio.jwks);
    const ingresso = await verificarIngresso(token, {
      chaves,
      emissor: recreio.emissor.emissor,
      agora: mais(30),
    });
    expect(ingresso).toEqual({
      perfilId,
      sessaoDeAparelhoId: aparelho,
      jogo: "morada",
      jti,
      versaoDaPolitica: 2,
      expiraEm: expiraEm.getTime(),
    });

    await recusa(
      verificarIngresso(token, {
        chaves,
        emissor: recreio.emissor.emissor,
        agora: mais(VALIDADE_DO_INGRESSO_S + 6),
      }),
      "INGRESSO_INVALIDO",
    );
  });

  it("não passa por sessão, nem sessão por ingresso", async () => {
    const recreio = await criarEmissorDeTeste();
    const { token: ingresso } = await recreio.emissor.ingresso({
      jogo: "morada",
      perfilId,
      sessaoDeAparelhoId: aparelho,
      versaoDaPolitica: 1,
      jti: crypto.randomUUID(),
      agora,
    });
    const sessao = await recreio.sessao({ perfilId, sid, agora });

    await recusa(recreio.verificador("morada", mais(10)).verificar(ingresso), "SESSAO_INVALIDA");
    await recusa(
      verificarIngresso(sessao, {
        chaves: chavesLocais(recreio.jwks),
        emissor: recreio.emissor.emissor,
        agora: mais(10),
      }),
      "INGRESSO_INVALIDO",
    );
  });
});

describe("chaves", () => {
  it("lê PEM com quebras de linha escapadas, como em variável de ambiente", async () => {
    const par = await generateKeyPair(ALGORITMO_DOS_TOKENS, { extractable: true });
    const privadaPem = (await exportPKCS8(par.privateKey)).replace(/\n/g, "\\n");
    const publicaPem = (await exportSPKI(par.publicKey)).replace(/\n/g, "\\n");

    const emissor = criarEmissor({
      emissor: "https://recreio.test",
      kid: "2026-11",
      chavePrivada: await importarChavePrivada(privadaPem),
    });
    const jwks = await montarJwks([
      { kid: "2026-11", chave: await importarChavePublica(publicaPem) },
    ]);
    expect(jwks.keys[0]).toMatchObject({ kty: "OKP", crv: "Ed25519", kid: "2026-11", use: "sig" });
    expect(jwks.keys[0]).not.toHaveProperty("d");

    const { token } = await emissor.sessao({
      jogo: "morada",
      perfilId,
      sid,
      versaoDaPolitica: 1,
      jti: crypto.randomUUID(),
      agora,
    });
    const verificador = criarVerificadorDeSessao({
      emissor: "https://recreio.test",
      jogo: "morada",
      jwks,
      agora: mais(1),
    });
    await expect(verificador.verificar(token)).resolves.toMatchObject({ sid });
  });

  it("não publica chave privada no conjunto", async () => {
    const par = await generateKeyPair(ALGORITMO_DOS_TOKENS, { extractable: true });
    await expect(montarJwks([{ kid: "k", chave: par.privateKey }])).rejects.toThrow();
  });
});
