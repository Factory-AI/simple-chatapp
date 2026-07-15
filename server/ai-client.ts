import {
  AutonomyLevel,
  type DaemonSession,
  type DroidMessage,
} from "@factory/droid-sdk";
import { getConnection } from "./daemon.js";

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
  private sessionPromise: Promise<DaemonSession>;

  constructor(resumeSessionId?: string) {
    this.sessionPromise = this.open(resumeSessionId);
  }

  private async open(resumeSessionId?: string): Promise<DaemonSession> {
    const connection = await getConnection();
    if (resumeSessionId) {
      return connection.resumeSession(resumeSessionId);
    }
    return connection.createSession({
      cwd: process.cwd(),
      modelId: DROID_MODEL_ID,
      enabledToolIds: [...DROID_ENABLED_TOOL_IDS],
      // Without an autonomy level (or a permissionHandler), tool calls raise a
      // confirmation the app never answers, and the turn stalls. High autonomy
      // lets the daemon auto-run tools per its policy.
      autonomyLevel: AutonomyLevel.High,
    });
  }

  async getSessionId(): Promise<string> {
    const session = await this.sessionPromise;
    return session.sessionId;
  }

  async *stream(content: string): AsyncIterable<DroidMessage> {
    const session = await this.sessionPromise;
    yield* session.stream(content);
  }

  async close() {
    const session = await this.sessionPromise;
    await session.close();
  }
}
