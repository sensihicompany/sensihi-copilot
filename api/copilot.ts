import OpenAI from "openai"
import { runCopilotV2 } from "../mcp/orchestrator"


/* ----------------------------------
   CORS configuration
---------------------------------- */
const ALLOWED_ORIGINS = [
  "https://sensihi.com",
  "https://www.sensihi.com"
]

function corsHeaders(origin: string | null) {
  const allowOrigin =
    origin && ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0]

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  }
}

/* ----------------------------------
   Very light in-memory rate limiting
   (per session, Edge-safe)
---------------------------------- */
const RATE_WINDOW_MS = 60_000
const MAX_REQUESTS = 20
const rateLimitStore = new Map<string, number[]>()

function isRateLimited(sessionId: string) {
  const now = Date.now()
  const timestamps = rateLimitStore.get(sessionId) || []

  const recent = timestamps.filter(t => now - t < RATE_WINDOW_MS)
  if (recent.length >= MAX_REQUESTS) {
    rateLimitStore.set(sessionId, recent)
    return true
  }

  recent.push(now)
  rateLimitStore.set(sessionId, recent)
  return false
}

/* ----------------------------------
   Request handler
---------------------------------- */
export default async function handler(req: Request) {
  const origin = req.headers.get("origin")
  const headers = corsHeaders(origin)

  /* -------- Preflight -------- */
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers
    })
  }

  /* -------- Method guard -------- */
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers
    })
  }

  /* -------- Parse JSON -------- */
  let payload: any
  try {
    payload = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers }
    )
  }

  const { message, page, persona, sessionId } = payload ?? {}

  if (
    typeof message !== "string" ||
    !message.trim() ||
    typeof sessionId !== "string"
  ) {
    return new Response(
      JSON.stringify({ error: "Invalid request payload" }),
      { status: 400, headers }
    )
  }

  /* -------- Rate limit -------- */
  if (isRateLimited(sessionId)) {
    return new Response(
      JSON.stringify({
        message:
          "You're sending messages too quickly. Please wait a moment and try again."
      }),
      { status: 429, headers }
    )
  }

  /* -------- OpenAI client -------- */
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error("OPENAI_API_KEY is missing")
    return new Response(
      JSON.stringify({ message: "Server configuration error" }),
      { status: 500, headers }
    )
  }

  const openai = new OpenAI({ apiKey })

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
        ...headers,
        "Content-Type": "application/json"
      }
    })
  } catch (err) {
    console.error("COPILOT_RUNTIME_ERROR", err)

    return new Response(
      JSON.stringify({
        message:
          "Copilot is temporarily unavailable. Please try again shortly."
      }),
      {
        status: 500,
        headers: {
          ...headers,
          "Content-Type": "application/json"
        }
      }
    )
  }
}
