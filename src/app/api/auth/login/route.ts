import { startLogin } from "@/lib/auth";

export function GET(request: Request) {
  return startLogin(request);
}
