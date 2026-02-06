import type { VercelRequest, VercelResponse } from "@vercel/node"
import { runCopilotV2 } from "./_mvp/orchestrator.js"

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  res.status(200).json({
    ok: true,
    orchestratorType: typeof runCopilotV2,
  })
}