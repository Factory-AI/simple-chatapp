import type { DroidMessage } from "@factory/droid-sdk";
import type { WSClient } from "./types.js";
import { AgentSession } from "./ai-client.js";
import { chatStore } from "./chat-store.js";

export interface AgentSessionLike {
  stream(content: string): AsyncIterable<DroidMessage>;
  close(): void | Promise<void>;
}

// Session manages a single chat conversation with a long-lived agent
export class Session {
  public readonly chatId: string;
  private subscribers: Set<WSClient> = new Set();
  private agentSession: AgentSessionLike;
  private turnQueue: Promise<void> = Promise.resolve();

  constructor(chatId: string, agentSession: AgentSessionLike = new AgentSession()) {
    this.chatId = chatId;
    this.agentSession = agentSession;
  }

  // Send a user message to the agent
  sendMessage(content: string) {
    // Store user message
    chatStore.addMessage(this.chatId, {
      role: "user",
      content,
    });

    // Broadcast user message to subscribers
    this.broadcast({
      type: "user_message",
      content,
      chatId: this.chatId,
    });

    this.turnQueue = this.turnQueue
      .catch(() => undefined)
      .then(() => this.processUserTurn(content));
  }

  private async processUserTurn(content: string) {
    try {
      await this.streamDroidTurn(content);
    } catch (error) {
      console.error(`Error in session ${this.chatId}:`, error);
      this.broadcastError((error as Error).message);
    }
  }

  private async streamDroidTurn(content: string) {
    let assistantText = "";
    let sawError = false;

    for await (const message of this.agentSession.stream(content)) {
      if (message.type === "assistant_text_delta") {
        assistantText += message.text;
      } else if (message.type === "tool_use") {
        this.broadcast({
          type: "tool_use",
          toolName: message.toolName,
          toolId: message.toolUseId,
          toolInput: message.toolInput,
          chatId: this.chatId,
        });
      } else if (message.type === "error") {
        sawError = true;
        this.broadcastError(message.message);
      } else if (message.type === "turn_complete") {
        if (assistantText) {
          this.broadcastAssistantMessage(assistantText);
        }

        this.broadcast({
          type: "result",
          success: !sawError,
          chatId: this.chatId,
          tokenUsage: message.tokenUsage,
        });
        return;
      }
    }
  }

  private broadcastAssistantMessage(content: string) {
      chatStore.addMessage(this.chatId, {
        role: "assistant",
        content,
      });
      this.broadcast({
        type: "assistant_message",
        content,
        chatId: this.chatId,
      });
  }

  subscribe(client: WSClient) {
    this.subscribers.add(client);
    client.sessionId = this.chatId;
  }

  unsubscribe(client: WSClient) {
    this.subscribers.delete(client);
  }

  hasSubscribers(): boolean {
    return this.subscribers.size > 0;
  }

  private broadcast(message: any) {
    const messageStr = JSON.stringify(message);
    for (const client of this.subscribers) {
      try {
        if (client.readyState === client.OPEN) {
          client.send(messageStr);
        }
      } catch (error) {
        console.error("Error broadcasting to client:", error);
        this.subscribers.delete(client);
      }
    }
  }

  private broadcastError(error: string) {
    this.broadcast({
      type: "error",
      error,
      chatId: this.chatId,
    });
  }

  // Close the session
  close() {
    this.agentSession.close();
  }
}
