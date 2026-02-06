import type { VercelRequest, VercelResponse } from "@vercel/node"
import OpenAI from "openai"
import { runCopilotV2 } from "./_mvp/orchestrator.js"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  try {
    const { message, page, persona, sessionId } = req.body ?? {}

    if (!message || !sessionId) {
      return res.status(400).json({
        error: "Missing required fields: message, sessionId",
      })
    }

    const result = await runCopilotV2({
      message,
      page,
      persona,
      sessionId,
      aiClient: openai,
    })

    res.status(200).json(result)
  } catch (err: any) {
    console.error("COPILOT_HANDLER_ERROR", err)
    res.status(500).json({
      error: "Copilot failed",
    })
  }
}
