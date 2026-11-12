import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * O registro (os ids, para o servidor) e os carregadores (o `import()` de cada
 * cliente, para o navegador) leem `RECREIO_CLIENTE_DE_TESTE` quando o módulo é
 * carregado: no build o Next troca a variável por um valor fixo. Aqui cada
 * teste carrega os dois de novo com o valor que quer.
 */
async function registroCom(valor: string | undefined) {
  vi.resetModules();
  vi.stubEnv("RECREIO_CLIENTE_DE_TESTE", valor);
  const [registro, carregadores] = await Promise.all([
    import("./registro"),
    import("./carregadores"),
  ]);
  return { ...registro, ...carregadores };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("registro dos clientes de jogo", () => {
  it.each([undefined, "", "0", "true"])(
    "sem a opção do build (%j), o jogo de teste não tem cliente",
    async (valor) => {
      const { carregadorDoJogo, temCliente, jogosComCliente } = await registroCom(valor);
      expect(temCliente("teste")).toBe(false);
      expect(carregadorDoJogo("teste")).toBeNull();
      expect(jogosComCliente()).toEqual(["morada"]);
    },
  );

  it("com a opção do build, o cliente do jogo de teste é carregado sob demanda", async () => {
    const { carregadorDoJogo, temCliente } = await registroCom("1");
    expect(temCliente("teste")).toBe(true);
    const carregar = carregadorDoJogo("teste");
    const modulo = await carregar?.();
    expect(typeof modulo?.montar).toBe("function");
  });

  it("o Morada tem cliente no portal, com ou sem a opção do jogo de teste", async () => {
    for (const valor of ["", "1"]) {
      const { carregadorDoJogo, temCliente } = await registroCom(valor);
      expect(temCliente("morada")).toBe(true);
      expect(typeof carregadorDoJogo("morada")).toBe("function");
    }
  });

  it("jogo sem cliente no portal não tem página", async () => {
    for (const valor of ["", "1"]) {
      const { carregadorDoJogo, temCliente } = await registroCom(valor);
      expect(temCliente("nao-existe")).toBe(false);
      expect(carregadorDoJogo("nao-existe")).toBeNull();
      // Nome de propriedade herdada não vira jogo.
      expect(temCliente("toString")).toBe(false);
      expect(carregadorDoJogo("toString")).toBeNull();
      expect(carregadorDoJogo("__proto__")).toBeNull();
    }
  });

  it("o que o servidor diz que tem página é exatamente o que o navegador sabe baixar", async () => {
    for (const valor of ["", "1"]) {
      const { carregadorDoJogo, temCliente, jogosComCliente } = await registroCom(valor);
      for (const jogo of ["morada", "teste", "nao-existe", "toString", "__proto__"]) {
        expect(
          carregadorDoJogo(jogo) !== null,
          `${jogo} com a opção ${JSON.stringify(valor)}`,
        ).toBe(temCliente(jogo));
      }
      for (const jogo of jogosComCliente()) expect(carregadorDoJogo(jogo)).not.toBeNull();
    }
  });
});

describe("o código dos jogos fica fora do que o servidor compila", () => {
  const src = path.resolve(__dirname, "../..");

  /** Todos os arquivos de código de `src`, com o caminho relativo a ele. */
  function arquivos(pasta = src): string[] {
    return readdirSync(pasta, { withFileTypes: true }).flatMap((item) => {
      const caminho = path.join(pasta, item.name);
      if (item.isDirectory()) return arquivos(caminho);
      return /\.tsx?$/.test(item.name) && !/\.test\.tsx?$/.test(item.name)
        ? [path.relative(src, caminho).replaceAll("\\", "/")]
        : [];
    });
  }

  const importa = (arquivo: string, alvo: RegExp) =>
    alvo.test(readFileSync(path.join(src, arquivo), "utf8"));

  it("só o hospedeiro importa os carregadores", () => {
    const quem = arquivos().filter((arquivo) =>
      importa(arquivo, /from\s+["'][^"']*\/carregadores["']/),
    );
    expect(quem).toEqual(["features/jogar/components/hospedeiro.tsx"]);
  });

  it("o registro, que o servidor importa, não tem `import()` nem adaptador", () => {
    const registro = readFileSync(path.join(src, "features/jogar/registro.ts"), "utf8");
    expect(registro).not.toMatch(/\bimport\s*\(/);
    expect(registro).not.toMatch(/^import /m);
  });

  it("o pacote de um jogo só é importado pelos adaptadores", () => {
    const quem = arquivos().filter((arquivo) =>
      importa(arquivo, /from\s+["']@informach\/(jogo-[a-z-]+|morada-sim)(\/[^"']*)?["']/),
    );
    expect(quem.sort()).toEqual([
      "features/jogar/adaptadores/morada-regra.ts",
      "features/jogar/adaptadores/morada.ts",
    ]);
  });
});
