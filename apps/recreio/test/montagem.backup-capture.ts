import { randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { expect, it } from "vitest";
import { comCapturaConsistente } from "@/features/backup/captura-repository";
import { criarCifradorDeObjetos } from "@/features/objetos/criptografia";
import { criarArmazenamentoPrivadoS3 } from "@/features/objetos/s3";
import { criarCifradorDeArquivos } from "../scripts/backup/arquivo-cifrado";
import { criarArquivoComposto } from "../scripts/backup/arquivo-composto";
import { criarTransporteDeArquivosS3 } from "../scripts/backup/arquivo-s3";
import { criarIndiceDeRecuperacao } from "../scripts/backup/indice-recuperacao";
import { criarArmazenamentoDoIndiceS3 } from "../scripts/backup/indice-s3";
import { conferirInventarios, inventariarBackup } from "../scripts/backup/inventario";
import { criarMontadorDaCaptura } from "../scripts/backup/montar-captura";
import { novoJogador } from "./apoio";
import { conexao, restaurar, temporarios } from "./backup-arquivos-apoio";
import { provarClusterFrio } from "./backup-cluster-frio-apoio";
import { criarBucketDaMontagem } from "./backup-provider-apoio";
import { mundoDe } from "./jogo-apoio";

it(
  "recupera SQL e fotografia apenas pelo índice e arquivo guardados, sem fontes locais ou objeto vivo",
  async () =>
    temporarios(async (arquivo) => {
      const url = conexao(),
        fonte = postgres(url.href, { max: 1, prepare: false }),
        s3 = await criarBucketDaMontagem();
      const destino = s3.destino,
        mundoId = await mundoDe(await novoJogador()),
        fotoId = randomUUID(),
        entregaId = randomUUID(),
        original = Buffer.from("FOTOGRAFIA_SINTETICA_AUTOSSUFICIENTE"),
        chaveFoto = randomBytes(32),
        chaveBackup = randomBytes(32),
        chaves = new Map([["foto-v1", chaveFoto]]),
        mestre = new Map([["backup-v2", chaveBackup]]),
        indice = criarIndiceDeRecuperacao({ destino, chaveAtiva: "backup-v2", chaves: mestre });
      const nome = `recreio_restore_${randomBytes(12).toString("hex")}`,
        copiaUrl = new URL(url);
      copiaUrl.pathname = `/${nome}`;
      let criada = false,
        fotoGravada = false,
        copia: postgres.Sql | undefined;
      try {
        const fotos = criarArmazenamentoPrivadoS3({
            cliente: s3.cliente,
            bucket: destino.bucketName,
            cifrador: criarCifradorDeObjetos({ chaveAtiva: "foto-v1", chaves, limiteBytes: 4096 }),
            tempoLimiteMs: 2000,
          }),
          preparado = criarCifradorDeObjetos({
            chaveAtiva: "foto-v1",
            chaves,
            limiteBytes: 4096,
          }).cifrar({ tipo: "fotografia", id: mundoId }, original),
          r = preparado.referencia;
        await s3.admitirPrefixo("fotografia", mundoId);
        await fotos.enviar(preparado);
        const objectKey = `recreio/v1/fotografia/${mundoId}/${r.sha256Cifrado}`;
        await fonte`insert into recreio.space_snapshots (id,space_id,revision,fence,schema_version,journal_seq,tick,kind,storage,data,object_key,byte_size,sha256)
      values (${fotoId},${mundoId},1,0,1,0,0,'checkpoint','bucket',null,${objectKey},${r.bytes},${r.sha256})`;
        fotoGravada = true;
        await fonte`insert into recreio.snapshot_object_deliveries (id,snapshot_reference,snapshot_id,space_id,plaintext_sha256,plaintext_bytes,storage_scope,bucket_id,bucket_name,object_key,cipher_sha256,cipher_bytes,encryption_key_id,state,verified_at)
      values (${entregaId},${fotoId},${fotoId},${mundoId},${r.sha256},${r.bytes},'qualification',${destino.bucketId},${destino.bucketName},${objectKey},${r.sha256Cifrado},${r.bytesCifrados},${r.chaveId},'verified',clock_timestamp())`;
        const dump = await arquivo("dump.bin"),
          inventario = await arquivo("inventario.bin"),
          fotografia = await arquivo("fotografia.bin"),
          composto = await arquivo("composto.bin"),
          cifrado = await arquivo("cifrado.bin"),
          readback = await arquivo("readback.bin"),
          recuperado = await arquivo("recuperado.bin"),
          aberto = await arquivo("aberto.bin"),
          restauracao = await arquivo("restauracao.bin"),
          fotoRecuperada = await arquivo("foto-recuperada.bin");
        const limites = {
            limiteBytes: 32 * 1024 * 1024,
            limiteFotografiaBytes: 4096,
            tempoLimiteMs: 120_000,
          },
          container = criarArquivoComposto(limites),
          montador = criarMontadorDaCaptura({
            ...limites,
            conexao: url.href,
            leitor: {
              destino,
              carregar: (o, signal) => fotos.recuperarEnvelope(o.referencia, signal),
            },
          });
        const capturada = await comCapturaConsistente(destino, async (c) => {
          const pedidos = s3.pedidos.length;
          await expect(
            montador.montar(c, { dump, inventario, fotografia, composto }, new Map()),
          ).rejects.toMatchObject({ codigo: "CONFIGURACAO" });
          expect(s3.pedidos).toHaveLength(pedidos);
          return {
            referencia: await montador.montar(
              c,
              { dump, inventario, fotografia, composto },
              chaves,
            ),
            inventario: { ...c.inventario },
          };
        });
        expect(capturada.inventario.quantidade).toBe(1);
        for (const h of [dump, inventario, fotografia]) expect((await h.stat()).size).toBe(0);
        const codec = criarCifradorDeArquivos({
            ...limites,
            chaveAtiva: "backup-v2",
            chaves: mestre,
          }),
          ref = await codec.cifrar(composto, cifrado, {
            tipo: "backup",
            id: capturada.referencia.capturaId,
          }),
          transporte = criarTransporteDeArquivosS3({
            cliente: s3.cliente,
            bucket: destino.bucketName,
            cifrador: codec,
            limiteBytesCifrados: limites.limiteBytes,
            tempoLimiteMs: 120_000,
          }),
          indices = criarArmazenamentoDoIndiceS3({
            cliente: s3.cliente,
            bucket: destino.bucketName,
            indice,
            tempoLimiteMs: 2000,
          });
        await s3.admitirPrefixo("backup", ref.contexto.id);
        await transporte.enviar(ref, cifrado, readback);
        const publicacao = indice.assinar({
          tipo: "publicado",
          capturaId: ref.contexto.id,
          destino,
          source: process.env.GITHUB_SHA,
          iniciadaEm: "2026-11-19T00:00:00.000Z",
          conferidaEm: "2026-11-19T00:01:00.000Z",
          arquivo: ref,
          composto: capturada.referencia,
          inventario: capturada.inventario,
        });
        await indices.publicar(publicacao, ref.contexto.id);
        await indices.publicar(publicacao, ref.contexto.id); // Replay pelo 412 e leitura integral.
        for (const h of [composto, cifrado, readback]) {
          await h.truncate(0);
          await h.sync();
        }
        // Perda da fonte sintética após guardar o arquivo, não coletor de produção.
        await s3.removerFoto(objectKey);
        const inicioDaRecuperacao = s3.pedidos.length;
        const fria = await indices.recuperar(ref.contexto.id);
        await transporte.recuperar(fria.publicacao.arquivo, recuperado);
        await codec.abrir(recuperado, aberto, fria.publicacao.arquivo);
        const acesso = await container.abrir(aberto, fria.publicacao.composto);
        try {
          await acesso.copiarDump(restauracao);
          const esperado = await acesso.lerInventarioBanco();
          await fonte.unsafe(`create database "${nome}" template template0`);
          criada = true;
          await restaurar(copiaUrl, restauracao);
          copia = postgres(copiaUrl.href, { max: 1, prepare: false });
          conferirInventarios(
            esperado,
            await copia.begin("isolation level repeatable read read only", inventariarBackup),
          );
          await acesso.comChaves(async (recuperadas) => {
            const abridor = criarCifradorDeObjetos({
              chaveAtiva: "foto-v1",
              chaves: recuperadas,
              limiteBytes: 4096,
            });
            let n = 0;
            for await (const item of acesso.objetos()) {
              await item.copiarPara(fotoRecuperada);
              const envelope = await fotoRecuperada.readFile(),
                conteudo = abridor.abrir(item.objeto.referencia, envelope);
              try {
                expect(conteudo.equals(original)).toBe(true);
                expect(item.objeto.fotografiaId).toBe(fotoId);
              } finally {
                envelope.fill(0);
                conteudo.fill(0);
              }
              n++;
            }
            expect(n).toBe(1);
          });
          expect(
            s3.pedidos
              .slice(inicioDaRecuperacao)
              .every((p) => p.metodo === "GET" && p.url.includes(`/backup/${ref.contexto.id}/`)),
          ).toBe(true);
          const frio = await provarClusterFrio(ref.contexto.id, mestre, "backup-v2");
          await s3.confirmarClusterFrio(frio);
          const retirada = indice.assinar({
            tipo: "retirado",
            capturaId: ref.contexto.id,
            destino,
            source: process.env.GITHUB_SHA,
            registradaEm: "2026-11-19T00:02:00.000Z",
            arquivoSha256Cifrado: ref.sha256Cifrado,
            motivo: "retencao",
          });
          await indices.registrarRetirada(retirada, ref.contexto.id);
          await expect(indices.recuperar(ref.contexto.id)).rejects.toMatchObject({
            codigo: "RETIRADO",
          });
          await s3.concluir();
        } finally {
          acesso.encerrar();
        }
      } finally {
        try {
          await copia?.end({ timeout: 5 });
          if (criada) await fonte.unsafe(`drop database "${nome}" with (force)`);
          if (fotoGravada) {
            await fonte`update recreio.snapshot_object_deliveries set snapshot_id=null,state='retiring',detached_at=clock_timestamp(),envelope=null,lease_token=null,lease_until=null where id=${entregaId}`;
            await fonte`update recreio.space_snapshots set storage='pg',data=${original},object_key=null where id=${fotoId}`;
          }
        } finally {
          indice.encerrar();
          chaveFoto.fill(0);
          chaveBackup.fill(0);
          const encerramentos = await Promise.allSettled([fonte.end({ timeout: 5 }), s3.fechar()]);
          expect(encerramentos.every((r) => r.status === "fulfilled")).toBe(true);
        }
      }
    }),
  process.env.RECREIO_BACKUP_FRESH_CLUSTER_PROBE === "1" ? 360_000 : 120_000,
);
