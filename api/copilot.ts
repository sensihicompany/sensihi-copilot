import type { VercelRequest, VercelResponse } from "@vercel/node"
import OpenAI from "openai"
import { runCopilotV2 } from "./_mcp/orchestrator.js"

/* ----------------------------------
   CORS
---------------------------------- */
const ALLOWED_ORIGINS = new Set([
  "https://sensihi.com",
  "https://www.sensihi.com",
])

function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin ?? ""
  const allowOrigin = ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://sensihi.com"

  res.setHeader("Access-Control-Allow-Origin", allowOrigin)
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  res.setHeader("Vary", "Origin")
}

/* ----------------------------------
   Handler
---------------------------------- */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  setCors(req, res)

  if (req.method === "OPTIONS") {
    return res.status(204).end()
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const { message, page, persona, sessionId } = req.body || {}

  if (!message || !sessionId) {
    return res.status(400).json({ error: "Invalid payload" })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error("Missing OPENAI_API_KEY")
    return res.status(500).json({ error: "Server misconfigured" })
  }

  const openai = new OpenAI({ apiKey })

  try {
    const result = await runCopilotV2({
      message,
      page,
      persona,
      sessionId,
      aiClient: openai,
    })

    return res.status(200).json(result)
  } catch (err) {
    console.error("COPILOT_ERROR", err)
    return res.status(500).json({
      message: "Copilot temporarily unavailable",
    })
  }
}
