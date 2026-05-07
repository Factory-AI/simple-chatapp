import {
  createSession,
  type DroidMessage,
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

export class AgentSession {
  private sessionPromise: Promise<DroidSession> = createSession({
    cwd: process.cwd(),
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
