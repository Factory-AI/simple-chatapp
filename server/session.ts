import type { WSClient } from "./types.js";
import { AgentSession, type AgentEvent } from "./ai-client.js";
import { chatStore } from "./chat-store.js";

export interface AgentSessionLike {
  sendMessage(content: string): AsyncIterable<AgentEvent>;
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
      for await (const event of this.agentSession.sendMessage(content)) {
        this.handleAgentEvent(event);
      }
    } catch (error) {
      console.error(`Error in session ${this.chatId}:`, error);
      this.broadcastError((error as Error).message);
    }
  }

  private handleAgentEvent(event: AgentEvent) {
    if (event.type === "assistant_text") {
      chatStore.addMessage(this.chatId, {
        role: "assistant",
        content: event.text,
      });
      this.broadcast({
        type: "assistant_message",
        content: event.text,
        chatId: this.chatId,
      });
    } else if (event.type === "tool_use") {
      this.broadcast({
        type: "tool_use",
        toolName: event.toolName,
        toolId: event.toolId,
        toolInput: event.toolInput,
        chatId: this.chatId,
      });
    } else if (event.type === "result") {
      this.broadcast({
        type: "result",
        success: event.success,
        chatId: this.chatId,
        cost: event.cost,
        duration: event.duration,
      });
    }
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
