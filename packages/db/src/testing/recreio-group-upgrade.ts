/** Prova remota de atualização; nunca executa contra Railway ou banco de desenvolvimento. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import journal from "../migrations/meta/_journal.json" with { type: "json" };

const BASE = "338236d041d3c7be0d4fb1fbbe0373a7101f8e07";
const MIGRATIONS = "packages/db/src/migrations";
const baseFile = (path: string) => execFileSync("git", ["show", `${BASE}:${path}`]);

async function memoria(sql: postgres.Sql) {
  const [linha] = await sql<{ conteudo: unknown }[]>`select jsonb_build_object(
    'grupos',(select jsonb_agg(to_jsonb(g) order by g.id) from recreio.groups g),
    'perfis',(select jsonb_agg(to_jsonb(p) order by p.id) from recreio.profiles p),
    'chaves',(select jsonb_agg(to_jsonb(k) order by k.id) from recreio.profile_data_keys k),
    'versoes',(select jsonb_agg(to_jsonb(v) order by v.id) from recreio.profile_data_versions v),
    'conquistas',(select jsonb_agg(to_jsonb(a) order by a.id) from recreio.profile_achievements a)
  ) as conteudo`;
  assert.ok(linha);
  return linha.conteudo;
}

async function main() {
  assert.equal(process.env.GITHUB_ACTIONS, "true", "Este ensaio roda somente no GitHub.");
  const origem = process.env.DATABASE_URL;
  assert.ok(origem, "DATABASE_URL ausente");
  const url = new URL(origem);
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    "PostgreSQL precisa ser local ao runner.",
  );
  const nome = `recreio_upgrade_${randomUUID().replaceAll("-", "")}`;
  assert.match(nome, /^recreio_upgrade_[a-f0-9]{32}$/);
  const pasta = await mkdtemp(join(tmpdir(), "recreio-grupos-migrations-"));
  assert.equal(dirname(resolve(pasta)), resolve(tmpdir()));
  const admin = postgres(origem, { max: 1, onnotice: () => {} });
  let criada = false;
  let conexao: postgres.Sql | undefined;
  try {
    const anterior = { ...journal, entries: journal.entries.filter((e) => e.idx <= 178) };
    assert.equal(anterior.entries.length, 179);
    const historico = baseFile(`${MIGRATIONS}/meta/_journal.json`);
    assert.deepEqual(
      JSON.parse(historico.toString("utf8")),
      anterior,
      "Base pública precisa ser o prefixo exato.",
    );
    await mkdir(join(pasta, "meta"));
    await writeFile(join(pasta, "meta/_journal.json"), historico);
    for (const entrada of anterior.entries)
      await writeFile(
        join(pasta, `${entrada.tag}.sql`),
        baseFile(`${MIGRATIONS}/${entrada.tag}.sql`),
      );
    await admin.unsafe(`create database "${nome}"`);
    criada = true;
    url.pathname = `/${nome}`;
    const sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
    conexao = sql;
    const banco = drizzle(sql);
    await migrate(banco, { migrationsFolder: pasta });
    const contas = [randomUUID(), randomUUID()];
    const grupos = [randomUUID(), randomUUID()];
    const perfis = [randomUUID(), randomUUID()];
    for (let n = 0; n < 2; n++) {
      const contaId = contas[n];
      const grupoId = grupos[n];
      const perfilId = perfis[n];
      assert.ok(contaId && grupoId && perfilId);
      await sql`insert into core.users(id,name,email,email_verified) values(${contaId},'Conta sintética',${`${contaId}@example.test`},true)`;
      await sql`insert into recreio.groups(id,owner_user_id) values(${grupoId},${contaId})`;
      await sql`insert into recreio.profiles(id,user_id,group_id,kind,nickname,avatar) values(${perfilId},${contaId},${grupoId},'adult','Perfil antigo','padrao')`;
      const chave = randomUUID();
      const bytes = Buffer.from(`progresso-sintetico-${n}`);
      const digest = createHash("sha256").update(bytes).digest("hex");
      await sql`insert into recreio.profile_data_keys(id,profile_id,game_id,key,revision) values(${chave},${perfilId},'prova-upgrade','marco',1)`;
      await sql`insert into recreio.profile_data_versions(data_id,profile_id,game_id,base_revision,revision,kind,bytes,digest) values(${chave},${perfilId},'prova-upgrade',0,1,'accepted',${bytes},${digest})`;
      await sql`insert into recreio.profile_achievements(profile_id,game_id,achievement_id,key_hash) values(${perfilId},'prova-upgrade','marca',${digest})`;
    }
    const antes = await memoria(sql);
    const atual = fileURLToPath(new URL("../migrations", import.meta.url));
    await migrate(banco, { migrationsFolder: atual });
    assert.deepEqual(
      await memoria(sql),
      antes,
      "Atualização mudou IDs, composição ou progresso existente.",
    );
    const [recebidos] = await sql<
      { total: number }[]
    >`select count(*)::integer as total from drizzle.__drizzle_migrations`;
    assert.equal(recebidos?.total, journal.entries.length);
    const linhas = await sql<
      { hash: string }[]
    >`select hash from drizzle.__drizzle_migrations order by created_at,id`;
    for (const [n, entrada] of anterior.entries.entries()) {
      const hash = createHash("sha256")
        .update(baseFile(`${MIGRATIONS}/${entrada.tag}.sql`))
        .digest("hex");
      assert.equal(linhas[n]?.hash, hash, "Recibo anterior foi alterado.");
    }
    const grupoId = grupos[0];
    const contaId = contas[0];
    const destinatarioId = contas[1];
    assert.ok(grupoId && contaId && destinatarioId);
    await sql`insert into recreio.group_invites(group_id,inviter_user_id,inviter_declaration_version,recipient_email,recipient_user_id,sender_label,expires_at)
      values(${grupoId},${contaId},'adulto-2026-11-17',${`${destinatarioId}@example.test`},${destinatarioId},'Origem',clock_timestamp()+interval '1 hour')`;
    await migrate(banco, { migrationsFolder: atual });
    assert.deepEqual(await memoria(sql), antes);
    const [repetidos] = await sql<
      { total: number }[]
    >`select count(*)::integer as total from drizzle.__drizzle_migrations`;
    assert.ok(repetidos);
    assert.equal(repetidos.total, journal.entries.length);
    console.log(
      JSON.stringify({
        base: BASE,
        recibosAntes: anterior.entries.length,
        recibosDepois: repetidos.total,
        perfisPreservados: 2,
        progressoPreservado: true,
        conquistasPreservadas: true,
        repeticaoSemMudanca: true,
      }),
    );
  } finally {
    try {
      await conexao?.end({ timeout: 3 });
      if (criada) await admin.unsafe(`drop database "${nome}" with (force)`);
    } finally {
      await admin.end({ timeout: 3 });
      await rm(pasta, { recursive: true });
    }
  }
}

main().catch((erro) => {
  console.error("recreio.group_upgrade.failed", erro instanceof Error ? erro.name : "UnknownError");
  process.exitCode = 1;
});
