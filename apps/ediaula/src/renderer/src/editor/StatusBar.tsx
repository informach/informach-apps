import { encoderName, isHardwareEncoder } from "@shared/encoderChoice";
import { projectDuration } from "@shared/timeline";
import { Cpu, Layers, Loader, Timer } from "lucide-react";
import type { ReactNode } from "react";
import { duration } from "@/lib/format";
import { useApp } from "@/state/app";
import { useProject } from "@/state/project";

export function StatusBar(): ReactNode {
  const info = useApp((s) => s.info);
  const jobs = useApp((s) => s.jobs);
  const project = useProject((s) => s.project);
  const list = Object.values(jobs);
  const needProxy = project?.assets.filter((a) => a.proxyStatus !== "none") ?? [];
  const ready = needProxy.filter((a) => a.proxyStatus === "ready").length;

  return (
    <footer className="statusbar">
      <span className="stat">
        <Cpu size={12} className="accent" />
        {info
          ? `${isHardwareEncoder(info.encoder) ? "GPU" : "CPU"}: ${encoderName(info.encoder)}`
          : "Detectando…"}
      </span>
      <span className="stat">
        <Layers size={12} className="accent" />
        {needProxy.length
          ? `Proxies: ${ready}/${needProxy.length} prontos`
          : "Sem proxies necessários"}
      </span>
      <span className="stat">
        <Timer size={12} className="muted" />
        Duração: {duration(project ? projectDuration(project) : 0)}
      </span>
      {list.map((j) => (
        <span key={j.id} className="stat job">
          <Loader size={12} className="spin" />
          {j.label} · {Math.round(j.ratio * 100)}%
        </span>
      ))}
      <span className="spacer" />
      <span className="muted">Ctrl+Z desfaz qualquer edição</span>
    </footer>
  );
}
