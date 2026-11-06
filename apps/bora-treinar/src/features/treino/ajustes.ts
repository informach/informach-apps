"use client";
import { useCallback, useEffect, useState } from "react";
import type { ModeloPose } from "./vision/assets";

export interface Ajustes {
  audio: boolean;
  /** música de fundo sintetizada no aparelho; só toca com o som ligado */
  music: boolean;
  countAloud: boolean;
  /** já aceitou o aviso de que a contagem pela voz usa o reconhecimento do navegador */
  vozAceita: boolean;
  /**
   * microfone ao abrir um treino no modo manual: null ainda não perguntou (pergunta uma vez),
   * true liga sozinho, false não pergunta mais (o botão do microfone continua no player)
   */
  vozAoIniciar: boolean | null;
  /** instrutor acompanha a pessoa (câmera) em vez de ditar o ritmo */
  follow: boolean;
  /** 2 minutos de aquecimento antes dos treinos */
  aquecimento: boolean;
  /** alongamentos no fim dos treinos */
  voltaACalma: boolean;
  /**
   * modelo do detector neste aparelho: null usa o completo; o portão troca para o reduzido quando
   * o aparelho não passa de ~14 quadros por segundo com o completo
   */
  modelo: ModeloPose | null;
}

const CHAVE = "bora:ajustes";
const PADRAO: Ajustes = {
  audio: true,
  music: true,
  countAloud: true,
  vozAceita: false,
  vozAoIniciar: null,
  follow: false,
  aquecimento: true,
  voltaACalma: true,
  modelo: null,
};

/**
 * Leitura direta, para quem monta algo uma vez na entrada (os passos do treino). Só no navegador;
 * fora dele, ou sem armazenamento, valem os padrões.
 */
export function lerAjustes(): Ajustes {
  try {
    const salvo = typeof localStorage === "undefined" ? null : localStorage.getItem(CHAVE);
    return salvo ? { ...PADRAO, ...(JSON.parse(salvo) as Partial<Ajustes>) } : PADRAO;
  } catch {
    return PADRAO;
  }
}

/** Preferências do player neste aparelho. Sem armazenamento local, valem os padrões. */
export function useAjustes() {
  const [ajustes, setState] = useState<Ajustes>(PADRAO);
  // decisões que dependem do que está guardado (como perguntar pelo microfone) esperam a leitura
  const [carregado, setCarregado] = useState(false);
  useEffect(() => {
    try {
      const salvo = localStorage.getItem(CHAVE);
      if (salvo) setState({ ...PADRAO, ...(JSON.parse(salvo) as Partial<Ajustes>) });
    } catch {
      // armazenamento indisponível ou corrompido: padrões
    }
    setCarregado(true);
  }, []);
  const mudar = useCallback((parcial: Partial<Ajustes>) => {
    setState((atual) => {
      const novo = { ...atual, ...parcial };
      try {
        localStorage.setItem(CHAVE, JSON.stringify(novo));
      } catch {
        // só não fica lembrado
      }
      return novo;
    });
  }, []);
  return [ajustes, mudar, carregado] as const;
}
