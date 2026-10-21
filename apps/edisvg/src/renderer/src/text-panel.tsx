import { type Asset, assertTextCoverage, resolveFontStack } from "@informach/edi-motion/assets";
import { useId, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Scene, SceneNode } from "../../shared/sceneTypes";
import { textPathFromShape, textPathSources } from "../../shared/textPath";

interface Props {
  scene: Scene;
  node: SceneNode;
  locked: boolean;
  execute(commands: unknown[]): void;
  assets: Asset[];
}
function TextPanel({ scene, node, locked, execute, assets }: Props) {
  const id = useId(),
    [error, setError] = useState(""),
    [text, setText] = useState(node.text),
    [primary, setPrimary] = useState(node.fontAssetId ?? ""),
    [fallback, setFallback] = useState(
      (node.fontFallbackIds ?? []).map((assetId, key) => ({ key, assetId })),
    ),
    nextKey = useRef(fallback.length),
    fonts = assets.filter((asset) => asset.kind === "font"),
    coverage = useMemo(() => {
      if (!primary) return "Fonte do sistema: disponibilidade e cobertura dependem do consumidor.";
      try {
        const stack = resolveFontStack(new Map(assets.map((asset) => [asset.id, asset])), {
            fontAssetId: primary,
            fontFallbackIds: fallback.map((row) => row.assetId),
          }),
          report = assertTextCoverage(text, stack);
        return `Cobertura cmap verificada: ${report.graphemes} grupos de caracteres. Scripts que exigem formas contextuais (árabe, índicos e outros) têm suporte OpenType declarado na fonte; o shaping em si é feito pelo motor da plataforma.`;
      } catch (error) {
        return error instanceof Error
          ? error.message
          : "Não foi possível verificar a cobertura da fonte.";
      }
    }, [assets, primary, fallback, text]);
  return (
    <section>
      <h3>TEXTO</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          const value = (key: string) => {
            const raw = fields.get(key);
            if (typeof raw !== "string") throw new Error("Campo de texto inválido.");
            return raw;
          };
          try {
            execute([
              {
                type: "asset",
                operation: "set-font",
                assetId: primary || null,
                fontFallbackIds: fallback.map((row) => row.assetId),
                targetId: node.id,
              },
              { type: "scene", operation: "text", targetId: node.id, value: text },
              // A text on a curve has one line; its layout stays out of the request.
              ...(node.textPath
                ? []
                : [
                    {
                      type: "scene",
                      operation: "text-layout",
                      targetId: node.id,
                      value: { lineHeight: Number(value("lineHeight")) },
                    },
                  ]),
              {
                type: "scene",
                operation: "attrs",
                targetId: node.id,
                value: Object.fromEntries(
                  [
                    "font-family",
                    "font-size",
                    "font-weight",
                    "font-style",
                    "text-anchor",
                    "letter-spacing",
                    "word-spacing",
                  ].map((key) => [key, value(key)]),
                ),
              },
              {
                type: "scene",
                operation: "text-direction",
                targetId: node.id,
                value: value("direction"),
              },
            ]);
          } catch (error) {
            setError(error instanceof Error ? error.message : "Texto recusado.");
          }
        }}
      >
        <fieldset disabled={locked}>
          <label className="scene-field" htmlFor={id}>
            Conteúdo
          </label>
          <textarea
            id={id}
            aria-label="Conteúdo"
            name="text"
            maxLength={10000}
            rows={4}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <label className="scene-field">
            Fonte incorporada
            <select
              name="fontAssetId"
              value={primary}
              aria-describedby={`${id}-coverage`}
              onChange={(event) => {
                const value = event.target.value;
                setPrimary(value);
                setFallback((rows) => (value ? rows.filter((row) => row.assetId !== value) : []));
              }}
            >
              <option value="">Usar fonte do sistema</option>
              {fonts.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}
                </option>
              ))}
            </select>
          </label>
          {primary && (
            <fieldset className="font-stack-fields">
              <legend>Fontes alternativas — em ordem</legend>
              {fallback.map((row, index) => (
                <div key={row.key} className="font-stack-row">
                  <label className="scene-field">
                    Alternativa {index + 1}
                    <select
                      value={row.assetId}
                      aria-label={`Alternativa ${index + 1}`}
                      aria-describedby={`${id}-coverage`}
                      onChange={(event) => {
                        const assetId = event.target.value;
                        setFallback((rows) =>
                          rows.map((entry) =>
                            entry.key === row.key ? { ...entry, assetId } : entry,
                          ),
                        );
                      }}
                    >
                      {fonts
                        .filter(
                          (asset) =>
                            asset.id !== primary &&
                            (!fallback.some((other) => other.assetId === asset.id) ||
                              asset.id === row.assetId),
                        )
                        .map((asset) => (
                          <option key={asset.id} value={asset.id}>
                            {asset.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={index === 0}
                    aria-label={`Subir fonte alternativa ${index + 1}`}
                    onClick={() =>
                      setFallback((rows) => {
                        const previous = rows[index - 1];
                        if (!previous) return rows;
                        return rows.map((entry, at) =>
                          at === index - 1 ? row : at === index ? previous : entry,
                        );
                      })
                    }
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={index === fallback.length - 1}
                    aria-label={`Descer fonte alternativa ${index + 1}`}
                    onClick={() =>
                      setFallback((rows) => {
                        const following = rows[index + 1];
                        if (!following) return rows;
                        return rows.map((entry, at) =>
                          at === index + 1 ? row : at === index ? following : entry,
                        );
                      })
                    }
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Remover fonte alternativa ${index + 1}`}
                    onClick={() =>
                      setFallback((rows) => rows.filter((entry) => entry.key !== row.key))
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                disabled={
                  fallback.length >= 7 ||
                  !fonts.some(
                    (font) =>
                      font.id !== primary && !fallback.some((row) => row.assetId === font.id),
                  )
                }
                onClick={() => {
                  const available = fonts.find(
                    (font) =>
                      font.id !== primary && !fallback.some((row) => row.assetId === font.id),
                  );
                  if (available) {
                    const key = nextKey.current++;
                    setFallback((rows) => [...rows, { key, assetId: available.id }]);
                  }
                }}
              >
                Adicionar fonte alternativa
              </button>
            </fieldset>
          )}
          <p id={`${id}-coverage`} role="status" className="micro">
            {coverage}
          </p>
          <label className="scene-field">
            Família de fonte
            <input
              name="font-family"
              autoComplete="off"
              required
              maxLength={200}
              defaultValue={node.attrs["font-family"] ?? "Arial, sans-serif"}
            />
          </label>
          <label className="scene-field">
            Tamanho
            <input
              name="font-size"
              type="number"
              required
              min="1"
              max="10000"
              step="any"
              defaultValue={node.attrs["font-size"] ?? "16"}
            />
          </label>
          <label className="scene-field">
            Peso
            <input
              name="font-weight"
              autoComplete="off"
              required
              maxLength={7}
              defaultValue={node.attrs["font-weight"] ?? "normal"}
            />
          </label>
          <label className="scene-field">
            Estilo
            <select name="font-style" defaultValue={node.attrs["font-style"] ?? "normal"}>
              <option value="normal">Normal</option>
              <option value="italic">Itálico</option>
              <option value="oblique">Oblíquo</option>
            </select>
          </label>
          <label className="scene-field">
            Alinhamento
            <select name="text-anchor" defaultValue={node.attrs["text-anchor"] ?? "start"}>
              <option value="start">Início</option>
              <option value="middle">Centro</option>
              <option value="end">Fim</option>
            </select>
          </label>
          <label className="scene-field">
            Direção
            <select
              name="direction"
              defaultValue={node.textDirection ?? node.attrs.direction ?? "ltr"}
            >
              <option value="auto">Automática (primeiro caractere forte)</option>
              <option value="ltr">Esquerda para direita</option>
              <option value="rtl">Direita para esquerda</option>
            </select>
          </label>
          <label className="scene-field">
            Espaço entre letras
            <input
              name="letter-spacing"
              type="number"
              required
              min="-10000"
              max="10000"
              step="any"
              defaultValue={node.attrs["letter-spacing"] ?? "0"}
            />
          </label>
          <label className="scene-field">
            Espaço entre palavras
            <input
              name="word-spacing"
              type="number"
              required
              min="-10000"
              max="10000"
              step="any"
              defaultValue={node.attrs["word-spacing"] ?? "0"}
            />
          </label>
          {node.textPath ? null : (
            <label className="scene-field">
              Altura de linha (em)
              <input
                name="lineHeight"
                type="number"
                required
                min=".25"
                max="10"
                step="any"
                defaultValue={node.textLayout?.lineHeight ?? 1.2}
              />
            </label>
          )}
          <button type="submit">Aplicar texto</button>
        </fieldset>
        <p role="status">{error}</p>
        <p className="micro">
          Enter cria linhas explícitas. Texto permanece editável no player; shaping e escrita
          bidirecional usam o motor SVG da plataforma. A direção automática segue o primeiro
          caractere forte do texto, também quando ele muda por dados. Fontes TTF/OTF incorporadas
          são carregadas antes de Testar/exportar. Sem uma fonte incorporada, a família depende do
          sistema do consumidor. A cadeia verifica a cobertura cmap do grupo inteiro e, para scripts
          com formas contextuais, se a fonte declara o script no GSUB; uma falha impede os novos
          testes/exports portáteis até ajuste. Wrapping automático e contornos seguem em evolução.
        </p>
      </form>
      <TextPathForm scene={scene} node={node} locked={locked} execute={execute} />
    </section>
  );
}
/** Lays the text along its own copy of a sibling shape's outline. */
function TextPathForm({ scene, node, locked, execute }: Omit<Props, "assets">) {
  const [error, setError] = useState(""),
    sources = useMemo(() => {
      try {
        return textPathSources(scene, node.id).map(({ node: source }) => source);
      } catch {
        return [];
      }
    }, [scene, node.id]);
  return (
    <form
      aria-label="Texto em caminho"
      onSubmit={(event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget),
          source = String(fields.get("source") ?? ""),
          startOffset = Number(fields.get("startOffset"));
        try {
          const value =
            source === ""
              ? null
              : source === "current" && node.textPath
                ? { ...node.textPath, startOffset }
                : textPathFromShape(scene, node.id, source, startOffset);
          execute([{ type: "scene", operation: "text-path", targetId: node.id, value }]);
          setError("");
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "Caminho recusado.");
        }
      }}
    >
      <fieldset disabled={locked}>
        <legend>Texto em caminho</legend>
        <label className="scene-field">
          Seguir a forma
          <select name="source" defaultValue={node.textPath ? "current" : ""}>
            <option value="">Sem caminho (linhas normais)</option>
            {node.textPath ? <option value="current">Manter a curva atual</option> : null}
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
        </label>
        <label className="scene-field">
          Início no caminho (%)
          <input
            name="startOffset"
            type="number"
            required
            min="0"
            max="100"
            step="any"
            defaultValue={node.textPath?.startOffset ?? 0}
          />
        </label>
        <button type="submit">Aplicar caminho</button>
      </fieldset>
      <p role="status">{error}</p>
      <p className="micro">
        O texto guarda uma cópia do contorno no próprio espaço: mover o texto leva a curva junto, e
        editar a forma depois não muda o texto. Use o Alinhamento (Centro) com início 50% para
        centralizar. Texto em caminho tem uma linha.
      </p>
    </form>
  );
}
export function mountTextPanel(host: Element, props: Props) {
  const root = createRoot(host);
  root.render(<TextPanel {...props} />);
  return () => root.unmount();
}
