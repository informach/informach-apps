import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync, brotliDecompressSync } from "node:zlib";
import type { Manifesto } from "@informach/morada-arte/manifesto";
import type { PerfilId, SessaoDeJogoId } from "@informach/recreio";
import { criarEmissorDeTeste, type EmissorDeTeste } from "@informach/recreio/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aceitaBrotli, carregarArte, type RotaDaArte } from "../src/arte";
import { lerConfiguracao } from "../src/config";

/**
 * A rota da arte com um pacote de mentira (bytes quaisquer com o nome no
 * formato do empacotador): nenhum arquivo de arte entra nos testes.
 */

const ORIGEM = "http://localhost:3009";
const PERSONAGEM = "lia.0123456789.glb";
const BIBLIOTECA = "anim-adulto.abcdef0123.glb";

const manifesto: Manifesto = {
  formato: "morada-arte",
  versao: 1,
  arte: { repositorio: "informach/artes-3d", commit: null },
  personagens: [
    {
      id: "lia",
      nome: "Lia",
      arquivo: PERSONAGEM,
      bytes: 6,
      corpo: "adulta",
      sexo: "f",
      faixa: "adulto",
      altura: 1.7,
      biblioteca: "adulto",
      bibliotecaDeGravida: null,
      noDoCorpo: "corpo",
      noDaChupeta: null,
      expressoes: [{ nome: "neutro", no: "rosto_neutro", fala: [] }],
      gravidez: [],
      pesosDobrado: false,
      ancoras: {
        colo: [0, 1, 0.2],
        coloMedido: false,
        cabeca: [0, 1.5, 0],
        maos: {
          esq: { osso: "LeftHand", posicao: [0.6, 0.9, 0] },
          dir: { osso: "RightHand", posicao: [-0.6, 0.9, 0] },
        },
      },
      desenho: { chamadas: 2, triangulos: 10, vertices: 10, texturas: 0 },
      sim: null,
    },
  ],
  bibliotecas: [
    {
      id: "adulto",
      arquivo: BIBLIOTECA,
      bytes: 8,
      faixa: "adulto",
      gravida: false,
      clipes: [],
      posturas: {},
      interacoes: {},
    },
  ],
};

const CONTEUDO_DO_PERSONAGEM = Buffer.from("glb-de-mentira ".repeat(200));

let pasta = "";
let servidor: Server;
let endereco = "";
let recreio: EmissorDeTeste;
let rota: RotaDaArte;
let agora = Date.now();

const perfilId = "4c3c0f8e-2a0b-4f1e-9a4e-0d4f3b2a1c00" as PerfilId;
const sid = "9b8f7e6d-5c4b-4a3f-8e2d-1c0b9a8f7e6d" as SessaoDeJogoId;

type Resposta = {
  status: number;
  cabecalhos: Record<string, string | string[] | undefined>;
  corpo: Buffer;
};

/** Um pedido HTTP cru: o caminho vai como está, sem a normalização que `fetch` faria. */
function pedir(
  caminho: string,
  cabecalhos: Record<string, string> = {},
  metodo = "GET",
): Promise<Resposta> {
  const url = new URL(endereco);
  return new Promise((resolve, reject) => {
    const req = request(
      { host: url.hostname, port: url.port, path: caminho, method: metodo, headers: cabecalhos },
      (res) => {
        const partes: Buffer[] = [];
        res.on("data", (parte: Buffer) => partes.push(parte));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            cabecalhos: res.headers,
            corpo: Buffer.concat(partes),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

const comSessao = async (extra: Record<string, string> = {}, jogo = "morada") => ({
  origin: ORIGEM,
  authorization: `Bearer ${await recreio.sessao({ perfilId, sid, jogo })}`,
  ...extra,
});

beforeAll(async () => {
  pasta = mkdtempSync(join(tmpdir(), "morada-arte-servida-"));
  writeFileSync(join(pasta, "manifest.json"), JSON.stringify(manifesto));
  writeFileSync(join(pasta, PERSONAGEM), CONTEUDO_DO_PERSONAGEM);
  writeFileSync(join(pasta, `${PERSONAGEM}.br`), brotliCompressSync(CONTEUDO_DO_PERSONAGEM));
  // A biblioteca sem a cópia em brotli: é entregue sem compressão.
  writeFileSync(join(pasta, BIBLIOTECA), Buffer.from("animacoes"));
  // Um arquivo na pasta que o manifesto não cita, e um fora da pasta, ao lado dela.
  writeFileSync(join(pasta, "segredo.txt"), "não pode sair");
  writeFileSync(join(pasta, "..", "vizinho-da-arte.txt"), "também não");

  recreio = await criarEmissorDeTeste();
  rota = carregarArte({
    pasta,
    verificador: recreio.verificador("morada"),
    origens: [ORIGEM],
    exigirOrigem: true,
    agora: () => agora,
  });
  servidor = createServer((pedido, resposta) => {
    if (!rota.tratar(pedido, resposta)) {
      resposta.writeHead(404);
      resposta.end("outra rota");
    }
  });
  await new Promise<void>((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  endereco = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => servidor.close(() => resolve()));
  rmSync(pasta, { recursive: true, force: true });
  rmSync(join(pasta, "..", "vizinho-da-arte.txt"), { force: true });
});

describe("entrega da arte", () => {
  it("V2 entrega acabamentos PNG autenticados e não expõe arquivos fora do manifesto", async () => {
    const nome = "tex-piso.0123456789.png";
    const m = {
      ...manifesto,
      versao: 2,
      objetos: [],
      aberturas: [],
      acabamentos: [{ id: "piso", arquivo: nome, bytes: 3, escala: 2 }],
    };
    const anterior = rota;
    try {
      writeFileSync(join(pasta, nome), Buffer.from([1, 2, 3]));
      writeFileSync(join(pasta, "manifest.json"), JSON.stringify(m));
      rota = carregarArte({
        pasta,
        verificador: recreio.verificador("morada"),
        origens: [ORIGEM],
        exigirOrigem: true,
      });
      const resposta = await pedir(`/arte/${nome}`, await comSessao());
      expect(resposta.status).toBe(200);
      expect(resposta.cabecalhos["content-type"]).toBe("image/png");
      expect(resposta.cabecalhos["cache-control"]).toContain("private");
      expect(resposta.corpo).toEqual(Buffer.from([1, 2, 3]));
      expect((await pedir(`/arte/${nome}`, { origin: ORIGEM })).status).toBe(401);
      expect((await pedir("/arte/tex-outro.0123456789.png", await comSessao())).status).toBe(404);
    } finally {
      rota = anterior;
      writeFileSync(join(pasta, "manifest.json"), JSON.stringify(manifesto));
    }
  });
  it("lê o manifesto e conta os arquivos que pode entregar", () => {
    expect(rota.arquivos).toBe(3);
    expect(rota.manifesto.personagens[0]?.id).toBe("lia");
  });

  it("entrega um pacote a quem tem sessão, com cache imutável, CORS da origem e brotli", async () => {
    const resposta = await pedir(
      `/arte/${PERSONAGEM}`,
      await comSessao({ "accept-encoding": "gzip, br" }),
    );
    expect(resposta.status).toBe(200);
    expect(resposta.cabecalhos["cache-control"]).toBe("private, max-age=31536000, immutable");
    expect(resposta.cabecalhos["access-control-allow-origin"]).toBe(ORIGEM);
    expect(resposta.cabecalhos["content-type"]).toBe("model/gltf-binary");
    expect(resposta.cabecalhos["content-encoding"]).toBe("br");
    expect(resposta.cabecalhos.vary).toContain("Accept-Encoding");
    expect(brotliDecompressSync(resposta.corpo)).toEqual(CONTEUDO_DO_PERSONAGEM);
  });

  it("sem brotli aceito, ou sem a cópia, entrega o arquivo como está", async () => {
    const semBr = await pedir(
      `/arte/${PERSONAGEM}`,
      await comSessao({ "accept-encoding": "gzip" }),
    );
    expect(semBr.cabecalhos["content-encoding"]).toBeUndefined();
    expect(semBr.corpo).toEqual(CONTEUDO_DO_PERSONAGEM);
    const recusado = await pedir(
      `/arte/${PERSONAGEM}`,
      await comSessao({ "accept-encoding": "br;q=0" }),
    );
    expect(recusado.cabecalhos["content-encoding"]).toBeUndefined();
    const biblioteca = await pedir(
      `/arte/${BIBLIOTECA}`,
      await comSessao({ "accept-encoding": "br" }),
    );
    expect(biblioteca.status).toBe(200);
    expect(biblioteca.cabecalhos["content-encoding"]).toBeUndefined();
    expect(biblioteca.corpo.toString()).toBe("animacoes");
  });

  it("o manifesto é revalidado pelo ETag", async () => {
    const primeira = await pedir("/arte/manifest.json", await comSessao());
    expect(primeira.status).toBe(200);
    expect(primeira.cabecalhos["cache-control"]).toBe("private, no-cache");
    expect(JSON.parse(primeira.corpo.toString())).toEqual(manifesto);
    const etag = String(primeira.cabecalhos.etag);
    const segunda = await pedir("/arte/manifest.json", await comSessao({ "if-none-match": etag }));
    expect(segunda.status).toBe(304);
    expect(segunda.corpo.length).toBe(0);
  });

  it("a cópia em brotli tem ETag próprio", async () => {
    const br = await pedir(`/arte/${PERSONAGEM}`, await comSessao({ "accept-encoding": "br" }));
    const cru = await pedir(`/arte/${PERSONAGEM}`, await comSessao({ "accept-encoding": "gzip" }));
    expect(br.cabecalhos.etag).not.toBe(cru.cabecalhos.etag);
    const cruComEtagDoBr = await pedir(
      `/arte/${PERSONAGEM}`,
      await comSessao({ "accept-encoding": "gzip", "if-none-match": String(br.cabecalhos.etag) }),
    );
    expect(cruComEtagDoBr.status).toBe(200);
    const brDeNovo = await pedir(
      `/arte/${PERSONAGEM}`,
      await comSessao({ "accept-encoding": "br", "if-none-match": String(br.cabecalhos.etag) }),
    );
    expect(brDeNovo.status).toBe(304);
  });

  it("recusa sem sessão, com sessão vencida, de outro jogo ou forjada", async () => {
    const semSessao = await pedir(`/arte/${PERSONAGEM}`, { origin: ORIGEM });
    expect(semSessao.status).toBe(401);
    // Mesmo recusada, a resposta leva o CORS: a página consegue ler o motivo.
    expect(semSessao.cabecalhos["access-control-allow-origin"]).toBe(ORIGEM);

    const vencida = await recreio.sessao({
      perfilId,
      sid,
      agora: new Date(Date.now() - 60 * 60 * 1000),
    });
    const comVencida = await pedir(`/arte/${PERSONAGEM}`, {
      origin: ORIGEM,
      authorization: `Bearer ${vencida}`,
    });
    expect(comVencida.status).toBe(401);

    const deOutroJogo = await pedir(`/arte/${PERSONAGEM}`, await comSessao({}, "teste"));
    expect(deOutroJogo.status).toBe(401);

    const outroRecreio = await criarEmissorDeTeste();
    const forjada = await outroRecreio.sessao({ perfilId, sid });
    const comForjada = await pedir(`/arte/${PERSONAGEM}`, {
      origin: ORIGEM,
      authorization: `Bearer ${forjada}`,
    });
    expect(comForjada.status).toBe(401);
    for (const resposta of [semSessao, comVencida, deOutroJogo, comForjada]) {
      expect(resposta.corpo.toString()).not.toContain("glb-de-mentira");
    }
  });

  it("recusa a sessão que venceu enquanto o processo esperava, pelo relógio do servidor", async () => {
    const cabecalhos = await comSessao();
    agora = Date.now() + 16 * 60 * 1000;
    try {
      expect((await pedir(`/arte/${PERSONAGEM}`, cabecalhos)).status).toBe(401);
    } finally {
      agora = Date.now();
    }
  });

  it("só entrega nomes do manifesto: nada da pasta e nada de fora dela", async () => {
    const cabecalhos = await comSessao();
    for (const caminho of [
      "/arte/segredo.txt",
      "/arte/../vizinho-da-arte.txt",
      "/arte/..%2fvizinho-da-arte.txt",
      "/arte/%2e%2e/vizinho-da-arte.txt",
      `/arte/./${PERSONAGEM}`,
      `/arte/${PERSONAGEM}.br`,
      "/arte/",
      "/arte/manifest.json/",
    ]) {
      const resposta = await pedir(caminho, cabecalhos);
      expect(resposta.status, caminho).toBe(404);
      expect(resposta.corpo.toString(), caminho).not.toMatch(/não pode sair|também não/);
    }
    // Sem sessão, um nome que não existe dá a mesma recusa de um que existe.
    expect((await pedir("/arte/segredo.txt", { origin: ORIGEM })).status).toBe(401);
  });

  it("CORS só para as origens configuradas, e a consulta prévia libera o cabeçalho da sessão", async () => {
    const outra = await pedir(
      `/arte/${PERSONAGEM}`,
      await comSessao({ origin: "https://outro.test" }),
    );
    expect(outra.status).toBe(403);
    expect(outra.cabecalhos["access-control-allow-origin"]).toBeUndefined();
    const { origin: _, ...semOrigem } = await comSessao();
    expect((await pedir(`/arte/${PERSONAGEM}`, semOrigem)).status).toBe(403);

    const previa = await pedir(
      `/arte/${PERSONAGEM}`,
      {
        origin: ORIGEM,
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization",
      },
      "OPTIONS",
    );
    expect(previa.status).toBe(204);
    expect(previa.cabecalhos["access-control-allow-origin"]).toBe(ORIGEM);
    expect(previa.cabecalhos["access-control-allow-headers"]).toBe("authorization");
    const previaDeOutra = await pedir(
      `/arte/${PERSONAGEM}`,
      { origin: "https://outro.test" },
      "OPTIONS",
    );
    expect(previaDeOutra.status).toBe(403);

    expect((await pedir(`/arte/${PERSONAGEM}`, await comSessao(), "POST")).status).toBe(405);
    const cabeca = await pedir(`/arte/${PERSONAGEM}`, await comSessao(), "HEAD");
    expect(cabeca.status).toBe(200);
    expect(cabeca.corpo.length).toBe(0);
  });

  it("outros caminhos não são da arte", async () => {
    const resposta = await pedir("/api/health");
    expect(resposta.corpo.toString()).toBe("outra rota");
  });
});

describe("pasta da arte", () => {
  it("a subida falha se o manifesto falta, está fora do formato ou cita um arquivo ausente", async () => {
    const vazia = mkdtempSync(join(tmpdir(), "morada-arte-vazia-"));
    try {
      const verificador = recreio.verificador("morada");
      expect(() => carregarArte({ pasta: vazia, verificador, origens: [] })).toThrow(
        /manifest\.json/,
      );
      writeFileSync(join(vazia, "manifest.json"), JSON.stringify({ formato: "outro" }));
      expect(() => carregarArte({ pasta: vazia, verificador, origens: [] })).toThrow(/formato/);
      writeFileSync(join(vazia, "manifest.json"), JSON.stringify(manifesto));
      expect(() => carregarArte({ pasta: vazia, verificador, origens: [] })).toThrow(PERSONAGEM);
    } finally {
      rmSync(vazia, { recursive: true, force: true });
    }
  });

  it("sem MORADA_ARTE_DIR a configuração fica sem arte", () => {
    const base = { MORADA_PLATAFORMA: "falsa" };
    expect(lerConfiguracao(base).MORADA_ARTE_DIR).toBeUndefined();
    expect(lerConfiguracao({ ...base, MORADA_ARTE_DIR: "  " }).MORADA_ARTE_DIR).toBeUndefined();
    expect(lerConfiguracao({ ...base, MORADA_ARTE_DIR: "/arte" }).MORADA_ARTE_DIR).toBe("/arte");
  });

  it("lê o Accept-Encoding", () => {
    expect(aceitaBrotli("gzip, deflate, br, zstd")).toBe(true);
    expect(aceitaBrotli("br;q=0.5")).toBe(true);
    expect(aceitaBrotli("br;q=0")).toBe(false);
    expect(aceitaBrotli("gzip")).toBe(false);
    expect(aceitaBrotli(undefined)).toBe(false);
  });
});
