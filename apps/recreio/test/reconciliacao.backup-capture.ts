import { db, sql } from "@informach/db";
import { expect, it } from "vitest";
import { criarCifradorDeArquivos } from "../scripts/backup/arquivo-cifrado";
import { criarArquivoComposto } from "../scripts/backup/arquivo-composto";
import { criarTransporteDeArquivosS3 } from "../scripts/backup/arquivo-s3";
import { comExecucaoExclusivaDoBackup } from "../scripts/backup/execucao-exclusiva";
import { criarArmazenamentoDoIndiceS3 } from "../scripts/backup/indice-s3";
import { prepararPublicacao } from "../scripts/backup/publicacao-repository";
import { reconciliarPublicacaoDoBackup } from "../scripts/backup/reconciliar-publicacao";
import { criarRetiradaDoBackupS3 } from "../scripts/backup/retirada-s3";
import { conexao, temporarios } from "./backup-arquivos-apoio";
import { expirar, fixture } from "./backup-publicacao-apoio";
import { criarBucketS3DeTeste } from "./objetos-s3-apoio";

async function cenario(tipo: "ausente" | "negado" | "bucket_ausente" | "corrompido") {
  return temporarios(async (arquivo) => {
    // Native control/MAC fixture, not a claim of a complete original dump.
    // The present-archive case is covered by the full cold capture proof.
    const f = await fixture("qualification", 1),
      http = await criarBucketS3DeTeste(),
      chave = Buffer.alloc(32, 7);
    try {
      const limites = {
          limiteBytes: 1024 * 1024,
          limiteFotografiaBytes: 1024,
          tempoLimiteMs: 10000,
        },
        cifrador = criarCifradorDeArquivos({
          ...limites,
          chaveAtiva: "v1",
          chaves: new Map([["v1", chave]]),
        }),
        original = await arquivo("original.bin"),
        cifrado = await arquivo("cifrado.bin");
      await original.writeFile("METADADO_SINTETICO");
      await original.sync();
      const ref = await cifrador.cifrar(original, cifrado, { tipo: "backup", id: f.id }),
        composto = { ...f.composto, bytes: ref.bytes, sha256: ref.sha256 };
      await prepararPublicacao({ ...f.config, arquivo: ref, composto });
      await expirar(f.id); // Only the synthetic control lease, not consent/record dates.
      const indices = criarArmazenamentoDoIndiceS3({
          cliente: http.cliente,
          bucket: f.destino.bucketName,
          indice: f.indice,
          tempoLimiteMs: 2000,
        }),
        transporte = criarTransporteDeArquivosS3({
          cliente: http.cliente,
          bucket: f.destino.bucketName,
          cifrador,
          limiteBytesCifrados: limites.limiteBytes,
          tempoLimiteMs: 2000,
        });
      const path = `/${f.destino.bucketName}/recreio/v1/backup/${f.id}/${ref.sha256Cifrado}`;
      if (tipo === "negado") http.estado.negar = true;
      if (tipo === "bucket_ausente") http.estado.bucketAusente = true;
      if (tipo === "corrompido") {
        const bytes = Buffer.alloc(ref.bytesCifrados);
        await cifrado.read(bytes, 0, bytes.length, 0);
        bytes.writeUInt8(bytes.readUInt8(bytes.length - 1) ^ 1, bytes.length - 1);
        http.objetos.set(path, bytes);
      }
      const publicacao = {
        destino: f.destino,
        transporte,
        cifrador,
        composto: criarArquivoComposto(limites),
        indice: f.indice,
        indices,
        recuperado: await arquivo("recuperado.bin"),
        aberto: await arquivo("aberto.bin"),
      };
      const executar = () =>
        comExecucaoExclusivaDoBackup(
          { conexao: conexao().href, tempoLimiteMs: 15000 },
          (execucao) =>
            reconciliarPublicacaoDoBackup({
              execucao,
              capturaId: f.id,
              publicacao,
              retirada: criarRetiradaDoBackupS3({
                cliente: http.cliente,
                destino: f.destino,
                indice: f.indice,
                tempoLimiteMs: 2000,
              }),
            }),
        );
      if (tipo === "ausente") {
        expect(await executar()).toEqual({
          situacao: "executada",
          valor: { situacao: "ausencia_confirmada", capturaId: f.id, reservasLiberadas: 1 },
        });
        const [r] = await db.execute<{
          state: string;
          ausente: boolean;
          ativas: number;
        }>(sql`select c.state,
          r.first_absence_at is not null as ausente,(select count(*)::int from recreio.backup_object_holds h
            where h.capture_id=c.id and h.released_at is null) as ativas
          from recreio.backup_captures c join recreio.backup_retirements r on r.capture_id=c.id where c.id=${f.id}`);
        expect(r).toEqual({ state: "abandoned", ausente: true, ativas: 0 });
        // An old PUT finishes late. The immutable retirement remains
        // authoritative even if ciphertext reappears after first absence.
        const tarde = Buffer.alloc(ref.bytesCifrados);
        await cifrado.read(tarde, 0, tarde.length, 0);
        http.objetos.set(path, tarde);
        await expect(indices.recuperar(f.id)).rejects.toMatchObject({ codigo: "RETIRADO" });
        expect(
          http.pedidos.some(
            (p) =>
              p.metodo === "PUT" &&
              new URL(p.url, "http://fixture").pathname.endsWith("/retirado.json"),
          ),
        ).toBe(true);
      } else {
        await expect(executar()).rejects.toBeInstanceOf(Error);
        const [r] = await db.execute<{
          state: string;
          retiradas: number;
          ativas: number;
        }>(sql`select c.state,
          (select count(*)::int from recreio.backup_retirements r where r.capture_id=c.id) as retiradas,
          (select count(*)::int from recreio.backup_object_holds h where h.capture_id=c.id and h.released_at is null) as ativas
          from recreio.backup_captures c where c.id=${f.id}`);
        expect(r).toEqual({ state: "sealed", retiradas: 0, ativas: 1 });
        expect(http.pedidos.every((p) => p.metodo === "GET")).toBe(true);
      }
    } finally {
      f.indice.encerrar();
      chave.fill(0);
      await http.fechar();
    }
  });
}

it("GET NoSuchKey exige tombstone e ausência antes de liberar; PUT tardio não ressuscita o arquivo", () =>
  cenario("ausente"));
it("acesso negado conserva arquivo incerto/reservas, sem retirada", () => cenario("negado"));
it("bucket ausente não vira prova de ausência do arquivo", () => cenario("bucket_ausente"));
it("ciphertext corrompido não vira prova de ausência do arquivo", () => cenario("corrompido"));
