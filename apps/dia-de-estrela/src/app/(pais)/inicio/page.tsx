import Link from "next/link";
import { dataPorExtenso } from "@/domain/relogio";
import { parentPage } from "@/features/familia/view";
import { CartaoAlerta, CartaoCrianca, EsperandoVoce } from "@/features/pais/components/inicio";
import { parentHome } from "@/features/pais/dados";

export const metadata = { title: "Início" };

export default async function Inicio() {
  const ctx = await parentPage();
  const timezone = ctx.family?.timezone ?? "America/Sao_Paulo";
  const dados = await parentHome(ctx.actor, timezone, ctx.children);
  const bloqueadas = ctx.children.filter((c) => !c.allowed);
  return (
    <div className="flex flex-col gap-4">
      <header>
        <p className="text-sm font-bold text-tinta-suave">{dataPorExtenso(dados.relogio.data)}</p>
        <h1 className="font-display text-3xl font-extrabold leading-tight">Como está o dia</h1>
      </header>
      {dados.alertas.map((a) => (
        <CartaoAlerta key={a.id} a={a} />
      ))}
      {dados.adiados > 0 && (
        <p className="text-sm font-bold text-tinta-suave">
          {dados.adiados === 1 ? "1 alerta adiado" : `${dados.adiados} alertas adiados`} por 15
          minutos.
        </p>
      )}
      <EsperandoVoce
        aprovacoes={dados.aprovacoes}
        pedidos={dados.pedidos}
        starsPerReal={ctx.family?.starsPerReal ?? 10}
      />
      {dados.criancas.map((c) => (
        <CartaoCrianca key={c.id} c={c} />
      ))}
      {!ctx.children.length && (
        <Link href="/ajustes" className="bp bp-ceu w-full">
          Cadastrar a primeira criança
        </Link>
      )}
      {bloqueadas.length > 0 && (
        <p className="cartao p-4 text-sm font-bold text-tinta-suave">
          {bloqueadas.map((c) => c.name).join(", ")} {bloqueadas.length === 1 ? "está" : "estão"}{" "}
          fora do plano gratuito. Veja o Compasso em Ajustes para voltar a acompanhar.
        </p>
      )}
      {ctx.mode === "adult" &&
        dados.criancas.length > 0 &&
        !dados.criancas.some((c) => c.temAparelho) && (
          <Link
            href="/ajustes#aparelhos"
            className="cartao flex items-center gap-3 p-4 font-extrabold text-ceu-escuro"
          >
            Conectar o tablet da criança →
          </Link>
        )}
    </div>
  );
}
