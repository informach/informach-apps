import { toast } from "@informach/ui/components/sonner";

/**
 * O convite da turma como link, pela folha de compartilhar do celular, com
 * queda para copiar.
 *
 * O código já é a credencial (quem o tem vincula qualquer criança à turma),
 * então o link não abre nada novo; só tira o erro de digitação do caminho de
 * quem recebe no grupo da turma. Família › Crianças e a folha da turma usam
 * este mesmo convite.
 */
export async function shareTurmaInvite(turma: { code: string; label: string }) {
  const url = `${window.location.origin}/turmas/entrar?codigo=${turma.code}`;
  const text = `Entre na turma ${turma.label} na Agenda da Turma: ${url}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: "Convite da turma", text, url });
      return;
    } catch (error) {
      // Fechar a folha de compartilhamento é uma decisão, não uma falha:
      // copiar o link assim mesmo faria o oposto do que a pessoa pediu.
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link de convite copiado");
  } catch {
    toast.error("Não foi possível copiar o link");
  }
}
