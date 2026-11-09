import { PRODUCTS } from "@informach/config";
import { Camera, Dumbbell, Smartphone, Tv, Users } from "lucide-react";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { ofertas, reais } from "@/features/billing/ofertas";
import { TRIAL_DAYS } from "@/features/teste/regras";
import { EXERCISES } from "@/features/treino/catalog/catalog";
import { WORKOUTS } from "@/features/treino/catalog/workouts";
import { Instructor3D } from "@/features/treino/instructor/instructor-3d";
import { getCurrentUser } from "@/lib/auth";

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
  const planos = ofertas(PRODUCTS.filter((p) => p.app === "bora-treinar"));
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
              {user ? "Abrir o app" : `Testar ${TRIAL_DAYS} dias grátis`}
            </Link>
            {!user && (
              <span className="hero-nota">
                Sem cartão: a câmera, os {WORKOUTS.length} treinos e os níveis liberados por{" "}
                {TRIAL_DAYS} dias. Depois, o grátis continua.
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
          <span className="muted">{TRIAL_DAYS} dias com tudo liberado, sem cartão</span>
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
          {planos.map((o) => (
            <div className="card plan" key={o.tier}>
              <span className="muted">
                {o.tier === "family" ? "Família · até quatro perfis" : "Individual · para você"}
              </span>
              <p className="num plan-price">
                {reais(o.mensal.centavos)}
                <small>/mês</small>
              </p>
              <p className="muted">
                ou {reais(o.anual.porMes)}/mês no anual ({reais(o.anual.centavos)} por ano
                {o.anual.mesesGratis ? `, ${o.anual.mesesGratis} meses grátis` : ""})
              </p>
              <p className="muted">
                {o.tier === "family"
                  ? "A mesma assinatura para a casa: até quatro perfis, cada um com o seu treino, os seus níveis e o seu histórico."
                  : "Todos os treinos, contagem pela câmera e pela voz, celular como câmera da TV, níveis e treinos montados por você."}
              </p>
            </div>
          ))}
        </div>

        <div className="section-title">
          <h2>
            <Smartphone size={20} className="title-icon" /> Privacidade de verdade
          </h2>
        </div>
        <div className="card">
          <p>
            A câmera é processada no próprio aparelho: o vídeo nunca é enviado. Os perfis guardam um
            apelido, uma cor e o jeito de treinar; nada de idade, peso ou foto. Treinos, níveis e
            recordes ficam na conta para aparecer em qualquer aparelho.
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
