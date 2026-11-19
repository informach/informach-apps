import assert from "node:assert/strict";
import postgres from "postgres";

type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: unknown };
async function resultado<T>(p: PromiseLike<T>): Promise<Resultado<T>> {
  try {
    return { ok: true, valor: await p };
  } catch (erro) {
    return { ok: false, erro };
  }
}
function sinal<T>() {
  let resolver: ((valor: T) => void) | undefined;
  const pronto = new Promise<T>((r) => {
    resolver = r;
  });
  return {
    pronto,
    resolver: (valor: T) => {
      if (!resolver) throw new Error("SINAL_AUSENTE");
      resolver(valor);
    },
  };
}
function codigo(erro: unknown) {
  return typeof erro === "object" && erro !== null && "code" in erro ? erro.code : undefined;
}
async function prazo<T>(p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, rejeitar) => {
        timer = setTimeout(() => rejeitar(new Error("PROVA_NAO_TERMINOU")), 5000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function main() {
  const bruto = process.env.DATABASE_URL;
  assert(bruto);
  const url = new URL(bruto);
  assert(
    process.platform === "linux" &&
      process.argv.length === 2 &&
      process.env.CI === "true" &&
      process.env.GITHUB_ACTIONS === "true" &&
      process.env.GITHUB_REPOSITORY === "informach/informach-apps",
  );
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      url.pathname === "/ci" &&
      url.username === "ci" &&
      ["5432", "5433"].includes(url.port) &&
      !url.hash &&
      !url.search &&
      url.password === "ci" &&
      ["postgres:", "postgresql:"].includes(url.protocol),
  );
  const observador: postgres.Sql = postgres(bruto, { max: 1, prepare: false, connect_timeout: 5 });
  let casos = 0;
  try {
    for (const caso of ["retorno", "erro", "consulta", "savepoint"] as const) {
      console.log(JSON.stringify({ case: caso, status: "started" }));
      const vitima: postgres.Sql = postgres(bruto, {
        max: 1,
        prepare: false,
        connect_timeout: 5,
        connection: { application_name: `db-fault-${caso}` },
      });
      const iniciou = sinal<number>(),
        continuar = sinal<void>(),
        terminou = sinal<Resultado<unknown>>();
      const sintetico = new Error("ERRO_SINTETICO_APOS_QUEDA");
      try {
        const executar = async (tx: postgres.TransactionSql, pid: number) => {
          iniciou.resolver(pid);
          await continuar.pronto;
          if (caso === "retorno") return 7;
          if (caso === "erro") throw sintetico;
          return tx`select 9 as n`;
        };
        const fora = resultado(
          vitima.begin(async (tx) => {
            const [r] = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
            assert(r);
            const dentro = await resultado(
              caso === "savepoint"
                ? tx.savepoint(async (s) => executar(s, r.pid))
                : executar(tx, r.pid),
            );
            terminou.resolver(dentro);
            if (!dentro.ok) throw dentro.erro;
            return dentro.valor;
          }),
        );
        const pid = await prazo(iniciou.pronto);
        const [encerramento] = await observador<
          { terminou: boolean }[]
        >`select pg_terminate_backend(${pid},5000) as terminou`;
        assert.equal(encerramento?.terminou, true);
        const primeira = await prazo(fora);
        assert(!primeira.ok);
        assert.equal(codigo(primeira.erro), "CONNECTION_CLOSED");
        continuar.resolver();
        const callback = await prazo(terminou.pronto);
        if (caso === "retorno") {
          assert(callback.ok);
          assert.equal(callback.valor, 7);
        } else if (caso === "erro") {
          assert(!callback.ok);
          assert.equal(callback.erro, sintetico);
        } else {
          assert(!callback.ok);
          assert.equal(codigo(callback.erro), "CONNECTION_CLOSED");
        }
        // Nova transação legítima usa outra conexão; o escopo morto não ganha
        // autoridade sobre ela e não pode enviar seu COMMIT/ROLLBACK tardio.
        const [nova] = await vitima.begin(async (tx) => tx<{ n: number }[]>`select 42 as n`);
        assert.equal(nova?.n, 42);
        casos++;
      } finally {
        continuar.resolver();
        await vitima.end({ timeout: 3 });
      }
    }

    // Um cursor real mantém o socket ocupado e deixa as outras consultas na
    // fila do escopo. A perda deve rejeitar inclusive as ainda não enviadas.
    const vitima: postgres.Sql = postgres(bruto, {
      max: 1,
      prepare: false,
      connect_timeout: 5,
      connection: { application_name: "db-fault-fila" },
    });
    console.log(JSON.stringify({ case: "fila", status: "started" }));
    const iniciou = sinal<number>(),
      terminou = sinal<Resultado<unknown>>();
    try {
      const fora = resultado(
        vitima.begin(async (tx) => {
          const [r] = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
          assert(r);
          iniciou.resolver(r.pid);
          const consultas = [
            tx`select pg_sleep(30)`.cursor(1, () => {
              throw new Error("CONSULTA_NAO_FOI_TERMINADA");
            }),
            tx`select 2 as n`,
            tx`select 3 as n`,
            tx`select 4 as n`,
          ];
          const todas = await Promise.all(consultas.map((q) => resultado<unknown>(q)));
          terminou.resolver({ ok: true, valor: todas });
        }),
      );
      const pid = await prazo(iniciou.pronto);
      const limite = Date.now() + 5000;
      for (;;) {
        const [ativa] = await observador<
          { ativa: boolean }[]
        >`select exists(select 1 from pg_stat_activity where pid=${pid} and wait_event='PgSleep') as ativa`;
        if (ativa?.ativa) break;
        assert(Date.now() < limite, "CONSULTA_NAO_INICIOU");
        await new Promise((r) => setTimeout(r, 10));
      }
      const [encerramento] = await observador<
        { terminou: boolean }[]
      >`select pg_terminate_backend(${pid},5000) as terminou`;
      assert.equal(encerramento?.terminou, true);
      const primeira = await prazo(fora);
      assert(!primeira.ok);
      assert.equal(codigo(primeira.erro), "CONNECTION_CLOSED");
      const fila = await prazo(terminou.pronto);
      assert(fila.ok);
      assert(Array.isArray(fila.valor));
      assert.equal(fila.valor.length, 4);
      const itens: readonly unknown[] = fila.valor;
      for (const [i, item] of itens.entries()) {
        assert(
          typeof item === "object" &&
            item !== null &&
            "ok" in item &&
            item.ok === false &&
            "erro" in item,
        );
        // A consulta ativa pode receber o FATAL do servidor antes do close;
        // as três consultas ainda na fila recebem o fechamento do escopo.
        assert(
          i === 0
            ? ["57P01", "CONNECTION_CLOSED"].includes(String(codigo(item.erro)))
            : codigo(item.erro) === "CONNECTION_CLOSED",
        );
      }
      casos++;
    } finally {
      await vitima.end({ timeout: 3 });
    }
    const [restantes] = await observador<
      { n: number }[]
    >`select count(*)::int as n from pg_stat_activity where datname=current_database() and application_name like 'db-fault-%'`;
    assert.equal(restantes?.n, 0);
    console.log(
      JSON.stringify({
        boundary: "disposable_ci_postgres_real_backend_termination",
        cases: casos,
        status: "passed",
        openVictimConnections: 0,
        productionDataTouched: false,
      }),
    );
  } finally {
    await observador.end({ timeout: 3 });
  }
}
main().catch(() => {
  console.error("Prova de queda de conexão falhou; nenhum dado privado será exibido.");
  process.exitCode = 1;
});
