import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  conferirInventarios,
  type InventarioDoBackup,
  inventariarBackup,
} from "../scripts/backup/inventario";

const base = process.env.DATABASE_URL;
if (!base || process.env.RECREIO_ISOLATED_TEST !== "1") throw new Error("Destino não isolado");
const url = new URL(base);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
  !/^\/recreio_review_[a-f0-9]{32}$/.test(url.pathname)
)
  throw new Error("Banco não descartável");

const id = randomBytes(12).toString("hex");
const bancos = [`recreio_backup_${id}_origem`, `recreio_backup_${id}_copia`];
const leitor = `recreio_backup_${id}_leitor`;
const administrador = postgres(base, { max: 1, prepare: false });
let origem: postgres.Sql;
let copia: postgres.Sql;

async function preencher(sql: postgres.Sql, inverso = false): Promise<void> {
  await sql.unsafe("drop schema if exists recreio cascade");
  await sql.unsafe("create schema recreio");
  await sql.unsafe(`create table recreio.documentos (
    id int primary key, bytes bytea not null, dados jsonb not null,
    em timestamptz not null default now())`);
  await sql.unsafe("create index documentos_bytes_idx on recreio.documentos(bytes)");
  const ids = inverso ? [2, 1] : [1, 2];
  for (const numero of ids)
    await sql`insert into recreio.documentos(id,bytes,dados,em) values (
      ${numero}, ${Buffer.from([numero, 0, 255])},
      ${sql.json({ texto: "conteúdo sintético de família ☀", numero })},
      '2026-11-15T08:00:00Z')`;
  await sql.unsafe(`grant usage on schema recreio to "${leitor}"`);
  await sql.unsafe(`grant select on recreio.documentos to "${leitor}"`);
}

async function ler(sql: postgres.Sql): Promise<InventarioDoBackup> {
  return sql.begin("isolation level repeatable read read only", inventariarBackup);
}

beforeAll(async () => {
  await administrador.unsafe(`create role "${leitor}" nologin`);
  for (const banco of bancos) {
    if (!/^recreio_backup_[a-f0-9]{24}_(origem|copia)$/.test(banco))
      throw new Error("Destino inválido");
    await administrador.unsafe(`create database "${banco}" template template0`);
  }
  const enderecos = bancos.map((banco) => {
    const endereco = new URL(base);
    endereco.pathname = `/${banco}`;
    return endereco.href;
  });
  const [primeiro, segundo] = enderecos;
  if (!primeiro || !segundo) throw new Error("Destinos ausentes");
  origem = postgres(primeiro, { max: 1, prepare: false });
  copia = postgres(segundo, { max: 1, prepare: false });
});

beforeEach(async () => {
  await preencher(origem);
  await preencher(copia, true);
});

afterAll(async () => {
  await Promise.all([origem?.end(), copia?.end()]);
  try {
    for (const banco of bancos) {
      if (!/^recreio_backup_[a-f0-9]{24}_(origem|copia)$/.test(banco))
        throw new Error("Limpeza fora do escopo");
      await administrador.unsafe(`drop database if exists "${banco}"`);
    }
    await administrador.unsafe(`drop role if exists "${leitor}"`);
  } finally {
    await administrador.end();
  }
});

describe("inventário de restauração em dois bancos reais", () => {
  it("conserva conteúdo binário/JSON/tempo independentemente da ordem física", async () => {
    const [original, restaurado] = await Promise.all([ler(origem), ler(copia)]);
    expect(original.tabelas.find((t) => t.nome === "documentos")?.resumo.linhas).toBe(2);
    expect(() => conferirInventarios(original, restaurado)).not.toThrow();
    expect(JSON.stringify(original)).not.toContain("conteúdo sintético");
    expect(JSON.stringify(original)).not.toContain(leitor);
  });

  it("recusa conteúdo diferente mesmo com a mesma quantidade e tamanho de linhas", async () => {
    const original = await ler(origem);
    await copia`update recreio.documentos set bytes=${Buffer.from([9, 0, 255])} where id=1`;
    const restaurado = await ler(copia);
    expect(restaurado.tabelas[0]?.resumo.linhas).toBe(original.tabelas[0]?.resumo.linhas);
    expect(() => conferirInventarios(original, restaurado)).toThrow("DADOS_DIVERGENTES");
  });

  it("recusa perda de índice mesmo com dados idênticos", async () => {
    const original = await ler(origem);
    await copia.unsafe("drop index recreio.documentos_bytes_idx");
    const restaurado = await ler(copia);
    expect(restaurado.tabelas).toEqual(original.tabelas);
    expect(() => conferirInventarios(original, restaurado)).toThrow("ESTRUTURA_DIVERGENTE");
  });

  it("recusa concessão diferente de permissões mesmo com dados idênticos", async () => {
    const original = await ler(origem);
    await copia.unsafe(`grant update on recreio.documentos to "${leitor}"`);
    const restaurado = await ler(copia);
    expect(restaurado.tabelas).toEqual(original.tabelas);
    expect(() => conferirInventarios(original, restaurado)).toThrow("ESTRUTURA_DIVERGENTE");
  });
});
