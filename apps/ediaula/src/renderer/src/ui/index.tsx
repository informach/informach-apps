import { showModalOnMount, withRenderKeys } from "@informach/edi-desktop/renderer";
import type { LucideIcon } from "lucide-react";
import {
  type ButtonHTMLAttributes,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

type Variant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: LucideIcon;
  size?: "md" | "sm";
}

export function Button({
  variant = "secondary",
  icon: Icon,
  size = "md",
  children,
  className = "",
  ...rest
}: ButtonProps): ReactNode {
  return (
    <button className={`btn btn-${variant} btn-${size} ${className}`} {...rest}>
      {Icon && <Icon size={size === "sm" ? 13 : 15} strokeWidth={2} />}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  size?: number;
}

export function IconButton({
  icon: Icon,
  label,
  active,
  size = 15,
  className = "",
  ...rest
}: IconButtonProps): ReactNode {
  return (
    <button
      className={`icon-btn ${active ? "is-active" : ""} ${className}`}
      title={label}
      aria-label={label}
      {...rest}
    >
      <Icon size={size} strokeWidth={2} />
    </button>
  );
}

export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}): ReactNode {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`toggle ${on ? "is-on" : ""}`}
      onClick={() => onChange(!on)}
    >
      <span className="toggle-knob" />
    </button>
  );
}

export function Chip({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
}): ReactNode {
  return (
    <button type="button" className={`chip ${active ? "is-active" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "accent",
}: {
  children: ReactNode;
  tone?: "accent" | "muted" | "amber" | "blue";
}): ReactNode {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Kbd({ children }: { children: ReactNode }): ReactNode {
  return <kbd className="kbd">{children}</kbd>;
}

export interface MenuItem {
  label: string;
  shortcut?: string;
  onSelect?: () => void;
  disabled?: boolean;
  separator?: boolean;
}

/** Text button that opens a dropdown of actions. */
export function Menu({ label, items }: { label: string; items: MenuItem[] }): ReactNode {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className={`menu-trigger ${open ? "is-open" : ""}`}
        onClick={() => setOpen(!open)}
      >
        {label}
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          {withRenderKeys(items, (item) => (item.separator ? "separator" : (item.label ?? ""))).map(
            ({ key, value: it }) =>
              it.separator ? (
                <div key={key} className="menu-sep" />
              ) : (
                <button
                  type="button"
                  key={key}
                  className="menu-item"
                  role="menuitem"
                  disabled={it.disabled}
                  onClick={() => {
                    setOpen(false);
                    it.onSelect?.();
                  }}
                >
                  <span>{it.label}</span>
                  {it.shortcut && <span className="menu-shortcut">{it.shortcut}</span>}
                </button>
              ),
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Right-click menu at the mouse (kept inside the window). Closes on a click outside, Escape,
 * scrolling or leaving the window.
 */
export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: (MenuItem & { icon?: LucideIcon; hint?: string })[];
  onClose: () => void;
}): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (r)
      setPos({
        x: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)),
        y: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)),
      });
  }, [x, y]);
  useEffect(() => {
    const down = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", down, true);
    window.addEventListener("keydown", key);
    window.addEventListener("wheel", onClose, { passive: true });
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("mousedown", down, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("wheel", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      className="menu-pop context-menu"
      role="menu"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {withRenderKeys(items, (item) => (item.separator ? "separator" : (item.label ?? ""))).map(
        ({ key, value: it }) =>
          it.separator ? (
            <div key={key} className="menu-sep" />
          ) : (
            <button
              type="button"
              key={key}
              className="menu-item"
              role="menuitem"
              disabled={it.disabled}
              title={it.hint}
              onClick={() => {
                onClose();
                it.onSelect?.();
              }}
            >
              <span className="menu-label">
                {it.icon && <it.icon size={14} />}
                {it.label}
              </span>
              {it.shortcut && <span className="menu-shortcut">{it.shortcut}</span>}
            </button>
          ),
      )}
    </div>
  );
}

export function Modal({
  children,
  onClose,
  width = 560,
  label,
}: {
  children: ReactNode;
  onClose: () => void;
  width?: number;
  label: string;
}): ReactNode {
  return (
    <dialog
      ref={showModalOnMount}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      style={{
        margin: 0,
        padding: 0,
        border: 0,
        maxWidth: "none",
        maxHeight: "none",
        width: "100vw",
        height: "100vh",
      }}
      className="scrim"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal" style={{ width }}>
        {children}
      </div>
    </dialog>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}): ReactNode {
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="field-label">{label}</legend>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </fieldset>
  );
}

export function Progress({ ratio }: { ratio: number }): ReactNode {
  return (
    <div className="progress">
      <div
        className="progress-fill"
        style={{ width: `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%` }}
      />
    </div>
  );
}
