import Link from "next/link";
import { DefinirPin } from "@/features/protecao/components/definir-pin";
import { estadoDoPinNativo } from "@/features/protecao/service";
import { paginaDaGestao } from "@/features/sessao/ator";

export const metadata = { title: "Proteção do aparelho" };
export default async function Protecao() {
  const { ator } = await paginaDaGestao("/conta/protecao");
  const pin = await estadoDoPinNativo(ator);
  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Proteção do aparelho</h1>
      <p className="mt-3 text-tinta-suave">
        O PIN da sua conta é separado dos PINs das crianças e adolescentes. Você pode configurá-lo
        sem criar um perfil de jogador.
      </p>
      <DefinirPin escopo={{ tipo: "conta" }} definido={pin.definido} />
      <Link href="/conta" className="mt-6 inline-block font-bold text-ceu underline">
        Voltar à conta
      </Link>
    </div>
  );
}
