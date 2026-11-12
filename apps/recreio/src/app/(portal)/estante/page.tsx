import { JOGOS } from "@informach/config/jogos";
import { NOME_DE_MUNDO } from "@informach/recreio";
import { EstadoDoAcesso } from "@/features/acesso/components/estado-do-acesso";
import { avaliarAcesso } from "@/features/acesso/service";
import { descreverAcesso } from "@/features/acesso/texto";
import { cartoesDaEstante } from "@/features/estante/catalogo";
import { CartaoDoJogo } from "@/features/estante/components/cartao-do-jogo";
import { CriarMundo } from "@/features/mundos/components/criar-mundo";
import { EntrarComCodigo } from "@/features/mundos/components/entrar-com-codigo";
import { ListaDeMundos } from "@/features/mundos/components/lista-de-mundos";
import { mundosDoPerfil } from "@/features/mundos/service";
import { paginaDoPortal } from "@/features/sessao/ator";
import { env } from "@/lib/env";

export const metadata = { title: "Estante" };

/** O jogo cujos mundos a estante mostra. Hoje o catálogo tem um só. */
const JOGO_DOS_MUNDOS = JOGOS[0];

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
  // em mundos é só para quem pode jogar.
  const mundos = await mundosDoPerfil(ator.perfil.id, JOGO_DOS_MUNDOS.id);

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

      <section aria-labelledby="mundos" className="mt-12">
        <h2 id="mundos" className="font-display text-2xl font-extrabold tracking-tight">
          Seus mundos no {JOGO_DOS_MUNDOS.nome}
        </h2>
        <p className="mt-2 max-w-2xl text-tinta-suave">
          Um mundo é onde o jogo acontece. Você pode jogar sozinho ou chamar outras pessoas com um
          código de convite.
        </p>
        <div className="mt-5">
          <ListaDeMundos mundos={mundos} />
        </div>
        {acesso.podeJogar && (
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <section aria-labelledby="criar-mundo" className="painel p-5">
              <h3 id="criar-mundo" className="font-display text-xl font-bold">
                Criar mundo
              </h3>
              <div className="mt-3">
                <CriarMundo
                  jogo={JOGO_DOS_MUNDOS.id}
                  limites={{ min: NOME_DE_MUNDO.min, max: NOME_DE_MUNDO.max }}
                />
              </div>
            </section>
            <section aria-labelledby="entrar-com-codigo" className="painel p-5">
              <h3 id="entrar-com-codigo" className="font-display text-xl font-bold">
                Entrar com código
              </h3>
              <div className="mt-3">
                <EntrarComCodigo />
              </div>
            </section>
          </div>
        )}
      </section>
    </>
  );
}
