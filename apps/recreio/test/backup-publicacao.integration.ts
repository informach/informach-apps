import { createHash, randomUUID } from "node:crypto";
import { db, eq, sql } from "@informach/db";
import {
  recreioBackupCaptures as captures,
  recreioSnapshotObjectDeliveries as deliveries,
  recreioBackupObjectHolds as holds,
  recreioBackupPublications as publications,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { codigoDoPostgres } from "@/lib/repository";
import { criarIndiceDeRecuperacao } from "../scripts/backup/indice-recuperacao";
import {
  assumirPublicacao,
  confirmarArquivoGuardado,
  confirmarPublicacao,
  lerTentativaDePublicacao,
  liberarReservasPublicadas,
  prepararIndiceDuravel,
  prepararPublicacao,
  renovarPublicacao,
} from "../scripts/backup/publicacao-repository";
import { novoJogador } from "./apoio";
import { mundoDe } from "./jogo-apoio";

const sha = "a".repeat(64),
  cipher = "b".repeat(64),
  source = "c".repeat(40);
async function fixture(scope: "qualification" | "production" = "qualification", n = 0) {
  const id = randomUUID(),
    foto = { bucketId: randomUUID(), bucketName: "recreio-fotos", escopo: scope },
    destino = { bucketId: randomUUID(), bucketName: "recreio-backups", escopo: scope };
  await db.insert(captures).values({
    id,
    storageScope: scope,
    bucketId: foto.bucketId,
    bucketName: foto.bucketName,
    state: "captured",
    createdAt: new Date("2020-01-01T00:00:00Z"),
    capturedAt: new Date("2020-01-02T00:00:00Z"),
    inventorySha256: sha,
    objectCount: n,
    objectBytes: n * 100,
  });
  if (n) {
    const mundo = await mundoDe(await novoJogador());
    const refs = await db
      .insert(deliveries)
      .values(
        Array.from({ length: n }, (_, i) => {
          const hash = createHash("sha256").update(String(i)).digest("hex");
          return {
            snapshotReference: randomUUID(),
            spaceId: mundo,
            plaintextSha256: sha,
            plaintextBytes: 0,
            storageScope: scope,
            bucketId: foto.bucketId,
            bucketName: foto.bucketName,
            objectKey: `recreio/v1/fotografia/${mundo}/${hash}`,
            cipherSha256: hash,
            cipherBytes: 100,
            encryptionKeyId: "fixture",
            state: "retiring" as const,
            detachedAt: sql`clock_timestamp()`,
          };
        }),
      )
      .returning({ id: deliveries.id });
    await db
      .insert(holds)
      .values(refs.map((r) => ({ captureId: id, deliveryId: r.id, referenceSha256: sha })));
  }
  const arquivo = {
      formato: "recreio-arquivo-cifrado-v1" as const,
      chaveId: "v1",
      contexto: { tipo: "backup" as const, id },
      bytes: 10,
      sha256: sha,
      bytesCifrados: 110,
      sha256Cifrado: cipher,
    },
    composto = {
      formato: "recreio-captura-composta-v1" as const,
      capturaId: id,
      bytes: 10,
      sha256: sha,
    };
  const indice = criarIndiceDeRecuperacao({
    destino,
    chaveAtiva: "v1",
    chaves: new Map([["v1", Buffer.alloc(32, 7)]]),
  });
  const config = { capturaId: id, destino, source, arquivo, composto };
  return { id, foto, destino, arquivo, composto, indice, config };
}
async function expirar(id: string) {
  await db.execute(
    sql`update recreio.backup_publications set created_at=created_at-interval '1 day',lease_until=clock_timestamp()-interval '1 second' where capture_id=${id}`,
  );
}
async function pronta(n = 0) {
  const f = await fixture("qualification", n),
    t = await prepararPublicacao(f.config),
    v = await confirmarArquivoGuardado(t),
    bytes = await prepararIndiceDuravel(t, f.indice.assinar(v), f.indice);
  return { ...f, t, bytes };
}
async function estados(id: string) {
  const [r] = await db.execute<{ captura: string; publicacao: string; ativas: number }>(sql`
    select c.state as captura,p.state as publicacao,
      (select count(*)::int from recreio.backup_object_holds h where h.capture_id=c.id and released_at is null) as ativas
    from recreio.backup_captures c join recreio.backup_publications p on p.capture_id=c.id where c.id=${id}`);
  return r;
}
async function auditoriaRecusada(evento: string, executar: () => Promise<unknown>) {
  // Evento e nome são constantes deste fixture; nenhum dado externo vira SQL.
  await db.execute(sql`create function audit.recusar_publicacao_teste() returns trigger language plpgsql as $$
    begin if new.event_type=TG_ARGV[0] then raise exception 'recusa sintetica'; end if; return new; end $$`);
  await db.execute(
    sql.raw(
      `create trigger recusar_publicacao_teste before insert on audit.events for each row execute function audit.recusar_publicacao_teste('${evento}')`,
    ),
  );
  try {
    await executar();
  } finally {
    await db.execute(sql`drop trigger recusar_publicacao_teste on audit.events`);
    await db.execute(sql`drop function audit.recusar_publicacao_teste()`);
  }
}

describe("publicação durável: PostgreSQL real, sem alegar I/O de provedor", () => {
  it("fixa destino independente e ciphertext antes de qualquer confirmação", async () => {
    const f = await fixture();
    try {
      const t = await prepararPublicacao(f.config),
        r = await lerTentativaDePublicacao(t);
      expect(r).toMatchObject({
        estado: "prepared",
        destino: f.destino,
        arquivo: f.arquivo,
        composto: f.composto,
        indice: null,
      });
      expect(await estados(f.id)).toEqual({ captura: "sealed", publicacao: "prepared", ativas: 0 });
      await expect(liberarReservasPublicadas(f.id)).rejects.toMatchObject({ codigo: "ESTADO" });
      await expect(assumirPublicacao(f.id)).rejects.toMatchObject({ codigo: "OCUPADA" });
    } finally {
      f.indice.encerrar();
    }
  });
  it("produção exige bucket distinto das fotografias; qualificação pode compartilhar", async () => {
    const f = await fixture("production");
    try {
      await expect(prepararPublicacao({ ...f.config, destino: f.foto })).rejects.toMatchObject({
        codigo: "CONFIGURACAO",
      });
      expect((await db.select().from(captures).where(eq(captures.id, f.id)))[0]?.state).toBe(
        "captured",
      );
      await prepararPublicacao(f.config);
    } finally {
      f.indice.encerrar();
    }
    const q = await fixture();
    try {
      await prepararPublicacao({ ...q.config, destino: q.foto });
    } finally {
      q.indice.encerrar();
    }
  });
  it("não admite referência/escopo/fonte alterados nem segunda cifragem da captura", async () => {
    const f = await fixture();
    try {
      await expect(
        prepararPublicacao({ ...f.config, arquivo: { ...f.arquivo, sha256: "d".repeat(64) } }),
      ).rejects.toMatchObject({ codigo: "CONFIGURACAO" });
      await expect(prepararPublicacao({ ...f.config, source: "main" })).rejects.toMatchObject({
        codigo: "CONFIGURACAO",
      });
      await expect(
        prepararPublicacao({ ...f.config, destino: { ...f.destino, escopo: "production" } }),
      ).rejects.toMatchObject({ codigo: "ESTADO" });
      await prepararPublicacao(f.config);
      await expect(
        prepararPublicacao({
          ...f.config,
          arquivo: { ...f.arquivo, sha256Cifrado: "d".repeat(64) },
        }),
      ).rejects.toMatchObject({ codigo: "ESTADO" });
    } finally {
      f.indice.encerrar();
    }
  });
  it("preparação concorrente admite só uma tentativa", async () => {
    const f = await fixture();
    try {
      const r = await Promise.allSettled([
        prepararPublicacao(f.config),
        prepararPublicacao(f.config),
      ]);
      expect(r.filter((v) => v.status === "fulfilled")).toHaveLength(1);
      expect(r.filter((v) => v.status === "rejected")).toHaveLength(1);
    } finally {
      f.indice.encerrar();
    }
  });
  it("prazo vencido não confirma/renova; nova tentativa conserva as referências", async () => {
    const f = await fixture();
    try {
      const antigo = await prepararPublicacao(f.config);
      await expirar(f.id);
      await expect(confirmarArquivoGuardado(antigo)).rejects.toMatchObject({ codigo: "TENTATIVA" });
      await expect(renovarPublicacao(antigo)).rejects.toMatchObject({ codigo: "TENTATIVA" });
      const atual = await assumirPublicacao(f.id);
      expect(atual.tentativa).not.toBe(antigo.tentativa);
      await expect(lerTentativaDePublicacao(antigo)).rejects.toMatchObject({ codigo: "TENTATIVA" });
      expect(await lerTentativaDePublicacao(atual)).toMatchObject({
        arquivo: f.arquivo,
        destino: f.destino,
        source,
      });
      await renovarPublicacao(atual);
    } finally {
      f.indice.encerrar();
    }
  });
  it("não prepara índice antes de confirmar arquivo; confirmação repetida conserva data", async () => {
    const f = await fixture();
    try {
      const t = await prepararPublicacao(f.config);
      const falso = f.indice.assinar({
        tipo: "publicado",
        capturaId: f.id,
        destino: f.destino,
        source,
        iniciadaEm: "2020-01-01T00:00:00.000Z",
        conferidaEm: "2020-01-02T00:00:00.000Z",
        arquivo: f.arquivo,
        composto: f.composto,
        inventario: { quantidade: 0, bytesCifrados: 0, sha256: sha },
      });
      await expect(prepararIndiceDuravel(t, falso, f.indice)).rejects.toMatchObject({
        codigo: "ESTADO",
      });
      const v = await confirmarArquivoGuardado(t);
      expect(await confirmarArquivoGuardado(t)).toEqual(v);
      expect((await lerTentativaDePublicacao(t)).indice).toBeNull();
    } finally {
      f.indice.encerrar();
    }
  });
  it.each(["source", "inventario", "conferidaEm"])(
    "índice assinado divergente em %s é recusado",
    async (campo) => {
      const f = await fixture();
      try {
        const t = await prepararPublicacao(f.config),
          v = await confirmarArquivoGuardado(t);
        const alterado =
          campo === "source"
            ? { ...v, source: "d".repeat(40) }
            : campo === "inventario"
              ? { ...v, inventario: { ...v.inventario, quantidade: 1 } }
              : { ...v, conferidaEm: "2099-01-01T00:00:00.000Z" };
        await expect(
          prepararIndiceDuravel(t, f.indice.assinar(alterado), f.indice),
        ).rejects.toMatchObject({ codigo: "INTEGRIDADE" });
      } finally {
        f.indice.encerrar();
      }
    },
  );
  it("retomada após preparar índice devolve exatamente os mesmos bytes", async () => {
    const f = await pronta();
    try {
      await expirar(f.id);
      const t = await assumirPublicacao(f.id);
      expect((await lerTentativaDePublicacao(t)).indice?.equals(f.bytes)).toBe(true);
      expect((await prepararIndiceDuravel(t, f.bytes, f.indice)).equals(f.bytes)).toBe(true);
      await expect(confirmarPublicacao(f.t, f.bytes)).rejects.toMatchObject({
        codigo: "TENTATIVA",
      });
      await confirmarPublicacao(t, f.bytes);
    } finally {
      f.indice.encerrar();
    }
  });
  it("rejeita bytes diferentes e mantém reservas até confirmação exata", async () => {
    const f = await pronta(1);
    try {
      await expect(confirmarPublicacao(f.t, Buffer.from("divergente"))).rejects.toMatchObject({
        codigo: "INTEGRIDADE",
      });
      expect(await estados(f.id)).toEqual({
        captura: "sealed",
        publicacao: "index_prepared",
        ativas: 1,
      });
      await expect(liberarReservasPublicadas(f.id)).rejects.toMatchObject({ codigo: "ESTADO" });
      await confirmarPublicacao(f.t, f.bytes);
      await confirmarPublicacao(f.t, f.bytes);
      expect(await estados(f.id)).toEqual({
        captura: "verified",
        publicacao: "published",
        ativas: 1,
      });
      expect(await liberarReservasPublicadas(f.id)).toBe(1);
      expect(await liberarReservasPublicadas(f.id)).toBe(0);
    } finally {
      f.indice.encerrar();
    }
  });
  it("publicação não oculta reserva ausente ou já liberada", async () => {
    const f = await pronta(1);
    try {
      await db
        .update(holds)
        .set({ releasedAt: sql`clock_timestamp()`, releaseReason: "abandoned" })
        .where(eq(holds.captureId, f.id));
      await expect(confirmarPublicacao(f.t, f.bytes)).rejects.toMatchObject({
        codigo: "INTEGRIDADE",
      });
    } finally {
      f.indice.encerrar();
    }
    const g = await pronta(1);
    try {
      await db.delete(holds).where(eq(holds.captureId, g.id));
      await expect(confirmarPublicacao(g.t, g.bytes)).rejects.toMatchObject({
        codigo: "INTEGRIDADE",
      });
    } finally {
      g.indice.encerrar();
    }
  });
  it("liberação em lotes de cem é repetível e não apaga recibos", async () => {
    const f = await pronta(101);
    try {
      await confirmarPublicacao(f.t, f.bytes);
      expect(
        (
          await Promise.all([liberarReservasPublicadas(f.id), liberarReservasPublicadas(f.id)])
        ).sort((a, b) => a - b),
      ).toEqual([1, 100]);
      expect(await liberarReservasPublicadas(f.id)).toBe(0);
      const [r] = await db.execute<{ n: number; validas: number }>(
        sql`select count(*)::int as n,count(*) filter(where released_at is not null and release_reason='stored_archive')::int as validas from recreio.backup_object_holds where capture_id=${f.id}`,
      );
      expect(r).toEqual({ n: 101, validas: 101 });
    } finally {
      f.indice.encerrar();
    }
  });
  it("falha de auditoria reverte selagem e tentativa", async () => {
    const f = await fixture();
    try {
      await auditoriaRecusada("recreio.backup_publication_prepared", async () => {
        await expect(prepararPublicacao(f.config)).rejects.toMatchObject({
          name: "AuditPersistenceError",
        });
      });
      expect(
        await db.select().from(publications).where(eq(publications.captureId, f.id)),
      ).toHaveLength(0);
      expect((await db.select().from(captures).where(eq(captures.id, f.id)))[0]?.state).toBe(
        "captured",
      );
    } finally {
      f.indice.encerrar();
    }
  });
  it("falha de auditoria reverte publicação e liberação separadamente", async () => {
    const f = await pronta(1);
    try {
      await auditoriaRecusada("recreio.backup_published", async () => {
        await expect(confirmarPublicacao(f.t, f.bytes)).rejects.toMatchObject({
          name: "AuditPersistenceError",
        });
      });
      expect(await estados(f.id)).toEqual({
        captura: "sealed",
        publicacao: "index_prepared",
        ativas: 1,
      });
      await confirmarPublicacao(f.t, f.bytes);
      await auditoriaRecusada("recreio.backup_holds_released", async () => {
        await expect(liberarReservasPublicadas(f.id)).rejects.toMatchObject({
          name: "AuditPersistenceError",
        });
      });
      expect((await estados(f.id))?.ativas).toBe(1);
      expect(await liberarReservasPublicadas(f.id)).toBe(1);
    } finally {
      f.indice.encerrar();
    }
  });
  it("prazo que vence durante auditoria não autoriza confirmação tardia", async () => {
    const f = await pronta();
    await db.execute(sql`create sequence audit.publicacao_prazo_visitada`);
    await db.execute(sql`create function audit.expirar_publicacao_teste() returns trigger language plpgsql as $$
      begin if new.event_type='recreio.backup_published' then
        perform nextval('audit.publicacao_prazo_visitada'); perform pg_sleep(3);
      end if; return new; end $$`);
    await db.execute(
      sql`create trigger expirar_publicacao_teste before insert on audit.events for each row execute function audit.expirar_publicacao_teste()`,
    );
    try {
      await db.execute(
        sql`update recreio.backup_publications set lease_until=clock_timestamp()+interval '2 seconds' where capture_id=${f.id}`,
      );
      await expect(confirmarPublicacao(f.t, f.bytes)).rejects.toMatchObject({
        codigo: "TENTATIVA",
      });
      const [visita] = await db.execute<{ visitada: boolean }>(
        sql`select is_called as visitada from audit.publicacao_prazo_visitada`,
      );
      expect(visita?.visitada).toBe(true);
      expect(await estados(f.id)).toEqual({
        captura: "sealed",
        publicacao: "index_prepared",
        ativas: 0,
      });
    } finally {
      await db.execute(sql`drop trigger expirar_publicacao_teste on audit.events`);
      await db.execute(sql`drop function audit.expirar_publicacao_teste()`);
      await db.execute(sql`drop sequence audit.publicacao_prazo_visitada`);
      f.indice.encerrar();
    }
  });
  it("constraints rejeitam tuplas parciais, prazo infinito e destino/fonte inválidos", async () => {
    const f = await fixture();
    try {
      await prepararPublicacao(f.config);
      const invalidos = [
        { indexBody: "{}" },
        { indexSha256: sha },
        { indexPreparedAt: new Date() },
        { state: "published" as const },
        { source: "main" },
        { bucketName: "INVALIDO" },
        { leaseUntil: sql`'infinity'::timestamptz` },
      ];
      for (const delta of invalidos) {
        const erro = await db
          .update(publications)
          .set(delta)
          .where(eq(publications.captureId, f.id))
          .then(
            () => null,
            (e: unknown) => e,
          );
        expect(codigoDoPostgres(erro)).toBe("23514");
      }
      const erro = await db
        .delete(captures)
        .where(eq(captures.id, f.id))
        .then(
          () => null,
          (e: unknown) => e,
        );
      expect(codigoDoPostgres(erro)).toBe("23001");
    } finally {
      f.indice.encerrar();
    }
  });
});
