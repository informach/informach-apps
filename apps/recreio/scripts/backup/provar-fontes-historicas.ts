import { randomBytes, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { eq, sql } from "@informach/db";
import { recreioRightsRecoverySources as sources } from "@informach/db/schema";
import type postgres from "postgres";
import { concluirProximaRetirada } from "../../src/features/direitos/conclusao-repository";
import {
  bancoDaCoordenacao,
  comCoordenacaoPrivadaDeDireitos,
  reconferirCoordenacaoDeDireitos,
} from "../../src/features/direitos/coordenacao-repository";
import { retirarProximosDadosPessoais } from "../../src/features/direitos/dados-retirada-repository";
import { concluirProximaDrenagem } from "../../src/features/direitos/drenagem-repository";
import {
  compactarDiarioDeDireitos,
  reservarFotografiaDeDireitos,
} from "../../src/features/direitos/fotografias-repository";
import { criarArmazenamentoDoLivro } from "../../src/features/direitos/livro/armazenamento";
import {
  criarAssinaturaDoLivro,
  resumoDoRegistro,
} from "../../src/features/direitos/livro/assinatura";
import { FalhaDoLivroDeDireitos, RAIZ_VAZIA } from "../../src/features/direitos/livro/contrato";
import { conferirPrefixoDoLivro } from "../../src/features/direitos/livro/leitura";
import { admitirIntencaoNoLivro } from "../../src/features/direitos/livro/publicacao";
import { minimizarProximoPerfil } from "../../src/features/direitos/minimizacao-repository";
import { PlanoDeDireitosSchema } from "../../src/features/direitos/preparacao-contrato";
import { prepararRecuperacaoDeDireitos } from "../../src/features/direitos/recuperacao-diario-repository";
import { expurgarProximaReferencia } from "../../src/features/direitos/referencias-retidas-repository";
import { AppError } from "../../src/lib/errors";
import { criarBucketDoLivro } from "../../test/livro-s3-apoio";
import { processarFotografiaNaCoordenacao } from "../direitos/fotografias";
import { recuperarDiarioNaCoordenacao } from "../direitos/recuperacao";
import { comConexaoPrivadaDeDireitos } from "./conexao-direitos";
import { importarFontesHistoricasDeDireitos } from "./importar-fontes-direitos";
import { conferirInventarios, inventariarBackup } from "./inventario";
import { exigirBancoPrivadoDeRecuperacao } from "./normalizar-fotografias";
import { prepararProvaDeAdmissaoHistorica } from "./provar-admissao-historica";
import { provarPrazoDaCoordenacao } from "./provar-prazo-coordenacao";

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
  exigir(
    !process.env.DATABASE_URL &&
      !process.env.BETTER_AUTH_SECRET &&
      !process.env.SENDGRID_API_KEY &&
      !process.env.STRIPE_SECRET_KEY,
  );
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
  let limparAdmissao: (() => Promise<void>) | undefined;
  try {
    const [conta] = await copia.unsafe("select id from core.users where id=$1", [contaAusente]);
    exigir(!conta);
    const [mundo] = await copia.unsafe<{ id: string; game_id: string }[]>(
      "select id,game_id from recreio.spaces order by id limit 1",
    );
    exigir(mundo);
    const admissao = await prepararProvaDeAdmissaoHistorica(copia, contaAusente),
      instante = new Date().toISOString();
    limparAdmissao = admissao.limpar;
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
        atualizadoEm: instante,
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
    planos.push(admissao.plano);
    for (const plano of planos) {
      const bytes = Buffer.from(JSON.stringify(plano));
      await admitirIntencaoNoLivro({
        storage,
        assinatura,
        plano: bytes,
        instante,
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
          consentidaEm: instante,
          autenticadaEm: instante,
          fonte: config.fonte,
        }),
      });
    }
    await storage.congelarCabecalho(await storage.lerCabecalho(), instante);
    const configComum = {
      assinatura,
      prova: await conferirPrefixoDoLivro({ storage, maxEntradas: 10, tempoLimiteMs: 10000 }),
    };
    const executores = [
      minimizarProximoPerfil,
      retirarProximosDadosPessoais,
      concluirProximaDrenagem,
      expurgarProximaReferencia,
      concluirProximaRetirada,
    ];
    for (const executar of [
      ...executores,
      reservarFotografiaDeDireitos,
      compactarDiarioDeDireitos,
      prepararRecuperacaoDeDireitos,
    ]) {
      let bloqueou = false;
      try {
        await executar(configComum);
      } catch (e) {
        if (!(e instanceof AppError) || e.code !== "DIREITOS_LIVRO") throw e;
        bloqueou = true;
      }
      exigir(bloqueou);
    }
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
      fontes.length === planos.length &&
        fontes.every((f) =>
          isDeepStrictEqual(f.plan, admissao.plano)
            ? f.world_map.length === 0
            : f.world_map.length === 2 &&
              f.world_map.some((m) => m.mundoVivoId === mundo.id) &&
              f.world_map.some((m) => m.mundoVivoId === null),
        ),
    );
    const repetida = await importarFontesHistoricasDeDireitos(config);
    exigir(isDeepStrictEqual(primeira, repetida) && isDeepStrictEqual(fontes, await ler()));
    const causa = new Error("Private native transaction rollback qualification");
    const emprestada = await comConexaoPrivadaDeDireitos(copia, async (banco) => {
      const nativas = await banco
        .select()
        .from(sources)
        .where(eq(sources.runId, primeira.execucaoId));
      exigir(
        nativas.length === planos.length &&
          nativas.every((f) => planos.some((p) => isDeepStrictEqual(f.plan, p))),
      );
      let reverteu = false;
      try {
        await banco.transaction(async (tx) => {
          await tx
            .update(sources)
            .set({ worldMap: [] })
            .where(eq(sources.runId, primeira.execucaoId));
          throw causa;
        });
      } catch (e) {
        if (e !== causa) throw e;
        reverteu = true;
      }
      exigir(reverteu && isDeepStrictEqual(fontes, await ler()));
      const parametros = {
        banco,
        execucaoId: primeira.execucaoId,
        capturaSha256,
        fonte: config.fonte,
        assinatura: nova,
        storage,
        maxEntradas: 10,
        maxBytesPlanos: 65536,
        tempoLimiteMs: 30000,
      };
      let admitiuDivergente = false,
        recusou = false;
      try {
        await comCoordenacaoPrivadaDeDireitos({
          ...parametros,
          capturaSha256: "0".repeat(64),
          executar: async () => {
            admitiuDivergente = true;
          },
        });
      } catch (e) {
        if (!(e instanceof AppError) || e.code !== "DIREITOS_INTEGRIDADE") throw e;
        recusou = true;
      }
      exigir(recusou && !admitiuDivergente);
      http.objetos.delete(path);
      let ultimoAusente = false;
      try {
        await comCoordenacaoPrivadaDeDireitos({
          ...parametros,
          executar: async () => {
            admitiuDivergente = true;
          },
        });
      } catch (e) {
        if (!(e instanceof FalhaDoLivroDeDireitos) || e.codigo !== "AUSENTE") throw e;
        ultimoAusente = true;
      } finally {
        http.objetos.set(path, guardado);
      }
      exigir(ultimoAusente && !admitiuDivergente);
      const vencida = await comCoordenacaoPrivadaDeDireitos({
        ...parametros,
        executar: async (coordenacao) => {
          exigir(bancoDaCoordenacao(coordenacao) === banco);
          for (const executar of executores) {
            const resposta = await executar(coordenacao);
            exigir(resposta.situacao === "ociosa");
          }
          exigir((await reservarFotografiaDeDireitos(coordenacao)) === null);
          exigir((await compactarDiarioDeDireitos(coordenacao)).situacao === "ociosa");
          const recuperacao = await prepararRecuperacaoDeDireitos(coordenacao);
          exigir("situacao" in recuperacao && recuperacao.situacao === "ociosa");
          exigir((await reconferirCoordenacaoDeDireitos(coordenacao, storage)) === coordenacao);
          const fotografiaOperacional = await processarFotografiaNaCoordenacao(coordenacao, {
            storage,
            leitor: null,
            politica: { retirarTextosDaFundacao: false },
          });
          exigir(fotografiaOperacional.situacao === "ociosa");
          const diarioOperacional = await recuperarDiarioNaCoordenacao(coordenacao, {
            storage,
            leitor: null,
          });
          exigir(diarioOperacional.situacao === "ociosa");
          let copiada = false;
          try {
            await minimizarProximoPerfil({ ...coordenacao });
          } catch (e) {
            if (!(e instanceof AppError) || e.code !== "DIREITOS_LIVRO") throw e;
            copiada = true;
          }
          exigir(copiada);
          const fonteHistorica = fontes.find((f) => isDeepStrictEqual(f.plan, admissao.plano));
          exigir(fonteHistorica);
          await admissao.verificar(banco, coordenacao, fonteHistorica.operation_id);
          return coordenacao;
        },
      });
      let expirou = false;
      try {
        await minimizarProximoPerfil(vencida);
      } catch (e) {
        if (!(e instanceof AppError) || e.code !== "DIREITOS_LIVRO") throw e;
        expirou = true;
      }
      exigir(expirou);
      const fonteParaPrazo = fontes.find((f) => isDeepStrictEqual(f.plan, admissao.plano));
      exigir(fonteParaPrazo);
      await provarPrazoDaCoordenacao(parametros, fonteParaPrazo.operation_id);
      return banco;
    });
    let encerrou = false;
    try {
      await emprestada.execute(sql`select 1`);
    } catch (e) {
      const fila: unknown[] = [e];
      for (let i = 0; i < 4 && fila.length; i++) {
        const atual = fila.shift();
        if (
          atual &&
          typeof atual === "object" &&
          "code" in atual &&
          atual.code === "CONNECTION_ENDED"
        )
          encerrou = true;
        if (atual instanceof Error && atual.cause) fila.push(atual.cause);
      }
      if (!encerrou) throw e;
    }
    exigir(encerrou);
    rejeitou = false;
    try {
      await importarFontesHistoricasDeDireitos({ ...config, capturaSha256: "0".repeat(64) });
    } catch (e) {
      if (!(e instanceof FalhaDoLivroDeDireitos) || e.codigo !== "INTEGRIDADE") throw e;
      rejeitou = true;
    }
    exigir(rejeitou && isDeepStrictEqual(fontes, await ler()));
    const fonte = fontes.find((f) => f.world_map.length > 0);
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
      nativas?.n === 1 &&
        identidades?.n === 0 &&
        !primeira.execucaoAutorizada &&
        !primeira.trafegoAutorizado,
    );
  } finally {
    try {
      await limparAdmissao?.();
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
    historicalNativeConnectionBound: true as const,
    historicalNativeConnectionRollbackVerified: true as const,
    historicalNativeConnectionClosed: true as const,
    nativeSqlWorkersLoadedWithoutAppCredentials: true as const,
    ordinarySqlWorkersRefusedFrozenLedger: true as const,
    privateSqlCoordinationBound: true as const,
    privateSqlCoordinationDivergenceRefused: true as const,
    privateSqlCoordinationFullPreflightVerified: true as const,
    privateSqlCoordinationCopyRefused: true as const,
    privateSqlCoordinationExpired: true as const,
    historicalNativeAdmissionVerified: true as const,
    historicalAdmissionIdempotenceVerified: true as const,
    historicalBackupGuardianPreserved: true as const,
    historicalOperationScopeExpired: true as const,
    nativePhotographicWorkersLoadedWithoutAppCredentials: true as const,
    privatePhotographicQueuesBound: true as const,
    privateChildCannotOutliveParent: true as const,
    privateCoordinationCancellationVerified: true as const,
    privateOperationalQueuesBound: true as const,
    privateContextPreservedAfterIo: true as const,
    macFixturePersonalErasureExecuted: false as const,
    macFixtureSourceEffectsExecuted: false as const,
  };
}
