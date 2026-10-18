import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

/** Rótulo ligado ao campo por `htmlFor`; a dica é anunciada pelo `aria-describedby` do campo. */
export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-bold">
        {label}
      </label>
      {children}
      {hint ? (
        <span id={`${htmlFor}-dica`} className="text-[13px] font-medium text-ink-muted">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export function TextInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`min-h-[50px] w-full rounded-xl border-[1.5px] border-field bg-surface px-3.5 font-medium text-ink placeholder:text-ink-muted ${className}`}
    />
  );
}

export function CodeInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <TextInput
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9 ]*"
      {...props}
      className="min-h-14 font-mono text-2xl tracking-[0.2em]"
    />
  );
}

type Variant = "primary" | "action" | "danger" | "ghost" | "quiet";

// O recuo lateral fica em cada variante: o botão discreto é um link alinhado ao
// texto, e um `px-0` vindo de fora não ganharia do `px-4` da base no CSS.
const VARIANT: Record<Variant, string> = {
  primary: "px-4 bg-night text-white",
  action: "px-4 bg-sphere-strong text-white",
  danger: "px-4 bg-bad text-white",
  ghost: "px-4 border border-line-warm bg-surface text-ink",
  quiet: "px-0 bg-transparent text-ink underline underline-offset-2",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl font-extrabold disabled:cursor-not-allowed disabled:opacity-60 ${VARIANT[variant]} ${className}`}
    />
  );
}

/** Mensagem do formulário, anunciada para leitor de tela. */
export function FormMessage({
  tone,
  children,
}: {
  tone: "ok" | "bad" | "info";
  children: ReactNode;
}) {
  const className = {
    ok: "bg-ok-wash text-ok",
    bad: "bg-bad-wash text-bad",
    info: "bg-info-wash text-info",
  }[tone];
  return (
    <p
      role={tone === "bad" ? "alert" : "status"}
      className={`m-0 rounded-xl px-3.5 py-2.5 text-sm font-semibold ${className}`}
    >
      {children}
    </p>
  );
}
