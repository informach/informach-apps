import { createHash, randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { expect, it } from "vitest";
import { criarCifradorDeArquivos } from "../scripts/backup/arquivo-cifrado";
import { criarArquivoComposto } from "../scripts/backup/arquivo-composto";
import { criarTransporteDeArquivosS3 } from "../scripts/backup/arquivo-s3";
import { capturarEPublicarBackup } from "../scripts/backup/capturar-e-publicar";
import { comExecucaoExclusivaDoBackup } from "../scripts/backup/execucao-exclusiva";
import { criarIndiceDeRecuperacao } from "../scripts/backup/indice-recuperacao";
import { criarArmazenamentoDoIndiceS3 } from "../scripts/backup/indice-s3";
import { conferirInventarios, inventariarBackup } from "../scripts/backup/inventario";
import { criarMontadorDaCaptura } from "../scripts/backup/montar-captura";
import { prepararRetirada } from "../scripts/backup/retirada-repository";
import { criarRetiradaDoBackupS3 } from "../scripts/backup/retirada-s3";
import { retirarCapturaGuardada } from "../scripts/backup/retirar-captura";
import { novoJogador } from "./apoio";
import { conexao, restaurar, temporarios } from "./backup-arquivos-apoio";
import { mundoDe } from "./jogo-apoio";
import { criarBucketS3DeTeste } from "./objetos-s3-apoio";

it(
  "o executor publica e restaura só o arquivo guardado e recusa destinos/handles antes de escrever",
  async () =>
    temporarios(async (arquivo) => {
      const url = conexao(),
        fonte = postgres(url.href, { max: 1, prepare: false }),
        http = await criarBucketS3DeTeste();
      const destino = {
          bucketId: randomUUID(),
          bucketName: "recreio-fixture",
          escopo: "qualification" as const,
        },
        chave = randomBytes(32),
        chaves = new Map([["executor-v1", chave]]),
        indice = criarIndiceDeRecuperacao({ destino, chaveAtiva: "executor-v1", chaves });
      let copia: postgres.Sql | undefined,
        criada = false;
      const nome = `recreio_restore_${randomBytes(12).toString("hex")}`,
        copiaUrl = new URL(url);
      copiaUrl.pathname = `/${nome}`;
      try {
        const jogador = await novoJogador(),
          mundoId = await mundoDe(jogador),
          bytes = Buffer.from("CONTEUDO_OPACO_SINTETICO_DO_EXECUTOR");
        await fonte`insert into recreio.space_snapshots(space_id,revision,fence,schema_version,journal_seq,tick,kind,storage,data,byte_size,sha256)
        values(${mundoId},1,0,1,0,0,'checkpoint','pg',${bytes},${bytes.length},${createHash("sha256").update(bytes).digest("hex")})`;
        await fonte`update recreio.spaces set revision=1,schema_version=1 where id=${mundoId}`;
        const limites = {
            limiteBytes: 32 * 1024 * 1024,
            limiteFotografiaBytes: 4 * 1024 * 1024,
            tempoLimiteMs: 120000,
          },
          composto = criarArquivoComposto(limites),
          cifrador = criarCifradorDeArquivos({ ...limites, chaveAtiva: "executor-v1", chaves }),
          transporte = criarTransporteDeArquivosS3({
            cliente: http.cliente,
            bucket: destino.bucketName,
            cifrador,
            limiteBytesCifrados: limites.limiteBytes,
            tempoLimiteMs: 10000,
          }),
          indices = criarArmazenamentoDoIndiceS3({
            cliente: http.cliente,
            bucket: destino.bucketName,
            indice,
            tempoLimiteMs: 2000,
          }),
          montador = criarMontadorDaCaptura({
            ...limites,
            conexao: url.href,
            leitor: {
              destino,
              carregar: async () => {
                throw new Error("PG-only capture must not request a photo bucket");
              },
            },
          });
        const arquivos = {
          dump: await arquivo("dump.bin"),
          inventario: await arquivo("inventario.bin"),
          fotografia: await arquivo("fotografia.bin"),
          composto: await arquivo("composto.bin"),
          cifrado: await arquivo("cifrado.bin"),
          readback: await arquivo("readback.bin"),
          recuperado: await arquivo("recuperado.bin"),
          aberto: await arquivo("aberto.bin"),
        };
        const source = process.env.GITHUB_SHA;
        if (!source) throw new Error("Missing CI source");
        const resultado = await comExecucaoExclusivaDoBackup(
          { conexao: url.href, tempoLimiteMs: 120000 },
          async (execucao) => {
            const config = {
              execucao,
              origemObjetos: destino,
              destinoArquivo: destino,
              source,
              chavesFotografias: new Map<string, Uint8Array>(),
              montador,
              cifrador,
              composto,
              transporte,
              indice,
              indices,
              arquivos,
            };
            const contar = () => fonte`select count(*)::int as n from recreio.backup_captures`,
              antes = await contar();
            await expect(
              capturarEPublicarBackup({
                ...config,
                destinoArquivo: { ...destino, escopo: "production" },
              }),
            ).rejects.toMatchObject({ codigo: "CONFIGURACAO" });
            await expect(
              capturarEPublicarBackup({
                ...config,
                origemObjetos: { ...destino, escopo: "production" },
                destinoArquivo: { ...destino, escopo: "production" },
              }),
            ).rejects.toMatchObject({ codigo: "CONFIGURACAO" });
            const externo = await arquivo("preexistente.bin");
            await externo.writeFile("PRESERVAR_ARQUIVO");
            await externo.sync();
            await expect(
              capturarEPublicarBackup({ ...config, arquivos: { ...arquivos, cifrado: externo } }),
            ).rejects.toMatchObject({ codigo: "CONFIGURACAO" });
            const preservado = Buffer.alloc(17);
            await externo.read(preservado, 0, preservado.length, 0);
            expect(preservado.toString()).toBe("PRESERVAR_ARQUIVO");
            expect(await contar()).toEqual(antes);
            expect(http.pedidos).toHaveLength(0);
            const publicada = await capturarEPublicarBackup(config);
            expect(publicada.publicada).toBe(true);
            expect(publicada.reservasLiberadas).toBe(0);
            const [controle] =
              await fonte`select c.state as captura,p.state as publicacao,c.verified_at is not null as verificada
        from recreio.backup_captures c join recreio.backup_publications p on p.capture_id=c.id where c.id=${publicada.capturaId}`;
            expect(controle).toEqual({
              captura: "verified",
              publicacao: "published",
              verificada: true,
            });
            // Lose every local source/output. Recovery has only the authenticated
            // index, stored ciphertext and new empty handles, not in-memory refs.
            for (const h of Object.values(arquivos)) {
              await h.truncate(0);
              await h.sync();
            }
            const fria = await indices.recuperar(publicada.capturaId),
              recebido = await arquivo("recebido.bin"),
              aberto = await arquivo("decifrado.bin"),
              dump = await arquivo("restauracao.bin");
            await transporte.recuperar(fria.publicacao.arquivo, recebido);
            await cifrador.abrir(recebido, aberto, fria.publicacao.arquivo);
            const acesso = await composto.abrir(aberto, fria.publicacao.composto);
            try {
              await acesso.copiarDump(dump);
              const inventario = await acesso.lerInventarioBanco();
              await fonte.unsafe(`create database "${nome}" template template0`);
              criada = true;
              await restaurar(copiaUrl, dump);
              copia = postgres(copiaUrl.href, { max: 1, prepare: false });
              conferirInventarios(
                inventario,
                await copia.begin("isolation level repeatable read read only", inventariarBackup),
              );
              const [foto] =
                await copia`select data from recreio.space_snapshots where space_id=${mundoId} and revision=1`;
              expect(foto?.data).toEqual(bytes);
            } finally {
              acesso.encerrar();
            }
            // Immediate retirement is only the policy of this synthetic fixture.
            const tentativa = await prepararRetirada(publicada.capturaId, "retencao", indice);
            await retirarCapturaGuardada({
              tentativa,
              indice,
              indices,
              transporte: criarRetiradaDoBackupS3({
                cliente: http.cliente,
                destino,
                indice,
                tempoLimiteMs: 10000,
              }),
            });
            await expect(indices.recuperar(publicada.capturaId)).rejects.toMatchObject({
              codigo: "RETIRADO",
            });
            expect(http.pedidos.some((p) => p.metodo === "PUT" && p.condicao === "*")).toBe(true);
          },
        );
        expect(resultado.situacao).toBe("executada");
      } finally {
        try {
          await copia?.end({ timeout: 5 });
          if (criada) await fonte.unsafe(`drop database "${nome}" with (force)`);
        } finally {
          indice.encerrar();
          chave.fill(0);
          await Promise.all([fonte.end({ timeout: 5 }), http.fechar()]);
        }
      }
    }),
  120000,
);
