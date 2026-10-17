import { desktopRequest } from "../../../../features/desktop/handler";
export const POST = (request: Request) => desktopRequest(request, "license");
