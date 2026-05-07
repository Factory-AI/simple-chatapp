import {
  createSession,
  type DroidSession,
} from "@factory/droid-sdk";

export const DROID_ENABLED_TOOL_IDS = [
  "Execute",
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "WebSearch",
] as const;

export type AgentEvent =
  | { type: "assistant_text"; text: string }
  | {
      type: "tool_use";
      toolName: string;
      toolId: string;
      toolInput: Record<string, unknown>;
    }
  | { type: "error"; error: string }
  | {
      type: "result";
      success: boolean;
      cost?: number;
      duration?: number;
      tokenUsage?: unknown;
    };

export async function* convertDroidStreamToAgentEvents(
  stream: AsyncIterable<any>
): AsyncIterable<AgentEvent> {
  let assistantText = "";
  let sawError = false;

  for await (const message of stream) {
    if (message.type === "assistant_text_delta") {
      assistantText += message.text;
    } else if (message.type === "tool_use") {
      yield {
        type: "tool_use",
        toolName: message.toolName,
        toolId: message.toolUseId,
        toolInput: message.toolInput,
      };
    } else if (message.type === "error") {
      sawError = true;
      yield { type: "error", error: message.message };
    } else if (message.type === "turn_complete") {
      if (assistantText) {
        yield { type: "assistant_text", text: assistantText };
      }

      yield {
        type: "result",
        success: !sawError,
        tokenUsage: message.tokenUsage,
      };
      return;
    }
  }
}

export class AgentSession {
  private sessionPromise: Promise<DroidSession> = createSession({
    cwd: process.cwd(),
    enabledToolIds: [...DROID_ENABLED_TOOL_IDS],
  });

  async *sendMessage(content: string): AsyncIterable<AgentEvent> {
    const session = await this.sessionPromise;
    yield* convertDroidStreamToAgentEvents(session.stream(content));
  }

  async close() {
    const session = await this.sessionPromise;
    await session.close();
  }
}
