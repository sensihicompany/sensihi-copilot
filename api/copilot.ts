import type { VercelRequest, VercelResponse } from "@vercel/node"
import OpenAI from "openai"
import { runCopilotV2 } from "./_mvp/orchestrator.js"

/* ----------------------------------
   Handler
---------------------------------- */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const { message, page, persona, sessionId } = req.body || {}

  if (!message || !sessionId) {
    return res.status(400).json({
      error: "message and sessionId are required",
    })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return res.status(500).json({
      error: "Server misconfigured (missing OpenAI key)",
    })
  }

  try {
    const openai = new OpenAI({ apiKey })

    const result = await runCopilotV2({
      message,
      page,
      persona,
      sessionId,
      aiClient: openai,
    })

    res.status(200).json(result)
  } catch (err: any) {
    console.error("COPILOT_ERROR", err)
    res.status(500).json({
      error: "Copilot temporarily unavailable",
    })
  }
}
