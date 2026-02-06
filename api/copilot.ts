import type { VercelRequest, VercelResponse } from "@vercel/node"
import { runCopilotV2 } from "./_mvp/orchestrator.js"

/* ----------------------------------
   CORS Configuration
---------------------------------- */

const ALLOWED_ORIGINS = [
  "https://sensihi.com",
  "https://www.sensihi.com",
  "https://sensihi.framer.website",
]

function setCorsHeaders(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin || ""

  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin)
  }

  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  res.setHeader("Access-Control-Max-Age", "86400")
}

/* ----------------------------------
   API Handler
---------------------------------- */

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  setCorsHeaders(req, res)

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end()
  }

  // Allow POST only
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
    })
  }

  try {
    const { message, sessionId, page, persona } = req.body || {}

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Missing or invalid `message`",
      })
    }

    const result = await runCopilotV2({
      message,
      sessionId: sessionId || "anonymous",
      page,
      persona,
    })

    return res.status(200).json({
      ok: true,
      ...result,
    })
  } catch (err: any) {
    console.error("COPILOT_HANDLER_ERROR", err)

    return res.status(500).json({
      ok: false,
      error: "Internal server error",
    })
  }
}
