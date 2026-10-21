import { semanticSchema } from "@informach/edi-motion/visual";
import { useId, useState } from "react";
import { createRoot } from "react-dom/client";
import type { SceneNode } from "../../shared/sceneTypes";

interface Props {
  node: SceneNode;
  locked: boolean;
  execute(commands: unknown[]): void;
}
function SemanticsPanel({ node, locked, execute }: Props) {
  const id = useId(),
    [kind, setKind] = useState(node.semantics?.kind ?? "automatic"),
    [label, setLabel] = useState(
      node.semantics && node.semantics.kind !== "decorative" ? node.semantics.label : node.name,
    ),
    [description, setDescription] = useState(
      node.semantics && node.semantics.kind !== "decorative"
        ? (node.semantics.description ?? "")
        : "",
    ),
    [live, setLive] = useState(
      node.semantics && node.semantics.kind !== "decorative" ? (node.semantics.live ?? "") : "",
    ),
    [error, setError] = useState("");
  const labelled = kind !== "automatic" && kind !== "decorative";
  return (
    <section className="resource-editor" aria-label="Semântica acessível">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const value =
              kind === "automatic"
                ? null
                : semanticSchema.parse({
                    kind,
                    ...(labelled
                      ? {
                          label,
                          ...(description.trim() ? { description } : {}),
                          ...(live ? { live } : {}),
                        }
                      : {}),
                  });
            execute([{ type: "scene", operation: "semantics", targetId: node.id, value }]);
            setError("");
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Semântica recusada.");
          }
        }}
      >
        <fieldset disabled={locked}>
          <legend>Semântica acessível</legend>
          <label htmlFor={`${id}-kind`}>
            Tipo acessível
            <select
              aria-label="Tipo acessível"
              id={`${id}-kind`}
              value={kind}
              onChange={(event) => {
                const next = event.currentTarget.value;
                if (
                  next === "automatic" ||
                  next === "decorative" ||
                  next === "group" ||
                  next === "image" ||
                  next === "button"
                )
                  setKind(next);
              }}
            >
              <option value="automatic">Automático / sem metadados</option>
              <option value="decorative">Decorativo</option>
              <option value="group">Grupo com significado</option>
              <option value="image">Imagem com significado</option>
              <option value="button">Botão interativo</option>
            </select>
          </label>
          {labelled && (
            <>
              <label htmlFor={`${id}-label`}>
                Nome acessível
                <input
                  aria-label="Nome acessível"
                  id={`${id}-label`}
                  name="label"
                  required
                  maxLength={500}
                  value={label}
                  onChange={(event) => setLabel(event.currentTarget.value)}
                />
              </label>
              <label htmlFor={`${id}-description`}>
                Descrição acessível
                <textarea
                  aria-label="Descrição acessível"
                  id={`${id}-description`}
                  name="description"
                  maxLength={2000}
                  value={description}
                  onChange={(event) => setDescription(event.currentTarget.value)}
                />
              </label>
              <label htmlFor={`${id}-live`}>
                Anunciar mudanças
                <select
                  aria-label="Anunciar mudanças"
                  id={`${id}-live`}
                  value={live}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    if (next === "" || next === "polite" || next === "assertive") setLive(next);
                  }}
                >
                  <option value="">Não (estático)</option>
                  <option value="polite">Sim, quando o leitor estiver livre</option>
                  <option value="assertive">Sim, imediatamente</option>
                </select>
              </label>
            </>
          )}
          <button type="submit">Aplicar semântica</button>
        </fieldset>
        <p className="micro">
          Botões precisam de listener de ativação em Dados. Enter/Espaço ativam; setas operam
          listeners de movimento. Nome e descrição podem seguir um input pelo binding Semântico, em
          Dados; com Anunciar mudanças, o objeto vira região viva. Elementos decorativos não podem
          conter interações. A exportação interativa verifica a árvore inteira; salvar uma
          configuração incompleta continua permitido.
        </p>
        {error && <p role="alert">{error}</p>}
      </form>
    </section>
  );
}
export function mountSemanticsPanel(host: Element, props: Props) {
  const root = createRoot(host);
  root.render(<SemanticsPanel {...props} />);
  return () => root.unmount();
}
