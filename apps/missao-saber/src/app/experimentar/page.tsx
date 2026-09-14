import Link from "next/link";
import { Brand } from "@/components/brand";
import { Demo } from "@/components/demo";

export default function Try() {
  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b-2 border-sombra px-4 py-4 sm:px-8">
        <Brand />
        <Link
          href="/"
          className="font-semibold text-tinta-suave underline underline-offset-4 hover:text-tinta"
        >
          Voltar ao início
        </Link>
      </header>
      <main id="conteudo" className="px-4 py-10 sm:px-8">
        <Demo />
      </main>
    </>
  );
}
