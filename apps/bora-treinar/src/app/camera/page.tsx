import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { ALFABETO_CODIGO, TAMANHO_CODIGO } from "@/features/pareamento/protocolo";

export const metadata = { title: "Conectar o celular" };

async function abrir(form: FormData) {
  "use server";
  const codigo = String(form.get("codigo") ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  redirect(`/camera/${encodeURIComponent(codigo)}`);
}

/** Para quem não consegue ler o QR: digita o código que aparece na TV. */
export default function DigitarCodigo() {
  return (
    <main className="profiles" id="conteudo">
      <Brand />
      <h1>Usar o celular como câmera</h1>
      <form action={abrir} className="new-profile">
        <input
          className="field otp"
          name="codigo"
          aria-label="Código que aparece na TV"
          placeholder="CÓDIGO DA TV"
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={TAMANHO_CODIGO + 2}
          pattern={`[${ALFABETO_CODIGO}${ALFABETO_CODIGO.toLowerCase()} -]{${TAMANHO_CODIGO},${TAMANHO_CODIGO + 2}}`}
          required
          data-autofocus
        />
        <button type="submit" className="btn primary big">
          Conectar
        </button>
        <p className="muted small">
          A imagem da câmera fica só neste celular: ele conta as repetições e manda para a TV só o
          resultado.
        </p>
      </form>
    </main>
  );
}
