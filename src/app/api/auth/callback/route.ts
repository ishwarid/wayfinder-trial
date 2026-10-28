import { finishLogin } from "@/lib/auth";

export function GET(request: Request) {
  return finishLogin(request);
}
