export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2">
      <h2 className="text-xl font-semibold">Página não encontrada</h2>
      <p className="text-sm text-[var(--color-muted-foreground)]">
        O recurso que você procura não existe.
      </p>
    </div>
  );
}
