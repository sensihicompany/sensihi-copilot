import { vectorSearch } from "./vector"
import { getSessionMemory, updateSessionMemory } from "./memory"
import { detectUserIntent, recommendNextAction, summarizeForPersona } from "./tools"
import { scoreLead } from "./leadScore"
import { trackEvent } from "./analytics"

export async function runCopilotV2({
  message,
  page,
  persona,
  sessionId,
  aiClient
}: {
  message: string
  page?: string
  persona?: string
  sessionId: string
  aiClient: { chat: { completions: { create: (opts: unknown) => Promise<{ choices: Array<{ message: { content: string | null } }> }> } }
}) {
  const intent = detectUserIntent(message).intent
  const memory = getSessionMemory(sessionId)

  const docs = await vectorSearch(message)
  if (!docs.length) {
    return { message: "I don't have confirmed info on that yet.", confidence: "low" }
  }

  const context = (docs as Array<{ content?: string }>).map(d => d.content).join("\n")

  const completion = await aiClient.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "Answer only from provided context." },
      ...memory.map(m => ({ role: "user" as const, content: m })),
      { role: "user", content: `Context:\n${context}\n\nQ:${message}` }
    ]
  })

  let answer = completion.choices[0].message.content ?? ""
  if (persona) answer = summarizeForPersona(answer, persona)

  updateSessionMemory(sessionId, message)

  const lead = scoreLead({
    intent,
    messageCount: memory.length + 1,
    askedForDemo: message.toLowerCase().includes("demo")
  })

  await trackEvent({ sessionId, intent, lead })

  return {
    message: answer,
    intent,
    lead,
    cta: recommendNextAction(intent)
  }
}
