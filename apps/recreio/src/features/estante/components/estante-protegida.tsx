import { ehErroDoRecreio } from "@informach/recreio";
import type { ReferenciaDeJogador } from "@/features/autoridade-de-jogo/aparelho-repository";
import { conferirAberturaDoJogo } from "@/features/autoridade-de-jogo/pagina-repository";
import { jogosProtegidosDisponiveis } from "@/features/familia/disponibilidade";
import { temCliente } from "@/features/jogar/registro";
import { jogoAbre, jogosDoCatalogo } from "@/features/jogos/config";
import { ListaDeMundos } from "@/features/mundos/components/lista-de-mundos";
import { listarMundos } from "@/features/mundos/service";

/** Sem links de conta, cobrança ou edição das regras do responsável. */
export async function EstanteProtegida({ jogador }: { jogador: ReferenciaDeJogador }) {
  if (!jogosProtegidosDisponiveis)
    return (
      <section className="painel mt-8 p-6">
        <h2 className="font-display text-2xl font-bold">
          Os jogos ainda não estão disponíveis neste acesso
        </h2>
        <p className="mt-3 text-tinta-suave">
          Peça ao adulto para conferir o acesso. Você pode sair deste aparelho quando quiser.
        </p>
      </section>
    );
  const jogos = await Promise.all(
    jogosDoCatalogo().map(async (jogo) => {
      let permitido = false;
      try {
        permitido =
          jogoAbre(jogo.id) &&
          temCliente(jogo.id) &&
          (await conferirAberturaDoJogo(jogador, jogo.id));
      } catch (erro) {
        if (!ehErroDoRecreio(erro, "JOGO_INDISPONIVEL")) throw erro;
      }
      const mundos =
        permitido && jogo.capacidades.mundos
          ? await listarMundos({ ...jogador, jogo: jogo.id })
          : [];
      if (permitido && jogo.capacidades.mundos)
        permitido = await conferirAberturaDoJogo(jogador, jogo.id);
      return { jogo, permitido, mundos: permitido ? mundos : [] };
    }),
  );
  return (
    <section className="mt-8" aria-labelledby="sua-estante">
      <h2 id="sua-estante" className="font-display text-3xl font-extrabold">
        Sua estante
      </h2>
      <p className="mt-2 text-tinta-suave">Escolha um jogo para brincar.</p>
      <ul className="mt-5 grid gap-5">
        {jogos.map(({ jogo, permitido, mundos }) => (
          <li key={jogo.id} className="painel p-6">
            <h3 className="font-display text-xl font-bold">{jogo.nome}</h3>
            {!permitido ? (
              <p className="mt-3 text-tinta-suave">
                Este jogo não está disponível para este perfil agora. Peça ao adulto para conferir o
                acesso e as regras.
              </p>
            ) : jogo.capacidades.mundos ? (
              <div className="mt-4">
                <ListaDeMundos mundos={mundos} jogarEm={jogo.id} />
              </div>
            ) : (
              <a
                href={`/jogar/${jogo.id}`}
                className="rb rb-sol mt-4"
                aria-label={`Jogar ${jogo.nome}`}
              >
                Jogar
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
