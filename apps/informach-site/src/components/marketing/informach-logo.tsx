import { cn } from "@informach/ui/lib/utils";
import Image from "next/image";

export type InformachLogoProps = {
  className?: string;
  priority?: boolean;
  /** `onDark` fixa a versão clara do wordmark, para fundos escuros nos dois temas. */
  tone?: "theme" | "onDark";
};

const ASPECT = { width: 498, height: 102 } as const;

/**
 * Logo Informach. Os assets são SVGs vetoriais: usamos `unoptimized` no
 * next/image para servir o arquivo original sem rasterização (Next por
 * padrão não otimiza SVGs e, sem `unoptimized`, a qualidade vinha ruim).
 * Light/dark via switch CSS para evitar flicker no SSR.
 */
export function InformachLogo({ className, priority = false, tone = "theme" }: InformachLogoProps) {
  if (tone === "onDark")
    return (
      <Image
        src="/logo-informach-dark.svg"
        alt="Informach"
        width={ASPECT.width}
        height={ASPECT.height}
        priority={priority}
        unoptimized
        className={className}
      />
    );
  return (
    <>
      <Image
        src="/logo-informach-light.svg"
        alt="Informach"
        width={ASPECT.width}
        height={ASPECT.height}
        priority={priority}
        unoptimized
        className={cn("dark:hidden", className)}
      />
      <Image
        src="/logo-informach-dark.svg"
        alt=""
        aria-hidden
        width={ASPECT.width}
        height={ASPECT.height}
        priority={priority}
        unoptimized
        className={cn("hidden dark:block", className)}
      />
    </>
  );
}
