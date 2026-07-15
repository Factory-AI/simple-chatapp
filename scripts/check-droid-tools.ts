import { createSession } from "@factory/droid-sdk";

import { DROID_ENABLED_TOOL_IDS, DROID_MODEL_ID } from "../server/ai-client.js";

// This diagnostic deliberately uses exec mode (createSession), not the daemon
// transport the server now uses. Tool-catalog introspection relies on
// DroidSession.listTools(), which the daemon session does not expose in this
// SDK version. A diagnostic's transport need not match the server's.

type ToolInfo = {
  llmId: string;
  currentlyAllowed?: boolean;
};

type ToolInspectableSession = {
  listTools?: () => Promise<{ tools: ToolInfo[] }>;
  close: () => Promise<void>;
};

async function main() {
  const session = (await createSession({
    apiKey: process.env.FACTORY_API_KEY!,
    cwd: process.cwd(),
    modelId: DROID_MODEL_ID,
    enabledToolIds: [...DROID_ENABLED_TOOL_IDS],
  })) as ToolInspectableSession;

  try {
    if (typeof session.listTools !== "function") {
      console.log(
        "Droid session started with configured tool IDs, but this installed @factory/droid-sdk version does not expose listTools()."
      );
      console.log(`Configured: ${DROID_ENABLED_TOOL_IDS.join(", ")}`);
      return;
    }

    const catalog = await session.listTools();
    const toolsById = new Map(catalog.tools.map((tool) => [tool.llmId, tool]));
    const missing = DROID_ENABLED_TOOL_IDS.filter(
      (toolId) => !toolsById.has(toolId)
    );
    const disabled = DROID_ENABLED_TOOL_IDS.filter(
      (toolId) => toolsById.get(toolId)?.currentlyAllowed === false
    );

    console.log("Configured Droid tool IDs:");
    for (const toolId of DROID_ENABLED_TOOL_IDS) {
      const tool = toolsById.get(toolId);
      console.log(
        `- ${toolId}: ${tool ? `present, currentlyAllowed=${String(tool.currentlyAllowed)}` : "missing"}`
      );
    }

    if (missing.length > 0 || disabled.length > 0) {
      throw new Error(
        [
          missing.length > 0 ? `Missing: ${missing.join(", ")}` : null,
          disabled.length > 0 ? `Disabled: ${disabled.join(", ")}` : null,
        ]
          .filter(Boolean)
          .join("; ")
      );
    }
  } finally {
    await session.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
