import { randomUUID } from "node:crypto";
import { db, sql } from "@informach/db";
import { afterEach, describe, expect, it } from "vitest";
import { avaliarPoliticaDoBackup } from "../scripts/backup/politica-repository";
import {
  confirmarArquivoGuardado,
  confirmarPublicacao,
  prepararIndiceDuravel,
  prepararPublicacao,
} from "../scripts/backup/publicacao-repository";
import { prepararRetiradaPorRetencao } from "../scripts/backup/retirada-repository";
import { fixture } from "./backup-publicacao-apoio";

const limpar: (() => void)[] = [];
afterEach(() => {
  while (limpar.length) limpar.pop()?.();
});
async function publicada(fresca: boolean) {
  const f = await fixture("qualification", 1);
  limpar.push(() => f.indice.encerrar());
  if (fresca)
    await db.execute(
      sql`update recreio.backup_captures set captured_at=clock_timestamp() where id=${f.id}`,
    );
  // Native control/MAC fixture only, not an external dump verification.
  const t = await prepararPublicacao(f.config),
    v = await confirmarArquivoGuardado(t),
    bytes = await prepararIndiceDuravel(t, f.indice.assinar(v), f.indice);
  await confirmarPublicacao(t, bytes);
  return f;
}
function alvo(f: Awaited<ReturnType<typeof publicada>>) {
  return { fotografias: f.foto, arquivos: f.destino, intervaloSegundos: 18000, retencaoDias: 28 };
}
async function controle(id: string) {
  return db.execute(sql`select to_jsonb(c) as captura,to_jsonb(p) as publicacao,
    (select jsonb_agg(to_jsonb(r)) from recreio.backup_retirements r where r.capture_id=c.id) as retirada,
    (select jsonb_agg(to_jsonb(h) order by delivery_id) from recreio.backup_object_holds h where h.capture_id=c.id) as reservas
    from recreio.backup_captures c join recreio.backup_publications p on p.capture_id=c.id where c.id=${id}`);
}

describe("server-clock backup cadence and retention", () => {
  it("does not use a late publication as a new source capture or alter any control while scanning", async () => {
    const f = await publicada(false),
      before = await controle(f.id),
      p = await avaliarPoliticaDoBackup(alvo(f));
    expect(p.capturaNecessaria).toBe(true);
    expect(p.retencoes).toEqual([{ id: f.id }]);
    expect(p.idadeDaUltimaCapturaSegundos).toBeGreaterThan(28 * 86400);
    expect(await controle(f.id)).toEqual(before);
    for (const arquivos of [
      { ...f.destino, bucketId: randomUUID() },
      { ...f.destino, bucketName: "foreign-backup" },
    ]) {
      const foreign = await avaliarPoliticaDoBackup({ ...alvo(f), arquivos });
      expect(foreign).toEqual({
        capturaNecessaria: true,
        idadeDaUltimaCapturaSegundos: null,
        retencoes: [],
      });
      await expect(prepararRetiradaPorRetencao(f.id, arquivos, 28, f.indice)).rejects.toMatchObject(
        { codigo: "CONFIGURACAO" },
      );
    }
    expect(await controle(f.id)).toEqual(before);
    await prepararRetiradaPorRetencao(f.id, f.destino, 28, f.indice);
    expect(await avaliarPoliticaDoBackup(alvo(f))).toEqual({
      capturaNecessaria: true,
      idadeDaUltimaCapturaSegundos: null,
      retencoes: [],
    });
  });
  it("refuses retention of a fresh native capture under lock and rejects invalid policy before effects", async () => {
    const f = await publicada(true),
      before = await controle(f.id),
      p = await avaliarPoliticaDoBackup(alvo(f));
    expect(p.capturaNecessaria).toBe(false);
    expect(p.retencoes).toEqual([]);
    await expect(prepararRetiradaPorRetencao(f.id, f.destino, 28, f.indice)).rejects.toMatchObject({
      codigo: "ESTADO",
    });
    for (const dias of [0, 89, NaN, 1.5])
      await expect(
        prepararRetiradaPorRetencao(f.id, f.destino, dias, f.indice),
      ).rejects.toMatchObject({ codigo: "CONFIGURACAO" });
    for (const patch of [{ intervaloSegundos: 0 }, { retencaoDias: 89 }, { retencaoDias: -1 }])
      await expect(avaliarPoliticaDoBackup({ ...alvo(f), ...patch })).rejects.toMatchObject({
        codigo: "CONFIGURACAO",
      });
    expect(await controle(f.id)).toEqual(before);
  });
});
