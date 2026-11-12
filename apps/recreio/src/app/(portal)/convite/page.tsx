import Link from "next/link";
import { EntrarComCodigo } from "@/features/mundos/components/entrar-com-codigo";
import { paginaDoPortal } from "@/features/sessao/ator";

export const metadata = { title: "Convite" };

/**
 * Chegada por um endereço de convite (`/convite?codigo=`). Abrir a página não
 * aceita nada: o código vem preenchido e a pessoa confirma.
 */
export default async function Convite({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string | string[] }>;
}) {
  const { ator } = await paginaDoPortal();
  const { codigo } = await searchParams;
  const inicial = typeof codigo === "string" ? codigo.slice(0, 32) : "";
  return (
    <>
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Convite para um mundo</h1>
      <p className="mt-2 max-w-2xl text-lg text-tinta-suave">
        Você entra no mundo como {ator.perfil.apelido}. Se quiser entrar com outro perfil,{" "}
        <Link href="/perfis" className="font-bold text-ceu underline underline-offset-4">
          troque antes
        </Link>
        .
      </p>
      <section className="painel mt-6 max-w-md p-5 sm:p-6">
        <EntrarComCodigo inicial={inicial} />
      </section>
    </>
  );
}
