import Link from "next/link";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="brand" aria-label="Bora Treinar, início">
      <i />
      Bora Treinar
    </Link>
  );
}
