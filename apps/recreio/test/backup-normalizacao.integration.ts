import { db, eq, sql } from "@informach/db";
import {
  recreioSnapshotObjectDeliveries as deliveries,
  recreioBackupObjectHolds as holds,
} from "@informach/db/schema";
import postgres from "postgres";
import { afterEach, describe, expect, it } from "vitest";
import { comCoordenacaoPrivadaDeDireitos } from "@/features/direitos/coordenacao-repository";
import { criarArmazenamentoDoLivro } from "@/features/direitos/livro/armazenamento";
import {
  admitirColeta,
  confirmarColeta,
  listarColetasDevidas,
} from "@/features/objetos/coleta-repository";
import { reservarEntregaDaFotografia } from "@/features/objetos/entregas-repository";
import { RecusaDoClusterPrivado } from "@/features/recuperacao/cluster-privado";
import { codigoDoPostgres } from "@/lib/repository";
import { comConexaoPrivadaDeDireitos } from "../scripts/backup/conexao-direitos";
import { importarFontesHistoricasDeDireitos } from "../scripts/backup/importar-fontes-direitos";
import { normalizarCapacidadesRestauradas } from "../scripts/backup/normalizar-capacidades";
import { exigirBancoPrivadoDeRecuperacao } from "../scripts/backup/normalizar-fotografias";
import { conexao } from "./backup-arquivos-apoio";
import { fixture } from "./backup-publicacao-apoio";
import { fixtureDoLivro } from "./livro-apoio";
import { criarBucketDoLivro } from "./livro-s3-apoio";

const limpezas: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (limpezas.length) await limpezas.pop()?.();
});
async function recibo() {
  const f = await fixture("qualification", 1);
  limpezas.push(async () => f.indice.encerrar());
  const [r] = await db
    .select({ id: deliveries.id })
    .from(deliveries)
    .innerJoin(holds, eq(holds.deliveryId, deliveries.id))
    .where(eq(holds.captureId, f.id));
  if (!r) throw new Error("Fixture sem recibo");
  return { ...f, entregaId: r.id };
}
describe("normalização: recusas/quarentena em PostgreSQL real; sem liberar tráfego", () => {
  it("banco comum do CI é recusado antes de qualquer escrita", async () => {
    const origem = postgres(conexao().href, { max: 1, prepare: false });
    limpezas.push(() => origem.end({ timeout: 5 }));
    await expect(exigirBancoPrivadoDeRecuperacao(origem)).rejects.toMatchObject({
      codigo: "DESTINO_NAO_PRIVADO",
    });
    await expect(normalizarCapacidadesRestauradas(origem)).rejects.toMatchObject({
      codigo: "DESTINO_NAO_PRIVADO",
    });
    let executou = false;
    await expect(
      comConexaoPrivadaDeDireitos(origem, async () => {
        executou = true;
      }),
    ).rejects.toMatchObject({ codigo: "DESTINO_NAO_PRIVADO" });
    expect(executou).toBe(false);
    const livro = fixtureDoLivro(),
      http = await criarBucketDoLivro();
    try {
      const storage = criarArmazenamentoDoLivro({
        cliente: http.cliente,
        bucket: "recreio-fixture",
        assinatura: livro.assinatura,
        tempoLimiteMs: 2000,
      });
      await expect(
        importarFontesHistoricasDeDireitos({
          copia: origem,
          storage,
          assinatura: livro.assinatura,
          capturaSha256: "a".repeat(64),
          fonte: "b".repeat(40),
          maxEntradas: 10,
          maxBytesPlanos: 65536,
          tempoLimiteMs: 5000,
        }),
      ).rejects.toMatchObject({ codigo: "DESTINO_NAO_PRIVADO" });
      expect(http.pedidos).toEqual([]);
      let coordenou = false;
      await expect(
        comCoordenacaoPrivadaDeDireitos({
          banco: db,
          storage,
          assinatura: livro.assinatura,
          execucaoId: livro.livroId,
          capturaSha256: "a".repeat(64),
          fonte: "b".repeat(40),
          maxEntradas: 10,
          maxBytesPlanos: 65536,
          tempoLimiteMs: 5000,
          executar: async () => {
            coordenou = true;
          },
        }),
      ).rejects.toBeInstanceOf(RecusaDoClusterPrivado);
      expect(coordenou).toBe(false);
      expect(http.pedidos).toEqual([]);
    } finally {
      livro.encerrar();
      await http.fechar();
    }
  });
  it("quarentena impede tokens antigos, nova entrega e coleta", async () => {
    const f = await recibo();
    await db
      .update(holds)
      .set({ releasedAt: sql`clock_timestamp()`, releaseReason: "abandoned" })
      .where(eq(holds.captureId, f.id));
    await db
      .update(deliveries)
      .set({
        createdAt: new Date("2020-01-01T00:00:00Z"),
        detachedAt: new Date("2020-01-02T00:00:00Z"),
        nextAttemptAt: new Date("2020-01-03T00:00:00Z"),
      })
      .where(eq(deliveries.id, f.entregaId));
    const t = await admitirColeta(f.entregaId, f.foto);
    if (!t) throw new Error("Fixture não admitiu coleta");
    await db.execute(sql`update recreio.snapshot_object_deliveries set quarantined_state=state,state='quarantined',
      quarantined_at=clock_timestamp(),lease_token=null,lease_until=null,next_attempt_at='2020-01-03' where id=${f.entregaId}`);
    expect(await admitirColeta(f.entregaId, f.foto)).toBeNull();
    expect(await listarColetasDevidas(f.foto)).toEqual([]);
    await expect(confirmarColeta(t, true)).rejects.toMatchObject({ codigo: "TENTATIVA" });
    expect(await reservarEntregaDaFotografia(f.entregaId, f.foto)).toEqual({ tipo: "revisao" });
  });
  it("quarentena conserva precisão e estado anterior de recibo retirado", async () => {
    const f = await recibo();
    await db.execute(
      sql`update recreio.snapshot_object_deliveries set state='retired',retired_at=clock_timestamp() where id=${f.entregaId}`,
    );
    const [antes] = await db.execute<{ instante: string }>(
      sql`select retired_at::text as instante from recreio.snapshot_object_deliveries where id=${f.entregaId}`,
    );
    await db.execute(
      sql`update recreio.snapshot_object_deliveries set quarantined_state=state,state='quarantined',quarantined_at=clock_timestamp() where id=${f.entregaId}`,
    );
    const [depois] = await db.execute<{ instante: string; anterior: string }>(
      sql`select retired_at::text as instante,quarantined_state as anterior from recreio.snapshot_object_deliveries where id=${f.entregaId}`,
    );
    expect(depois).toEqual({ instante: antes?.instante, anterior: "retired" });
  });
  it("constraints recusam metadados parciais e retirada/validação fabricadas", async () => {
    const f = await recibo();
    const atualizacao = db.update(deliveries);
    type Delta = Parameters<typeof atualizacao.set>[0];
    const invalidos: Delta[] = [
      { state: "quarantined" },
      { quarantinedAt: sql`clock_timestamp()` },
      { quarantinedState: "retiring" },
      {
        state: "quarantined",
        quarantinedAt: sql`'infinity'::timestamptz`,
        quarantinedState: "retiring",
      },
      { state: "quarantined", quarantinedAt: sql`clock_timestamp()`, quarantinedState: "retired" },
      { state: "quarantined", quarantinedAt: sql`clock_timestamp()`, quarantinedState: "verified" },
    ];
    for (const delta of invalidos) {
      const erro = await db
        .update(deliveries)
        .set(delta)
        .where(eq(deliveries.id, f.entregaId))
        .then(
          () => null,
          (e: unknown) => e,
        );
      expect(codigoDoPostgres(erro)).toBe("23514");
    }
  });
});
