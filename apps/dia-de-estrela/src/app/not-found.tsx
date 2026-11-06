import Link from "next/link";
import { Lumi } from "@/components/desenhos";

export default function NotFound() {
  return (
    <main
      id="conteudo"
      className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center"
    >
      <Lumi tamanho={110} humor="calma" />
      <h1 className="font-display text-4xl font-extrabold">Este caminho não existe.</h1>
      <p className="max-w-md text-lg font-semibold text-tinta-suave">
        A página pode ter mudado de endereço ou pertencer a outra família.
      </p>
      <Link href="/" className="b3 b3-ceu">
        Voltar ao início
      </Link>
    </main>
  );
}
