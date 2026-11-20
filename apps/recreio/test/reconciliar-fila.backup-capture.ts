import { randomUUID } from "node:crypto";
import { db, sql } from "@informach/db";
import { expect, it } from "vitest";
import { criarCifradorDeArquivos } from "../scripts/backup/arquivo-cifrado";
import { criarArquivoComposto } from "../scripts/backup/arquivo-composto";
import { criarTransporteDeArquivosS3 } from "../scripts/backup/arquivo-s3";
import { comExecucaoExclusivaDoBackup } from "../scripts/backup/execucao-exclusiva";
import { criarArmazenamentoDoIndiceS3 } from "../scripts/backup/indice-s3";
import { prepararPublicacao } from "../scripts/backup/publicacao-repository";
import { FalhaDaFilaDoBackup, reconciliarFilaDoBackup } from "../scripts/backup/reconciliar-fila";
import { criarRetiradaDoBackupS3 } from "../scripts/backup/retirada-s3";
import { conexao } from "./backup-arquivos-apoio";
import { expirar, fixture } from "./backup-publicacao-apoio";
import { criarBucketS3DeTeste } from "./objetos-s3-apoio";

async function cenario<T>(
  executar: (contexto: {
    f: Awaited<ReturnType<typeof fixture>>;
    http: Awaited<ReturnType<typeof criarBucketS3DeTeste>>;
    config: Omit<Parameters<typeof reconciliarFilaDoBackup>[0], "execucao">;
  }) => Promise<T>,
) {
  const f = await fixture("qualification", 1),
    http = await criarBucketS3DeTeste(),
    chave = Buffer.alloc(32, 7);
  try {
    const limites = { limiteBytes: 1024 * 1024, limiteFotografiaBytes: 1024, tempoLimiteMs: 10000 };
    const cifrador = criarCifradorDeArquivos({
      ...limites,
      chaveAtiva: "v1",
      chaves: new Map([["v1", chave]]),
    });
    const config = {
      fotografias: f.foto,
      publicacao: {
        destino: f.destino,
        cifrador,
        composto: criarArquivoComposto(limites),
        indice: f.indice,
        transporte: criarTransporteDeArquivosS3({
          cliente: http.cliente,
          bucket: f.destino.bucketName,
          cifrador,
          limiteBytesCifrados: limites.limiteBytes,
          tempoLimiteMs: 2000,
        }),
        indices: criarArmazenamentoDoIndiceS3({
          cliente: http.cliente,
          bucket: f.destino.bucketName,
          indice: f.indice,
          tempoLimiteMs: 2000,
        }),
      },
      retirada: criarRetiradaDoBackupS3({
        cliente: http.cliente,
        destino: f.destino,
        indice: f.indice,
        tempoLimiteMs: 2000,
      }),
    };
    return await executar({ f, http, config });
  } finally {
    f.indice.encerrar();
    chave.fill(0);
    await http.fechar();
  }
}

it("fails the overall pass on a native audit refusal but progresses another item and retries durably", async () => {
  await cenario(async ({ f, http, config }) => {
    const other = randomUUID();
    await db.execute(sql`insert into recreio.backup_captures(id,protocol_version,storage_scope,bucket_id,bucket_name,created_at)
      values(${other},1,${f.foto.escopo},${f.foto.bucketId},${f.foto.bucketName},'2020-01-02T00:00:00Z')`);
    await db.execute(sql`create function audit.recusar_fila_backup_teste() returns trigger language plpgsql as $$ begin
      if new.event_type='recreio.backup_unsealed_abandoned' and new.payload->>'captureId'=TG_ARGV[0]
        then raise exception 'synthetic backup audit refusal'; end if; return new; end $$`);
    try {
      await db.execute(
        sql.raw(
          `create trigger recusar_fila_backup_teste before insert on audit.events for each row execute function audit.recusar_fila_backup_teste('${f.id}')`,
        ),
      );
      let falha: unknown;
      try {
        await comExecucaoExclusivaDoBackup(
          { conexao: conexao().href, tempoLimiteMs: 30000 },
          async (execucao) => {
            await expect(
              reconciliarFilaDoBackup({ ...config, execucao: { ...execucao } }),
            ).rejects.toMatchObject({ codigo: "ENCERRADA" });
            return reconciliarFilaDoBackup({ ...config, execucao });
          },
        );
      } catch (erro) {
        falha = erro;
      }
      expect(falha).toBeInstanceOf(FalhaDaFilaDoBackup);
      if (!(falha instanceof FalhaDaFilaDoBackup))
        throw new Error("Native pass did not retain its phase error");
      expect(falha.resumo).toEqual({
        observadas: 2,
        abandonadas: 1,
        publicadas: 0,
        retiradas: 0,
        reservasLiberadas: 0,
        falhas: 1,
      });
      const rows = await db.execute<{ id: string; state: string }>(
        sql`select id,state from recreio.backup_captures where id in (${f.id},${other})`,
      );
      expect(rows.find((r) => r.id === f.id)?.state).toBe("captured");
      expect(rows.find((r) => r.id === other)?.state).toBe("abandoned");
      expect(http.pedidos).toEqual([]);
    } finally {
      await db.execute(sql`drop trigger if exists recusar_fila_backup_teste on audit.events`);
      await db.execute(sql`drop function audit.recusar_fila_backup_teste()`);
    }
    const retry = await comExecucaoExclusivaDoBackup(
      { conexao: conexao().href, tempoLimiteMs: 30000 },
      (execucao) => reconciliarFilaDoBackup({ ...config, execucao }),
    );
    expect(retry).toEqual({
      situacao: "executada",
      valor: {
        observadas: 1,
        abandonadas: 1,
        publicadas: 0,
        retiradas: 0,
        reservasLiberadas: 1,
        falhas: 0,
      },
    });
  });
});

it("reconciles an actually missing synthetic object through signed tombstone and native absence before releasing holds", async () => {
  await cenario(async ({ f, http, config }) => {
    // SQL/MAC fixture only. No successful original dump is asserted here.
    await prepararPublicacao(f.config);
    await expirar(f.id);
    const result = await comExecucaoExclusivaDoBackup(
      { conexao: conexao().href, tempoLimiteMs: 30000 },
      (execucao) => reconciliarFilaDoBackup({ ...config, execucao }),
    );
    expect(result).toEqual({
      situacao: "executada",
      valor: {
        observadas: 1,
        abandonadas: 0,
        publicadas: 0,
        retiradas: 1,
        reservasLiberadas: 1,
        falhas: 0,
      },
    });
    const marker = http.objetos.get(
      `/${f.destino.bucketName}/recreio/v1/backup/${f.id}/retirado.json`,
    );
    if (!marker) throw new Error("Native signed retirement is missing");
    expect(f.indice.conferir(marker, f.id).tipo).toBe("retirado");
    expect(http.pedidos.some((p) => p.metodo === "PUT")).toBe(true);
    expect(http.pedidos.every((p) => p.assinado)).toBe(true);
  });
});
