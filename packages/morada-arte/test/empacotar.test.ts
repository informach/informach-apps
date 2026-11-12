import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliDecompressSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Canal, ehCiclo, reduzirCanal, valorDoCanal } from "../src/animacao/clipes";
import { CLIPES_DO_JOGO, escolherClipes, POSE_DOBRADA } from "../src/animacao/jogo";
import { dentroDoRepositorio, executar, lerArgumentos } from "../src/cli";
import { empacotar } from "../src/empacotar";
import { ErroDeArte } from "../src/erros";
import { Biblioteca } from "../src/leitura/biblioteca";
import { ArquivoGlb } from "../src/leitura/glb";
import { arquivosDoManifesto, ManifestoSchema, SUFIXO_BROTLI } from "../src/manifesto";
import { type Personagem, PersonagemSchema } from "../src/personagem/esquema";
import { montarPersonagem } from "../src/personagem/montagem";
import { ELENCO_DA_PROVA } from "../src/personagem/prova";
import { personagemDoElenco, resolver } from "../src/personagem/resolucao";
import { entradaESaida, pesosEmBytes } from "../src/saida/glb";
import { fabricarArte } from "./fabrica";

const ze: Personagem = PersonagemSchema.parse({
  id: "ze",
  nome: "Zé",
  corpo: "boneco",
  pele: "Clara",
  cabelo: { penteado: "topete", cor: "Preto" },
  roupa: { cima: { id: "camisa", cor: "#D9433B" } },
});

const hashes = (pasta: string): Record<string, string> =>
  Object.fromEntries(
    readdirSync(pasta)
      .sort()
      .map((nome) => [
        nome,
        createHash("sha256")
          .update(readFileSync(join(pasta, nome)))
          .digest("hex"),
      ]),
  );

describe("empacotador sobre uma biblioteca de mentira", () => {
  let arte = "";
  const pastas: string[] = [];
  const nova = (): string => {
    const pasta = mkdtempSync(join(tmpdir(), "morada-arte-saida-"));
    pastas.push(pasta);
    return pasta;
  };
  beforeAll(async () => {
    arte = await fabricarArte(mkdtempSync(join(tmpdir(), "morada-arte-")));
    pastas.push(arte);
  });
  afterAll(() => {
    for (const pasta of pastas) rmSync(pasta, { recursive: true, force: true });
  });

  it("resolve a descrição pelas regras da página", () => {
    const biblioteca = new Biblioteca(arte);
    const plano = resolver(biblioteca, ze);
    expect(plano.pecas.map((p) => [p.id, p.cor])).toEqual([["camisa", "#D9433B"]]);
    expect(plano.penteado).toBe("topete");
    expect(plano.biblioteca).toBe("boneco");
    // sem cor na descrição, vale a cor inicial do catálogo (a da variação, herdada ou própria)
    const semCor = resolver(
      biblioteca,
      PersonagemSchema.parse({ ...ze, roupa: { cima: { id: "camisa_vermelha" } } }),
    );
    expect(semCor.pecas[0]?.cor).toBe("#D9433B");
    const comNull = resolver(
      biblioteca,
      PersonagemSchema.parse({ ...ze, roupa: { cima: { id: "camisa", cor: null } } }),
    );
    expect(comNull.pecas[0]?.cor).toBeNull();
  });

  it("recusa com mensagem clara o que não existe ou não cabe", () => {
    const biblioteca = new Biblioteca(arte);
    const erro = (p: unknown): string => {
      try {
        resolver(biblioteca, PersonagemSchema.parse(p));
      } catch (e) {
        if (e instanceof ErroDeArte) return e.message;
        throw e;
      }
      return "";
    };
    expect(erro({ ...ze, corpo: "gigante" })).toContain('"gigante"');
    expect(erro({ ...ze, pele: "Marciana" })).toContain("pele");
    expect(erro({ ...ze, roupa: { baixo: { id: "camisa" } } })).toContain('é de "cima"');
    expect(erro({ ...ze, roupa: { cima: { id: "capa" } } })).toContain('"capa"');
    expect(erro({ ...ze, cabelo: { penteado: "moicano" } })).toContain("moicano");
    expect(erro({ ...ze, objetos: { dir: { id: "camisa" } } })).toContain("objetos de mão");
  });

  it("converte um personagem do elenco pronto", () => {
    const entrada = new Biblioteca(arte).elenco.get("teste_ze");
    expect(entrada).toBeDefined();
    if (!entrada) return;
    expect(personagemDoElenco(entrada)).toMatchObject({
      id: "teste_ze",
      corpo: "boneco",
      roupa: { cima: { id: "camisa", cor: "#D9433B" } },
    });
  });

  it("monta a peça sobre a pele, esconde a pele coberta e pinta a cor livre nos vértices", () => {
    const montado = montarPersonagem(new Biblioteca(arte), ze);
    const camisa = montado.pecasMontadas.get("camisa");
    // quatro pontos a 2 cm da pele (400 passos de 0,05 mm), que fica em z = 0
    expect(
      Array.from(camisa?.posicoes ?? [])
        .filter((_, i) => i % 3 === 2)
        .every((z) => Math.abs(z - 0.02) < 1e-6),
    ).toBe(true);
    expect(montado.relatorio.pele.escondidos).toBe(2);
    expect(montado.primitivas).toHaveLength(1);
    const cores = montado.primitivas[0]?.cores;
    // vermelho com o sombreado da textura cinza: (188/255 em linear) ÷ 0,5 × a cor livre
    expect((cores?.[1] ?? 1) / (cores?.[0] ?? 1)).toBeLessThan(0.2);
    expect(montado.rostos.map((r) => r.expressao)).toEqual(["neutro", "feliz", "dormindo"]);
    expect(montado.rostos[0]?.primitiva.formas.map((f) => f.nome)).toEqual(["fala_A", "fala_O"]);
    expect(montado.rostos[1]?.primitiva.formas).toEqual([]);
  });

  it("uma estampa que os vértices não guardam vira uma primitiva com textura", () => {
    const montado = montarPersonagem(
      new Biblioteca(arte),
      PersonagemSchema.parse({ ...ze, roupa: { cima: { id: "xadrez" } } }),
    );
    expect(montado.primitivas).toHaveLength(2);
    expect(montado.primitivas[1]?.textura?.largura).toBe(16);
    expect(montado.relatorio.pecas[0]?.comTextura).toBe(true);
  });

  it("escreve os pacotes, o manifesto válido e os mesmos bytes em duas rodadas", async () => {
    const a = nova();
    const b = nova();
    const resultado = await empacotar({
      arte,
      saida: a,
      personagens: [ze],
      commit: "0".repeat(40),
    });
    await empacotar({ arte, saida: b, personagens: [ze], commit: "0".repeat(40) });
    expect(hashes(a)).toEqual(hashes(b));
    const texto = readFileSync(join(a, "manifest.json"), "utf8");
    // Sem espaços nem quebras: só a quebra do fim.
    expect(texto).toBe(`${JSON.stringify(JSON.parse(texto))}
`);
    const manifesto = ManifestoSchema.parse(JSON.parse(texto));
    expect(manifesto).toEqual(resultado.manifesto);
    // Cada arquivo do manifesto tem a cópia em brotli ao lado, e nada mais fica na pasta.
    const nomes = arquivosDoManifesto(manifesto);
    expect(readdirSync(a).sort()).toEqual(
      [...nomes, ...nomes.map((nome) => `${nome}${SUFIXO_BROTLI}`)].sort(),
    );
    for (const nome of nomes) {
      expect(brotliDecompressSync(readFileSync(join(a, `${nome}${SUFIXO_BROTLI}`)))).toEqual(
        readFileSync(join(a, nome)),
      );
    }
    // Pacotes de uma rodada anterior, e as cópias deles, saem na rodada seguinte.
    writeFileSync(join(b, "velho.0123456789.glb"), "x");
    writeFileSync(join(b, "velho.0123456789.glb.br"), "x");
    await empacotar({ arte, saida: b, personagens: [ze], commit: "0".repeat(40) });
    expect(hashes(b)).toEqual(hashes(a));
    const [personagem] = manifesto.personagens;
    expect(personagem?.arquivo).toMatch(/^ze\.[0-9a-f]{10}\.glb$/);
    expect(personagem?.expressoes.map((e) => e.nome)).toEqual(["neutro", "feliz", "dormindo"]);
    expect(personagem?.altura).toBeCloseTo(0.85, 3);
    expect(personagem?.ancoras.coloMedido).toBe(true);
    expect(personagem?.desenho.chamadas).toBe(2);
    const [biblioteca] = manifesto.bibliotecas;
    expect(biblioteca?.posturas).toMatchObject({
      parado: "resident.idle.neutral",
      andando: "resident.walk.normal",
      carregando: "resident.care.hold_idle",
    });
    expect(biblioteca?.interacoes["resident.cook.stove"]).toEqual({
      clipe: null,
      substituto: false,
    });
    expect(biblioteca?.clipes.find((c) => c.nome === "resident.sit.chair.idle")).toMatchObject({
      dobrada: true,
      ciclo: true,
      apoio: { tipo: "assento" },
    });
    // o hash do nome é o do conteúdo
    for (const entrada of [...manifesto.personagens, ...manifesto.bibliotecas]) {
      const bytes = readFileSync(join(a, entrada.arquivo));
      expect(entrada.bytes).toBe(bytes.length);
      expect(entrada.arquivo).toContain(
        createHash("sha256").update(bytes).digest("hex").slice(0, 10),
      );
    }
    // o pacote do personagem não leva animação, e a biblioteca não leva malha
    const io = await entradaESaida();
    const doPersonagem = (await io.read(join(a, personagem?.arquivo ?? ""))).getRoot();
    expect(doPersonagem.listAnimations()).toHaveLength(0);
    expect(doPersonagem.listSkins()).toHaveLength(1);
    expect(doPersonagem.listNodes().map((n) => n.getName())).toEqual(
      expect.arrayContaining(["corpo", "rosto_neutro", "Head"]),
    );
    const daBiblioteca = (await io.read(join(a, biblioteca?.arquivo ?? ""))).getRoot();
    expect(daBiblioteca.listMeshes()).toHaveLength(0);
    expect(daBiblioteca.listAnimations().map((x) => x.getName())).toContain("resident.walk.normal");
    // o leitor da biblioteca de arte não aceita um pacote comprimido por engano
    expect(() => new ArquivoGlb(join(a, personagem?.arquivo ?? ""))).toThrow(/extensões/);
  });

  it("a linha de comando sai com erro e mensagem quando falta algo, e com zero quando dá certo", async () => {
    expect(lerArgumentos(["--saida", "x"], { ARTES_3D_DIR: "/arte" }).arte).toBe("/arte");
    expect(lerArgumentos(["--", "--saida", "x"], {}).saida).toBe("x");
    expect(() => lerArgumentos(["--saida"], {})).toThrow(ErroDeArte);
    expect(() => lerArgumentos(["--sair"], {})).toThrow(ErroDeArte);
    const escrito: string[] = [];
    const original = process.stderr.write.bind(process.stderr);
    const saidaOriginal = process.stdout.write.bind(process.stdout);
    const guardar = (texto: string): boolean => {
      escrito.push(texto);
      return true;
    };
    process.stderr.write = guardar as typeof process.stderr.write;
    process.stdout.write = guardar as typeof process.stdout.write;
    try {
      expect(await executar(["--saida", nova()], {})).toBe(1);
      expect(await executar(["--arte", join(arte, "vazio"), "--saida", nova()], {})).toBe(1);
      // o elenco da prova pede corpos que a biblioteca de mentira não tem
      expect(await executar(["--arte", arte, "--saida", nova(), "--prova"], {})).toBe(1);
      const descricao = join(nova(), "elenco.json");
      writeFileSync(
        descricao,
        JSON.stringify({ formato: "morada-elenco", versao: 1, personagens: [ze] }),
      );
      expect(
        await executar(
          [
            "--arte",
            arte,
            "--saida",
            nova(),
            "--personagens",
            descricao,
            "--commit",
            "1".repeat(40),
          ],
          {},
        ),
      ).toBe(0);
      writeFileSync(
        descricao,
        JSON.stringify({ formato: "morada-elenco", versao: 1, personagens: [{ ...ze, pele: 3 }] }),
      );
      expect(
        await executar(["--arte", arte, "--saida", nova(), "--personagens", descricao], {}),
      ).toBe(1);
      const so = nova();
      const resultado = await empacotar({ arte, saida: so, personagens: [ze], commit: null });
      expect(resultado.manifesto.arte.commit).toBeNull();
    } finally {
      process.stderr.write = original;
      process.stdout.write = saidaOriginal;
    }
    const texto = escrito.join("");
    expect(texto).toContain("--arte");
    expect(texto).toContain("ARTES_3D_DIR");
    expect(texto).toContain('campo "personagens.0.pele"');
    expect(texto).toContain("ze.");
  });
});

describe("clipes", () => {
  const canal = (valores: number[], caminho: Canal["caminho"] = "translation"): Canal => {
    const largura = caminho === "rotation" ? 4 : 3;
    return {
      osso: 0,
      caminho,
      tempos: Float32Array.from({ length: valores.length / largura }, (_, k) => k / 30),
      valores: Float32Array.from(valores),
    };
  };

  it("um movimento em linha reta fica com duas chaves; um parado, com uma", () => {
    const reta = canal(Array.from({ length: 30 }, (_, k) => [k * 0.01, 0, 0]).flat());
    expect(reduzirCanal(reta, 0.0005).tempos.length).toBe(2);
    const parado = canal(Array.from({ length: 30 }, () => [0.3, 0.5, 0]).flat());
    expect(reduzirCanal(parado, 0.0005).tempos.length).toBe(1);
  });

  it("a redução nunca erra mais do que o limite", () => {
    const curva = canal(
      Array.from({ length: 61 }, (_, k) => [
        Math.sin(k / 9) * 0.2,
        Math.cos(k / 7) * 0.1,
        0,
      ]).flat(),
    );
    const reduzido = reduzirCanal(curva, 0.001);
    expect(reduzido.tempos.length).toBeLessThan(61);
    for (let k = 0; k < 61; k++) {
      const t = k / 30;
      const a = valorDoCanal(curva, t);
      const b = valorDoCanal(reduzido, t);
      expect(Math.max(...a.map((x, e) => Math.abs(x - (b[e] ?? 0))))).toBeLessThanOrEqual(
        0.001 + 1e-6,
      );
    }
  });

  it("a rotação é interpolada pela esfera e o ciclo é reconhecido", () => {
    const q = (angulo: number) => [0, Math.sin(angulo / 2), 0, Math.cos(angulo / 2)];
    const giro = canal([...q(0), ...q(1)], "rotation");
    const meio = valorDoCanal(giro, 1 / 60);
    expect(meio[1]).toBeCloseTo(Math.sin(0.25), 5);
    expect(
      ehCiclo({
        nome: "x",
        duracao: 1,
        canais: [canal([...q(0), ...q(0.5), ...q(0)], "rotation")],
      }),
    ).toBe(true);
    expect(ehCiclo({ nome: "x", duracao: 1, canais: [giro] })).toBe(false);
  });

  it("escolhe o primeiro candidato que a biblioteca tem e marca o que é substituto", () => {
    const escolhas = escolherClipes(
      CLIPES_DO_JOGO,
      new Set(["resident.idle.neutral", "resident.drink.stand"]),
      "adulto",
    );
    const de = (nome: string) => escolhas.find((e) => e.nome === nome);
    expect(de("postura.parado")).toEqual({
      nome: "postura.parado",
      clipe: "resident.idle.neutral",
      substituto: false,
    });
    expect(de("resident.eat.stand")).toMatchObject({
      clipe: "resident.drink.stand",
      substituto: true,
    });
    expect(de("resident.cook.stove")?.clipe).toBeNull();
    expect(de("baby.sleep")).toBeUndefined();
    expect(POSE_DOBRADA.test("resident.sit.chair.idle")).toBe(true);
    expect(POSE_DOBRADA.test("resident.walk.normal")).toBe(false);
  });

  it("os pesos em bytes somam 255 em cada vértice", () => {
    const bytes = pesosEmBytes(
      Float32Array.from([0.4, 0.3, 0.2, 0.1, 1 / 3, 1 / 3, 1 / 3, 0, 0, 0, 0, 0]),
    );
    for (let i = 0; i < bytes.length; i += 4) {
      expect(
        (bytes[i] ?? 0) + (bytes[i + 1] ?? 0) + (bytes[i + 2] ?? 0) + (bytes[i + 3] ?? 0),
      ).toBe(255);
    }
  });
});

describe("manifesto", () => {
  it("recusa nome de arquivo sem hash e versão desconhecida", () => {
    const base = {
      formato: "morada-arte",
      versao: 1,
      arte: { repositorio: "x", commit: null },
      personagens: [],
      bibliotecas: [],
    };
    expect(ManifestoSchema.safeParse(base).success).toBe(true);
    expect(ManifestoSchema.safeParse({ ...base, versao: 2 }).success).toBe(false);
    expect(
      ManifestoSchema.safeParse({
        ...base,
        bibliotecas: [
          {
            id: "a",
            arquivo: "anim-a.glb",
            bytes: 1,
            faixa: "adulto",
            gravida: false,
            clipes: [],
            posturas: {},
            interacoes: {},
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("a arte fica fora do repositório", () => {
  it("reconhece uma pasta dentro e uma fora da raiz", () => {
    const raiz = join(tmpdir(), "repositorio");
    expect(dentroDoRepositorio(raiz, raiz)).toBe(true);
    expect(dentroDoRepositorio(join(raiz, "packages", "saida"), raiz)).toBe(true);
    expect(dentroDoRepositorio(join(tmpdir(), "repositorio-arte"), raiz)).toBe(false);
    expect(dentroDoRepositorio(join(raiz, "..", "fora"), raiz)).toBe(false);
  });

  it("a linha de comando recusa gravar os pacotes dentro deste repositório", async () => {
    const dentro = join(import.meta.dirname, "..", "saida-por-engano");
    const escrito: string[] = [];
    const original = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((texto: string): boolean => {
      escrito.push(texto);
      return true;
    }) as typeof process.stderr.write;
    try {
      expect(await executar(["--arte", tmpdir(), "--saida", dentro], {})).toBe(1);
    } finally {
      process.stderr.write = original;
    }
    expect(escrito.join("")).toMatch(/fora/);
    expect(existsSync(dentro)).toBe(false);
  });
});

const arteDeVerdade = process.env.ARTES_3D_DIR;

describe.skipIf(!arteDeVerdade)(
  "com a arte de verdade (só roda com ARTES_3D_DIR apontando para a cópia do repositório de arte)",
  () => {
    const pastas: string[] = [];
    afterAll(() => {
      for (const pasta of pastas) rmSync(pasta, { recursive: true, force: true });
    });

    it("empacota o elenco da prova com os mesmos bytes em duas rodadas e manifesto válido", async () => {
      const a = mkdtempSync(join(tmpdir(), "morada-arte-prova-"));
      const b = mkdtempSync(join(tmpdir(), "morada-arte-prova-"));
      pastas.push(a, b);
      const resultado = await empacotar({
        arte: arteDeVerdade ?? "",
        saida: a,
        personagens: ELENCO_DA_PROVA,
      });
      await empacotar({ arte: arteDeVerdade ?? "", saida: b, personagens: ELENCO_DA_PROVA });
      expect(hashes(a)).toEqual(hashes(b));
      const manifesto = ManifestoSchema.parse(
        JSON.parse(readFileSync(join(a, "manifest.json"), "utf8")),
      );
      expect(manifesto.personagens.map((p) => p.id)).toEqual(ELENCO_DA_PROVA.map((p) => p.id));
      for (const personagem of manifesto.personagens) {
        expect(personagem.bytes).toBeLessThan(450 * 1024);
        expect(personagem.desenho.chamadas).toBeLessThanOrEqual(3);
        expect(personagem.expressoes.map((e) => e.nome)).toContain("neutro");
      }
      const adulta = manifesto.personagens.find((p) => p.corpo === "adulta");
      expect(adulta?.gravidez).toEqual(["gravidez_1", "gravidez_2", "gravidez_3"]);
      expect(adulta?.altura).toBeGreaterThan(1.6);
      for (const biblioteca of resultado.bibliotecas) {
        // pés, mãos e cabeça não saem do lugar mais do que 5 mm depois da redução de chaves
        for (const clipe of biblioteca.clipes) expect(clipe.desvio).toBeLessThan(0.005);
      }
    }, 600_000);
  },
);
