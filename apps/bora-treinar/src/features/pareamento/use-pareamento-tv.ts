"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { type EstadoTv, type EventoCelular, eventoCelularSchema } from "./protocolo";

type Fase = "desligado" | "criando" | "aguardando" | "conectado" | "desconectado" | "erro";

/** Sem nenhum evento do celular por esse tempo, ele caiu (o sinal vem a cada 2 s, sempre). */
export const SILENCIO_DO_CELULAR_MS = 6000;

function enviarEstado(codigo: string, estado: EstadoTv) {
  void fetch("/api/pareamento/estado", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ codigo, estado }),
    keepalive: true,
  }).catch(() => undefined);
}

/**
 * Lado da TV no pareamento: pede um código, mostra o QR e recebe pelo SSE os
 * eventos de contagem que o celular manda. `publicar` conta ao celular qual
 * exercício está valendo; o último estado é reenviado quando o celular chega.
 *
 * O celular manda um sinal a cada 2 s; sem nada por `SILENCIO_DO_CELULAR_MS`, a fase vira
 * "desconectado" e a TV mostra o código de novo (o mesmo celular volta sozinho pela credencial).
 * `novoCodigo` descarta o canal e cria outro, para um celular diferente ou um código vencido.
 */
export function usePareamentoTv(ativo: boolean, aoEvento: (e: EventoCelular) => void) {
  const [fase, setFase] = useState<Fase>(ativo ? "criando" : "desligado");
  const [codigo, setCodigo] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [geracao, setGeracao] = useState(0);
  const handler = useRef(aoEvento);
  handler.current = aoEvento;
  const codigoAtual = useRef<string | null>(null);
  const ultimoEvento = useRef(0);
  const estadoAtual = useRef<{ estado: EstadoTv | null; enviado: string }>({
    estado: null,
    enviado: "",
  });

  const reenviar = useCallback(() => {
    const { estado } = estadoAtual.current;
    if (!codigoAtual.current || !estado) return;
    estadoAtual.current.enviado = JSON.stringify(estado);
    enviarEstado(codigoAtual.current, estado);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `geracao` recria o canal de propósito
  useEffect(() => {
    if (!ativo) return;
    let fonte: EventSource | null = null;
    let vivo = true;
    setFase("criando");
    setErro(null);
    (async () => {
      try {
        const resposta = await fetch("/api/pareamento/criar", { method: "POST" });
        const corpo = (await resposta.json().catch(() => ({}))) as {
          codigo?: string;
          url?: string;
          erro?: string;
        };
        if (!resposta.ok || !corpo.codigo || !corpo.url)
          throw new Error(corpo.erro ?? "Não foi possível criar o pareamento.");
        if (!vivo) return;
        codigoAtual.current = corpo.codigo;
        setCodigo(corpo.codigo);
        setUrl(corpo.url);
        setFase("aguardando");
        reenviar();
        fonte = new EventSource(`/api/pareamento/stream?lado=tv&codigo=${corpo.codigo}`);
        fonte.onmessage = (mensagem) => {
          let dado: unknown;
          try {
            dado = JSON.parse(mensagem.data);
          } catch {
            return;
          }
          const evento = eventoCelularSchema.safeParse(dado);
          if (!evento.success) return;
          ultimoEvento.current = Date.now();
          if (evento.data.tipo === "ola") reenviar();
          setFase((f) => (f === "conectado" ? f : "conectado"));
          handler.current(evento.data);
        };
        fonte.onerror = () => {
          // o EventSource reconecta sozinho; só avisa se o servidor fechou de vez
          if (fonte?.readyState === EventSource.CLOSED) {
            setErro("Conexão com o celular perdida.");
            setFase("erro");
          }
        };
      } catch (e) {
        if (!vivo) return;
        setErro(e instanceof Error ? e.message : "Pareamento indisponível.");
        setFase("erro");
      }
    })();
    return () => {
      vivo = false;
      fonte?.close();
    };
  }, [ativo, reenviar, geracao]);

  // o celular sumiu (tela apagou, saiu do app, caiu a rede)
  useEffect(() => {
    if (fase !== "conectado") return;
    const t = window.setInterval(() => {
      if (Date.now() - ultimoEvento.current > SILENCIO_DO_CELULAR_MS) setFase("desconectado");
    }, 1000);
    return () => window.clearInterval(t);
  }, [fase]);

  const publicar = useCallback((estado: EstadoTv) => {
    estadoAtual.current.estado = estado;
    const texto = JSON.stringify(estado);
    if (!codigoAtual.current || texto === estadoAtual.current.enviado) return;
    estadoAtual.current.enviado = texto;
    enviarEstado(codigoAtual.current, estado);
  }, []);

  const novoCodigo = useCallback(() => {
    codigoAtual.current = null;
    setCodigo(null);
    setUrl(null);
    setGeracao((g) => g + 1);
  }, []);

  return { fase, codigo, url, erro, publicar, novoCodigo };
}
