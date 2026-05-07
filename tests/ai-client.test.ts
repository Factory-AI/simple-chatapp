import { describe, expect, it } from "vitest";

import {
  DROID_ENABLED_TOOL_IDS,
  convertDroidStreamToAgentEvents,
} from "../server/ai-client.js";

async function collectEvents(messages: any[]) {
  async function* stream() {
    for (const message of messages) {
      yield message;
    }
  }

  const events = [];
  for await (const event of convertDroidStreamToAgentEvents(stream())) {
    events.push(event);
  }
  return events;
}

describe("convertDroidStreamToAgentEvents", () => {
  it("uses Droid tool IDs for the migrated chat agent", () => {
    expect(DROID_ENABLED_TOOL_IDS).toEqual([
      "Execute",
      "Read",
      "Write",
      "Edit",
      "Glob",
      "Grep",
      "WebSearch",
    ]);
    expect(DROID_ENABLED_TOOL_IDS).not.toContain("Bash");
    expect(DROID_ENABLED_TOOL_IDS).not.toContain("WebFetch");
  });

  it("aggregates Droid assistant text deltas until turn completion", async () => {
    await expect(
      collectEvents([
        {
          type: "assistant_text_delta",
          text: "Hello",
        },
        {
          type: "assistant_text_delta",
          text: " world",
        },
        {
          type: "turn_complete",
          tokenUsage: null,
        },
      ])
    ).resolves.toEqual([
      { type: "assistant_text", text: "Hello world" },
      { type: "result", success: true, tokenUsage: null },
    ]);
  });

  it("converts Droid tool-use events", async () => {
    await expect(
      collectEvents([
        {
          type: "tool_use",
          toolUseId: "tool-1",
          toolName: "Read",
          toolInput: { file_path: "README.md" },
        },
        {
          type: "turn_complete",
          tokenUsage: null,
        },
      ])
    ).resolves.toEqual([
      {
        type: "tool_use",
        toolId: "tool-1",
        toolName: "Read",
        toolInput: { file_path: "README.md" },
      },
      { type: "result", success: true, tokenUsage: null },
    ]);
  });

  it("converts Droid errors and marks the result unsuccessful", async () => {
    await expect(
      collectEvents([
        {
          type: "error",
          message: "Something failed",
        },
        {
          type: "turn_complete",
          tokenUsage: {
            inputTokens: 1,
            outputTokens: 2,
            cacheCreationTokens: 3,
            cacheReadTokens: 4,
            thinkingTokens: 5,
          },
        },
      ])
    ).resolves.toEqual([
      { type: "error", error: "Something failed" },
      {
        type: "result",
        success: false,
        tokenUsage: {
          inputTokens: 1,
          outputTokens: 2,
          cacheCreationTokens: 3,
          cacheReadTokens: 4,
          thinkingTokens: 5,
        },
      },
    ]);
  });

  it("stops converting after turn completion", async () => {
    await expect(
      collectEvents([
        {
          type: "turn_complete",
          tokenUsage: null,
        },
        {
          type: "assistant_text_delta",
          text: "ignored",
        },
      ])
    ).resolves.toEqual([
      {
        type: "result",
        success: true,
        tokenUsage: null,
      },
    ]);
  });
});
