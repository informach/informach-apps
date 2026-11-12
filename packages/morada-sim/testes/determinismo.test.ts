import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { restaurar } from "../src/index";
import { criarMundoDaProva, criarRoteiro, LIA, moradorDeNome } from "../src/testes";

function resumos(semente: number, passos: number, intervalo: number): string[] {
  const mundo = criarMundoDaProva({ semente, conferirReplicacao: false });
  const saida: string[] = [];
  for (let i = 0; i < passos; i++) {
    mundo.avancar(100);
    if ((i + 1) % intervalo === 0) saida.push(mundo.hash());
  }
  return saida;
}

describe("determinismo", () => {
  it("a mesma semente e o mesmo roteiro dão o mesmo mundo, tick a tick", () => {
    const a = resumos(7, 6000, 100);
    const b = resumos(7, 6000, 100);
    expect(a).toEqual(b);
    // E o mundo anda: os resumos não são todos iguais.
    expect(new Set(a).size).toBeGreaterThan(50);
  });

  it("outra semente dá outro mundo", () => {
    expect(resumos(7, 3000, 3000)).not.toEqual(resumos(8, 3000, 3000));
  });

  it("o mesmo roteiro com jogador dá o mesmo mundo e os mesmos fatos", () => {
    const rodar = () => {
      const mundo = criarMundoDaProva({ conferirReplicacao: false });
      const roteiro = criarRoteiro(mundo, { conferirACada: 100 });
      const sessao = roteiro.entrar(LIA);
      const lia = moradorDeNome(mundo, "Lia");
      const nina = moradorDeNome(mundo, "Nina");
      roteiro.comandar(sessao, lia.id, { t: "reservar" });
      roteiro.andar(300);
      roteiro.comandar(sessao, lia.id, {
        t: "interagir",
        interacao: "abracar",
        alvo: { t: "morador", moradorId: nina.id },
      });
      roteiro.andar(1500);
      roteiro.comandar(sessao, lia.id, { t: "ir_para", pos: [6125, 3125], andar: 0 });
      roteiro.andar(1200);
      return {
        hash: mundo.hash("tudo"),
        fatos: roteiro.saida.fatos,
        mudancas: roteiro.saida.mudancas,
      };
    };
    const a = rodar();
    const b = rodar();
    expect(a.hash).toBe(b.hash);
    expect(a.fatos).toEqual(b.fatos);
    expect(a.mudancas).toEqual(b.mudancas);
  });

  it("o estado no tick N não depende da velocidade em que se chegou lá", () => {
    const devagar = criarMundoDaProva({ conferirReplicacao: false });
    const rapido = criarMundoDaProva({ conferirReplicacao: false });
    for (const mundo of [devagar, rapido]) {
      mundo.aplicar({ t: "sessao_entrou", sessaoId: "s", perfilId: LIA });
    }
    rapido.aplicar({
      t: "intencao",
      sessaoId: "s",
      intencao: {
        comandoId: "comando-velocidade",
        mundoId: rapido.estado.id,
        moradorId: null,
        acao: { t: "votar_velocidade", velocidade: 3 },
        versaoEsperada: 0,
      },
    });
    for (let i = 0; i < 3000; i++) devagar.avancar(100);
    for (let i = 0; i < 1000; i++) rapido.avancar(100);
    expect(rapido.estado.relogio.tick).toBe(devagar.estado.relogio.tick);

    // Tirando a velocidade e o registro do comando de voto, é o mesmo mundo.
    const semVelocidade = (mundo: typeof devagar) => ({
      ...structuredClone(mundo.estado),
      relogio: { ...mundo.estado.relogio, velocidade: 1 },
      comandos: [],
    });
    expect(semVelocidade(rapido)).toEqual(semVelocidade(devagar));
  });

  it("pausado, o tempo não anda", () => {
    const mundo = criarMundoDaProva({ conferirReplicacao: false });
    const roteiro = criarRoteiro(mundo);
    const sessao = roteiro.entrar(LIA);
    roteiro.andar(50);
    expect(roteiro.comandar(sessao, null, { t: "votar_velocidade", velocidade: 0 })).toMatchObject({
      ok: true,
    });
    const antes = mundo.hash();
    roteiro.andar(500);
    expect(mundo.estado.relogio.tick).toBe(50);
    expect(mundo.hash()).toBe(antes);
  });

  it("recusa passo que não é múltiplo de 100 ms", () => {
    const mundo = criarMundoDaProva();
    expect(() => mundo.avancar(150)).toThrow();
    expect(() => mundo.avancar(-100)).toThrow();
  });
});

describe("fotografia", () => {
  it("restaurar e seguir é igual a não parar", () => {
    const direto = criarMundoDaProva({ conferirReplicacao: false });
    for (let i = 0; i < 4000; i++) direto.avancar(100);

    const partido = criarMundoDaProva({ conferirReplicacao: false });
    for (let i = 0; i < 2000; i++) partido.avancar(100);
    // A fotografia viaja como texto, como no armazenamento.
    const foto = JSON.parse(JSON.stringify(partido.fotografar()));
    const voltou = restaurar(foto);
    expect(voltou.hash()).toBe(partido.hash());
    for (let i = 0; i < 2000; i++) voltou.avancar(100);

    expect(voltou.estado.relogio.tick).toBe(4000);
    expect(voltou.hash()).toBe(direto.hash());
  });

  it("não leva presença: quem estava conectado não volta com o mundo", () => {
    const mundo = criarMundoDaProva();
    const roteiro = criarRoteiro(mundo);
    const sessao = roteiro.entrar(LIA);
    roteiro.comandar(sessao, moradorDeNome(mundo, "Lia").id, { t: "reservar" });
    roteiro.andar(100);
    const foto = mundo.fotografar();
    expect(JSON.stringify(foto)).not.toContain(sessao);
    const voltou = restaurar(foto);
    expect(voltou.presenca).toEqual({ sessoes: [], reservas: [], voto: null });
  });

  it("uma fotografia não muda quando o mundo segue", () => {
    const mundo = criarMundoDaProva({ conferirReplicacao: false });
    for (let i = 0; i < 500; i++) mundo.avancar(100);
    const foto = mundo.fotografar();
    const texto = JSON.stringify(foto);
    for (let i = 0; i < 500; i++) mundo.avancar(100);
    expect(JSON.stringify(foto)).toBe(texto);
  });

  it("recusa mundo de outro formato, de versão mais nova ou corrompido", () => {
    const mundo = criarMundoDaProva();
    const foto = mundo.fotografar();
    expect(() => restaurar({ ...foto, formato: "outra.coisa" })).toThrow();
    expect(() => restaurar({ ...foto, estado: { ...foto.estado, versao: 99 } })).toThrow(/versão/);
    expect(() => restaurar({ ...foto, mundoId: "outro" })).toThrow(/outro mundo/);

    const quebrada = structuredClone(foto);
    const primeiro = quebrada.estado.moradores.ordem[0];
    if (!primeiro) throw new Error("sem morador");
    (quebrada.estado.moradores.porId[primeiro] as { familiaId: string }).familiaId = "fam_999999";
    expect(() => restaurar(quebrada)).toThrow(/inválido/);
  });
});

describe("código da simulação", () => {
  const raiz = join(import.meta.dirname, "..", "src");
  const arquivos: string[] = [];
  const varrer = (pasta: string) => {
    for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
      const caminho = join(pasta, entrada.name);
      if (entrada.isDirectory()) {
        // O apoio de testes pode usar o que quiser; a simulação, não.
        if (entrada.name !== "testes") varrer(caminho);
      } else if (entrada.name.endsWith(".ts") && !entrada.name.endsWith(".test.ts")) {
        arquivos.push(caminho);
      }
    }
  };
  varrer(raiz);

  it("não lê relógio, sorteio nem ambiente", () => {
    const proibidos = [
      /\bMath\.random\b/,
      /\bDate\b/,
      /\bperformance\b/,
      /\bsetTimeout\b|\bsetInterval\b|\bqueueMicrotask\b/,
      /\bprocess\./,
      /\bcrypto\b/,
      /\bconsole\./,
      /\bfetch\(/,
      // Funções transcendentais variam entre motores; a simulação só usa inteiros.
      /\bMath\.(sin|cos|tan|atan|atan2|asin|acos|exp|log|log2|log10|pow|cbrt|hypot)\b/,
    ];
    const achados: string[] = [];
    for (const arquivo of arquivos) {
      const linhas = readFileSync(arquivo, "utf8").split("\n");
      linhas.forEach((linha, n) => {
        // Comentários podem falar do que quiserem.
        const codigo = linha
          .replace(/\/\/.*$/, "")
          .replace(/^\s*\*.*$/, "")
          .replace(/\/\*.*?\*\//g, "");
        for (const padrao of proibidos) {
          if (padrao.test(codigo))
            achados.push(`${arquivo.slice(raiz.length + 1)}:${n + 1} ${padrao}`);
        }
      });
    }
    expect(achados).toEqual([]);
    expect(arquivos.length).toBeGreaterThan(25);
  });

  it("só importa a si mesma e o zod", () => {
    const achados: string[] = [];
    for (const arquivo of arquivos) {
      for (const [, origem] of readFileSync(arquivo, "utf8").matchAll(/from "([^"]+)"/g)) {
        if (origem && !origem.startsWith(".") && origem !== "zod") {
          achados.push(`${arquivo.slice(raiz.length + 1)}: ${origem}`);
        }
      }
    }
    expect(achados).toEqual([]);
  });
});
