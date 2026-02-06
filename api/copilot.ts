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
  /* ----------------------------------
     Health check (GET)
  ---------------------------------- */
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      service: "sensihi-copilot",
      status: "alive",
    })
  }

  /* ----------------------------------
     Method guard
  ---------------------------------- */
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
    })
  }

  /* ----------------------------------
     Validate payload
  ---------------------------------- */
  const { message, sessionId, page, persona } = req.body ?? {}

  if (
    typeof message !== "string" ||
    message.trim().length === 0 ||
    typeof sessionId !== "string"
  ) {
    return res.status(400).json({
      ok: false,
      error: "Invalid request payload",
    })
  }

  /* ----------------------------------
     Run Copilot
  ---------------------------------- */
  try {
    const result = await runCopilotV2({
      message,
      sessionId,
      page,
      persona,
      aiClient: openai,
    })

    return res.status(200).json({
      ok: true,
      ...result,
    })
  } catch (err: any) {
    console.error("COPILOT_FATAL_ERROR", err)

    return res.status(500).json({
      ok: false,
      error: "Copilot execution failed",
    })
  }
}
