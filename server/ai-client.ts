import {
  createSession,
  type DroidMessage,
  type DroidSession,
} from "@factory/droid-sdk";

export const DROID_MODEL_ID = "claude-opus-4-7";

export const DROID_ENABLED_TOOL_IDS = [
  "Execute",
  "Read",
  "Create",
  "Edit",
  "Glob",
  "Grep",
  "LS",
  "WebSearch",
] as const;

export class AgentSession {
  private sessionPromise: Promise<DroidSession> = createSession({
    apiKey: process.env.FACTORY_API_KEY!,
    cwd: process.cwd(),
    modelId: DROID_MODEL_ID,
    enabledToolIds: [...DROID_ENABLED_TOOL_IDS],
  });

  async *stream(content: string): AsyncIterable<DroidMessage> {
    const session = await this.sessionPromise;
    yield* session.stream(content);
  }

  async close() {
    const session = await this.sessionPromise;
    await session.close();
  }
}
