import { createHash, randomBytes, randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { db, eq, sql } from "@informach/db";
import {
  recreioProfileAchievements as achievements,
  recreioSpaceJournal as journal,
  recreioProfileDataKeys as keys,
  recreioRightsOperations as operations,
  recreioProfileWorldTraces as traces,
  recreioProfileDataVersions as versions,
} from "@informach/db/schema";
import { canonico, criarMundo } from "@informach/morada-sim";
import { BAIRRO_DA_PROVA } from "@informach/morada-sim/conteudo";
import { confirmarRetiradaDePerfil } from "@/features/direitos/consentimento-service";
import { retirarProximosDadosPessoais } from "@/features/direitos/dados-retirada-repository";
import { criarArmazenamentoDoLivro } from "@/features/direitos/livro/armazenamento";
import { criarAssinaturaDoLivro } from "@/features/direitos/livro/assinatura";
import { RAIZ_VAZIA } from "@/features/direitos/livro/contrato";
import { conferirPrefixoDoLivro } from "@/features/direitos/livro/leitura";
import { publicarProximoConsentimento } from "@/features/direitos/publicacao-repository";
import { prepararPedidoDeDireitos } from "@/features/direitos/service";
import { exigir, FalhaDaProva } from "../scripts/backup/provas-arquivos";
import { prepararFinanceiroNativoAnterior } from "./backup-financeiro-nativo-apoio";
import type { criarBucketDaMontagem } from "./backup-provider-apoio";
import { familiaSocial } from "./social-apoio";

/** Only synthetic CI data. Family, login and consent use the native services;
 * opaque game payloads are seeded before capture, without inventing authority.
 * The later decision lives in its own durable S3 prefix, outside the dump. */
export async function prepararDireitosPosterioresACaptura(
  bucket: Awaited<ReturnType<typeof criarBucketDaMontagem>>,
  preservadoId: string,
  mundoId: string,
) {
  const familia = await familiaSocial(15),
    familiaAnterior = await familiaSocial(15),
    familiaPendente = await familiaSocial(15),
    livroId = randomUUID(),
    antiga = randomBytes(32),
    proxima = randomBytes(32),
    assinatura = criarAssinaturaDoLivro({
      livroId,
      chaveAtiva: "native-old",
      chaves: new Map([["native-old", antiga]]),
    });
  for (const profileId of [
    familia.perfil.id,
    familiaAnterior.perfil.id,
    familiaPendente.perfil.id,
    preservadoId,
  ]) {
    const [key] = await db
      .insert(keys)
      .values({
        profileId,
        gameId: "historico-privado",
        key: "progresso",
        revision: 1,
      })
      .returning();
    exigir(key, "DADOS_NATIVOS_AUSENTES");
    const bytes = Buffer.from(`conteudo sintetico ${profileId}`);
    try {
      await db.insert(versions).values({
        dataId: key.id,
        profileId,
        gameId: key.gameId,
        baseRevision: 0,
        revision: 1,
        kind: "accepted",
        bytes,
        digest: createHash("sha256").update(bytes).digest("hex"),
      });
      await db.insert(achievements).values({
        profileId,
        gameId: key.gameId,
        achievementId: "primeiro",
        keyHash: createHash("sha256").update(profileId).digest("hex"),
      });
    } finally {
      bytes.fill(0);
    }
  }
  // A privacy trace is historical authorship, never a world membership or
  // permission. The other real player remains the world's native steward.
  await db.insert(traces).values({ profileId: familia.perfil.id, spaceId: mundoId });
  const simulacao = criarMundo({
    mundoId,
    semente: 42,
    definicao: BAIRRO_DA_PROVA,
    fundadores: [familia.perfil.id, preservadoId],
  });
  const foto = simulacao.fotografar(),
    acesso = simulacao.estado.acessos.find((a) => a.perfilId === preservadoId);
  exigir(acesso, "ACESSO_DO_OUTRO_FUNDADOR_AUSENTE");
  exigir(acesso.permissoes.includes("gastar"), "ACESSO_DO_OUTRO_FUNDADOR_AUSENTE");
  exigir(
    simulacao.aplicar({
      t: "conceder_acesso",
      perfilId: preservadoId,
      familiaId: acesso.familiaId,
      permissoes: acesso.permissoes.filter((p) => p !== "gastar"),
    }).ok,
    "FATO_SINTETICO_RECUSADO",
  );
  // Flush the real command's durable fact at this tick. An elapsed simulation
  // clock without a corresponding journal fact is not a committed checkpoint.
  const fatos = simulacao.avancar(0).fatos;
  exigir(fatos.length > 0 && fatos.length <= 1000, "DIARIO_SINTETICO_AUSENTE");
  const entradas = fatos.map((f, i) => {
    const payload = Buffer.from(JSON.stringify(f));
    return {
      spaceId: mundoId,
      seq: i + 1,
      fence: 0,
      tick: f.tick,
      factId: f.id,
      payload,
      byteSize: payload.length,
    };
  });
  try {
    await db.insert(journal).values(entradas);
  } finally {
    for (const entrada of entradas) entrada.payload.fill(0);
  }
  const final = simulacao.fotografar(),
    acessoFinal = final.estado.acessos.find((a) => a.perfilId === preservadoId);
  exigir(acessoFinal && !acessoFinal.permissoes.includes("gastar"), "FATO_SINTETICO_RECUSADO");
  const familiasFinaisSha256 = createHash("sha256")
      .update(canonico(final.estado.familias))
      .digest("hex"),
    acessoFinalSha256 = createHash("sha256").update(canonico(acessoFinal)).digest("hex");
  // The first genuine native operation is already admitted and partly
  // processed when the authenticated capture is made. Its ancestor header,
  // native preparation and dates must survive recovery unchanged.
  await bucket.admitirPrefixo("direitos", livroId);
  const storage = criarArmazenamentoDoLivro({
    cliente: bucket.cliente,
    bucket: bucket.destino.bucketName,
    assinatura,
    tempoLimiteMs: 15000,
  });
  await storage.iniciarCabecalho(
    assinatura.assinarCabecalho({
      formato: "recreio-livro-direitos-v1",
      livroId,
      estado: "aberto",
      epoca: 0,
      chavesUtilizadas: ["native-old"],
      retomada: null,
      geracao: 0,
      entradas: 0,
      raizSha256: RAIZ_VAZIA,
      anteriorSha256: null,
      ultimaIntencao: null,
      atualizadoEm: new Date().toISOString(),
    }),
  );
  let publicacaoPendenteId: string | undefined;
  async function consentir(
    alvo: Awaited<ReturnType<typeof familiaSocial>>,
    perderConfirmacao = false,
  ) {
    const previa = await prepararPedidoDeDireitos(alvo.autor, {
      pedidoId: randomUUID(),
      tipo: "retirar_perfil",
      perfis: [alvo.perfil.id],
    });
    const fonte = process.env.GITHUB_SHA;
    exigir(fonte && /^[a-f0-9]{40}$/.test(fonte), "FONTE_NATIVA_AUSENTE");
    const pedido = await confirmarRetiradaDePerfil(
      alvo.autor,
      {
        preparacaoId: previa.preparacaoId,
        planoSha256: previa.planoSha256,
        confirmoRetirada: true,
      },
      { assinatura, storage, fonte },
    );
    if (perderConfirmacao) {
      const nome = `fixture_publish_${randomUUID().replaceAll("-", "")}`;
      await db.execute(sql`create function audit.${sql.identifier(nome)}() returns trigger language plpgsql as $$
        begin if new.event_type='recreio.rights_admitted' then raise exception 'fixture publication strict audit';
        end if; return new; end $$`);
      let recusou = false;
      try {
        await db.execute(sql`create trigger ${sql.identifier(nome)} before insert on audit.events
          for each row execute function audit.${sql.identifier(nome)}()`);
        try {
          await publicarProximoConsentimento({ assinatura, storage });
        } catch (error) {
          let atual: unknown = error;
          for (let n = 0; n < 5 && atual; n++) {
            if (
              typeof atual === "object" &&
              "code" in atual &&
              atual.code === "P0001" &&
              "message" in atual &&
              atual.message === "fixture publication strict audit"
            )
              recusou = true;
            atual = atual instanceof Error ? atual.cause : undefined;
          }
          if (!recusou) throw error;
        }
      } finally {
        try {
          await db.execute(sql`drop trigger if exists ${sql.identifier(nome)} on audit.events`);
        } finally {
          await db.execute(sql`drop function audit.${sql.identifier(nome)}()`);
        }
      }
      if (!recusou) throw new FalhaDaProva("PUBLICACAO_PENDENTE_NAO_REVERTIDA");
      const [op] = await db.select().from(operations).where(eq(operations.id, pedido.operacaoId));
      const prefixo = await conferirPrefixoDoLivro({
        storage,
        maxEntradas: 10,
        tempoLimiteMs: 15000,
      });
      exigir(
        op &&
          op.state === "publishing" &&
          op.admittedAt === null &&
          op.admittedHeadSha256 === null &&
          prefixo.referencias.some((r) => r.operacaoId === op.id && r.sha256 === op.intentSha256),
        "PUBLICACAO_PENDENTE_DIVERGENTE",
      );
      return pedido;
    }
    let publicada = await publicarProximoConsentimento({ assinatura, storage });
    // The old lease may naturally expire while capturing. Let the real source
    // publisher reconcile that exact older operation, then admit this consent.
    // The authenticated dump still preserves the original pending state.
    if (
      publicada.situacao === "admitida" &&
      publicada.operacaoId === publicacaoPendenteId &&
      publicada.operacaoId !== pedido.operacaoId
    )
      publicada = await publicarProximoConsentimento({ assinatura, storage });
    exigir(
      publicada.situacao === "admitida" && publicada.operacaoId === pedido.operacaoId,
      "CONSENTIMENTO_NATIVO_NAO_PUBLICADO",
    );
    return pedido;
  }
  const anterior = await consentir(familiaAnterior),
    provaAnterior = await conferirPrefixoDoLivro({
      storage,
      maxEntradas: 10,
      tempoLimiteMs: 15000,
    });
  const parcial = await retirarProximosDadosPessoais({ assinatura, prova: provaAnterior });
  exigir(
    parcial.situacao === "dados_removidos" &&
      parcial.dominio === "versions" &&
      parcial.quantidade === 1,
    "EFEITO_ANTERIOR_NAO_CONFIRMADO",
  );
  // Synthetic reservation simulates a worker that died after that durable
  // effect. No consent, admission or retention timestamp is manufactured.
  await db
    .update(operations)
    .set({
      leaseToken: randomUUID(),
      leaseUntil: sql`statement_timestamp()+interval '2 minutes'`,
      nextAttemptAt: sql`statement_timestamp()+interval '90 seconds'`,
    })
    .where(eq(operations.id, anterior.operacaoId));
  const publicacaoPendente = await consentir(familiaPendente, true);
  publicacaoPendenteId = publicacaoPendente.operacaoId;
  const financeiro = await prepararFinanceiroNativoAnterior(bucket);
  return {
    fotografia: {
      bytes: gzipSync(JSON.stringify(foto)),
      versao: foto.estado.versao,
      tick: foto.tick,
      diarioFinal: fatos.length,
    },
    async publicar() {
      const pedido = await consentir(familia);
      await storage.congelarCabecalho(await storage.lerCabecalho(), new Date().toISOString());
      return {
        livroId,
        financeiro: await financeiro.publicar(),
        publicacaoPendente: {
          operacaoId: publicacaoPendente.operacaoId,
          perfilId: familiaPendente.perfil.id,
          contaId: familiaPendente.conta.id,
        },
        anterior: {
          operacaoId: anterior.operacaoId,
          perfilId: familiaAnterior.perfil.id,
          contaId: familiaAnterior.conta.id,
        },
        operacaoId: pedido.operacaoId,
        perfilId: familia.perfil.id,
        contaId: familia.conta.id,
        preservadoId,
        mundoId,
        diarioFinal: fatos.length,
        tickFinal: final.tick,
        familiasFinaisSha256,
        acessoFinalSha256,
        chaves: {
          "native-old": antiga.toString("base64"),
          "native-next": proxima.toString("base64"),
        },
      };
    },
    encerrar() {
      financeiro.encerrar();
      assinatura.encerrar();
      antiga.fill(0);
      proxima.fill(0);
    },
  };
}
