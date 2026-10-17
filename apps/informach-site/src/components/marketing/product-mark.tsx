import { cn } from "@informach/ui/lib/utils";
import Image from "next/image";
import type { SiteProduct } from "@/lib/products";

/**
 * Ícone de um produto. O Sistema Zero não tem ícone quadrado próprio: entra o
 * Zappy, a assistente da plataforma, sobre o azul do logotipo.
 */
export function ProductMark({
  product,
  size = 68,
  className,
}: {
  product: SiteProduct;
  size?: number;
  className?: string;
}) {
  const radius = Math.round(size * 0.29);
  if (product.slug === "sistema-zero")
    return (
      <span
        className={cn("relative inline-block shrink-0 overflow-hidden bg-[#0062D6]", className)}
        style={{ width: size, height: size, borderRadius: radius }}
      >
        <Image
          src={product.icon}
          alt=""
          width={360}
          height={458}
          sizes={`${Math.round(size * 0.76)}px`}
          className="absolute inset-x-[12%] bottom-[-6%] h-auto w-[76%]"
        />
      </span>
    );
  return (
    <Image
      src={product.icon}
      alt=""
      width={size}
      height={size}
      unoptimized={product.icon.endsWith(".svg")}
      className={cn("shrink-0", className)}
      style={{ width: size, height: size, borderRadius: radius }}
    />
  );
}
