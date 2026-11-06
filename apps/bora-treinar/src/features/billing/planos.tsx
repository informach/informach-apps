"use client";
import { Check, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { checkoutAction, startTrialAction } from "@/features/familia/actions";
import { useServerAction } from "@/lib/use-server-action";
import { TRIAL_DAYS } from "../teste/regras";
import { MOTIVOS, type Motivo, type Oferta, reais } from "./ofertas";

interface Estado {
  ofertas: Oferta[];
  /** ids com preço configurado no Stripe deste ambiente */
  configurados: string[];
  assinante: boolean;
  teste: { active: boolean; started: boolean };
}

const Contexto = createContext<((motivo?: Motivo) => void) | null>(null);

/** Abre a folha de planos dizendo o que a pessoa tentou usar. */
export function usePlanos() {
  const abrir = useContext(Contexto);
  return abrir ?? (() => window.location.assign("/conta"));
}

/**
 * Um cadeado: o botão que abre a folha de planos no lugar de levar a Conta (que pedia login de
 * novo antes de mostrar o botão de assinar).
 */
export function Cadeado({
  motivo,
  className,
  children,
}: {
  motivo: Motivo;
  className?: string;
  children: ReactNode;
}) {
  const abrir = usePlanos();
  return (
    <button type="button" className={className} onClick={() => abrir(motivo)}>
      {children}
    </button>
  );
}

const BENEFICIOS: Record<Motivo, string[]> = {
  camera: [
    "Conta cada repetição e avisa quando faltou descer.",
    "A imagem não sai do aparelho.",
    "Junto: os 15 treinos, os níveis e o histórico completo.",
  ],
  tv: [
    "A TV mostra o treino; o celular no chão conta.",
    "A imagem fica no celular, a TV só recebe a contagem.",
    "Junto: a câmera, os 15 treinos e os níveis.",
  ],
  geral: [
    "Os 15 treinos, do aquecimento ao HIIT.",
    "A câmera conta as repetições, sem a imagem sair do aparelho.",
    "Níveis que sobem (e descem) com você, e o histórico completo.",
  ],
  treino: [
    "Os 15 treinos, do aquecimento ao HIIT.",
    "A câmera conta as repetições.",
    "Níveis que acompanham você.",
  ],
  niveis: [
    "Cada trilha sobe quando você bate a meta.",
    "E desce quando ficou difícil demais.",
    "Junto: a câmera e os 15 treinos.",
  ],
  perfis: [
    "Até 4 perfis na mesma assinatura.",
    "Cada um com o seu treino do dia, os seus níveis e o seu histórico.",
    "E, quando quiserem, treinar junto.",
  ],
  editor: [
    "Monte séries, Tabata, EMOM ou AMRAP.",
    "Com os seus níveis em cada trilha.",
    "Junto: a câmera e os 15 treinos.",
  ],
  desafio: [
    "Um desafio por semana, que se renova sozinho.",
    "Some com a família, se quiserem.",
    "Junto: a câmera e os 15 treinos.",
  ],
  historico: [
    "Todos os treinos guardados, não só os últimos.",
    "Recordes e técnica pela câmera.",
    "Junto: a câmera e os 15 treinos.",
  ],
};

/**
 * A folha de planos do app inteiro. Mora no layout das telas logadas; qualquer cadeado a abre com
 * o motivo. Assinar não pede login de novo: o pagamento acontece no Stripe. Quem ainda não usou o
 * teste começa por ele, sem cartão.
 */
export function PlanosProvider({ estado, children }: { estado: Estado; children: ReactNode }) {
  const [motivo, setMotivo] = useState<Motivo | null>(null);
  const abrir = useCallback((m: Motivo = "geral") => setMotivo(m), []);
  return (
    <Contexto.Provider value={abrir}>
      {children}
      {motivo && <FolhaDePlanos estado={estado} motivo={motivo} fechar={() => setMotivo(null)} />}
    </Contexto.Provider>
  );
}

function FolhaDePlanos({
  estado,
  motivo,
  fechar,
}: {
  estado: Estado;
  motivo: Motivo;
  fechar: () => void;
}) {
  const router = useRouter();
  const [anual, setAnual] = useState(true);
  const [tier, setTier] = useState(motivo === "perfis" ? "family" : "individual");
  const [mensagem, setMensagem] = useState("");
  const [pending, start] = useServerAction();
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
    };
    window.addEventListener("keydown", aoTeclar);
    caixa.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [fechar]);

  const textos = MOTIVOS[motivo];
  const podeTestar = !estado.assinante && !estado.teste.started;
  const escolhida = estado.ofertas.find((o) => o.tier === tier) ?? estado.ofertas[0];
  const produto = escolhida ? (anual ? escolhida.anual.id : escolhida.mensal.id) : null;

  const assinar = () =>
    start(async () => {
      if (!produto) return;
      const r = await checkoutAction(produto);
      if (r.ok) window.location.assign(r.data.url);
      else setMensagem(r.error);
    });
  const testar = () =>
    start(async () => {
      const r = await startTrialAction();
      if (!r.ok) return setMensagem(r.error);
      fechar();
      router.refresh();
    });

  return (
    <div
      className="folha-fundo"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) fechar();
      }}
    >
      <div
        className="folha"
        role="dialog"
        aria-modal="true"
        aria-labelledby="planos-titulo"
        data-modal
        ref={caixa}
      >
        <span className="folha-alca" aria-hidden />
        <p className="eyebrow">
          <Lock size={14} /> {textos.chamada}
        </p>
        <h2 id="planos-titulo">
          {textos.titulo}
          {podeTestar ? ` Experimente ${TRIAL_DAYS} dias.` : ""}
        </h2>
        <ul className="folha-beneficios">
          {BENEFICIOS[motivo].map((b) => (
            <li key={b}>
              <Check size={18} aria-hidden /> {b}
            </li>
          ))}
        </ul>

        {podeTestar ? (
          <>
            <button
              type="button"
              className="btn primary big"
              data-autofocus
              disabled={pending}
              onClick={testar}
            >
              {pending ? "Liberando…" : `Testar ${TRIAL_DAYS} dias grátis`}
            </button>
            <p className="muted small center">
              Sem cartão. Tudo liberado por {TRIAL_DAYS} dias, até 4 perfis; depois volta ao grátis,
              sem cobrança, e o que vocês fizeram fica guardado.
            </p>
          </>
        ) : (
          <>
            <fieldset className="segmento">
              <legend className="sr-only">Cobrança</legend>
              <label>
                <input
                  type="radio"
                  name="cobranca"
                  className="sr-only"
                  checked={!anual}
                  onChange={() => setAnual(false)}
                />
                <span>Mensal</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="cobranca"
                  className="sr-only"
                  checked={anual}
                  onChange={() => setAnual(true)}
                />
                <span>
                  Anual
                  {escolhida?.anual.mesesGratis
                    ? ` · ${escolhida.anual.mesesGratis} meses grátis`
                    : ""}
                </span>
              </label>
            </fieldset>
            <fieldset className="planos-opcoes">
              <legend className="sr-only">Plano</legend>
              {estado.ofertas.map((o) => (
                <label className="plano-opcao" key={o.tier}>
                  <input
                    type="radio"
                    name="plano"
                    className="sr-only"
                    checked={tier === o.tier}
                    onChange={() => setTier(o.tier)}
                  />
                  <span className="plano-linha">
                    <strong>{o.tier === "family" ? "Família" : "Individual"}</strong>
                    <strong className="num">
                      {reais(anual ? o.anual.porMes : o.mensal.centavos)}
                      <small>/mês</small>
                    </strong>
                  </span>
                  <span className="muted">
                    {o.tier === "family"
                      ? "Até 4 perfis na mesma assinatura, cada um com o seu treino"
                      : "Para você"}
                    {anual ? ` · ${reais(o.anual.centavos)} por ano` : ""}
                  </span>
                </label>
              ))}
            </fieldset>
            <button
              type="button"
              className="btn primary big"
              data-autofocus
              disabled={pending || !produto || !estado.configurados.includes(produto)}
              onClick={assinar}
            >
              {pending ? "Abrindo o pagamento…" : "Assinar"}
            </button>
            <p className="muted small center">
              O pagamento é feito no Stripe, e você cancela quando quiser em Conta.
            </p>
          </>
        )}
        <p role="status" className="form-message">
          {mensagem}
        </p>
        <button type="button" className="btn ghost" onClick={fechar}>
          Agora não
        </button>
      </div>
    </div>
  );
}
