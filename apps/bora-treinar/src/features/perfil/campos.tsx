"use client";
import { MINUTOS, RITMOS, type Ritmo } from "./regras";

export interface JeitoDeTreinar {
  ritmo: Ritmo;
  minutos: number | null;
  dias: number;
}

/**
 * As três perguntas do jeito de treinar (primeiro acesso e "Gerenciar"): rádios nativos, que
 * funcionam com teclado, leitor de tela e o controle da TV.
 */
export function CamposDoTreino({
  valor,
  aoMudar,
  nome,
}: {
  valor: JeitoDeTreinar;
  aoMudar: (v: JeitoDeTreinar) => void;
  /** de quem é o perfil, para as perguntas falarem com a pessoa certa */
  nome: string;
}) {
  return (
    <div className="campos-treino">
      <fieldset className="escolhas">
        <legend>Como {nome} está hoje?</legend>
        {RITMOS.map((r) => (
          <label key={r.id} className="escolha">
            <input
              type="radio"
              name="ritmo"
              className="sr-only"
              checked={valor.ritmo === r.id}
              onChange={() => aoMudar({ ...valor, ritmo: r.id })}
            />
            <strong>{r.titulo}</strong>
            <span className="muted">{r.texto}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="escolhas linha">
        <legend>Quanto tempo por treino?</legend>
        {MINUTOS.map((m) => (
          <label key={m} className="escolha curta">
            <input
              type="radio"
              name="minutos"
              className="sr-only"
              checked={valor.minutos === m}
              onChange={() => aoMudar({ ...valor, minutos: m })}
            />
            <strong>{m} min</strong>
          </label>
        ))}
      </fieldset>
      <fieldset className="escolhas linha">
        <legend>Quantos dias por semana?</legend>
        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
          <label key={d} className="escolha curta">
            <input
              type="radio"
              name="dias"
              className="sr-only"
              checked={valor.dias === d}
              onChange={() => aoMudar({ ...valor, dias: d })}
            />
            <strong>{d}</strong>
          </label>
        ))}
        <p className="muted small">
          É a meta da semana: em vez de dias seguidos, vale cumprir os dias que você escolheu.
        </p>
      </fieldset>
    </div>
  );
}
