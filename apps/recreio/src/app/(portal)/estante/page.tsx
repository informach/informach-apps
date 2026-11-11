import { JOGOS } from "@informach/config/jogos";
import { cartoesDaEstante } from "@/features/estante/catalogo";
import { CartaoDoJogo } from "@/features/estante/components/cartao-do-jogo";
import { requirePageUser } from "@/lib/auth";
import { env } from "@/lib/env";

export const metadata = { title: "Estante" };

export default async function Estante() {
  await requirePageUser();
  const fechado = env.RECREIO_ACCESS_MODE === "fechado";
  return (
    <>
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Estante</h1>
      <p className="mt-2 max-w-2xl text-lg text-tinta-suave">Os jogos do Recreio ficam aqui.</p>
      <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cartoesDaEstante(JOGOS).map((jogo) => (
          <li key={jogo.id}>
            <CartaoDoJogo jogo={jogo} fechado={fechado} />
          </li>
        ))}
      </ul>
    </>
  );
}
