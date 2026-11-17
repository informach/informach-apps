"use client";
import { COMPASSO_POLICY } from "@informach/config/collections";
import { Check, Lock } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { MOTIVOS, type Motivo, reais } from "./ofertas";

interface Estado {
  accountUrl: string;
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
    `Até ${COMPASSO_POLICY.capacity.adults} adultos e ${COMPASSO_POLICY.capacity.dependents} dependentes na família.`,
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
  const caixa = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = caixa.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const textos = MOTIVOS[motivo];
  return (
    <dialog
      className="folha folha-dialog"
      aria-labelledby="planos-titulo"
      ref={caixa}
      onCancel={fechar}
    >
      <span className="folha-alca" aria-hidden />
      <p className="eyebrow">
        <Lock size={14} /> {textos.chamada}
      </p>
      <h2 id="planos-titulo">{textos.titulo}</h2>
      <ul className="folha-beneficios">
        {BENEFICIOS[motivo].map((b) => (
          <li key={b}>
            <Check size={18} aria-hidden /> {b}
          </li>
        ))}
      </ul>
      <p>
        <strong>Incluído no Compasso.</strong> Uma assinatura para o Bora Treinar e os outros
        aplicativos web do pacote.
      </p>
      <p className="num plan-price">
        {reais(COMPASSO_POLICY.monthlyAmountCents)}
        <small>/mês</small>
      </p>
      <p className="muted">
        ou {reais(COMPASSO_POLICY.annualAmountCents)} por ano. Teste de {COMPASSO_POLICY.trialDays}{" "}
        dias sem cartão para famílias elegíveis.
      </p>
      <a className="btn primary big" href={estado.accountUrl}>
        Ver Compasso na Minha conta
      </a>
      <p className="muted small">
        Na central você consulta a cobertura desta família e gerencia assinatura, créditos e
        pessoas. O Bora Treinar não consome créditos de IA.
      </p>
      <button type="button" className="btn ghost" onClick={fechar}>
        Agora não
      </button>
    </dialog>
  );
}
