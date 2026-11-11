import { JOGOS } from "@informach/config/jogos";
import { EstadoDoAcesso } from "@/features/acesso/components/estado-do-acesso";
import { avaliarAcesso } from "@/features/acesso/service";
import { descreverAcesso } from "@/features/acesso/texto";
import { cartoesDaEstante } from "@/features/estante/catalogo";
import { CartaoDoJogo } from "@/features/estante/components/cartao-do-jogo";
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
    </>
  );
}
