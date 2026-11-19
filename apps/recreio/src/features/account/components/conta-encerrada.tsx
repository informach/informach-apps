import { INFORMACH_CONTACT } from "@informach/config/contact";
import Link from "next/link";
import { Sair } from "./sair";

export function ContaEncerrada({ estado }: { estado: "closing" | "closed" }) {
  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Conta</h1>
      <section className="painel mt-8 p-5 sm:p-6" aria-labelledby="conta-encerramento">
        <h2 id="conta-encerramento" className="font-display text-xl font-bold">
          {estado === "closing" ? "Encerramento em andamento" : "Participação encerrada"}
        </h2>
        <p className="mt-3 text-tinta-suave">
          {estado === "closing"
            ? "Novas compras, perfis e acessos aos jogos estão bloqueados enquanto seu pedido é processado. Acompanhe a conclusão na área de dados."
            : "Sua participação no Recreio foi encerrada. Você continua podendo consultar seus dados e os próprios registros financeiros."}
        </p>
        <p className="mt-3 text-tinta-suave">
          Sua conta Informach e a participação das outras pessoas permanecem separadas deste pedido.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/conta/dados" className="rb rb-sol">
            Meus dados e pedidos
          </Link>
          <Link href="/conta/assinatura" className="rb rb-vazado">
            Minha assinatura
          </Link>
          <a href={INFORMACH_CONTACT.directMessageUrl} className="rb rb-vazado">
            Atendimento
          </a>
        </div>
        <div className="mt-6">
          <Sair />
        </div>
      </section>
    </div>
  );
}
