import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ExplorerUIMessage } from "@/lib/agent/agent";
import { describeChatError } from "./chat/chat-error";
import { ChatPanel, SUGGESTIONS, type ChatPanelProps } from "./chat/chat-panel";
import { RepoInput } from "./repo-input";
import { TodoBoard } from "./todo-board";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const repo = { owner: "acme", repo: "shop", sha: "a".repeat(40) };

function renderPanel(props: Partial<ChatPanelProps> = {}) {
  const handlers = {
    onSend: vi.fn(),
    onStop: vi.fn(),
    onRetry: vi.fn(),
    onAudienceChange: vi.fn(),
  };
  render(
    <ChatPanel
      repo={repo}
      messages={[]}
      status="ready"
      error={null}
      demoNotice={null}
      signInUrl="/api/auth/login"
      audience="developer"
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

const user = (text: string) =>
  ({ id: `u-${text}`, role: "user", parts: [{ type: "text", text }] }) as ExplorerUIMessage;
const assistant = (parts: unknown[]) =>
  ({ id: "a1", role: "assistant", parts }) as ExplorerUIMessage;

const readPart = {
  type: "tool-readFile",
  toolCallId: "r1",
  state: "output-available",
  input: { path: "src/lib/discounts.ts" },
  output: { path: "src/lib/discounts.ts", startLine: 10, endLine: 40, totalLines: 50, content: "" },
};

describe("ChatPanel", () => {
  it("offers suggested questions", async () => {
    const { onSend } = renderPanel();
    await userEvent.click(screen.getByRole("button", { name: SUGGESTIONS.developer[2] }));
    expect(onSend).toHaveBeenCalledWith(SUGGESTIONS.developer[2]);
  });

  it("shows what the agent read, linking to the lines", () => {
    renderPanel({ messages: [user("discounts?"), assistant([readPart])] });
    expect(screen.getByRole("link", { name: "src/lib/discounts.ts:10-40" })).toHaveAttribute(
      "href",
      expect.stringContaining("/r/acme/shop/view?"),
    );
  });

  it("marks citations to lines the agent read as verified, and others as unverified", () => {
    renderPanel({
      messages: [
        user("discounts?"),
        assistant([
          readPart,
          {
            type: "text",
            text: "Rules are in `src/lib/discounts.ts:14-22`, shipping in `src/lib/shipping.ts:3`.",
          },
        ]),
      ],
    });
    const log = screen.getByRole("log");
    expect(
      within(log).getByRole("link", { name: "src/lib/discounts.ts:14-22, verified" }),
    ).toBeInTheDocument();
    expect(
      within(log).getByRole("link", { name: "src/lib/shipping.ts:3, not verified" }),
    ).toBeInTheDocument();
  });

  it("summarises searches", () => {
    renderPanel({
      messages: [
        user("discounts?"),
        assistant([
          {
            type: "tool-searchCode",
            toolCallId: "s1",
            state: "output-available",
            input: { text: "discount" },
            output: { totalMatches: 6, filesMatched: 3, truncated: false, matches: [] },
          },
        ]),
      ],
    });
    expect(screen.getByRole("log")).toHaveTextContent(
      /Searched for .?discount.?: 6 matches in 3 files/,
    );
  });

  it("lets the user stop a reply", async () => {
    const { onStop } = renderPanel({ messages: [user("hi")], status: "streaming" });
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(onStop).toHaveBeenCalled();
  });

  it("offers sign-in when the GitHub session expired", () => {
    renderPanel({
      messages: [user("hi")],
      error: describeChatError(
        Object.assign(new Error(""), {
          responseBody: JSON.stringify({
            error: "unauthorized",
            message: "Your GitHub session has expired.",
          }),
        }),
      ),
    });
    expect(screen.getByRole("link", { name: "Sign in again" })).toHaveAttribute(
      "href",
      "/api/auth/login",
    );
  });

  it("lets the user choose who answers are written for", async () => {
    const { onAudienceChange } = renderPanel();
    expect(screen.getByRole("radio", { name: "Developer" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await userEvent.click(screen.getByRole("radio", { name: "Product" }));
    expect(onAudienceChange).toHaveBeenCalledWith("product");
  });

  it("offers product-minded questions in product mode", () => {
    renderPanel({ audience: "product" });
    expect(screen.getByRole("button", { name: SUGGESTIONS.product[1] })).toBeInTheDocument();
  });

  it("collapses the agent's steps into one line in product mode", () => {
    renderPanel({
      audience: "product",
      messages: [
        user("How do discounts work?"),
        assistant([
          {
            type: "tool-searchCode",
            toolCallId: "s1",
            state: "output-available",
            input: { text: "discount" },
            output: { totalMatches: 6, filesMatched: 3, truncated: false, matches: [] },
          },
          readPart,
          { type: "text", text: "Discounts apply in this order." },
        ]),
      ],
    });
    const log = screen.getByRole("log");
    expect(log).toHaveTextContent("Checked the code: 1 search, 1 file read");
    // The individual steps are inside the collapsed details, not shown inline.
    expect(log.querySelector("details:not([open])")).toHaveTextContent("Searched for");
  });

  it("shows the demo notice", () => {
    renderPanel({ demoNotice: "Demo mode: replies are scripted." });
    expect(screen.getByText("Demo mode: replies are scripted.")).toBeInTheDocument();
  });
});

describe("TodoBoard", () => {
  it("groups items with the riskiest tags first and links each line", () => {
    render(
      <TodoBoard
        repo={repo}
        items={[
          { path: "src/server.ts", line: 13, tag: "TODO", text: "add rate limiting" },
          { path: "src/lib/discounts.ts", line: 33, tag: "FIXME", text: "rounding is wrong" },
        ]}
      />,
    );
    const headings = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(headings[0]).toMatch(/^FIXME/);
    expect(headings[1]).toMatch(/^TODO/);
    expect(screen.getByRole("link", { name: /discounts\.ts:33/ })).toHaveAttribute(
      "href",
      expect.stringContaining("from=33"),
    );
  });
});

describe("RepoInput", () => {
  it("navigates to the repository, keeping a branch from the URL", async () => {
    render(<RepoInput />);
    await userEvent.type(
      screen.getByLabelText("GitHub repository"),
      "https://github.com/acme/shop/tree/dev{Enter}",
    );
    expect(push).toHaveBeenCalledWith("/r/acme/shop?ref=dev");
  });

  it("explains the accepted formats", async () => {
    render(<RepoInput />);
    await userEvent.type(screen.getByLabelText("GitHub repository"), "not a repo{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("owner/repo");
  });
});
