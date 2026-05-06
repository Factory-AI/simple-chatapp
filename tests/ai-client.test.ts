import { describe, expect, it } from "vitest";

import { convertClaudeMessageToAgentEvents } from "../server/ai-client.js";

describe("convertClaudeMessageToAgentEvents", () => {
  it("converts Claude assistant string content to assistant text", () => {
    expect(
      convertClaudeMessageToAgentEvents({
        type: "assistant",
        message: { content: "Hello" },
      })
    ).toEqual([{ type: "assistant_text", text: "Hello" }]);
  });

  it("converts Claude assistant text blocks to assistant text", () => {
    expect(
      convertClaudeMessageToAgentEvents({
        type: "assistant",
        message: {
          content: [{ type: "text", text: "Text block" }],
        },
      })
    ).toEqual([{ type: "assistant_text", text: "Text block" }]);
  });

  it("converts Claude tool-use blocks to tool-use events", () => {
    expect(
      convertClaudeMessageToAgentEvents({
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: "tool-1",
              name: "Read",
              input: { file_path: "README.md" },
            },
          ],
        },
      })
    ).toEqual([
      {
        type: "tool_use",
        toolId: "tool-1",
        toolName: "Read",
        toolInput: { file_path: "README.md" },
      },
    ]);
  });

  it("converts Claude success results to result events", () => {
    expect(
      convertClaudeMessageToAgentEvents({
        type: "result",
        subtype: "success",
        total_cost_usd: 0.02,
        duration_ms: 456,
      })
    ).toEqual([
      {
        type: "result",
        success: true,
        cost: 0.02,
        duration: 456,
      },
    ]);
  });

  it("converts Claude error results to unsuccessful result events", () => {
    expect(
      convertClaudeMessageToAgentEvents({
        type: "result",
        subtype: "error_max_turns",
        total_cost_usd: 0.03,
        duration_ms: 789,
      })
    ).toEqual([
      {
        type: "result",
        success: false,
        cost: 0.03,
        duration: 789,
      },
    ]);
  });
});
