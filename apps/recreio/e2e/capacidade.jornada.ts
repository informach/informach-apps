import { cpus, totalmem } from "node:os";
import { setTimeout as aguardarRitmo } from "node:timers/promises";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { z } from "zod";
import {
  comecarVigia,
  convidar,
  criarMundo,
  fecharAparelhos,
  medida,
  novaPessoa,
  type Pessoa,
  vigia,
} from "./apoio";
import { servidorDoContador } from "./servidor-apoio";

const instancia = servidorDoContador();
test.beforeEach(comecarVigia);
test.afterEach(async () => {
  await fecharAparelhos();
  await instancia.parar();
  expect(vigia().violacoes).toEqual([]);
  expect(vigia().errosDePagina).toEqual([]);
});
const inteiro = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Estado = z.strictObject({
  sessoes: inteiro,
  membros: inteiro,
  contador: inteiro.nullable(),
  diario: inteiro,
  fotoBytes: inteiro,
  diarioBytes: inteiro,
  bancoBytes: inteiro,
});
function percentil(valores: readonly number[], fracao: number) {
  const ordenados = [...valores].sort((a, b) => a - b);
  const valor = ordenados[Math.max(0, Math.ceil(fracao * ordenados.length) - 1)];
  if (valor === undefined) throw new Error("Latency sample absent");
  return valor;
}

test("mede 1/2/4/8 membros nativos com HTTP, PostgreSQL e WebSocket reais", async ({ browser }) => {
  if (
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.RECREIO_CAPACITY_PROBE !== "1" ||
    process.env.RECREIO_ISOLATED_TEST !== "1" ||
    process.env.GITHUB_REPOSITORY !== "informach/informach-apps"
  )
    throw new Error("Only the isolated GitHub protocol benchmark is allowed");
  const segundos = z.coerce
    .number()
    .int()
    .min(60)
    .max(180)
    .parse(process.env.RECREIO_CAPACITY_SECONDS ?? "60");
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !/^\/recreio_review_[a-f0-9]{32}$/.test(url.pathname)
  )
    throw new Error("Disposable PostgreSQL required");
  const fonte = postgres(url.href, {
    max: 1,
    prepare: false,
    connection: { statement_timeout: 5000 },
  });
  try {
    const pessoas: Pessoa[] = [];
    for (let n = 0; n < 8; n++) pessoas.push(await novaPessoa(browser, `Carga ${n + 1}`));
    const dona = pessoas[0];
    if (!dona) throw new Error("Native world owner absent");
    const mundo = await criarMundo(dona.page, "Prova de carga", "Mundo de protocolo");
    for (const pessoa of pessoas.slice(1)) await convidar(dona.page, pessoa.page, mundo);
    await instancia.iniciar();
    async function estado() {
      const [r] = await fonte`select
        (select count(*)::int from recreio.game_sessions where space_id=${mundo}::uuid and ended_at is null) as sessoes,
        (select count(*)::int from recreio.space_members where space_id=${mundo}::uuid and state='active') as membros,
        (select (convert_from(f.data,'UTF8')::jsonb->>'contador')::float8
          from recreio.space_snapshots f where f.space_id=s.id and f.revision=s.revision) as contador,
        s.journal_seq::float8 as diario,
        (select coalesce(sum(octet_length(data)),0)::float8 from recreio.space_snapshots where space_id=s.id) as "fotoBytes",
        (select coalesce(sum(octet_length(payload)),0)::float8 from recreio.space_journal where space_id=s.id) as "diarioBytes",
        pg_database_size(current_database())::float8 as "bancoBytes"
        from recreio.spaces s where s.id=${mundo}::uuid`;
      return Estado.parse(r);
    }
    const base = await estado(),
      resultados = [];
    expect(base.membros).toBe(8);
    let esperado = 0;
    for (const simultaneos of [1, 2, 4, 8]) {
      const grupo = pessoas.slice(0, simultaneos);
      await Promise.all(
        grupo.map(async (p) => {
          await p.page.goto(`/jogar/carga-teste?mundo=${mundo}`);
          await expect(p.page.getByLabel("Valor do contador", { exact: true })).toHaveText(
            String(esperado),
          );
        }),
      );
      await expect.poll(async () => (await estado()).sessoes).toBe(simultaneos);
      const inicial = await instancia.medir();
      expect(inicial.jogadores).toBe(simultaneos);
      const inicio = performance.now(),
        latencias: number[] = [],
        rss: number[] = [inicial.rss];
      let rodadas = 0;
      while (performance.now() - inicio < segundos * 1000) {
        const antes = performance.now();
        esperado += simultaneos;
        await Promise.all(
          grupo.map((p) => p.page.getByRole("button", { name: "Somar 1", exact: true }).click()),
        );
        await Promise.all(
          grupo.map((p) =>
            expect(p.page.getByLabel("Valor do contador", { exact: true })).toHaveText(
              String(esperado),
            ),
          ),
        );
        latencias.push(performance.now() - antes);
        rodadas++;
        const recurso = await instancia.medir();
        expect(recurso.jogadores).toBe(simultaneos);
        rss.push(recurso.rss);
        // Explicit offered rate: at most one command/player/second. This
        // pacing is the workload, never a delay used to hide an assertion.
        await aguardarRitmo(Math.max(0, inicio + rodadas * 1000 - performance.now()));
      }
      const duracaoMs = performance.now() - inicio,
        final = await instancia.medir();
      const antesDeSair = await estado();
      expect(antesDeSair.sessoes).toBe(simultaneos);
      expect(antesDeSair.diario).toBe(esperado);
      await Promise.all(
        grupo.map(async (p) => {
          await p.page
            .getByRole("button", { name: "Sair por dentro do jogo", exact: true })
            .click();
          await expect(p.page).toHaveURL(/\/estante$/);
        }),
      );
      await expect.poll(async () => (await estado()).sessoes).toBe(0);
      await expect.poll(async () => (await estado()).contador).toBe(esperado);
      const persistido = await estado();
      const cpuMicros = final.cpu.user + final.cpu.system - inicial.cpu.user - inicial.cpu.system;
      expect(cpuMicros).toBeGreaterThanOrEqual(0);
      resultados.push({
        simultaneos,
        mundos: 1,
        duracaoMs,
        rodadas,
        comandos: rodadas * simultaneos,
        comandosPorSegundo: (rodadas * simultaneos) / (duracaoMs / 1000),
        latenciaRodadaMs: {
          p50: percentil(latencias, 0.5),
          p95: percentil(latencias, 0.95),
          p99: percentil(latencias, 0.99),
          max: Math.max(...latencias),
        },
        servidorTitulo: {
          cpuMicros,
          cpuNucleosMedios: cpuMicros / (duracaoMs * 1000),
          rssMaxAmostrado: Math.max(...rss, final.rss),
        },
        horasMundo: duracaoMs / 3_600_000,
        horasJogador: (duracaoMs * simultaneos) / 3_600_000,
        diarioPersistido: antesDeSair.diario,
        contadorRecuperado: persistido.contador,
        fotografiaBytes: persistido.fotoBytes,
        diarioBytes: persistido.diarioBytes,
        bancoBytes: persistido.bancoBytes,
        erros: 0,
      });
    }
    // A new registration/process must recover the final value from PostgreSQL,
    // not the old host's in-memory world.
    await instancia.parar();
    await instancia.iniciar();
    await dona.page.goto(`/jogar/carga-teste?mundo=${mundo}`);
    await expect(dona.page.getByLabel("Valor do contador", { exact: true })).toHaveText(
      String(esperado),
    );
    await dona.page.getByRole("button", { name: "Sair por dentro do jogo", exact: true }).click();
    await expect(dona.page).toHaveURL(/\/estante$/);
    await expect.poll(async () => (await estado()).sessoes).toBe(0);
    await medida("recreio-capacidade-protocolo", {
      formato: "recreio-capacidade-protocolo-v1",
      source: process.env.GITHUB_SHA,
      runId: process.env.GITHUB_RUN_ID,
      node: process.version,
      plataforma: process.platform,
      arquitetura: process.arch,
      cpus: cpus().map((c) => ({ modelo: c.model, velocidade: c.speed })),
      memoriaExecutor: totalmem(),
      bancoBaseBytes: base.bancoBytes,
      resultados,
      recuperacaoAposReinicio: true,
      bancoDescartavel: true,
      productionDataTouched: false,
      limitesDesligados: false,
      limites: [
        "Título sintético interno; não mede simulação, arte ou FPS do Morada.",
        "Latência inclui automação e atualização do navegador, além de HTTP/PG/WS.",
        "CPU/RSS referem-se ao processo do título; não incluem portal, PostgreSQL ou navegadores.",
        "Horas normalizadas do ensaio não são custo financeiro nem capacidade do Railway.",
        "Um mundo; cenários sustentados pelo tempo declarado, não busca automática de saturação.",
      ],
    });
  } finally {
    await fonte.end({ timeout: 5 });
  }
});
