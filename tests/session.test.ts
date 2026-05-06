import { describe, expect, it, vi } from "vitest";

import type { AgentEvent } from "../server/ai-client.js";
import { chatStore } from "../server/chat-store.js";
import { Session, type AgentSessionLike } from "../server/session.js";

type FakeTurn = AgentEvent[] | Error;

class FakeAgentSession implements AgentSessionLike {
  public sentMessages: string[] = [];
  public maxActiveTurns = 0;
  private activeTurns = 0;

  constructor(private readonly turns: FakeTurn[] = []) {}

  async *sendMessage(content: string): AsyncIterable<AgentEvent> {
    this.sentMessages.push(content);
    this.activeTurns += 1;
    this.maxActiveTurns = Math.max(this.maxActiveTurns, this.activeTurns);

    try {
      const turn = this.turns.shift() ?? [];

      if (turn instanceof Error) {
        throw turn;
      }

      for (const message of turn) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        yield message;
      }
    } finally {
      this.activeTurns -= 1;
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

    await waitFor(() => {
      expect(agent.sentMessages).toEqual(["Hello"]);
    });
    expect(chatStore.getMessages(chat.id)).toMatchObject([
      { role: "user", content: "Hello" },
    ]);
    expect(sent).toContainEqual({
      type: "user_message",
      content: "Hello",
      chatId: chat.id,
    });
  });

  it("broadcasts assistant text messages", async () => {
    const chat = chatStore.createChat();
    const agent = new FakeAgentSession([
      [
        {
          type: "assistant_text",
          text: "Hi there",
        },
      ],
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

  it("broadcasts tool-use events", async () => {
    const chat = chatStore.createChat();
    const agent = new FakeAgentSession([
      [
        {
          type: "assistant_text",
          text: "I will inspect that.",
        },
        {
          type: "tool_use",
          toolId: "tool-1",
          toolName: "Read",
          toolInput: { file_path: "README.md" },
        },
      ],
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
      [
        {
          type: "result",
          success: true,
          cost: 0.01,
          duration: 1234,
        },
      ],
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
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const chat = chatStore.createChat();
    const agent = new FakeAgentSession([new Error("Agent failed")]);
    const session = new Session(chat.id, agent);
    const { client, sent } = createMockClient();

    try {
      session.subscribe(client);
      session.sendMessage("Hello");

      await waitFor(() => {
        expect(sent).toContainEqual({
          type: "error",
          error: "Agent failed",
          chatId: chat.id,
        });
      });
    } finally {
      consoleError.mockRestore();
    }
  });

  it("processes rapid user messages sequentially", async () => {
    const chat = chatStore.createChat();
    const agent = new FakeAgentSession([
      [
        { type: "assistant_text", text: "First response" },
        { type: "result", success: true },
      ],
      [
        { type: "assistant_text", text: "Second response" },
        { type: "result", success: true },
      ],
    ]);
    const session = new Session(chat.id, agent);
    const { client, sent } = createMockClient();

    session.subscribe(client);
    session.sendMessage("First");
    session.sendMessage("Second");

    await waitFor(() => {
      expect(sent).toContainEqual({
        type: "assistant_message",
        content: "Second response",
        chatId: chat.id,
      });
    });

    expect(agent.sentMessages).toEqual(["First", "Second"]);
    expect(agent.maxActiveTurns).toBe(1);

    const assistantMessages = sent.filter(
      (message) => message.type === "assistant_message"
    );
    expect(assistantMessages.map((message) => message.content)).toEqual([
      "First response",
      "Second response",
    ]);
  });

  it("continues processing later turns after a turn error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const chat = chatStore.createChat();
    const agent = new FakeAgentSession([
      new Error("First turn failed"),
      [
        { type: "assistant_text", text: "Recovered" },
        { type: "result", success: true },
      ],
    ]);
    const session = new Session(chat.id, agent);
    const { client, sent } = createMockClient();

    try {
      session.subscribe(client);
      session.sendMessage("First");
      session.sendMessage("Second");

      await waitFor(() => {
        expect(sent).toContainEqual({
          type: "error",
          error: "First turn failed",
          chatId: chat.id,
        });
        expect(sent).toContainEqual({
          type: "assistant_message",
          content: "Recovered",
          chatId: chat.id,
        });
      });

      expect(agent.sentMessages).toEqual(["First", "Second"]);
    } finally {
      consoleError.mockRestore();
    }
  });
});
