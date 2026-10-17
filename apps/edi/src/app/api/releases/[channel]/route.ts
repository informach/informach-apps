import { releaseCatalog } from "@/features/releases/handlers";
export async function GET(_request: Request, context: { params: Promise<{ channel: string }> }) {
  return releaseCatalog((await context.params).channel);
}
