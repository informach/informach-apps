import Link from "next/link";
import { Simbolo } from "@/components/desenhos";

export default function NotFound() {
  return (
    <main
      id="conteudo"
      className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center"
    >
      <Simbolo tamanho={72} />
      <h1 className="font-display text-4xl font-extrabold tracking-tight">
        Este caminho não existe.
      </h1>
      <p className="max-w-md text-lg text-tinta-suave">A página pode ter mudado de endereço.</p>
      <Link href="/" className="rb rb-sol">
        Voltar ao início
      </Link>
    </main>
  );
}
