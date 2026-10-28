import { logout } from "@/lib/auth";

// POST only: a GET sign-out link could be triggered by any page embedding it.
export function POST() {
  return logout();
}
