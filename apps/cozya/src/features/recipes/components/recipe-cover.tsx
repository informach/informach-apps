import { cn } from "@informach/ui/lib/utils";

const PALETTE = [
  "bg-[#FFE7D1] text-[#F2B48C] dark:bg-[#3D2A1E] dark:text-[#6E4A33]",
  "bg-[#E7EDE3] text-[#B7C8B0] dark:bg-[#1F3A2D] dark:text-[#3D6450]",
  "bg-[#FDF0C9] text-[#E9CF7E] dark:bg-[#3A3220] dark:text-[#6B5A30]",
  "bg-[#E3EAF0] text-[#B4C4D1] dark:bg-[#1D364A] dark:text-[#3E5F7A]",
  "bg-[#F6DDD6] text-[#E3ADA0] dark:bg-[#3D2626] dark:text-[#6E4444]",
  "bg-[#EFE6F3] text-[#CDB8D8] dark:bg-[#2E2639] dark:text-[#584A6B]",
  "bg-[#F3E3D3] text-[#D9B99A] dark:bg-[#38291D] dark:text-[#66503A]",
];

function hash(value: string) {
  let result = 0;
  for (const char of value) result = (result * 31 + char.charCodeAt(0)) >>> 0;
  return result;
}

/**
 * A typographic cover: the first word of the name, very large, cropped by the card.
 * Purely decorative; the name itself is always printed next to it.
 */
export function RecipeCover({ name, className }: { name: string; className?: string }) {
  const word = name.trim().split(/\s+/)[0] ?? name;
  return (
    <div
      aria-hidden
      className={cn("relative overflow-hidden", PALETTE[hash(name) % PALETTE.length], className)}
    >
      <span className="absolute -bottom-[0.22em] -left-[0.06em] whitespace-nowrap text-[3.6rem] font-extrabold leading-none tracking-[-0.05em]">
        {word}
      </span>
    </div>
  );
}
