import { vectorSearch } from "./vector.js"
import {
  getSessionMemory,
  updateSessionMemory,
  setLastContext,
  getLastContext,
} from "./memory.js"
import {
  detectUserIntent,
  recommendNextActions,
  summarizeForPersona,
} from "./tools.js"
import { scoreLead } from "./leadScore.js"
import { trackEvent } from "./analytics.js"

/* ----------------------------------
   Types
---------------------------------- */

type AIClient = {
  chat: {
    completions: {
      create: (opts: any) => Promise<{
        choices: Array<{ message: { content: string | null } }>
      }>
    }
  }
}

type Reference = {
  title: string
  url: string
}

/* ----------------------------------
   Constants
---------------------------------- */

const SITE_ORIGIN = "https://sensihi.com"

/* ----------------------------------
   Helpers
---------------------------------- */

function normalizeUrl(url?: string): string | null {
  if (!url) return null

  if (url.startsWith("http")) {
    return url.startsWith(SITE_ORIGIN) ? url : null
  }

  if (url.startsWith("/")) {
    return `${SITE_ORIGIN}${url}`
  }

  return null
}

function extractReferences(
  docs: Array<{ metadata?: any }>
): Reference[] {
  const seen = new Set<string>()
  const refs: Reference[] = []

  for (const d of docs) {
    const meta = d.metadata || {}
    const rawUrl = meta.url || meta.href
    const url = normalizeUrl(rawUrl)

    if (!url || seen.has(url)) continue

    seen.add(url)
    refs.push({
      title: meta.title || meta.heading || "Related Sensihi insight",
      url,
    })
  }

  return refs.slice(0, 5)
}

/* ----------------------------------
   Orchestrator
---------------------------------- */

export async function runCopilotV2({
  message,
  page,
  persona,
  sessionId,
  aiClient,
}: {
  message: string
  page?: string
  persona?: string
  sessionId: string
  aiClient: AIClient
}) {
  /* ------------------------------
     1. Intent + memory
  ------------------------------ */

  const { intent } = detectUserIntent(message)
  const memory = getSessionMemory(sessionId)

  /* ------------------------------
     2. Vector search
  ------------------------------ */

  let docs: Array<{ content?: string; metadata?: any }> = []

  try {
    docs = await vectorSearch(message)
  } catch (err) {
    console.error("VECTOR_SEARCH_FAILED", err)
  }

  /* ------------------------------
     3. Context resolution
  ------------------------------ */

  let context = docs
    .map((d) => d.content)
    .filter(Boolean)
    .join("\n\n")

  if (!context) {
    context = getLastContext(sessionId) || ""
  }

  if (!context) {
    updateSessionMemory(sessionId, message)

    return {
      message:
        "I don’t have relevant Sensihi information for that yet. Try asking about our solutions, insights, or working with Sensihi.",
      intent,
      references: [],
      lead: { score: 0, tier: "cold", signals: [] },
      cta: recommendNextActions(intent),
    }
  }

  setLastContext(sessionId, context)

  /* ------------------------------
     4. LLM completion
  ------------------------------ */

  let answer = ""

  try {
    const completion = await aiClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are Sensihi Copilot.
Answer using ONLY the provided information.
Be clear, practical, and business-focused.
`,
        },
        ...memory.map((m) => ({
          role: "user" as const,
          content: m,
        })),
        {
          role: "user",
          content: `Context:\n${context}\n\nQuestion:\n${message}`,
        },
      ],
    })

    answer = completion.choices?.[0]?.message?.content ?? ""
  } catch (err) {
    console.error("OPENAI_FAILED", err)

    return {
      message:
        "I’m temporarily unavailable. Please try again in a moment.",
      intent,
      references: [],
      lead: { score: 0, tier: "cold", signals: [] },
      cta: recommendNextActions(intent),
    }
  }

  if (persona) {
    answer = summarizeForPersona(answer, persona)
  }

  /* ------------------------------
     5. Memory + scoring
  ------------------------------ */

  updateSessionMemory(sessionId, message)

  const lead = scoreLead({
    intent,
    messageCount: memory.length + 1,
    askedForDemo: message.toLowerCase().includes("demo"),
  })

  trackEvent({
    type: "copilot_response",
    sessionId,
    intent,
    page,
    leadTier: lead.tier,
  })

  /* ------------------------------
     6. Final response
  ------------------------------ */

  return {
    message: answer,
    intent,
    references: extractReferences(docs),
    lead,
    cta: recommendNextActions(intent),
  }
}
