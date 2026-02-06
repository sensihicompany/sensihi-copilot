import OpenAI from "openai"
import { runCopilotV2 } from "../mcp/orchestrator"

export const config = { runtime: "edge" }

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export default async function handler(req: Request) {
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
      "Access-Control-Allow-Origin": "https://sensihi.com"
    }
  })
}
