import { stream } from "@/features/pareamento/rotas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export function GET(request: Request) {
  return stream(request);
}
