import { beforeEach, describe, expect, it, vi } from "vitest";

// O banco de verdade fica de fora: o cliente falso guarda o que seria gravado e
// deixa cada teste decidir como a gravação falha.
const fake = vi.hoisted(() => {
  type Fail = "none" | "reject" | "throw";
  const state = {
    insertFails: "none" as Fail,
    updateFails: "none" as Fail,
    insertRows: [{ id: "run-1" }] as Array<{ id: string }>,
    inserts: [] as unknown[],
    updates: [] as Array<Record<string, unknown>>,
  };
  // "throw" falha antes, ao pedir o builder (como o Proxy do cliente sem
  // DATABASE_URL); "reject" falha na consulta.
  const outcome = <T>(fail: Fail, value: T): Promise<T> =>
    fail === "reject" ? Promise.reject(new Error("conexão recusada")) : Promise.resolve(value);
  const db = {
    insert: () => {
      if (state.insertFails === "throw") throw new Error("DATABASE_URL ausente");
      return {
        values: (values: unknown) => ({
          returning: () => {
            state.inserts.push(values);
            return outcome(state.insertFails, state.insertRows);
          },
        }),
      };
    },
    update: () => {
      if (state.updateFails === "throw") throw new Error("DATABASE_URL ausente");
      return {
        set: (values: Record<string, unknown>) => ({
          where: () => {
            state.updates.push(values);
            return outcome(state.updateFails, undefined);
          },
        }),
      };
    },
  };
  return { state, db };
});
vi.mock("./client", () => ({ db: fake.db }));

import { recordJobRun, summarizeJobResult } from "./job-runs";

beforeEach(() => {
  fake.state.insertFails = "none";
  fake.state.updateFails = "none";
  fake.state.insertRows = [{ id: "run-1" }];
  fake.state.inserts.length = 0;
  fake.state.updates.length = 0;
});

describe("recordJobRun", () => {
  it("abre a linha com app e rotina e fecha com sucesso e o resumo", async () => {
    const result = await recordJobRun({ app: "cozya", job: "email-retry" }, async () => ({
      enviados: 3,
      falhas: 0,
      ok: true,
    }));

    expect(result).toEqual({ enviados: 3, falhas: 0, ok: true });
    expect(fake.state.inserts).toEqual([{ app: "cozya", job: "email-retry" }]);
    expect(fake.state.updates).toEqual([
      { finishedAt: expect.any(Date), ok: true, summary: { enviados: 3, falhas: 0, ok: true } },
    ]);
  });

  it("registra a falha com o nome da classe de erro e devolve o erro da rotina", async () => {
    class ProviderDownError extends Error {
      override name = "ProviderDownError";
    }
    const error = new ProviderDownError("SendGrid recusou maria@exemplo.com");

    await expect(
      recordJobRun({ app: "cozya", job: "email-retry" }, async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(fake.state.updates).toEqual([
      { finishedAt: expect.any(Date), ok: false, errorName: "ProviderDownError" },
    ]);
    // A mensagem do erro, que pode trazer e-mail, nunca vai para o registro.
    expect(JSON.stringify(fake.state.updates)).not.toContain("maria@exemplo.com");
  });

  it("corta nomes de erro compridos e marca o que não é Error como UnknownError", async () => {
    const longName = Object.assign(new Error("x"), { name: "E".repeat(200) });
    await expect(
      recordJobRun({ app: "cozya", job: "a" }, async () => {
        throw longName;
      }),
    ).rejects.toBe(longName);
    await expect(
      recordJobRun({ app: "cozya", job: "b" }, async () => {
        throw "texto solto";
      }),
    ).rejects.toBe("texto solto");

    expect(fake.state.updates.map((update) => update.errorName)).toEqual([
      "E".repeat(80),
      "UnknownError",
    ]);
  });

  describe("o job nunca cai por falha ao gravar", () => {
    for (const fail of ["reject", "throw"] as const) {
      it(`roda e devolve o resultado quando a abertura da linha falha (${fail})`, async () => {
        fake.state.insertFails = fail;
        const run = vi.fn(async () => ({ processados: 2 }));

        await expect(recordJobRun({ app: "cozya", job: "j" }, run)).resolves.toEqual({
          processados: 2,
        });
        expect(run).toHaveBeenCalledTimes(1);
        // Sem linha aberta, não há o que fechar.
        expect(fake.state.updates).toEqual([]);
      });

      it(`devolve o erro da rotina, não o do banco, quando a abertura falha (${fail})`, async () => {
        fake.state.insertFails = fail;
        const error = new TypeError("quebrou");

        await expect(
          recordJobRun({ app: "cozya", job: "j" }, async () => {
            throw error;
          }),
        ).rejects.toBe(error);
      });

      it(`devolve o resultado quando o fechamento com sucesso falha (${fail})`, async () => {
        fake.state.updateFails = fail;
        const run = vi.fn(async () => ({ processados: 2 }));

        await expect(recordJobRun({ app: "cozya", job: "j" }, run)).resolves.toEqual({
          processados: 2,
        });
        // Uma falha ao registrar o sucesso não é tratada como falha da rotina.
        expect(run).toHaveBeenCalledTimes(1);
        expect(fake.state.updates.every((update) => update.ok === true)).toBe(true);
      });

      it(`devolve o erro da rotina quando o fechamento com falha também falha (${fail})`, async () => {
        fake.state.updateFails = fail;
        const error = new RangeError("fora do limite");

        await expect(
          recordJobRun({ app: "cozya", job: "j" }, async () => {
            throw error;
          }),
        ).rejects.toBe(error);
      });
    }

    it("não fecha nada quando o banco não devolve a linha aberta", async () => {
      fake.state.insertRows = [];

      await expect(recordJobRun({ app: "cozya", job: "j" }, async () => 1)).resolves.toBe(1);
      expect(fake.state.updates).toEqual([]);
    });

    it("fecha com sucesso e resumo vazio quando ler o resultado lança", async () => {
      const result = {
        get enviados(): number {
          throw new Error("getter quebrado");
        },
      };

      await expect(recordJobRun({ app: "cozya", job: "j" }, async () => result)).resolves.toBe(
        result,
      );
      expect(fake.state.updates).toEqual([{ finishedAt: expect.any(Date), ok: true, summary: {} }]);
    });
  });
});

describe("summarizeJobResult guarda só números e booleanos", () => {
  it("deixa texto, objetos, nulos e números não finitos de fora", () => {
    expect(
      summarizeJobResult({
        enviados: 4,
        parcial: false,
        email: "maria@exemplo.com",
        erro: "SendGrid: 401 para maria@exemplo.com",
        detalhe: { email: "maria@exemplo.com", tentativas: 2 },
        quando: new Date("2026-10-17T22:00:00Z"),
        vazio: null,
        indefinido: undefined,
        infinito: Number.POSITIVE_INFINITY,
        naoNumero: Number.NaN,
        grande: 10n,
      }),
    ).toEqual({ enviados: 4, parcial: false });
  });

  it("troca listas pela contagem, sem guardar o conteúdo", () => {
    expect(summarizeJobResult({ falhas: ["maria@exemplo.com", "joao@exemplo.com"] })).toEqual({
      falhasCount: 2,
    });
  });

  it("devolve vazio para o que não é objeto simples", () => {
    for (const value of [undefined, null, 3, true, "ok", ["a", "b"]])
      expect(summarizeJobResult(value)).toEqual({});
  });

  it("guarda no máximo 20 campos", () => {
    const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`campo${i}`, i]));
    const summary = summarizeJobResult(many);

    expect(Object.keys(summary)).toHaveLength(20);
    expect(summary).toEqual(
      Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`campo${i}`, i])),
    );
  });

  it("só olha o primeiro nível do resultado", () => {
    expect(summarizeJobResult({ total: 1, porApp: { cozya: 1 } })).toEqual({ total: 1 });
  });
});
