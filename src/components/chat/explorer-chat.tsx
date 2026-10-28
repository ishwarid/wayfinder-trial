"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useMemo, useState } from "react";
import type { ExplorerUIMessage } from "@/lib/agent/agent";
import type { Audience } from "@/lib/constants";
import type { RepoLink } from "@/lib/links";
import { describeChatError } from "./chat-error";
import { ChatPanel } from "./chat-panel";

/** Connects the chat to /api/chat for one repository at one commit. */
export function ExplorerChat({
  repo,
  demoNotice,
  signInUrl,
}: {
  repo: RepoLink;
  demoNotice: string | null;
  signInUrl: string | null;
}) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport<ExplorerUIMessage>({
        api: "/api/chat",
        // The commit is pinned at page load and sent with every turn, so the
        // whole conversation is about the same code.
        body: { owner: repo.owner, repo: repo.repo, sha: repo.sha },
      }),
    [repo.owner, repo.repo, repo.sha],
  );

  const [audience, setAudience] = useState<Audience>("product");

  const chat = useChat<ExplorerUIMessage>({
    transport,
    id: `${repo.owner}/${repo.repo}@${repo.sha}`,
  });

  return (
    <ChatPanel
      repo={repo}
      messages={chat.messages}
      status={chat.status}
      error={chat.error ? describeChatError(chat.error) : null}
      demoNotice={demoNotice}
      signInUrl={signInUrl}
      audience={audience}
      onAudienceChange={setAudience}
      // Sent per request, so switching applies to the next question.
      onSend={(text) => chat.sendMessage({ text }, { body: { audience } })}
      onStop={() => chat.stop()}
      onRetry={() => {
        chat.clearError();
        chat.regenerate({ body: { audience } });
      }}
    />
  );
}
