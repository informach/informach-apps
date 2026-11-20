import { isDeepStrictEqual } from "node:util";
import { S3Client } from "@aws-sdk/client-s3";
import { configuracaoDaRecuperacaoDoBackup } from "../../src/lib/backup-recovery-environment";
import { criarCifradorDeArquivos } from "./arquivo-cifrado";
import { criarArquivoComposto } from "./arquivo-composto";
import { criarTransporteDeArquivosS3 } from "./arquivo-s3";
import { comArquivosPrivadosDoBackup } from "./arquivos-privados";
import { atualizarCopiaPrivada } from "./atualizar-copia-privada";
import { comBancoRestaurado } from "./cluster-isolado";
import { criarIndiceDeRecuperacao } from "./indice-recuperacao";
import { criarArmazenamentoDoIndiceS3 } from "./indice-s3";
import { limitarClienteALeituraDaCaptura } from "./leitura-s3";
import { normalizarFotografiasRestauradas } from "./normalizar-fotografias";

let fase: "configuracao" | "arquivo" | "restauracao" | "encerramento" = "configuracao";
async function main() {
  if (process.argv.length !== 2 || process.platform !== "linux")
    throw new Error("RECOVERY_EXECUTION_NOT_ADMITTED");
  const config = configuracaoDaRecuperacaoDoBackup(process.env);
  if (!config) {
    console.log(JSON.stringify({ formato: "recreio-backup-recuperacao-v1", modo: "off" }));
    return;
  }
  const { arquivo } = config;
  let cliente: S3Client | undefined;
  let indice: ReturnType<typeof criarIndiceDeRecuperacao> | undefined;
  let resultado: { ok: true; valor: unknown } | { ok: false; erro: unknown; fase: typeof fase };
  try {
    fase = "arquivo";
    cliente = new S3Client({
      endpoint: arquivo.endpoint,
      region: arquivo.region,
      forcePathStyle: arquivo.pathStyle,
      credentials: { accessKeyId: arquivo.accessKeyId, secretAccessKey: arquivo.secretAccessKey },
      maxAttempts: 1,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    const destino = {
      bucketId: arquivo.bucketId,
      bucketName: arquivo.bucketName,
      escopo: arquivo.escopo,
    };
    const leitura = limitarClienteALeituraDaCaptura(cliente, {
      bucket: destino.bucketName,
      capturaId: config.capturaId,
    });
    indice = criarIndiceDeRecuperacao({
      destino,
      chaveAtiva: arquivo.chaveAtiva,
      chaves: arquivo.chaves,
    });
    const indices = criarArmazenamentoDoIndiceS3({
      cliente,
      bucket: destino.bucketName,
      indice,
      tempoLimiteMs: 10000,
    });
    const limites = {
      limiteBytes: config.limiteBytes,
      limiteFotografiaBytes: config.limiteFotografiaBytes,
      tempoLimiteMs: config.tempoLimiteMs,
    };
    const codec = criarCifradorDeArquivos({
      ...limites,
      chaveAtiva: arquivo.chaveAtiva,
      chaves: arquivo.chaves,
    });
    const composto = criarArquivoComposto(limites);
    const transporte = criarTransporteDeArquivosS3({
      cliente,
      bucket: destino.bucketName,
      cifrador: codec,
      limiteBytesCifrados: config.limiteBytes + 65536,
      tempoLimiteMs: 10000,
    });
    const sinal = AbortSignal.timeout(config.tempoLimiteMs);
    const valor = await comArquivosPrivadosDoBackup(async (files) => {
      const fria = await indices.recuperar(config.capturaId);
      await transporte.recuperar(fria.publicacao.arquivo, files.cifrado);
      await codec.abrir(files.cifrado, files.aberto, fria.publicacao.arquivo, sinal);
      const acesso = await composto.abrir(files.aberto, fria.publicacao.composto, sinal);
      try {
        await acesso.copiarDump(files.dump, sinal);
        const inventario = await acesso.lerInventarioBanco(sinal);
        const rodadas: {
          indice: number;
          recibosAntes: number;
          recibosDepois: number;
          migrationsAplicadas: number;
          recibosOriginaisPreservados: boolean;
          inventarioConferidoAntesDoUpgrade: boolean;
          clusterRemovido: boolean;
        }[] = [];
        for (let n = 1; n <= config.rodadas; n++) {
          sinal.throwIfAborted();
          fase = "restauracao";
          const conferencias: Awaited<ReturnType<typeof atualizarCopiaPrivada>>[] = [];
          const restauracao = await comBancoRestaurado(
            { dump: files.dump, inventario, signal: sinal },
            async (copia) => {
              const upgrade = await atualizarCopiaPrivada({
                copia,
                inventarioOriginal: inventario,
              });
              await normalizarFotografiasRestauradas({
                copia,
                acesso,
                fotografia: files.fotografia,
                inventario: fria.publicacao.inventario,
              });
              conferencias.push(upgrade);
            },
          );
          const [upgrade] = conferencias;
          if (conferencias.length !== 1 || !upgrade || !restauracao.temporariosRemovidos)
            throw new Error("PRIVATE_RESTORE_NOT_CONFIRMED");
          sinal.throwIfAborted();
          // A concurrent retention/privacy tombstone must also be respected
          // after the private effects, before recording a successful rehearsal.
          const atual = await indices.recuperar(config.capturaId);
          if (!isDeepStrictEqual(atual.publicacao, fria.publicacao))
            throw new Error("RESTORE_INDEX_CHANGED");
          rodadas.push({
            indice: n,
            recibosAntes: upgrade.receiptsBefore,
            recibosDepois: upgrade.receiptsAfter,
            migrationsAplicadas: upgrade.migrationsApplied,
            recibosOriginaisPreservados: upgrade.originalMigrationReceiptsPreserved,
            inventarioConferidoAntesDoUpgrade: upgrade.inventoryComparedBeforeUpgrade,
            clusterRemovido: true,
          });
        }
        return {
          capturaId: config.capturaId,
          sourceDoArquivo: fria.publicacao.source,
          rodadas,
          sourceDatabaseCredentialsPresent: false,
          backupClientOnlySelectedCaptureRead: true,
          backupReadRequests: leitura.requisicoes(),
          authoritiesNormalizedForTraffic: false,
          trafficAuthorized: false,
        };
      } finally {
        acesso.encerrar();
      }
    });
    resultado = { ok: true, valor };
  } catch (erro) {
    resultado = { ok: false, erro, fase };
  }
  fase = "encerramento";
  const encerramentos = await Promise.allSettled([
    Promise.resolve().then(() => indice?.encerrar()),
    Promise.resolve().then(() => cliente?.destroy()),
  ]);
  for (const key of arquivo.chaves.values()) key.fill(0);
  const falhas = encerramentos.filter((r) => r.status === "rejected");
  if (falhas.length)
    throw new AggregateError(
      [...falhas.map((r) => r.reason), ...(!resultado.ok ? [resultado.erro] : [])],
      "PRIVATE_RECOVERY_CLEANUP_FAILED",
    );
  if (!resultado.ok) {
    fase = resultado.fase;
    throw resultado.erro;
  }
  console.log(
    JSON.stringify({
      formato: "recreio-backup-recuperacao-v1",
      ok: true,
      localCleanupConfirmed: true,
      resultado: resultado.valor,
    }),
  );
}
void main().catch(() => {
  console.error(
    JSON.stringify({
      formato: "recreio-backup-recuperacao-v1",
      ok: false,
      fase,
      codigo: "RECUPERACAO_NAO_CONFIRMADA",
    }),
  );
  process.exitCode = 1;
});
