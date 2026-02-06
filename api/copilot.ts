import type { VercelRequest, VercelResponse } from "@vercel/node"
import { runCopilotV2 } from "./_mvp/orchestrator.js"

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  try {
    const result = await runCopilotV2()
    res.status(200).json(result)
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      error: err?.message ?? String(err),
    })
  }
}
