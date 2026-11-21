import { createHash, randomUUID } from "node:crypto";
import { db, eq, sql } from "@informach/db";
import {
  recreioSnapshotObjectDeliveries as deliveries,
  recreioSpaceLeases as leases,
  recreioSpaceSnapshots as snapshots,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { MundoIdSchema } from "@informach/recreio";
import { expect, it } from "vitest";
import { criarCifradorDeObjetos } from "@/features/objetos/criptografia";
import { prepararEntregaDaFotografia } from "@/features/objetos/fotografias-repository";
import { listarFotografiasParaMigracao } from "@/features/objetos/migracao-repository";
import { configuracaoDaMigracaoDeFotografias } from "@/lib/object-migration-environment";
import { confirmarPublicacao } from "../scripts/backup/publicacao-repository";
import { pronta } from "./backup-publicacao-apoio";
import { fixtureDeMigracao } from "./object-migration-apoio";

/** Native SQL admission only. Publication receipts here are synthetic fixtures;
 * this test does not claim an actual pg_dump, provider archive or migration. */
it("admite só lote limitado, destino e backup recentes, com mundos realmente parados e sem escrever", async () => {
  const env = { ...fixtureDeMigracao(), DATABASE_URL: process.env.DATABASE_URL };
  const config = configuracaoDaMigracaoDeFotografias(env);
  if (!config) throw new Error("Fixture unavailable");
  const agora = Date.now(),
    bytes = Buffer.from("SYNTHETIC_NATIVE_SQL_MIGRATION_QUEUE");
  async function mundo(status: "active" | "hibernating", n: number) {
    const id = randomUUID();
    await db.insert(spaces).values({
      id,
      gameId: "morada",
      name: "Fila sintética",
      contentPolicy: "L",
      status,
      revision: n,
      journalSeq: 0,
      schemaVersion: 1,
    });
    for (let revisao = 1; revisao <= n; revisao++)
      await db.insert(snapshots).values({
        spaceId: id,
        revision: revisao,
        fence: 0,
        schemaVersion: 1,
        journalSeq: 0,
        tick: 0,
        kind: "checkpoint",
        storage: "pg",
        data: bytes,
        byteSize: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        createdAt: new Date(agora - 10000 + revisao),
      });
    return id;
  }
  const livre = await mundo("hibernating", 2);
  await mundo("active", 1);
  const ocupado = await mundo("hibernating", 1);
  await db.insert(leases).values({
    spaceId: ocupado,
    fence: 0,
    holderKind: "browser",
    state: "held",
    expiresAt: new Date(agora - 1000),
  });
  const f = await pronta(0, {
    foto: {
      bucketId: config.objetos.bucketId,
      bucketName: config.objetos.bucketName,
      escopo: config.objetos.escopo,
    },
    createdAt: new Date(agora - 1000),
    capturedAt: new Date(agora - 500),
  });
  const selecionado = { ...config, backupId: f.id };
  const cifrador = criarCifradorDeObjetos({
    chaveAtiva: config.objetos.chaveAtiva,
    chaves: config.objetos.chaves,
    limiteBytes: 4096,
  });
  async function estado() {
    const [r] = await db.execute(sql`select jsonb_build_object(
      'fotos',(select jsonb_agg(to_jsonb(s) order by id) from recreio.space_snapshots s),
      'entregas',(select jsonb_agg(to_jsonb(d) order by id) from recreio.snapshot_object_deliveries d),
      'capturas',(select jsonb_agg(to_jsonb(c) order by id) from recreio.backup_captures c),
      'auditoria',(select count(*) from audit.events)) as estado`);
    return r;
  }
  async function somenteLeitura<T>(executar: () => Promise<T>) {
    const antes = await estado();
    try {
      return await executar();
    } finally {
      expect(await estado()).toEqual(antes);
    }
  }
  try {
    await somenteLeitura(() =>
      expect(listarFotografiasParaMigracao(selecionado)).rejects.toMatchObject({
        codigo: "BACKUP",
      }),
    );
    await confirmarPublicacao(f.t, f.bytes);
    await somenteLeitura(async () => {
      const fila = await listarFotografiasParaMigracao(selecionado);
      expect(fila).toHaveLength(2);
      expect(fila.every((x) => x.mundoId === livre)).toBe(true);
      expect(await listarFotografiasParaMigracao({ ...selecionado, batch: 1 })).toHaveLength(1);
      await expect(
        listarFotografiasParaMigracao({ ...selecionado, backupId: randomUUID() }),
      ).rejects.toMatchObject({ codigo: "BACKUP" });
      await expect(
        listarFotografiasParaMigracao({
          ...selecionado,
          objetos: { ...selecionado.objetos, bucketId: randomUUID() },
        }),
      ).rejects.toMatchObject({ codigo: "BACKUP" });
    });
    const destino = {
      bucketId: config.objetos.bucketId,
      bucketName: config.objetos.bucketName,
      escopo: config.objetos.escopo,
    };
    const entrega = await prepararEntregaDaFotografia(
      { mundoId: MundoIdSchema.parse(livre), jogo: "morada", revisao: 1 },
      destino,
      cifrador,
    );
    await db
      .update(deliveries)
      .set({ state: "review", reviewReason: "integrity" })
      .where(eq(deliveries.id, entrega));
    await somenteLeitura(() =>
      expect(listarFotografiasParaMigracao(selecionado)).rejects.toMatchObject({ codigo: "FILA" }),
    );
    await db.execute(
      sql`update recreio.backup_captures set created_at=created_at-interval '1 day',captured_at=captured_at-interval '1 day' where id=${f.id}::uuid`,
    );
    await somenteLeitura(() =>
      expect(listarFotografiasParaMigracao(selecionado)).rejects.toMatchObject({
        codigo: "BACKUP",
      }),
    );
  } finally {
    cifrador.encerrar();
    f.indice.encerrar();
    for (const key of config.objetos.chaves.values()) key.fill(0);
  }
});
