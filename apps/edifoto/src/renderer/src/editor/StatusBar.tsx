import { blendLabel } from "@shared/blendModes";
import { Minus, Plus } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { fitView, zoomStep } from "@/lib/view";
import { useDoc } from "@/state/doc";
import { useUi } from "@/state/ui";

export function StatusBar(): ReactNode {
  const tool = useUi((s) => s.tool);
  const size = useDoc((s) => (s.doc ? `${s.doc.width} × ${s.doc.height} px` : ""));
  const active = useDoc((s) => s.doc?.layers.find((l) => l.id === s.activeId));
  const zoom = useUi((s) => s.view.zoom);
  const ai = useUi((s) => s.ai);
  const externalAt = useUi((s) => s.externalAt);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);
  const live = Date.now() - externalAt < 60000;
  return (
    <div className="statusbar">
      <span>{size}</span>
      {size && <span>RGB · 8 bits</span>}
      <span className="muted">EdiFoto · 0.2.0</span>
      {active && (
        <span>
          {active.kind === "vector"
            ? active.vector.shape === "path"
              ? "Traçado ativo: "
              : "Forma ativa: "
            : "Camada ativa: "}
          {active.name} · {blendLabel(active.blendMode)} · {Math.round(active.opacity * 100)}%
        </span>
      )}
      {ai && (
        <span
          className={`status-mcp${live ? " is-live" : ai.mcpRunning ? " is-ready" : ""}`}
          title={
            ai.mcpRunning
              ? `Claude Code, Claude Desktop ou Codex podem editar via ${ai.mcpUrl}`
              : ai.mcpError
          }
        >
          <span className="dot" />
          {live
            ? "Agente externo conectado via MCP"
            : ai.mcpRunning
              ? `MCP pronto · porta ${ai.mcpPort}`
              : ai.mcpEnabled
                ? "MCP indisponível"
                : "MCP desligado"}
        </span>
      )}
      {(tool === "pen" || tool === "shape") && (
        <span
          title={
            tool === "pen"
              ? "Clique para criar · Arraste para curvar · Ctrl move ponto · Enter conclui"
              : "Arraste para desenhar · Shift: proporção · Alt: centro"
          }
        >
          {tool === "pen"
            ? "Ctrl: mover ponto · Enter: concluir"
            : "Shift: proporção · Alt: centro"}
        </span>
      )}
      <span className="spacer" />
      <div className="zoom-ctl">
        <button type="button" onClick={() => zoomStep(-1)} title="Afastar">
          <Minus size={12} />
        </button>
        <span className="mono">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => zoomStep(1)} title="Aproximar">
          <Plus size={12} />
        </button>
        <button type="button" onClick={fitView}>
          Ajustar à tela
        </button>
      </div>
    </div>
  );
}
