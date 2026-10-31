import { estado } from "@/features/pareamento/rotas";

export const dynamic = "force-dynamic";
export function POST(request: Request) {
  return estado(request);
}
