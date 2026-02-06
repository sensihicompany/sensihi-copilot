import OpenAI from "openai"
import { runCopilotV2 } from "../mcp/orchestrator"

export const config = {
  runtime: "edge"
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://sensihi.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
}

export default async function handler(req: Request) {
  // ✅ CORS PREFLIGHT
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    })
  }

  // ❌ BLOCK EVERYTHING ELSE
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: corsHeaders
    })
  }

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })

    const { message, page, persona, sessionId } = await req.json()

    if (!message || !sessionId) {
      return new Response(
        JSON.stringify({ error: "Invalid request" }),
        { status: 400, headers: corsHeaders }
      )
    }

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
    console.error("COPILOT_ERROR", err)

    return new Response(
      JSON.stringify({ message: "Copilot temporarily unavailable" }),
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
