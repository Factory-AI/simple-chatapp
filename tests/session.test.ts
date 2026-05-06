import { describe, expect, it } from "vitest";

import { chatStore } from "../server/chat-store.js";
import { Session, type AgentSessionLike } from "../server/session.js";

class FakeAgentSession implements AgentSessionLike {
  public sentMessages: string[] = [];

  constructor(
    private readonly outputMessages: any[] = [],
    private readonly error?: Error
  ) {}

  sendMessage(content: string): void {
    this.sentMessages.push(content);
  }

  async *getOutputStream(): AsyncIterable<any> {
    for (const message of this.outputMessages) {
      yield message;
    }

    if (this.error) {
      throw this.error;
    }
  }

  close(): void {}
}

function createMockClient() {
  const sent: any[] = [];
  const client = {
    OPEN: 1,
    readyState: 1,
    sessionId: undefined as string | undefined,
    send(data: string) {
      sent.push(JSON.parse(data));
    },
  };

  return { client: client as any, sent };
}

async function waitFor(assertion: () => void): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  throw lastError;
}

describe("Session", () => {
  it("stores and broadcasts user messages", async () => {
    const chat = chatStore.createChat();
    const agent = new FakeAgentSession();
    const session = new Session(chat.id, agent);
    const { client, sent } = createMockClient();

    session.subscribe(client);
    session.sendMessage("Hello");

    expect(agent.sentMessages).toEqual(["Hello"]);
    expect(chatStore.getMessages(chat.id)).toMatchObject([
      { role: "user", content: "Hello" },
    ]);
    expect(sent).toContainEqual({
      type: "user_message",
      content: "Hello",
      chatId: chat.id,
    });
  });

  it("broadcasts assistant text messages from Claude string content", async () => {
    const chat = chatStore.createChat();
    const agent = new FakeAgentSession([
      {
        type: "assistant",
        message: { content: "Hi there" },
      },
    ]);
    const session = new Session(chat.id, agent);
    const { client, sent } = createMockClient();

    session.subscribe(client);
    session.sendMessage("Hello");

    await waitFor(() => {
      expect(sent).toContainEqual({
        type: "assistant_message",
        content: "Hi there",
        chatId: chat.id,
      });
    });

    expect(chatStore.getMessages(chat.id)).toMatchObject([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ]);
  });

  it("broadcasts assistant text blocks and tool-use blocks", async () => {
    const chat = chatStore.createChat();
    const agent = new FakeAgentSession([
      {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "I will inspect that." },
            {
              type: "tool_use",
              id: "tool-1",
              name: "Read",
              input: { file_path: "README.md" },
            },
          ],
        },
      },
    ]);
    const session = new Session(chat.id, agent);
    const { client, sent } = createMockClient();

    session.subscribe(client);
    session.sendMessage("Read README");

    await waitFor(() => {
      expect(sent).toContainEqual({
        type: "assistant_message",
        content: "I will inspect that.",
        chatId: chat.id,
      });
      expect(sent).toContainEqual({
        type: "tool_use",
        toolName: "Read",
        toolId: "tool-1",
        toolInput: { file_path: "README.md" },
        chatId: chat.id,
      });
    });
  });

  it("broadcasts result metadata", async () => {
    const chat = chatStore.createChat();
    const agent = new FakeAgentSession([
      {
        type: "result",
        subtype: "success",
        total_cost_usd: 0.01,
        duration_ms: 1234,
      },
    ]);
    const session = new Session(chat.id, agent);
    const { client, sent } = createMockClient();

    session.subscribe(client);
    session.sendMessage("Hello");

    await waitFor(() => {
      expect(sent).toContainEqual({
        type: "result",
        success: true,
        chatId: chat.id,
        cost: 0.01,
        duration: 1234,
      });
    });
  });

  it("broadcasts stream errors", async () => {
    const chat = chatStore.createChat();
    const agent = new FakeAgentSession([], new Error("Agent failed"));
    const session = new Session(chat.id, agent);
    const { client, sent } = createMockClient();

    session.subscribe(client);
    session.sendMessage("Hello");

    await waitFor(() => {
      expect(sent).toContainEqual({
        type: "error",
        error: "Agent failed",
        chatId: chat.id,
      });
    });
  });
});
