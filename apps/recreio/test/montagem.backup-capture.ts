import { randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { expect, it } from "vitest";
import { comCapturaConsistente } from "@/features/backup/captura-repository";
import { criarColetorDeObjetosS3 } from "@/features/objetos/coleta-s3";
import { executarColeta } from "@/features/objetos/coleta-service";
import { criarCifradorDeObjetos } from "@/features/objetos/criptografia";
import { criarArmazenamentoPrivadoS3 } from "@/features/objetos/s3";
import { criarCifradorDeArquivos } from "../scripts/backup/arquivo-cifrado";
import { criarArquivoComposto } from "../scripts/backup/arquivo-composto";
import { criarTransporteDeArquivosS3 } from "../scripts/backup/arquivo-s3";
import { criarIndiceDeRecuperacao } from "../scripts/backup/indice-recuperacao";
import { criarArmazenamentoDoIndiceS3 } from "../scripts/backup/indice-s3";
import { conferirInventarios, inventariarBackup } from "../scripts/backup/inventario";
import { criarMontadorDaCaptura } from "../scripts/backup/montar-captura";
import { FalhaDaProva } from "../scripts/backup/provas-arquivos";
import {
  assumirPublicacao,
  liberarReservasPublicadas,
  prepararPublicacao,
} from "../scripts/backup/publicacao-repository";
import { publicarCapturaGuardada } from "../scripts/backup/publicar-captura";
import { prepararRetirada } from "../scripts/backup/retirada-repository";
import { criarRetiradaDoBackupS3 } from "../scripts/backup/retirada-s3";
import { retirarCapturaGuardada } from "../scripts/backup/retirar-captura";
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
        const source = process.env.GITHUB_SHA;
        if (!source) throw new Error("Fixture sem fonte Git");
        const tentativa = await prepararPublicacao({
          capturaId: ref.contexto.id,
          destino,
          source,
          arquivo: ref,
          composto: capturada.referencia,
        });
        await s3.admitirPrefixo("backup", ref.contexto.id);
        await transporte.enviar(ref, cifrado, readback);
        const conferido = await arquivo("publicacao-recuperado.bin"),
          abertoPublicacao = await arquivo("publicacao-aberto.bin");
        await fonte.unsafe(`create function audit.recusar_publicacao_guardada_teste() returns trigger language plpgsql as $$
          begin if new.event_type='recreio.backup_published' and new.payload->>'captureId'=TG_ARGV[0]
          then raise exception 'recusa sintetica'; end if; return new; end $$`);
        try {
          await fonte.unsafe(
            `create trigger recusar_publicacao_guardada_teste before insert on audit.events for each row execute function audit.recusar_publicacao_guardada_teste('${ref.contexto.id}')`,
          );
          await expect(
            publicarCapturaGuardada({
              tentativa,
              destino,
              transporte,
              cifrador: codec,
              composto: container,
              indice,
              indices,
              recuperado: conferido,
              aberto: abertoPublicacao,
            }),
          ).rejects.toMatchObject({ name: "AuditPersistenceError" });
          const [pendente] =
            await fonte`select state,index_body from recreio.backup_publications where capture_id=${ref.contexto.id}`;
          expect(pendente?.state).toBe("index_prepared");
          expect(
            (await indices.recuperar(ref.contexto.id)).bytes.equals(
              Buffer.from(pendente?.index_body),
            ),
          ).toBe(true);
          await expect(liberarReservasPublicadas(ref.contexto.id)).rejects.toMatchObject({
            codigo: "ESTADO",
          });
        } finally {
          await fonte.unsafe(
            "drop trigger if exists recusar_publicacao_guardada_teste on audit.events",
          );
          await fonte.unsafe("drop function audit.recusar_publicacao_guardada_teste()");
        }
        // Fonte local perdida, índice já existe, confirmação SQL não aconteceu.
        for (const h of [composto, cifrado, readback, conferido, abertoPublicacao]) {
          await h.truncate(0);
          await h.sync();
        }
        await fonte`update recreio.backup_publications set created_at=created_at-interval '1 day',lease_until=clock_timestamp()-interval '1 second' where capture_id=${ref.contexto.id}`;
        const retomada = await assumirPublicacao(ref.contexto.id);
        await publicarCapturaGuardada({
          tentativa: retomada,
          destino,
          transporte,
          cifrador: codec,
          composto: container,
          indice,
          indices,
          recuperado: conferido,
          aberto: abertoPublicacao,
        });
        expect(await liberarReservasPublicadas(ref.contexto.id)).toBe(1);
        expect(await liberarReservasPublicadas(ref.contexto.id)).toBe(0);
        const [controle] = await fonte`select c.state as captura,p.state as publicacao,
          (select count(*)::int from recreio.backup_object_holds h where h.capture_id=c.id and h.released_at is null) as ativas
          from recreio.backup_captures c join recreio.backup_publications p on p.capture_id=c.id where c.id=${ref.contexto.id}`;
        expect(controle).toEqual({ captura: "verified", publicacao: "published", ativas: 0 });
        await s3.confirmarPublicacaoDuravel(ref.contexto.id);
        await s3.confirmarArquivoPrivado(ref.contexto.id);
        const republicacao = await indices.recuperar(ref.contexto.id);
        await indices.publicar(republicacao.bytes, ref.contexto.id); // Replay pelo 412.
        for (const h of [conferido, abertoPublicacao]) {
          await h.truncate(0);
          await h.sync();
        }
        for (const h of [composto, cifrado, readback]) {
          await h.truncate(0);
          await h.sync();
        }
        // A fonte sintética volta a PG antes de retirar seu objeto redundante.
        // Só este fixture antecipa datas para homologar a carência sem esperar 24h.
        await fonte.begin(async (tx) => {
          await tx`select id from recreio.spaces where id=${mundoId} for update`;
          await tx`update recreio.snapshot_object_deliveries set snapshot_id=null,state='retiring',
            created_at=created_at-interval '2 days',detached_at=clock_timestamp()-interval '25 hours',
            next_attempt_at=clock_timestamp()-interval '1 hour',envelope=null,lease_token=null,lease_until=null where id=${entregaId}`;
          await tx`update recreio.space_snapshots set storage='pg',data=${original},object_key=null where id=${fotoId}`;
        });
        const coletor = criarColetorDeObjetosS3({
          cliente: s3.cliente,
          destino,
          tempoLimiteMs: 10000,
        });
        expect(await executarColeta(entregaId, destino, coletor)).toBe("retirada");
        const [retiradaNativa] =
          await fonte`select state,retired_at is not null as confirmada from recreio.snapshot_object_deliveries where id=${entregaId}`;
        expect(retiradaNativa).toEqual({ state: "retired", confirmada: true });
        await s3.confirmarAusenciaDaFoto(objectKey);
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
          const retirada = await prepararRetirada(ref.contexto.id, "retencao", indice),
            transporteDaRetirada = criarRetiradaDoBackupS3({
              cliente: s3.cliente,
              destino,
              indice,
              tempoLimiteMs: 10000,
            });
          await retirarCapturaGuardada({
            tentativa: retirada,
            indice,
            indices,
            transporte: transporteDaRetirada,
          });
          const [controleRetirado] =
            await fonte`select r.state as retirada,r.first_absence_at is not null as ausente,
            c.state as captura,c.verified_at is not null as verificada from recreio.backup_retirements r
            join recreio.backup_captures c on c.id=r.capture_id where c.id=${ref.contexto.id}`;
          expect(controleRetirado).toEqual({
            retirada: "absent",
            ausente: true,
            captura: "verified",
            verificada: true,
          });
          await s3.confirmarRetiradaDuravel(ref.contexto.id);
          await expect(indices.recuperar(ref.contexto.id)).rejects.toMatchObject({
            codigo: "RETIRADO",
          });
          await s3.concluir();
        } finally {
          acesso.encerrar();
        }
      } catch (erro) {
        await s3.registrarFalhaControlada(
          erro instanceof FalhaDaProva ? erro.codigo : "CAPTURA_INCONCLUSIVA",
        );
        throw erro;
      } finally {
        try {
          await copia?.end({ timeout: 5 });
          if (criada) await fonte.unsafe(`drop database "${nome}" with (force)`);
          if (fotoGravada) {
            await fonte`update recreio.snapshot_object_deliveries set snapshot_id=null,state=case when retired_at is null then 'retiring' else 'retired' end,detached_at=coalesce(detached_at,clock_timestamp()),envelope=null,lease_token=null,lease_until=null where id=${entregaId}`;
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
