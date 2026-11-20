import { isDeepStrictEqual } from "node:util";
import type postgres from "postgres";
import { z } from "zod";
import {
  type CoordenacaoDeEfeitos,
  comOperacaoPrivadaDeDireitos,
} from "../../src/features/direitos/coordenacao-repository";
import {
  verificarReaplicacaoDeRetiradas,
  verificarRetiradaRecuperada,
} from "../../src/features/direitos/verificacao-recuperada-repository";
import { AppError } from "../../src/lib/errors";
import { exigir } from "./provas-arquivos";

/** Only called in the actual owned private cluster after both native
 * withdrawals finish. The audit rejection trigger is a temporary fixture,
 * not an operational switch or a bypass of strict audit. */
export async function provarVerificacaoDasRetiradas(config: {
  copia: postgres.Sql;
  operacoes: readonly string[];
  coordenar: (executar: (pai: CoordenacaoDeEfeitos) => Promise<void>) => Promise<void>;
}) {
  const ids = z.array(z.uuid()).min(1).max(2).parse(config.operacoes);
  const { copia } = config;
  const lerOperacoes = () =>
    copia.unsafe(
      `select id,
    encode(sha256(convert_to(to_jsonb(o)::text,'UTF8')),'hex') as sha256
    from recreio.rights_operations o where id=any($1::uuid[]) order by id`,
      [ids],
    );
  const originais = await lerOperacoes();
  exigir(originais.length === ids.length, "VERIFICACAO_RETIRADAS_DIVERGENTE");
  await config.coordenar(async (pai) => {
    for (const id of ids) {
      const primeira = await verificarRetiradaRecuperada(pai, id),
        repetida = await verificarRetiradaRecuperada(pai, id);
      exigir(!primeira.jaVerificada && repetida.jaVerificada, "VERIFICACAO_RETIRADAS_DIVERGENTE");
    }
    const [r] = await copia.unsafe<{ run_id: string }[]>(
      `select e.run_id from recreio.rights_recovery_evaluations e
      join recreio.rights_recovery_runs r on r.id=e.run_id where e.operation_id=$1 and r.state='replaying'`,
      [ids[0]],
    );
    const runId = z.uuid().parse(r?.run_id),
      nome = `fixture_recovery_audit_${runId.replaceAll("-", "")}`;
    await copia.unsafe(`create function recreio.${nome}() returns trigger language plpgsql as $fixture$
      begin if NEW.event_type='recreio.rights_recovery_verified' and NEW.payload->>'runId'='${runId}'
        then raise exception 'fixture recovery strict audit'; end if; return NEW; end $fixture$`);
    let recusou = false;
    try {
      await copia.unsafe(
        `create trigger ${nome} before insert on audit.events for each row execute function recreio.${nome}()`,
      );
      try {
        await verificarReaplicacaoDeRetiradas(pai);
      } catch (erro) {
        let atual: unknown = erro;
        for (let n = 0; n < 5 && atual; n++) {
          if (
            typeof atual === "object" &&
            "code" in atual &&
            atual.code === "P0001" &&
            "message" in atual &&
            atual.message === "fixture recovery strict audit"
          )
            recusou = true;
          atual = atual instanceof Error ? atual.cause : undefined;
        }
        if (!recusou) throw erro;
      }
    } finally {
      await copia.unsafe(`drop trigger if exists ${nome} on audit.events`);
      await copia.unsafe(`drop function recreio.${nome}()`);
    }
    const lerRun = () =>
      copia.unsafe<{ state: string; receipt_sha256: string | null; verified_at: string | null }[]>(
        "select state,receipt_sha256,verified_at::text from recreio.rights_recovery_runs where id=$1",
        [runId],
      );
    const [revertida] = await lerRun();
    exigir(
      recusou &&
        revertida?.state === "replaying" &&
        revertida.receipt_sha256 === null &&
        revertida.verified_at === null,
      "AUDITORIA_RECUPERACAO_NAO_REVERTEU",
    );
    const recibo = await verificarReaplicacaoDeRetiradas(pai),
      [pronta] = await lerRun();
    exigir(
      recibo.operacoesVerificadas === ids.length &&
        !recibo.trafegoAutorizado &&
        pronta?.state === "verified" &&
        pronta.receipt_sha256 === recibo.reciboSha256 &&
        pronta.verified_at !== null,
      "VERIFICACAO_RETIRADAS_DIVERGENTE",
    );
    let encerrou = false;
    try {
      await comOperacaoPrivadaDeDireitos(pai, ids[0], async () => undefined);
    } catch (e) {
      if (!(e instanceof AppError) || e.code !== "DIREITOS_LIVRO") throw e;
      encerrou = true;
    }
    exigir(
      encerrou && isDeepStrictEqual(originais, await lerOperacoes()),
      "ESCOPO_VERIFICADO_REABRIU",
    );
  });
  return {
    nativeRightsReplayReceiptVerified: true as const,
    nativeRightsReplayReceiptAuditRollbackVerified: true as const,
    nativeRightsReplayScopeClosed: true as const,
    nativeRightsReplayTrafficAuthorized: false as const,
  };
}
