import Link from "next/link";
import { redirect } from "next/navigation";
import { GerirCompra } from "@/features/cobranca/components/gerir-compra";
import { consultarMinhaCobranca } from "@/features/cobranca/service";
import { paginaDaGestao } from "@/features/sessao/ator";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Assinatura" };

export default async function AssinaturaDaConta() {
  const { ator } = await paginaDaGestao("/conta/assinatura");
  const estado = await consultarMinhaCobranca(ator).catch((erro: unknown) => {
    if (erro instanceof AppError && erro.code === "AUTH") redirect("/entrar?encerrada=1");
    throw erro;
  });
  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Assinatura</h1>
      <p className="mt-3 text-tinta-suave">Confira sua oferta e acompanhe seu pedido.</p>
      <GerirCompra estado={estado} pedidoId={crypto.randomUUID()} />
      <Link
        href="/conta"
        className="mt-8 inline-flex min-h-11 items-center font-bold text-ceu underline"
      >
        Voltar à conta
      </Link>
    </div>
  );
}
