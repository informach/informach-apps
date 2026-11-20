import { randomBytes, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type postgres from "postgres";
import { criarArmazenamentoDoLivro } from "../../src/features/direitos/livro/armazenamento";
import {
  criarAssinaturaDoLivro,
  resumoDoRegistro,
} from "../../src/features/direitos/livro/assinatura";
import { FalhaDoLivroDeDireitos, RAIZ_VAZIA } from "../../src/features/direitos/livro/contrato";
import { admitirIntencaoNoLivro } from "../../src/features/direitos/livro/publicacao";
import { PlanoDeDireitosSchema } from "../../src/features/direitos/preparacao-contrato";
import { criarBucketDoLivro } from "../../test/livro-s3-apoio";
import { importarFontesHistoricasDeDireitos } from "./importar-fontes-direitos";
import { conferirInventarios, inventariarBackup } from "./inventario";
import { exigirBancoPrivadoDeRecuperacao } from "./normalizar-fotografias";

function exigir(v: unknown): asserts v {
  if (!v) throw new Error("Historical recovery source qualification failed");
}
/** Qualification only: closed HTTP/S3 protocol and genuine MAC storage
 * fixtures generated AFTER restore, not native adult consent or effect proof.
 * No original DB credentials, account creation, financial provider or traffic. */
export async function provarFontesHistoricasRecuperadas(
  copia: postgres.Sql,
  capturaSha256: string,
) {
  exigir(process.env.GITHUB_ACTIONS === "true" && process.env.CI === "true");
  await exigirBancoPrivadoDeRecuperacao(copia);
  const antes = await copia.begin("isolation level repeatable read read only", inventariarBackup),
    livroId = randomUUID(),
    contaAusente = randomUUID(),
    segredo = randomBytes(32),
    proximo = randomBytes(32),
    chaves = new Map([
      ["source-old", segredo],
      ["source-next", proximo],
    ]),
    assinatura = criarAssinaturaDoLivro({ livroId, chaveAtiva: "source-old", chaves }),
    nova = criarAssinaturaDoLivro({ livroId, chaveAtiva: "source-next", chaves }),
    http = await criarBucketDoLivro();
  const storage = criarArmazenamentoDoLivro({
    cliente: http.cliente,
    bucket: "recreio-fixture",
    assinatura,
    tempoLimiteMs: 2000,
  });
  const config = {
    copia,
    storage,
    assinatura: nova,
    capturaSha256,
    fonte: process.env.GITHUB_SHA ?? "",
    maxEntradas: 10,
    maxBytesPlanos: 65536,
    tempoLimiteMs: 30000,
  };
  try {
    const [conta] = await copia.unsafe("select id from core.users where id=$1", [contaAusente]);
    exigir(!conta);
    const [mundo] = await copia.unsafe<{ id: string; game_id: string }[]>(
      "select id,game_id from recreio.spaces order by id limit 1",
    );
    exigir(mundo);
    await storage.iniciarCabecalho(
      assinatura.assinarCabecalho({
        formato: "recreio-livro-direitos-v1",
        livroId,
        estado: "aberto",
        epoca: 0,
        chavesUtilizadas: ["source-old"],
        retomada: null,
        geracao: 0,
        entradas: 0,
        raizSha256: RAIZ_VAZIA,
        anteriorSha256: null,
        ultimaIntencao: null,
        atualizadoEm: "2026-11-20T10:00:00.000Z",
      }),
    );
    const planos = [0, 1].map(() =>
      PlanoDeDireitosSchema.parse({
        formato: "recreio-previa-direitos-v1",
        tipo: "retirar_perfil",
        contaId: contaAusente,
        perfis: [{ id: randomUUID(), tipo: "adult", versao: 1, responsabilidadeId: null }],
        mundos: [
          { id: mundo.id, jogo: mundo.game_id },
          { id: randomUUID(), jogo: mundo.game_id },
        ]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((m) => ({
            ...m,
            revisao: 0,
            diario: 0,
            gestao: 1,
            cerca: 0,
            estado: "hibernating",
            outrosParticipantes: 1,
          })),
        identidadeGlobalPreservada: true,
        financeiroSeparado: true,
      }),
    );
    for (const plano of planos) {
      const bytes = Buffer.from(JSON.stringify(plano));
      await admitirIntencaoNoLivro({
        storage,
        assinatura,
        plano: bytes,
        instante: "2026-11-20T10:01:00.000Z",
        bytes: assinatura.assinarIntencao({
          formato: "recreio-intencao-direitos-v1",
          livroId,
          operacaoId: randomUUID(),
          revisao: 1,
          epoca: 0,
          tipo: plano.tipo,
          contaId: contaAusente,
          perfilIds: plano.perfis.map((p) => p.id),
          planoSha256: resumoDoRegistro(bytes),
          consentidaEm: "2026-11-20T10:00:00.000Z",
          autenticadaEm: "2026-11-20T09:59:00.000Z",
          fonte: config.fonte,
        }),
      });
    }
    await storage.congelarCabecalho(await storage.lerCabecalho(), "2026-11-20T10:02:00.000Z");
    const ultimo = planos.at(-1);
    exigir(ultimo);
    const path = `/recreio-fixture/${storage.prefixo}planos/${resumoDoRegistro(Buffer.from(JSON.stringify(ultimo)))}.json`,
      guardado = http.objetos.get(path);
    exigir(guardado);
    http.objetos.delete(path);
    let rejeitou = false;
    try {
      await importarFontesHistoricasDeDireitos(config);
    } catch (e) {
      if (!(e instanceof FalhaDoLivroDeDireitos) || e.codigo !== "AUSENTE") throw e;
      rejeitou = true;
    }
    exigir(rejeitou);
    const [semEfeitos] = await copia.unsafe<{ n: number }[]>(
      "select count(*)::int as n from recreio.rights_recovery_runs where ledger_id=$1",
      [livroId],
    );
    exigir(semEfeitos?.n === 0);
    http.objetos.set(path, guardado);
    const primeira = await importarFontesHistoricasDeDireitos(config);
    const ler = () =>
      copia.unsafe<
        {
          operation_id: string;
          plan: unknown;
          world_map: {
            mundoReferencia: string;
            jogo: string;
            mundoVivoId: string | null;
          }[];
          instante: string;
        }[]
      >(
        `select operation_id,plan,world_map,imported_at::text as instante
        from recreio.rights_recovery_sources where ledger_id=$1 order by operation_id`,
        [livroId],
      );
    const fontes = await ler();
    exigir(
      fontes.length === 2 &&
        fontes.every(
          (f) =>
            f.world_map.length === 2 &&
            f.world_map.some((m) => m.mundoVivoId === mundo.id) &&
            f.world_map.some((m) => m.mundoVivoId === null),
        ),
    );
    const repetida = await importarFontesHistoricasDeDireitos(config);
    exigir(isDeepStrictEqual(primeira, repetida) && isDeepStrictEqual(fontes, await ler()));
    rejeitou = false;
    try {
      await importarFontesHistoricasDeDireitos({ ...config, capturaSha256: "0".repeat(64) });
    } catch (e) {
      if (!(e instanceof FalhaDoLivroDeDireitos) || e.codigo !== "INTEGRIDADE") throw e;
      rejeitou = true;
    }
    exigir(rejeitou && isDeepStrictEqual(fontes, await ler()));
    const fonte = fontes[0];
    exigir(fonte);
    await copia.unsafe(
      "update recreio.rights_recovery_sources set world_map='[]'::jsonb where operation_id=$1",
      [fonte.operation_id],
    );
    rejeitou = false;
    try {
      await importarFontesHistoricasDeDireitos(config);
    } catch (e) {
      if (!(e instanceof FalhaDoLivroDeDireitos) || e.codigo !== "INTEGRIDADE") throw e;
      rejeitou = true;
    }
    exigir(rejeitou);
    const [apos] = await copia.unsafe<{ world_map: unknown }[]>(
      "select world_map from recreio.rights_recovery_sources where operation_id=$1",
      [fonte.operation_id],
    );
    exigir(isDeepStrictEqual(apos?.world_map, []));
    const [nativas] = await copia.unsafe<{ n: number }[]>(
      "select count(*)::int as n from recreio.rights_operations where ledger_id=$1",
      [livroId],
    );
    const [identidades] = await copia.unsafe<{ n: number }[]>(
      "select count(*)::int as n from core.users where id=$1",
      [contaAusente],
    );
    exigir(
      nativas?.n === 0 &&
        identidades?.n === 0 &&
        !primeira.execucaoAutorizada &&
        !primeira.trafegoAutorizado,
    );
  } finally {
    try {
      await copia.begin(async (tx) => {
        await tx.unsafe("delete from recreio.rights_recovery_sources where ledger_id=$1", [
          livroId,
        ]);
        await tx.unsafe("delete from recreio.rights_recovery_runs where ledger_id=$1", [livroId]);
      });
      conferirInventarios(
        antes,
        await copia.begin("isolation level repeatable read read only", inventariarBackup),
      );
    } finally {
      assinatura.encerrar();
      nova.encerrar();
      segredo.fill(0);
      proximo.fill(0);
      await http.fechar();
    }
  }
  return {
    historicalSourcesImportedInPrivateCluster: true as const,
    historicalSourcePreflightVerified: true as const,
    historicalSourceIdempotenceVerified: true as const,
    historicalSourceDivergenceRefused: true as const,
    historicalSourceFixturesCleaned: true as const,
    historicalSourceEffectsExecuted: false as const,
  };
}
