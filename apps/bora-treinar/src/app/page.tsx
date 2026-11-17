import { webSsoEnvironment } from "@informach/auth/web-sso-contract";
import { COMPASSO_POLICY } from "@informach/config/collections";
import { getAppUrl } from "@informach/config/domains";
import { Camera, Dumbbell, Smartphone, Tv, Users } from "lucide-react";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { reais } from "@/features/billing/ofertas";
import { EXERCISES } from "@/features/treino/catalog/catalog";
import { WORKOUTS } from "@/features/treino/catalog/workouts";
import { Instructor3D } from "@/features/treino/instructor/instructor-3d";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";

const RECURSOS = [
  {
    icon: Dumbbell,
    titulo: "Instrutor 3D",
    texto: `Um boneco mostra cada um dos ${EXERCISES.length} exercícios no ritmo certo. Gire para ver de frente, de lado ou na diagonal.`,
  },
  {
    icon: Camera,
    titulo: "Conta pela câmera",
    texto:
      "O app reconhece cada repetição e avisa quando o quadril cai. A imagem fica só no aparelho.",
  },
  {
    icon: Users,
    titulo: "No seu ritmo",
    texto:
      "O treino do dia escolhido para você, níveis que sobem e descem com você, e um perfil para cada pessoa da casa.",
  },
  {
    icon: Tv,
    titulo: "No celular, no tablet ou na TV",
    texto:
      "Treine onde tiver. Na TV, o celular no chão vira a câmera. Dá para contar pela voz e usar o controle remoto.",
  },
];

export default async function Landing() {
  const user = await getCurrentUser();
  const central = `${getAppUrl("conta", webSsoEnvironment("bora-treinar", env.NEXT_PUBLIC_APP_URL))}/#compasso`;
  // quem já tem conta abre o app; quem não tem começa pelo cadastro (antes caía na aba Entrar)
  const comecar = user ? "/perfis" : "/entrar?modo=criar";
  return (
    <div className="screen landing">
      <header className="topbar">
        <Brand />
        <span className="spacer" />
        <Link href={user ? "/perfis" : "/entrar"} className="btn primary">
          {user ? "Abrir o app" : "Entrar"}
        </Link>
      </header>
      <main className="scroll" id="conteudo">
        <section className="hero">
          <div className="hero-main landing-hero">
            <Instructor3D
              className="hero-figure"
              exerciseId="polichinelo"
              mode="cadence"
              view="front"
            />
            <span className="eyebrow">Calistenia guiada, no seu ritmo</span>
            <h1>Bora treinar em casa, sem equipamento.</h1>
            <div className="meta">
              <span>{WORKOUTS.length} treinos prontos</span>
              <span>do aquecimento ao HIIT</span>
            </div>
            <Link href={comecar} className="btn big" data-autofocus>
              {user ? "Abrir o app" : "Começar a treinar"}
            </Link>
            {!user && (
              <span className="hero-nota">
                Sem cartão: a câmera, os {WORKOUTS.length} treinos e os níveis liberados por{" "}
                {COMPASSO_POLICY.trialDays} dias. Depois, o grátis continua.
              </span>
            )}
          </div>
          <div className="stat-stack">
            {RECURSOS.map((r) => (
              <div className="stat" key={r.titulo}>
                <span className="label">
                  <r.icon size={16} /> {r.titulo}
                </span>
                <span className="muted">{r.texto}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="section-title">
          <h2>Planos</h2>
          <span className="muted">
            {COMPASSO_POLICY.trialDays} dias com tudo liberado, sem cartão
          </span>
        </div>
        <div className="grid plans">
          <div className="card plan">
            <span className="muted">Gratuito · um perfil</span>
            <p className="num plan-price">R$ 0</p>
            <p className="muted">
              O Primeiro treino e o Aquecimento, a biblioteca com o instrutor 3D e a prática de cada
              exercício contando à mão ou pela voz.
            </p>
          </div>
          <div className="card plan">
            <span className="muted">Compasso · todos os apps web do pacote</span>
            <p className="num plan-price">
              {reais(COMPASSO_POLICY.monthlyAmountCents)}
              <small>/mês</small>
            </p>
            <p className="muted">
              ou {reais(COMPASSO_POLICY.annualAmountCents)} por ano. Até{" "}
              {COMPASSO_POLICY.capacity.adults} adultos e {COMPASSO_POLICY.capacity.dependents}{" "}
              dependentes.
            </p>
            <p className="muted">
              Todos os treinos, câmera, níveis e histórico, junto dos outros aplicativos Compasso.
              Recreio, Morada e Suíte Edi são produtos separados.
            </p>
            <a className="btn primary spaced" href={central}>
              Conhecer o Compasso
            </a>
          </div>
        </div>

        <div className="section-title">
          <h2>
            <Smartphone size={20} className="title-icon" /> Privacidade de verdade
          </h2>
        </div>
        <div className="card">
          <p>
            A câmera é processada no próprio aparelho: o vídeo nunca é enviado. O Bora usa o nome e
            a cor da pessoa cadastrada na família e guarda somente suas preferências de treino; não
            pede idade, peso ou foto. Treinos, níveis e recordes ficam na conta para aparecer em
            qualquer aparelho.
          </p>
        </div>
        <p className="muted footer-links">
          <Link href="/termos">Termos</Link> · <Link href="/privacidade">Privacidade</Link> · Um app
          Informach
        </p>
      </main>
    </div>
  );
}
