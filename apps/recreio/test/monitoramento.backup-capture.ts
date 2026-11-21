import { randomUUID } from "node:crypto";
import { db, inArray, sql } from "@informach/db";
import { jobRuns } from "@informach/db/schema";
import { afterEach, describe, expect, it } from "vitest";
import {
  confirmarArquivoGuardado,
  confirmarPublicacao,
  prepararIndiceDuravel,
  prepararPublicacao,
} from "../scripts/backup/publicacao-repository";
import { prepararRetiradaPorRetencao } from "../scripts/backup/retirada-repository";
import { conferirAtualidadeDoBackup } from "../src/features/backup/monitoramento-repository";
import { fixture } from "./backup-publicacao-apoio";

const recursos: (() => void)[] = [],
  jobs: string[] = [];
afterEach(async () => {
  while (recursos.length) recursos.pop()?.();
  if (jobs.length) await db.delete(jobRuns).where(inArray(jobRuns.id, jobs.splice(0)));
});
async function publicada() {
  const f = await fixture("qualification", 0);
  recursos.push(() => f.indice.encerrar());
  await db.execute(
    sql`update recreio.backup_captures set captured_at=clock_timestamp() where id=${f.id}`,
  );
  const t = await prepararPublicacao(f.config),
    v = await confirmarArquivoGuardado(t),
    bytes = await prepararIndiceDuravel(t, f.indice.assinar(v), f.indice);
  await confirmarPublicacao(t, bytes);
  const id = randomUUID();
  jobs.push(id);
  await db.insert(jobRuns).values({
    id,
    app: "recreio",
    job: "backup",
    startedAt: new Date(),
    finishedAt: new Date(),
    ok: true,
  });
  return {
    f,
    id,
    config: { fotografias: f.foto, arquivos: f.destino, idadeMaximaSegundos: 25200 },
  };
}
describe("sonda de backup no PostgreSQL real", () => {
  it("exige cópia e publicação nos dois destinos completos sem modificar o controle", async () => {
    const { f, config } = await publicada();
    const antes = await db.execute(
      sql`select to_jsonb(c) as c,to_jsonb(p) as p from recreio.backup_captures c join recreio.backup_publications p on p.capture_id=c.id where c.id=${f.id}`,
    );
    expect(await conferirAtualidadeDoBackup(config)).toBe(true);
    for (const campo of ["fotografias", "arquivos"] as const)
      for (const alteracao of [
        { bucketId: randomUUID() },
        { bucketName: "other-bucket" },
        { escopo: "production" as const },
      ])
        expect(
          await conferirAtualidadeDoBackup({
            ...config,
            [campo]: { ...config[campo], ...alteracao },
          }),
        ).toBe(false);
    expect(
      await db.execute(
        sql`select to_jsonb(c) as c,to_jsonb(p) as p from recreio.backup_captures c join recreio.backup_publications p on p.capture_id=c.id where c.id=${f.id}`,
      ),
    ).toEqual(antes);
  });
  it("publicar agora não renova captura antiga, nem comprova arquivo retirado", async () => {
    const { f, config } = await publicada();
    await db.execute(
      sql`update recreio.backup_captures set captured_at='2020-01-02'::timestamptz where id=${f.id}`,
    );
    expect(await conferirAtualidadeDoBackup(config)).toBe(false);
    await prepararRetiradaPorRetencao(f.id, f.destino, 28, f.indice);
    expect(await conferirAtualidadeDoBackup({ ...config, idadeMaximaSegundos: 86400 })).toBe(false);
  });
  it("não esconde falha e execução sem término atrás da cópia válida", async () => {
    const { id, config } = await publicada();
    await db.execute(sql`update ops.job_runs set ok=false where id=${id}`);
    expect(await conferirAtualidadeDoBackup(config)).toBe(false);
    await db.execute(
      sql`update ops.job_runs set ok=null,finished_at=null,started_at=clock_timestamp()-interval '16 minutes' where id=${id}`,
    );
    expect(await conferirAtualidadeDoBackup(config)).toBe(false);
    await db.execute(sql`update ops.job_runs set started_at=clock_timestamp() where id=${id}`);
    expect(await conferirAtualidadeDoBackup(config)).toBe(true);
  });
  it("detecta controle antigo sem publicação mesmo com outra cópia fresca", async () => {
    const { config } = await publicada();
    const f = await fixture("qualification", 0);
    recursos.push(() => f.indice.encerrar());
    await db.execute(
      sql`update recreio.backup_captures set bucket_id=${config.fotografias.bucketId},bucket_name=${config.fotografias.bucketName} where id=${f.id}`,
    );
    expect(await conferirAtualidadeDoBackup(config)).toBe(false);
  });
});
