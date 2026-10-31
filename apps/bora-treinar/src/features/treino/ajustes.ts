"use client";
import { useCallback, useEffect, useState } from "react";

export interface Ajustes {
  audio: boolean;
  countAloud: boolean;
  /** instrutor acompanha a pessoa (câmera) em vez de ditar o ritmo */
  follow: boolean;
}

const CHAVE = "bora:ajustes";
const PADRAO: Ajustes = { audio: true, countAloud: true, follow: false };

/** Preferências do player neste aparelho. Sem armazenamento local, valem os padrões. */
export function useAjustes() {
  const [ajustes, setState] = useState<Ajustes>(PADRAO);
  useEffect(() => {
    try {
      const salvo = localStorage.getItem(CHAVE);
      if (salvo) setState({ ...PADRAO, ...(JSON.parse(salvo) as Partial<Ajustes>) });
    } catch {
      // armazenamento indisponível ou corrompido: padrões
    }
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
  return [ajustes, mudar] as const;
}
