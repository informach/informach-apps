import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { gunzipSync } from "node:zlib";
import { canonico } from "@informach/morada-sim";
import { abrirFotografia } from "@informach/morada-sim/formatos";
import type postgres from "postgres";
import type { CoordenacaoDeEfeitos } from "../../src/features/direitos/coordenacao-repository";
import type { criarArmazenamentoDoLivro } from "../../src/features/direitos/livro/armazenamento";
import { processarFotografiaNaCoordenacao } from "../direitos/fotografias";
import { recuperarDiarioNaCoordenacao } from "../direitos/recuperacao";
import { exigir } from "./provas-arquivos";
import type { RetiradaNativaDeProva } from "./retirada-nativa-prova-contrato";

/** Frozen synthetic shared world only. Compares every other world's rows and
 * the unchanged native steward; checks real journal recovery and photo scrub. */
export async function prepararProvaDoMundoEncerrado(
  copia: postgres.Sql,
  storage: ReturnType<typeof criarArmazenamentoDoLivro>,
  dado: RetiradaNativaDeProva["financeiro"]["mundo"],
) {
  const lerOutros = () =>
    copia.unsafe(
      `select
    (select jsonb_agg(to_jsonb(s) order by id) from recreio.spaces s where id<>$1::uuid) as mundos,
    (select jsonb_agg(to_jsonb(s) order by id) from recreio.space_snapshots s where space_id<>$1::uuid) as fotos,
    (select jsonb_agg(to_jsonb(j) order by space_id,seq) from recreio.space_journal j where space_id<>$1::uuid) as diario,
    (select jsonb_agg(to_jsonb(m) order by id) from recreio.space_members m where space_id<>$1::uuid) as membros,
    (select jsonb_agg(to_jsonb(t) order by profile_id,space_id) from recreio.profile_world_traces t where space_id<>$1::uuid) as rastros`,
      [dado.mundoId],
    );
  const lerPosse = () =>
    copia.unsafe(
      `select s.game_id,s.steward_profile_id,s.created_by_profile_id,s.name,s.content_policy,s.schema_version,
    (select jsonb_agg(to_jsonb(m) order by id) from recreio.space_members m where space_id=s.id and profile_id=$2::uuid) as outro_membro
    from recreio.spaces s where s.id=$1::uuid`,
      [dado.mundoId, dado.preservadoId],
    );
  const lerFoto = async (revision: number) => {
    const [foto] = await copia.unsafe<
      { data: Buffer; sha256: string; schema_version: number; tick: number; journal_seq: number }[]
    >(
      `select data,sha256,schema_version,tick::float8 as tick,journal_seq::float8 as journal_seq from recreio.space_snapshots where space_id=$1::uuid and revision=$2 and storage='pg'`,
      [dado.mundoId, revision],
    );
    exigir(
      foto?.data && createHash("sha256").update(foto.data).digest("hex") === foto.sha256,
      "ENCERRAMENTO_MUNDO_DIVERGENTE",
    );
    let aberto: Buffer | undefined;
    try {
      aberto = gunzipSync(foto.data, { maxOutputLength: 8 * 1024 * 1024 });
      const texto = aberto.toString("utf8"),
        documento = abrirFotografia(JSON.parse(texto));
      const acesso = documento.estado.acessos.find((a) => a.perfilId === dado.preservadoId);
      exigir(
        acesso && documento.estado.versao === dado.versao && foto.schema_version === dado.versao,
        "ENCERRAMENTO_MUNDO_DIVERGENTE",
      );
      return {
        texto,
        tick: foto.tick,
        diario: foto.journal_seq,
        familias: createHash("sha256").update(canonico(documento.estado.familias)).digest("hex"),
        acesso: createHash("sha256").update(canonico(acesso)).digest("hex"),
      };
    } finally {
      foto.data.fill(0);
      aberto?.fill(0);
    }
  };
  const fora = await lerOutros(),
    posse = await lerPosse(),
    fotoAntes = await lerFoto(1);
  exigir(
    posse.length === 1 &&
      fotoAntes.texto.includes(dado.retiradoId) &&
      fotoAntes.texto.includes(dado.preservadoId),
    "ENCERRAMENTO_MUNDO_DIVERGENTE",
  );
  let diarios = 0,
    fotos = 0,
    compactadas = 0;
  return {
    async recuperar(filha: CoordenacaoDeEfeitos) {
      if (
        (await recuperarDiarioNaCoordenacao(filha, { storage, leitor: null })).situacao ===
        "diario_recuperado"
      )
        diarios++;
    },
    async fotografar(filha: CoordenacaoDeEfeitos) {
      const foto = await processarFotografiaNaCoordenacao(filha, {
        storage,
        leitor: null,
        politica: { retirarTextosDaFundacao: true },
      });
      if (foto.situacao === "fotografia_processada") fotos++;
      if (foto.situacao === "diario_compactado") compactadas += foto.entradas;
    },
    async conferir() {
      const final = await lerFoto(2),
        original = await lerFoto(1);
      const [fim] = await copia.unsafe<{ valida: boolean }[]>(
        `select
        s.status='hibernating' and s.revision=2 and s.schema_version=$3 and s.journal_seq=$4 and s.rights_operation_id is null and s.rights_frozen_state is null and not s.rights_draining
        and s.steward_profile_id=$2::uuid and s.created_by_profile_id=$2::uuid
        and exists(select 1 from recreio.space_members m where m.space_id=s.id and m.profile_id=$2::uuid and m.state='active')
        and not exists(select 1 from recreio.space_members m where m.space_id=s.id and m.profile_id=$5::uuid and m.state='active')
        and not exists(select 1 from recreio.profile_world_traces t where t.space_id=s.id and t.profile_id=$5::uuid)
        and not exists(select 1 from recreio.space_journal j where j.space_id=s.id) as valida from recreio.spaces s where s.id=$1::uuid`,
        [dado.mundoId, dado.preservadoId, dado.versao, dado.diarioFinal, dado.retiradoId],
      );
      exigir(
        fim?.valida &&
          diarios === 1 &&
          fotos === 2 &&
          compactadas === dado.diarioFinal &&
          !original.texto.includes(dado.retiradoId) &&
          !final.texto.includes(dado.retiradoId) &&
          final.texto.includes(dado.preservadoId) &&
          final.familias === dado.familiasSha256 &&
          final.acesso === dado.acessoSha256 &&
          final.tick === dado.tickFinal &&
          final.diario === dado.diarioFinal &&
          original.familias === fotoAntes.familias &&
          isDeepStrictEqual(fora, await lerOutros()) &&
          isDeepStrictEqual(posse, await lerPosse()),
        "ENCERRAMENTO_MUNDO_DIVERGENTE",
      );
      return {
        nativeSelectedClosureSharedWorldReplayed: true,
        nativeSelectedClosureWorldStewardPreserved: true,
        nativeSelectedClosureWorldOtherDataPreserved: true,
        nativeSelectedClosureWorldOriginalSchemaPreserved: true,
        nativeSelectedClosureWorldPhotosScrubbed: fotos,
        nativeSelectedClosureWorldDiaryRecovered: true,
        nativeSelectedClosureWorldJournalCompacted: compactadas,
        nativeSelectedClosureWorldOtherWorldsUnchanged: true,
      };
    },
  };
}
