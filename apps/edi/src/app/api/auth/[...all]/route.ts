import { getAuth } from "../../../../lib/auth";
export const GET = (request: Request) => getAuth().auth.handler(request);
export const POST = (request: Request) => getAuth().auth.handler(request);
