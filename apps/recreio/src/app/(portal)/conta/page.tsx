import { INFORMACH_CONTACT } from "@informach/config/contact";
import Link from "next/link";
import { Sair } from "@/features/account/components/sair";
import { requirePageUser } from "@/lib/auth";

export const metadata = { title: "Conta" };

export default async function Conta() {
  const user = await requirePageUser();
  return (
    <>
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Conta</h1>
      <div className="mt-8 grid max-w-2xl gap-5">
        <section aria-labelledby="conta-email" className="painel p-5 sm:p-6">
          <h2 id="conta-email" className="font-display text-xl font-bold">
            E-mail da conta
          </h2>
          <p className="mt-2 text-lg font-semibold [overflow-wrap:anywhere]">{user.email}</p>
          <p className="mt-1 text-sm text-tinta-suave">
            É a conta Informach, a mesma dos outros apps da casa.
          </p>
          <div className="mt-5">
            <Sair />
          </div>
        </section>

        <section aria-labelledby="conta-exclusao" className="painel p-5 sm:p-6">
          <h2 id="conta-exclusao" className="font-display text-xl font-bold">
            Excluir a conta
          </h2>
          <p className="mt-2 text-tinta-suave">
            A exclusão ainda não é feita por aqui. Para pedir, mande uma mensagem no direct do
            Instagram, em{" "}
            <a
              href={INFORMACH_CONTACT.directMessageUrl}
              className="font-bold text-ceu underline underline-offset-4"
            >
              @{INFORMACH_CONTACT.instagramHandle}
            </a>
            .
          </p>
        </section>

        <p className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-tinta-suave">
          <Link href="/termos" className="underline underline-offset-4 hover:text-tinta">
            Termos
          </Link>
          <Link href="/privacidade" className="underline underline-offset-4 hover:text-tinta">
            Privacidade
          </Link>
        </p>
      </div>
    </>
  );
}
