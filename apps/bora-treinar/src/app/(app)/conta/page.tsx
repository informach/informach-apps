import { isRecentWebAuthentication } from "@informach/auth/web-sessions";
import { webSsoEnvironment } from "@informach/auth/web-sso-contract";
import { COMPASSO_POLICY } from "@informach/config/collections";
import { INFORMACH_CONTACT } from "@informach/config/contact";
import { getAppUrl } from "@informach/config/domains";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { ehMotivo, reais } from "@/features/billing/ofertas";
import {
  AbrirPlanosAoChegar,
  Lembretes,
  PrivacyControls,
  SairDaConta,
} from "@/features/familia/conta";
import { unsubscribedCategories } from "@/features/familia/repository";
import { currentTrainer } from "@/features/familia/view";
import { diasRestantes } from "@/features/teste/regras";
import { getSession } from "@/lib/auth";
import { FUSO_PADRAO } from "@/lib/datas";
import { env } from "@/lib/env";

export const metadata = { title: "Conta e Compasso" };
function ConfirmarAcesso({ para }: { para: string }) {
  return (
    <div className="card notice">
      <p>
        Para {para}, confirme que é você: entre de novo com seu e-mail. A confirmação vale por dez
        minutos.
      </p>
      <Link href="/entrar?reautenticar=1&next=%2Fconta" className="btn primary spaced">
        Confirmar acesso
      </Link>
    </div>
  );
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>;
}) {
  const params = await searchParams;
  const { user, family, access, group } = await currentTrainer();
  const session = await getSession();
  const recent =
    !!session &&
    (await isRecentWebAuthentication({
      userId: user.id,
      sessionId: session.session.id,
      app: "bora-treinar",
      maxAgeSeconds: 600,
    }));
  const unsubscribed = await unsubscribedCategories(user.id);
  const accountUrl = `${getAppUrl("conta", webSsoEnvironment("bora-treinar", env.NEXT_PUBLIC_APP_URL))}/?familia=${group.id}#compasso`;
  return (
    <div className="screen">
      <header className="topbar">
        <Link href="/perfis" className="icon-btn" aria-label="Voltar aos perfis">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="page-title">Conta e Compasso</h1>
      </header>
      <main className="scroll narrow" id="conteudo">
        {ehMotivo(params.motivo) && <AbrirPlanosAoChegar motivo={params.motivo} />}
        <section className="card">
          <p className="eyebrow">{group.name}</p>
          <h2>Uma assinatura, vários aplicativos</h2>
          <p>
            O Bora Treinar faz parte do Compasso, com até {COMPASSO_POLICY.capacity.adults} adultos
            e {COMPASSO_POLICY.capacity.dependents} dependentes. Cada pessoa conserva seu treino,
            suas preferências e seu histórico.
          </p>
          <p className="num plan-price">
            {reais(COMPASSO_POLICY.monthlyAmountCents)}
            <small>/mês</small>
          </p>
          <p className="muted">
            ou {reais(COMPASSO_POLICY.annualAmountCents)} por ano. Teste de{" "}
            {COMPASSO_POLICY.trialDays} dias sem cartão para famílias elegíveis.
          </p>
          <p className="spaced">
            {access.unlocked
              ? "Treinos completos liberados para esta família."
              : "O treino gratuito inclui um perfil, Primeiro treino, Aquecimento e prática manual."}
            {access.trial.active ? ` Restam ${diasRestantes(access.trial)} dias de teste.` : ""}
          </p>
          <a className="btn primary spaced" href={accountUrl}>
            Gerenciar Compasso na Minha conta
          </a>
          <p className="muted spaced">
            Assinatura, créditos, pessoas e segurança ficam na central. O Bora Treinar não consome
            créditos de IA.
          </p>
        </section>
        <div className="section-title">
          <h2>Lembretes e resumo</h2>
        </div>
        <Lembretes
          reminderDays={unsubscribed.has("bora.reminder") ? 0 : (family?.reminderDays ?? 0)}
          reminderHour={family?.reminderHour ?? 18}
          weeklySummary={
            !unsubscribed.has("bora.weekly-summary") && (family?.weeklySummary ?? false)
          }
          email={user.email}
          timezone={family?.timezone ?? FUSO_PADRAO}
        />
        <div className="section-title">
          <h2>Seus dados e suas escolhas</h2>
        </div>
        {recent ? <PrivacyControls /> : <ConfirmarAcesso para="exportar seus dados" />}
        <SairDaConta />
        <p className="muted spaced">
          <a href={INFORMACH_CONTACT.directMessageUrl}>Suporte pelo direct do Instagram</a> ·{" "}
          <Link href="/privacidade">Privacidade</Link> · <Link href="/termos">Termos</Link>
        </p>
      </main>
    </div>
  );
}
