import OpenAI from "openai"
import { runCopilotV2 } from "../mcp/orchestrator"

export const config = {
  runtime: "edge"
}

/* ----------------------------------
   CORS (lock this down later)
---------------------------------- */
const ALLOWED_ORIGINS = [
  "https://sensihi.com",
  "https://www.sensihi.com"
]

function getCorsHeaders(origin: string | null) {
  const allowOrigin =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  }
}

/* ----------------------------------
   Optional: very light rate limiting
---------------------------------- */
const rateLimitMap = new Map<string, number[]>()

function isRateLimited(sessionId: string) {
  const now = Date.now()
  const WINDOW_MS = 60_000
  const MAX_REQ = 20

  const timestamps = rateLimitMap.get(sessionId) || []
  const recent = timestamps.filter(t => now - t < WINDOW_MS)

  if (recent.length >= MAX_REQ) return true

  recent.push(now)
  rateLimitMap.set(sessionId, recent)
  return false
}

/* ----------------------------------
   Handler
---------------------------------- */
export default async function handler(req: Request) {
  const origin = req.headers.get("origin")
  const corsHeaders = getCorsHeaders(origin)

  /* -------- CORS preflight -------- */
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    })
  }

  /* -------- Method guard -------- */
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: corsHeaders
    })
  }

  /* -------- Parse body safely -------- */
  let body: any
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: corsHeaders }
    )
  }

  const { message, page, persona, sessionId } = body || {}

  if (
    typeof message !== "string" ||
    !message.trim() ||
    typeof sessionId !== "string"
  ) {
    return new Response(
      JSON.stringify({ error: "Invalid request payload" }),
      { status: 400, headers: corsHeaders }
    )
  }

  /* -------- Rate limit (per session) -------- */
  if (isRateLimited(sessionId)) {
    return new Response(
      JSON.stringify({
        message: "You're sending messages a bit too fast. Please try again shortly."
      }),
      { status: 429, headers: corsHeaders }
    )
  }

  /* -------- OpenAI client -------- */
  const openaiApiKey = process.env.OPENAI_API_KEY
  if (!openaiApiKey) {
    console.error("OPENAI_API_KEY missing")
    return new Response(
      JSON.stringify({ message: "Server misconfiguration" }),
      { status: 500, headers: corsHeaders }
    )
  }

  const openai = new OpenAI({ apiKey: openaiApiKey })

  /* -------- Run Copilot -------- */
  try {
    const result = await runCopilotV2({
      message,
      page,
      persona,
      sessionId,
      aiClient: openai
    })

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    })
  } catch (err) {
    console.error("COPILOT_HANDLER_ERROR", err)

    return new Response(
      JSON.stringify({
        message: "Copilot is temporarily unavailable. Please try again shortly."
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      }
    )
  }
}
