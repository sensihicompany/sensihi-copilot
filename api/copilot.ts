import type { VercelRequest, VercelResponse } from "@vercel/node"
import OpenAI from "openai"
import { runCopilotV2 } from "./_mvp/orchestrator.js"

/* ----------------------------------
   CORS
---------------------------------- */

const ALLOWED_ORIGINS = new Set([
  "https://sensihi.com",
  "https://www.sensihi.com",
])

function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin)
  }

  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  res.setHeader("Access-Control-Max-Age", "86400")
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

  /* -------- Preflight -------- */
  if (req.method === "OPTIONS") {
    return res.status(200).end()
  }

  /* -------- Method guard -------- */
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
    console.error("OPENAI_API_KEY missing")
    return res.status(500).json({
      error: "Server misconfigured",
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

    return res.status(200).json(result)
  } catch (err: any) {
    console.error("COPILOT_RUNTIME_ERROR", err)
    return res.status(500).json({
      error: "Copilot temporarily unavailable",
    })
  }
}
