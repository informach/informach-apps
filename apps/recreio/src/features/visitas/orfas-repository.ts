import "server-only";
import { db, sql } from "@informach/db";
import {
  ErroDoRecreio,
  InstanciaIdSchema,
  MundoIdSchema,
  PerfilIdSchema,
  SessaoDeJogoIdSchema,
} from "@informach/recreio";
import { limitarGestao } from "@/features/mundos/gestao-repository";
import { encerrarSessaoDeVisitaNoBanco } from "./encerramento-repository";

export const LOTE_DE_SESSOES_VISITANTES_ORFAS = 100;
/**
 * Fatos irreversíveis ou da posse original; cache de permissão vencido sozinho
 * não encerra concessão. A seleção não toma SID/cursor antes da trava do mundo.
 */
export async function limparSessoesVisitantesOrfas() {
  const lote = await db.transaction(async (tx) => {
    await limitarGestao(tx);
    return tx.execute<{
      id: string;
      session_id: string;
      profile_id: string;
      visit_id: string;
      space_id: string;
      game_id: string;
      instance_id: string;
      fence: number;
    }>(sql`
      select b.id,b.session_id,b.profile_id,b.visit_id,b.space_id,w.game_id,p.instance_id,p.fence
      from recreio.world_visit_sessions b
      join recreio.game_sessions g on g.id=b.session_id
      join recreio.world_visits v on v.id=b.visit_id
      join recreio.world_host_presences p on p.id=v.host_presence_id
      join recreio.game_sessions h on h.id=p.host_session_id
      join recreio.spaces w on w.id=b.space_id
      left join recreio.space_leases l on l.space_id=b.space_id and l.fence=p.fence
      where b.state<>'closed' and (
        g.ended_at is not null or g.expires_at<=statement_timestamp()
        or v.ended_at is not null or v.expires_at<=statement_timestamp()
        or p.closed_at is not null or p.expires_at<=statement_timestamp() or p.valid_until<=statement_timestamp()
        or h.ended_at is not null or h.expires_at<=statement_timestamp()
        or l.id is null or l.state<>'held' or l.released_at is not null
        or l.instance_id is distinct from p.instance_id or l.expires_at<=statement_timestamp()
        or w.status<>'active'
      ) order by b.created_at,b.id limit ${LOTE_DE_SESSOES_VISITANTES_ORFAS}
    `);
  });
  let conferidas = 0;
  for (let inicio = 0; inicio < lote.length; inicio += 4) {
    const resultados = await Promise.allSettled(
      lote.slice(inicio, inicio + 4).map(async (p) => {
        try {
          await encerrarSessaoDeVisitaNoBanco(
            { jogo: p.game_id, instanciaId: InstanciaIdSchema.parse(p.instance_id) },
            MundoIdSchema.parse(p.space_id),
            {
              visitaId: p.visit_id,
              sessaoDeVisitaId: p.id,
              sid: SessaoDeJogoIdSchema.parse(p.session_id),
              perfilId: PerfilIdSchema.parse(p.profile_id),
              cerca: p.fence,
              motivo: "autoridade_perdida",
            },
          );
          return 1;
        } catch (erro) {
          // Expurgo concorrente pode remover um recibo antigo; não representa nova autorização.
          if (erro instanceof ErroDoRecreio && erro.codigo === "NAO_ENCONTRADO") return 0;
          throw erro;
        }
      }),
    );
    for (const resultado of resultados) {
      if (resultado.status === "rejected") throw resultado.reason;
      conferidas += resultado.value;
    }
  }
  // Quantidade de candidatos conferidos, não métrica de novas sessões/consumo.
  return { sessoesDeVisitaOrfaConferidas: conferidas };
}
