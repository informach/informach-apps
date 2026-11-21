import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { db, eq } from "@informach/db";
import {
  recreioSpaceJournal as journal,
  recreioSpaceSnapshots as snapshots,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { canonico, criarMundo as simular } from "@informach/morada-sim";
import { BAIRRO_DA_PROVA } from "@informach/morada-sim/conteudo";
import type { PerfilId } from "@informach/recreio";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { aceitarConvite, criarConvite, criarMundo } from "@/features/mundos/service";
import { selecionarPerfil } from "@/features/perfis/service";
import { exigir } from "../scripts/backup/provas-arquivos";
import { conceder } from "../scripts/concessoes";
import { novoJogador } from "./apoio";

/** Real adult membership before native consent. Synthetic game payload and
 * durable journal use the actual simulator; the child never plays Morada. */
export async function prepararMundoDoEncerramento(
  autor: AutorNativoRecente,
  email: string,
  perfilId: PerfilId,
) {
  const outro = await novoJogador({ apelido: "Adulto B" });
  const referencia = {
    perfilId: outro.perfil.id,
    sessaoDeAparelhoId: outro.ator.sessaoDeAparelhoId,
  };
  const mundo = await criarMundo({ ...referencia, jogo: "morada" }, { nome: "Casa compartilhada" });
  await selecionarPerfil(autor, perfilId);
  await conceder({ email, tier: "family", dias: 30, motivo: "teste" });
  const convite = await criarConvite({ ...referencia, jogo: "morada" }, mundo.id, {
    forma: "member",
  });
  const aceito = await aceitarConvite(
    { perfilId, sessaoDeAparelhoId: autor.sessaoDeAparelhoId },
    { codigo: convite.codigo },
  );
  exigir(aceito.mundoId === mundo.id, "ENCERRAMENTO_MUNDO_DIVERGENTE");
  const simulacao = simular({
    mundoId: mundo.id,
    semente: 73,
    definicao: BAIRRO_DA_PROVA,
    fundadores: [perfilId, outro.perfil.id],
  });
  const foto = simulacao.fotografar();
  const acesso = simulacao.estado.acessos.find((a) => a.perfilId === outro.perfil.id);
  exigir(acesso, "ENCERRAMENTO_MUNDO_DIVERGENTE");
  exigir(acesso.permissoes.includes("gastar"), "ENCERRAMENTO_MUNDO_DIVERGENTE");
  exigir(
    simulacao.aplicar({
      t: "conceder_acesso",
      perfilId: outro.perfil.id,
      familiaId: acesso.familiaId,
      permissoes: acesso.permissoes.filter((p) => p !== "gastar"),
    }).ok,
    "ENCERRAMENTO_MUNDO_DIVERGENTE",
  );
  const fatos = simulacao.avancar(0).fatos;
  exigir(fatos.length > 0 && fatos.length <= 1000, "ENCERRAMENTO_MUNDO_DIVERGENTE");
  const entradas = fatos.map((f, i) => {
    const payload = Buffer.from(JSON.stringify(f));
    return {
      spaceId: mundo.id,
      seq: i + 1,
      fence: 0,
      tick: f.tick,
      factId: f.id,
      payload,
      byteSize: payload.length,
    };
  });
  const bytes = gzipSync(JSON.stringify(foto));
  try {
    await db.insert(snapshots).values({
      spaceId: mundo.id,
      revision: 1,
      fence: 0,
      schemaVersion: foto.estado.versao,
      journalSeq: 0,
      tick: foto.tick,
      kind: "checkpoint",
      storage: "pg",
      data: bytes,
      byteSize: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    await db.insert(journal).values(entradas);
    await db
      .update(spaces)
      .set({ revision: 1, schemaVersion: foto.estado.versao, journalSeq: fatos.length })
      .where(eq(spaces.id, mundo.id));
  } finally {
    bytes.fill(0);
    for (const e of entradas) e.payload.fill(0);
  }
  const final = simulacao.fotografar(),
    acessoFinal = final.estado.acessos.find((a) => a.perfilId === outro.perfil.id);
  exigir(
    acessoFinal && !acessoFinal.permissoes.includes("gastar"),
    "ENCERRAMENTO_MUNDO_DIVERGENTE",
  );
  return {
    mundoId: mundo.id,
    retiradoId: perfilId,
    preservadoId: outro.perfil.id,
    diarioFinal: fatos.length,
    tickFinal: final.tick,
    versao: foto.estado.versao,
    familiasSha256: createHash("sha256").update(canonico(final.estado.familias)).digest("hex"),
    acessoSha256: createHash("sha256").update(canonico(acessoFinal)).digest("hex"),
  };
}
