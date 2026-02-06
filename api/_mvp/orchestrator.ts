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
} from "./tools.js"
import { scoreLead } from "./leadScore.js"
import { trackEvent } from "./analytics.js"

/* ----------------------------------
   Types
---------------------------------- */

type AIClient = {
  chat: {
    completions: {
      create: (opts: {
        model: string
        messages: Array<{ role: "system" | "user"; content: string }>
      }) => Promise<{
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

function formatAnswer(text: string): string {
  if (!text) return ""

  return text
    .replace(/\n{3,}/g, "\n\n")
    .replace(/•\s?/g, "• ")
    .trim()
}

/* ----------------------------------
   Orchestrator (PRODUCTION)
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

  // Fallback to last context for follow-ups
  if (!context) {
    const last = getLastContext(sessionId)
    if (last) context = last
  }

  if (!context) {
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

  const references = extractReferences(docs)

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

Rules:
- Answer ONLY using the provided information.
- Do NOT invent facts or external knowledge.
- Write clearly in short paragraphs.
- Explain concepts in practical business language.
- Never mention sources or internal mechanics.
`,
        },
        ...memory.map((m) => ({
          role: "user" as const,
          content: m,
        })),
        {
          role: "user",
          content: message,
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

  answer = formatAnswer(answer)

  /* ------------------------------
     5. Memory update
  ------------------------------ */

  updateSessionMemory(sessionId, message)

  /* ------------------------------
     6. Lead scoring
  ------------------------------ */

  const lead = scoreLead({
    intent,
    messageCount: memory.length + 1,
    askedForDemo: message.toLowerCase().includes("demo"),
  })

  /* ------------------------------
     7. Analytics (non-blocking)
  ------------------------------ */

  trackEvent({
    type: "copilot_response",
    sessionId,
    intent,
    page,
    leadTier: lead.tier,
    references: references.length,
  })

  /* ------------------------------
     8. Final response
  ------------------------------ */

  return {
    message: answer,
    intent,
    references,
    lead,
    cta: recommendNextActions(intent),
  }
}
