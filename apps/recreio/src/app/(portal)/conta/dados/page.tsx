import Link from "next/link";
import { redirect } from "next/navigation";
import { consultarMinhaParticipacaoNoRecreio } from "@/features/account/participacao-service";
import { CopiaPessoal } from "@/features/direitos/components/copia-pessoal";
import { PainelDeDireitos } from "@/features/direitos/components/painel-de-direitos";
import { retiradaDisponivel } from "@/features/direitos/consentimento-runtime";
import { exportacaoDisponivel } from "@/features/direitos/exportacao-runtime";
import { consultarMeusDireitos } from "@/features/direitos/service";
import { paginaDaGestao } from "@/features/sessao/ator";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Meus dados" };
export default async function MeusDados() {
  const { ator } = await paginaDaGestao("/conta/dados");
  const participacao = await consultarMinhaParticipacaoNoRecreio(ator);
  const estado = await consultarMeusDireitos(ator).catch((erro: unknown) => {
    if (erro instanceof AppError && erro.code === "AUTH") redirect("/entrar?encerrada=1");
    throw erro;
  });
  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Meus dados</h1>
      <p className="mt-3 text-tinta-suave">
        Confira seus direitos sobre o próprio perfil e os perfis sob sua responsabilidade, mesmo sem
        assinatura.
      </p>
      {exportacaoDisponivel() && <CopiaPessoal perfis={estado.perfis} />}
      <PainelDeDireitos
        estado={estado}
        podeRetirar={retiradaDisponivel()}
        participacaoAtiva={participacao.estado === "active"}
      />
      <Link
        href="/conta"
        className="mt-8 inline-flex min-h-11 items-center font-bold text-ceu underline"
      >
        Voltar à conta
      </Link>
    </div>
  );
}
