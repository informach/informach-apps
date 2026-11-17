import { getAuth } from "@/lib/auth";
export function GET(request: Request) {
  return getAuth().auth.handler(request);
}
export function POST(request: Request) {
  return getAuth().auth.handler(request);
}
