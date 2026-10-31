import { PRODUCTS } from "@informach/config";
import { Camera, Dumbbell, Smartphone, Tv, Users } from "lucide-react";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { EXERCISES } from "@/features/treino/catalog/catalog";
import { WORKOUTS } from "@/features/treino/catalog/workouts";
import { Instructor3D } from "@/features/treino/instructor/instructor-3d";
import { getCurrentUser } from "@/lib/auth";

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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
    titulo: "Cada um no seu nível",
    texto: "Perfis para a família toda, com trilhas que sobem quando a meta é batida duas vezes.",
  },
  {
    icon: Tv,
    titulo: "Treino na TV",
    texto:
      "Abra na TV ou no computador e use o celular, no chão, como câmera. Dá para usar o controle remoto.",
  },
];

export default async function Landing() {
  const user = await getCurrentUser();
  const planos = PRODUCTS.filter((p) => p.app === "bora-treinar" && p.interval === "month");
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
            <span className="eyebrow">Calistenia guiada em família</span>
            <h1>Bora treinar em casa, sem equipamento.</h1>
            <div className="meta">
              <span>{WORKOUTS.length} treinos prontos</span>
              <span>do aquecimento ao HIIT</span>
            </div>
            <Link href={user ? "/perfis" : "/entrar"} className="btn big" data-autofocus>
              Começar de graça
            </Link>
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
          <span className="muted">o Primeiro treino é grátis, sem cartão</span>
        </div>
        <div className="grid plans">
          <div className="card plan">
            <span className="muted">Gratuito · um perfil</span>
            <p className="num plan-price">R$ 0</p>
            <p className="muted">
              Primeiro treino, biblioteca com o instrutor 3D e prática de cada exercício contando à
              mão.
            </p>
          </div>
          {planos.map((p) => (
            <div className="card plan" key={p.id}>
              <span className="muted">
                {p.tier === "family" ? "Família · até quatro perfis" : "Individual · um perfil"}
              </span>
              <p className="num plan-price">
                {brl(p.listPrice?.amountCents ?? 0)}
                <small>/mês</small>
              </p>
              <p className="muted">
                Todos os treinos, contagem pela câmera, celular como câmera da TV, níveis, treinos
                montados por vocês e desafios em família.
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
            A câmera é processada no próprio aparelho: o vídeo nunca é enviado. Os perfis guardam só
            um apelido e uma cor. Treinos, níveis e recordes ficam na conta da família para aparecer
            em qualquer aparelho.
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
