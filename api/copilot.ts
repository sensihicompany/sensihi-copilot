import OpenAI from "openai"
import { runCopilotV2 } from "../mcp/orchestrator"

export const config = { runtime: "edge" }

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const ALLOWED_ORIGINS = new Set([
  "https://sensihi.com",
  "https://www.sensihi.com",
  "https://sensihi-copilot.vercel.app"
])

function corsHeadersFor(req: Request) {
  const origin = req.headers.get("origin") || ""
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://sensihi.com"

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  }
}

export default async function handler(req: Request) {
  // Handle browser preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeadersFor(req)
    })
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 })
  }

  const { message, page, persona, sessionId } = await req.json()

  if (!message || !sessionId) {
    return new Response("Invalid request", { status: 400 })
  }

  const result = await runCopilotV2({
    message,
    page,
    persona,
    sessionId,
    aiClient: openai
  })

  return new Response(JSON.stringify(result), {
    headers: {
      "Content-Type": "application/json",
      ...corsHeadersFor(req)
    }
  })
}
