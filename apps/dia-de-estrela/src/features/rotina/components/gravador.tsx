"use client";
import { Mic, Play, Square, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { Erro, useAcao } from "@/components/acao";
import { apagarVozAction, salvarVozAction } from "../actions";

const MAX_MS = 15_000;

function paraDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(blob);
  });
}

/** Grava a voz de um adulto chamando para a tarefa ("Filho, hora do banho!"). */
export function GravadorDeVoz({
  taskId,
  temVoz,
  podeGravar,
}: {
  taskId: string;
  temVoz: boolean;
  podeGravar: boolean;
}) {
  const [gravando, setGravando] = useState(false);
  const gravador = useRef<MediaRecorder | null>(null);
  const limite = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { pendente, erro, setErro, rodar } = useAcao();

  if (!podeGravar)
    return (
      <p className="rounded-xl bg-uva-clara p-3 text-sm font-bold text-uva-escura">
        Gravar a sua voz no lembrete é do Compasso.{" "}
        <Link href="/ajustes#plano" className="underline">
          Ver planos
        </Link>
      </p>
    );

  async function comecar() {
    setErro(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const pedacos: Blob[] = [];
      const r = new MediaRecorder(stream);
      const inicio = Date.now();
      r.ondataavailable = (e) => pedacos.push(e.data);
      r.onstop = async () => {
        clearTimeout(limite.current);
        for (const faixa of stream.getTracks()) faixa.stop();
        const duracao = Math.min(MAX_MS, Date.now() - inicio);
        const blob = new Blob(pedacos, { type: r.mimeType });
        const audio = await paraDataUrl(blob);
        rodar(() => salvarVozAction({ taskId, audio, durationMs: Math.max(300, duracao) }));
      };
      r.start();
      gravador.current = r;
      setGravando(true);
      limite.current = setTimeout(() => parar(), MAX_MS);
    } catch {
      setErro("Não foi possível usar o microfone. Confira a permissão do navegador.");
    }
  }

  function parar() {
    gravador.current?.state === "recording" && gravador.current.stop();
    setGravando(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-uva-clara p-3">
      <div className="min-w-40 flex-1">
        <p className="font-extrabold">Sua voz no lembrete</p>
        <p className="text-sm font-bold text-uva-escura">
          {gravando
            ? "Gravando… fale uma frase curta (até 15 s)."
            : temVoz
              ? "Gravada. Toca no lugar da voz do aparelho."
              : "Ex.: “Filho, hora do banho!”"}
        </p>
      </div>
      {gravando ? (
        <button type="button" className="bp bp-perigo" onClick={parar}>
          <Square className="size-4" aria-hidden="true" /> Parar
        </button>
      ) : (
        <button type="button" className="bp bp-claro" disabled={pendente} onClick={comecar}>
          <Mic className="size-4" aria-hidden="true" /> {temVoz ? "Regravar" : "Gravar"}
        </button>
      )}
      {temVoz && !gravando && (
        <>
          <button
            type="button"
            className="grid size-11 place-items-center rounded-full bg-uva-escura text-white"
            aria-label="Ouvir a gravação"
            onClick={() =>
              void new Audio(`/api/voz/${taskId}?v=${Date.now()}`).play().catch(() => {})
            }
          >
            <Play className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="grid size-11 place-items-center rounded-full text-uva-escura"
            aria-label="Apagar a gravação"
            disabled={pendente}
            onClick={() => rodar(() => apagarVozAction(taskId))}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        </>
      )}
      <div className="w-full">
        <Erro texto={erro} />
      </div>
    </div>
  );
}
