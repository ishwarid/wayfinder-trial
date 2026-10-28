import { chooseModel } from "@/lib/agent/model";
import { handleChat } from "@/lib/chat-handler";
import { dailyLimiter, globalLimiter } from "@/lib/limits";
import { openRepo } from "@/lib/repo/load";
import { sessionFromRequest } from "@/lib/session";

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = sessionFromRequest(request);
  return handleChat(request, {
    model: chooseModel().model,
    open: (ref, token) => openRepo(ref, token, { serverToken: process.env.GITHUB_TOKEN }),
    userToken: session?.token,
    dailyLimiter,
    globalLimiter,
  });
}
