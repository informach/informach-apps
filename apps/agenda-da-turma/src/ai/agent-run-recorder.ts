import "server-only";

import { createAgentRunRecorder, createDrizzleAgentRunStore } from "@informach/ai-core";
import { db } from "@informach/db";

export const agentRunRecorder = createAgentRunRecorder({
  store: createDrizzleAgentRunStore(db),
});
