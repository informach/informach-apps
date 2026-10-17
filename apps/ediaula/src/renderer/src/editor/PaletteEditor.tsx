import {
  type Palette,
  type PaletteColor,
  paletteSwatches,
  ROLE_LABEL,
  ROLES,
  type Role,
} from "@shared/palettes";
import { Copy, Palette as PaletteIcon, Plus, Trash2, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  allPalettes,
  applyPalette,
  duplicatePalette,
  recolorCount,
  useActivePalette,
  usePalettes,
} from "@/lib/palettes";
import { useApp } from "@/state/app";
import { useProject } from "@/state/project";
import { Button, IconButton, Modal, Toggle } from "@/ui";
import { FontPicker } from "./FontPicker";

/** Lines like "Fundo $bg · #E9EEF6" or "#1B5CF3 Azul": one color per line, the words around it as its name. */
export function parseColorList(text: string): PaletteColor[] {
  const out: PaletteColor[] = [];
  for (const line of text.split("\n")) {
    const m = /#([0-9a-f]{6}|[0-9a-f]{3})\b/i.exec(line);
    if (!m) continue;
    let hex = m[1];
    if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c);
    const name = line
      .replace(m[0], "")
      .replace(/\$[\w-]+/g, "")
      .replace(/[·•:|,-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    out.push({ hex: `#${hex.toUpperCase()}`, name: name || `#${hex.toUpperCase()}` });
  }
  return out;
}

/** Project palette: pick one, see its colors, recolor what is already in the lesson, edit palettes. */
export function PaletteSection(): ReactNode {
  const project = useProject((s) => s.project);
  const user = usePalettes((s) => s.user);
  const active = useActivePalette();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!project) return null;
  const count = recolorCount(project);
  const setFonts = async (on: boolean): Promise<void> => {
    setBusy(true);
    const n = await applyPalette(active.id, { fonts: on });
    setBusy(false);
    useApp
      .getState()
      .toast(
        on
          ? `Fontes do tema ${active.name} em uso${n ? ` (${n} anotação(ões) atualizada(s))` : ""}.`
          : "De volta à fonte padrão do EdiAula (fontes escolhidas à mão ficaram).",
        "success",
      );
  };
  const recolor = async (): Promise<void> => {
    setBusy(true);
    const n = await applyPalette(active.id, { recolor: true });
    setBusy(false);
    useApp
      .getState()
      .toast(
        `Aula recolorida com a paleta ${active.name}${n ? ` (${n} anotação(ões) redesenhada(s))` : ""}. Ctrl+Z desfaz.`,
        "success",
      );
  };
  return (
    <div className="props-section palette-section">
      <div className="props-head">
        <h3>
          <PaletteIcon size={13} /> Paleta de cores
        </h3>
        <button type="button" className="link-btn" onClick={() => setEditing(true)}>
          Editar paletas…
        </button>
      </div>
      <select
        className="input"
        value={active.id}
        onChange={(e) => void applyPalette(e.target.value)}
      >
        {allPalettes(user).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <div className="palette-strip">
        {paletteSwatches(active).map((c) => (
          <span
            key={c.hex}
            style={{ background: c.hex }}
            title={`${c.name} · ${c.hex}${c.note ? ` — ${c.note}` : ""}`}
          />
        ))}
      </div>
      <p className="props-hint muted">
        Anotações, templates e cartelas novas saem nestas cores; as bolinhas de cor mostram só esta
        paleta.
      </p>
      {(active.fonts?.heading || active.fonts?.body) && (
        <div className="props-head theme-fonts">
          <span className="field-label">
            Fontes do tema:{" "}
            {active.fonts.heading && (
              <span style={{ fontFamily: `"${active.fonts.heading}"`, fontWeight: 700 }}>
                {active.fonts.heading}
              </span>
            )}
            {active.fonts.heading && active.fonts.body && " nos títulos, "}
            {active.fonts.body && (
              <span style={{ fontFamily: `"${active.fonts.body}"` }}>{active.fonts.body}</span>
            )}
            {active.fonts.body && " no texto"}
          </span>
          <Toggle
            on={!!project.paletteFonts}
            onChange={(v) => void setFonts(v)}
            label="Usar as fontes do tema"
          />
        </div>
      )}
      {count > 0 && (
        <Button size="sm" disabled={busy} onClick={() => void recolor()}>
          {busy ? "Recolorindo…" : `Recolorir o que já está na aula (${count})`}
        </Button>
      )}
      {editing && <PaletteDialog onClose={() => setEditing(false)} />}
    </div>
  );
}

function RolePicker({
  role,
  palette,
  onPick,
  readOnly,
}: {
  role: Role;
  palette: Palette;
  onPick: (hex: string) => void;
  readOnly: boolean;
}): ReactNode {
  const value = palette.roles[role];
  return (
    <label className="role-row" title={ROLE_LABEL[role].hint}>
      <span className="role-dot" style={{ background: value }} />
      <span className="role-text">
        <strong>{ROLE_LABEL[role].label}</strong>
        <small className="muted">{ROLE_LABEL[role].hint}</small>
      </span>
      <select
        className="input"
        value={value.toUpperCase()}
        disabled={readOnly}
        onChange={(e) => onPick(e.target.value)}
      >
        {!palette.colors.some((c) => c.hex.toUpperCase() === value.toUpperCase()) && (
          <option value={value.toUpperCase()}>{value}</option>
        )}
        {palette.colors.map((c) => (
          <option key={c.id ?? c.hex} value={c.hex.toUpperCase()}>
            {c.name} · {c.hex}
          </option>
        ))}
      </select>
    </label>
  );
}

/** All palettes: the built-in ones (duplicate to change) and the user's own, editable. */
export function PaletteDialog({ onClose }: { onClose: () => void }): ReactNode {
  const user = usePalettes((s) => s.user);
  const save = usePalettes((s) => s.save);
  const active = useActivePalette();
  const [selected, setSelected] = useState(active.id);
  const [paste, setPaste] = useState("");
  const list = allPalettes(user);
  const palette = list.find((p) => p.id === selected) ?? list[0];
  const readOnly = !!palette.builtIn;

  const update = (fn: (p: Palette) => Palette): void => {
    void save(user.map((p) => (p.id === palette.id ? fn(p) : p)));
  };
  const duplicate = (): void => {
    const copy = duplicatePalette(palette, user);
    void save([...user, copy]);
    setSelected(copy.id);
  };
  const create = (): void => {
    const p: Palette = {
      id: `p${Date.now().toString(36)}`,
      name: "Nova paleta",
      colors: [
        { hex: "#121A30", name: "Escuro" },
        { hex: "#FFFFFF", name: "Branco" },
        { hex: "#1B5CF3", name: "Principal" },
      ],
      roles: {
        dark: "#121A30",
        light: "#FFFFFF",
        ink: "#121A30",
        accent: "#1B5CF3",
        highlight: "#1B5CF3",
        primary: "#1B5CF3",
        success: "#1B5CF3",
        alert: "#1B5CF3",
        creative: "#1B5CF3",
      },
    };
    void save([...user, p]);
    setSelected(p.id);
  };
  const remove = (): void => {
    void save(user.filter((p) => p.id !== palette.id));
    setSelected(list[0].id);
  };
  const setColor = (i: number, c: Partial<PaletteColor>): void => {
    update((p) => {
      const old = p.colors[i].hex.toUpperCase();
      const colors = p.colors.map((x, j) => (j === i ? { ...x, ...c } : x));
      // A role that pointed at the edited color follows it.
      const roles = c.hex
        ? (Object.fromEntries(
            ROLES.map((r) => [
              r,
              p.roles[r].toUpperCase() === old ? c.hex!.toUpperCase() : p.roles[r],
            ]),
          ) as Record<Role, string>)
        : p.roles;
      return { ...p, colors, roles };
    });
  };
  const addPasted = (): void => {
    const colors = parseColorList(paste);
    if (!colors.length) {
      useApp.getState().toast("Nenhuma cor #RRGGBB encontrada no texto colado.", "info");
      return;
    }
    update((p) => ({ ...p, colors: [...p.colors, ...colors] }));
    setPaste("");
  };

  return (
    <Modal label="Paletas de cores" onClose={onClose} width={980}>
      <div className="export-head">
        <PaletteIcon size={18} className="accent" />
        <div className="spacer">
          <h2 className="modal-title">Paletas de cores</h2>
          <p className="muted">
            Cada cor tem um nome; os papéis dizem onde ela entra (fundo das cartelas, destaque,
            alerta…).
          </p>
        </div>
        <IconButton icon={X} label="Fechar" onClick={onClose} />
      </div>
      <div className="palette-dialog">
        <nav className="palette-list">
          {list.map((p) => (
            <button
              type="button"
              key={p.id}
              className={`palette-item ${p.id === palette.id ? "is-active" : ""}`}
              onClick={() => setSelected(p.id)}
            >
              <span className="palette-mini">
                {(
                  [
                    "dark",
                    "accent",
                    "highlight",
                    "primary",
                    "success",
                    "alert",
                    "creative",
                  ] as Role[]
                ).map((r) => (
                  <span key={r} style={{ background: p.roles[r] }} />
                ))}
              </span>
              <span>
                {p.name}
                {p.builtIn && <small className="muted"> · pronta</small>}
                {p.id === active.id && <small className="accent"> · nesta aula</small>}
              </span>
            </button>
          ))}
          <Button size="sm" icon={Plus} onClick={create}>
            Nova paleta
          </Button>
        </nav>
        <div className="palette-editor">
          <div className="row-6">
            <input
              className="input palette-name"
              value={palette.name}
              disabled={readOnly}
              onChange={(e) => update((p) => ({ ...p, name: e.target.value }))}
            />
            <Button size="sm" icon={Copy} onClick={duplicate}>
              Duplicar
            </Button>
            {!readOnly && (
              <Button size="sm" variant="ghost" icon={Trash2} onClick={remove}>
                Excluir
              </Button>
            )}
            {palette.id !== active.id && (
              <Button size="sm" variant="primary" onClick={() => void applyPalette(palette.id)}>
                Usar nesta aula
              </Button>
            )}
          </div>
          {readOnly && (
            <p className="props-hint muted">
              Paleta pronta: duplique para mudar as cores ou os papéis.
            </p>
          )}
          <div className="palette-columns">
            <div>
              <h3 className="palette-h">Cores</h3>
              <div className="palette-colors">
                {palette.colors.map((c, i) => (
                  <div key={c.id ?? c.hex} className="palette-color">
                    <input
                      type="color"
                      value={c.hex}
                      disabled={readOnly}
                      onChange={(e) => setColor(i, { hex: e.target.value.toUpperCase() })}
                      aria-label={`Cor ${c.name}`}
                    />
                    <input
                      className="input mono hex-input"
                      value={c.hex}
                      disabled={readOnly}
                      onChange={(e) =>
                        /^#[0-9a-f]{6}$/i.test(e.target.value) &&
                        setColor(i, { hex: e.target.value.toUpperCase() })
                      }
                    />
                    <span className="palette-color-text">
                      <input
                        className="input"
                        value={c.name}
                        disabled={readOnly}
                        onChange={(e) => setColor(i, { name: e.target.value })}
                      />
                      {c.note && <small className="muted">{c.note}</small>}
                    </span>
                    {!readOnly && (
                      <IconButton
                        icon={Trash2}
                        size={13}
                        label="Tirar cor"
                        onClick={() =>
                          update((p) => ({ ...p, colors: p.colors.filter((_, j) => j !== i) }))
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
              {!readOnly && (
                <>
                  <Button
                    size="sm"
                    icon={Plus}
                    onClick={() =>
                      update((p) => ({
                        ...p,
                        colors: [...p.colors, { hex: "#888888", name: "Nova cor" }],
                      }))
                    }
                  >
                    Adicionar cor
                  </Button>
                  <textarea
                    className="input palette-paste"
                    rows={3}
                    placeholder={
                      "Cole uma lista de cores, uma por linha:\nFundo $bg · #E9EEF6\nAzul #1B5CF3"
                    }
                    value={paste}
                    onChange={(e) => setPaste(e.target.value)}
                  />
                  {paste.trim() && (
                    <Button size="sm" onClick={addPasted}>
                      Adicionar {parseColorList(paste).length} cor(es) coladas
                    </Button>
                  )}
                </>
              )}
            </div>
            <div>
              <h3 className="palette-h">Fontes</h3>
              {readOnly ? (
                <p className="props-hint muted">
                  Títulos: {palette.fonts?.heading ?? "padrão (Plus Jakarta Sans)"} · Texto:{" "}
                  {palette.fonts?.body ?? "padrão (Plus Jakarta Sans)"}
                </p>
              ) : (
                <>
                  <FontPicker
                    label="Títulos (título, cartela, passo)"
                    value={palette.fonts?.heading}
                    onChange={(heading) =>
                      update((p) => ({ ...p, fonts: { ...p.fonts, heading } }))
                    }
                  />
                  <FontPicker
                    label="Texto (balões, notas, rótulos, legenda)"
                    value={palette.fonts?.body}
                    onChange={(body) => update((p) => ({ ...p, fonts: { ...p.fonts, body } }))}
                  />
                </>
              )}
              <h3 className="palette-h">Papéis</h3>
              {ROLES.map((r) => (
                <RolePicker
                  key={r}
                  role={r}
                  palette={palette}
                  readOnly={readOnly}
                  onPick={(hex) => update((p) => ({ ...p, roles: { ...p.roles, [r]: hex } }))}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
