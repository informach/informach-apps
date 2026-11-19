import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { watch } from "node:fs";
import { type FileHandle, mkdtemp, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { comCapturaConsistente } from "@/features/backup/captura-repository";
import { criarCifradorDeArquivos } from "../scripts/backup/arquivo-cifrado";
import { criarArquivoComposto } from "../scripts/backup/arquivo-composto";
import { criarGravadorDeDump } from "../scripts/backup/dump-snapshot";
import { conferirInventarios, inventariarBackup } from "../scripts/backup/inventario";
import { limparDiretorioDeProva } from "../scripts/backup/provas-arquivos";

const destino = {
  bucketId: randomUUID(),
  bucketName: "recreio-fixture",
  escopo: "qualification" as const,
};
function conexao() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.CI !== "true" ||
    process.env.RECREIO_ISOLATED_TEST !== "1" ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    !/^\/recreio_review_[a-f0-9]{32}$/.test(url.pathname)
  )
    throw new Error("Dump qualification requires disposable GitHub database");
  url.searchParams.set("sslmode", "disable");
  return url;
}
async function temporarios<T>(fn: (arquivo: (nome: string) => Promise<FileHandle>) => Promise<T>) {
  const root = await mkdtemp(join(tmpdir(), "recreio-dump-prova-")),
    handles: FileHandle[] = [];
  try {
    return await fn(async (nome) => {
      if (!/^[a-z-]+\.bin$/.test(nome)) throw new Error("Invalid fixture file");
      const h = await open(join(root, nome), "wx+", 0o600);
      handles.push(h);
      return h;
    });
  } finally {
    await limparDiretorioDeProva(root, handles, "recreio-dump-prova-");
  }
}
function gravador(url: URL, limiteBytes = 32 * 1024 * 1024) {
  return criarGravadorDeDump({ conexao: url.href, limiteBytes, tempoLimiteMs: 60_000 });
}

/** Só restaura neste teste, em nome aleatório previamente criado. Stderr nunca
 * é exibido; o processo fecha antes da remoção do destino. */
async function restaurar(url: URL, entrada: FileHandle) {
  const filho = spawn(
    "pg_restore",
    ["--no-password", "--exit-on-error", "--dbname", url.pathname.slice(1)],
    {
      env: {
        PATH: process.env.PATH,
        PGHOST: url.hostname,
        PGPORT: url.port || "5432",
        PGUSER: decodeURIComponent(url.username),
        PGPASSWORD: decodeURIComponent(url.password),
        PGSSLMODE: "disable",
        PGCONNECT_TIMEOUT: "15",
        PGPASSFILE: "/dev/null",
        PGSERVICEFILE: "/dev/null",
        LANG: "C",
        TZ: "UTC",
      },
      stdio: [entrada.fd, "ignore", "pipe"],
    },
  );
  let erro = false;
  const fechado = new Promise<number | null>((resolve) => {
    filho.once("error", () => {
      erro = true;
    });
    filho.once("close", resolve);
  });
  filho.stderr.on("data", () => {
    erro = true;
  });
  const timer = setTimeout(() => filho.kill("SIGKILL"), 60_000);
  try {
    if ((await fechado) !== 0 || erro) throw new Error("Native fixture restore failed");
  } finally {
    clearTimeout(timer);
  }
}

describe("pg_dump nativo da visão mantida pela captura", () => {
  it(
    "restaura o dump extraído do composto cifrado, com inventário idêntico à visão exportada",
    async () =>
      temporarios(async (arquivo) => {
        const url = conexao(),
          fonte = postgres(url.href, { max: 1, prepare: false }),
          nome = `recreio_restore_${randomBytes(12).toString("hex")}`,
          copiaUrl = new URL(url);
        copiaUrl.pathname = `/${nome}`;
        let criada = false,
          copia: postgres.Sql | undefined;
        try {
          await fonte`create schema backup_qualificacao`;
          await fonte`create table backup_qualificacao.valores (id integer primary key, valor text not null)`;
          await fonte`insert into backup_qualificacao.valores values (1,'SINTETICO_ANTES_DA_VISAO')`;
          const dump = await arquivo("dump.bin"),
            banco = await arquivo("banco.bin"),
            composto = await arquivo("composto.bin"),
            cifrado = await arquivo("cifrado.bin"),
            aberto = await arquivo("aberto.bin"),
            restauracao = await arquivo("restauracao.bin");
          const container = criarArquivoComposto({
            limiteBytes: 32 * 1024 * 1024,
            limiteFotografiaBytes: 4096,
            tempoLimiteMs: 120_000,
          });
          const ref = await comCapturaConsistente(destino, async (c) => {
            const inventario = await inventariarBackup(c.origem);
            await fonte`insert into backup_qualificacao.valores values (2,'SINTETICO_DEPOIS_DA_VISAO')`;
            const resumo = await gravador(url).gravar(c, dump);
            expect(resumo.bytes).toBeGreaterThan(5);
            expect(resumo.sha256).toMatch(/^[a-f0-9]{64}$/);
            await banco.writeFile(JSON.stringify(inventario));
            await banco.sync();
            return container.montar(
              {
                capturaId: c.id,
                inventario: c.inventario,
                dump,
                inventarioBanco: banco,
                chaves: new Map(),
                objetos: (async function* () {
                  yield* [];
                })(),
              },
              composto,
              c.signal,
            );
          });
          const chave = randomBytes(32),
            codec = criarCifradorDeArquivos({
              chaveAtiva: "qualificacao",
              chaves: new Map([["qualificacao", chave]]),
              limiteBytes: 32 * 1024 * 1024,
              tempoLimiteMs: 120_000,
            });
          chave.fill(0);
          const envelope = await codec.cifrar(composto, cifrado, {
            tipo: "backup",
            id: ref.capturaId,
          });
          // As fontes locais não participam da recuperação.
          for (const h of [dump, banco, composto]) {
            await h.truncate(0);
            await h.sync();
          }
          await codec.abrir(cifrado, aberto, envelope);
          const acesso = await container.abrir(aberto, ref);
          try {
            const esperado = await acesso.lerInventarioBanco();
            await acesso.copiarDump(restauracao);
            await fonte.unsafe(`create database "${nome}" template template0`);
            criada = true;
            await restaurar(copiaUrl, restauracao);
            copia = postgres(copiaUrl.href, { max: 1, prepare: false });
            const voltou = await copia.begin(
              "isolation level repeatable read read only",
              inventariarBackup,
            );
            conferirInventarios(esperado, voltou);
            expect(await copia`select id from backup_qualificacao.valores order by id`).toEqual([
              { id: 1 },
            ]);
            expect(await fonte`select id from backup_qualificacao.valores order by id`).toEqual([
              { id: 1 },
              { id: 2 },
            ]);
            expect(esperado.tabelas.length).toBeGreaterThan(200);
          } finally {
            acesso.encerrar();
          }
        } finally {
          await copia?.end({ timeout: 5 });
          if (criada) await fonte.unsafe(`drop database "${nome}" with (force)`);
          await fonte`drop schema if exists backup_qualificacao cascade`;
          await fonte.end({ timeout: 5 });
        }
      }),
    120_000,
  );

  it("snapshot vencido falha e limpa a saída sem fechar o handle emprestado", async () =>
    temporarios(async (arquivo) => {
      const url = conexao(),
        h = await arquivo("vencido.bin"),
        g = gravador(url);
      const antiga = await comCapturaConsistente(destino, async (c) => c.snapshot);
      await expect(
        g.gravar({ snapshot: antiga, signal: new AbortController().signal }, h),
      ).rejects.toMatchObject({ codigo: "FERRAMENTA" });
      expect((await h.stat()).size).toBe(0);
      await h.write(Buffer.from("CONTINUA_ABERTO"), 0, 14, 0);
    }));
  it("limite interrompe a ferramenta e elimina o parcial", async () =>
    temporarios(async (arquivo) => {
      const h = await arquivo("limite.bin"),
        g = gravador(conexao(), 5);
      await expect(comCapturaConsistente(destino, (c) => g.gravar(c, h))).rejects.toMatchObject({
        codigo: "LIMITE",
      });
      expect((await h.stat()).size).toBe(0);
    }));
  it("cancelamento depois do primeiro bloco encerra o processo e limpa o arquivo", async () =>
    temporarios(async (arquivo) => {
      const h = await arquivo("cancelado.bin"),
        g = gravador(conexao()),
        cancelar = new AbortController();
      const observador = watch(`/proc/self/fd/${h.fd}`, () => cancelar.abort());
      try {
        await expect(
          comCapturaConsistente(destino, (c) =>
            g.gravar(
              { snapshot: c.snapshot, signal: AbortSignal.any([c.signal, cancelar.signal]) },
              h,
            ),
          ),
        ).rejects.toMatchObject({ codigo: "INTERROMPIDO" });
        expect(cancelar.signal.aborted).toBe(true);
        expect((await h.stat()).size).toBe(0);
      } finally {
        observador.close();
      }
    }));
  it("recusa destino ocupado e cancelamento prévio preservando o original", async () =>
    temporarios(async (arquivo) => {
      const h = await arquivo("ocupado.bin"),
        vazio = await arquivo("vazio.bin"),
        g = gravador(conexao());
      await h.writeFile("PRESERVAR");
      await comCapturaConsistente(destino, async (c) => {
        await expect(g.gravar(c, h)).rejects.toMatchObject({ codigo: "CONFIGURACAO" });
        const sinal = new AbortController();
        sinal.abort();
        await expect(
          g.gravar({ snapshot: c.snapshot, signal: sinal.signal }, vazio),
        ).rejects.toMatchObject({ codigo: "INTERROMPIDO" });
      });
      expect((await h.stat()).size).toBe(9);
      expect((await vazio.stat()).size).toBe(0);
    }));
});
