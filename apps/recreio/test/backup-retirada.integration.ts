import { db, eq, sql } from "@informach/db";
import {
  recreioBackupCaptures as captures,
  recreioBackupObjectHolds as holds,
  recreioBackupPublications as publications,
  recreioBackupRetirements as retirements,
} from "@informach/db/schema";
import { afterEach, describe, expect, it } from "vitest";
import { codigoDoPostgres } from "@/lib/repository";
import {
  abandonarCapturaSemArquivo,
  liberarReservasSemArquivo,
} from "../scripts/backup/abandono-repository";
import { criarArmazenamentoDoIndiceS3 } from "../scripts/backup/indice-s3";
import {
  assumirPublicacao,
  confirmarPublicacao,
  lerTentativaDePublicacao,
  liberarReservasPublicadas,
  prepararPublicacao,
} from "../scripts/backup/publicacao-repository";
import {
  assumirRetirada,
  confirmarAusenciaDoBackup,
  confirmarMarcadorGuardado,
  lerRetirada,
  liberarReservasRetiradas,
  listarRetiradasDevidas,
  prepararRetirada,
  reagendarRetirada,
} from "../scripts/backup/retirada-repository";
import { criarRetiradaDoBackupS3 } from "../scripts/backup/retirada-s3";
import { retirarCapturaGuardada } from "../scripts/backup/retirar-captura";
import { fixture, pronta } from "./backup-publicacao-apoio";
import { criarBucketS3DeTeste } from "./objetos-s3-apoio";

const limpezas: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (limpezas.length) await limpezas.pop()?.();
});
async function selada(n = 1) {
  const f = await pronta(n);
  limpezas.push(async () => f.indice.encerrar());
  return f;
}
async function expirar(id: string) {
  await db.execute(
    sql`update recreio.backup_retirements set lease_until=created_at+interval '1 microsecond',next_attempt_at=clock_timestamp() where capture_id=${id}`,
  );
}
async function comS3(verificada = true) {
  const f = await selada(),
    b = await criarBucketS3DeTeste();
  limpezas.push(b.fechar);
  const indices = criarArmazenamentoDoIndiceS3({
    cliente: b.cliente,
    bucket: f.destino.bucketName,
    indice: f.indice,
    tempoLimiteMs: 2000,
  });
  await indices.publicar(f.bytes, f.id);
  if (verificada) await confirmarPublicacao(f.t, f.bytes);
  const path = `/${f.destino.bucketName}/recreio/v1/backup/${f.id}/${f.arquivo.sha256Cifrado}`;
  b.objetos.set(path, Buffer.from("PAYLOAD_SINTETICO_TESTE_DE_RETIRADA"));
  const transporte = criarRetiradaDoBackupS3({
    cliente: b.cliente,
    destino: f.destino,
    indice: f.indice,
    tempoLimiteMs: 2000,
  });
  return { ...f, b, indices, path, transporte };
}
async function recusarAudit(evento: string, executar: () => Promise<void>) {
  await db.execute(sql`create function audit.recusar_retirada_teste() returns trigger language plpgsql as $$ begin
    if new.event_type=TG_ARGV[0] then raise exception 'recusa sintetica'; end if; return new; end $$`);
  await db.execute(
    sql.raw(
      `create trigger recusar_retirada_teste before insert on audit.events for each row execute function audit.recusar_retirada_teste('${evento}')`,
    ),
  );
  try {
    await executar();
  } finally {
    await db.execute(sql`drop trigger recusar_retirada_teste on audit.events`);
    await db.execute(sql`drop function audit.recusar_retirada_teste()`);
  }
}
async function totalAtivas(id: string) {
  const [r] = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from recreio.backup_object_holds where capture_id=${id} and released_at is null`,
  );
  return r?.n;
}

describe("abandono/retirada: controle nativo; payload sintético sem alegar dump autenticado", () => {
  it("abandono sem arquivo é repetível e só depois libera reservas", async () => {
    const f = await fixture("qualification", 1);
    limpezas.push(async () => f.indice.encerrar());
    await expect(liberarReservasSemArquivo(f.id)).rejects.toMatchObject({ codigo: "ESTADO" });
    await abandonarCapturaSemArquivo(f.id);
    await abandonarCapturaSemArquivo(f.id);
    expect(await totalAtivas(f.id)).toBe(1);
    expect(await liberarReservasSemArquivo(f.id)).toBe(1);
    expect(await liberarReservasSemArquivo(f.id)).toBe(0);
    expect(await db.select().from(holds).where(eq(holds.captureId, f.id))).toMatchObject([
      { releaseReason: "abandoned" },
    ]);
    await expect(prepararPublicacao(f.config)).rejects.toMatchObject({ codigo: "ESTADO" });
  });
  it("protocolo legado não recebe prova de ausência por inferência", async () => {
    const f = await fixture();
    limpezas.push(async () => f.indice.encerrar());
    await db.update(captures).set({ protocolVersion: 0 }).where(eq(captures.id, f.id));
    await expect(abandonarCapturaSemArquivo(f.id)).rejects.toMatchObject({ codigo: "ESTADO" });
    await expect(prepararPublicacao(f.config)).rejects.toMatchObject({ codigo: "ESTADO" });
  });
  it("arquivo admitido exige retirada, nunca abandono sem arquivo", async () => {
    const f = await selada();
    await expect(abandonarCapturaSemArquivo(f.id)).rejects.toMatchObject({ codigo: "ESTADO" });
    expect(await totalAtivas(f.id)).toBe(1);
  });
  it("falha de auditoria reverte abandono e conserva reservas", async () => {
    const f = await fixture("qualification", 1);
    limpezas.push(async () => f.indice.encerrar());
    await recusarAudit("recreio.backup_unsealed_abandoned", async () => {
      await expect(abandonarCapturaSemArquivo(f.id)).rejects.toMatchObject({
        name: "AuditPersistenceError",
      });
    });
    expect((await db.select().from(captures).where(eq(captures.id, f.id)))[0]?.state).toBe(
      "captured",
    );
    expect(await totalAtivas(f.id)).toBe(1);
  });
  it("retirada preparada conserva bytes e bloqueia publicação/retomada/liberação antigas", async () => {
    const f = await selada(),
      t = await prepararRetirada(f.id, "abandonado", f.indice),
      r = await lerRetirada(t, f.indice);
    expect(r.estado).toBe("prepared");
    expect(r.marcador).toMatchObject({
      capturaId: f.id,
      motivo: "abandonado",
      arquivoSha256Cifrado: f.arquivo.sha256Cifrado,
      destino: f.destino,
    });
    await expect(lerTentativaDePublicacao(f.t)).rejects.toMatchObject({ codigo: "ESTADO" });
    await expect(assumirPublicacao(f.id, f.destino)).rejects.toMatchObject({ codigo: "ESTADO" });
    await expect(confirmarPublicacao(f.t, f.bytes)).rejects.toMatchObject({ codigo: "ESTADO" });
    await expect(liberarReservasPublicadas(f.id)).rejects.toMatchObject({ codigo: "ESTADO" });
    expect(await totalAtivas(f.id)).toBe(1);
  });
  it("retenção não se aplica a captura que nunca foi publicada/verificada", async () => {
    const f = await selada();
    await expect(prepararRetirada(f.id, "retencao", f.indice)).rejects.toMatchObject({
      codigo: "ESTADO",
    });
    expect(await db.select().from(retirements).where(eq(retirements.captureId, f.id))).toHaveLength(
      0,
    );
  });
  it("não confirma ausência nem libera reservas antes do marcador guardado", async () => {
    const f = await selada(),
      t = await prepararRetirada(f.id, "abandonado", f.indice);
    await expect(confirmarAusenciaDoBackup(t, true, f.indice)).rejects.toMatchObject({
      codigo: "ESTADO",
    });
    await expect(liberarReservasRetiradas(f.id, f.indice)).rejects.toMatchObject({
      codigo: "ESTADO",
    });
    expect(await totalAtivas(f.id)).toBe(1);
  });
  it("marcador divergente/retirada repetida não substituem a intenção", async () => {
    const f = await selada(),
      t = await prepararRetirada(f.id, "abandonado", f.indice);
    await expect(
      confirmarMarcadorGuardado(t, Buffer.from("divergente"), f.indice),
    ).rejects.toMatchObject({ codigo: "INTEGRIDADE" });
    await expect(prepararRetirada(f.id, "privacidade", f.indice)).rejects.toMatchObject({
      codigo: "ESTADO",
    });
  });
  it("retomada conserva marcador exato e token vencido não confirma", async () => {
    const f = await selada(),
      t = await prepararRetirada(f.id, "abandonado", f.indice),
      r = await lerRetirada(t, f.indice);
    await expirar(f.id);
    await expect(confirmarMarcadorGuardado(t, r.bytes, f.indice)).rejects.toMatchObject({
      codigo: "TENTATIVA",
    });
    const novo = await assumirRetirada(f.id);
    expect(novo.tentativa).not.toBe(t.tentativa);
    expect((await lerRetirada(novo, f.indice)).bytes.equals(r.bytes)).toBe(true);
    await expect(lerRetirada(t, f.indice)).rejects.toMatchObject({ codigo: "TENTATIVA" });
    await confirmarMarcadorGuardado(novo, r.bytes, f.indice);
    await confirmarAusenciaDoBackup(novo, false, f.indice);
    const [c] = await db.execute<{ estado: string; mesmoInstante: boolean }>(
      sql`select state as estado,abandoned_at=absence_confirmed_at as "mesmoInstante" from recreio.backup_captures where id=${f.id}`,
    );
    expect(c).toEqual({ estado: "abandoned", mesmoInstante: true });
    expect(await liberarReservasRetiradas(f.id, f.indice)).toBe(1);
    expect(await liberarReservasRetiradas(f.id, f.indice)).toBe(0);
  });
  it("SDK guarda tombstone antes do DELETE; restauração continua negada sem o banco", async () => {
    const f = await comS3(),
      antes = f.b.pedidos.length,
      t = await prepararRetirada(f.id, "retencao", f.indice);
    const [historico] = await db.execute<{ instante: string }>(
      sql`select verified_at::text as instante from recreio.backup_captures where id=${f.id}`,
    );
    await retirarCapturaGuardada({
      tentativa: t,
      indice: f.indice,
      indices: f.indices,
      transporte: f.transporte,
    });
    expect(f.b.objetos.has(f.path)).toBe(false);
    const base = `/${f.destino.bucketName}/recreio/v1/backup/${f.id}/`;
    expect(f.b.objetos.has(`${base}manifesto.json`)).toBe(true);
    expect(f.b.objetos.has(`${base}retirado.json`)).toBe(true);
    const pedidos = f.b.pedidos.slice(antes),
      marcou = pedidos.findIndex(
        (p) => p.metodo === "PUT" && p.url.split("?")[0] === `${base}retirado.json`,
      ),
      removeu = pedidos.findIndex((p) => p.metodo === "DELETE" && p.url.split("?")[0] === f.path);
    expect(marcou).toBeGreaterThanOrEqual(0);
    expect(removeu).toBeGreaterThan(marcou);
    await expect(f.indices.recuperar(f.id)).rejects.toMatchObject({ codigo: "RETIRADO" });
    const [depois] = await db.execute<{ instante: string }>(
      sql`select verified_at::text as instante from recreio.backup_captures where id=${f.id}`,
    );
    expect(depois?.instante).toBe(historico?.instante);
    expect(await liberarReservasRetiradas(f.id, f.indice)).toBe(1);
  });
  it("PUT tardio é removido na reconferência sem mudar a primeira ausência", async () => {
    const f = await comS3(),
      t = await prepararRetirada(f.id, "retencao", f.indice);
    await retirarCapturaGuardada({
      tentativa: t,
      indice: f.indice,
      indices: f.indices,
      transporte: f.transporte,
    });
    await db.execute(
      sql`update recreio.backup_retirements set marker_stored_at=created_at,first_absence_at=created_at+interval '456 microseconds',last_checked_at=clock_timestamp() where capture_id=${f.id}`,
    );
    const [primeira] = await db.execute<{ instante: string }>(
      sql`select first_absence_at::text as instante from recreio.backup_retirements where capture_id=${f.id}`,
    );
    f.b.objetos.set(f.path, Buffer.from("PUT_TARDIO"));
    await expirar(f.id);
    const nova = await assumirRetirada(f.id);
    await retirarCapturaGuardada({
      tentativa: nova,
      indice: f.indice,
      indices: f.indices,
      transporte: f.transporte,
    });
    const [atual] = await db.execute<{ instante: string }>(
      sql`select first_absence_at::text as instante from recreio.backup_retirements where capture_id=${f.id}`,
    );
    expect(atual?.instante).toBe(primeira?.instante);
    expect(f.b.objetos.has(f.path)).toBe(false);
  });
  it("DELETE com resposta perdida é conciliado sem apagar os marcadores", async () => {
    const f = await comS3(false),
      t = await prepararRetirada(f.id, "abandonado", f.indice);
    f.b.estado.perderDelete = true;
    await retirarCapturaGuardada({
      tentativa: t,
      indice: f.indice,
      indices: f.indices,
      transporte: f.transporte,
    });
    expect(
      (await db.select().from(retirements).where(eq(retirements.captureId, f.id)))[0]?.state,
    ).toBe("absent");
    await expect(f.indices.recuperar(f.id)).rejects.toMatchObject({ codigo: "RETIRADO" });
  });
  it("falha ao guardar marcador impede DELETE e mantém reservas", async () => {
    const f = await comS3(),
      t = await prepararRetirada(f.id, "retencao", f.indice),
      antes = f.b.pedidos.length;
    f.b.estado.negar = true;
    await expect(
      retirarCapturaGuardada({
        tentativa: t,
        indice: f.indice,
        indices: f.indices,
        transporte: f.transporte,
      }),
    ).rejects.toMatchObject({ codigo: "CONFIGURACAO" });
    expect(f.b.pedidos.slice(antes).some((p) => p.metodo === "DELETE")).toBe(false);
    expect(await totalAtivas(f.id)).toBe(1);
  });
  it("resposta do PUT do marcador perdida mantém payload e permite retomada exata", async () => {
    const f = await comS3(),
      t = await prepararRetirada(f.id, "retencao", f.indice);
    f.b.estado.perderPut = true;
    const antes = f.b.pedidos.length;
    await expect(
      retirarCapturaGuardada({
        tentativa: t,
        indice: f.indice,
        indices: f.indices,
        transporte: f.transporte,
      }),
    ).rejects.toMatchObject({ codigo: "INCONCLUSIVO" });
    expect(f.b.objetos.has(f.path)).toBe(true);
    expect(f.b.pedidos.slice(antes).some((p) => p.metodo === "DELETE")).toBe(false);
    f.b.estado.perderPut = false;
    await expirar(f.id);
    const nova = await assumirRetirada(f.id);
    await retirarCapturaGuardada({
      tentativa: nova,
      indice: f.indice,
      indices: f.indices,
      transporte: f.transporte,
    });
    expect(f.b.objetos.has(f.path)).toBe(false);
  });
  it("reagendamento e scanner respeitam prazo, destino e nova tentativa", async () => {
    const f = await selada(),
      t = await prepararRetirada(f.id, "abandonado", f.indice);
    expect(await listarRetiradasDevidas(f.destino)).toEqual([]);
    await reagendarRetirada(t);
    expect(await listarRetiradasDevidas(f.destino)).toEqual([]);
    await expirar(f.id);
    expect(await listarRetiradasDevidas(f.destino)).toEqual([{ id: f.id }]);
    expect(await listarRetiradasDevidas({ ...f.destino, bucketName: "outro-backup" })).toEqual([]);
    const nova = await assumirRetirada(f.id);
    await expect(reagendarRetirada(t)).rejects.toMatchObject({ codigo: "TENTATIVA" });
    expect((await lerRetirada(nova, f.indice)).estado).toBe("prepared");
    expect(await listarRetiradasDevidas(f.destino)).toEqual([]);
  });
  it("FK impede apagar a publicação necessária à retomada", async () => {
    const f = await selada();
    await prepararRetirada(f.id, "abandonado", f.indice);
    const erro = await db
      .delete(publications)
      .where(eq(publications.captureId, f.id))
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(codigoDoPostgres(erro)).toBe("23001");
  });
  it("falha de auditoria da liberação conserva a reserva abandonada", async () => {
    const f = await fixture("qualification", 1);
    limpezas.push(async () => f.indice.encerrar());
    await abandonarCapturaSemArquivo(f.id);
    await recusarAudit("recreio.backup_abandoned_holds_released", async () => {
      await expect(liberarReservasSemArquivo(f.id)).rejects.toMatchObject({
        name: "AuditPersistenceError",
      });
    });
    expect(await totalAtivas(f.id)).toBe(1);
    expect(await liberarReservasSemArquivo(f.id)).toBe(1);
  });
  it.each([
    "recreio.backup_retirement_prepared",
    "recreio.backup_retirement_marked",
    "recreio.backup_retired",
  ])("auditoria estrita reverte %s", async (evento) => {
    const f = await comS3();
    if (evento === "recreio.backup_retirement_prepared") {
      await recusarAudit(evento, async () => {
        await expect(prepararRetirada(f.id, "retencao", f.indice)).rejects.toMatchObject({
          name: "AuditPersistenceError",
        });
      });
      expect(
        await db.select().from(retirements).where(eq(retirements.captureId, f.id)),
      ).toHaveLength(0);
      return;
    }
    const t = await prepararRetirada(f.id, "retencao", f.indice);
    await recusarAudit(evento, async () => {
      await expect(
        retirarCapturaGuardada({
          tentativa: t,
          indice: f.indice,
          indices: f.indices,
          transporte: f.transporte,
        }),
      ).rejects.toMatchObject({ name: "AuditPersistenceError" });
    });
    expect(
      (await db.select().from(retirements).where(eq(retirements.captureId, f.id)))[0]?.state,
    ).toBe(evento.endsWith("marked") ? "prepared" : "marked");
    expect(await totalAtivas(f.id)).toBe(1);
    await expirar(f.id);
    const nova = await assumirRetirada(f.id);
    await retirarCapturaGuardada({
      tentativa: nova,
      indice: f.indice,
      indices: f.indices,
      transporte: f.transporte,
    });
    expect(await liberarReservasRetiradas(f.id, f.indice)).toBe(1);
  });
});
