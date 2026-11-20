import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type postgres from "postgres";
import { admitirRetiradaHistoricaRecuperada } from "../../src/features/direitos/admissao-recuperada-repository";
import {
  comCoordenacaoPrivadaDeDireitos,
  comOperacaoPrivadaDeDireitos,
} from "../../src/features/direitos/coordenacao-repository";
import { criarArmazenamentoDoLivro } from "../../src/features/direitos/livro/armazenamento";
import {
  criarAssinaturaDoLivro,
  resumoDoRegistro,
} from "../../src/features/direitos/livro/assinatura";
import { AppError } from "../../src/lib/errors";
import { comConexaoPrivadaDeDireitos } from "./conexao-direitos";
import { importarFontesHistoricasDeDireitos } from "./importar-fontes-direitos";
import { exigir } from "./provas-arquivos";

/** A second assessment of the closed-HTTP MAC fixture in the same private SQL
 * copy. This is not native consent, a second physical restore, an operational
 * verified recovery, or permission to resume a production book. */
export async function provarReavaliacaoHistorica(config: {
  copia: postgres.Sql;
  cliente: Parameters<typeof criarArmazenamentoDoLivro>[0]["cliente"];
  livroId: string;
  chaves: ReadonlyMap<string, Uint8Array>;
  execucaoAnterior: string;
  capturaSha256: string;
  fonte: string;
}) {
  const { copia, livroId } = config;
  const lerFontes = () =>
    copia.unsafe(
      `select operation_id,
    encode(sha256(convert_to(to_jsonb(s)::text,'UTF8')),'hex') as sha256
    from recreio.rights_recovery_sources s where ledger_id=$1 order by operation_id`,
      [livroId],
    );
  const lerRecibosAntigos = () =>
    copia.unsafe(
      `select operation_id,
    encode(sha256(convert_to(to_jsonb(e)::text,'UTF8')),'hex') as sha256
    from recreio.rights_recovery_evaluations e where run_id=$1 order by operation_id`,
      [config.execucaoAnterior],
    );
  const [operacao] = await copia.unsafe<{ id: string }[]>(
    "select id from recreio.rights_operations where ledger_id=$1 order by id",
    [livroId],
  );
  exigir(operacao, "REAVALIACAO_HISTORICA_DIVERGENTE");
  const lerOrigem = () =>
    copia.unsafe(
      `select encode(sha256(convert_to(
    (to_jsonb(o)-array['lease_token','lease_until','next_attempt_at','updated_at'])::text,'UTF8')),'hex') as sha256
    from recreio.rights_operations o where id=$1`,
      [operacao.id],
    );
  const fontes = await lerFontes(),
    recibos = await lerRecibosAntigos(),
    origem = await lerOrigem();
  const chave = randomBytes(32),
    chaves = new Map(config.chaves);
  chaves.set("source-last", chave);
  const rotacao = criarAssinaturaDoLivro({ livroId, chaveAtiva: "source-next", chaves }),
    seguinte = criarAssinaturaDoLivro({ livroId, chaveAtiva: "source-last", chaves });
  try {
    const storage = criarArmazenamentoDoLivro({
      cliente: config.cliente,
      bucket: "recreio-fixture",
      assinatura: rotacao,
      tempoLimiteMs: 2000,
    });
    const anterior = await storage.lerCabecalho();
    // Explicit fixture receipt: it is not a claim that all operational F7
    // obligations have been fulfilled, and it is never sent to a live book.
    await storage.retomarComNovaChave(
      anterior,
      resumoDoRegistro(
        Buffer.from(JSON.stringify({ fixture: "second-assessment", fontes, recibos })),
      ),
      new Date().toISOString(),
    );
    await storage.congelarCabecalho(await storage.lerCabecalho(), new Date().toISOString());
    const comum = {
      copia,
      storage,
      assinatura: seguinte,
      capturaSha256: config.capturaSha256,
      fonte: config.fonte,
      maxEntradas: 10,
      maxBytesPlanos: 65536,
      tempoLimiteMs: 30000,
    };
    const segunda = await importarFontesHistoricasDeDireitos(comum),
      repetida = await importarFontesHistoricasDeDireitos(comum);
    exigir(
      segunda.execucaoId !== config.execucaoAnterior &&
        isDeepStrictEqual(segunda, repetida) &&
        isDeepStrictEqual(fontes, await lerFontes()) &&
        isDeepStrictEqual(recibos, await lerRecibosAntigos()),
      "REAVALIACAO_HISTORICA_DIVERGENTE",
    );
    await comConexaoPrivadaDeDireitos(copia, (banco) =>
      comCoordenacaoPrivadaDeDireitos({
        ...comum,
        banco,
        execucaoId: segunda.execucaoId,
        executar: async (pai) => {
          let recusou = false;
          try {
            await comOperacaoPrivadaDeDireitos(pai, operacao.id, async () => {
              throw new Error("Staged assessment granted authority");
            });
          } catch (e) {
            if (!(e instanceof AppError) || e.code !== "DIREITOS_INTEGRIDADE") throw e;
            recusou = true;
          }
          exigir(recusou, "REAVALIACAO_HISTORICA_DIVERGENTE");
          exigir(
            (await admitirRetiradaHistoricaRecuperada(pai, operacao.id)).situacao === "existente",
            "REAVALIACAO_HISTORICA_DIVERGENTE",
          );
          await comOperacaoPrivadaDeDireitos(pai, operacao.id, async () => undefined);
          await admitirRetiradaHistoricaRecuperada(pai, operacao.id);
        },
      }),
    );
    exigir(
      isDeepStrictEqual(origem, await lerOrigem()) &&
        isDeepStrictEqual(fontes, await lerFontes()) &&
        isDeepStrictEqual(recibos, await lerRecibosAntigos()),
      "REAVALIACAO_HISTORICA_DIVERGENTE",
    );
    const [quantidade] = await copia.unsafe<{ n: number }[]>(
      `select count(*)::int as n
      from recreio.rights_recovery_evaluations where ledger_id=$1`,
      [livroId],
    );
    exigir(quantidade?.n === 2 * fontes.length, "REAVALIACAO_HISTORICA_DIVERGENTE");
  } finally {
    rotacao.encerrar();
    seguinte.encerrar();
    chave.fill(0);
  }
}
