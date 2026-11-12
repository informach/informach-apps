import { JOGOS } from "@informach/config/jogos";
import { NOME_DE_MUNDO } from "@informach/recreio";
import { EstadoDoAcesso } from "@/features/acesso/components/estado-do-acesso";
import { avaliarAcesso } from "@/features/acesso/service";
import { descreverAcesso } from "@/features/acesso/texto";
import { cartoesDaEstante } from "@/features/estante/catalogo";
import { CartaoDoJogo } from "@/features/estante/components/cartao-do-jogo";
import { temCliente } from "@/features/jogar/registro";
import { jogoAbre, jogosDoCatalogo } from "@/features/jogos/config";
import { CriarMundo } from "@/features/mundos/components/criar-mundo";
import { EntrarComCodigo } from "@/features/mundos/components/entrar-com-codigo";
import { ListaDeMundos } from "@/features/mundos/components/lista-de-mundos";
import { mundosDoPerfil } from "@/features/mundos/service";
import { paginaDoPortal } from "@/features/sessao/ator";
import { env } from "@/lib/env";

export const metadata = { title: "Estante" };

export default async function Estante() {
  const { ator } = await paginaDoPortal();
  const acesso = await avaliarAcesso({ profileId: ator.perfil.id });
  const fechado = env.RECREIO_ACCESS_MODE === "fechado";
  const texto = descreverAcesso(acesso, { fechado });

  // Com o acesso fechado, quem não tem o direito de jogar para aqui: a conta e
  // o perfil existem, e a tela explica por que os jogos não abrem.
  if (fechado && !acesso.podeJogar)
    return (
      <section aria-labelledby="acesso" className="painel max-w-2xl p-6 sm:p-8">
        <EstadoDoAcesso texto={texto} nivel="h1" id="acesso" />
      </section>
    );

  // Os mundos são da pessoa mesmo quando o acesso está parado; criar e entrar
  // em mundos é só para quem pode jogar. Cada jogo deste deploy tem a sua
  // lista; hoje o catálogo público tem um jogo só.
  const jogos = await Promise.all(
    jogosDoCatalogo().map(async (jogo) => ({
      jogo,
      mundos: await mundosDoPerfil(ator.perfil.id, jogo.id),
      // "Jogar" só aparece para um jogo que abre e que o portal sabe hospedar.
      jogavel: acesso.podeJogar && jogoAbre(jogo.id) && temCliente(jogo.id),
    })),
  );

  return (
    <>
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Estante</h1>
      <p className="mt-2 max-w-2xl text-lg text-tinta-suave">Os jogos do Recreio ficam aqui.</p>
      <section aria-labelledby="acesso" className="painel mt-6 max-w-2xl p-5">
        <EstadoDoAcesso texto={texto} id="acesso" />
      </section>
      <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cartoesDaEstante(JOGOS).map((jogo) => (
          <li key={jogo.id}>
            <CartaoDoJogo jogo={jogo} />
          </li>
        ))}
      </ul>

      {jogos.map(({ jogo, mundos, jogavel }, indice) => (
        <section key={jogo.id} aria-labelledby={`mundos-${jogo.id}`} className="mt-12">
          <h2
            id={`mundos-${jogo.id}`}
            className="font-display text-2xl font-extrabold tracking-tight"
          >
            Seus mundos no {jogo.nome}
          </h2>
          {indice === 0 && (
            <p className="mt-2 max-w-2xl text-tinta-suave">
              Um mundo é onde o jogo acontece. Você pode jogar sozinho ou chamar outras pessoas com
              um código de convite.
            </p>
          )}
          <div className="mt-5">
            <ListaDeMundos mundos={mundos} jogarEm={jogavel ? jogo.id : undefined} />
          </div>
          {acesso.podeJogar && (
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <section aria-labelledby={`criar-mundo-${jogo.id}`} className="painel p-5">
                <h3 id={`criar-mundo-${jogo.id}`} className="font-display text-xl font-bold">
                  Criar mundo
                </h3>
                <div className="mt-3">
                  <CriarMundo
                    jogo={jogo.id}
                    limites={{ min: NOME_DE_MUNDO.min, max: NOME_DE_MUNDO.max }}
                  />
                </div>
              </section>
              {/* O código do convite já diz de qual mundo é: um campo só, no primeiro jogo. */}
              {indice === 0 && (
                <section aria-labelledby="entrar-com-codigo" className="painel p-5">
                  <h3 id="entrar-com-codigo" className="font-display text-xl font-bold">
                    Entrar com código
                  </h3>
                  <div className="mt-3">
                    <EntrarComCodigo />
                  </div>
                </section>
              )}
            </div>
          )}
        </section>
      ))}
    </>
  );
}
