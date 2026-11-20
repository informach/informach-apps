import { randomUUID } from "node:crypto";
import { db, sql } from "@informach/db";
import { afterEach, describe, expect, it } from "vitest";
import {
  abandonarCapturaSemArquivo,
  liberarReservasSemArquivo,
} from "../scripts/backup/abandono-repository";
import { listarPendenciasDoBackup } from "../scripts/backup/fila-repository";
import {
  assumirPublicacao,
  confirmarArquivoGuardado,
  confirmarPublicacao,
  liberarReservasPublicadas,
  prepararIndiceDuravel,
  prepararPublicacao,
} from "../scripts/backup/publicacao-repository";
import {
  assumirRetirada,
  confirmarAusenciaDoBackup,
  confirmarMarcadorGuardado,
  lerRetirada,
  liberarReservasRetiradas,
  prepararRetirada,
} from "../scripts/backup/retirada-repository";
import { expirar, fixture } from "./backup-publicacao-apoio";

const limpezas: (() => void)[] = [];
afterEach(() => {
  while (limpezas.length) limpezas.pop()?.();
});
async function nova(n = 0) {
  const f = await fixture("qualification", n);
  limpezas.push(() => f.indice.encerrar());
  return f;
}
const vazia = {
  semArquivo: [],
  reservasAbandonadas: [],
  publicacoes: [],
  reservasPublicadas: [],
  reservasRetiradas: [],
};
async function controle() {
  return db.execute(sql`select
    (select jsonb_agg(to_jsonb(c) order by id) from recreio.backup_captures c) as captures,
    (select jsonb_agg(to_jsonb(p) order by capture_id) from recreio.backup_publications p) as publications,
    (select jsonb_agg(to_jsonb(r) order by capture_id) from recreio.backup_retirements r) as retirements,
    (select jsonb_agg(to_jsonb(h) order by capture_id,delivery_id) from recreio.backup_object_holds h) as holds`);
}
async function consultar(f: Awaited<ReturnType<typeof nova>>) {
  const antes = await controle();
  const fila = await listarPendenciasDoBackup({ fotografias: f.foto, arquivos: f.destino });
  expect(await controle()).toEqual(antes);
  return fila;
}

describe("bounded native backup queues (SQL/control fixtures; not external archive verification)", () => {
  it("refuses a scanner ID with another destination before changing controls or releasing holds", async () => {
    const f = await nova(1);
    const badPhotos = { ...f.foto, bucketId: randomUUID() };
    let antes = await controle();
    await expect(abandonarCapturaSemArquivo(f.id, badPhotos)).rejects.toMatchObject({
      codigo: "CONFIGURACAO",
    });
    await expect(liberarReservasSemArquivo(f.id, badPhotos)).rejects.toMatchObject({
      codigo: "CONFIGURACAO",
    });
    expect(await controle()).toEqual(antes);
    await prepararPublicacao(f.config);
    const badArchive = { ...f.destino, bucketName: "foreign-native-archive" };
    antes = await controle();
    await expect(liberarReservasPublicadas(f.id, badArchive)).rejects.toMatchObject({
      codigo: "CONFIGURACAO",
    });
    expect(await controle()).toEqual(antes);
    await prepararRetirada(f.id, "abandonado", f.indice);
    antes = await controle();
    await expect(assumirRetirada(f.id, badArchive)).rejects.toMatchObject({
      codigo: "CONFIGURACAO",
    });
    expect(await controle()).toEqual(antes);
  });
  it("scopes unsealed/abandoned holds to the exact original destination and preserves every control row", async () => {
    const f = await nova(1);
    expect(await consultar(f)).toEqual({ ...vazia, semArquivo: [{ id: f.id }] });
    for (const fotografias of [
      { ...f.foto, bucketId: randomUUID() },
      { ...f.foto, bucketName: "foreign-photo-bucket" },
    ])
      expect(await listarPendenciasDoBackup({ fotografias, arquivos: f.destino })).toEqual(vazia);
    await expect(
      listarPendenciasDoBackup({
        fotografias: { ...f.foto, escopo: "production" },
        arquivos: f.destino,
      }),
    ).rejects.toMatchObject({ codigo: "CONFIGURACAO" });
    await abandonarCapturaSemArquivo(f.id, f.foto);
    expect(await consultar(f)).toEqual({ ...vazia, reservasAbandonadas: [{ id: f.id }] });
    expect(await liberarReservasSemArquivo(f.id, f.foto)).toBe(1);
    expect(await consultar(f)).toEqual(vazia);
  });

  it("distinguishes due publication, stored holds and confirmed retirement without treating a lease as absence", async () => {
    const f = await nova(1),
      t = await prepararPublicacao(f.config);
    expect(await consultar(f)).toEqual(vazia);
    await expirar(f.id); // Synthetic worker lease only; no consent or original deadline is changed.
    expect(await consultar(f)).toEqual({ ...vazia, publicacoes: [{ id: f.id }] });
    for (const arquivos of [
      { ...f.destino, bucketId: randomUUID() },
      { ...f.destino, bucketName: "foreign-archive-bucket" },
    ])
      expect(await listarPendenciasDoBackup({ fotografias: f.foto, arquivos })).toEqual(vazia);
    const novaTentativa = await assumirPublicacao(f.id, f.destino);
    expect(novaTentativa.tentativa).not.toBe(t.tentativa);
    expect(await consultar(f)).toEqual(vazia);
    // Native SQL/MAC control fixture, deliberately no claim of S3 or dump validity.
    const dados = await confirmarArquivoGuardado(novaTentativa);
    const bytes = await prepararIndiceDuravel(novaTentativa, f.indice.assinar(dados), f.indice);
    await confirmarPublicacao(novaTentativa, bytes);
    expect(await consultar(f)).toEqual({ ...vazia, reservasPublicadas: [{ id: f.id }] });
    const retirada = await prepararRetirada(f.id, "retencao", f.indice);
    expect(await consultar(f)).toEqual(vazia);
    const r = await lerRetirada(retirada, f.indice);
    await confirmarMarcadorGuardado(retirada, r.bytes, f.indice);
    expect(await consultar(f)).toEqual(vazia);
    await confirmarAusenciaDoBackup(retirada, false, f.indice);
    expect(await consultar(f)).toEqual({ ...vazia, reservasRetiradas: [{ id: f.id }] });
    expect(await liberarReservasRetiradas(f.id, f.indice)).toBe(1);
    expect(await consultar(f)).toEqual(vazia);
  });

  it("bounds the original-destination scan at twenty ordered rows and excludes legacy controls", async () => {
    const f = await nova(),
      ids = [f.id];
    for (let n = 0; n < 22; n++) {
      const id = randomUUID();
      ids.push(id);
      await db.execute(sql`insert into recreio.backup_captures(id,protocol_version,storage_scope,bucket_id,bucket_name,created_at)
        values(${id},1,${f.foto.escopo},${f.foto.bucketId},${f.foto.bucketName},'2020-01-01T00:00:00Z')`);
    }
    const legacy = randomUUID();
    await db.execute(sql`insert into recreio.backup_captures(id,protocol_version,storage_scope,bucket_id,bucket_name,created_at)
      values(${legacy},0,${f.foto.escopo},${f.foto.bucketId},${f.foto.bucketName},'2019-01-01T00:00:00Z')`);
    const fila = await consultar(f);
    expect(fila).toEqual({
      ...vazia,
      semArquivo: ids
        .sort()
        .slice(0, 20)
        .map((id) => ({ id })),
    });
  });
});
