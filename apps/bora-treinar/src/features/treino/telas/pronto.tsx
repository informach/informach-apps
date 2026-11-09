"use client";
import { Check, Hand, Loader2, Mic, Play, ShieldAlert } from "lucide-react";
import type { Exercise } from "../catalog/catalog";
import type { Checagem } from "../vision/enquadramento";
import type { CountMode } from "./treino";

export interface ProntoProps {
  modo: CountMode;
  primeiro: Exercise;
  /** o que vem no primeiro passo ("Aquecimento", "Série 1 de 3 · 10 rep.") */
  detalhe: string;
  checagem: Checagem;
  /** quanto do detector já baixou (0 a 1); null fora do modo câmera */
  detector: number | null;
  /** a câmera falhou: o aviso de erro do player cobre o resto */
  cameraFalhou: boolean;
  /** pareado: o celular já conectou */
  celularConectado: boolean;
  /** 3-2-1 da largada em andamento */
  largada: number;
  /** primeiro treino do perfil: o cuidado vem antes de tudo */
  seguranca: boolean;
  voz: { suportada: boolean; ouvindo: boolean; testada: boolean; aceita: boolean; falhou: boolean };
  /** opções do treino (só treinos completos; a prática não tem aquecimento nem alongamento) */
  opcoes: { aquecimento: boolean; voltaACalma: boolean } | null;
  aoMudarOpcoes: (o: { aquecimento?: boolean; voltaACalma?: boolean }) => void;
  aoEntenderSeguranca: () => void;
  aoComecar: () => void;
  aoComecarSemCamera: () => void;
  aoLigarVoz: () => void;
  aoAjudaDaVoz: () => void;
  nomeDoPerfil: string;
}

function Item({ ok, espera, children }: { ok: boolean; espera?: boolean; children: string }) {
  return (
    <li className={ok ? "ok" : espera ? "espera" : ""}>
      <span className="marca" aria-hidden>
        {ok ? <Check size={16} /> : espera ? <Loader2 size={16} className="gira" /> : null}
      </span>
      {children}
      <span className="sr-only">{ok ? ": pronto" : ": ainda não"}</span>
    </li>
  );
}

/**
 * Portão "Pronto?": fica no lugar do contador até a câmera (ou o celular) e a pessoa estarem
 * prontas. Com tudo certo por 1 s, começa sozinho com 3-2-1; "Começar" e "Começar sem câmera"
 * ficam sempre à mão. Antes, os 8 s do "Prepare-se" corriam enquanto o detector ainda baixava.
 */
export function Pronto(p: ProntoProps) {
  if (p.largada > 0)
    return (
      <aside className="side pronto">
        <div className="largada" role="status" aria-live="assertive">
          <span className="muted">Começando em</span>
          <strong className="num">{p.largada}</strong>
          <span>{p.primeiro.name}</span>
        </div>
      </aside>
    );

  if (p.seguranca)
    return (
      <aside className="side pronto">
        <p className="eyebrow">
          <ShieldAlert size={16} /> Primeiro treino de {p.nomeDoPerfil}
        </p>
        <h2>Antes de começar</h2>
        <ul className="cuidados">
          <li>Respeite o seu limite: o app ajusta as metas com o tempo.</li>
          <li>Afaste móveis e use um chão que não escorrega.</li>
          <li>
            Sentiu dor, tontura ou falta de ar? Pare. O botão de sair do treino salva o que já foi
            feito.
          </li>
          <li>Com alguma condição de saúde, converse antes com quem acompanha você.</li>
        </ul>
        <button
          type="button"
          className="btn primary big"
          // biome-ignore lint/a11y/noAutofocus: no controle da TV o foco precisa ir para a escolha
          autoFocus
          onClick={p.aoEntenderSeguranca}
        >
          Entendi
        </button>
      </aside>
    );

  const sensor = p.modo !== "manual";
  const c = p.checagem;
  const carregando = p.detector !== null && p.detector < 1;
  return (
    <aside className="side pronto">
      <p className="eyebrow">Pronto?</p>
      <h2>{p.primeiro.name}</h2>
      <p className="muted">{p.detalhe}</p>

      {p.modo === "camera" && !p.cameraFalhou && (
        <>
          {carregando && (
            <div className="detector">
              <span className="muted small">Preparando o detector (só na primeira vez)</span>
              <div
                className="barra"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round((p.detector ?? 0) * 100)}
              >
                <div
                  className="barra-feito"
                  style={{ width: `${Math.round((p.detector ?? 0) * 100)}%` }}
                />
              </div>
            </div>
          )}
          <ul className="checklist">
            <Item ok={c.camera} espera={!c.camera}>
              Câmera ligada
            </Item>
            <Item ok={c.luz === true} espera={c.luz === null && c.camera}>
              {c.luz === false ? "Pouca luz: acenda uma luz ou abra a janela" : "Luz boa"}
            </Item>
            <Item ok={c.corpo}>Corpo inteiro na imagem, da cabeça aos pés</Item>
            <Item ok={c.posicao}>Na posição de começar</Item>
          </ul>
          <p className="dica-camera">{p.primeiro.cameraHint}</p>
        </>
      )}

      {p.modo === "pareado" && (
        <>
          <ul className="checklist">
            <Item ok={p.celularConectado} espera={!p.celularConectado}>
              Celular conectado
            </Item>
            <Item ok={c.corpo}>Corpo inteiro na imagem do celular</Item>
            <Item ok={c.posicao}>Na posição de começar</Item>
          </ul>
          <p className="dica-camera">
            Celular no chão, apoiado, a uns 2 metros. {p.primeiro.cameraHint}
          </p>
        </>
      )}

      {p.modo === "manual" && (
        <p>
          <Hand size={18} aria-hidden /> Toque em +1 a cada repetição
          {p.voz.suportada ? " ou diga os números em voz alta." : "."}
        </p>
      )}

      {p.voz.suportada && (
        <div className="voz-teste">
          {p.voz.ouvindo ? (
            <p role="status" className={p.voz.testada ? "ok" : ""}>
              <Mic size={18} aria-hidden />{" "}
              {p.voz.testada ? "Ouvi! A voz vai contar com você." : "Diga “um” para testar."}
            </p>
          ) : p.voz.falhou ? (
            <button type="button" className="btn ghost" onClick={p.aoAjudaDaVoz}>
              <Mic size={18} /> O microfone não ligou: ver como liberar
            </button>
          ) : (
            <>
              <button type="button" className="btn ghost" onClick={p.aoLigarVoz}>
                <Mic size={18} /> {sensor ? "Contar também pela voz" : "Contar pela voz"}
              </button>
              {!p.voz.aceita && (
                <p className="muted small">
                  O reconhecimento é do navegador: no Chrome o áudio vai ao Google e no Safari à
                  Apple, só com o microfone ligado. O Bora Treinar não grava nem guarda o áudio.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {p.opcoes && (
        <fieldset className="opcoes-treino">
          <legend className="sr-only">Opções do treino</legend>
          <label>
            <input
              type="checkbox"
              checked={p.opcoes.aquecimento}
              onChange={(e) => p.aoMudarOpcoes({ aquecimento: e.target.checked })}
            />
            Aquecimento de 2 min
          </label>
          <label>
            <input
              type="checkbox"
              checked={p.opcoes.voltaACalma}
              onChange={(e) => p.aoMudarOpcoes({ voltaACalma: e.target.checked })}
            />
            Alongamento no fim
          </label>
        </fieldset>
      )}

      <div className="acoes">
        <button
          type="button"
          className="btn primary big"
          data-autofocus
          // biome-ignore lint/a11y/noAutofocus: no controle da TV o foco precisa ir para Começar
          autoFocus
          onClick={p.aoComecar}
        >
          <Play size={20} fill="currentColor" /> {sensor ? "Começar agora" : "Começar"}
        </button>
        {sensor && (
          <button type="button" className="btn ghost" onClick={p.aoComecarSemCamera}>
            <Hand size={18} /> Começar sem câmera
          </button>
        )}
        {sensor && (
          <p className="muted small">Com tudo certo, o treino começa sozinho em 3, 2, 1.</p>
        )}
      </div>
    </aside>
  );
}
