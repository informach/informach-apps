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
  await sql.unsafe("create type recreio.cor as enum ('azul','verde')");
  await sql.unsafe(
    "create domain recreio.texto as text constraint texto_tamanho check (length(value)>0)",
  );
  await sql.unsafe("create sequence recreio.numero start 10 increment 3");
  await sql.unsafe("create view recreio.ids as select id from recreio.documentos");
  await sql.unsafe(
    "create function recreio.calcular(n integer) returns integer language sql immutable as 'select n+1'",
  );
  await sql.unsafe(
    "create function recreio.conservar() returns trigger language plpgsql as 'begin return new; end'",
  );
  await sql.unsafe(
    "create trigger conservar before insert on recreio.documentos for each row execute function recreio.conservar()",
  );
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
  it.each([
    [
      "função",
      "create or replace function recreio.calcular(n integer) returns integer language sql immutable as 'select n+2'",
    ],
    ["view", "create or replace view recreio.ids as select id from recreio.documentos where id=1"],
    ["trigger", "alter table recreio.documentos disable trigger conservar"],
    ["sequência", "alter sequence recreio.numero increment 7"],
    ["enum", "alter type recreio.cor add value 'amarelo'"],
    ["domínio", "alter domain recreio.texto add constraint texto_maior check (length(value)>1)"],
    [
      "nome da constraint",
      "alter table recreio.documentos rename constraint documentos_pkey to documentos_pk",
    ],
    [
      "privilégios padrão",
      `alter default privileges in schema recreio grant select on tables to "${leitor}"`,
    ],
    ["permissão de schema", `revoke usage on schema recreio from "${leitor}"`],
    ["permissão de função", "revoke execute on function recreio.calcular(integer) from public"],
    ["permissão de coluna", `grant update(bytes) on recreio.documentos to "${leitor}"`],
    ["permissão de tipo", "revoke usage on type recreio.cor from public"],
    ["permissão de sequência", `grant usage on sequence recreio.numero to "${leitor}"`],
  ])("recusa divergência de %s com conteúdo das tabelas preservado", async (_nome, consulta) => {
    const original = await ler(origem);
    await copia.unsafe(consulta);
    const restaurado = await ler(copia);
    expect(restaurado.tabelas).toEqual(original.tabelas);
    expect(() => conferirInventarios(original, restaurado)).toThrow("ESTRUTURA_DIVERGENTE");
  });
  it("recurso sem perfil de conferência falha explicitamente", async () => {
    await copia.unsafe('create collation recreio.prova from "C"');
    await expect(ler(copia)).rejects.toMatchObject({ codigo: "CATALOGO_NAO_SUPORTADO" });
  });
  it("inventários de algoritmos diferentes não são comparados como equivalentes", async () => {
    const original = await ler(origem);
    const adulterado = JSON.parse(JSON.stringify(original));
    delete adulterado.metodo;
    expect(() => conferirInventarios(adulterado, original)).toThrow("FORMATO_DIVERGENTE");
  });
});
