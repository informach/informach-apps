import Link from "next/link";
import { redirect } from "next/navigation";
import { paginaDaGestao } from "@/features/sessao/ator";
import { ConsentimentoDoTeste } from "@/features/teste/components/consentimento";
import { consultarMeuTeste } from "@/features/teste/service";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Teste gratuito" };

export default async function TesteDaConta() {
  const { ator } = await paginaDaGestao("/conta/teste");
  const estado = await consultarMeuTeste(ator).catch((erro: unknown) => {
    if (erro instanceof AppError && erro.code === "AUTH") redirect("/entrar?encerrada=1");
    throw erro;
  });
  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Teste gratuito</h1>
      <p className="mt-3 text-tinta-suave">Confira sua autorização e o período do seu teste.</p>
      <ConsentimentoDoTeste estado={estado} pedidoId={crypto.randomUUID()} />
      <Link
        href="/conta"
        className="mt-8 inline-flex min-h-11 items-center font-bold text-ceu underline"
      >
        Voltar à conta
      </Link>
    </div>
  );
}
